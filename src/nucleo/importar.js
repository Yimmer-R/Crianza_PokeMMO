// Importar Pokémon desde texto, CSV, JSON o lo que escupa el OCR de una captura.
//
// El objetivo es que el mismo parser sirva para las cuatro cosas, porque el OCR
// no produce un formato propio: produce las líneas de la ficha del juego, y ésas
// son justo el formato que se le pide a quien escriba a mano.
//
// Por eso el parser es TOLERANTE a propósito:
//
//   - el orden de las líneas da igual;
//   - los dos puntos son opcionales (el OCR los pierde);
//   - "Nv. 1 Chimchar ♀" y "Chimchar ♀ Nv.1" valen los dos;
//   - los nombres pasan por el resolutor, así que "Desenrollar" acaba en "Rodar"
//     y una errata de OCR se corrige sola;
//   - los movimientos aceptan el tipo delante, como los pinta el juego.
//
// Y nunca descarta en silencio: todo lo que no entiende sale en `avisos`, con la
// línea original, para que la interfaz lo enseñe antes de guardar.

import { STATS, IV_MAX, EV_MAX_POR_STAT, SEXOS } from './constantes.js';
import { crearResolutores, normalizar, resolverSexo } from './nombres.js';
import { ejemplarNuevo, normalizar as normalizarEjemplar } from './inventario.js';

/** Orden en que el juego muestra los seis números. */
export const ORDEN_STATS = STATS;

/** Etiquetas que se reconocen, con sus variantes y el inglés. */
const ETIQUETAS = {
  ivs: ['ivs', 'iv', 'ivs totales'],
  evs: ['evs', 'ev'],
  naturaleza: ['naturaleza', 'nature'],
  habilidad: ['habilidad', 'ability'],
  movimientos: ['movimientos', 'movimiento', 'moves', 'ataques'],
  objeto: ['objeto', 'item'],
  especie: ['especie', 'pokemon', 'species'],
  sexo: ['sexo', 'genero', 'gender', 'sex'],
  nivel: ['nivel', 'nv', 'level', 'lv'],
  mote: ['mote', 'apodo', 'nickname', 'nombre'],
  nota: ['nota', 'notas', 'comentario'],
  // Se reconocen para poder ignorarlas: la ficha del juego las trae y no aportan.
  ignorar: ['estadisticas', 'estadisticas totales', 'stats', 'marcas', 'marks', 'cinta', 'objeto equipado'],
};

/** Nombre de cada característica tal como puede venir escrita, para líneas suelta a suelta. */
const STAT_POR_ETIQUETA = {
  ps: 'ps', hp: 'ps', 'puntos de salud': 'ps',
  ataque: 'ataque', atk: 'ataque', at: 'ataque',
  defensa: 'defensa', def: 'defensa',
  'at esp': 'at-esp', 'ataque especial': 'at-esp', spa: 'at-esp', 'atesp': 'at-esp',
  'def esp': 'def-esp', 'defensa especial': 'def-esp', spd: 'def-esp', 'defesp': 'def-esp',
  velocidad: 'velocidad', spe: 'velocidad', vel: 'velocidad',
};

function queEtiqueta(clave) {
  const k = normalizar(clave);
  for (const [campo, variantes] of Object.entries(ETIQUETAS))
    if (variantes.includes(k)) return campo;
  if (STAT_POR_ETIQUETA[k]) return `stat:${STAT_POR_ETIQUETA[k]}`;
  return null;
}

/** Los seis números de una línea de IVs o EVs, en cualquier separador razonable. */
function seisNumeros(txt) {
  const nums = String(txt)
    // El OCR confunde O con 0 y l con 1 en cadenas de dígitos.
    .replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, '0')
    .match(/\d{1,3}/g);
  if (!nums || nums.length < 6) return null;
  return nums.slice(0, 6).map(Number);
}

export function detectarFormato(texto) {
  const t = String(texto ?? '').trim();
  if (!t) return 'vacio';
  if (t.startsWith('[') || t.startsWith('{')) return 'json';
  const primera = t.split('\n')[0];
  // CSV: la primera línea tiene varias comas Y alguna cabecera reconocible.
  if ((primera.match(/[,;]/g) ?? []).length >= 2 && /especie|pokemon|species/i.test(primera)) return 'csv';
  return 'texto';
}

// ------------------------------------------------------------------- texto

/**
 * Parte el texto en bloques, uno por Pokémon.
 *
 * Separadores: una línea en blanco, o una de guiones, o el comienzo de una ficha
 * nueva (una línea con nivel y especie, que es como empieza la del juego).
 */
export function partirEnBloques(texto) {
  const lineas = String(texto).replace(/\r/g, '').split('\n');
  const bloques = [];
  let actual = [];
  const cierra = () => { if (actual.some((l) => l.trim())) bloques.push(actual); actual = []; };

  // Una línea de "Nv. N Especie" arranca ficha nueva, pero SÓLO si el bloque en
  // curso ya tiene contenido de ficha. Si no, la ficha del juego se partiría en
  // dos por su propia línea de tipo ("fuego") antes del nombre.
  const yaEsFicha = (bloque) =>
    bloque.some((l) => /^(nv\.?|nivel|lv\.?|level)\s*\d+/i.test(l) || /^(ivs?|evs?)\b/i.test(l));

  for (const linea of lineas) {
    const t = linea.trim();
    if (!t || /^[-=_*]{3,}$/.test(t)) { cierra(); continue; }
    if (/^(nv\.?|nivel|lv\.?|level)\s*\d+/i.test(t) && yaEsFicha(actual)) cierra();
    actual.push(t);
  }
  cierra();
  return bloques;
}

function parsearBloque(lineas, ctx) {
  const { res, tipos } = ctx;
  const out = ejemplarNuevo();
  const avisos = [];
  const resoluciones = [];
  const movimientos = [];
  const sinEtiqueta = [];

  const anotaResolucion = (campo, r) => {
    if (r.via === 'exacto' || r.via === 'vacio') return;
    resoluciones.push({ campo, ...r });
  };

  for (const linea of lineas) {
    // Se acepta "clave: valor" y también "clave valor" sin dos puntos, que es lo
    // que deja el OCR cuando se come el símbolo.
    const conDosPuntos = linea.match(/^([^:]{2,30}):\s*(.*)$/);
    let campo = null;
    let valor = null;

    if (conDosPuntos) {
      campo = queEtiqueta(conDosPuntos[1]);
      valor = conDosPuntos[2].trim();
    }
    if (!campo) {
      const sinDosPuntos = linea.match(/^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ.\s]{2,24}?)\s+(.*)$/);
      if (sinDosPuntos) {
        const posible = queEtiqueta(sinDosPuntos[1]);
        // Sólo si la etiqueta encaja del todo: si no, la línea es otra cosa.
        if (posible) { campo = posible; valor = sinDosPuntos[2].trim(); }
      }
    }

    if (campo === 'ignorar') continue;

    if (campo === 'ivs' || campo === 'evs') {
      const nums = seisNumeros(valor);
      if (!nums) { avisos.push(`no he sabido leer los seis números de "${linea}"`); continue; }
      const tope = campo === 'ivs' ? IV_MAX : EV_MAX_POR_STAT;
      ORDEN_STATS.forEach((st, i) => { out[campo][st] = Math.max(0, Math.min(tope, nums[i])); });
      if (nums.some((x) => x > tope))
        avisos.push(`en "${linea}" hay valores por encima del tope (${tope}); los he recortado`);
      continue;
    }

    if (campo?.startsWith('stat:')) {
      const st = campo.slice(5);
      const n = Number((valor.match(/\d{1,3}/) ?? [NaN])[0]);
      if (Number.isFinite(n)) out.ivs[st] = Math.max(0, Math.min(IV_MAX, n));
      continue;
    }

    if (campo === 'naturaleza') {
      const r = res.naturaleza(valor);
      anotaResolucion('naturaleza', r);
      if (r.valor) out.naturaleza = r.valor;
      else avisos.push(`no reconozco la naturaleza "${valor}"${r.candidatos.length ? ` (¿${r.candidatos.join(' o ')}?)` : ''}`);
      continue;
    }

    if (campo === 'habilidad') {
      const r = res.habilidad(valor);
      anotaResolucion('habilidad', r);
      if (r.valor) out.habilidad = r.valor;
      else if (normalizar(valor) !== 'ninguno' && valor) avisos.push(`no reconozco la habilidad "${valor}"`);
      continue;
    }

    if (campo === 'movimientos') {
      for (const trozo of valor.split(/[,;/|]|\s{2,}/)) if (trozo.trim()) movimientos.push(trozo.trim());
      continue;
    }

    if (campo === 'objeto') {
      if (valor && normalizar(valor) !== 'ninguno') out.nota = `Objeto: ${valor}`;
      continue;
    }

    if (campo === 'especie') { sinEtiqueta.unshift(valor); continue; }
    if (campo === 'sexo') { const sx = resolverSexo(valor); if (sx) out.sexo = sx; continue; }
    if (campo === 'nivel') {
      const n = Number((valor.match(/\d{1,3}/) ?? [NaN])[0]);
      if (Number.isFinite(n)) out.nivel = n;
      // "Nv. 1 Chimchar ♀": detrás del número viene la especie.
      const resto = valor.replace(/^\s*\d{1,3}\s*/, '').trim();
      if (resto) sinEtiqueta.unshift(resto);
      continue;
    }
    if (campo === 'mote') { out.mote = valor; continue; }
    if (campo === 'nota') { out.nota = valor; continue; }

    sinEtiqueta.push(linea);
  }

  // ---- lo que no llevaba etiqueta: especie, sexo, tipos sueltos y movimientos
  const RE_NIVEL = /(?:^|\s)(?:nv\.?|nivel|lv\.?|level)\s*(\d{1,3})(?=\s|$)/i;

  for (const linea of sinEtiqueta) {
    // El nivel puede ir delante ("Nv. 1 Chimchar ♀", como lo pinta el juego) o
    // detrás ("Chimchar ♀ Nv. 1", como es más natural escribirlo). Se quita de
    // donde esté antes de intentar leer la especie.
    const conNivel = linea.match(RE_NIVEL);
    if (conNivel && out.nivel == null) out.nivel = Number(conNivel[1]);
    const limpia = linea.replace(RE_NIVEL, ' ').replace(/\s{2,}/g, ' ').trim();
    if (!limpia) continue;

    // Una línea que sólo es un tipo elemental es la etiqueta de tipo de la ficha.
    if (tipos.has(normalizar(limpia))) continue;

    // Sexo pegado al nombre: "Chimchar ♀"
    const sexoSuelto = limpia.match(/[♀♂]/);
    const sinSexo = limpia.replace(/[♀♂]/g, '').replace(/\s*\((m|f|macho|hembra)\)\s*/i, ' ').trim();
    if (sexoSuelto && !out._sexoPuesto) { out.sexo = resolverSexo(sexoSuelto[0]) ?? out.sexo; out._sexoPuesto = true; }

    // ¿Es la especie? Sólo se acepta la primera que resuelva.
    if (!out.especie) {
      const r = res.especie(sinSexo);
      if (r.valor) { out.especie = r.valor; anotaResolucion('especie', r); continue; }
    }

    // ¿Es un movimiento, con o sin el tipo delante? El juego lo pinta así.
    const palabras = sinSexo.split(' ');
    const sinTipo = tipos.has(normalizar(palabras[0])) ? palabras.slice(1).join(' ') : sinSexo;
    if (sinTipo) {
      const r = res.movimiento(sinTipo);
      if (r.valor) { movimientos.push(sinTipo); continue; }
    }

    if (sinSexo.length > 2) avisos.push(`no he sabido qué es "${linea}"`);
  }

  delete out._sexoPuesto;

  // ---- resolver los movimientos recogidos
  const resueltos = [];
  for (const bruto of movimientos) {
    const limpio = bruto.replace(/[♀♂]/g, '').trim();
    const palabras = limpio.split(' ');
    const sinTipo = tipos.has(normalizar(palabras[0])) ? palabras.slice(1).join(' ') : limpio;
    const r = res.movimiento(sinTipo);
    anotaResolucion('movimientos', r);
    if (r.valor) { if (!resueltos.includes(r.valor)) resueltos.push(r.valor); }
    else avisos.push(`no reconozco el movimiento "${bruto}"${r.candidatos.length ? ` (¿${r.candidatos.join(' o ')}?)` : ''}`);
  }
  if (resueltos.length > 4) {
    avisos.push(`he leído ${resueltos.length} movimientos y un Pokémon sólo lleva cuatro; me quedo con los primeros`);
  }
  out.movimientos = resueltos.slice(0, 4);

  if (!out.especie) avisos.push('no he encontrado la especie en este bloque');

  return { ejemplar: normalizarEjemplar(out), avisos, resoluciones };
}

// -------------------------------------------------------------- CSV y JSON

function parsearCsv(texto, ctx) {
  const lineas = String(texto).replace(/\r/g, '').split('\n').filter((l) => l.trim());
  const sep = (lineas[0].match(/;/g) ?? []).length > (lineas[0].match(/,/g) ?? []).length ? ';' : ',';
  const cabeceras = lineas[0].split(sep).map((c) => normalizar(c));
  const ejemplares = [];
  const avisos = [];
  const resoluciones = [];

  for (const linea of lineas.slice(1)) {
    const celdas = linea.split(sep).map((c) => c.trim());
    // Se reconstruye un bloque de texto y se reutiliza el mismo parser: así CSV y
    // texto no pueden divergir en cómo interpretan un valor.
    const comoTexto = cabeceras
      .map((h, i) => (celdas[i] ? `${h}: ${celdas[i]}` : null))
      .filter(Boolean)
      .join('\n');
    const r = parsearBloque(comoTexto.split('\n'), ctx);
    ejemplares.push(r.ejemplar);
    avisos.push(...r.avisos);
    resoluciones.push(...r.resoluciones);
  }
  return { ejemplares, avisos, resoluciones };
}

function parsearJson(texto) {
  const datos = JSON.parse(texto);
  const lista = Array.isArray(datos) ? datos : [datos];
  return {
    ejemplares: lista.map(normalizarEjemplar),
    avisos: [],
    resoluciones: [],
  };
}

// -------------------------------------------------------------- entrada única

/**
 * Importa de cualquiera de los formatos.
 *
 * @param {string} texto
 * @param {Object} datos los JSON cargados
 * @returns {{ejemplares: Object[], avisos: string[], resoluciones: Object[], formato: string}}
 */
export function importar(texto, datos) {
  const formato = detectarFormato(texto);
  if (formato === 'vacio') return { ejemplares: [], avisos: ['no has pegado nada'], resoluciones: [], formato };

  const ctx = {
    res: crearResolutores(datos),
    // Los 17 tipos elementales salen de los propios movimientos: el juego pinta
    // el tipo delante de cada movimiento y hay que poder descartarlo.
    tipos: new Set(
      Object.values(datos.movimientos).map((m) => normalizar(m.tipoElemental)).filter(Boolean),
    ),
  };

  try {
    if (formato === 'json') return { ...parsearJson(texto), formato };
    if (formato === 'csv') return { ...parsearCsv(texto, ctx), formato };
  } catch (e) {
    return { ejemplares: [], avisos: [`el ${formato} está mal formado: ${e.message}`], resoluciones: [], formato };
  }

  const bloques = partirEnBloques(texto);
  const ejemplares = [];
  const avisos = [];
  const resoluciones = [];
  for (const b of bloques) {
    const r = parsearBloque(b, ctx);
    ejemplares.push(r.ejemplar);
    avisos.push(...r.avisos);
    resoluciones.push(...r.resoluciones);
  }
  return { ejemplares, avisos, resoluciones, formato };
}

/** Plantilla de ejemplo, para enseñarla en la interfaz y poder copiarla. */
export const PLANTILLA = `Chimchar ♀ Nv. 1
IVs: 19/30/15/23/21/31
EVs: 0/0/0/0/0/0
Naturaleza: Agitada
Habilidad: Mar Llamas
Movimientos: Placaje, Maquinación, Tormento, Desenrollar

Rattata ♂ Nv. 5
IVs: 31/12/8/4/20/17
Naturaleza: Miedosa`;

// --------------------------------------------- de ejemplar a Pokémon objetivo

/**
 * Convierte un ejemplar leído (de una ficha, un texto o una imagen) en el
 * objetivo que quiere criar el usuario.
 *
 * Hay una decisión que conviene explicar porque no es obvia: de los IVs de la
 * ficha se toman **los que ya están a 31**, no los valores tal cual. Un objetivo
 * es «quiero estos IVs perfectos», así que importar una ficha con 19/30/15/23/21/31
 * pide un 1×31 en Velocidad. Con `todosLosIvs` se marcan los seis, que es lo que
 * se quiere cuando la ficha se usa como plantilla de un competitivo.
 *
 * @param {Object} ejemplar lo que devuelve importar()
 * @param {Object} datos los JSON
 * @param {{todosLosIvs?: boolean}} opciones
 */
export function aObjetivo(ejemplar, datos, { todosLosIvs = false } = {}) {
  const avisos = [];
  const p = datos.pokedex[ejemplar.especie];
  if (!p) return { objetivo: null, avisos: [`no conozco la especie "${ejemplar.especie}"`] };

  const ivs = {};
  for (const s of STATS) ivs[s] = todosLosIvs || (ejemplar.ivs?.[s] ?? 0) >= IV_MAX ? IV_MAX : 0;
  const marcados = STATS.filter((s) => ivs[s] === IV_MAX);
  if (!marcados.length && !todosLosIvs)
    avisos.push('la ficha no trae ningún IV a 31, así que el objetivo sale sin IVs perfectos; márcalos a mano o usa la casilla de los seis');

  // La habilidad sólo vale si la especie puede tenerla.
  let habilidad = null;
  if (ejemplar.habilidad) {
    const puede = (p.habilidades ?? []).some((h) => h.nombre === ejemplar.habilidad);
    if (puede) habilidad = ejemplar.habilidad;
    else avisos.push(`${ejemplar.especie} no puede tener ${ejemplar.habilidad}: lo dejo sin habilidad`);
  }

  // Los movimientos, sólo los que la especie aprende por alguna vía.
  const learnset = new Set([
    ...(p.movimientos?.nivel ?? []).map((m) => m.nombre),
    ...(p.movimientos?.mt ?? []), ...(p.movimientos?.tutor ?? []),
    ...(p.movimientos?.huevo ?? []), ...(p.movimientos?.huevoEspecial ?? []),
    ...(p.movimientos?.especial ?? []), ...(p.movimientos?.alEvolucionar ?? []),
    ...(p.movimientos?.dePreevolucion ?? []),
  ]);
  const movimientos = [];
  for (const m of ejemplar.movimientos ?? []) {
    if (learnset.has(m)) { if (movimientos.length < 4) movimientos.push(m); }
    else avisos.push(`${ejemplar.especie} no aprende ${m} según la wiki: lo dejo fuera`);
  }

  const evs = {};
  for (const s of STATS) evs[s] = Math.max(0, Math.min(EV_MAX_POR_STAT, ejemplar.evs?.[s] ?? 0));

  return {
    objetivo: {
      especie: ejemplar.especie,
      ivs,
      evs,
      naturaleza: ejemplar.naturaleza ?? null,
      habilidad,
      movimientos,
      sexo: null, // el sexo de la ficha es del ejemplar, no lo que se quiere criar
    },
    marcados,
    avisos,
  };
}
