// Cómo llega cada movimiento al Pokémon objetivo.
//
// Cuatro respuestas posibles, de la más barata a la más cara:
//
//   1. lo aprende por nivel        -> gratis, sólo subir
//   2. lo aprende por MT/MO        -> comprar o encontrar la MT
//   3. lo da el tutor              -> pagar al tutor
//   4. es movimiento huevo         -> hace falta un PADRE que lo sepa y que
//                                     comparta grupo huevo con la madre
//
// El caso 4 es el que obliga a tocar el plan de crianza, porque el padre del
// cruce final deja de ser "cualquiera del grupo huevo" y pasa a ser "uno que
// sepa este movimiento". Y como los padres se consumen, cada movimiento huevo
// que haya que arrastrar cuesta un padre más.
//
// Fuente del cruce inverso: wiki/movimientos/*.md, sección "Como movimiento
// huevo", que ya trae la columna de grupos huevo.

import { viasEnLaLinea } from './planificador.js';
import { padresQuePasan } from './compatibilidad.js';

// Se re-exporta desde aquí porque es donde se buscaba antes: la función vive en
// compatibilidad.js para que el planificador la pueda usar sin un ciclo.
export { padresQuePasan };

const PRIORIDAD = { nivel: 1, mt: 2, tutor: 3, especial: 4, evolucion: 5, preevolucion: 6, huevo: 7 };

/**
 * La vía más cómoda de las que tenga la LÍNEA evolutiva, no la forma final.
 *
 * Mirando sólo la forma final, Neblina en un Milotic salía como «Milotic no
 * aprende Neblina»: el movimiento huevo es de **Feebas**, que es lo que sale del
 * huevo. Es la misma trampa que ya estaba documentada para `aprendizaje.js`, y
 * aquí se había colado igual.
 */
export function mejorVia(especie, movimiento, pokedex) {
  if (!pokedex[especie]) return null;
  const todas = viasEnLaLinea(especie, movimiento, pokedex);
  if (!todas.length) return null;
  return [...todas].sort((a, b) => (PRIORIDAD[a.via] ?? 9) - (PRIORIDAD[b.via] ?? 9))[0];
}

/**
 * Plan de movimientos: una entrada por movimiento pedido, y la lista de los que
 * obligan a que el padre del cruce final sea uno concreto.
 */
export function planearMovimientos(objetivo, datos, regionesDisponibles = []) {
  const { pokedex } = datos;
  const especie = objetivo.especie;
  const entradas = [];

  for (const mov of objetivo.movimientos ?? []) {
    const via = mejorVia(especie, mov, pokedex);
    if (!via) {
      entradas.push({ movimiento: mov, imposible: true, nota: `${especie} no aprende ${mov}` });
      continue;
    }

    if (via.via !== 'huevo') {
      entradas.push({
        movimiento: mov, via: via.via, detalle: via.detalle, afectaLaCrianza: false,
        texto: via.via === 'nivel' ? `Lo aprende solo al ${via.detalle}`
          : via.via === 'mt' ? 'Se le enseña con la MT/MO'
          : via.via === 'tutor' ? 'Lo da el tutor de movimientos'
          : `Vía: ${via.detalle}`,
      });
      continue;
    }

    const padres = padresQuePasan(mov, especie, datos, regionesDisponibles);
    entradas.push({
      movimiento: mov,
      via: 'huevo',
      afectaLaCrianza: true,
      padres: padres.slice(0, 10),
      sinPadre: padres.length === 0,
      texto: padres.length
        ? `Movimiento huevo: el padre del último cruce tiene que saberlo. ` +
          `El más cómodo es ${padres[0].especie} (${padres[0].comoLoSabe.detalle}).`
        : `Movimiento huevo y no hay ninguna especie compatible que lo traiga: por esta línea no se puede pasar.`,
    });
  }

  const deHuevo = entradas.filter((e) => e.afectaLaCrianza && !e.sinPadre);

  // ¿Hay un solo padre que pueda llevarlos todos? Si lo hay, se ahorra un cruce
  // por cada movimiento, porque los padres se consumen.
  let padreUnico = null;
  if (deHuevo.length > 1) {
    const comunes = deHuevo
      .map((e) => new Set(e.padres.map((p) => p.especie)))
      .reduce((acc, s) => new Set([...acc].filter((x) => s.has(x))));
    if (comunes.size) {
      const elegido = deHuevo[0].padres.find((p) => comunes.has(p.especie));
      padreUnico = { especie: elegido.especie, movimientos: deHuevo.map((e) => e.movimiento) };
    }
  }

  return {
    entradas,
    deHuevo,
    padreUnico,
    // Sin un padre único, cada movimiento huevo es un cruce más: no caben dos
    // padres distintos en el mismo huevo.
    crucesExtra: padreUnico ? 0 : Math.max(0, deHuevo.length - 1),
    avisos: deHuevo.length
      ? [(deHuevo.length === 1
        ? `${deHuevo[0].movimiento} viene de huevo: el padre del cruce final ya no es libre, `
          + 'tiene que ser uno que lo sepa.'
        : `${deHuevo.length} movimientos vienen de huevo: el padre del cruce final ya no es libre.`
          + (padreUnico
            ? ` ${padreUnico.especie} los lleva todos, así que basta un padre.`
            : ' No hay un padre que lleve todos, así que harán falta cruces adicionales.'))]
      : [],
  };
}
