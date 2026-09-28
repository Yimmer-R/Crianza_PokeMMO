// Construye el árbol de crianza que lleva del inventario al Pokémon objetivo.
//
// La idea, que sale directa de la regla de herencia (ver src/nucleo/herencia.js):
// un cruce garantiza los 31 que COMPARTEN los dos padres, más como mucho dos
// forzados con objetos Recios. Así que para un objetivo de n IVs perfectos hacen
// falta dos padres de n-1 IVs perfectos que compartan n-2, y eso se repite hacia
// abajo hasta llegar a padres de 1×31, que son los que se capturan o se compran.
//
// Con naturaleza el cálculo cambia: la Piedraeterna ocupa uno de los dos huecos de
// objeto, así que el cruce sólo puede forzar UN IV. De ahí sale que un n×31 con
// naturaleza necesite un padre n×31 sin naturaleza y otro (n-1)×31 con ella — un
// escalón entero más de cadena. No es una decisión de diseño: es la consecuencia
// de que la naturaleza y un IV forzado no caben en el mismo cruce.
//
// El inventario se consulta en cada nodo ANTES de expandirlo: si el usuario ya
// tiene algo que cumple ese nodo, la rama se corta ahí. Por eso añadir una captura
// puede recortar media cadena, y por eso el plan se recalcula entero al tocarlo.

import { STATS, NOMBRE_STAT, IV_MAX, PRECIO_ELEGIR_SEXO, PRECIO_RESPALDO, SEXOS } from './constantes.js';
import {
  RECIO_DE, PIEDRAETERNA, perfectos, ivsGarantizados, naturalezaGarantizada, ivsVacios,
  IV_PSEUDO, pseudos, probabilidadDe, distribucionDe,
} from './herencia.js';
import {
  puedenCriar, padresCompatibles, gruposEnComun, sinGenero, esEsteril, esDitto,
  costeElegirSexo, sirveComoLineaMaterna, quienPoneLaEspecie, padresQuePasanTodos, DITTO,
} from './compatibilidad.js';
import { disponibleAhora, CUANDO_CUALQUIERA } from './cuando.js';
import { sirveLaVariante, avisosDeVariante, saleComoAlpha } from './variantes.js';

let contadorId = 0;
const nuevoId = () => `n${++contadorId}`;

/**
 * Rol de un nodo en el árbol.
 *
 * `espina` es la línea materna que cuelga de la raíz: como la cría hereda la
 * especie de la MADRE, esos huecos tienen que ser hembras de la especie objetivo
 * (o machos con un Ditto delante). Es la única cadena de nodos con la especie
 * atada.
 *
 * `libre` es todo lo demás. Ahí la especie da igual mientras comparta grupo
 * huevo, y el SEXO tampoco está fijado de antemano: cada cruce sólo necesita un
 * ♀ y un ♂, y cuál de los dos padres haga de madre es indiferente porque su cría
 * tampoco tiene la especie atada. Fijarlo por adelantado rechazaba ejemplares
 * del inventario que sí valían.
 */
export const ROL = { RAIZ: 'raiz', ESPINA: 'espina', LIBRE: 'libre' };

// ---------------------------------------------------------- validar objetivo

/**
 * Comprueba que el objetivo se pueda criar antes de intentar planearlo.
 * Devolver los problemas por adelantado evita árboles que no sirven.
 */
export function validarObjetivo(objetivo, datos) {
  const { pokedex } = datos;
  const problemas = [];
  const avisos = [];

  const p = pokedex[objetivo.especie];
  if (!p) return { valido: false, problemas: [`no conozco la especie "${objetivo.especie}"`], avisos };

  if (esEsteril(p)) problemas.push(`${objetivo.especie} está en el grupo "No cría": no hay cadena posible`);

  const base = p.base;
  if (base !== objetivo.especie)
    avisos.push(`del huevo sale ${base}; ${objetivo.especie} llega evolucionándolo después`);

  const pedidos = statsPedidos(objetivo);
  if (pedidos.length === 0 && !objetivo.naturaleza)
    avisos.push('no has pedido ningún IV a 31 ni naturaleza: no hace falta criar nada');
  if (pedidos.length === 6 && objetivo.naturaleza)
    avisos.push('6×31 con naturaleza es la cadena más larga que existe; cuenta con cientos de padres');

  // EVs
  const evs = objetivo.evs ?? {};
  const totalEv = STATS.reduce((a, s) => a + (evs[s] ?? 0), 0);
  if (totalEv > 510) problemas.push(`los EVs suman ${totalEv} y el tope es 510`);
  for (const s of STATS)
    if ((evs[s] ?? 0) > 252) problemas.push(`${s}: ${evs[s]} EVs, el tope por característica es 252`);

  // Habilidad
  if (objetivo.habilidad) {
    const h = (p.habilidades ?? []).find((x) => x.nombre === objetivo.habilidad);
    if (!h)
      problemas.push(`${objetivo.especie} no puede tener la habilidad ${objetivo.habilidad}`);
  }

  // Movimientos. Se mira la línea evolutiva entera, no sólo la forma final: el
  // huevo eclosiona en la base, así que un movimiento huevo de la base llega a
  // la evolución sin más que no sobrescribirlo.
  for (const mov of objetivo.movimientos ?? []) {
    const enLaLinea = viasEnLaLinea(objetivo.especie, mov, pokedex);
    if (!enLaLinea.length) {
      problemas.push(`${objetivo.especie} no aprende ${mov} por ninguna vía conocida`);
      continue;
    }
    if (!enLaLinea.some((v) => v.especie === objetivo.especie))
      avisos.push(
        `${mov} no está en las listas de ${objetivo.especie}: lo aprende `
        + `${enLaLinea[0].especie} y hay que llevarlo hasta arriba sin sobrescribirlo. `
        + 'Mira el orden en la pestaña Entrenamiento.',
      );
  }

  if (sinGenero(p))
    avisos.push(
      `${objetivo.especie} no tiene género: cada cruce es con otro de su misma línea evolutiva `
      + '(o con un Ditto), y no hay sexos que pagar ni que elegir',
    );

  // La especie la pone la madre, y hay siete líneas que no tienen ninguna
  // hembra. No es un caso raro de verdad —Tauros, Nidoking, Hitmonlee…— y hasta
  // ahora el plan las daba por captura imposible en vez de decir lo que pasa.
  const quien = quienPoneLaEspecie(objetivo.especie, pokedex);
  if (quien.motivo && !esEsteril(p)) avisos.push(quien.motivo);
  if (quien.candidatas.some((c) => !c.cria && c.evolucionar))
    avisos.push(
      quien.candidatas.filter((c) => !c.cria).map((c) =>
        `${c.especie} se captura pero no cría: para usarlo hay que evolucionarlo a `
        + `${c.evolucionar.especie}${c.evolucionar.condicion ? ` (${c.evolucionar.condicion})` : ''}`,
      ).join('; '),
    );

  // Alpha y variocolor: reglas que se propagan al árbol entero, y una de ellas
  // puede hacer el objetivo imposible antes de montar nada.
  const variantes = avisosDeVariante(objetivo, datos);
  problemas.push(...variantes.problemas);
  avisos.push(...variantes.avisos);

  return { valido: problemas.length === 0, problemas, avisos };
}

/** Los IVs que el usuario quiere a 31, como lista de stats. */
export function statsPedidos(objetivo) {
  const ivs = objetivo.ivs ?? {};
  return STATS.filter((s) => (ivs[s] ?? 0) >= IV_MAX);
}

/**
 * Movimientos del objetivo que SÓLO se consiguen de huevo.
 *
 * Son los que atan al padre del cruce final: tiene que saberlos él. Los que la
 * especie aprende por nivel, MT o tutor no tocan la crianza, y por eso no salen
 * de aquí.
 */
export function movimientosSoloDeHuevo(objetivo, pokedex) {
  const p = pokedex[objetivo.especie];
  if (!p) return [];
  return (objetivo.movimientos ?? []).filter((mov) => {
    const v = viasEnLaLinea(objetivo.especie, mov, pokedex);
    return v.length > 0 && v.every((x) => x.via === 'huevo');
  });
}

/**
 * Vías por las que un movimiento puede llegar, mirando la línea evolutiva
 * ENTERA y no sólo la forma final.
 *
 * Hace falta porque el huevo eclosiona en la forma base: los movimientos huevo
 * son los de la BASE, no los de la evolución. Mirando sólo la forma final, un
 * Amoonguss con Polvo Veneno salía como «no lo aprende por ninguna vía» cuando
 * es un movimiento huevo de Foongus y se consigue sin problema — se cría el
 * Foongus con él y se evoluciona después.
 *
 * Cada vía viene con la fase en la que está, que es lo que luego permite decir
 * en qué orden hacerlo (ver src/nucleo/aprendizaje.js).
 */
export function viasEnLaLinea(especie, movimiento, pokedex) {
  const out = [];
  const vistos = new Set();
  // De la forma final hacia atrás hasta la base.
  let actual = especie;
  while (actual && pokedex[actual] && !vistos.has(actual)) {
    vistos.add(actual);
    for (const v of vias(pokedex[actual], movimiento)) out.push({ ...v, especie: actual });
    actual = pokedex[actual].evoluciona?.de ?? null;
  }
  return out;
}

/** Por qué vías aprende una especie un movimiento. */
export function vias(p, movimiento) {
  const out = [];
  const nv = (p.movimientos?.nivel ?? []).find((m) => m.nombre === movimiento);
  if (nv) out.push({ via: 'nivel', detalle: `nivel ${nv.nv}` });
  if ((p.movimientos?.mt ?? []).includes(movimiento)) out.push({ via: 'mt', detalle: 'MT/MO' });
  if ((p.movimientos?.tutor ?? []).includes(movimiento)) out.push({ via: 'tutor', detalle: 'tutor de movimientos' });
  if ((p.movimientos?.huevo ?? []).includes(movimiento)) out.push({ via: 'huevo', detalle: 'movimiento huevo' });
  if ((p.movimientos?.huevoEspecial ?? []).includes(movimiento)) out.push({ via: 'huevo', detalle: 'huevo especial' });
  if ((p.movimientos?.especial ?? []).includes(movimiento)) out.push({ via: 'especial', detalle: 'movimiento especial' });
  if ((p.movimientos?.alEvolucionar ?? []).includes(movimiento)) out.push({ via: 'evolucion', detalle: 'al evolucionar' });
  if ((p.movimientos?.dePreevolucion ?? []).includes(movimiento)) out.push({ via: 'preevolucion', detalle: 'de preevolución' });
  return out;
}

// ------------------------------------------------- elegir especie de relleno

/**
 * Lo fácil que es capturar una especie donde el usuario juega, en puntos.
 *
 * No es una probabilidad: es una puntuación para ORDENAR candidatas. Suma por
 * rareza, por cuántos sitios tiene y por en cuántas regiones está, y castiga
 * fuerte lo que con la hora y la estación puestas no sale ahora mismo. Devuelve
 * -Infinity cuando la especie no vale para el hueco (no aparece en tus
 * regiones, o no puede tener el sexo que se le pide).
 *
 * `ambosSexos` es para los huecos de relleno, que necesitan ♀ y ♂; `sexo` es
 * para la espina, donde sólo hace falta uno y un ratio malo se paga en
 * intentos, no en imposibilidad.
 */
export function facilidadDeCaptura(
  especie, datos, regionesDisponibles, cuando = CUANDO_CUALQUIERA, { ambosSexos = false, sexo = null } = {},
) {
  const { pokedex, encuentros } = datos;
  const p = pokedex[especie];
  if (!p) return -Infinity;
  const regiones = new Set(regionesDisponibles);
  const enc = (encuentros[especie] ?? []).filter((e) => regiones.has(e.region));
  if (!enc.length) return -Infinity; // no se puede capturar donde juega el usuario

  // Una zona de señuelo no cuenta como sitio donde ir a cazar: hace falta un
  // consumible activo y la especie exclusiva sale en un 5 % de los encuentros.
  // Si TODO lo que tiene una especie son zonas de señuelo, no es candidata a
  // rellenar un hueco libre: hay cien especies más fáciles.
  const deSenuelo = (e) => /se[ñn]uelo/i.test(e.rareza ?? '');
  const aPie = enc.filter((e) => !deSenuelo(e));

  let puntos = 0;
  // Lo que se puede cazar con la hora y la estación que hay puestas pesa
  // mucho: de poco vale la especie más común si sólo sale en invierno.
  const ahora = aPie.filter((e) => disponibleAhora(e, cuando));
  if (!ahora.length) puntos -= 20;
  else puntos += Math.min(ahora.length, 6);
  for (const e of enc) {
    const r = (e.rareza ?? '').toLowerCase();
    if (deSenuelo(e)) puntos -= 3;
    else if (r.includes('muy común') || r.includes('muy comun')) puntos += 10;
    else if (r.includes('común') || r.includes('comun')) puntos += 8;
    else if (r.includes('horda')) puntos += 6;
    else if (r.includes('poco')) puntos += 3;
    else if (r.includes('raro')) puntos += 1;
    else puntos += 2;
  }
  puntos += Math.min(aPie.length, 8);                       // muchos sitios = fácil
  puntos += new Set(aPie.map((e) => e.region)).size * 2;    // en varias regiones = flexible

  // Un sin género se salta todo esto: no tiene sexos, y exigírselos lo
  // descartaba con -Infinity.
  if (sinGenero(p)) return puntos;
  if (ambosSexos) {
    // Los huecos de relleno necesitan macho Y hembra, así que un 50/50 vale más
    // que un 87,5/12,5 aunque sea más común.
    const min = Math.min(p.genero?.macho ?? 0, p.genero?.hembra ?? 0);
    if (min <= 0) return -Infinity;
    return puntos + min / 5;
  }
  if (sexo && sexo !== SEXOS.SIN_GENERO) {
    const ratio = sexo === SEXOS.HEMBRA ? (p.genero?.hembra ?? 0) : (p.genero?.macho ?? 0);
    if (ratio <= 0) return -Infinity;
    return puntos + ratio / 10;
  }
  return puntos;
}

/**
 * La espina materna, resuelta contra las regiones del usuario.
 *
 * Quién puede poner la especie lo dice quienPoneLaEspecie(); aquí se ordena esa
 * lista por lo fácil que es capturar cada uno donde el usuario juega. Es lo que
 * arregla el caso que se veía raro: para un Starmie el plan pedía un Starmie
 * («Señuelo», 13 sitios) cuando un Staryu («Común», 33 sitios) pone exactamente
 * el mismo huevo. Del huevo sale la forma base, así que cualquiera de la línea
 * vale.
 */
export function lineaMaterna(especieObjetivo, datos, regionesDisponibles = [], cuando = CUANDO_CUALQUIERA) {
  const quien = quienPoneLaEspecie(especieObjetivo, datos.pokedex);
  const regiones = new Set(regionesDisponibles);
  const saleAhora = (especie) => (datos.encuentros?.[especie] ?? [])
    .some((e) => regiones.has(e.region) && disponibleAhora(e, cuando));

  // El mismo orden que la vista de capturas, para que el plan y la tabla no
  // recomienden cosas distintas: primero lo que sale con la hora y la estación
  // puestas, luego el sexo menos raro —que es lo que multiplica los intentos—,
  // y ya después lo común que es. Con todo igual, antes el que ya cría que el
  // bebé al que hay que evolucionar.
  const ordenadas = quien.candidatas
    .map((c) => ({
      ...c,
      ahora: saleAhora(c.especie),
      facilidad: facilidadDeCaptura(c.especie, datos, regionesDisponibles, cuando, { sexo: quien.sexo }),
    }))
    .sort((a, b) =>
      (b.ahora === true) - (a.ahora === true)
      || b.ratio - a.ratio
      || b.facilidad - a.facilidad
      || (a.cria === b.cria ? 0 : a.cria ? -1 : 1));

  const alcanzables = ordenadas.filter((c) => Number.isFinite(c.facilidad));
  return {
    ...quien,
    candidatas: ordenadas,
    // Si ninguna de la línea aparece en tus regiones, se sugiere la propia
    // especie objetivo y el consejo de captura ya dirá que toca el GTL.
    sugerida: (alcanzables[0] ?? ordenadas[0])?.especie ?? especieObjetivo,
    especies: ordenadas.map((c) => c.especie),
  };
}

/**
 * Qué especie usar en los huecos de la línea paterna.
 *
 * Como la cría sale de la especie de la MADRE, el padre puede ser cualquier cosa
 * que comparta grupo huevo. Interesa la más fácil de conseguir: que aparezca en
 * una región disponible, en sitios comunes, y que dé machos y hembras con soltura
 * (los huecos de relleno necesitan de los dos sexos).
 */
export function elegirRelleno(especieObjetivo, datos, regionesDisponibles, cuando = CUANDO_CUALQUIERA,
  { soloAlpha = false } = {}) {
  const { pokedex, encuentros } = datos;
  const regiones = new Set(regionesDisponibles);

  // Con una especie sin género el Ditto SÍ entra: la pareja sólo puede ser su
  // propia línea evolutiva o un Ditto, y a veces el Ditto es lo fácil.
  const candidatos = padresCompatibles(especieObjetivo, pokedex, {
    incluirDitto: sinGenero(pokedex[especieObjetivo]),
  })
    .map((c) => ({
      ...c,
      facilidad: facilidadDeCaptura(c.especie, datos, regionesDisponibles, cuando, { ambosSexos: true }),
    }))
    .filter((c) => Number.isFinite(c.facilidad))
    // En una cadena Alpha el relleno también tiene que ser Alpha, así que sólo
    // valen las líneas que salen en los enjambres. Sin esto el plan proponía
    // capturar un Alpha de una especie que no existe como Alpha.
    .filter((c) => !soloAlpha || saleComoAlpha(c.especie, datos).sale)
    // Y de las que salen, primero las del enjambre de todos los días: una línea
    // que sólo sale en Halloween no es una alternativa, es esperar al año que
    // viene.
    .sort((a, b) =>
      (soloAlpha
        ? (saleComoAlpha(b.especie, datos).via === 'enjambre') - (saleComoAlpha(a.especie, datos).via === 'enjambre')
        : 0)
      || b.facilidad - a.facilidad);

  return candidatos;
}

// --------------------------------------------------------------- inventario

/**
 * ¿Cumple este ejemplar lo que pide un nodo?
 *
 * Devuelve siempre el motivo, porque el caso interesante es el que el usuario
 * describe: creía que capturaba un 31 en Velocidad y le salió en Ataque. Saber
 * POR QUÉ no encaja es lo que permite recolocarlo en otro hueco.
 */
export function cumple(ejemplar, nodo, datos, objetivo) {
  const { pokedex } = datos;
  const p = pokedex[ejemplar.especie];
  if (!p) return { ok: false, motivo: `especie desconocida: ${ejemplar.especie}` };
  if (esEsteril(p)) return { ok: false, motivo: `${ejemplar.especie} no cría` };

  if (nodo.especieFija && ejemplar.especie !== nodo.especieFija)
    return { ok: false, motivo: `este hueco tiene que ser ${nodo.especieFija}`, especieIncompatible: true };

  // Un 30 vale para un hueco de PADRE, pero no es lo mismo que un 31 y hay que
  // decirlo: la cría saldrá 30 salvo que el otro padre traiga el 31 y la suerte
  // acompañe. Se aceptan por detrás de los 31, nunca por delante.
  //
  // En la RAÍZ no: la raíz es el Pokémon que el usuario ha pedido, y dar por
  // cumplido un 6×31 con un ejemplar que tiene un 30 es decirle que ya está
  // cuando no está. Si la cadena acaba entregando un 30 ahí, se dice aparte
  // (plan.ivsCortos), que no es lo mismo.
  const suyos = perfectos(ejemplar.ivs ?? {});
  const casi = nodo.rol === ROL.RAIZ ? new Set() : pseudos(ejemplar.ivs ?? {});
  const faltan = nodo.stats.filter((s) => !suyos.has(s) && !casi.has(s));
  if (faltan.length)
    return { ok: false, motivo: `le falta 31 en ${faltan.join(', ')}`, faltanIvs: faltan };
  const conPseudo = nodo.stats.filter((s) => casi.has(s));

  // Un hueco puede exigir movimientos: es el padre del cruce final cuando el
  // objetivo lleva un movimiento que sólo se pasa de huevo.
  const movsPedidos = nodo.movimientosNecesarios ?? [];
  if (movsPedidos.length) {
    const sabe = new Set(ejemplar.movimientos ?? []);
    const faltanMovs = movsPedidos.filter((m) => !sabe.has(m));
    if (faltanMovs.length)
      return {
        ok: false,
        motivo: `este hueco tiene que pasar ${faltanMovs.join(', ')} y no lo sabe`,
        faltanMovimientos: faltanMovs,
      };
  }

  // La variante manda sobre todo lo demás y por eso va antes de los IVs: un
  // shiny metido en una cadena normal no cría peor, es que NO CRÍA, y un Alpha
  // cruzado con un normal da una cría normal — el árbol entero se cae.
  const variante = sirveLaVariante(ejemplar, objetivo);
  if (!variante.ok) return { ok: false, motivo: variante.motivo, varianteIncorrecta: true };

  if (nodo.naturaleza && ejemplar.naturaleza !== objetivo.naturaleza)
    return {
      ok: false,
      motivo: `este hueco pide naturaleza ${objetivo.naturaleza} y es ${ejemplar.naturaleza ?? 'sin anotar'}`,
      faltanNaturaleza: true,
    };

  // Un hueco puede traer el sexo atado: el de la espina es hembra por
  // definición, y su pareja en ese mismo cruce tiene que ser macho. Los huecos
  // de dentro de una rama libre lo traen a null y ahí sí da igual.
  const sexoAtado = nodo.rol === ROL.RAIZ ? (objetivo.sexo ?? null) : (nodo.sexoNecesario ?? null);
  if (sexoAtado && ejemplar.sexo !== sexoAtado && !esDitto(ejemplar.especie))
    return {
      ok: false,
      motivo: `este hueco pide ${sexoAtado} y es ${ejemplar.sexo}`,
      sexoIncorrecto: true,
    };

  // Un 30 en un hueco no lo invalida, pero sí cambia lo que promete el cruce
  // de encima: se anota para que el plan y el aviso lo digan.
  const conSuerte = conPseudo.length
    ? { pseudo: conPseudo, aviso: `aporta 30 en ${conPseudo.map((x) => NOMBRE_STAT[x]).join(', ')}, no 31` }
    : {};

  // Espina materna: la especie la pone la madre, así que aquí no hay flexibilidad.
  if (nodo.rol === ROL.ESPINA || nodo.rol === ROL.RAIZ) {
    const r = sirveComoLineaMaterna(ejemplar, objetivo.especie, pokedex);
    if (!r.sirve) return { ok: false, motivo: r.motivo, especieIncompatible: true };
    if (r.necesitaDitto)
      return { ok: true, ...conSuerte, necesitaDitto: true, aviso: [r.motivo, conSuerte.aviso].filter(Boolean).join('; ') };
    return { ok: true, ...conSuerte };
  }

  // Hueco libre: cualquier especie que comparta grupo huevo, de cualquiera de los
  // dos sexos. El sexo se reparte después, al emparejar: lo único que pide el
  // juego es un ♀ y un ♂ por cruce.
  if (esDitto(ejemplar.especie)) return { ok: true, ...conSuerte, via: 'ditto' };
  if (sinGenero(p)) return { ok: false, motivo: `${ejemplar.especie} no tiene género: sólo vale como Ditto` };
  const comunes = gruposEnComun(pokedex[objetivo.especie], p);
  if (!comunes.length)
    return { ok: false, motivo: `no comparte grupo huevo con ${objetivo.especie}`, especieIncompatible: true };
  return { ok: true, ...conSuerte, gruposEnComun: comunes };
}

// ------------------------------------------------------------- el árbol

/**
 * Orden en que se fuerzan los IVs con objetos.
 *
 * El IV que NO se fuerza en un cruce es el que los dos padres tienen que
 * compartir, así que acaba repetido más veces abajo en el árbol. Conviene que el
 * repetido sea el fácil de conseguir: se fuerzan primero los escasos.
 */
function ordenarPorEscasez(stats, inventario) {
  const disponibles = (stat) =>
    inventario.filter((e) => perfectos(e.ivs ?? {}).has(stat)).length;
  return [...stats].sort((a, b) => disponibles(a) - disponibles(b) || STATS.indexOf(a) - STATS.indexOf(b));
}

/**
 * Y por qué el ORDEN de los IVs no se busca probando, aunque sea el otro eje
 * del árbol.
 *
 * Qué IV se fuerza con un Recio y cuál queda COMPARTIDO decide la forma de
 * media rama, así que parece un candidato obvio a probar como se prueba el
 * reparto de la Piedraeterna. Se implementó, se midió y se quitó: en 26.000
 * inventarios al azar —de 2 a 9 ejemplares, con 31 y con 30, ocho especies,
 * cuatro naturalezas, objetivos de 2 a 6 IVs con y sin naturaleza— forzar un IV
 * distinto al que dice `ordenarPorEscasez()` no mejoró el plan **ni una vez**,
 * y multiplicaba por dos o por tres el coste de cada recálculo.
 *
 * Y tiene sentido: el IV compartido tiene que estar a 31 en los DOS padres, así
 * que lo que conviene compartir es el que más abunda en el inventario — que es
 * exactamente lo que deja al final `ordenarPorEscasez()` al ordenar de escaso a
 * abundante. La heurística no es una aproximación: es la respuesta.
 *
 * Si alguien vuelve a plantearlo, la prueba que fija esto se llama «comparte el
 * IV que más abunda en el inventario».
 */

/**
 * Las tres formas de repartir la Piedraeterna que se prueban.
 *
 * `padre` es la de siempre (la cadena de naturaleza va libre). `raiz` la pone
 * en la madre SÓLO en el cruce final, que es donde entra un macho del
 * inventario con todos los 31. `madre` la pone en la madre en toda la cadena.
 */
export const MODOS_PIEDRA = ['padre', 'raiz', 'madre'];

/** ¿Lleva la madre la Piedraeterna en este cruce, según el modo del plan? */
function piedraEnLaMadre(nodo, ctx) {
  const modo = ctx.modoPiedra ?? 'padre';
  if (modo === 'madre') return true;
  if (modo === 'raiz') return nodo.rol === ROL.RAIZ;
  return false;
}

function construir(nodoPedido, ctx, profundidad = 0) {
  const nodo = {
    id: nuevoId(),
    stats: [...nodoPedido.stats],
    naturaleza: !!nodoPedido.naturaleza,
    rol: nodoPedido.rol,
    profundidad,
    objeto: nodoPedido.objeto ?? null,
    // null = todavía sin decidir; se rellena en asignarSexos() una vez se sabe
    // qué ha puesto el inventario en cada hueco.
    sexoNecesario: nodoPedido.sexoNecesario ?? null,
    // Sólo lo lleva el hueco del Ditto de una línea sin hembras.
    especieFija: nodoPedido.especieFija ?? null,
    hijos: [],
  };

  // Un Ditto no se puede criar de ninguna manera, así que su hueco nunca se
  // abre en un cruce por muchos 31 que pida: se captura o se compra.
  if (nodoPedido.hoja) {
    nodo.tipo = 'conseguir';
    return nodo;
  }

  // Hoja: un solo IV a 31, o sólo la naturaleza. Eso se captura o se compra.
  // El inventario NO se consulta aquí: se empareja después, sobre el árbol
  // entero, porque decidirlo nodo a nodo en preorden gasta un 3×31 en la primera
  // hoja de 1×31 que aparece en vez de en el hueco grande que hay más allá.
  const n = nodo.stats.length;
  if ((n <= 1 && !nodo.naturaleza) || (n === 0 && nodo.naturaleza)) {
    nodo.tipo = 'conseguir';
    return nodo;
  }

  // 3. Cruce. El reparto de IVs entre los dos padres es la regla de herencia.
  const orden = ordenarPorEscasez(nodo.stats, ctx.inventarioOriginal);

  if (nodo.naturaleza) {
    const [hijoA, hijoB] = restriccionesDeLosHijos(nodo.rol, ctx.espina);

    // La naturaleza sólo la pasa la Piedraeterna, y ocupa el hueco de objeto de
    // quien la lleva: el cruce se queda con un solo Recio, así que sólo fuerza un
    // IV y el otro padre tiene que traer YA todos los pedidos.
    //
    // Dos padres con la misma naturaleza NO la transmiten, por mucho que con los
    // IVs sí funcione. Ver naturalezaGarantizada() en herencia.js.
    const forzado = orden[0];
    const resto = nodo.stats.filter((st) => st !== forzado);

    nodo.tipo = 'cruce';
    // ¿Quién lleva la Piedraeterna, la madre o el padre? Da igual para la
    // mecánica —pasa la naturaleza de quien la tenga puesta— pero cambia el
    // árbol entero, y no hay una respuesta buena siempre:
    //
    //   - en el PADRE, la cadena de naturaleza cuelga de un hueco LIBRE:
    //     cualquier especie, cualquier sexo. Es lo mejor partiendo de cero,
    //     porque las capturas de esa rama son fáciles;
    //   - en la MADRE, la cadena de naturaleza cae en la espina (especie
    //     objetivo, hembra), pero entonces el PADRE es el que tiene que traer
    //     todos los IVs. Y eso es lo mejor cuando ya tienes un macho cargado de
    //     31 de cualquier especie: entra tal cual y te ahorra su rama entera.
    //
    // Así que no se elige a ciegas: `planear()` monta el árbol de las dos
    // formas y se queda con la que menos capturas pida contra tu inventario.
    // Ver planear() y `MODOS_PIEDRA`.
    const enLaMadre = piedraEnLaMadre(nodo, ctx);
    const conLaPiedra = enLaMadre ? 'la madre' : 'el padre';
    nodo.objetos = enLaMadre
      ? { madre: PIEDRAETERNA, padre: RECIO_DE[forzado] }
      : { madre: RECIO_DE[forzado], padre: PIEDRAETERNA };
    nodo.forzados = [forzado];
    nodo.compartidos = resto;
    nodo.piedraEnLaMadre = enLaMadre;
    nodo.explicacion =
      `La Piedraeterna la lleva ${conLaPiedra} y ocupa su hueco, así que sólo se fuerza `
      + `${NOMBRE_STAT[forzado]}, con el ${RECIO_DE[forzado]} de ${enLaMadre ? 'el padre' : 'la madre'}.`
      + (resto.length
        ? ` ${resto.map((st) => NOMBRE_STAT[st]).join(', ')} tiene${resto.length > 1 ? 'n' : ''} que venir a 31 en los dos.`
        : '');

    // El que NO lleva la Piedraeterna carga con todos los IVs: el forzado,
    // porque lleva el Recio, y los compartidos, porque tienen que estar en los
    // dos. El que la lleva sólo necesita los compartidos y la naturaleza.
    const deLaPiedra = { stats: resto, naturaleza: true, objeto: PIEDRAETERNA };
    const delRecio = { stats: nodo.stats, naturaleza: false, objeto: RECIO_DE[forzado] };
    nodo.hijos = [
      construir({ ...(enLaMadre ? deLaPiedra : delRecio), ...hijoA }, ctx, profundidad + 1),
      construir({ ...(enLaMadre ? delRecio : deLaPiedra), ...hijoB }, ctx, profundidad + 1),
    ];
    return nodo;
  }

  const [f1, f2] = orden;
  const compartidos = nodo.stats.filter((s) => s !== f1 && s !== f2);
  nodo.tipo = 'cruce';
  nodo.objetos = { madre: RECIO_DE[f1], padre: RECIO_DE[f2] };
  nodo.forzados = [f1, f2];
  nodo.compartidos = compartidos;
  nodo.explicacion =
    `Se fuerzan ${NOMBRE_STAT[f1]} y ${NOMBRE_STAT[f2]} con un Recio en cada padre.`
    + (compartidos.length
      ? ` ${compartidos.map((s) => NOMBRE_STAT[s]).join(', ')} sale${compartidos.length > 1 ? 'n' : ''} solo${compartidos.length > 1 ? 's' : ''}: los dos padres lo${compartidos.length > 1 ? 's' : ''} tienen a 31.`
      : '');

  const [hijoA, hijoB] = restriccionesDeLosHijos(nodo.rol, ctx.espina);
  nodo.hijos = [
    construir({ stats: [...compartidos, f1], naturaleza: false, objeto: RECIO_DE[f1], ...hijoA }, ctx, profundidad + 1),
    construir({ stats: [...compartidos, f2], naturaleza: false, objeto: RECIO_DE[f2], ...hijoB }, ctx, profundidad + 1),
  ];
  return nodo;
}

/**
 * Rol y sexo de los dos hijos de un cruce.
 *
 * En un cruce de la espina la reparto está decidido de antemano: la madre es de
 * la especie objetivo y hembra, y su pareja macho. Los dos tienen que quedar
 * fijados ANTES de mirar el inventario, porque si no se emparejan ejemplares en
 * huecos cuyo sexo luego resulta imposible.
 *
 * En un cruce libre los dos van sin sexo (null) y lo reparte asignarSexos()
 * después, respetando el de lo que haya colocado el inventario.
 */
function restriccionesDeLosHijos(rolDelCruce, espina) {
  const enLaEspina = rolDelCruce === ROL.RAIZ || rolDelCruce === ROL.ESPINA;

  // Sin género no hay sexos que repartir: cada cruce es la especie con su misma
  // línea evolutiva o con un Ditto, y ninguno de los dos huecos pide sexo.
  // Pedir ♀ y ♂ aquí dejaba el plan con capturas imposibles (1 de cada 0).
  if (espina.sexo === SEXOS.SIN_GENERO)
    return enLaEspina
      ? [{ rol: ROL.ESPINA, sexoNecesario: SEXOS.SIN_GENERO },
         { rol: ROL.LIBRE, sexoNecesario: SEXOS.SIN_GENERO }]
      : [{ rol: ROL.LIBRE, sexoNecesario: SEXOS.SIN_GENERO },
         { rol: ROL.LIBRE, sexoNecesario: SEXOS.SIN_GENERO }];

  // Una línea sin hembras (Nidoking, Tauros, Hitmonlee…) sólo pasa su especie
  // con un macho y un Ditto. Y el Ditto no es un hueco libre cualquiera: no se
  // puede criar, así que su rama no se abre en más cruces — va a captura o al
  // GTL con los IVs ya puestos. Antes esto salía como «captura imposible».
  if (espina.conDitto)
    return [
      { rol: ROL.ESPINA, sexoNecesario: SEXOS.MACHO },
      { rol: ROL.LIBRE, sexoNecesario: SEXOS.SIN_GENERO, especieFija: DITTO, hoja: true },
    ];

  return enLaEspina
    ? [{ rol: ROL.ESPINA, sexoNecesario: SEXOS.HEMBRA }, { rol: ROL.LIBRE, sexoNecesario: SEXOS.MACHO }]
    : [{ rol: ROL.LIBRE, sexoNecesario: null }, { rol: ROL.LIBRE, sexoNecesario: null }];
}

/**
 * Alarga la espina por abajo para poder usar una hembra que SÓLO aporta la especie.
 *
 * El caso, que es el del usuario: tienes una hembra de la especie objetivo con
 * los IVs que sea —una captura difícil que costó encontrar— y el plan la ignora,
 * porque el hueco de abajo de la espina pide esa especie **y** un 31 concreto.
 *
 * Pero la especie la pone la madre y nada más: si esa hembra se cruza con un
 * macho libre que traiga el 31 (o la naturaleza) en su objeto, la cría sale de
 * la especie objetivo **y** con lo que pedía el hueco. Se cambia una captura
 * difícil (especie concreta + sexo + 31) por una fácil (cualquier especie del
 * grupo huevo + 31) más un cruce.
 *
 * Sólo cabe una cosa en el objeto del padre, así que esto vale mientras al hueco
 * le falte un único requisito. Al hueco de abajo de la espina siempre le falta
 * exactamente uno: un 31, o la naturaleza.
 *
 * Se llama DESPUÉS de colocar el inventario y mira sólo lo que ha SOBRADO. Una
 * hembra de la especie que además trae la naturaleza o un 31 ya habrá caído en
 * un hueco donde eso cuenta; gastarla aquí sería tirar lo que aporta. Y si no
 * sobra ninguna hembra de la línea, no se alarga nada: sería un cruce regalado.
 */
export function extenderEspinaPorEspecie(arbol, ctx) {
  const { datos, objetivo, inventarioLibre } = ctx;

  // El hueco de abajo de la espina, si es que sigue sin cubrir: el único
  // 'conseguir' con la especie atada.
  let hoja = null;
  (function recorre(n) {
    if (n.tipo === 'conseguir' && (n.rol === ROL.ESPINA || n.rol === ROL.RAIZ)) hoja = n;
    n.hijos.forEach(recorre);
  })(arbol);
  if (!hoja) return { arbol, alargada: false };

  // Un objeto, un requisito.
  const pide = hoja.stats.length + (hoja.naturaleza ? 1 : 0);
  if (pide !== 1) return { arbol, alargada: false };

  // ¿Ha sobrado alguna hembra de la línea que el plan esté tirando a la basura?
  const soloEspecie = inventarioLibre.filter((e) =>
    sirveComoLineaMaterna(e, objetivo.especie, datos.pokedex).sirve
    && !cumple(e, hoja, datos, objetivo).ok);
  if (!soloEspecie.length) return { arbol, alargada: false };

  const objetoDelPadre = hoja.naturaleza ? PIEDRAETERNA : RECIO_DE[hoja.stats[0]];
  const loQueTrae = hoja.naturaleza
    ? `la naturaleza ${objetivo.naturaleza}`
    : `31 en ${NOMBRE_STAT[hoja.stats[0]]}`;

  const madre = {
    id: nuevoId(),
    tipo: 'conseguir',
    stats: [],
    naturaleza: false,
    rol: ROL.ESPINA,
    profundidad: hoja.profundidad + 1,
    objeto: null,
    sexoNecesario: SEXOS.HEMBRA,
    soloEspecie: true,
    hijos: [],
  };
  const padre = {
    id: nuevoId(),
    tipo: 'conseguir',
    stats: [...hoja.stats],
    naturaleza: hoja.naturaleza,
    rol: ROL.LIBRE,
    profundidad: hoja.profundidad + 1,
    objeto: objetoDelPadre,
    sexoNecesario: SEXOS.MACHO,
    movimientosNecesarios: hoja.movimientosNecesarios ?? [],
    hijos: [],
  };

  hoja.tipo = 'cruce';
  hoja.objetos = { madre: null, padre: objetoDelPadre };
  hoja.forzados = hoja.naturaleza ? [] : [hoja.stats[0]];
  hoja.compartidos = [];
  hoja.alargadaPorEspecie = true;
  hoja.explicacion =
    `La especie la pone la madre y nada más, así que aquí basta una hembra de ` +
    `${objetivo.especie} aunque no tenga nada: el padre trae ${loQueTrae} con su ` +
    `${objetoDelPadre}. Sale más barato que cazar una hembra de ${objetivo.especie} ` +
    `que además cumpla.`;
  hoja.hijos = [madre, padre];
  delete hoja.movimientosNecesarios;

  return { arbol, alargada: true };
}

/**
 * Cambia una captura difícil por un cruce cuando **el sexo es lo único que falla**.
 *
 * El caso, que es el del usuario: el plan pide «1×31 en Velocidad ♀» y en el
 * inventario hay un Horsea ♂ con 31 en Velocidad. Los IVs valen, la especie da
 * igual porque el hueco es libre… y el ejemplar se queda en la caja mirando,
 * porque el sexo no se puede cambiar. Antes eso salía como «este plan no lo
 * usa» sin más, y desde fuera parecía que el plan no se enteraba.
 *
 * Pero el sexo de una CRÍA sí se elige, pagando en la guardería (desde 5.000
 * PokéYen). Así que el hueco se convierte en un cruce:
 *
 *   [1×31 (Velocidad) ♀]  →        cruce · se paga la cría ♀
 *                            ┌──────────┴──────────┐
 *                    cualquiera ♀            tu ♂ con el 31
 *                     (captura fácil)        + Franja Recia
 *
 * El Recio del ejemplar fuerza su propio 31, así que la cría lo saca garantizado
 * y el otro padre no tiene que aportar nada: vale cualquier captura del grupo
 * huevo, que es 1 de cada 2 encuentros en vez de 1 de cada 64.
 *
 * Sólo se hace en huecos LIBRES (en la espina la especie ata a la madre y de eso
 * se encarga extenderEspinaPorEspecie), sólo con lo que ha SOBRADO del
 * inventario —si el ejemplar tiene un hueco mejor, que se vaya a él— y sólo
 * cuando al hueco le falta un único requisito, que por construcción es siempre
 * el caso de una hoja: un 31, o la naturaleza.
 */
export function extenderPorSexo(arbol, ctx) {
  const { datos, objetivo, inventarioLibre } = ctx;
  if (!inventarioLibre.length) return { arbol, alargada: false };

  const opuesto = (s) => (s === SEXOS.HEMBRA ? SEXOS.MACHO : SEXOS.HEMBRA);
  let alargada = false;
  // Un ejemplar no puede montar dos cruces a la vez: lo que se gasta aquí se
  // aparta, porque si no dos huecos se apuntaban el mismo y uno se quedaba con
  // un cruce vacío.
  const apartados = new Set();

  (function recorre(nodo) {
    for (const h of [...nodo.hijos]) recorre(h);
    if (nodo.tipo !== 'conseguir' || nodo.rol !== ROL.LIBRE) return;
    if (!SEXO_CONCRETO(nodo.sexoNecesario)) return;
    // Un objeto, un requisito: es lo que cabe en el cruce.
    if (nodo.stats.length + (nodo.naturaleza ? 1 : 0) !== 1) return;

    // ¿Sobra alguno al que sólo le falle el sexo? Se prueba el mismo hueco con
    // su sexo, que es la única diferencia que se le perdona.
    const valen = inventarioLibre
      .map((e, i) => ({ e, i }))
      .filter(({ e, i }) =>
        !apartados.has(i)
        && SEXO_CONCRETO(e.sexo)
        && e.sexo !== nodo.sexoNecesario
        && cumple(e, { ...nodo, sexoNecesario: e.sexo }, datos, objetivo).ok)
      // El que menos 31 desperdicia, igual que en asignarInventario(): así el
      // que se gasta aquí es el mismo que luego elige el reparto.
      .sort((a, b) => perfectos(a.e.ivs ?? {}).size - perfectos(b.e.ivs ?? {}).size);
    if (!valen.length) return;

    const { e: suyo, i } = valen[0];
    apartados.add(i);
    const forzador = nodo.naturaleza ? PIEDRAETERNA : RECIO_DE[nodo.stats[0]];
    const loQueTrae = nodo.naturaleza
      ? `la naturaleza ${objetivo.naturaleza}`
      : `el 31 en ${NOMBRE_STAT[nodo.stats[0]]}`;

    const conElIv = {
      id: nuevoId(),
      tipo: 'conseguir',
      stats: [...nodo.stats],
      naturaleza: nodo.naturaleza,
      rol: ROL.LIBRE,
      profundidad: nodo.profundidad + 1,
      objeto: forzador,
      sexoNecesario: suyo.sexo,
      movimientosNecesarios: nodo.movimientosNecesarios ?? [],
      hijos: [],
    };
    const pareja = {
      id: nuevoId(),
      tipo: 'conseguir',
      stats: [],
      naturaleza: false,
      rol: ROL.LIBRE,
      profundidad: nodo.profundidad + 1,
      objeto: null,
      sexoNecesario: opuesto(suyo.sexo),
      soloSexo: true,
      hijos: [],
    };

    // hijos[0] es la madre y hijos[1] el padre: lo da por hecho criaDe().
    const madreEsElSuyo = suyo.sexo === SEXOS.HEMBRA;
    nodo.tipo = 'cruce';
    nodo.hijos = madreEsElSuyo ? [conElIv, pareja] : [pareja, conElIv];
    nodo.objetos = madreEsElSuyo ? { madre: forzador, padre: null } : { madre: null, padre: forzador };
    nodo.forzados = nodo.naturaleza ? [] : [nodo.stats[0]];
    nodo.compartidos = [];
    nodo.alargadaPorSexo = true;
    nodo.explicacion =
      `Tu ${suyo.especie} ${suyo.sexo} trae ${loQueTrae}, pero este hueco pide `
      + `${nodo.sexoNecesario} y el sexo no se cambia. El de una cría sí: se cruza con `
      + `cualquiera del grupo huevo y se paga por que salga ${nodo.sexoNecesario}. `
      + `${forzador} en tu ${suyo.especie} fuerza ${loQueTrae}, así que el otro padre no `
      + 'tiene que aportar nada — y una captura sin pedir IVs es muchísimo más fácil que '
      + 'una que los pida.';
    delete nodo.movimientosNecesarios;
    alargada = true;
  })(arbol);

  return { arbol, alargada };
}

/** Cuántas capturas cuelgan de un nodo: es lo que se ahorra si el inventario lo cubre. */
/**
 * La raíz cuando lo único que obliga a criar es un movimiento huevo.
 *
 * Un objetivo pequeño —1×31, o ni eso— se captura de una pieza y `construir()`
 * lo deja como hoja, con razón. Pero un movimiento huevo **sólo entra por un
 * huevo**: si se pide uno, hay que criar aunque no se pida ni un 31. Sin esto el
 * plan de «Milotic con Neblina y 31 en PS» era «captura un Feebas con 31 en PS»
 * y la cría nacía sin el movimiento.
 *
 * El cruce es el mínimo que hace falta: la madre pone la especie y el IV —con su
 * Recio, que lo fuerza— y el padre pone el movimiento y nada más.
 */
function raizParaMovimientoHuevo(pedidos, ctx, movsHuevo) {
  const [hijoA, hijoB] = restriccionesDeLosHijos(ROL.RAIZ, ctx.espina);
  const forzado = pedidos[0] ?? null;
  const nodo = {
    id: nuevoId(),
    stats: [...pedidos],
    naturaleza: false,
    rol: ROL.RAIZ,
    profundidad: 0,
    objeto: null,
    sexoNecesario: null,
    especieFija: null,
    tipo: 'cruce',
    objetos: { madre: forzado ? RECIO_DE[forzado] : null, padre: null },
    forzados: forzado ? [forzado] : [],
    compartidos: [],
    explicacion: `${movsHuevo.join(' y ')} sólo entra${movsHuevo.length > 1 ? 'n' : ''} por un huevo, `
      + 'así que hay que criar aunque el resto se pudiera capturar. '
      + (forzado ? `${NOMBRE_STAT[forzado]} lo fuerza la madre con su ${RECIO_DE[forzado]}.` : ''),
    hijos: [],
  };
  nodo.hijos = [
    construir({
      stats: forzado ? [forzado] : [],
      naturaleza: false,
      objeto: forzado ? RECIO_DE[forzado] : null,
      ...hijoA,
    }, ctx, 1),
    construir({ stats: [], naturaleza: false, ...hijoB }, ctx, 1),
  ];
  nodo.hijos[1].movimientosNecesarios = [...movsHuevo];
  return nodo;
}

/**
 * Baja un movimiento huevo por la rama paterna hasta una HOJA.
 *
 * Un movimiento huevo lo pasa el **padre**, y en un árbol de crianza el padre
 * del cruce final casi nunca se captura: es a su vez una cría. Entonces quien
 * tiene que saber el movimiento es el padre de ESE cruce, y así hasta abajo —
 * hasta un hueco que se captura o se compra, que es el único sitio donde el
 * movimiento puede entrar de verdad.
 *
 * Sin esto la marca se quedaba en un nodo de tipo `cruce` y no la miraba nadie:
 * `cumple()` sólo la comprueba al colocar un ejemplar y `loQueFalta()` sólo la
 * enseña en los huecos por conseguir. El plan de un Milotic con Neblina salía
 * con cuatro capturas y ninguna pedía el movimiento — se hacían los siete pasos
 * y la cría nacía sin él.
 *
 * El macho del cruce se elige aquí y se deja marcado; `asignarSexos()` respeta
 * los sexos ya puestos y le da a su pareja el contrario, así que no hay pelea.
 *
 * Con una espina sin machos (sin género, o línea que sólo cría con Ditto) no hay
 * padre que lo pase: se devuelve en `sinPadre` y el plan lo dice en vez de
 * prometer un movimiento que no va a llegar.
 */
export function bajarMovimientosHuevo(arbol) {
  const sinPadre = [];

  (function recorre(nodo) {
    const movs = nodo.movimientosNecesarios ?? [];
    if (movs.length && nodo.tipo === 'cruce') {
      // El macho del cruce: el que ya venga marcado, o el segundo hijo, que es
      // al que asignarSexos() le daría ♂ por defecto.
      const yaMacho = nodo.hijos.find((h) => h.sexoNecesario === SEXOS.MACHO);
      const libre = nodo.hijos.find((h) => !h.sexoNecesario);
      const macho = yaMacho ?? libre;
      if (!macho) {
        sinPadre.push(...movs);
      } else {
        macho.sexoNecesario = SEXOS.MACHO;
        macho.movimientosNecesarios = [...new Set([...(macho.movimientosNecesarios ?? []), ...movs])];
        // Deja de pedírselo al cruce: lo pide su padre, que es quien lo pasa.
        nodo.movimientosNecesarios = [];
      }
    }
    nodo.hijos.forEach(recorre);
  })(arbol);

  return { sinPadre: [...new Set(sinPadre)] };
}

export function hojasBajo(nodo) {
  if (nodo.tipo === 'conseguir') return 1;
  if (nodo.tipo === 'inventario') return 0;
  return nodo.hijos.reduce((a, h) => a + hojasBajo(h), 0);
}

const SEXO_CONCRETO = (s) => s === SEXOS.HEMBRA || s === SEXOS.MACHO;

/**
 * Un cruce necesita un ♀ y un ♂. Si el hermano ya tiene sexo puesto —porque lo
 * traía atado o porque lo ocupa otro ejemplar del inventario— este hueco no
 * puede repetirlo.
 */
function sexoCompatibleConHermano(nodo, padre, ejemplar, pokedex) {
  if (!padre) return true;
  if (esDitto(ejemplar.especie) || sinGenero(pokedex[ejemplar.especie])) return true;
  if (!SEXO_CONCRETO(ejemplar.sexo)) return true;
  const hermano = padre.hijos.find((h) => h !== nodo);
  if (!hermano) return true;
  const suyo = hermano.tipo === 'inventario' ? hermano.ejemplar.sexo : hermano.sexoNecesario;
  if (esDitto(hermano.ejemplar?.especie)) return true;
  return !SEXO_CONCRETO(suyo) || suyo !== ejemplar.sexo;
}

/**
 * Cuántos IVs que NADIE pidió comparte este ejemplar con su pareja de cruce.
 *
 * Es el único sitio donde un IV de regalo se puede conservar **gratis**: un
 * cruce garantiza los 31 que tienen los DOS padres, así que si el hermano de
 * este hueco ya está ocupado por alguien con 31 en Defensa y este candidato
 * también lo trae, la Defensa sale garantizada sin gastar ni un objeto ni un
 * cruce de más. No fuerza nada: sólo desempata entre candidatos que ya costaban
 * lo mismo. Ver nucleo/regalos.js para lo que cuesta cuando NO sale gratis.
 */
function regalosQueComparteConElHermano(nodo, padre, ejemplar, pedidos) {
  if (!padre) return 0;
  const hermano = padre.hijos.find((h) => h !== nodo);
  if (hermano?.tipo !== 'inventario') return 0;
  const suyos = perfectos(ejemplar.ivs ?? {});
  const delHermano = perfectos(hermano.ejemplar?.ivs ?? {});
  return [...suyos].filter((st) => !pedidos.includes(st) && delHermano.has(st)).length;
}

/**
 * Coloca el inventario sobre el árbol ya construido.
 *
 * Se elige siempre la pareja (ejemplar, hueco) que más capturas ahorra, no la
 * primera que encaja: un 3×31 puesto en un hueco de 3×31 borra siete nodos del
 * árbol, y puesto en una hoja de 1×31 no ahorra nada. A igualdad de ahorro gana
 * el ejemplar más justo, para no quemar un 5×31 donde valía un 2×31.
 *
 * Los padres se consumen al criar, así que cada ejemplar se coloca una sola vez.
 */
export function asignarInventario(arbol, ctx) {
  const { datos, objetivo, inventarioLibre } = ctx;
  const pedidos = statsPedidos(objetivo);

  for (;;) {
    if (!inventarioLibre.length) break;

    const candidatos = [];
    (function recorre(nodo, padre) {
      if (nodo.tipo === 'inventario') return; // ya ocupado: no se mira dentro
      for (const [i, e] of inventarioLibre.entries()) {
        const r = cumple(e, nodo, datos, objetivo);
        if (!r.ok) continue;
        if (!sexoCompatibleConHermano(nodo, padre, e, datos.pokedex)) continue;
        candidatos.push({
          nodo, i, e, r,
          ahorro: hojasBajo(nodo),
          perfectos: perfectos(e.ivs ?? {}).size,
          // Cuántos de los IVs que pide el hueco los cubre con un 30 en vez de
          // con un 31. Cuantos menos, mejor.
          pseudo: (r.pseudo ?? []).length,
          regalosCompartidos: regalosQueComparteConElHermano(nodo, padre, e, pedidos),
        });
      }
      for (const h of nodo.hijos) recorre(h, nodo);
    })(arbol, null);

    if (!candidatos.length) break;

    // Primero el que tapa más árbol; después, a igualdad, el que lo hace con
    // 31 de verdad —los 30 sólo cuando no hay otra cosa, que es la regla— y ya
    // por último el que menos 31 desperdicia en un hueco pequeño.
    //
    // Y sólo cuando todo lo anterior empata, el que comparte con su pareja algún
    // 31 que el objetivo no pedía: eso lo regala el cruce sin coste. Va el
    // ÚLTIMO a propósito — por delante de él está `perfectos`, que es lo que
    // evita quemar un 3×31 en un hueco de 1×31, y conservar un regalo nunca
    // vale eso.
    candidatos.sort((a, b) => b.ahorro - a.ahorro
      || a.pseudo - b.pseudo
      || a.perfectos - b.perfectos
      || b.regalosCompartidos - a.regalosCompartidos);
    const mejor = candidatos[0];

    mejor.nodo.tipo = 'inventario';
    mejor.nodo.ejemplar = mejor.e;
    mejor.nodo.hijos = [];
    mejor.nodo.necesitaDitto = !!mejor.r.necesitaDitto;
    if (mejor.r.aviso) mejor.nodo.aviso = mejor.r.aviso;
    if (SEXO_CONCRETO(mejor.e.sexo)) mejor.nodo.sexoNecesario = mejor.e.sexo;
    else if (esDitto(mejor.e.especie)) mejor.nodo.sexoNecesario = SEXOS.SIN_GENERO;

    inventarioLibre.splice(mejor.i, 1);
  }

  return arbol;
}

/**
 * Reparte sexos: cada cruce necesita un ♀ y un ♂.
 *
 * En la espina la madre está decidida (es la de la especie objetivo). En un cruce
 * libre se respeta el sexo de lo que ya haya puesto el inventario y el otro hueco
 * se queda con el contrario; si ninguno viene del inventario, se reparte ♀/♂ por
 * defecto.
 */
export function asignarSexos(arbol, objetivo, espina = null) {
  // Las líneas sin hembras van igual: la espina es macho y su pareja un Ditto,
  // los dos decididos al construir el árbol.
  const yaRepartidos = espina?.sexo === SEXOS.SIN_GENERO || espina?.conDitto === true;
  // Sin género: los huecos ya vienen marcados desde la construcción y no hay
  // ♀/♂ que repartir. Repartirlos pondría un sexo que la especie no tiene.
  if (yaRepartidos) {
    arbol.sexoNecesario = espina.sexo;
    return arbol;
  }
  arbol.sexoNecesario = objetivo.sexo ?? null;
  const opuesto = (s) => (s === SEXOS.HEMBRA ? SEXOS.MACHO : SEXOS.HEMBRA);

  (function recorre(nodo) {
    if (nodo.tipo === 'cruce') {
      const [a, b] = nodo.hijos;
      // Los cruces de la espina vienen ya repartidos desde la construcción.
      // Con un Ditto en el cruce el sexo del otro da igual: cría con cualquiera.
      if (a.sexoNecesario === SEXOS.SIN_GENERO || b.sexoNecesario === SEXOS.SIN_GENERO) {
        // nada que repartir
      } else if (!a.sexoNecesario && !b.sexoNecesario) {
        // Un ejemplar del inventario trae su sexo puesto: manda él, y su pareja
        // se queda con el contrario.
        const conSexo = [a, b].find(
          (h) => h.tipo === 'inventario' && [SEXOS.HEMBRA, SEXOS.MACHO].includes(h.ejemplar.sexo),
        );
        if (conSexo) {
          conSexo.sexoNecesario = conSexo.ejemplar.sexo;
          const pareja = conSexo === a ? b : a;
          pareja.sexoNecesario = opuesto(conSexo.sexoNecesario);
        } else {
          a.sexoNecesario = SEXOS.HEMBRA;
          b.sexoNecesario = SEXOS.MACHO;
        }
      } else if (!a.sexoNecesario) {
        a.sexoNecesario = opuesto(b.sexoNecesario);
      } else if (!b.sexoNecesario) {
        b.sexoNecesario = opuesto(a.sexoNecesario);
      }
    }
    nodo.hijos.forEach(recorre);
  })(arbol);

  return arbol;
}

/**
 * Plan completo: árbol, pasos en orden de ejecución, qué hay que conseguir y coste.
 *
 * @param {Object} objetivo {especie, ivs, naturaleza, evs, movimientos, habilidad, sexo}
 * @param {Object} datos {pokedex, encuentros, objetos, ...}
 * @param {Object} opciones {inventario, regionesDisponibles}
 */
/**
 * Coste aproximado de un árbol: lo que cuesta de verdad, para poder enseñarlo.
 *
 * - **esfuerzo**: encuentros salvajes esperados. Cada IV suelto a 31 es 1 de 32 y
 *   la naturaleza 1 de 25, así que una hoja de "1×31" cuesta 32 y una de "sólo
 *   naturaleza" cuesta 25.
 * - **dinero**: los objetos de crianza, que se consumen todos.
 *
 * No usa los precios de datos/objetos.json a propósito: coste.js ya hace el
 * presupuesto de verdad, y si el planificador lo importase habría un ciclo.
 */
export function medirArbol(arbol) {
  let esfuerzo = 0;
  let capturas = 0;
  let dinero = 0;
  const objetos = new Map();

  (function recorre(n) {
    if (n.tipo === 'conseguir') {
      capturas++;
      // Los IVs son independientes, así que las probabilidades se multiplican.
      esfuerzo += (IV_MAX + 1) ** n.stats.length * (n.naturaleza ? 25 : 1);
    }
    if (n.tipo === 'cruce') {
      // El cruce alargado de la espina deja el hueco de la madre a null: ella
      // sólo aporta la especie y un Recio suyo no forzaría nada.
      for (const o of [n.objetos.madre, n.objetos.padre].filter(Boolean)) {
        objetos.set(o, (objetos.get(o) ?? 0) + 1);
        dinero += PRECIO_RESPALDO[o] ?? 10000;
      }
    }
    n.hijos.forEach(recorre);
  })(arbol);

  return { esfuerzo, capturas, dinero, objetos: [...objetos].map(([nombre, cuantos]) => ({ nombre, cuantos })) };
}

/**
 * Plan completo: árbol, pasos en orden de ejecución, qué hay que conseguir y coste.
 *
 * @param {Object} objetivo {especie, ivs, naturaleza, evs, movimientos, habilidad, sexo}
 * @param {Object} datos {pokedex, encuentros, objetos, ...}
 * @param {Object} opciones {inventario, regionesDisponibles}
 */
export function planear(objetivo, datos, { inventario = [], regionesDisponibles = [], cuando = CUANDO_CUALQUIERA } = {}) {
  const validacion = validarObjetivo(objetivo, datos);
  if (!validacion.valido) return { ok: false, ...validacion };

  // El árbol se monta una vez por cada forma de repartir la Piedraeterna y se
  // queda la mejor CONTRA EL INVENTARIO. Antes había una sola forma fija —la
  // Piedraeterna en el padre— y con eso el plan se quedaba estancado: con un
  // macho del inventario cargado de 31 de cualquier especie, ponerla en la
  // madre deja que ese macho entre tal cual y se ahorra su rama entera. Es el
  // caso que describió el usuario y sale a 3 cruces y 0 capturas donde la forma
  // fija pedía 5 cruces y 1 captura.
  //
  // Dos ejes, y los dos cambian la forma del árbol:
  //
  //   - quién lleva la Piedraeterna (sin naturaleza no hay nada que repartir);
  //   - qué IV se fuerza en el cruce final y cuál queda compartido.
  //
  // Un árbol por cada forma de repartir la Piedraeterna, y gana el mejor contra
  // el inventario; sin naturaleza no hay nada que repartir y es uno solo. El
  // otro eje imaginable —qué IV se fuerza y cuál se comparte— no se prueba, y
  // eso está medido, no supuesto: ver la nota larga de ordenarPorEscasez().
  const modos = objetivo.naturaleza ? MODOS_PIEDRA : ['padre'];
  const candidatos = modos.map((modo) => montarPlan(objetivo, datos, {
    inventario, regionesDisponibles, cuando, modo, validacion,
  }));

  const mejor = candidatos.sort(comparaPlanes)[0];
  return { ...mejor, candidatosProbados: candidatos.length };
}

/**
 * Cuál de dos planes es mejor.
 *
 * En este juego lo que cuesta no es el dinero: son las capturas, porque cada
 * una es farmeo a ciegas —los IVs no se pueden filtrar— y cada padre se
 * consume. Así que primero manda cuántas capturas quedan, después cuántos
 * cruces (cada uno es una eclosión y dos padres gastados) y sólo al final el
 * dinero, que se consigue mucho más rápido que un 31.
 */
export function comparaPlanes(a, b) {
  // Un plan que entrega 30 donde se pidió 31 es peor que uno que entrega el 31.
  const cortos = (p) => (p.ivsCortos ?? []).length;
  // El ESFUERZO, no el número de capturas: capturar dos Pokémon sin pedirles
  // IVs (1 de cada 1 cada uno) es muchísimo más fácil que capturar uno de 3×31
  // (1 de cada 32.768). medirArbol() ya lo suma como encuentros esperados.
  const esfuerzo = (p) => medirArbol(p.arbol).esfuerzo;
  const cruces = (p) => contar(p.arbol).cruces;
  return cortos(a) - cortos(b)
    || esfuerzo(a) - esfuerzo(b)
    || cruces(a) - cruces(b)
    || (a.sobrantes?.length ?? 0) - (b.sobrantes?.length ?? 0)
    // Y a igualdad de todo, el que conserva más IVs de los que nadie pidió. Es
    // el único sitio donde los regalos deciden algo, y sólo cuando salen gratis:
    // por encima de esta línea el plan ya cuesta lo mismo.
    || (b.regaloEntregado ?? 0) - (a.regaloEntregado ?? 0);
}

/** Monta el árbol entero con una forma concreta de repartir la Piedraeterna. */
function montarPlan(objetivo, datos, { inventario, regionesDisponibles, cuando, modo, validacion }) {
  const pedidos = statsPedidos(objetivo);
  const movsHuevo = movimientosSoloDeHuevo(objetivo, datos.pokedex);

  contadorId = 0;
  const ctx = {
    datos,
    objetivo,
    modoPiedra: modo,
    sinGeneroObjetivo: sinGenero(datos.pokedex[objetivo.especie]),
    // Quién puede poner la especie, ya ordenado por lo fácil que es pillarlo
    // donde el usuario juega. Decide el sexo de la espina y si hace falta Ditto.
    espina: lineaMaterna(objetivo.especie, datos, regionesDisponibles, cuando),
    inventarioOriginal: inventario,
    // Copia: los padres se consumen, así que cada ejemplar se asigna a un hueco y
    // desaparece de la reserva.
    inventarioLibre: inventario.map((e) => ({ ...e })),
  };

  // Cuatro pasadas, en este orden: el árbol de requisitos, los movimientos huevo
  // que atan al padre final, el inventario encima, y el reparto de sexos, que es
  // lo único que depende de todo lo anterior.
  let crudo = construir({ stats: pedidos, naturaleza: !!objetivo.naturaleza, rol: ROL.RAIZ }, ctx);

  // Un movimiento huevo obliga a criar aunque el objetivo se capturase entero.
  if (movsHuevo.length && crudo.tipo !== 'cruce') {
    contadorId = 0;
    crudo = raizParaMovimientoHuevo(pedidos, ctx, movsHuevo);
  }

  if (movsHuevo.length && crudo.tipo === 'cruce') {
    // El movimiento lo pasa el PADRE, así que el hueco que deja de ser libre es
    // el que no está en la espina. Como se consume con la cría, un padre que
    // sepa varios ahorra un cruce por cada uno.
    const padreFinal = crudo.hijos.find((h) => h.rol === ROL.LIBRE) ?? crudo.hijos[1];
    if (padreFinal) padreFinal.movimientosNecesarios = movsHuevo;
  }
  // Y si ese padre es a su vez una cría, el movimiento baja hasta la hoja: lo
  // pasa el padre de cada cruce, no aparece a mitad de la cadena.
  let movsSinPadre = bajarMovimientosHuevo(crudo).sinPadre;

  // El inventario primero, y sólo DESPUÉS se mira si hay que alargar la espina.
  //
  // El orden importa y costó un error: alargando antes, una hembra de la
  // especie que además traía la naturaleza —o un 31— se gastaba como «madre que
  // sólo pone la especie» y se tiraba lo bueno que tenía. Colocando primero, esa
  // hembra cae en el hueco donde de verdad aprovecha, y sólo se alarga si
  // después sigue sobrando alguna que no encaja en ningún sitio.
  asignarInventario(crudo, ctx);
  if (extenderEspinaPorEspecie(crudo, ctx).alargada) {
    // Alargar la espina convierte una hoja en cruce: si la que llevaba el
    // movimiento era ésa, hay que volver a bajarlo.
    movsSinPadre = [...new Set([...movsSinPadre, ...bajarMovimientosHuevo(crudo).sinPadre])];
    asignarInventario(crudo, ctx);
  }

  const arbol = asignarSexos(crudo, objetivo, ctx.espina);

  // Y lo último, DESPUÉS de repartir los sexos: si sobra alguien al que sólo le
  // falla el sexo, se cambia esa captura difícil por un cruce pagando el sexo
  // de la cría. Tiene que ir aquí y no antes: hasta asignarSexos() los huecos
  // libres no tienen sexo, y un hueco sin sexo se lo habría quedado ya el
  // inventario en la primera pasada. O sea que lo que llega hasta aquí con un
  // sexo pedido es porque de verdad no le queda otro: su pareja ya está atada.
  if (extenderPorSexo(arbol, ctx).alargada) {
    movsSinPadre = [...new Set([...movsSinPadre, ...bajarMovimientosHuevo(arbol).sinPadre])];
    asignarInventario(arbol, ctx);
  }

  const relleno = elegirRelleno(objetivo.especie, datos, regionesDisponibles, cuando,
    { soloAlpha: !!objetivo.alpha });
  // Un hueco que tiene que pasar un movimiento huevo NO es de especie libre: la
  // especie tiene que poder saber ese movimiento. Se calcula aquí una vez y
  // `aPasos()` lo usa para ese hueco en vez del relleno de siempre.
  const padresDelMovimiento = padresQuePasanTodos(movsHuevo, objetivo.especie, datos, regionesDisponibles);
  const pasos = aPasos(arbol, objetivo, datos, relleno, ctx.espina, padresDelMovimiento);

  // Lo que el árbol entrega de verdad. Con todo a 31 es lo pedido; con algún 30
  // del inventario, el suelo baja y aparecen los cruces a suerte.
  //
  // Se miden también los IVs que NADIE ha pedido pero que alguien del inventario
  // trae de regalo —el 31 en Defensa de un Gible que sólo estaba ahí por ser la
  // hembra de la especie—. No cambian el plan: se miden para poder decir si
  // llegan solos, si se juegan a una tirada o si se pierden, y para ofrecer
  // conservarlos. Sólo se miran los que de verdad hay en la caja: medir los seis
  // siempre sería contar ceros.
  const deRegalo = STATS.filter((st) =>
    !pedidos.includes(st) && inventario.some((e) => (e.ivs?.[st] ?? 0) >= IV_PSEUDO));
  const entrega = ivsDelArbol(arbol, objetivo, { colocarObjetos: true, tambien: deRegalo });
  const avisos = [...(validacion.avisos ?? [])];
  if (movsSinPadre.length)
    avisos.push(
      `${movsSinPadre.join(', ')} ${movsSinPadre.length > 1 ? 'son movimientos huevo' : 'es movimiento huevo'} `
      + 'y esta línea no tiene ningún macho que pueda pasarlo: tendría que venir ya en el Pokémon.',
    );
  if (entrega.cortos.length)
    avisos.push(
      `con lo que hay en el inventario, ${entrega.cortos.map((x) => NOMBRE_STAT[x]).join(', ')} `
      + `sale${entrega.cortos.length > 1 ? 'n' : ''} a 30, no a 31: se está usando un pseudo 31 `
      + 'porque no hay un 31 de verdad para ese hueco. La optimización de EVs ya cuenta con ese 30.',
    );
  for (const s2 of entrega.suerte)
    avisos.push(
      `${NOMBRE_STAT[s2.stat]}: en un cruce se junta un 30 con un 31, así que sale 31 el `
      + `${(s2.probabilidad * 100).toFixed(s2.probabilidad * 100 % 1 ? 1 : 0)} % de las veces y 30 el resto. `
      + 'Si te toca, anota la cría y el plan mejora solo.',
    );

  return {
    ok: true,
    objetivo,
    arbol,
    pasos,
    relleno: relleno.slice(0, 8),
    sobrantes: ctx.inventarioLibre,
    medida: medirArbol(arbol),
    espina: ctx.espina,
    movimientosDeHuevo: movsHuevo,
    // Cómo se ha repartido la Piedraeterna en este plan, de las formas que se
    // probaron. Lo enseña la vista para que se vea que no es un capricho.
    modoPiedra: modo,
    // Los IVs que el árbol garantiza de verdad (30 donde se usa un pseudo 31),
    // qué cruces van a suerte y cuáles se quedan cortos.
    ivsFinales: entrega.ivs,
    suerte: entrega.suerte,
    ivsCortos: entrega.cortos,
    objetosRecolocados: entrega.objetosRecolocados,
    // Los IVs que no se pidieron y que el inventario sí trae: qué hace el plan
    // con ellos. `regaloEntregado` es cuántos salen garantizados, y es el último
    // desempate entre planes que por lo demás cuestan lo mismo.
    regalo: deRegalo,
    suerteRegalo: entrega.suerteExtra,
    regaloEntregado: deRegalo.filter((st) => entrega.ivs[st] >= IV_PSEUDO).length,
    ...validacion,
    avisos,
  };
}

/** Recorre el árbol en post-orden: los padres antes que sus crías, que es el orden real de juego. */
export function aPasos(arbol, objetivo, datos, relleno = [], espina = null, padresDelMovimiento = []) {
  const pasos = [];
  const conseguir = [];

  (function recorre(nodo) {
    for (const h of nodo.hijos) recorre(h);

    const esRaiz = nodo.rol === ROL.RAIZ;
    // El sexo lo ha repartido asignarSexos(): cada cruce necesita un ♀ y un ♂, y
    // sacar la cría del sexo correcto se paga en la guardería.
    const sexoNecesario = nodo.sexoNecesario ?? null;

    // Sólo la espina tiene la especie atada; un hueco libre se rellena con la
    // especie más fácil de conseguir del grupo huevo.
    // Sólo la espina tiene la especie atada, y «atada» quiere decir atada a la
    // LÍNEA, no a la forma final: del huevo sale la base, así que un Staryu
    // pone el mismo huevo que un Starmie. Se sugiere el más fácil de pillar.
    // Un hueco que tiene que pasar un movimiento huevo deja de ser libre: sólo
    // valen las especies que pueden saberlo. Sin esto el plan proponía capturar
    // un Magikarp «con Neblina», que Magikarp no puede tener.
    const pideMovimiento = (nodo.movimientosNecesarios ?? []).length > 0;
    const especieSlot = nodo.especieFija
      ?? (pideMovimiento && padresDelMovimiento.length ? padresDelMovimiento[0].especie
        : nodo.rol === ROL.LIBRE
          ? (relleno[0]?.especie ?? objetivo.especie)
          : (espina?.sugerida ?? objetivo.especie));
    const especiesValidas = nodo.especieFija ? [nodo.especieFija]
      : pideMovimiento && padresDelMovimiento.length ? padresDelMovimiento.map((c) => c.especie)
      : nodo.rol === ROL.LIBRE ? null
      : (espina?.especies ?? [objetivo.especie]);

    if (nodo.tipo === 'inventario') {
      pasos.push({
        tipo: 'usar',
        nodo: nodo.id,
        texto: `Usa tu ${nodo.ejemplar.especie}${nodo.ejemplar.mote ? ` "${nodo.ejemplar.mote}"` : ''} (${etiqueta(nodo)})`,
        ejemplar: nodo.ejemplar,
        aviso: nodo.aviso,
      });
      return;
    }

    if (nodo.tipo === 'conseguir') {
      const req = {
        nodo: nodo.id,
        stats: nodo.stats,
        naturaleza: nodo.naturaleza ? objetivo.naturaleza : null,
        sexo: sexoNecesario,
        especieSugerida: especieSlot,
        especieLibre: nodo.rol === ROL.LIBRE && !nodo.especieFija && !pideMovimiento,
        // Cómo sabe el movimiento cada una de las que valen: es lo que Capturas
        // necesita para decir cómo conseguirlo, no sólo a quién capturar.
        padresDelMovimiento: pideMovimiento ? padresDelMovimiento : null,
        // Para la espina: cualquiera de estas pone la misma especie en el
        // huevo. Null en un hueco libre, donde vale todo el grupo huevo.
        especiesValidas,
        // Un Ditto no se cría: este hueco se captura o se compra, punto.
        noSeCria: !!nodo.especieFija,
        movimientos: nodo.movimientosNecesarios ?? [],
        // Toda hoja de un árbol shiny es un variocolor, y toda hoja de un árbol
        // Alpha es un Alpha: la regla no admite mezcla, así que se copia del
        // objetivo tal cual. Es lo que multiplica el coste de cada captura.
        shiny: !!objetivo.shiny,
        alpha: !!objetivo.alpha,
        rol: nodo.rol,
      };
      conseguir.push(req);
      pasos.push({
        tipo: 'conseguir',
        nodo: nodo.id,
        texto: `Consigue ${etiqueta(nodo, objetivo)}${sexoNecesario ? ` ${sexoNecesario}` : ''}` +
          (req.especieLibre
            ? ` — cualquier especie del grupo huevo sirve (sugerido: ${especieSlot})`
            : ` de ${especieSlot}${(especiesValidas?.length ?? 0) > 1 ? ' (o cualquiera de su línea)' : ''}`) +
          (req.movimientos.length ? ` · tiene que saber ${req.movimientos.join(' y ')}` : '')
          + (req.shiny ? ' · variocolor' : '') + (req.alpha ? ' · Alpha' : ''),
        requisito: req,
      });
      return;
    }

    pasos.push({
      tipo: 'cruzar',
      nodo: nodo.id,
      movimientos: nodo.movimientosNecesarios ?? [],
      hijos: nodo.hijos.map((h) => h.id),
      objetos: nodo.objetos,
      forzados: nodo.forzados,
      compartidos: nodo.compartidos,
      explicacion: nodo.explicacion,
      sexoCria: sexoNecesario,
      texto: `Cruza los dos padres de ${etiqueta(nodo, objetivo)}` +
        ` · ${[nodo.objetos.madre, nodo.objetos.padre].filter(Boolean).join(' + ') || 'sin objetos'}` +
        (sexoNecesario && !esRaiz ? ` · paga por que la cría salga ${sexoNecesario}` : ''),
    });
  })(arbol);

  return { pasos, conseguir };
}

/**
 * "4×31 (PS, Ataque, Defensa, Velocidad) + naturaleza Audaz"
 *
 * Los nombres van como los muestra el juego, no con la clave interna: en los
 * pasos que lee una persona, "At. Esp." y no "at-esp".
 */
export function etiqueta(nodo, objetivo = null) {
  const n = nodo.stats.length;
  const partes = [];
  if (n) partes.push(`${n}×31 (${nodo.stats.map((s) => NOMBRE_STAT[s] ?? s).join(', ')})`);
  if (nodo.naturaleza) partes.push(`naturaleza ${objetivo?.naturaleza ?? ''}`.trim());
  return partes.join(' + ') || 'cualquiera';
}

/**
 * El Pokémon que sale de un cruce, con lo que la regla de herencia GARANTIZA y
 * nada más.
 *
 * Es lo que se anota en el inventario al marcar un cruce como hecho. Se calcula
 * con `ivsGarantizados()`, o sea con la regla de verdad y no con lo que el nodo
 * prometía: si los dos padres que has acabado usando comparten un 31 de más, la
 * cría lo lleva y el inventario tiene que saberlo.
 *
 * Lo que NO se pone es lo que sale al azar: un IV no garantizado queda a 0
 * («sin anotar»), y la naturaleza a null si nadie lleva Piedraeterna. Anotar un
 * 31 que no está garantizado sería inventarse un dato, y un IV mal anotado
 * produce un árbol plausible y equivocado.
 *
 * Devuelve null si el cruce todavía no se puede hacer: hacen falta los dos
 * padres de verdad, en el inventario.
 */
export function criaDe(nodo, objetivo, datos) {
  if (nodo.tipo !== 'cruce' || nodo.hijos.length !== 2) return null;
  const [madre, padre] = nodo.hijos;
  if (madre.tipo !== 'inventario' || padre.tipo !== 'inventario') return null;

  const eMadre = madre.ejemplar;
  const ePadre = padre.ejemplar;

  // La especie la pone la madre; si la madre es Ditto, el otro.
  const especie = esDitto(eMadre.especie) ? ePadre.especie : eMadre.especie;
  const base = datos.pokedex[especie]?.base ?? especie;

  // Lo que la cría trae SEGURO. Con los dos padres a 31 es un 31; con un 30
  // enfrente es un 30, y el 31 queda a suerte — así que se anota el 30 y se
  // avisa de que hay que mirarlo en el juego. Anotar un 31 que a lo mejor no
  // salió descuadra el resto del plan sin que se note, que es el error caro.
  const ivs = ivsVacios();
  const aSuerte = [];
  // Se miran TODOS los IVs, no sólo los que el cruce prometía: si los dos
  // padres comparten un 31 de más, la cría lo trae igual y hay que anotarlo.
  // Lo que queda por debajo de 30 se deja sin anotar: el suelo real sería
  // correcto, pero escribir un 7 que el usuario no ha medido es ruido.
  for (const st of STATS) {
    const d = distribucionDe(st, eMadre.ivs ?? {}, ePadre.ivs ?? {}, nodo.objetos.madre, nodo.objetos.padre,
      { shiny: !!(eMadre.shiny && ePadre.shiny) });
    const suelo = Math.min(...d.map((x) => x.valor));
    if (suelo < IV_PSEUDO) continue;
    ivs[st] = suelo;
    const p = d.filter((x) => x.valor >= IV_MAX).reduce((a, x) => a + x.probabilidad, 0);
    if (p > 0 && p < 1) aSuerte.push({ stat: st, probabilidad: p });
  }

  const nat = naturalezaGarantizada(eMadre, ePadre, nodo.objetos.madre, nodo.objetos.padre);

  // Movimientos huevo: los pasa el padre, y sólo los que la cría pueda aprender.
  const pBase = datos.pokedex[base];
  const movimientos = pBase
    ? (ePadre.movimientos ?? []).filter((m) => vias(pBase, m).length > 0)
    : [];

  return {
    especie: base,
    // Las dos variantes se heredan igual: sólo si los DOS padres la tienen.
    // Shiny × no shiny ni siquiera cría, y Alpha × normal da una cría normal.
    shiny: !!(eMadre.shiny && ePadre.shiny),
    alpha: !!(eMadre.alpha && ePadre.alpha),
    sexo: nodo.sexoNecesario ?? (nodo.rol === ROL.RAIZ ? (objetivo.sexo ?? SEXOS.MACHO) : SEXOS.MACHO),
    naturaleza: nat.naturaleza,
    ivs,
    evs: ivsVacios(),
    movimientos,
    nota: `cría de ${eMadre.especie} ♀ × ${ePadre.especie} ♂`
      + (aSuerte.length
        ? ` · comprueba en el juego: ${aSuerte.map((x) => `${NOMBRE_STAT[x.stat]} pudo salir 31 (${Math.round(x.probabilidad * 100)} %)`).join(', ')}`
        : ''),
    aSuerte,
    padres: [eMadre.id, ePadre.id],
  };
}

/**
 * Qué IVs entrega de verdad el árbol, contando los 30.
 *
 * Con todo a 31 esto es trivial: cada cruce garantiza lo que promete. En cuanto
 * entra un 30 deja de serlo, porque 30 × 31 NO garantiza 31 — sale 31 con la
 * probabilidad de la rama «alto» de la tabla (25 % sin objetos) y 30 el resto
 * de las veces. Así que el árbol se recorre de abajo arriba con dos cuentas a
 * la vez:
 *
 *   - el **suelo**: el peor valor posible de cada IV. Es lo que el plan puede
 *     prometer, y es lo que luego usa la optimización de EVs, porque a nivel 50
 *     un 30 y un 31 no dan los mismos escalones;
 *   - la **suerte**: en qué cruces hay un 30 enfrentado a un 31 y con qué
 *     probabilidad sale el 31. Si toca, el plan mejora solo al recalcularse.
 *
 * Simplificación consciente: el suelo se propaga hacia arriba como un número,
 * no como una distribución. O sea que si un 30 se convierte en 31 a mitad de la
 * cadena, la mejora no se compone hacia arriba en el cálculo — se ve al
 * recalcular el plan con la cría ya anotada, que es como se juega de verdad.
 * Para componerlo habría que arrastrar la distribución entera por cada nodo y
 * no compensa.
 */
export function ivsDelArbol(arbol, objetivo, { colocarObjetos = false, tambien = [] } = {}) {
  // Criar shiny × shiny reparte los IVs con otra tabla. Todo el árbol es shiny
  // o no lo es ninguno, así que basta con mirarlo aquí una vez.
  const shiny = !!objetivo?.shiny;
  const suerte = [];
  const suerteExtra = [];
  const cambios = [];

  const deNodo = (nodo) => {
    if (nodo.tipo === 'inventario') return { ...ivsVacios(), ...(nodo.ejemplar?.ivs ?? {}) };
    if (nodo.tipo !== 'cruce') {
      // Un hueco por conseguir se captura o se compra buscando el 31: es lo que
      // el plan pide, así que es lo que se cuenta.
      const ivs = ivsVacios();
      for (const st of nodo.stats) ivs[st] = IV_MAX;
      return ivs;
    }

    const [a, b] = nodo.hijos.map(deNodo);

    // Los dos Recios de un cruce son intercambiables entre los padres, y con un
    // 30 de por medio deja de dar igual quién lleva cuál: un Recio fuerza el IV
    // de QUIEN LO LLEVA, así que puesto en el padre que tiene 30 garantiza un 30
    // teniendo el 31 delante. Si cambiarlos de mano sube el suelo, se cambian:
    // sale gratis, son los mismos dos objetos. La Piedraeterna no se toca — va
    // en el padre a propósito (ver construir()).
    if (colocarObjetos && nodo.objetos
        && nodo.objetos.madre !== PIEDRAETERNA && nodo.objetos.padre !== PIEDRAETERNA) {
      const suelo = (om, op) => nodo.stats
        .reduce((acc, st) => acc + Math.min(...distribucionDe(st, a, b, om, op, { shiny }).map((x) => x.valor)), 0);
      const { madre, padre } = nodo.objetos;
      if (madre && padre && madre !== padre && suelo(padre, madre) > suelo(madre, padre)) {
        nodo.objetos = { madre: padre, padre: madre };
        cambios.push({ nodo: nodo.id, madre: padre, padre: madre });
        nodo.explicacion += ` Los dos Recios van cambiados de mano a propósito: cada uno está en `
          + `el padre que tiene el 31 de ese IV, porque un Recio fuerza el IV de quien lo lleva `
          + `y puesto en el que tiene 30 garantizaría el 30.`;
      }
    }

    const ivs = ivsVacios();
    // `tambien` son IVs que el objetivo NO pide pero que alguien del inventario
    // trae de regalo. Se miden igual que los pedidos —el mismo suelo y la misma
    // tabla— pero van a su propia lista: un regalo que no llega no es un aviso
    // del plan, es información. Sin `tambien` esto hace exactamente lo de antes.
    for (const st of [...nodo.stats, ...tambien.filter((x) => !nodo.stats.includes(x))]) {
      const pedido = nodo.stats.includes(st);
      const d = distribucionDe(st, a, b, nodo.objetos?.madre, nodo.objetos?.padre, { shiny });
      ivs[st] = Math.min(...d.map((x) => x.valor));
      const p = d.filter((x) => x.valor >= IV_MAX).reduce((acc, x) => acc + x.probabilidad, 0);
      if (p > 0 && p < 1) {
        (pedido ? suerte : suerteExtra).push({ nodo: nodo.id, stat: st, probabilidad: p, suelo: ivs[st] });
        if (colocarObjetos && pedido)
          nodo.explicacion += ` En ${NOMBRE_STAT[st]} un padre trae 30 y el otro 31: aquí no hay `
            + `garantía, sale 31 el ${Math.round(p * 100)} % de las veces y ${ivs[st]} el resto.`;
      }
    }
    return ivs;
  };

  const ivs = deNodo(arbol);
  const pedidos = statsPedidos(objetivo);
  return {
    ivs,
    suerte,
    // Lo mismo pero de los IVs que nadie pidió: dónde se juegan y con qué
    // probabilidad. No genera avisos; lo lee la tarjeta de regalos.
    suerteExtra,
    // Cruces donde se han intercambiado los dos Recios para no forzar un 30
    // teniendo un 31 en el otro padre.
    objetosRecolocados: cambios,
    // Los que el plan NO puede prometer a 31 pase lo que pase.
    cortos: pedidos.filter((st) => ivs[st] < IV_MAX),
  };
}

/** Cuenta nodos por tipo: sirve para el resumen y para el coste. */
export function contar(arbol) {
  const out = { cruces: 0, conseguir: 0, inventario: 0, total: 0 };
  (function recorre(n) {
    out.total++;
    if (n.tipo === 'cruce') out.cruces++;
    else if (n.tipo === 'conseguir') out.conseguir++;
    else if (n.tipo === 'inventario') out.inventario++;
    n.hijos.forEach(recorre);
  })(arbol);
  return out;
}
