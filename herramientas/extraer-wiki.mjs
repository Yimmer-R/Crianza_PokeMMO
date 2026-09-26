#!/usr/bin/env node
// Extrae los datos de crianza/entrenamiento desde la wiki de PokeMMO a datos/*.json.
//
// La wiki es la única fuente: este script no inventa nada. Si un dato no está en
// wiki/, no acaba en datos/ — acaba en el informe de huecos que imprime al final.
//
//   node herramientas/extraer-wiki.mjs [ruta-a-la-wiki]
//
// Por defecto busca ../PokeMMO (el repo hermano). Se puede fijar con WIKI_POKEMMO.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
// La wiki vive en el repo hermano. Desde el 24-09-2026 el bueno es
// `wiki-pokemmo`; `PokeMMO` es el anterior y se deja como respaldo para que una
// copia antigua del entorno siga funcionando.
const CANDIDATAS = [
  process.argv[2],
  process.env.WIKI_POKEMMO,
  join(RAIZ, '..', 'wiki-pokemmo'),
  join(RAIZ, '..', 'PokeMMO'),
].filter(Boolean);
const WIKI = CANDIDATAS.find((c) => existsSync(join(c, 'wiki', 'pokemon'))) ?? CANDIDATAS[0];

if (!existsSync(join(WIKI, 'wiki', 'pokemon'))) {
  console.error(`No encuentro la wiki en ${WIKI}.`);
  console.error('Clona Yimmer-R/Wiki-PokeMMO al lado de este repo, o pasa la ruta:');
  console.error('  node herramientas/extraer-wiki.mjs /ruta/a/Wiki-PokeMMO');
  process.exit(1);
}

// De dónde salió esto, para que `datos/meta.json` lo diga y no haya que
// adivinarlo. El remoto de git es el dato bueno; el nombre de la carpeta es el
// respaldo cuando la wiki no es un clon.
function origenDeLaWiki() {
  try {
    const url = execFileSync('git', ['-C', WIKI, 'config', '--get', 'remote.origin.url'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const m = url.match(/([^/:]+)\/([^/]+?)(?:\.git)?$/);
    if (m) return `${m[1]}/${m[2]}`;
  } catch { /* la wiki no es un clon de git: nos quedamos con la carpeta */ }
  return basename(WIKI);
}

const huecos = [];
const avisa = (msg) => { if (!huecos.includes(msg)) huecos.push(msg); };

// ---------------------------------------------------------------- utilidades

/** Frontmatter YAML plano: sólo los escalares, listas y el mapa `stats` que usa la wiki. */
function frontmatter(texto) {
  const m = texto.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  for (const linea of m[1].split('\n')) {
    const par = linea.match(/^([a-zA-Z0-9-]+):\s*(.*)$/);
    if (!par) continue;
    const [, clave, crudo] = par;
    out[clave] = valorYaml(crudo.trim());
  }
  return out;
}

function valorYaml(s) {
  if (s === '' ) return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s.startsWith('{') && s.endsWith('}')) {
    const obj = {};
    for (const trozo of s.slice(1, -1).split(',')) {
      const [k, v] = trozo.split(':').map((x) => x && x.trim());
      if (k) obj[k] = valorYaml(v ?? '');
    }
    return obj;
  }
  if (s.startsWith('[') && s.endsWith(']')) {
    return s.slice(1, -1).split(',').map((x) => valorYaml(x.trim())).filter((x) => x !== null && x !== '');
  }
  const sinComillas = s.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  if (/^-?\d+$/.test(sinComillas)) return Number(sinComillas);
  if (/^-?\d+\.\d+$/.test(sinComillas)) return Number(sinComillas);
  return sinComillas;
}

/** Devuelve el cuerpo de una sección por su encabezado exacto, hasta el siguiente de igual o menor nivel. */
function seccion(texto, encabezado) {
  const nivel = encabezado.match(/^#+/)[0].length;
  const i = texto.indexOf(`\n${encabezado}\n`);
  if (i === -1) return '';
  const desde = i + encabezado.length + 2;
  const resto = texto.slice(desde);
  const sig = resto.search(new RegExp(`\\n#{1,${nivel}} `));
  return sig === -1 ? resto : resto.slice(0, sig);
}

/** Filas de una tabla Markdown como arrays de celdas, sin cabecera ni separador. */
function filas(bloque) {
  return bloque
    .split('\n')
    .filter((l) => l.trim().startsWith('|') && !/^\|[\s|:-]+\|$/.test(l.trim()))
    .map((l) =>
      l.trim().replace(/^\|/, '').replace(/\|$/, '')
        // el `\|` de `[[Ruta 14 (2)\|Ruta 14]]` NO separa celda: si se parte por
        // ahí, toda la fila se desplaza una columna. Es la regla 2 de la wiki.
        .split(/(?<!\\)\|/)
        .map((c) => c.trim()))
    .slice(1); // fuera la cabecera
}

/**
 * Nombre visible de un [[wikilink]]. Ojo: en las tablas el pipe del alias va
 * escapado (`[[Tipo Bicho\|Bicho]]`) y hay que quedarse con la PRIMERA parte,
 * que es el nombre de archivo — es la regla 1 del CLAUDE.md de la wiki.
 */
function enlace(celda) {
  const m = celda.match(/\[\[([^\]]+)\]\]/);
  if (!m) return null;
  return m[1].split(/\\?\|/)[0].trim();
}

const enlacesDe = (bloque) =>
  [...bloque.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].split(/\\?\|/)[0].trim());

// ------------------------------------------------------------------ Pokémon

const STATS = ['ps', 'ataque', 'defensa', 'at-esp', 'def-esp', 'velocidad'];

/** "87,5 % ♂ / 12,5 % ♀" -> {macho: 87.5, hembra: 12.5} */
function ratioGenero(txt) {
  if (!txt) return { macho: 50, hembra: 50, desconocido: true };
  if (/sin género/i.test(txt)) return { macho: 0, hembra: 0, sinGenero: true };
  if (/solo ♀/i.test(txt)) return { macho: 0, hembra: 100 };
  if (/solo ♂/i.test(txt)) return { macho: 100, hembra: 0 };
  const m = txt.match(/([\d,.]+)\s*%\s*♂\s*\/\s*([\d,.]+)\s*%\s*♀/);
  if (!m) return { macho: 50, hembra: 50, desconocido: true };
  return { macho: Number(m[1].replace(',', '.')), hembra: Number(m[2].replace(',', '.')) };
}

function movimientosDe(texto, encabezado) {
  const bloque = seccion(texto, encabezado);
  if (!bloque) return [];
  return filas(bloque)
    .map((c) => enlace(c[0]) ?? enlace(c[1]))
    .filter(Boolean);
}

function porNivel(texto) {
  const bloque = seccion(texto, '### Por nivel');
  if (!bloque) return [];
  return filas(bloque)
    .map((c) => ({ nv: Number(c[0]) || 1, nombre: enlace(c[1]) }))
    .filter((m) => m.nombre);
}

function evolucion(texto) {
  const linea = seccion(texto, '## Línea evolutiva');
  const de = linea.match(/\*\*Viene de:\*\*\s*\[\[([^\]]+)\]\]/);
  const a = seccion(texto, '## Evolución')
    .split('\n')
    .filter((l) => l.trim().startsWith('- →'))
    .map((l) => ({ especie: enlace(l), condicion: l.replace(/^-\s*→\s*\[\[[^\]]+\]\]\s*/, '').trim() }))
    .filter((e) => e.especie);
  return { de: de ? de[1].split(/\\?\|/)[0].trim() : null, a };
}

function encuentros(texto) {
  const bloque = seccion(texto, '## Dónde encontrarlo');
  if (!bloque) return [];
  return filas(bloque)
    .filter((c) => c.length >= 5)
    .map((c) => ({ region: c[0], zona: c[1], metodo: c[2], nivel: c[3], rareza: c[4] }))
    .filter((e) => e.region && e.zona);
}

// ------------------------------------------------------------------- zonas
//
// Los encuentros NO se sacan de la ficha del Pokémon aunque tenga su tabla:
// ahí la zona viene con el nombre pelado («Monte Plateado») y se pierde el
// sufijo de hora y estación, que es justo lo que decide si el Pokémon está
// ahí cuando tú entras. La ficha de ZONA sí lo trae, y encima estructurado en
// el frontmatter (`horas:`, `estaciones:`), sin tener que adivinarlo del
// nombre del archivo — que viene medio traducido («nightspring»,
// «NochePrimavera», «mañana  invierno») y sería una fuente de errores.

const HORAS = ['mañana', 'día', 'noche'];
const ESTACIONES = ['primavera', 'verano', 'otoño', 'invierno'];

/** [todas] en la wiki significa «siempre»; aquí es la lista entera. */
function cuandoDe(fm) {
  const lista = (valor, todas) => {
    const v = [].concat(valor ?? []).map(String);
    if (!v.length || v.includes('todas')) return [...todas];
    const buenos = v.filter((x) => todas.includes(x));
    if (buenos.length !== v.length) avisa(`valor raro en una zona: ${v.join(', ')}`);
    return buenos.length ? buenos : [...todas];
  };
  return { horas: lista(fm.horas, HORAS), estaciones: lista(fm.estaciones, ESTACIONES) };
}

/**
 * «Ruta 39 (noche/verano)» -> «Ruta 39». El paréntesis ya está en `horas` y
 * `estaciones`, así que repetirlo en el nombre sólo estorba. Un sufijo que NO
 * sea de hora/estación —«Altering Cave (2)», tablas distintas del mismo
 * mapa— no lleva paréntesis en el `title`, así que esto no lo toca.
 */
const zonaSinSufijo = (titulo) => titulo.replace(/\s*\([^)]*\)\s*$/, '').trim();

/**
 * Junta filas que son la misma salvo por cuándo.
 *
 * Snorunt en Acuity Lakefront sale de noche y hay una ficha de zona por
 * estación, así que llegan cuatro filas idénticas con una estación cada una.
 * Son «de noche, todo el año», y en una tabla cuatro filas iguales sólo
 * estorban.
 *
 * La unión sólo es válida cuando una de las dos dimensiones coincide: si las
 * HORAS son las mismas se suman las estaciones, y al revés. Unir
 * {noche, primavera} con {día, verano} daría {noche, día} × {primavera,
 * verano}, que incluye un «día en primavera» que no existe.
 */
function juntarPorCuando(filasZona) {
  const salida = [];
  for (const f of filasZona) {
    const igual = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
    const ya = salida.find((o) =>
      o.region === f.region && o.zona === f.zona && o.metodo === f.metodo
      && o.nivel === f.nivel && o.rareza === f.rareza
      && (igual(o.horas, f.horas) || igual(o.estaciones, f.estaciones)));
    if (!ya) { salida.push({ ...f, horas: [...f.horas], estaciones: [...f.estaciones] }); continue; }
    const campo = igual(ya.horas, f.horas) ? 'estaciones' : 'horas';
    const orden = campo === 'horas' ? HORAS : ESTACIONES;
    ya[campo] = orden.filter((x) => ya[campo].includes(x) || f[campo].includes(x));
  }
  return salida;
}

/** Lee wiki/zonas/ y devuelve, por especie, dónde y CUÁNDO aparece. */
function leerZonas() {
  const dir = join(WIKI, 'wiki', 'zonas');
  if (!existsSync(dir)) {
    avisa('no hay wiki/zonas/: los encuentros se quedan sin hora ni estación');
    return { porEspecie: {}, zonas: 0 };
  }

  const porEspecie = {};
  let zonas = 0;

  for (const archivo of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const texto = readFileSync(join(dir, archivo), 'utf8');
    const fm = frontmatter(texto);
    if (fm.tipo !== 'zona') continue;
    zonas++;

    const zona = zonaSinSufijo(String(fm.title ?? basename(archivo, '.md')));
    const region = fm.region ?? '';
    const { horas, estaciones } = cuandoDe(fm);

    // Una sección por método de encuentro: "### Hierba", "### Cueva", "### Agua"…
    const bloque = seccion(texto, '## Encuentros');
    if (!bloque) continue;
    for (const [, metodo, tabla] of bloque.matchAll(/\n### ([^\n]+)\n([\s\S]*?)(?=\n### |$)/g)) {
      for (const c of filas(tabla)) {
        if (c.length < 3) continue;
        const especie = enlace(c[0]);
        if (!especie) continue;
        (porEspecie[especie] ??= []).push({
          region, zona, metodo: metodo.trim(),
          nivel: c[1], rareza: c[2],
          horas, estaciones,
        });
      }
    }
  }

  for (const [especie, lista] of Object.entries(porEspecie)) porEspecie[especie] = juntarPorCuando(lista);

  return { porEspecie, zonas };
}

function habilidadesDe(texto) {
  return seccion(texto, '## Habilidades')
    .split('\n')
    .filter((l) => l.trim().startsWith('- [['))
    .map((l) => ({ nombre: enlace(l), oculta: /\(oculta\)/i.test(l) }))
    .filter((h) => h.nombre);
}

const dirPokemon = join(WIKI, 'wiki', 'pokemon');
const pokemon = {};
const mapaEncuentros = {};

// Las zonas primero: son las que saben CUÁNDO aparece cada Pokémon.
const { porEspecie: encuentrosDeZonas, zonas: cuantasZonas } = leerZonas();
let deZonas = 0;
let deFicha = 0;

for (const archivo of readdirSync(dirPokemon).filter((f) => f.endsWith('.md'))) {
  const nombre = basename(archivo, '.md');
  if (nombre === 'README') continue;
  const texto = readFileSync(join(dirPokemon, archivo), 'utf8');
  const fm = frontmatter(texto);
  if (fm.tipo !== 'pokemon') continue;

  const stats = {};
  for (const s of STATS) stats[s] = Number(fm.stats?.[s] ?? 0);

  const ev = evolucion(texto);

  // Las fichas de zona mandan: traen hora y estación. La tabla de la ficha del
  // Pokémon es el respaldo para lo que no salga en ninguna zona, y entonces se
  // marca `cuandoDesconocido` en vez de dar por hecho que vale a cualquier hora.
  const deLaZona = encuentrosDeZonas[nombre];
  let enc;
  if (deLaZona?.length) { enc = deLaZona; deZonas++; } else {
    enc = encuentros(texto).map((e) => ({
      ...e, horas: [...HORAS], estaciones: [...ESTACIONES], cuandoDesconocido: true,
    }));
    if (enc.length) deFicha++;
  }
  if (enc.length) mapaEncuentros[nombre] = enc;

  pokemon[nombre] = {
    id: fm['id-pokemmo'] ?? null,
    dex: Number(String(fm['dex-nacional'] ?? '').replace('#', '')) || null,
    tipos: fm.tipos ?? [],
    forma: fm.forma ?? 'base',
    obtenible: fm.obtenible !== false,
    capturaBase: fm['captura-base'] ?? null,
    stats,
    evQueDa: fm.evs ?? null,
    gruposHuevo: fm['grupos-huevo'] ?? [],
    genero: ratioGenero(fm['ratio-genero']),
    crecimiento: fm.crecimiento ?? null,
    habilidades: habilidadesDe(texto),
    movimientos: {
      nivel: porNivel(texto),
      mt: movimientosDe(texto, '### MT/MO'),
      tutor: movimientosDe(texto, '### Tutor de movimientos'),
      huevo: movimientosDe(texto, '### Huevo'),
      huevoEspecial: movimientosDe(texto, '### Huevo especial'),
      especial: movimientosDe(texto, '### Movimiento especial'),
      alEvolucionar: movimientosDe(texto, '### Al evolucionar'),
      dePreevolucion: movimientosDe(texto, '### De preevolución'),
    },
    evoluciona: ev,
    tieneEncuentros: enc.length > 0,
  };
}

// Forma base de cada línea: subiendo por `evoluciona.de` hasta que no haya más.
// Es la que sale del huevo, así que es la que hay que criar.
for (const [nombre, p] of Object.entries(pokemon)) {
  let base = nombre;
  const vistos = new Set([nombre]);
  while (pokemon[base]?.evoluciona?.de && !vistos.has(pokemon[base].evoluciona.de)) {
    base = pokemon[base].evoluciona.de;
    vistos.add(base);
  }
  p.base = base;
}

if (!Object.keys(pokemon).length) {
  console.error('No he extraído ni un Pokémon. ¿Ha cambiado el formato de la wiki?');
  process.exit(1);
}

// -------------------------------------------------------------- naturalezas

const dirNat = join(WIKI, 'wiki', 'naturalezas');
const naturalezas = {};
for (const archivo of readdirSync(dirNat).filter((f) => f.endsWith('.md'))) {
  const nombre = basename(archivo, '.md');
  const fm = frontmatter(readFileSync(join(dirNat, archivo), 'utf8'));
  if (fm.tipo !== 'naturaleza') continue;
  naturalezas[nombre] = {
    sube: fm.sube || null,
    baja: fm.baja || null,
    ingles: Array.isArray(fm.aliases) ? fm.aliases[0] : fm.aliases || null,
    neutra: !fm.sube || fm.sube === fm.baja,
  };
}

// ----------------------------------------------------- movimientos (ficha)

const dirMov = join(WIKI, 'wiki', 'movimientos');
const movimientos = {};
for (const archivo of readdirSync(dirMov).filter((f) => f.endsWith('.md'))) {
  const nombre = basename(archivo, '.md');
  const texto = readFileSync(join(dirMov, archivo), 'utf8');
  const fm = frontmatter(texto);
  if (fm.tipo !== 'movimiento') continue;
  movimientos[nombre] = {
    tipoElemental: fm.tipo_elemental ?? fm['tipo-elemental'] ?? fm.elemento ?? null,
    clase: fm.clase ?? fm.categoria ?? null,
    poder: fm.poder ?? null,
    precision: fm.precision ?? fm['precisión'] ?? null,
    pp: fm.pp ?? null,
    ingles: Array.isArray(fm.aliases) ? fm.aliases[0] : fm.aliases || null,
  };
}

// ------------------------------------------------------------- habilidades

const dirHab = join(WIKI, 'wiki', 'habilidades');
const habilidades = {};
for (const archivo of readdirSync(dirHab).filter((f) => f.endsWith('.md'))) {
  const nombre = basename(archivo, '.md');
  const fm = frontmatter(readFileSync(join(dirHab, archivo), 'utf8'));
  if (fm.tipo !== 'habilidad') continue;
  habilidades[nombre] = {
    ingles: Array.isArray(fm.aliases) ? fm.aliases[0] : fm.aliases || null,
  };
}

// Quién tiene cada habilidad, y si la tiene como oculta. Lo que hace falta para
// saber si basta con criar o hay que gastar un Parche de Habilidad.
for (const [nombre, p] of Object.entries(pokemon)) {
  for (const h of p.habilidades) {
    const ficha = (habilidades[h.nombre] ??= { ingles: null });
    (ficha.normal ??= []);
    (ficha.oculta ??= []);
    (h.oculta ? ficha.oculta : ficha.normal).push(nombre);
  }
}

// -------------------------------------- movimientos huevo, cruzado al revés

// Para pasar un movimiento huevo hace falta un PADRE que lo sepa y que comparta
// grupo huevo con la madre. El dato bueno para eso no está en las fichas de
// Pokémon sino en las de movimiento, en "Como movimiento huevo", que ya trae la
// columna de grupos — lo dice el CLAUDE.md de la wiki. Así que de ahí se lee.
const movimientosHuevo = {};
for (const archivo of readdirSync(dirMov).filter((f) => f.endsWith('.md'))) {
  const nombre = basename(archivo, '.md');
  const texto = readFileSync(join(dirMov, archivo), 'utf8');
  const bloque = texto.match(/## Como movimiento huevo[^\n]*\n([\s\S]*?)(?=\n## |$)/);
  if (!bloque) continue;
  const especies = [];
  for (const c of filas(bloque[1])) {
    const especie = enlace(c[0]);
    if (!especie) continue;
    especies.push({
      especie,
      grupos: c[1] ? c[1].split(/[,/]/).map((g) => g.trim()).filter(Boolean) : (pokemon[especie]?.gruposHuevo ?? []),
    });
  }
  if (especies.length) movimientosHuevo[nombre] = especies;
}

// Un padre pasa el movimiento si lo sabe, da igual por qué vía. Así que aparte de
// las especies que lo traen de huevo interesan las que lo aprenden por nivel, MT
// o tutor: son padres válidos igual, y normalmente más fáciles de conseguir.
const VIAS_APRENDIZAJE = ['mt', 'tutor', 'especial', 'huevoEspecial', 'alEvolucionar', 'dePreevolucion'];
const loAprendeDeOtroModo = {};
for (const [nombre, p] of Object.entries(pokemon)) {
  const sabe = new Map();
  for (const m of p.movimientos.nivel) sabe.set(m.nombre, `nivel ${m.nv}`);
  for (const via of VIAS_APRENDIZAJE) {
    for (const m of p.movimientos[via] ?? []) if (!sabe.has(m)) sabe.set(m, via);
  }
  for (const [mov, via] of sabe) {
    if (!movimientosHuevo[mov]) continue;
    (loAprendeDeOtroModo[mov] ??= []).push({ especie: nombre, grupos: p.gruposHuevo, via });
  }
}

// ------------------------------------------------------------------ objetos

// Los objetos que importan para una cadena de crianza o para entrenar. El nombre
// es la clave, igual que en la wiki; el efecto mecánico lo fija este mapa porque
// la descripción del juego es prosa y no se puede parsear con garantías.
const OBJETOS_CRIANZA = {
  'Pesa Recia':    { fuerza: 'ps',        tipo: 'iv-forzado' },
  'Brazal Recio':  { fuerza: 'ataque',    tipo: 'iv-forzado' },
  'Cinto Recio':   { fuerza: 'defensa',   tipo: 'iv-forzado' },
  'Lente Recia':   { fuerza: 'at-esp',    tipo: 'iv-forzado' },
  'Banda Recia':   { fuerza: 'def-esp',   tipo: 'iv-forzado' },
  'Franja Recia':  { fuerza: 'velocidad', tipo: 'iv-forzado' },
  'BRAZAL - PS':          { fuerza: 'ps',        tipo: 'iv-dominante' },
  'BRAZAL - ATAQUE':      { fuerza: 'ataque',    tipo: 'iv-dominante' },
  'BRAZAL - DEFENSA':     { fuerza: 'defensa',   tipo: 'iv-dominante' },
  'BRAZAL - AT.ESP':      { fuerza: 'at-esp',    tipo: 'iv-dominante' },
  'BRAZAL - DEF.ESP':     { fuerza: 'def-esp',   tipo: 'iv-dominante' },
  'BRAZAL - VELOCIDAD':   { fuerza: 'velocidad', tipo: 'iv-dominante' },
  'Piedraeterna': { fuerza: 'naturaleza', tipo: 'naturaleza' },
};

const OBJETOS_ENTRENAMIENTO = {
  'Brazal Firme':            { efecto: 'x2 EVs, baja Velocidad mientras lo lleva' },
  'Vínculo de Entrenamiento':{ efecto: 'x2 EVs y cero EXP; gana EVs sin combatir' },
  'Repartir Exp':            { efecto: 'mismos EVs que el activo, y media EXP' },
  'Amuleto de Fuerza':       { efecto: 'sube todos los EVs del objetivo; se consume' },
};

const VITAMINAS = {
  'Más PS': 'ps', 'Proteína': 'ataque', 'Hierro': 'defensa',
  'Calcio': 'at-esp', 'Zinc': 'def-esp', 'Carburante': 'velocidad',
};

const BAYAS_EV = {
  'Baya Grana': 'ps', 'Baya Algama': 'ataque', 'Baya Ispero': 'defensa',
  'Baya Meluce': 'at-esp', 'Baya Uvav': 'def-esp', 'Baya Tamate': 'velocidad',
};

const OBJETOS_HABILIDAD = {
  'Píldora Habilidad': { efecto: 'cambia la habilidad; se consume' },
  'Parche de Habilidad': { efecto: 'desbloquea la habilidad oculta; se consume' },
};

/** Precios de compra que la propia wiki documenta en "De dónde sale". */
function preciosDe(nombreObjeto) {
  const ruta = join(WIKI, 'wiki', 'objetos', `${nombreObjeto}.md`);
  if (!existsSync(ruta)) {
    avisa(`la wiki no tiene ficha de objeto para "${nombreObjeto}"`);
    return { encontrado: false, compra: [] };
  }
  const texto = readFileSync(ruta, 'utf8');
  const compra = [];
  const bloque = texto.match(/### Se compra[^\n]*\n([\s\S]*?)(?=\n### |\n## |$)/);
  if (bloque) {
    for (const c of filas(bloque[1])) {
      if (c.length < 3) continue;
      compra.push({ region: c[0], sitio: c[1], precio: c[2] });
    }
  }
  const desc = seccion(texto, '## Descripción').trim().split('\n')[0] || null;
  return { encontrado: true, descripcion: desc, compra };
}

const objetos = { crianza: {}, entrenamiento: {}, vitaminas: {}, bayasEv: {}, habilidad: {} };

for (const [nombre, def] of Object.entries(OBJETOS_CRIANZA)) {
  objetos.crianza[nombre] = { ...def, ...preciosDe(nombre) };
}
for (const [nombre, def] of Object.entries(OBJETOS_ENTRENAMIENTO)) {
  objetos.entrenamiento[nombre] = { ...def, ...preciosDe(nombre) };
}
for (const [nombre, stat] of Object.entries(VITAMINAS)) {
  objetos.vitaminas[nombre] = { stat, evs: 10, ...preciosDe(nombre) };
}
for (const [nombre, stat] of Object.entries(BAYAS_EV)) {
  objetos.bayasEv[nombre] = { stat, evs: -10, ...preciosDe(nombre) };
}
for (const [nombre, def] of Object.entries(OBJETOS_HABILIDAD)) {
  objetos.habilidad[nombre] = { ...def, ...preciosDe(nombre) };
}

// ---------------------------------------------------------- dónde entrenar

// La página agrupa las hordas por el EV que dan, un `## <Característica>` por
// bloque. Hay que conservar de qué característica es cada tabla: sin eso la
// lista de 586 hordas no sirve para nada.
const ETIQUETA_A_STAT = {
  'PS': 'ps', 'Ataque': 'ataque', 'Defensa': 'defensa',
  'At. Esp.': 'at-esp', 'Def. Esp.': 'def-esp', 'Velocidad': 'velocidad',
};

/**
 * "día/mañana · primavera" -> {horas: ['día','mañana'], estaciones: ['primavera']}
 *
 * La tabla de EVs no trae el frontmatter de la zona, sólo esta frase, así que
 * aquí sí hay que leerla. "cualquiera" y "todo el año" son el caso abierto.
 */
function cuandoDeTexto(celda) {
  const txt = (celda ?? '').toLowerCase();
  if (!txt) return { horas: [...HORAS], estaciones: [...ESTACIONES], cuandoDesconocido: true };
  const horas = HORAS.filter((h) => txt.includes(h));
  const estaciones = ESTACIONES.filter((e) => txt.includes(e));
  return {
    horas: horas.length ? horas : [...HORAS],
    estaciones: estaciones.length ? estaciones : [...ESTACIONES],
  };
}

const rutaEntrenar = join(WIKI, 'wiki', 'mecanicas', 'Dónde entrenar EVs.md');
const dondeEntrenar = {};
if (existsSync(rutaEntrenar)) {
  const texto = readFileSync(rutaEntrenar, 'utf8');
  for (const [etiqueta, stat] of Object.entries(ETIQUETA_A_STAT)) {
    // el encabezado lleva el recuento detrás: "## Ataque (72 especies)"
    const re = new RegExp(`\\n## ${etiqueta.replace(/\./g, '\\.')} \\([^)]*\\)\\n([\\s\\S]*?)(?=\\n## |$)`);
    const m = texto.match(re);
    if (!m) { avisa(`la página de EVs no trae bloque de ${etiqueta}`); continue; }
    dondeEntrenar[stat] = filas(m[1])
      .filter((c) => c.length >= 5)
      .map((c) => ({
        ev: Number((c[0].match(/\d+/) ?? [0])[0]),
        especie: enlace(c[1]),
        region: c[2],
        zona: zonaSinSufijo(enlace(c[3]) ?? c[3]),
        nivel: c[4],
        // La sexta columna es «Cuándo»: "día/mañana · primavera". Sin ella la
        // app manda a entrenar a una zona donde esa horda no sale.
        ...cuandoDeTexto(c[5]),
      }))
      .filter((h) => h.especie);
  }
} else {
  avisa('no hay wiki/mecanicas/Dónde entrenar EVs.md: la app no puede sugerir sitios de EVs');
}

// ------------------------------------------------------------------ volcado

const regiones = [...new Set(Object.values(mapaEncuentros).flat().map((e) => e.region))].sort();

const meta = {
  generado: new Date().toISOString().slice(0, 10),
  wikiOrigen: origenDeLaWiki(),
  recuentos: {
    pokemon: Object.keys(pokemon).length,
    conEncuentros: Object.keys(mapaEncuentros).length,
    naturalezas: Object.keys(naturalezas).length,
    movimientos: Object.keys(movimientos).length,
    habilidades: Object.keys(habilidades).length,
    movimientosHuevo: Object.keys(movimientosHuevo).length,
  },
  regiones,
  gruposHuevo: [...new Set(Object.values(pokemon).flatMap((p) => p.gruposHuevo))].sort(),
  huecos,
};

const escribe = (nombre, datos) => {
  const ruta = join(RAIZ, 'datos', nombre);
  writeFileSync(ruta, JSON.stringify(datos, null, 0) + '\n');
  const kb = (readFileSync(ruta).length / 1024).toFixed(0);
  console.log(`  datos/${nombre}  ${kb} KB`);
};

console.log(`Leyendo la wiki desde ${WIKI}`);
escribe('pokemon.json', pokemon);
escribe('encuentros.json', mapaEncuentros);
escribe('naturalezas.json', naturalezas);
escribe('movimientos.json', movimientos);
escribe('habilidades.json', habilidades);
escribe('movimientos-huevo.json', { deHuevo: movimientosHuevo, otrosModos: loAprendeDeOtroModo });
escribe('objetos.json', objetos);
escribe('donde-entrenar.json', dondeEntrenar);
escribe('meta.json', meta);

console.log('\nRecuentos:', JSON.stringify(meta.recuentos));
console.log('Regiones:', regiones.join(', '));
if (huecos.length) {
  console.log('\nHuecos (la wiki no lo trae, así que la app tampoco):');
  for (const h of huecos) console.log(`  - ${h}`);
}
