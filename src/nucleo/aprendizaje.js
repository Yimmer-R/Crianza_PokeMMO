// En qué orden se aprende cada movimiento, contando con las evoluciones.
//
// Esto no es lo mismo que «¿puede aprenderlo?», que responde movimientos.js. Es
// «¿en qué momento, y antes o después de evolucionar?», y ahí está el problema
// que se lleva una tarde de juego por delante: un movimiento puede estar en la
// lista de la fase ANTERIOR a un nivel MÁS ALTO que el de la evolución, o en la
// de la fase final a un nivel que ya habrás pasado cuando por fin la tengas.
//
// La pieza que resuelve casi todo es el **recordador de movimientos**, que en
// PokeMMO está en TODOS los centros Pokémon y cobra en Escamas Corazón. Puede
// enseñar (wiki/mundo/conceptos/Relearners.md):
//
//   - los movimientos iniciales;
//   - los de cualquier nivel, **aunque el Pokémon no haya llegado a ese nivel**;
//   - los de una evolución anterior a cualquier nivel, **aunque nunca los haya
//     sabido** — son los que el Pokédex marca como «Prevo»;
//   - y los de huevo, MO, MT y tutor **que el Pokémon tenía al nacer**.
//
// O sea: lo de «retrasar la evolución» casi nunca hace falta, y lo de «se me ha
// pasado el nivel» tampoco. Lo que el recordador NO arregla es lo que no tenía
// al nacer y su fase final no puede aprender por ningún otro medio: ahí el orden
// sí importa y hay que enseñarlo antes de evolucionar y no sobrescribirlo.

import { vias, viasEnLaLinea } from './planificador.js';

export const RECORDADOR = 'recordador de movimientos';
export const PAGO_RECORDADOR = 'Esc. Corazón';

/**
 * La línea evolutiva desde la forma base hasta la especie pedida, con la
 * condición de cada salto. `nivel` es el nivel cuando la evolución es por subir
 * de nivel, y null cuando es por objeto, intercambio o lo que sea.
 */
export function lineaEvolutiva(especie, pokedex) {
  const p = pokedex[especie];
  if (!p) return [];

  // Hacia atrás hasta la base, y luego se le da la vuelta.
  const atras = [especie];
  const vistos = new Set(atras);
  for (;;) {
    const de = pokedex[atras[0]]?.evoluciona?.de;
    if (!de || vistos.has(de) || !pokedex[de]) break;
    atras.unshift(de);
    vistos.add(de);
  }

  return atras.map((nombre, i) => {
    const anterior = atras[i - 1];
    const salto = anterior
      ? (pokedex[anterior].evoluciona?.a ?? []).find((x) => x.especie === nombre)
      : null;
    return {
      especie: nombre,
      desde: anterior ?? null,
      condicion: salto?.condicion ?? null,
      nivel: nivelDeEvolucion(salto?.condicion),
    };
  });
}

/** "al subir al nivel 30" -> 30. Cualquier otra condición -> null. */
export function nivelDeEvolucion(condicion) {
  if (!condicion) return null;
  const m = String(condicion).match(/nivel\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

/** A qué nivel aprende una especie un movimiento por subir de nivel, o null. */
function nivelDelMovimiento(p, movimiento) {
  const encontrados = (p.movimientos?.nivel ?? [])
    .filter((m) => m.nombre === movimiento)
    .map((m) => m.nv);
  return encontrados.length ? Math.min(...encontrados) : null;
}

/**
 * Cómo y cuándo conseguir un movimiento en la especie objetivo.
 *
 * Devuelve una de estas situaciones, de la más cómoda a la más incómoda:
 *
 * - `nivel`     lo aprende ella al subir. Si el nivel es más bajo que el de su
 *               evolución, lo habrás pasado: el recordador lo arregla.
 * - `mt`        se le enseña con la MT/MO, cuando quieras.
 * - `tutor`     lo da un tutor de movimientos.
 * - `prevo`     está en su lista de «Prevo»: el recordador se lo enseña aunque
 *               nunca lo haya sabido, así que NO hay que retrasar la evolución.
 * - `antesDeEvolucionar`  sólo lo tiene una fase anterior y NO está en su lista
 *               de Prevo. Aquí sí manda el orden: hay que aprenderlo en esa
 *               fase y no sobrescribirlo, y si es por nivel y ese nivel está por
 *               encima del de la evolución, hay que retrasar la evolución.
 * - `huevo`     movimiento huevo: tiene que venir del padre, y el recordador
 *               sólo lo recupera si la cría nació con él.
 * - `imposible` nadie de la línea lo aprende.
 */
export function comoAprender(movimiento, especie, datos) {
  const { pokedex } = datos;
  const p = pokedex[especie];
  if (!p) return { movimiento, situacion: 'imposible', texto: `no conozco ${especie}` };

  const linea = lineaEvolutiva(especie, pokedex);
  const yoSoy = linea[linea.length - 1];
  // A qué nivel aparece la especie objetivo, si es que evoluciona por nivel.
  const nivelDeAparicion = yoSoy?.nivel ?? null;

  const mias = vias(p, movimiento);
  const porNivel = nivelDelMovimiento(p, movimiento);
  const esPrevo = (p.movimientos?.dePreevolucion ?? []).includes(movimiento);

  const base = { movimiento, especie, linea };

  if (porNivel != null) {
    // Lo aprende ella sola. El único matiz: si ese nivel queda por debajo del
    // nivel al que la tienes, ya lo has pasado y lo pone el recordador.
    const yaPasado = nivelDeAparicion != null && porNivel < nivelDeAparicion;
    return {
      ...base,
      situacion: 'nivel',
      nivel: porNivel,
      yaPasado,
      texto: porNivel <= 1
        ? `Lo sabe de salida. Si lo pierde, el ${RECORDADOR} lo devuelve.`
        : yaPasado
          ? `${especie} lo aprende al nivel ${porNivel}, pero no la tendrás hasta el `
            + `${nivelDeAparicion}: ese nivel ya está pasado, así que se lo pone el `
            + `${RECORDADOR} de cualquier centro Pokémon.`
          : `Lo aprende sola al nivel ${porNivel}.`,
    };
  }

  if (mias.some((v) => v.via === 'mt'))
    return { ...base, situacion: 'mt', texto: 'Se le enseña con la MT/MO, en cualquier momento.' };

  if (mias.some((v) => v.via === 'tutor'))
    return { ...base, situacion: 'tutor', texto: 'Lo da un tutor de movimientos.' };

  if (mias.some((v) => v.via === 'especial'))
    return { ...base, situacion: 'especial', texto: 'Es un movimiento especial de evento o similar.' };

  if (mias.some((v) => v.via === 'evolucion'))
    return { ...base, situacion: 'alEvolucionar', texto: 'Lo aprende justo al evolucionar.' };

  if (esPrevo) {
    const donde = quienLoTiene(movimiento, linea, pokedex);
    return {
      ...base,
      situacion: 'prevo',
      enFases: donde,
      texto: `Está en su lista de «Prevo»: el ${RECORDADOR} se lo enseña aunque nunca lo haya `
        + `sabido, pagando en ${PAGO_RECORDADOR}. No hace falta retrasar la evolución.`,
    };
  }

  // Un movimiento huevo se decide sobre la LÍNEA, no sobre la forma final: el
  // huevo eclosiona en la base, así que si la única vía en toda la línea es el
  // huevo, esto es cosa del plan de crianza y no del orden de evolución.
  const enLaLinea = viasEnLaLinea(especie, movimiento, pokedex);
  const soloHuevo = enLaLinea.length > 0 && enLaLinea.every((v) => v.via === 'huevo');
  if (soloHuevo) {
    const quien = enLaLinea[enLaLinea.length - 1].especie;
    const hayQueEvolucionar = quien !== especie;
    return {
      ...base,
      situacion: 'huevo',
      enFases: quienLoTiene(movimiento, linea, pokedex),
      texto: `Movimiento huevo de ${quien}: tiene que venir del padre en el cruce final, y el `
        + `${RECORDADOR} sólo lo recupera si la cría nació con él — después no se puede añadir.`
        + (hayQueEvolucionar
          ? ` Nace ${quien} con el movimiento y se evoluciona luego hasta ${especie} sin `
            + 'sobrescribirlo.'
          : ''),
    };
  }

  // No lo tiene ella. ¿Lo tiene alguna fase anterior?
  const enFases = quienLoTiene(movimiento, linea.slice(0, -1), pokedex);
  if (enFases.length) {
    // La fase por la que conviene entrar es la MÁS TARDÍA que lo consiga sin
    // huevo: así hay que arrastrarlo menos evoluciones. Ludicolo es el caso —
    // Lotad lo trae de huevo, pero Lombre lo aprende al evolucionar, que es
    // mucho más cómodo y una evolución más cerca.
    const comoda = [...enFases]
      .reverse()
      .find((f) => f.vias.some((v) => v !== 'huevo'));
    const primera = comoda ?? enFases[0];
    // El nivel al que hay que llegar con esa fase, y el nivel al que
    // evolucionaría: si el del movimiento es mayor, hay que frenar.
    const nivelSiguienteSalto = linea[linea.findIndex((x) => x.especie === primera.especie) + 1]?.nivel ?? null;
    const hayQueRetrasar = primera.nivel != null && nivelSiguienteSalto != null
      && primera.nivel > nivelSiguienteSalto;
    return {
      ...base,
      situacion: 'antesDeEvolucionar',
      enFases,
      hayQueRetrasar,
      nivelEvolucion: nivelSiguienteSalto,
      texto: [
        `${especie} no lo aprende y tampoco le sale como «Prevo», así que hay que enseñárselo `
        + `a ${primera.especie} y NO sobrescribirlo al evolucionar.`,
        primera.nivel != null
          ? `${primera.especie} lo aprende al nivel ${primera.nivel}.`
          : primera.vias.includes('evolucion')
            ? `${primera.especie} lo aprende justo al evolucionar desde `
              + `${linea[linea.findIndex((x) => x.especie === primera.especie) - 1]?.especie ?? 'su fase anterior'}.`
            : `${primera.especie} lo consigue por ${primera.vias.join(' o ')}.`,
        hayQueRetrasar
          ? `Y ojo: evoluciona al ${nivelSiguienteSalto}, antes del ${primera.nivel}. Hay que `
            + `RETRASAR la evolución hasta el ${primera.nivel} (cancela la evolución con B) y `
            + 'aprenderlo primero.'
          : null,
        'La lista de «Prevo» de la wiki puede no estar completa, así que mira en el recordador '
        + 'antes de darlo por perdido: si sale ahí, te ahorras todo esto.',
      ].filter(Boolean).join(' '),
    };
  }

  return {
    ...base,
    situacion: 'imposible',
    texto: `Nadie de la línea de ${especie} aprende ${movimiento} por ninguna vía que traiga la wiki.`,
  };
}

/** Qué fases de la línea tienen el movimiento, y por qué vía. */
function quienLoTiene(movimiento, linea, pokedex) {
  const out = [];
  for (const paso of linea) {
    const p = pokedex[paso.especie];
    const v = vias(p, movimiento);
    if (!v.length) continue;
    out.push({
      especie: paso.especie,
      nivel: nivelDelMovimiento(p, movimiento),
      vias: [...new Set(v.map((x) => x.via))],
      condicionEvolucion: paso.condicion,
    });
  }
  return out;
}

/**
 * La guía entera: un movimiento por entrada, más el orden en que conviene
 * hacerlo y qué objetos hacen falta.
 */
export function guiaDeAprendizaje(objetivo, datos) {
  const entradas = (objetivo.movimientos ?? []).map((m) => comoAprender(m, objetivo.especie, datos));

  const linea = lineaEvolutiva(objetivo.especie, datos.pokedex);
  const antesDeEvolucionar = entradas.filter((e) => e.situacion === 'antesDeEvolucionar');
  const conRecordador = entradas.filter((e) => e.situacion === 'prevo' || e.yaPasado);
  const deHuevo = entradas.filter((e) => e.situacion === 'huevo');

  const objetos = [];
  if (entradas.some((e) => e.situacion === 'mt')) objetos.push('las MT/MO que correspondan');
  if (conRecordador.length) objetos.push(PAGO_RECORDADOR);

  return {
    entradas,
    linea,
    antesDeEvolucionar,
    conRecordador,
    deHuevo,
    objetos,
    // El orden de juego, que es lo que de verdad se pregunta.
    orden: ordenDeJuego(linea, entradas),
  };
}

/** Los pasos en el orden en que se hacen dentro del juego. */
function ordenDeJuego(linea, entradas) {
  const pasos = [];

  const deHuevo = entradas.filter((e) => e.situacion === 'huevo');
  if (deHuevo.length)
    pasos.push({
      cuando: 'al criar',
      texto: `La cría tiene que nacer sabiendo ${deHuevo.map((e) => e.movimiento).join(' y ')}: `
        + 'eso lo pone el padre del cruce final y no se puede añadir después.',
    });

  for (const [i, fase] of linea.entries()) {
    const antes = entradas.filter(
      (e) => e.situacion === 'antesDeEvolucionar' && e.enFases?.some((f) => f.especie === fase.especie),
    );
    if (!antes.length) continue;
    const siguiente = linea[i + 1];
    for (const e of antes) {
      const f = e.enFases.find((x) => x.especie === fase.especie);
      pasos.push({
        cuando: `como ${fase.especie}`,
        texto: `Aprende ${e.movimiento}${f.nivel != null ? ` al nivel ${f.nivel}` : ''}`
          + (siguiente ? ` ANTES de evolucionar a ${siguiente.especie}` : '')
          + (e.hayQueRetrasar
            ? `, y para eso hay que frenar la evolución (sale al ${e.nivelEvolucion})`
            : '')
          + '.',
      });
    }
  }

  const porNivel = entradas.filter((e) => e.situacion === 'nivel' && !e.yaPasado && e.nivel > 1);
  for (const e of porNivel)
    pasos.push({ cuando: `nivel ${e.nivel}`, texto: `${e.movimiento} le sale solo.` });

  const conMt = entradas.filter((e) => e.situacion === 'mt' || e.situacion === 'tutor');
  if (conMt.length)
    pasos.push({
      cuando: 'cuando quieras',
      texto: `${conMt.map((e) => e.movimiento).join(', ')} se enseñan con MT o con el tutor, `
        + 'así que van al final y no condicionan nada.',
    });

  const recordar = entradas.filter((e) => e.situacion === 'prevo' || e.yaPasado);
  if (recordar.length)
    pasos.push({
      cuando: 'al final, en cualquier centro Pokémon',
      texto: `${recordar.map((e) => e.movimiento).join(', ')} los pone el ${RECORDADOR} pagando `
        + `en ${PAGO_RECORDADOR}, ya con la evolución hecha.`,
    });

  return pasos;
}
