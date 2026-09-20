// El plan de EVs: cuántos faltan, dónde se sacan y con qué objeto.
//
// Fuentes: wiki/mecanicas/EVs y entrenamiento.md (topes, objetos, vitaminas,
// bayas) y wiki/mecanicas/Dónde entrenar EVs.md (las 581 hordas del juego
// agrupadas por el EV que dan).

import {
  STATS, NOMBRE_STAT, EV_MAX_POR_STAT, EV_MAX_TOTAL,
  EV_POR_VITAMINA, EV_POR_BAYA, EVS_POR_PUNTO,
} from './constantes.js';

/** Vitamina y baya de cada característica. */
export const VITAMINA_DE = {
  ps: 'Más PS', ataque: 'Proteína', defensa: 'Hierro',
  'at-esp': 'Calcio', 'def-esp': 'Zinc', velocidad: 'Carburante',
};

export const BAYA_DE = {
  ps: 'Baya Grana', ataque: 'Baya Algama', defensa: 'Baya Ispero',
  'at-esp': 'Baya Meluce', 'def-esp': 'Baya Uvav', velocidad: 'Baya Tamate',
};

/** Una horda son cinco Pokémon a la vez, así que multiplica por cinco los EVs. */
export const POKEMON_POR_HORDA = 5;

/** Objetos que duplican los EVs ganados. */
export const MULTIPLICADORES = {
  ninguno: { nombre: null, factor: 1, nota: 'sin objeto' },
  'Brazal Firme': { nombre: 'Brazal Firme', factor: 2, nota: 'duplica los EVs, pero baja la Velocidad mientras lo lleva' },
  'Vínculo de Entrenamiento': {
    nombre: 'Vínculo de Entrenamiento', factor: 2,
    nota: 'duplica los EVs y anula la EXP: es el bueno si estás contra el límite de nivel',
  },
};

export function validarEvs(evs) {
  const problemas = [];
  const total = STATS.reduce((a, s) => a + (evs?.[s] ?? 0), 0);
  if (total > EV_MAX_TOTAL) problemas.push(`suman ${total} y el tope es ${EV_MAX_TOTAL}`);
  for (const s of STATS)
    if ((evs?.[s] ?? 0) > EV_MAX_POR_STAT)
      problemas.push(`${NOMBRE_STAT[s]}: ${evs[s]}, el tope por característica es ${EV_MAX_POR_STAT}`);
  return { valido: problemas.length === 0, problemas, total, libres: EV_MAX_TOTAL - total };
}

/**
 * Plan de entrenamiento para llegar de los EVs actuales a los objetivo.
 *
 * @param {Object} evsObjetivo  {ps: 252, ...}
 * @param {Object} evsActuales  los que ya tiene (0 si es recién criado)
 * @param {Object} datos        los JSON
 * @param {Object} opciones     {regionesDisponibles, objeto, nivel}
 */
export function planearEvs(evsObjetivo, evsActuales, datos, opciones = {}) {
  const {
    regionesDisponibles = [],
    objeto = 'Vínculo de Entrenamiento',
    nivel = 50,
  } = opciones;

  const regiones = new Set(regionesDisponibles);
  const mult = MULTIPLICADORES[objeto] ?? MULTIPLICADORES.ninguno;
  const validacion = validarEvs(evsObjetivo);

  const porStat = [];
  for (const stat of STATS) {
    const quiere = evsObjetivo?.[stat] ?? 0;
    const tiene = evsActuales?.[stat] ?? 0;
    const faltan = quiere - tiene;
    if (faltan === 0) continue;

    if (faltan < 0) {
      // Se ha pasado: las bayas bajan 10 EVs cada una.
      porStat.push({
        stat, quiere, tiene, faltan,
        sobran: -faltan,
        comoQuitar: {
          baya: BAYA_DE[stat],
          cuantas: Math.ceil(-faltan / EV_POR_BAYA),
          nota: `cada ${BAYA_DE[stat]} quita ${EV_POR_BAYA} EVs; se pueden cultivar`,
        },
      });
      continue;
    }

    // Hordas disponibles, de más EVs por Pokémon a menos.
    const hordas = (datos.dondeEntrenar?.[stat] ?? [])
      .filter((h) => regiones.has(h.region))
      .sort((a, b) => b.ev - a.ev);

    const mejor = hordas[0] ?? null;
    const porHorda = mejor ? mejor.ev * POKEMON_POR_HORDA * mult.factor : 0;

    porStat.push({
      stat,
      quiere, tiene, faltan,
      puntosANivel: Math.floor(faltan / (EVS_POR_PUNTO[nivel] ?? EVS_POR_PUNTO[50])),
      mejor,
      hordas: hordas.slice(0, 6),
      evsPorHorda: porHorda,
      hordasNecesarias: porHorda ? Math.ceil(faltan / porHorda) : null,
      // Las vitaminas son la alternativa que no depende de la región.
      vitamina: {
        nombre: VITAMINA_DE[stat],
        cuantas: Math.ceil(faltan / EV_POR_VITAMINA),
        nota: 'la wiki las desaconseja: con hordas los EVs salen gratis',
      },
      sinHordasAlAlcance: hordas.length === 0,
      hayHordasEnOtraRegion:
        (datos.dondeEntrenar?.[stat] ?? []).some((h) => !regiones.has(h.region)),
    });
  }

  return {
    ...validacion,
    nivel,
    objeto: mult,
    porStat,
    // Un aviso que ahorra disgustos: el Brazal Firme baja la Velocidad mientras
    // lo lleva, así que entrenar Velocidad con él es contraproducente en combate.
    avisos: [
      ...(objeto === 'Brazal Firme' && (evsObjetivo?.velocidad ?? 0) > 0
        ? ['el Brazal Firme baja la Velocidad mientras lo lleve: quítaselo antes de combatir']
        : []),
      ...(porStat.some((s) => s.sinHordasAlAlcance && s.faltan > 0)
        ? ['hay características sin hordas en tus regiones: mira las vitaminas o desbloquea la región']
        : []),
    ],
    huecos: [
      'La wiki no documenta si las vitaminas tienen tope de EVs en PokeMMO, así que ' +
      'el número de vitaminas sale de dividir y puede no valer a partir de cierto punto.',
    ],
  };
}
