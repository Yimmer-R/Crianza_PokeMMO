// Los IVs que nadie pidió y que el inventario trae de todas formas.
//
// El caso que lo motivó: un Gible ♀ que está en el árbol sólo porque es la
// hembra que pone la especie, y que además tiene 31 en Defensa. El objetivo
// pedía Ataque y Velocidad, así que la Defensa no la mira nadie — y se pierde
// en el primer cruce sin que el plan diga ni una palabra.
//
// Lo primero que hay que tener claro, porque decide todo lo demás:
//
//   **no hay forma de conservar un IV "a medias".** Un cruce garantiza los 31
//   que comparten los DOS padres más los que fuerce un Recio, y los Recios de
//   un plan ya están todos comprometidos con los IVs que sí se pidieron (y uno
//   de los dos huecos se lo lleva la Piedraeterna cuando hay naturaleza). Así
//   que un IV de regalo sólo llega a la cría de una de estas dos maneras:
//
//     - **gratis**, si los dos padres de ese cruce lo tienen a 31 por
//       casualidad. Eso el plan ya lo cuenta: sale en el suelo que calcula
//       `ivsDelArbol()`, y aquí se lee como `garantizado`;
//     - **por suerte**, con la probabilidad de la rama «alto» de la tabla de
//       herencia en el cruce donde se juega. Si toca, se anota la cría y el
//       plan lo recoge en el siguiente recálculo, igual que con los 30.
//
//   Lo demás es mentira. Querer un IV **garantizado** es pedirlo: el objetivo
//   pasa de n×31 a (n+1)×31 y el árbol dobla. Por eso aquí no hay una
//   heurística que «intente conservarlo»: hay una medida honesta de lo que pasa
//   hoy y un interruptor que lo pide de verdad, con su precio delante.
//
// Y el «o 30 en su defecto» sale solo: si se pide Defensa a 31 y en la caja
// sólo hay un 30, `cumple()` lo acepta como pseudo 31 y el plan avisa de que
// ese IV sale a 30. No hace falta un modo aparte.

import { STATS, NOMBRE_STAT, IV_MAX } from './constantes.js';
import { IV_PSEUDO } from './herencia.js';
import { planear, statsPedidos, contar, medirArbol } from './planificador.js';

/** Cuántos regalos se evalúan con un plan entero detrás. Cada uno cuesta un `planear()`. */
export const TOPE_REGALOS = 4;

/** Quién del inventario trae este IV, y si el plan lo está usando. */
function quienesLoTraen(stat, inventario, usados) {
  return inventario
    .filter((e) => (e.ivs?.[stat] ?? 0) >= IV_PSEUDO)
    .map((e) => ({
      id: e.id,
      especie: e.especie,
      sexo: e.sexo,
      mote: e.mote ?? null,
      valor: e.ivs[stat],
      enElPlan: usados.has(e.id),
    }))
    .sort((a, b) => b.valor - a.valor || Number(b.enElPlan) - Number(a.enElPlan));
}

/** Los ejemplares del inventario que el plan está usando, por id. */
export function idsEnElPlan(plan) {
  const out = new Set();
  if (!plan?.ok) return out;
  (function recorre(n) {
    if (n.tipo === 'inventario' && n.ejemplar?.id) out.add(n.ejemplar.id);
    n.hijos.forEach(recorre);
  })(plan.arbol);
  return out;
}

/**
 * Qué hace el plan de hoy con cada IV de regalo.
 *
 * No toca el plan ni lo recalcula: lee lo que `montarPlan()` ya midió.
 *
 * @returns {Array<{stat, nombre, mejorEnLaCaja, quienes, entregado, garantizado,
 *   tiradas, estado: 'garantizado'|'a-suerte'|'se-pierde'}>}
 */
export function regalosDelPlan(plan, inventario = []) {
  if (!plan?.ok) return [];
  const usados = idsEnElPlan(plan);

  return (plan.regalo ?? []).map((stat) => {
    const quienes = quienesLoTraen(stat, inventario, usados);
    const entregado = plan.ivsFinales?.[stat] ?? 0;
    const tiradas = (plan.suerteRegalo ?? [])
      .filter((x) => x.stat === stat)
      .map((x) => ({ ...x, esRaiz: x.nodo === plan.arbol.id }));
    return {
      stat,
      nombre: NOMBRE_STAT[stat] ?? stat,
      mejorEnLaCaja: Math.max(...quienes.map((q) => q.valor), 0),
      quienes,
      entregado,
      garantizado: entregado >= IV_PSEUDO,
      tiradas,
      estado: entregado >= IV_PSEUDO ? 'garantizado' : tiradas.length ? 'a-suerte' : 'se-pierde',
    };
  }).sort((a, b) =>
    b.mejorEnLaCaja - a.mejorEnLaCaja
    || Number(b.quienes.some((q) => q.enElPlan)) - Number(a.quienes.some((q) => q.enElPlan))
    || STATS.indexOf(a.stat) - STATS.indexOf(b.stat));
}

/** El objetivo con un IV más pedido a 31, anotado como conservado a mano. */
export function conservando(objetivo, stat) {
  return {
    ...objetivo,
    ivs: { ...objetivo.ivs, [stat]: IV_MAX },
    conservados: [...new Set([...(objetivo.conservados ?? []), stat])],
  };
}

/** Deshace lo anterior: el IV vuelve a no pedirse. */
export function dejandoDeConservar(objetivo, stat) {
  return {
    ...objetivo,
    ivs: { ...objetivo.ivs, [stat]: 0 },
    conservados: (objetivo.conservados ?? []).filter((s) => s !== stat),
  };
}

/**
 * Qué IVs se están conservando a petición del usuario.
 *
 * Se filtra contra `ivs` porque el usuario puede quitar la casilla en Objetivo,
 * y entonces la marca sobra: manda lo que pide el objetivo, no la anotación.
 */
export const conservadosDe = (objetivo) =>
  (objetivo.conservados ?? []).filter((s) => (objetivo.ivs?.[s] ?? 0) >= IV_MAX);

/** Lo que cuesta un plan, en lo que de verdad duele: capturas, esfuerzo y cruces. */
const coste = (plan) => (plan?.ok
  ? {
    cruces: contar(plan.arbol).cruces,
    capturas: medirArbol(plan.arbol).capturas,
    esfuerzo: medirArbol(plan.arbol).esfuerzo,
    dinero: medirArbol(plan.arbol).dinero,
    cortos: (plan.ivsCortos ?? []).length,
  }
  : null);

/** `b` menos `a`, campo a campo. Positivo = `b` cuesta más. */
export function diferencia(a, b) {
  const x = coste(a);
  const y = coste(b);
  if (!x || !y) return null;
  return Object.fromEntries(Object.keys(x).map((k) => [k, y[k] - x[k]]));
}

/**
 * Los regalos con el precio de conservarlos, y los conservados con lo que están
 * costando. Cada entrada cuesta un `planear()` entero, así que sólo se hace para
 * la crianza activa y con tope — es lo que se enseña, no lo que se decide.
 *
 * @param {Object} plan el plan de hoy, ya calculado
 * @param {Object} objetivo el objetivo de hoy
 * @param {Object} opciones lo mismo que se le pasa a `planear()`
 */
export function regalosConPrecio(plan, objetivo, datos, opciones = {}) {
  if (!plan?.ok) return { candidatos: [], conservados: [] };

  const candidatos = regalosDelPlan(plan, opciones.inventario ?? [])
    .slice(0, TOPE_REGALOS)
    .map((r) => {
      const otro = planear(conservando(objetivo, r.stat), datos, opciones);
      return {
        ...r,
        precio: diferencia(plan, otro),
        // A qué valor lo dejaría el plan si se pidiera. Se pide SIEMPRE a 31 —no
        // hay forma de pedir «un 30»— y si en la caja sólo hay un 30 y capturar
        // un 31 no compensa, `cumple()` lo acepta como pseudo 31 y esto sale 30.
        // Eso es el «o 30 en su defecto»: no es un modo aparte, es el resultado.
        saldriaA: otro.ok ? (otro.ivsFinales?.[r.stat] ?? 0) : null,
      };
    });

  // Y al revés, para los que ya se están conservando: cuánto se ahorraría al
  // soltarlos. Sin esto, la decisión sólo se puede deshacer a ciegas.
  const conservados = conservadosDe(objetivo).map((stat) => {
    const otro = planear(dejandoDeConservar(objetivo, stat), datos, opciones);
    return {
      stat,
      nombre: NOMBRE_STAT[stat] ?? stat,
      // En negativo: lo que se ahorraría quitándolo. `diferencia` da b-a, así que
      // esto sale con signo de «el plan sin él cuesta X menos».
      ahorro: diferencia(plan, otro),
    };
  });

  return { candidatos, conservados };
}

/** ¿Tiene sentido enseñar la tarjeta? */
export const hayRegalos = (plan, objetivo) =>
  Boolean((plan?.regalo ?? []).length || conservadosDe(objetivo ?? {}).length);

/** Los IVs del objetivo que NO son de regalo: los que se pidieron de entrada. */
export const pedidosDeVerdad = (objetivo) =>
  statsPedidos(objetivo).filter((s) => !conservadosDe(objetivo).includes(s));
