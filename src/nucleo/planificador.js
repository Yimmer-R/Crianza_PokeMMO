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
} from './herencia.js';
import {
  puedenCriar, padresCompatibles, gruposEnComun, sinGenero, esEsteril, esDitto,
  costeElegirSexo, sirveComoLineaMaterna,
} from './compatibilidad.js';
import { disponibleAhora, CUANDO_CUALQUIERA } from './cuando.js';

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
      problemas.push(`${objetivo.especie} no aprende ${mov} por ninguna vía que traiga la wiki`);
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
 * Qué especie usar en los huecos de la línea paterna.
 *
 * Como la cría sale de la especie de la MADRE, el padre puede ser cualquier cosa
 * que comparta grupo huevo. Interesa la más fácil de conseguir: que aparezca en
 * una región disponible, en sitios comunes, y que dé machos y hembras con soltura
 * (los huecos de relleno necesitan de los dos sexos).
 */
export function elegirRelleno(especieObjetivo, datos, regionesDisponibles, cuando = CUANDO_CUALQUIERA) {
  const { pokedex, encuentros } = datos;
  const regiones = new Set(regionesDisponibles);

  const facilidad = (cand) => {
    const p = pokedex[cand.especie];
    const enc = (encuentros[cand.especie] ?? []).filter((e) => regiones.has(e.region));
    if (!enc.length) return -Infinity; // no se puede capturar donde juega el usuario
    let puntos = 0;
    // Lo que se puede cazar con la hora y la estación que hay puestas pesa
    // mucho: de poco vale la especie más común si sólo sale en invierno.
    const ahora = enc.filter((e) => disponibleAhora(e, cuando));
    if (!ahora.length) puntos -= 20;
    else puntos += Math.min(ahora.length, 6);
    for (const e of enc) {
      const r = (e.rareza ?? '').toLowerCase();
      if (r.includes('muy común') || r.includes('muy comun')) puntos += 10;
      else if (r.includes('común') || r.includes('comun')) puntos += 8;
      else if (r.includes('horda')) puntos += 6;
      else if (r.includes('poco')) puntos += 3;
      else if (r.includes('raro')) puntos += 1;
      else puntos += 2;
    }
    puntos += Math.min(enc.length, 8);                       // muchos sitios = fácil
    puntos += new Set(enc.map((e) => e.region)).size * 2;    // en varias regiones = flexible
    // Los huecos de relleno necesitan macho Y hembra, así que un 50/50 vale más
    // que un 87,5/12,5 aunque sea más común. Un sin género se salta esto: no
    // tiene sexos, y exigírselos lo descartaba con -Infinity.
    if (!sinGenero(p)) {
      const min = Math.min(p.genero?.macho ?? 0, p.genero?.hembra ?? 0);
      if (min <= 0) return -Infinity;
      puntos += min / 5;
    }
    return puntos;
  };

  // Con una especie sin género el Ditto SÍ entra: la pareja sólo puede ser su
  // propia línea evolutiva o un Ditto, y a veces el Ditto es lo fácil.
  const candidatos = padresCompatibles(especieObjetivo, pokedex, {
    incluirDitto: sinGenero(pokedex[especieObjetivo]),
  })
    .map((c) => ({ ...c, facilidad: facilidad(c) }))
    .filter((c) => Number.isFinite(c.facilidad))
    .sort((a, b) => b.facilidad - a.facilidad);

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

  const suyos = perfectos(ejemplar.ivs ?? {});
  const faltan = nodo.stats.filter((s) => !suyos.has(s));
  if (faltan.length)
    return { ok: false, motivo: `le falta 31 en ${faltan.join(', ')}`, faltanIvs: faltan };

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

  // Espina materna: la especie la pone la madre, así que aquí no hay flexibilidad.
  if (nodo.rol === ROL.ESPINA || nodo.rol === ROL.RAIZ) {
    const r = sirveComoLineaMaterna(ejemplar, objetivo.especie, pokedex);
    if (!r.sirve) return { ok: false, motivo: r.motivo, especieIncompatible: true };
    if (r.necesitaDitto) return { ok: true, necesitaDitto: true, aviso: r.motivo };
    return { ok: true };
  }

  // Hueco libre: cualquier especie que comparta grupo huevo, de cualquiera de los
  // dos sexos. El sexo se reparte después, al emparejar: lo único que pide el
  // juego es un ♀ y un ♂ por cruce.
  if (esDitto(ejemplar.especie)) return { ok: true, via: 'ditto' };
  if (sinGenero(p)) return { ok: false, motivo: `${ejemplar.especie} no tiene género: sólo vale como Ditto` };
  const comunes = gruposEnComun(pokedex[objetivo.especie], p);
  if (!comunes.length)
    return { ok: false, motivo: `no comparte grupo huevo con ${objetivo.especie}`, especieIncompatible: true };
  return { ok: true, gruposEnComun: comunes };
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
    hijos: [],
  };

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
    const [hijoA, hijoB] = restriccionesDeLosHijos(nodo.rol, ctx.sinGeneroObjetivo);

    // La naturaleza sólo la pasa la Piedraeterna, y ocupa el hueco de objeto de
    // quien la lleva: el cruce se queda con un solo Recio, así que sólo fuerza un
    // IV y el otro padre tiene que traer YA todos los pedidos.
    //
    // Dos padres con la misma naturaleza NO la transmiten, por mucho que con los
    // IVs sí funcione. Ver naturalezaGarantizada() en herencia.js.
    const forzado = orden[0];
    const resto = nodo.stats.filter((st) => st !== forzado);

    nodo.tipo = 'cruce';
    // La Piedraeterna la lleva el PADRE, no la madre, y esto no es un detalle.
    // Da igual quién la lleve —pasa la naturaleza de quien la tenga puesta—,
    // pero el hueco de la madre es el de la espina: especie objetivo y hembra.
    // Colgando de ahí la cadena de naturaleza, todos sus huecos quedaban atados
    // a la especie y ningún Pokémon del inventario con la naturaleza buena
    // entraba en ellos. Con la Piedraeterna en el padre, la cadena entera de
    // naturaleza es LIBRE: cualquier especie del grupo huevo, cualquier sexo.
    nodo.objetos = { madre: RECIO_DE[forzado], padre: PIEDRAETERNA };
    nodo.forzados = [forzado];
    nodo.compartidos = resto;
    nodo.explicacion =
      `La Piedraeterna pasa la naturaleza pero ocupa un hueco de objeto, así que este cruce ` +
      `sólo puede forzar un IV (${NOMBRE_STAT[forzado]}). ` +
      (resto.length
        ? `${resto.map((st) => NOMBRE_STAT[st]).join(', ')} tiene${resto.length > 1 ? 'n' : ''} que venir a 31 en los DOS padres.`
        : 'No queda ningún IV que tengan que compartir.');

    nodo.hijos = [
      construir({ stats: nodo.stats, naturaleza: false, objeto: RECIO_DE[forzado], ...hijoA }, ctx, profundidad + 1),
      construir({ stats: resto, naturaleza: true, objeto: PIEDRAETERNA, ...hijoB }, ctx, profundidad + 1),
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
    `Se fuerzan ${NOMBRE_STAT[f1]} y ${NOMBRE_STAT[f2]} con objetos Recios, uno en cada padre. ` +
    (compartidos.length
      ? `${compartidos.map((s) => NOMBRE_STAT[s]).join(', ')} sale${compartidos.length > 1 ? 'n' : ''} solo${compartidos.length > 1 ? 's' : ''} porque los dos padres lo tienen a 31, y el promedio de 31 y 31 es 31.`
      : 'No hay IVs compartidos: los dos forzados son todo el objetivo.');

  const [hijoA, hijoB] = restriccionesDeLosHijos(nodo.rol, ctx.sinGeneroObjetivo);
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
function restriccionesDeLosHijos(rolDelCruce, especieSinGenero = false) {
  // Sin género no hay sexos que repartir: cada cruce es la especie con su misma
  // línea evolutiva o con un Ditto, y ninguno de los dos huecos pide sexo.
  // Pedir ♀ y ♂ aquí dejaba el plan con capturas imposibles (1 de cada 0).
  if (especieSinGenero)
    return rolDelCruce === ROL.RAIZ || rolDelCruce === ROL.ESPINA
      ? [{ rol: ROL.ESPINA, sexoNecesario: SEXOS.SIN_GENERO },
         { rol: ROL.LIBRE, sexoNecesario: SEXOS.SIN_GENERO }]
      : [{ rol: ROL.LIBRE, sexoNecesario: SEXOS.SIN_GENERO },
         { rol: ROL.LIBRE, sexoNecesario: SEXOS.SIN_GENERO }];

  return rolDelCruce === ROL.RAIZ || rolDelCruce === ROL.ESPINA
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

/** Cuántas capturas cuelgan de un nodo: es lo que se ahorra si el inventario lo cubre. */
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

  for (;;) {
    if (!inventarioLibre.length) break;

    const candidatos = [];
    (function recorre(nodo, padre) {
      if (nodo.tipo === 'inventario') return; // ya ocupado: no se mira dentro
      for (const [i, e] of inventarioLibre.entries()) {
        const r = cumple(e, nodo, datos, objetivo);
        if (!r.ok) continue;
        if (!sexoCompatibleConHermano(nodo, padre, e, datos.pokedex)) continue;
        candidatos.push({ nodo, i, e, r, ahorro: hojasBajo(nodo), perfectos: perfectos(e.ivs ?? {}).size });
      }
      for (const h of nodo.hijos) recorre(h, nodo);
    })(arbol, null);

    if (!candidatos.length) break;

    candidatos.sort((a, b) => b.ahorro - a.ahorro || a.perfectos - b.perfectos);
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
export function asignarSexos(arbol, objetivo, especieSinGenero = false) {
  // Sin género: los huecos ya vienen marcados desde la construcción y no hay
  // ♀/♂ que repartir. Repartirlos pondría un sexo que la especie no tiene.
  if (especieSinGenero) {
    arbol.sexoNecesario = SEXOS.SIN_GENERO;
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

  const pedidos = statsPedidos(objetivo);
  const movsHuevo = movimientosSoloDeHuevo(objetivo, datos.pokedex);

  contadorId = 0;
  const ctx = {
    datos,
    objetivo,
    sinGeneroObjetivo: sinGenero(datos.pokedex[objetivo.especie]),
    inventarioOriginal: inventario,
    // Copia: los padres se consumen, así que cada ejemplar se asigna a un hueco y
    // desaparece de la reserva.
    inventarioLibre: inventario.map((e) => ({ ...e })),
  };

  // Cuatro pasadas, en este orden: el árbol de requisitos, los movimientos huevo
  // que atan al padre final, el inventario encima, y el reparto de sexos, que es
  // lo único que depende de todo lo anterior.
  const crudo = construir({ stats: pedidos, naturaleza: !!objetivo.naturaleza, rol: ROL.RAIZ }, ctx);

  if (movsHuevo.length && crudo.tipo === 'cruce') {
    // El movimiento lo pasa el PADRE, así que el hueco que deja de ser libre es
    // el que no está en la espina. Como se consume con la cría, un padre que
    // sepa varios ahorra un cruce por cada uno.
    const padreFinal = crudo.hijos.find((h) => h.rol === ROL.LIBRE) ?? crudo.hijos[1];
    if (padreFinal) padreFinal.movimientosNecesarios = movsHuevo;
  }

  // El inventario primero, y sólo DESPUÉS se mira si hay que alargar la espina.
  //
  // El orden importa y costó un error: alargando antes, una hembra de la
  // especie que además traía la naturaleza —o un 31— se gastaba como «madre que
  // sólo pone la especie» y se tiraba lo bueno que tenía. Colocando primero, esa
  // hembra cae en el hueco donde de verdad aprovecha, y sólo se alarga si
  // después sigue sobrando alguna que no encaja en ningún sitio.
  asignarInventario(crudo, ctx);
  if (extenderEspinaPorEspecie(crudo, ctx).alargada) asignarInventario(crudo, ctx);

  const arbol = asignarSexos(crudo, objetivo, ctx.sinGeneroObjetivo);

  const relleno = elegirRelleno(objetivo.especie, datos, regionesDisponibles, cuando);
  const pasos = aPasos(arbol, objetivo, datos, relleno);

  return {
    ok: true,
    objetivo,
    arbol,
    pasos,
    relleno: relleno.slice(0, 8),
    sobrantes: ctx.inventarioLibre,
    medida: medirArbol(arbol),
    movimientosDeHuevo: movsHuevo,
    ...validacion,
  };
}

/** Recorre el árbol en post-orden: los padres antes que sus crías, que es el orden real de juego. */
export function aPasos(arbol, objetivo, datos, relleno = []) {
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
    const especieSlot = nodo.rol === ROL.LIBRE
      ? (relleno[0]?.especie ?? objetivo.especie)
      : objetivo.especie;

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
        especieLibre: nodo.rol === ROL.LIBRE,
        movimientos: nodo.movimientosNecesarios ?? [],
        rol: nodo.rol,
      };
      conseguir.push(req);
      pasos.push({
        tipo: 'conseguir',
        nodo: nodo.id,
        texto: `Consigue ${etiqueta(nodo, objetivo)}${sexoNecesario ? ` ${sexoNecesario}` : ''}` +
          (req.especieLibre
            ? ` — cualquier especie del grupo huevo sirve (sugerido: ${especieSlot})`
            : ` de ${especieSlot}`) +
          (req.movimientos.length ? ` · tiene que saber ${req.movimientos.join(' y ')}` : ''),
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

  const g = ivsGarantizados(eMadre.ivs ?? {}, ePadre.ivs ?? {}, nodo.objetos.madre, nodo.objetos.padre);
  const ivs = ivsVacios();
  for (const st of g.garantizados) ivs[st] = IV_MAX;

  const nat = naturalezaGarantizada(eMadre, ePadre, nodo.objetos.madre, nodo.objetos.padre);

  // Movimientos huevo: los pasa el padre, y sólo los que la cría pueda aprender.
  const pBase = datos.pokedex[base];
  const movimientos = pBase
    ? (ePadre.movimientos ?? []).filter((m) => vias(pBase, m).length > 0)
    : [];

  return {
    especie: base,
    sexo: nodo.sexoNecesario ?? (nodo.rol === ROL.RAIZ ? (objetivo.sexo ?? SEXOS.MACHO) : SEXOS.MACHO),
    naturaleza: nat.naturaleza,
    ivs,
    evs: ivsVacios(),
    movimientos,
    nota: `cría de ${eMadre.especie} ♀ × ${ePadre.especie} ♂`,
    padres: [eMadre.id, ePadre.id],
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
