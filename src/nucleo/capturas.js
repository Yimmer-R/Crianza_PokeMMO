// Dónde conseguir los padres que pide el plan.
//
// Dos cosas que el juego no perdona y que la app tiene que respetar:
//
// 1. Los IVs no se pueden filtrar al capturar. Así que lo único honesto es decir
//    dónde aparece la especie y cuántos intentos salen de media para que el IV
//    pedido caiga a 31 — no "ve a este sitio y saldrá".
// 2. Hay Pokémon que sólo aparecen en una región. Si el usuario no la tiene
//    desbloqueada, esa sugerencia no vale nada, y por eso el filtro de regiones
//    no es un adorno: es lo primero que se aplica.

import { IV_MAX, SEXOS } from './constantes.js';
import { padresCompatibles, gruposEnComun, sinGenero, esEsteril } from './compatibilidad.js';
import { elegirRelleno } from './planificador.js';
import { disponibleAhora, porQueNoAhora, ordenarPorCuando, CUANDO_CUALQUIERA } from './cuando.js';

/** Probabilidad de que un IV suelto salga 31 al capturar: 1 de 32 valores (0-31). */
export const P_IV_PERFECTO = 1 / (IV_MAX + 1);

/**
 * Intentos de media para capturar un ejemplar que cumpla lo pedido.
 * Los IVs son independientes entre sí y del sexo, así que se multiplica.
 */
export function intentosEsperados({ ivs31 = 0, sexo = null, ratioSexo = 50, naturaleza = false }) {
  let p = P_IV_PERFECTO ** ivs31;
  if (sexo && sexo !== SEXOS.SIN_GENERO) p *= (ratioSexo / 100);
  if (naturaleza) p *= 1 / 25; // 25 naturalezas equiprobables
  return p > 0 ? Math.ceil(1 / p) : Infinity;
}

/** Zonas donde aparece una especie, filtradas por las regiones disponibles. */
export function dondeAparece(especie, datos, regionesDisponibles) {
  const regiones = new Set(regionesDisponibles);
  const todas = datos.encuentros[especie] ?? [];
  const disponibles = todas.filter((e) => regiones.has(e.region));
  return {
    disponibles,
    fueraDeAlcance: todas.filter((e) => !regiones.has(e.region)),
    hayEnOtraRegion: todas.length > disponibles.length,
    ninguna: todas.length === 0,
  };
}

const PESO_RAREZA = {
  'muy común': 6, 'muy comun': 6, común: 5, comun: 5, horda: 4,
  'poco común': 3, 'poco comun': 3, especial: 2, señuelo: 2, senuelo: 2, raro: 1,
};

function pesoRareza(rareza = '') {
  const r = rareza.toLowerCase();
  for (const [clave, peso] of Object.entries(PESO_RAREZA)) if (r.includes(clave)) return peso;
  return 2;
}

/**
 * Ordena las zonas de mejor a peor para farmear capturas.
 *
 * Primero lo que existe con la hora y la estación que tengas puestas: una zona
 * más común pero «sólo de noche · invierno» no te sirve ahora, y ponerla la
 * primera manda a dar vueltas. Lo que no toca no se esconde, se marca.
 */
export function mejoresZonas(lista, cuantas = 6, cuando = CUANDO_CUALQUIERA) {
  return ordenarPorCuando(lista, cuando, (a, b) => pesoRareza(b.rareza) - pesoRareza(a.rareza))
    .slice(0, cuantas)
    .map((z) => ({ ...z, ahora: disponibleAhora(z, cuando), noAhora: porQueNoAhora(z, cuando) }));
}

/**
 * Convierte un hueco del plan en un consejo de captura concreto.
 *
 * Si el hueco es de la línea paterna, la especie es libre: se proponen las más
 * fáciles del grupo huevo que estén al alcance, que es exactamente lo que pide
 * el usuario ("sugerirme capturar otra especie del mismo grupo huevo si es más
 * fácil de obtener").
 */
export function comoConseguir(requisito, datos, regionesDisponibles, objetivo, cuando = CUANDO_CUALQUIERA) {
  const { pokedex } = datos;
  const ivs31 = requisito.stats.length;
  const conNaturaleza = !!requisito.naturaleza;

  const opciones = [];
  const candidatas = requisito.especieLibre
    ? elegirRelleno(objetivo.especie, datos, regionesDisponibles, cuando).slice(0, 6).map((c) => c.especie)
    : [requisito.especieSugerida];

  for (const especie of candidatas) {
    const p = pokedex[especie];
    if (!p || esEsteril(p)) continue;
    const donde = dondeAparece(especie, datos, regionesDisponibles);
    const ratio = requisito.sexo === SEXOS.HEMBRA ? (p.genero?.hembra ?? 0)
      : requisito.sexo === SEXOS.MACHO ? (p.genero?.macho ?? 0)
      : 100;

    opciones.push({
      especie,
      esObjetivo: especie === objetivo.especie,
      gruposEnComun: gruposEnComun(pokedex[objetivo.especie], p),
      sinGenero: sinGenero(p),
      ratioSexo: ratio,
      // Un ratio de 0 significa que ese sexo no existe en la especie: no sirve.
      viable: ratio > 0 || sinGenero(p),
      zonas: mejoresZonas(donde.disponibles, 6, cuando),
      zonasAhora: donde.disponibles.filter((z) => disponibleAhora(z, cuando)).length,
      zonasFueraDeAlcance: donde.hayEnOtraRegion ? mejoresZonas(donde.fueraDeAlcance, 3, cuando) : [],
      soloEnOtraRegion: donde.disponibles.length === 0 && donde.hayEnOtraRegion,
      noSalvaje: donde.ninguna,
      intentos: intentosEsperados({ ivs31, sexo: requisito.sexo, ratioSexo: ratio, naturaleza: conNaturaleza }),
    });
  }

  const viables = opciones.filter((o) => o.viable && o.zonas.length);
  // Una especie que ahora mismo no aparece en ningún sitio va detrás de otra
  // que sí, aunque sea algo más rara: lo primero es poder ir hoy.
  viables.sort((a, b) =>
    (b.zonasAhora > 0) - (a.zonasAhora > 0)
    || a.intentos - b.intentos
    || b.zonas.length - a.zonas.length);

  return {
    requisito,
    // Si la especie objetivo aparece entre las viables se marca, porque a veces
    // es más cómodo capturar la propia especie aunque no sea la más fácil.
    recomendada: viables[0] ?? null,
    opciones,
    viables,
    // Sin ninguna opción capturable la única salida es el GTL, cuyo precio la
    // wiki deliberadamente no guarda.
    soloGtl: viables.length === 0,
    nota: viables.length === 0
      ? 'Ninguna de las especies compatibles aparece en tus regiones: toca el GTL, y ahí el precio lo pones tú.'
      : null,
  };
}

/** Todos los consejos de captura de un plan, agrupados por hueco repetido. */
export function planDeCapturas(plan, datos, regionesDisponibles, cuando = CUANDO_CUALQUIERA) {
  if (!plan?.ok) return [];
  const mapa = new Map();
  for (const req of plan.pasos.conseguir) {
    const clave = JSON.stringify([req.stats, req.naturaleza, req.sexo, req.especieLibre]);
    if (mapa.has(clave)) { mapa.get(clave).cuantos++; continue; }
    mapa.set(clave, { cuantos: 1, ...comoConseguir(req, datos, regionesDisponibles, plan.objetivo, cuando) });
  }
  return [...mapa.values()].sort((a, b) => b.cuantos - a.cuantos);
}

/** Regiones donde hace falta jugar para completar el plan, y las que no. */
export function regionesQueHacenFalta(plan, datos, regionesDisponibles, cuando) {
  const usadas = new Set();
  const bloqueadas = new Set();
  for (const c of planDeCapturas(plan, datos, regionesDisponibles, cuando)) {
    for (const z of c.recomendada?.zonas ?? []) usadas.add(z.region);
    if (c.soloGtl) for (const o of c.opciones) for (const z of o.zonasFueraDeAlcance) bloqueadas.add(z.region);
  }
  return { usadas: [...usadas].sort(), bloqueadas: [...bloqueadas].sort() };
}
