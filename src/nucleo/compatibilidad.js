// Quién puede criar con quién, y de quién sale la especie de la cría.
//
// Fuente: wiki/mecanicas/Crianza.md — «Hacen falta dos Pokémon del mismo grupo
// huevo y de sexo opuesto. Ditto cría con cualquiera. La cría hereda la especie
// de la madre (o del progenitor que no sea Ditto)».
//
// Esa segunda frase es la que abre la puerta al truco que hace baratas las
// cadenas: el PADRE puede ser de cualquier especie que comparta grupo huevo, así
// que se elige la más fácil de capturar. Sólo la línea materna tiene que ser de
// la especie objetivo.

import { GRUPOS_ESTERILES, GRUPO_DITTO, GRUPO_SIN_GENERO, SEXOS } from './constantes.js';

export const DITTO = 'Ditto';

export const esDitto = (especie) => especie === DITTO;

export const esEsteril = (p) => !p || (p.gruposHuevo ?? []).some((g) => GRUPOS_ESTERILES.includes(g));

export const sinGenero = (p) =>
  !!p && (p.genero?.sinGenero === true || (p.gruposHuevo ?? []).includes(GRUPO_SIN_GENERO));

/** Sexos que puede tener una especie, según su ratio. */
export function sexosPosibles(p) {
  if (!p) return [];
  if (sinGenero(p)) return [SEXOS.SIN_GENERO];
  const out = [];
  if ((p.genero?.macho ?? 0) > 0) out.push(SEXOS.MACHO);
  if ((p.genero?.hembra ?? 0) > 0) out.push(SEXOS.HEMBRA);
  return out;
}

/** Grupos huevo en común entre dos especies. */
export const gruposEnComun = (a, b) =>
  (a?.gruposHuevo ?? []).filter((g) => (b?.gruposHuevo ?? []).includes(g) && g !== GRUPO_DITTO);

/**
 * ¿Pueden criar estos dos? Devuelve el motivo cuando no, porque en la práctica
 * el "no" es la respuesta útil: dice qué hay que cambiar.
 *
 * @param {{especie: string, sexo: string}} a
 * @param {{especie: string, sexo: string}} b
 * @param {Object} pokedex datos/pokemon.json
 */
export function puedenCriar(a, b, pokedex) {
  const pa = pokedex[a.especie];
  const pb = pokedex[b.especie];
  if (!pa) return { puede: false, motivo: `no conozco la especie "${a.especie}"` };
  if (!pb) return { puede: false, motivo: `no conozco la especie "${b.especie}"` };

  if (esEsteril(pa)) return { puede: false, motivo: `${a.especie} no cría` };
  if (esEsteril(pb)) return { puede: false, motivo: `${b.especie} no cría` };

  if (esDitto(a.especie) && esDitto(b.especie))
    return { puede: false, motivo: 'dos Ditto no crían entre sí' };

  // Ditto cría con cualquiera, y la especie sale del otro. Es la única forma de
  // criar una especie sin género, y de usar un macho como línea materna.
  if (esDitto(a.especie) || esDitto(b.especie)) {
    const otro = esDitto(a.especie) ? b : a;
    return { puede: true, especieCria: pokedex[otro.especie].base, via: 'ditto', madre: otro };
  }

  // Sin género: cría con su PROPIA LÍNEA EVOLUTIVA o con Ditto, y nada más.
  //
  // Esto es de PokeMMO y no de los juegos originales, donde un sin género sólo
  // cría con Ditto. La wiki lo dice en una línea: «Genderless Pokémon can only
  // breed with their evolution line Pokémon and Ditto»
  // (wiki/mecanicas/Crianza.md). La app lo tenía como los juegos originales y
  // por eso un objetivo sin género salía como captura imposible.
  if (sinGenero(pa) || sinGenero(pb)) {
    const losDos = sinGenero(pa) && sinGenero(pb);
    if (losDos && pa.base === pb.base)
      return {
        puede: true,
        especieCria: pa.base,
        via: 'misma-linea',
        // Sin sexos no hay madre ni padre: la cría sale de la especie, que es
        // la misma en los dos.
        madre: a,
        padre: b,
      };
    return {
      puede: false,
      motivo: `${sinGenero(pa) ? a.especie : b.especie} no tiene género: sólo cría con su misma `
        + 'línea evolutiva o con un Ditto',
    };
  }

  const comunes = gruposEnComun(pa, pb);
  if (!comunes.length)
    return {
      puede: false,
      motivo: `no comparten grupo huevo (${a.especie}: ${pa.gruposHuevo.join(', ')} · ${b.especie}: ${pb.gruposHuevo.join(', ')})`,
    };

  if (a.sexo === b.sexo)
    return { puede: false, motivo: `los dos son ${a.sexo}: hacen falta sexos opuestos` };

  const madre = a.sexo === SEXOS.HEMBRA ? a : b;
  const padre = madre === a ? b : a;
  return {
    puede: true,
    // La cría sale de la especie de la madre, y siempre en su forma base.
    especieCria: pokedex[madre.especie].base,
    gruposEnComun: comunes,
    via: 'grupo-huevo',
    madre,
    padre,
  };
}

/**
 * Especies que pueden hacer de PADRE de una madre dada: comparten grupo huevo y
 * pueden ser macho. Ordenadas por lo fácil que es conseguirlas, que lo decide
 * quien llama pasando `puntua`.
 */
export function padresCompatibles(especieMadre, pokedex, { puntua = null, incluirDitto = true } = {}) {
  const madre = pokedex[especieMadre];
  if (!madre || esEsteril(madre)) return [];

  const out = [];

  // Un sin género no mira grupos huevo: su lista es su propia línea evolutiva
  // más el Ditto, y ahí se acaba. Devolver la lista del grupo huevo dejaba al
  // planificador sin ninguna pareja válida.
  if (sinGenero(madre)) {
    for (const [nombre, p] of Object.entries(pokedex)) {
      if (esEsteril(p) || esDitto(nombre)) continue;
      if (p.base !== madre.base) continue;
      out.push({ especie: nombre, via: 'misma-linea', grupos: [] });
    }
    if (incluirDitto) out.push({ especie: DITTO, via: 'ditto', grupos: [] });
    if (puntua) out.sort((a, b) => puntua(b) - puntua(a));
    return out;
  }

  for (const [nombre, p] of Object.entries(pokedex)) {
    if (nombre === especieMadre) continue;
    if (esEsteril(p)) continue;
    if (esDitto(nombre)) {
      if (incluirDitto) out.push({ especie: nombre, via: 'ditto', grupos: [] });
      continue;
    }
    if (sinGenero(p)) continue;
    if ((p.genero?.macho ?? 0) <= 0) continue; // tiene que poder ser macho
    const comunes = gruposEnComun(madre, p);
    if (!comunes.length) continue;
    out.push({ especie: nombre, via: 'grupo-huevo', grupos: comunes });
  }

  if (puntua) out.sort((a, b) => puntua(b) - puntua(a));
  return out;
}

/**
 * ¿Sirve este Pokémon del inventario como línea materna de la especie objetivo?
 *
 * La especie la da la madre, así que sólo valen: una hembra de la especie
 * objetivo (o de su misma línea evolutiva), o un macho de esa especie si se le
 * pone un Ditto delante.
 */
export function sirveComoLineaMaterna(ejemplar, especieObjetivo, pokedex) {
  const p = pokedex[ejemplar.especie];
  const objetivo = pokedex[especieObjetivo];
  if (!p || !objetivo) return { sirve: false, motivo: 'especie desconocida' };
  if (p.base !== objetivo.base)
    return { sirve: false, motivo: `${ejemplar.especie} no es de la línea de ${especieObjetivo}` };
  if (ejemplar.sexo === SEXOS.HEMBRA) return { sirve: true, necesitaDitto: false };
  // Sin género no hay madre: la cría sale de la especie, y la pareja es su
  // misma línea o un Ditto. Cualquiera de los dos vale, así que no hace falta
  // Ditto de forma obligatoria.
  if (sinGenero(p)) return { sirve: true, necesitaDitto: false, sinGenero: true };
  return { sirve: true, necesitaDitto: true, motivo: 'es macho: hace falta un Ditto para que la cría sea de su especie' };
}

/** Precio de pagar por el sexo, según lo raro que sea ese sexo en la especie. */
export function costeElegirSexo(especie, sexoQuerido, pokedex, tabla) {
  const p = pokedex[especie];
  if (!p || sinGenero(p)) return null;
  const ratio = sexoQuerido === SEXOS.HEMBRA ? p.genero.hembra : p.genero.macho;
  // El tramo que aplica es el del ratio más bajo que siga siendo >= al del sexo pedido.
  const tramo = [...tabla]
    .sort((a, b) => b.ratioMinoritario - a.ratioMinoritario)
    .find((t) => ratio >= t.ratioMinoritario) ?? tabla[tabla.length - 1];
  return { ratio, precio: tramo.precio, confianza: tramo.confianza };
}

// ------------------------------------------------- la especie y su línea

/**
 * Todas las especies de una línea evolutiva: las que comparten forma base.
 *
 * Sirve para lo que más cuesta explicar de la crianza: la especie que sale del
 * huevo es la BASE de la madre, así que para la espina materna da exactamente
 * igual capturar un Staryu que un Starmie — los dos ponen un huevo de Staryu.
 * Lo que cambia es lo que cuesta encontrarlos.
 */
export const mismaLinea = (especie, pokedex) => {
  const base = pokedex[especie]?.base;
  if (!base) return [];
  return Object.keys(pokedex)
    .filter((n) => pokedex[n].base === base)
    .sort((a, b) => (pokedex[a].dex ?? 0) - (pokedex[b].dex ?? 0));
};

/**
 * Qué hacer con un Pokémon de la línea que no cría: evolucionarlo.
 *
 * Los 18 bebés (Pichu, Igglybuff, Riolu…) están en el grupo «No cría» y no
 * ponen huevos, pero su evolución sí. Se capturan igual de bien, así que no hay
 * que descartarlos: hay que decir que antes de criar hay que evolucionarlos.
 * Devuelve null cuando no hay salida, que es el caso de los legendarios.
 */
export function comoLlegaACriar(especie, pokedex) {
  const cola = [especie];
  const vistos = new Set(cola);
  while (cola.length) {
    const actual = cola.shift();
    for (const salto of pokedex[actual]?.evoluciona?.a ?? []) {
      if (vistos.has(salto.especie) || !pokedex[salto.especie]) continue;
      if (!esEsteril(pokedex[salto.especie]))
        return { especie: salto.especie, condicion: salto.condicion ?? null, desde: actual };
      vistos.add(salto.especie);
      cola.push(salto.especie);
    }
  }
  return null;
}

/**
 * Quién puede poner la especie objetivo en la cría, y con qué pareja.
 *
 * Tres casos, y los tres salen de la misma regla («la especie la pone la madre,
 * o el progenitor que no sea Ditto»):
 *
 *   - lo normal: cualquier HEMBRA de la línea evolutiva;
 *   - sin género: cualquiera de la línea, sin sexo que pedir, y la pareja es
 *     otro de su línea o un Ditto;
 *   - una línea sin ninguna hembra (Nidoran♂, Tauros, Rufflet, Throh, Sawk,
 *     Volbeat y la de Tyrogue): NO hay madre posible, así que la especie sólo
 *     pasa con un MACHO y un Ditto de pareja. Y como un Ditto no se puede
 *     criar, ese Ditto hay que capturarlo o comprarlo ya con los IVs.
 */
export function quienPoneLaEspecie(especieObjetivo, pokedex) {
  const p = pokedex[especieObjetivo];
  if (!p) return { linea: [], candidatas: [], sexo: null, conDitto: false, motivo: 'especie desconocida' };

  const linea = mismaLinea(especieObjetivo, pokedex);
  const ficha = (especie, sexo) => {
    const q = pokedex[especie];
    const cria = !esEsteril(q);
    return {
      especie,
      cria,
      // Un bebé no cría, pero se captura y se evoluciona: sigue valiendo.
      evolucionar: cria ? null : comoLlegaACriar(especie, pokedex),
      ratio: sexo === SEXOS.HEMBRA ? (q.genero?.hembra ?? 0)
        : sexo === SEXOS.MACHO ? (q.genero?.macho ?? 0)
        : 100,
    };
  };
  const utiles = (sexo) => linea.map((n) => ficha(n, sexo))
    .filter((c) => c.ratio > 0 && (c.cria || c.evolucionar));

  const nadieCria = `ningún Pokémon de la línea de ${especieObjetivo} puede criar`;

  if (sinGenero(p)) {
    const c = utiles(SEXOS.SIN_GENERO);
    return {
      linea, candidatas: c, sexo: SEXOS.SIN_GENERO, conDitto: false,
      motivo: c.length ? null : nadieCria,
    };
  }

  const hembras = utiles(SEXOS.HEMBRA);
  if (hembras.length)
    return { linea, candidatas: hembras, sexo: SEXOS.HEMBRA, conDitto: false, motivo: null };

  const machos = utiles(SEXOS.MACHO);
  return {
    linea,
    candidatas: machos,
    sexo: machos.length ? SEXOS.MACHO : null,
    conDitto: machos.length > 0,
    motivo: machos.length
      ? `en la línea de ${especieObjetivo} no hay hembras: la especie sólo pasa criando un macho `
        + 'con un Ditto, y como los Ditto no se crían, cada Ditto hay que capturarlo o comprarlo '
        + 'ya con los IVs que pida el cruce'
      : nadieCria,
  };
}

// --------------------------------------------- pasar un movimiento huevo

/** Orden de comodidad de las vías: primero lo que no obliga a criar nada. */
const PRIORIDAD = { nivel: 1, mt: 2, tutor: 3, especial: 4, evolucion: 5, preevolucion: 6, huevo: 7 };
/**
 * Padres que pueden pasar un movimiento huevo a una madre dada.
 *
 * Se ordenan poniendo delante los que lo aprenden por nivel, MT o tutor: ésos se
 * consiguen sin criar nada, mientras que un padre que también lo tenga sólo de
 * huevo abre una segunda cadena.
 */
export function padresQuePasan(movimiento, especieMadre, datos, regionesDisponibles = []) {
  const { pokedex, movimientosHuevo, encuentros } = datos;
  const madre = pokedex[especieMadre];
  if (!madre) return [];

  const regiones = new Set(regionesDisponibles);
  const candidatos = new Map();

  const añade = (especie, comoLoSabe) => {
    const p = pokedex[especie];
    if (!p || esEsteril(p) || sinGenero(p)) return;
    if ((p.genero?.macho ?? 0) <= 0) return;      // el que pasa el movimiento es el padre
    const comunes = gruposEnComun(madre, p);
    if (!comunes.length) return;                  // sin grupo en común no hay nada que hacer
    const zonas = (encuentros[especie] ?? []).filter((e) => regiones.has(e.region));
    const ya = candidatos.get(especie);
    const entrada = {
      especie, gruposEnComun: comunes, comoLoSabe,
      capturable: zonas.length > 0,
      zonas: zonas.slice(0, 4),
      soloEnOtraRegion: zonas.length === 0 && (encuentros[especie] ?? []).length > 0,
      ratioMacho: p.genero?.macho ?? 0,
    };
    if (!ya || (PRIORIDAD[comoLoSabe.via] ?? 9) < (PRIORIDAD[ya.comoLoSabe.via] ?? 9))
      candidatos.set(especie, entrada);
  };

  // Los que lo aprenden sin criar: la opción buena.
  for (const c of movimientosHuevo.otrosModos?.[movimiento] ?? []) {
    const via = c.via === 'mt' ? 'mt' : c.via?.startsWith?.('nivel') ? 'nivel' : c.via;
    añade(c.especie, { via: via ?? 'otra', detalle: c.via });
  }
  // Los que sólo lo traen de huevo: valen, pero hay que criarlos aparte.
  for (const c of movimientosHuevo.deHuevo?.[movimiento] ?? []) {
    añade(c.especie, { via: 'huevo', detalle: 'sólo de huevo' });
  }

  return [...candidatos.values()].sort((a, b) => {
    const pa = PRIORIDAD[a.comoLoSabe.via] ?? 9;
    const pb = PRIORIDAD[b.comoLoSabe.via] ?? 9;
    if (pa !== pb) return pa - pb;
    if (a.capturable !== b.capturable) return a.capturable ? -1 : 1;
    return b.ratioMacho - a.ratioMacho;
  });
}


/**
 * Padres que pueden pasar TODOS estos movimientos huevo a la vez.
 *
 * No es la unión, es la intersección: un huevo tiene un solo padre, así que si
 * se piden dos movimientos huevo el mismo Pokémon tiene que saber los dos. De
 * cada especie se queda la vía más incómoda de las que necesita, que es la que
 * marca lo que cuesta de verdad.
 */
export function padresQuePasanTodos(movimientos, especieMadre, datos, regionesDisponibles = []) {
  if (!movimientos?.length) return [];
  const listas = movimientos.map((m) => padresQuePasan(m, especieMadre, datos, regionesDisponibles));
  const [primera, ...resto] = listas;
  return primera
    .filter((c) => resto.every((otra) => otra.some((x) => x.especie === c.especie)))
    .map((c) => {
      const suyas = listas.map((l) => l.find((x) => x.especie === c.especie).comoLoSabe);
      const peor = suyas.reduce((a, b) => ((PRIORIDAD[b.via] ?? 9) > (PRIORIDAD[a.via] ?? 9) ? b : a));
      return { ...c, comoLoSabe: peor, comoSabeCada: movimientos.map((m, i) => ({ movimiento: m, ...suyas[i] })) };
    });
}
