// La matemática de la crianza de PokeMMO.
//
// Fuente: wiki/mecanicas/Crianza.md y wiki/mecanicas/IVs.md.
//
// El mecanismo, en una frase: tres IVs de la cría se heredan tal cual de los
// padres y tres salen del promedio de ambos redondeado hacia abajo; los objetos
// de crianza cambian ese reparto y, en el caso de los "Recios", lo fuerzan.
//
// De ahí sale la única regla que importa para planificar, y que no es evidente:
//
//   un IV sale 31 SEGURO si los DOS padres lo tienen a 31 (porque entonces el
//   alto, el bajo y el promedio valen 31 los tres), o si un padre lleva el
//   objeto Recio de ese IV y lo tiene a 31.
//
// Por eso una cadena avanza de dos en dos: cada cruce garantiza los 31 que los
// padres comparten, más como mucho dos forzados con objetos — uno por padre.

import { STATS, IV_MAX, TABLA_HERENCIA, TABLA_HERENCIA_SHINY } from './constantes.js';

/** @typedef {{[stat: string]: number}} Ivs */
/** @typedef {{fuerza: string, tipo: string}|null} ObjetoCrianza */

/** Objeto Recio que fuerza cada IV. */
export const RECIO_DE = {
  ps: 'Pesa Recia',
  ataque: 'Brazal Recio',
  defensa: 'Cinto Recio',
  'at-esp': 'Lente Recia',
  'def-esp': 'Banda Recia',
  velocidad: 'Franja Recia',
};

export const PIEDRAETERNA = 'Piedraeterna';

/** Qué IV fuerza un objeto, o null si no fuerza ninguno (Piedraeterna). */
export function statQueFuerza(nombreObjeto) {
  for (const [stat, obj] of Object.entries(RECIO_DE)) if (obj === nombreObjeto) return stat;
  return null;
}

export const ivsVacios = () => Object.fromEntries(STATS.map((s) => [s, 0]));

/** Los IVs que están a 31, como Set. */
export const perfectos = (ivs) => new Set(STATS.filter((s) => (ivs?.[s] ?? 0) >= IV_MAX));

/**
 * Qué IVs quedan garantizados a 31 en la cría.
 *
 * @param {Ivs} ivsA IVs del primer padre
 * @param {Ivs} ivsB IVs del segundo padre
 * @param {string|null} objetoA objeto que lleva el primer padre
 * @param {string|null} objetoB objeto que lleva el segundo padre
 * @returns {{garantizados: Set<string>, compartidos: Set<string>, forzados: Set<string>, desperdiciados: string[]}}
 */
export function ivsGarantizados(ivsA, ivsB, objetoA = null, objetoB = null) {
  const a = perfectos(ivsA);
  const b = perfectos(ivsB);

  // Compartidos: el promedio de 31 y 31 es 31, así que salen sí o sí.
  const compartidos = new Set([...a].filter((s) => b.has(s)));

  const forzados = new Set();
  const desperdiciados = [];
  for (const [objeto, ivsPadre, propios] of [[objetoA, ivsA, a], [objetoB, ivsB, b]]) {
    if (!objeto) continue;
    const stat = statQueFuerza(objeto);
    if (!stat) continue; // Piedraeterna: pasa naturaleza, no IV
    if (propios.has(stat)) {
      if (compartidos.has(stat)) desperdiciados.push(objeto); // ya salía solo
      else forzados.add(stat);
    } else {
      // Fuerza el IV del portador, que no es 31: el objeto se gasta para nada.
      desperdiciados.push(objeto);
    }
  }

  return {
    garantizados: new Set([...compartidos, ...forzados]),
    compartidos,
    forzados,
    desperdiciados,
  };
}

/** Naturaleza que pasa la cría, si algún padre lleva Piedraeterna. */
export function naturalezaGarantizada(padreA, padreB, objetoA, objetoB) {
  if (objetoA === PIEDRAETERNA) return padreA?.naturaleza ?? null;
  if (objetoB === PIEDRAETERNA) return padreB?.naturaleza ?? null;
  return null;
}

/** Cuántos objetos "cuentan" para la tabla de reparto (la Piedraeterna también ocupa hueco). */
export const objetosEnJuego = (objetoA, objetoB) => [objetoA, objetoB].filter(Boolean).length;

/**
 * Distribución de un IV concreto que no viene forzado por un objeto.
 * Devuelve el valor posible y su probabilidad.
 */
export function distribucionDe(stat, ivsA, ivsB, objetoA = null, objetoB = null) {
  const va = ivsA[stat] ?? 0;
  const vb = ivsB[stat] ?? 0;

  if (statQueFuerza(objetoA) === stat) return [{ valor: va, probabilidad: 1, via: 'forzado' }];
  if (statQueFuerza(objetoB) === stat) return [{ valor: vb, probabilidad: 1, via: 'forzado' }];

  const n = Math.min(2, objetosEnJuego(objetoA, objetoB));
  const t = TABLA_HERENCIA[n];
  const alto = Math.max(va, vb);
  const bajo = Math.min(va, vb);
  const promedio = Math.floor((va + vb) / 2);

  // Si coinciden, las tres ramas caen en el mismo número: se suman.
  const acumulado = new Map();
  const suma = (valor, p) => acumulado.set(valor, (acumulado.get(valor) ?? 0) + p);
  suma(alto, t.alto);
  suma(promedio, t.promedio);
  suma(bajo, t.bajo);

  return [...acumulado.entries()]
    .map(([valor, probabilidad]) => ({ valor, probabilidad, via: 'tabla' }))
    .sort((x, y) => y.valor - x.valor);
}

/** Probabilidad de que un IV salga >= umbral (31 por defecto). */
export function probabilidadDe(stat, ivsA, ivsB, objetoA = null, objetoB = null, umbral = IV_MAX) {
  return distribucionDe(stat, ivsA, ivsB, objetoA, objetoB)
    .filter((d) => d.valor >= umbral)
    .reduce((acc, d) => acc + d.probabilidad, 0);
}

/**
 * Probabilidad de que la cría salga con TODOS los IVs pedidos a 31.
 * Los IVs son independientes entre sí, así que es el producto.
 */
export function probabilidadDelCruce(statsPedidos, ivsA, ivsB, objetoA = null, objetoB = null) {
  const porStat = {};
  let total = 1;
  for (const stat of statsPedidos) {
    const p = probabilidadDe(stat, ivsA, ivsB, objetoA, objetoB);
    porStat[stat] = p;
    total *= p;
  }
  return { total, porStat, intentosEsperados: total > 0 ? 1 / total : Infinity };
}

/** Reparto cuando se cría shiny × shiny, tal cual lo da la wiki ("2 de 6"). */
export function tablaShiny(numObjetos) {
  const t = TABLA_HERENCIA_SHINY[Math.min(2, numObjetos)];
  return Object.fromEntries(
    Object.entries(t).map(([k, [n, m]]) => [k, { n, m, probabilidad: m ? n / m : 0 }]),
  );
}

/**
 * Cuántos 31 puede garantizar un cruce como máximo: los que compartan los padres
 * más uno por objeto Recio disponible. La Piedraeterna gasta uno de los dos huecos,
 * y por eso pedir naturaleza encarece la cadena un escalón entero.
 */
export const topeGarantizable = (compartidos, conNaturaleza) =>
  compartidos + (conNaturaleza ? 1 : 2);
