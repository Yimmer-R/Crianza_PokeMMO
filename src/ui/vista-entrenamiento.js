// El plan de EVs: cuántos faltan, en qué hordas y cuántas rondas.

import { el, tarjeta, plegable, chip, aviso, frag, tabla } from './componentes.js';
import { NOMBRE_STAT, EV_MAX_TOTAL } from '../nucleo/constantes.js';
import { obtener, fijarYGuardar } from './estado.js';
import { planearEvs } from '../nucleo/entrenamiento.js';
import { cuandoLegible, siglaDeHoras, siglaDeEstaciones } from '../nucleo/cuando.js';
import { selectorCuando } from './selector-cuando.js';
import { guiaDeAprendizaje, RECORDADOR, PAGO_RECORDADOR } from '../nucleo/aprendizaje.js';
import { planearHabilidad } from '../nucleo/habilidades.js';

export function vistaEntrenamiento(datos) {
  const { objetivo, regionesDisponibles, cuando } = obtener();

  const plan = planearEvs(objetivo.evs, {}, datos, {
    regionesDisponibles,
    objeto: objetivo.objetoEntrenamiento,
    nivel: objetivo.nivel,
    ivs: objetivo.ivs,
    cuando,
  });

  // La guía de movimientos y habilidad va aquí y no en el Plan porque es lo que
  // se hace DESPUÉS de tener la cría: subir niveles, enseñar MT, pasar por el
  // recordador. El Plan es la crianza; esto es el entrenamiento.
  const guia = bloqueGuia(objetivo, datos);

  if (!plan.porStat.length)
    return frag([
      guia,
      tarjeta('Sin EVs que repartir', [
        el('p.vacio', {}, ['Pon los EVs que quieres en la pestaña Objetivo. El reparto típico es 252 + 252 + 6.']),
      ]),
    ]);

  const barraCuando = tarjeta('Cuándo estás jugando', [selectorCuando('ent')]);

  const resumen = tarjeta(`EVs · ${plan.total} de ${EV_MAX_TOTAL}`, [
    el('div.etiquetas', {}, [
      chip(`nivel ${plan.nivel}`),
      chip(plan.objeto.nombre ? `${plan.objeto.nombre} (×${plan.objeto.factor})` : 'sin objeto', plan.objeto.factor > 1 ? 'si' : ''),
      chip(`${plan.libres} EVs libres`),
      cuando.hora ? chip(cuando.hora, 'si') : null,
      cuando.estacion ? chip(cuando.estacion, 'si') : null,
    ]),
    el('p.nota', { texto: plan.objeto.nota }),
    plan.problemas.length
      ? el('div.error', {}, [el('ul', {}, plan.problemas.map((x) => el('li', { texto: x })))])
      : null,
    plan.avisos.length
      ? el('div.aviso', {}, [el('ul', {}, plan.avisos.map((x) => el('li', { texto: x })))])
      : null,
  ]);

  const bloques = plan.porStat.map((s) => {
    if (s.sobran) {
      return tarjeta(`${NOMBRE_STAT[s.stat]} · te sobran ${s.sobran}`, [
        el('p', {}, [
          `Dale ${s.comoQuitar.cuantas} × `, el('strong', { texto: s.comoQuitar.baya }),
          `: ${s.comoQuitar.nota}.`,
        ]),
      ]);
    }

    if (s.sinHordasAlAlcance) {
      return tarjeta(`${NOMBRE_STAT[s.stat]} · faltan ${s.faltan}`, [
        aviso(
          `No hay hordas de ${NOMBRE_STAT[s.stat]} en tus regiones.` +
          (s.hayHordasEnOtraRegion ? ' Sí las hay en otras: desbloquéalas o usa vitaminas.' : ''),
        ),
        el('p', {}, [
          `Con vitaminas: ${s.vitamina.cuantas} × `, el('strong', { texto: s.vitamina.nombre }),
          ` (10 EVs cada una). ${s.vitamina.nota}.`,
        ]),
      ]);
    }

    const plural = (n, una, varias) => `${n} ${n === 1 ? una : varias}`;
    return tarjeta(`${NOMBRE_STAT[s.stat]} · faltan ${s.faltan} EVs`, [
      el('div.etiquetas', {}, [
        chip(plural(s.hordasNecesarias, 'horda', 'hordas'), 'si'),
        chip(`${s.evsPorHorda} EVs por horda`),
        chip(`+${s.puntosANivel} ${s.puntosANivel === 1 ? 'punto' : 'puntos'} a nivel ${plan.nivel}`, 'bien'),
      ]),
      el('p.nota', {}, [
        'La mejor: ', el('strong', { texto: `${s.mejor.especie} +${s.mejor.ev}` }),
        ` en ${s.mejor.zona} (${s.mejor.region}, ${s.mejor.nivel}), `,
        cuando.hora || cuando.estacion
          ? `${cuandoLegible(s.mejor)}. `
          : `${siglaDeHoras(s.mejor)}${siglaDeEstaciones(s.mejor) ? ` · ${siglaDeEstaciones(s.mejor)}` : ''}. `,
        `Una horda son 5 Pokémon, así que cada ronda da ${s.mejor.ev} × 5`,
        plan.objeto.factor > 1 ? ` × ${plan.objeto.factor}` : '',
        ` = ${s.evsPorHorda} EVs. Salen con Dulce Aroma.`,
      ]),
      s.hordasAhora === 0
        ? aviso(
            `Ninguna horda de ${NOMBRE_STAT[s.stat]} sale con ${
              [cuando.hora, cuando.estacion].filter(Boolean).join(' y ')
            }. Espera a la franja que dice la tabla, o tira de vitaminas.`,
          )
        : null,
      // La tabla entera plegada: para entrenar hace falta UN sitio, no seis. Los
      // otros están por si ese pilla lejos.
      s.hordas.length > 1
        ? plegable(`Otros ${s.hordas.length - 1} sitios`, [
            tabla(
              ['EV', 'Especie', 'Región', 'Zona', 'Nivel', 'Cuándo'],
              s.hordas.slice(1).map((h) => [
                `+${h.ev}`, h.especie, chip(h.region, 'si'), h.zona, h.nivel, celdaCuando(h, cuando),
              ]),
            ),
          ], { pequeno: true, id: `hordas-${s.stat}` })
        : null,
      el('p.nota', {}, [
        'Alternativa sin moverse: ', el('strong', { texto: `${s.vitamina.cuantas} × ${s.vitamina.nombre}` }),
        `. ${s.vitamina.nota}.`,
      ]),
    ]);
  });

  // La tarjeta «Lo que no sé» ya no está: los huecos siguen declarados en el
  // README y en `planearEvs().huecos`, pero una tarjeta fija que repite lo
  // mismo en cada visita es ruido. Lo que de verdad afecta a un número concreto
  // se dice en su sitio (las vitaminas, los escalones).

  return frag([guia, barraCuando, resumen, bloqueOptimizar(plan.optimizacion), ...bloques]);
}


// ------------------------------------------------ apretar el reparto de EVs

/**
 * Los EVs suben por escalones y lo que queda entre uno y el siguiente está
 * tirado. Esta tarjeta dice cuánto estás tirando y dónde ponerlo.
 *
 * A nivel 50 el corte depende de la PARIDAD del IV, así que si un IV no está
 * fijado a 31 la cuenta puede cambiar: eso se avisa en vez de callarlo.
 */
function bloqueOptimizar(o) {
  if (!o) return null;

  if (!o.recuperados)
    return tarjeta('El reparto ya está apretado', [
      el('p.nota', {}, [
        `Ningún EV cae entre escalones: los ${o.totalAntes} que has puesto dan `,
        el('strong', { texto: `${o.puntosAntes} puntos` }),
        ` a nivel ${o.nivel}, que es todo lo que pueden dar.`,
      ]),
    ]);

  const filas = o.porStat
    .filter((x) => x.desperdiciados)
    .map((x) => [
      NOMBRE_STAT[x.stat],
      x.pedidos,
      x.escalon,
      chip(`−${x.desperdiciados} tirados`, 'mal'),
      o.nivel === 100 ? '—' : `IV ${x.iv} (${x.paridad})`,
    ]);

  return tarjeta(`Optimizar el reparto · recuperas ${o.recuperados} EVs`, [
    el('p.nota', {}, [
      'Los EVs suben la característica por escalones, y lo que queda entre un escalón y el ',
      'siguiente no da nada. ',
      o.nivel === 100
        ? 'A nivel 100 un punto son 4 EVs, así que cualquier múltiplo de 4 aprovecha el 100 %.'
        : 'A nivel 50 un punto son 8 EVs, pero el primero llega antes si el IV es impar: ' +
          'con IV impar los escalones caen en 4, 12, 20… y con IV par en 8, 16, 24…',
    ]),
    tabla(['Característica', 'Pedías', 'Escalón', 'Sobra', 'Por qué ahí'], filas, [1, 2]),

    o.reinversiones.length
      ? el('div', {}, [
          el('h3', { texto: 'Dónde reinvertirlos' }),
          el('ul', {}, o.reinversiones.map((r) => el('li', {}, [
            el('strong', { texto: NOMBRE_STAT[r.stat] }),
            `: de ${r.de} a ${r.a} EVs (${r.cuesta} EVs) → +1 punto.`,
          ]))),
        ])
      : null,

    o.sobrantes
      ? el('p.nota', {}, [
          `Quedan ${o.sobrantes} EVs que no completan ningún punto más en lo que has pedido. `,
          'Puedes dejarlos sin gastar o meterlos en una característica que no estés usando: ',
          'no cambian nada en combate.',
        ])
      : null,

    el('div.etiquetas', {}, [
      chip(`${o.totalAntes} EVs → ${o.totalDespues}`, 'si'),
      chip(
        `${o.puntosAntes} puntos → ${o.puntosDespues}`,
        o.puntosDespues > o.puntosAntes ? 'bien' : '',
      ),
    ]),

    o.ivsSinFijar.length
      ? aviso(
          `A nivel 50 el escalón depende de si el IV es par o impar, y ${
            o.ivsSinFijar.map((s) => NOMBRE_STAT[s]).join(', ')
          } no ${o.ivsSinFijar.length > 1 ? 'están' : 'está'} a 31 en el objetivo. ` +
          'La cuenta usa el IV que has puesto; si al final sale otro, vuelve a mirarlo aquí.',
        )
      : null,

    o.puntosDespues > o.puntosAntes || o.totalDespues < o.totalAntes
      ? el('button.boton', {
          id: 'aplicar-optimizacion',
          onclick: () => fijarYGuardar((st) => ({ objetivo: { ...st.objetivo, evs: { ...o.ajustados } } })),
        }, ['Aplicar este reparto al objetivo'])
      : null,
  ]);
}


/** Igual que en Capturas: siglas sin filtro, y con filtro si sirve o qué esperar. */
function celdaCuando(h, cuando) {
  if (!cuando?.hora && !cuando?.estacion) {
    const horas = siglaDeHoras(h);
    const est = siglaDeEstaciones(h);
    return el('span.sig', {}, [
      chip(horas, horas === 'M/D/N' ? '' : 'ojo'),
      est ? chip(est, 'ojo') : null,
    ]);
  }
  const texto = cuandoLegible(h);
  if (texto === 'siempre') return chip('siempre');
  if (h.ahora !== false && !h.noAhora) return chip(texto, 'bien');
  return chip(texto, h.noAhora?.espera === 'estacion' ? 'mal' : 'ojo');
}


// ------------------------------------------- guía de movimientos y habilidad

const ETIQUETA_SITUACION = {
  nivel: ['sube de nivel', 'bien'],
  mt: ['MT/MO', 'bien'],
  tutor: ['tutor', 'bien'],
  especial: ['evento', 'ojo'],
  alEvolucionar: ['al evolucionar', 'bien'],
  prevo: ['recordador', 'si'],
  antesDeEvolucionar: ['antes de evolucionar', 'ojo'],
  huevo: ['de huevo: al criar', 'ojo'],
  imposible: ['no se puede', 'mal'],
};

/**
 * Cómo conseguir los movimientos pedidos y la habilidad, en orden de juego.
 *
 * El nudo que resuelve: un movimiento puede estar en la lista de una fase
 * ANTERIOR, o en la de la final a un nivel que ya habrás pasado. Casi todo lo
 * arregla el recordador de movimientos, que en PokeMMO está en todos los
 * centros Pokémon; lo que no, hay que aprenderlo antes de evolucionar. Ver
 * src/nucleo/aprendizaje.js.
 */
function bloqueGuia(objetivo, datos) {
  if (!objetivo.especie) return null;
  if (!objetivo.movimientos?.length && !objetivo.habilidad) return null;

  const g = guiaDeAprendizaje(objetivo, datos);
  const hab = objetivo.habilidad ? planearHabilidad(objetivo, datos) : null;

  const linea = g.linea.map((f) => f.especie).join(' → ');
  const saltos = g.linea.filter((f) => f.desde).map((f) => `${f.especie}: ${f.condicion}`);

  return tarjeta('Movimientos y habilidad, en orden', [
    g.linea.length > 1
      ? el('p.nota', {}, [
          el('strong', { texto: 'Línea evolutiva: ' }), linea,
          saltos.length ? ` · ${saltos.join(' · ')}` : '',
        ])
      : null,

    g.entradas.length
      ? tabla(
          ['Movimiento', 'Cómo', 'Qué hacer'],
          g.entradas.map((e) => {
            const [etq, clase] = ETIQUETA_SITUACION[e.situacion] ?? [e.situacion, ''];
            return [el('strong', { texto: e.movimiento }), chip(etq, clase), e.texto];
          }),
        )
      : null,

    g.orden.length
      ? el('div', {}, [
          el('h3', { texto: 'El orden' }),
          el('ol.pasos', {}, g.orden.map((o) => el('li.usar', {}, [
            el('span', {}, [el('strong', { texto: `${o.cuando}: ` }), o.texto]),
          ]))),
        ])
      : null,

    g.antesDeEvolucionar.length
      ? aviso(
          `${g.antesDeEvolucionar.map((e) => e.movimiento).join(', ')}: aquí el orden importa. `
          + 'Si lo sobrescribes después de evolucionar no hay forma de recuperarlo, porque no '
          + 'sale en la lista del recordador.',
        )
      : null,

    g.conRecordador.length
      ? el('p.nota', {}, [
          el('strong', { texto: `${RECORDADOR}: ` }),
          'está en todos los centros Pokémon y cobra en ',
          el('strong', { texto: PAGO_RECORDADOR }),
          ' (de 1 a 4 según la potencia del movimiento). Puede enseñar los de cualquier nivel '
          + 'aunque no hayas llegado, y los de una evolución anterior aunque nunca los haya '
          + 'sabido. Lo único que NO puede es añadir un movimiento huevo después: ése tiene '
          + 'que venir en el huevo.',
        ])
      : null,

    hab
      ? el('div', {}, [
          el('h3', { texto: `Habilidad · ${objetivo.habilidad}` }),
          el('ul', {}, hab.pasos.map((x) => el('li', { texto: x }))),
          hab.objetos.length ? el('div.etiquetas', {}, hab.objetos.map((o) => chip(o, 'si'))) : null,
          hab.huecos.length
            ? el('p.nota', {}, [hab.huecos.join(' ')])
            : null,
        ])
      : null,
  ]);
}
