// El plan de EVs: cuántos faltan, dónde se sacan y con qué objeto.
//
// Fuentes: wiki/mecanicas/EVs y entrenamiento.md (topes, objetos, vitaminas,
// bayas) y wiki/mecanicas/Dónde entrenar EVs.md (las 581 hordas del juego
// agrupadas por el EV que dan).

import {
  STATS, NOMBRE_STAT, EV_MAX_POR_STAT, EV_MAX_TOTAL,
  EV_POR_VITAMINA, EV_POR_BAYA, EVS_POR_PUNTO,
} from './constantes.js';
import { disponibleAhora, porQueNoAhora, ordenarPorCuando, CUANDO_CUALQUIERA } from './cuando.js';

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

/**
 * Escalones de EVs: en qué cantidades exactas sube un punto de característica.
 *
 * Los EVs no suben la característica de forma continua: suben por escalones, y
 * todo lo que quede ENTRE un escalón y el siguiente está tirado. A nivel 100 un
 * punto cuesta 4 EVs, así que cualquier múltiplo de 4 aprovecha el 100 %. A
 * nivel 50 cuesta 8, pero **dónde cae el corte depende de la paridad del IV**:
 *
 * | IV | escalones |
 * |---|---|
 * | impar (31) | 4, 12, 20 … 252 |
 * | par (30, 0…) | 8, 16, 24 … 248 |
 *
 * (dato del usuario jugando, 26-09-2026; la wiki no documenta los escalones)
 *
 * Y se puede comprobar con la fórmula de 5ª generación, que sí está:
 * `stat = ⌊(2·base + IV + ⌊EV/4⌋) · nivel/100⌋ + 5`. A nivel 50 eso es
 * `⌊(2·base + IV + ⌊EV/4⌋)/2⌋ + 5`, y como `2·base` siempre es par, la
 * característica sube justo cuando `IV + ⌊EV/4⌋` pasa a ser par. Con IV impar
 * toca en ⌊EV/4⌋ = 1, 3, 5… o sea EV = 4, 12, 20…; con IV par en 2, 4, 6… o
 * sea EV = 8, 16, 24… La base NO influye, que es lo que uno esperaría y no es.
 */
export function esImpar(iv) { return (iv ?? 0) % 2 === 1; }

/** Cuántos puntos de característica dan `ev` EVs, a ese nivel y con ese IV. */
export function puntosPorEvs(ev, nivel, iv) {
  const e = Math.max(0, ev ?? 0);
  if (nivel === 100) return Math.floor(e / 4);
  // Nivel 50 (y cualquier otro que no sea 100: es el nivel de PvP).
  return esImpar(iv) ? (e < 4 ? 0 : 1 + Math.floor((e - 4) / 8)) : Math.floor(e / 8);
}

/** El escalón exacto inmediatamente inferior o igual a `ev`. */
export function escalonInferior(ev, nivel, iv) {
  const e = Math.max(0, Math.min(EV_MAX_POR_STAT, ev ?? 0));
  const puntos = puntosPorEvs(e, nivel, iv);
  if (!puntos) return 0;
  if (nivel === 100) return puntos * 4;
  return esImpar(iv) ? 4 + (puntos - 1) * 8 : puntos * 8;
}

/** El escalón siguiente, o null si ya no cabe otro punto (tope de 252). */
export function escalonSiguiente(ev, nivel, iv) {
  const base = escalonInferior(ev, nivel, iv);
  const paso = nivel === 100 ? 4 : 8;
  const sig = base === 0 && nivel !== 100 ? (esImpar(iv) ? 4 : 8) : base + paso;
  return sig <= EV_MAX_POR_STAT ? sig : null;
}

/**
 * Aprieta un reparto de EVs: recorta lo que no llega a punto y lo reinvierte.
 *
 * Dos pasadas, que son las que pidió el usuario:
 *
 * 1. cada característica baja al escalón exacto inmediatamente inferior a lo que
 *    pedías; lo que quede por encima no daba ni un punto y estaba tirado;
 * 2. los EVs recuperados se reparten donde SÍ completen un punto entero,
 *    empezando por la característica a la que le falte menos.
 *
 * Sólo se reinvierte en características en las que ya habías puesto EVs: meter
 * puntos en una que no habías pedido cambia el Pokémon, y eso lo decides tú.
 * Lo que sobre al final se dice, no se coloca a la fuerza.
 */
export function optimizarEvs(evsObjetivo, ivs = {}, nivel = 50) {
  const pedidos = Object.fromEntries(STATS.map((s) => [s, Math.max(0, evsObjetivo?.[s] ?? 0)]));
  const ivDe = (s) => ivs?.[s] ?? 0;

  const ajustados = { ...pedidos };
  const porStat = [];
  let recuperados = 0;

  for (const stat of STATS) {
    if (!pedidos[stat]) continue;
    const escalon = escalonInferior(pedidos[stat], nivel, ivDe(stat));
    const sobra = pedidos[stat] - escalon;
    ajustados[stat] = escalon;
    recuperados += sobra;
    porStat.push({
      stat,
      pedidos: pedidos[stat],
      escalon,
      desperdiciados: sobra,
      iv: ivDe(stat),
      paridad: nivel === 100 ? null : (esImpar(ivDe(stat)) ? 'impar' : 'par'),
      puntos: puntosPorEvs(escalon, nivel, ivDe(stat)),
    });
  }

  // Reinvertir: siempre el punto más barato primero.
  const reinversiones = [];
  let bolsa = recuperados;
  for (;;) {
    const candidatos = porStat
      .map((x) => {
        const sig = escalonSiguiente(ajustados[x.stat], nivel, ivDe(x.stat));
        return sig == null ? null : { stat: x.stat, de: ajustados[x.stat], a: sig, cuesta: sig - ajustados[x.stat] };
      })
      .filter((c) => c && c.cuesta <= bolsa)
      .sort((a, b) => a.cuesta - b.cuesta);
    if (!candidatos.length) break;

    const c = candidatos[0];
    // El tope de 510 en total también manda.
    const totalAhora = STATS.reduce((a, s) => a + ajustados[s], 0);
    if (totalAhora + c.cuesta > EV_MAX_TOTAL) break;

    ajustados[c.stat] = c.a;
    bolsa -= c.cuesta;
    reinversiones.push(c);
  }

  const puntosDe = (mapa) => STATS.reduce((a, s) => a + puntosPorEvs(mapa[s], nivel, ivDe(s)), 0);
  const totalDe = (mapa) => STATS.reduce((a, s) => a + mapa[s], 0);

  // Un IV que no está fijado a 31 puede salir par o impar, y a nivel 50 eso
  // mueve los escalones. Conviene decirlo en vez de dar por buena una paridad.
  const ivsSinFijar = nivel === 100
    ? []
    : porStat.filter((x) => x.iv !== 31).map((x) => x.stat);

  return {
    nivel,
    pedidos,
    ajustados,
    porStat,
    recuperados,
    reinversiones,
    sobrantes: bolsa,
    puntosAntes: puntosDe(pedidos),
    puntosDespues: puntosDe(ajustados),
    totalAntes: totalDe(pedidos),
    totalDespues: totalDe(ajustados),
    mereceLaPena: recuperados > 0 && (reinversiones.length > 0 || bolsa > 0),
    ivsSinFijar,
  };
}

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
 * @param {Object} opciones     {regionesDisponibles, objeto, nivel, ivs, cuando}
 */
export function planearEvs(evsObjetivo, evsActuales, datos, opciones = {}) {
  const {
    regionesDisponibles = [],
    objeto = 'Vínculo de Entrenamiento',
    nivel = 50,
    ivs = {},
    cuando = CUANDO_CUALQUIERA,
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

    // Hordas disponibles: primero las que existen con la hora y la estación
    // puestas, y dentro de eso las que más EVs dan. Una horda «de noche ·
    // invierno» no existe si entras de día en verano, y mandar ahí a alguien es
    // mandarlo a dar vueltas por un mapa vacío.
    const todas = (datos.dondeEntrenar?.[stat] ?? []).filter((h) => regiones.has(h.region));
    const hordas = ordenarPorCuando(todas, cuando, (a, b) => b.ev - a.ev)
      .map((h) => ({ ...h, ahora: disponibleAhora(h, cuando), noAhora: porQueNoAhora(h, cuando) }));

    const mejor = hordas[0] ?? null;
    const porHorda = mejor ? mejor.ev * POKEMON_POR_HORDA * mult.factor : 0;

    porStat.push({
      stat,
      quiere, tiene, faltan,
      puntosANivel: Math.floor(faltan / (EVS_POR_PUNTO[nivel] ?? EVS_POR_PUNTO[50])),
      mejor,
      hordas: hordas.slice(0, 6),
      // De todas las que hay en tus regiones, cuántas y cuáles sirven AHORA.
      // El filtro de hora y estación NO quita ninguna: sólo cambia el orden y
      // marca las que no tocan, porque una franja llega sola en minutos.
      hordasTotales: hordas.length,
      hordasAhora: hordas.filter((h) => h.ahora).length,
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
    // Lo que sobra entre escalón y escalón, y dónde reinvertirlo.
    optimizacion: optimizarEvs(evsObjetivo, ivs, nivel),
    // Un aviso que ahorra disgustos: el Brazal Firme baja la Velocidad mientras
    // lo lleva, así que entrenar Velocidad con él es contraproducente en combate.
    avisos: [
      ...(objeto === 'Brazal Firme' && (evsObjetivo?.velocidad ?? 0) > 0
        ? ['el Brazal Firme baja la Velocidad mientras lo lleve: quítaselo antes de combatir']
        : []),
      ...(porStat.some((s) => s.sinHordasAlAlcance && s.faltan > 0)
        ? ['hay características sin hordas en tus regiones: mira las vitaminas o desbloquea la región']
        : []),
      ...(porStat.some((s) => s.faltan > 0 && !s.sinHordasAlAlcance && s.hordasAhora === 0)
        ? ['hay características cuyas hordas no salen con la hora o la estación que tienes puestas: '
           + 'espera a la franja buena o usa vitaminas']
        : []),
    ],
    huecos: [
      'La wiki no documenta si las vitaminas tienen tope de EVs en PokeMMO, así que ' +
      'el número de vitaminas sale de dividir y puede no valer a partir de cierto punto.',
      'Los escalones de EVs tampoco están en la wiki: salen de tu experiencia jugando ' +
      '(26-09-2026) y cuadran con la fórmula de característica de 5ª generación. ' +
      'Convendría subirlos a la wiki como fuente nueva.',
    ],
  };
}
