// Criar Alphas y variocolor.
//
// Las dos mecánicas tienen la misma forma y por eso viven juntas: cada una tiene
// una regla de crianza que se propaga al ÁRBOL ENTERO, no a un cruce suelto.
//
//   · shiny  — «un shiny no puede criar con uno que no lo sea», y shiny × shiny
//              da huevo shiny garantizado (wiki/mecanicas/Shiny y secret shiny.md);
//   · Alpha  — «para criar Alphas los dos padres tienen que ser Alpha», y un
//              Alpha con uno normal da una cría normal (wiki/mecanicas/Pokémon Alpha.md).
//
// De ahí sale, por inducción, lo único que la app necesita saber: si el objetivo
// es shiny (o Alpha), TODOS los nodos del árbol lo son, incluidas las hojas. Y
// una hoja es una captura. Ahí está el precio de verdad: un 4×31 shiny no son
// cuatro capturas afortunadas, son ocho variocolor.
//
// Este módulo no toca el DOM y no decide nada de interfaz: dice qué se puede
// criar, qué cuesta encontrarlo y qué es lo que NO está documentado.

import { SHINY, ALPHA, TABLA_HERENCIA, TABLA_HERENCIA_SHINY } from './constantes.js';
import { mismaLinea } from './compatibilidad.js';

/** Las dos variantes, en el orden en que se enseñan. */
export const VARIANTES = ['shiny', 'alpha'];

export const NOMBRE_VARIANTE = { shiny: 'variocolor', alpha: 'Alpha' };

/** Qué variantes pide un objetivo. */
export const variantesPedidas = (objetivo) => VARIANTES.filter((v) => objetivo?.[v]);

/** ¿Este ejemplar es lo que el objetivo pide? Un objetivo normal acepta todo. */
export function sirveLaVariante(ejemplar, objetivo) {
  for (const v of variantesPedidas(objetivo)) {
    if (!ejemplar?.[v])
      return { ok: false, falta: v, motivo: `este hueco tiene que ser ${NOMBRE_VARIANTE[v]} y no lo es` };
  }
  // Al revés también falla, y es el error caro: un shiny metido en una cadena
  // normal no da una cría normal, es que NO CRÍA. Mejor decirlo que dejar al
  // usuario descubrirlo en la guardería.
  if (!objetivo?.shiny && ejemplar?.shiny)
    return { ok: false, sobra: 'shiny', motivo: 'es variocolor y un variocolor no cría con uno que no lo es' };
  return { ok: true };
}

/**
 * ¿Pueden criar estos dos? Sólo mira la variante; la especie y el sexo son de
 * `compatibilidad.js`.
 */
export function puedenCriarPorVariante(a, b) {
  if (!!a?.shiny !== !!b?.shiny)
    return { ok: false, motivo: SHINY.reglas.conNoShiny };
  // Un Alpha con uno normal SÍ cría: lo que pasa es que la cría sale normal.
  if (!!a?.alpha !== !!b?.alpha)
    return { ok: true, criaAlpha: false, aviso: ALPHA.reglas.conNormal };
  return { ok: true, criaShiny: !!a?.shiny, criaAlpha: !!a?.alpha };
}

/**
 * La tabla de herencia que toca, por IV.
 *
 * La wiki da la de shiny contando IVs («2 de 6 coge el máximo») en vez de en
 * probabilidad por IV. Pasar de una a otra es directo —cuáles son esos 2 va al
 * azar, así que cada IV tiene 2/6— y el reparto «al 50/50» reparte mitad y
 * mitad entre el valor alto y el bajo, que es lo que quiere decir coger el de un
 * padre o el del otro. El resultado se marca `derivada` para que no se lea como
 * si la wiki lo publicara así.
 */
export function tablaDeHerencia(numObjetos, { shiny = false } = {}) {
  const n = Math.min(2, Math.max(0, numObjetos));
  if (!shiny) return { ...TABLA_HERENCIA[n], derivada: false };
  const t = TABLA_HERENCIA_SHINY[n];
  const p = ([a, m]) => (m ? a / m : 0);
  const mitad = p(t.mitad);
  return {
    alto: p(t.maximo) + mitad / 2,
    promedio: p(t.promedio),
    bajo: mitad / 2,
    derivada: true,
  };
}

/**
 * Cuántos encuentros salen de media por un variocolor.
 *
 * Se usa el MEJOR ritmo permanente (1/24.000, con estado donador y Amuleto
 * Iris): así la cifra es un suelo y nunca promete de menos. Sin nada, son
 * 1/30.000.
 */
export function encuentrosPorShiny({ donador = true, amuleto = true } = {}) {
  const p = donador && amuleto ? SHINY.probabilidad.donadorYAmuleto
    : donador ? SHINY.probabilidad.donador
    : SHINY.probabilidad.base;
  return Math.round(1 / p);
}

/**
 * ¿Sale esta línea evolutiva como Alpha, y por dónde?
 *
 * La lista nombra la línea por su forma final («Butterfree»), así que hay que
 * mirar la línea entera: un objetivo Caterpie es igual de posible que uno
 * Butterfree, porque el huevo sale de la base.
 *
 * Tres respuestas distintas, y la diferencia importa:
 *   · `enjambre`  — sale en los enjambres de todos los días;
 *   · `temporada` — sólo en su evento (Halloween, Navidad, Año Nuevo Lunar);
 *   · `limitado`  — se repartió una vez y no vuelve. Eso NO es una vía.
 */
export function saleComoAlpha(especie, datos) {
  const alphas = datos?.alphas;
  if (!alphas) return { sale: false, via: null, sinDatos: true };
  const linea = new Set(mismaLinea(especie, datos.pokedex ?? {}));
  linea.add(especie);
  const enLinea = (lista) => (lista ?? []).filter((x) => linea.has(x));

  const enjambre = enLinea(alphas.enjambres);
  if (enjambre.length) return { sale: true, via: 'enjambre', especies: enjambre };

  for (const [evento, lista] of Object.entries(alphas.temporada ?? {})) {
    const hay = enLinea(lista);
    if (hay.length) return { sale: true, via: 'temporada', evento, especies: hay };
  }

  const limitado = enLinea(alphas.limitados);
  if (limitado.length) return { sale: false, via: 'limitado', especies: limitado };

  return { sale: false, via: null };
}

/**
 * Lo que hay que decirle al usuario antes de que monte una cadena Alpha o shiny.
 *
 * No es decoración: son las dos cosas que cambian la decisión. Un objetivo shiny
 * multiplica CADA captura por 24.000, y un objetivo Alpha puede ser
 * directamente imposible porque su línea no sale en los enjambres.
 */
export function avisosDeVariante(objetivo, datos) {
  const problemas = [];
  const avisos = [];

  if (objetivo?.shiny) {
    avisos.push(
      'Variocolor: un variocolor sólo cría con otro variocolor, así que todo el árbol tiene que '
      + `serlo — incluidas las capturas, a ${encuentrosPorShiny().toLocaleString('es-ES')} encuentros `
      + 'cada una con estado donador y Amuleto Iris.',
    );
  }

  if (objetivo?.alpha) {
    const a = saleComoAlpha(objetivo.especie, datos);
    if (a.sinDatos) {
      avisos.push('Alpha: no tengo la lista de líneas que salen en los enjambres, así que no puedo comprobar si esta sale.');
    } else if (a.via === 'enjambre') {
      avisos.push(
        `Alpha: los dos padres de cada cruce tienen que ser Alpha. ${a.especies.join(', ')} `
        + `sale en los enjambres: ${ALPHA.enjambresPorDiaReal} al día real, de `
        + `${ALPHA.minutosPorEnjambre} minutos, y ${ALPHA.huecoUbicacion}.`,
      );
    } else if (a.via === 'temporada') {
      avisos.push(
        `Alpha: ${a.especies.join(', ')} sólo sale en el evento de ${a.evento}, no en los `
        + 'enjambres de todos los días. Fuera de ese evento no hay de dónde sacarlo.',
      );
    } else if (a.via === 'limitado') {
      problemas.push(
        `${a.especies.join(', ')} se repartió como Alpha una sola vez y no vuelve a lanzarse: `
        + 'no hay forma de conseguir dos padres Alpha de esta línea.',
      );
    } else {
      problemas.push(
        `${objetivo.especie} no está entre las líneas que salen como Alpha, así que no hay dos `
        + 'padres Alpha que cruzar.',
      );
    }
  }

  return { problemas, avisos };
}
