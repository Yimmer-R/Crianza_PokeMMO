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

import { IV_MAX, SEXOS, SENUELO } from './constantes.js';
import { padresCompatibles, gruposEnComun, sinGenero, esEsteril, comoLlegaACriar } from './compatibilidad.js';
import { elegirRelleno } from './planificador.js';
import { disponibleAhora, porQueNoAhora, ordenarPorCuando, CUANDO_CUALQUIERA } from './cuando.js';
import { saleComoAlpha, encuentrosPorShiny } from './variantes.js';

/** Probabilidad de que un IV suelto salga 31 al capturar: 1 de 32 valores (0-31). */
export const P_IV_PERFECTO = 1 / (IV_MAX + 1);

/** Combinaciones de n en k, con enteros: n es 6 como mucho. */
const combinatorio = (n, k) => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
};

/**
 * Probabilidad de que los `pedidos` IVs salgan a 31 en un Alpha.
 *
 * Un Alpha viene con **dos IVs perfectos elegidos al azar** de los seis
 * (wiki/mecanicas/Pokémon Alpha.md). Al azar quiere decir que la pareja de
 * huecos perfectos es una de las 15 posibles, todas igual de probables: si
 * caen encima de los que pides, te los regalan; los que queden fuera se juegan
 * a 1 de 32 como siempre. Eso baja un 3×31 de 32.768 encuentros a unos 150, y
 * es la razón de que un Alpha valga la pena aunque los enjambres sean escasos.
 */
export function probabilidadEnAlpha(pedidos, deTotal = 6, regalados = 2) {
  const total = combinatorio(deTotal, regalados);
  let p = 0;
  for (let j = 0; j <= Math.min(pedidos, regalados); j++) {
    const casos = combinatorio(pedidos, j) * combinatorio(deTotal - pedidos, regalados - j);
    p += (casos / total) * P_IV_PERFECTO ** (pedidos - j);
  }
  return p;
}

/**
 * Intentos de media para capturar un ejemplar que cumpla lo pedido.
 * Los IVs son independientes entre sí y del sexo, así que se multiplica.
 */
export function intentosEsperados({ ivs31 = 0, sexo = null, ratioSexo = 50, naturaleza = false, alpha = false }) {
  let p = alpha ? probabilidadEnAlpha(ivs31) : P_IV_PERFECTO ** ivs31;
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

// El señuelo va el ÚLTIMO, por debajo de «raro», y no es un matiz: una zona de
// señuelo no se farmea paseando. Hace falta un consumible activo y aun así la
// especie exclusiva sale en un 5 % de los encuentros (10 % con premium). Antes
// pesaba lo mismo que «especial» y la app lo proponía como si fuera normal.
const PESO_RAREZA = {
  'muy común': 6, 'muy comun': 6, común: 5, comun: 5, horda: 4,
  'poco común': 3, 'poco comun': 3, especial: 2, raro: 1, señuelo: 0, senuelo: 0,
};

/** ¿Esta zona sólo se puede farmear con un señuelo activo? */
export const esDeSenuelo = (z) => /se[ñn]uelo/i.test(z?.rareza ?? '');

/**
 * Los encuentros que hay que ver de verdad cuando la especie SÓLO sale con
 * señuelo.
 *
 * El señuelo no hace que la especie salga: hace que un 5 % de los encuentros
 * (10 % con premium) sean de especie exclusiva. Así que a los intentos que ya
 * pedían los IVs hay que dividirlos por esa probabilidad. Y es un **suelo**:
 * ese 5 % se reparte entre todas las exclusivas de la zona, y no está
 * documentado cuántas hay en cada una, así que de esta especie puede tocar
 * menos, nunca más.
 */
export function intentosConSenuelo(intentos, premium = false) {
  const p = premium ? SENUELO.probExclusiva.premium : SENUELO.probExclusiva.normal;
  return Number.isFinite(intentos) ? Math.ceil(intentos / p) : intentos;
}

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
  // La espina ya no es UNA especie: es la línea evolutiva entera, porque del
  // huevo sale la forma base y cualquiera de la línea pone la misma. Así un
  // Starmie deja de pedir un Starmie («Señuelo», 13 sitios) cuando un Staryu
  // («Común», 33 sitios) vale igual.
  const candidatas = requisito.especieLibre
    ? elegirRelleno(objetivo.especie, datos, regionesDisponibles, cuando, { soloAlpha: !!requisito.alpha })
      .slice(0, 6).map((c) => c.especie)
    : (requisito.especiesValidas ?? [requisito.especieSugerida]);

  // Cuando el hueco tiene que pasar un movimiento huevo, el plan ya trae quién
  // puede saberlo y por qué vía: se engancha a cada opción para que la vista
  // pueda decir CÓMO se consigue el movimiento, no sólo a quién capturar.
  const comoSabeElMovimiento = new Map(
    (requisito.padresDelMovimiento ?? []).map((c) => [c.especie, c]),
  );

  for (const especie of candidatas) {
    const p = pokedex[especie];
    if (!p) continue;
    // Un bebé (Pichu, Tyrogue, Riolu…) no cría, pero se captura igual de bien:
    // no se descarta, se dice que hay que evolucionarlo antes de criar.
    const noCria = esEsteril(p);
    const evolucionar = noCria ? comoLlegaACriar(especie, pokedex) : null;
    if (noCria && !evolucionar) continue;
    const donde = dondeAparece(especie, datos, regionesDisponibles);
    const ratio = requisito.sexo === SEXOS.HEMBRA ? (p.genero?.hembra ?? 0)
      : requisito.sexo === SEXOS.MACHO ? (p.genero?.macho ?? 0)
      : 100;

    const conMovimiento = comoSabeElMovimiento.get(especie) ?? null;
    // Una especie cuyas zonas son TODAS de señuelo no se captura paseando: hace
    // falta el consumible, y aun así sale en una fracción de los encuentros.
    const aPie = donde.disponibles.filter((z) => !esDeSenuelo(z));
    const soloConSenuelo = donde.disponibles.length > 0 && aPie.length === 0;
    const intentos = intentosEsperados({
      ivs31, sexo: requisito.sexo, ratioSexo: ratio, naturaleza: conNaturaleza, alpha: !!requisito.alpha,
    });
    // Un Alpha no se busca donde sale la especie: sale en enjambres, y sólo de
    // las líneas que los tienen. Dos IVs le vienen ya perfectos, pero al azar,
    // así que no rebajan lo que hay que buscar.
    const alpha = requisito.alpha ? saleComoAlpha(especie, datos) : null;
    // Un árbol shiny es shiny hoja por hoja, y una hoja shiny cuesta lo que
    // cuesta encontrar un variocolor: se multiplica por ahí.
    const porShiny = requisito.shiny ? encuentrosPorShiny() : 1;

    opciones.push({
      especie,
      esObjetivo: especie === objetivo.especie,
      // Los movimientos que este hueco tiene que pasar, y cómo los sabe esta
      // especie: «nivel 36», «MT/MO» o, lo peor, «sólo de huevo» — que abre otra
      // cadena de crianza.
      movimientos: requisito.movimientos ?? [],
      comoLoSabe: conMovimiento?.comoLoSabe ?? null,
      comoSabeCada: conMovimiento?.comoSabeCada ?? null,
      gruposEnComun: gruposEnComun(pokedex[objetivo.especie], p),
      sinGenero: sinGenero(p),
      noCria,
      evolucionar,
      // Un Ditto no se cría ni se evoluciona: o se captura, o se compra.
      noSeCria: !!requisito.noSeCria,
      ratioSexo: ratio,
      // Un ratio de 0 significa que ese sexo no existe en la especie: no sirve.
      viable: ratio > 0 || sinGenero(p),
      zonas: mejoresZonas(donde.disponibles, 6, cuando),
      zonasAhora: aPie.filter((z) => disponibleAhora(z, cuando)).length,
      soloConSenuelo,
      // Cuántas zonas de las propuestas piden señuelo, para marcarlas una a una.
      zonasDeSenuelo: donde.disponibles.filter((z) => esDeSenuelo(z)).length,
      zonasFueraDeAlcance: donde.hayEnOtraRegion ? mejoresZonas(donde.fueraDeAlcance, 3, cuando) : [],
      soloEnOtraRegion: donde.disponibles.length === 0 && donde.hayEnOtraRegion,
      noSalvaje: donde.ninguna,
      intentos,
      // Lo que cuesta de verdad contando la vía: el señuelo divide por la
      // probabilidad de exclusiva y el variocolor multiplica por sus 24.000.
      // `intentos` se deja intacto para poder decir las dos cifras.
      intentosReales: (soloConSenuelo ? intentosConSenuelo(intentos) : intentos) * porShiny,
      shiny: !!requisito.shiny,
      porShiny,
      alpha: !!requisito.alpha,
      // Si sale como Alpha y por dónde: enjambre de todos los días, evento de
      // temporada, o un reparto de una vez que ya no vuelve.
      comoSaleDeAlpha: alpha,
    });
  }

  // Un Alpha no se captura en una ruta, así que `zonas` no decide aquí: lo que
  // decide es que la línea tenga enjambre. Sin esto, un hueco Alpha se quedaba
  // sin ninguna opción viable y salía como «sólo GTL», que es falso.
  const viables = opciones.filter((o) => o.viable && (o.alpha ? o.comoSaleDeAlpha?.sale : o.zonas.length));
  // Una especie que ahora mismo no aparece en ningún sitio va detrás de otra
  // que sí, aunque sea algo más rara: lo primero es poder ir hoy.
  viables.sort((a, b) =>
    // Un padre que sólo sabe el movimiento DE HUEVO abre otra cadena entera:
    // va detrás de cualquiera que lo aprenda por nivel, MT o tutor.
    ((a.comoLoSabe?.via === 'huevo') - (b.comoLoSabe?.via === 'huevo'))
    // Una especie que sólo sale con señuelo va detrás de cualquiera que se
    // pueda farmear paseando, aunque sobre el papel pida menos intentos.
    || a.soloConSenuelo - b.soloConSenuelo
    || (b.zonasAhora > 0) - (a.zonasAhora > 0)
    || a.intentosReales - b.intentosReales
    // Con los mismos intentos, mejor el que ya cría que el que hay que
    // evolucionar antes.
    || (a.noCria === b.noCria ? 0 : a.noCria ? 1 : -1)
    || b.zonas.length - a.zonas.length);

  return {
    requisito,
    // Si la especie objetivo aparece entre las viables se marca, porque a veces
    // es más cómodo capturar la propia especie aunque no sea la más fácil.
    recomendada: viables[0] ?? null,
    opciones,
    viables,
    // Se sube al nivel del hueco para que el presupuesto y la vista Plan no
    // tengan que volver a mirar dentro de las opciones.
    conSenuelo: !!viables[0]?.soloConSenuelo,
    conShiny: !!requisito.shiny,
    conAlpha: !!requisito.alpha,
    // Sin ninguna opción capturable la única salida es el GTL, cuyo precio la
    // wiki deliberadamente no guarda.
    soloGtl: viables.length === 0,
    // Dos «no hay» distintos, y confundirlos manda a buscar algo que no existe:
    // una cosa es que la especie esté en una región que no tienes, y otra que
    // no salga en la hierba en ninguna parte (fósiles, regalos, Porygon…). La
    // wiki no dice de dónde sale cada una, así que no se inventa el método.
    nota: viables.length !== 0 ? null
      : requisito.alpha
        ? 'Ninguna de las especies que valen para este hueco sale como Alpha, y un Alpha sólo '
          + 'se cría con otro Alpha: no hay pareja posible.'
      : opciones.length && opciones.every((o) => o.noSalvaje)
        ? `Ni ${candidatas[0]} ni el resto de su línea aparecen en estado salvaje: en el juego `
          + 'salen por otra vía (fósil, regalo, intercambio…) o por el GTL. No tengo esa '
          + 'vía, así que no me la invento.'
        : 'Ninguna de las especies compatibles aparece en tus regiones: toca el GTL, y ahí el precio lo pones tú.',
  };
}

/** Todos los consejos de captura de un plan, agrupados por hueco repetido. */
export function planDeCapturas(plan, datos, regionesDisponibles, cuando = CUANDO_CUALQUIERA) {
  if (!plan?.ok) return [];
  const mapa = new Map();
  for (const req of plan.pasos.conseguir) {
    // Los movimientos entran en la clave: «31 en Defensa ♂» y «31 en Defensa ♂
    // con Neblina» no son el mismo hueco, aunque lo demás coincida.
    const clave = JSON.stringify([req.stats, req.naturaleza, req.sexo, req.especieLibre, req.movimientos ?? []]);
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
