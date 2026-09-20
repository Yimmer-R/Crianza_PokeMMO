// El plan: el árbol de padres, los pasos en orden y el presupuesto.

import { el, tarjeta, chip, aviso, frag, tabla, numero } from './componentes.js';
import { NOMBRE_STAT, SEXOS } from '../nucleo/constantes.js';
import { obtener, fijarYGuardar } from './estado.js';
import { etiqueta, contar, ROL } from '../nucleo/planificador.js';
import { presupuestar, formatearYen } from '../nucleo/coste.js';
import { planearMovimientos } from '../nucleo/movimientos.js';
import { planearHabilidad } from '../nucleo/habilidades.js';

const nombres = (stats) => stats.map((s) => NOMBRE_STAT[s] ?? s).join(', ');

/** Etiqueta legible de un nodo: "4×31 (PS, Ataque…) + naturaleza Audaz". */
function etiquetaBonita(nodo, objetivo) {
  const partes = [];
  if (nodo.stats.length) partes.push(`${nodo.stats.length}×31 (${nombres(nodo.stats)})`);
  if (nodo.naturaleza) partes.push(`naturaleza ${objetivo.naturaleza}`);
  return partes.join(' + ') || 'cualquiera';
}

function pintarArbol(nodo, objetivo, esRaiz = true) {
  const sexo = nodo.sexoNecesario ?? '';

  const cabeza = el('span.nodo', {}, [
    el('strong', { texto: etiquetaBonita(nodo, objetivo) }),
    !esRaiz && sexo ? chip(sexo) : null,
    nodo.tipo === 'inventario' ? chip(`ya lo tienes: ${nodo.ejemplar.especie}`, 'bien') : null,
    nodo.tipo === 'conseguir' ? chip(nodo.rol === ROL.LIBRE ? 'capturar · especie libre' : 'capturar', 'ojo') : null,
    nodo.objeto ? el('span.obj', { texto: `lleva ${nodo.objeto}` }) : null,
  ]);

  return el('li', {}, [
    cabeza,
    nodo.hijos.length ? el('ul', {}, nodo.hijos.map((h) => pintarArbol(h, objetivo, false))) : null,
  ]);
}

export function vistaPlan(datos) {
  const { plan, objetivo, regionesDisponibles } = obtener();

  if (!objetivo.especie)
    return tarjeta('Todavía no hay objetivo', [
      el('p', {}, ['Elige una especie en ', el('a', { href: '#objetivo', onclick: irAObjetivo }, ['Objetivo']), '.']),
    ]);

  if (!plan?.ok)
    return tarjeta('No puedo planear esto', [
      el('ul', {}, (plan?.problemas ?? ['falta el objetivo']).map((x) => el('li', { texto: x }))),
    ]);

  const cuentas = contar(plan.arbol);
  const pres = presupuestar(plan, datos);
  const planMovs = planearMovimientos(objetivo, datos, regionesDisponibles);
  const planHab = planearHabilidad(objetivo, datos);

  // ------------------------------------------------------------- resumen
  const resumen = tarjeta(`${objetivo.especie}: ${etiquetaBonita(plan.arbol, objetivo)}`, [
    el('div.etiquetas', {}, [
      chip(`${cuentas.cruces} cruces`, 'si'),
      chip(`${cuentas.conseguir} padres por conseguir`, cuentas.conseguir ? 'ojo' : 'bien'),
      cuentas.inventario ? chip(`${cuentas.inventario} del inventario`, 'bien') : null,
      chip(`${pres.objetosUsados.reduce((a, o) => a + o.cuantos, 0)} objetos de crianza`),
    ]),
    plan.avisos?.length
      ? el('div.aviso', {}, [el('ul', {}, plan.avisos.map((x) => el('li', { texto: x })))])
      : null,
    cuentas.inventario === 0 && obtener().inventario.length > 0
      ? aviso('Nada de tu inventario encaja en esta cadena. Mira la pestaña Inventario para ver por qué.')
      : null,
  ]);

  // ------------------------------------------------- comparativa de estrategias
  const ESTRATEGIA = {
    compartida: 'los dos padres comparten la naturaleza',
    piedraeterna: 'Piedraeterna en cada cruce',
  };
  const comparativa = plan.comparativa
    ? tarjeta('Cómo se lleva la naturaleza', [
        el('p.nota', {}, [
          'He construido las dos cadenas posibles y me he quedado con la de menos esfuerzo. ',
          'El esfuerzo son encuentros salvajes esperados: cada IV a 31 es 1 de 32 y la ',
          'naturaleza 1 de 25.',
        ]),
        tabla(
          ['Estrategia', 'Capturas', 'Encuentros esperados', 'Objetos', ''],
          [...plan.comparativa]
            .sort((a, b) => a.esfuerzo - b.esfuerzo)
            .map((c) => [
              ESTRATEGIA[c.estrategia] ?? c.estrategia,
              numero(c.capturas),
              numero(c.esfuerzo),
              `${numero(c.dinero)} PokéYen`,
              c.estrategia === plan.estrategiaNaturaleza ? chip('elegida', 'bien') : '',
            ]),
          [1, 2],
        ),
        el('p.nota', {}, [
          'Puedes forzar una de las dos en la pestaña Objetivo si prefieres otra cosa.',
        ]),
      ])
    : null;

  // ---------------------------------------------------------------- pasos
  const pasos = tarjeta('Pasos, en orden', [
    el('p.nota', {}, [
      'De abajo hacia arriba: primero los padres, luego los cruces. Los padres se consumen en ',
      'cada cruce, así que el orden importa.',
    ]),
    el('ol.pasos', {}, plan.pasos.pasos.map((p) => el(`li.${p.tipo}`, {}, [
      el('span', { texto: p.texto }),
      p.explicacion ? el('span.porque', { texto: p.explicacion }) : null,
      p.aviso ? el('span.porque', { texto: `⚠ ${p.aviso}` }) : null,
    ]))),
  ]);

  // ---------------------------------------------------------------- árbol
  const arbol = tarjeta('El árbol', [
    el('p.nota', {}, [
      'Cada cruce garantiza los 31 que COMPARTEN sus dos padres (el promedio de 31 y 31 es 31), ',
      'más los que fuerce un objeto Recio. De ahí sale la forma del árbol.',
    ]),
    el('ul.arbol', {}, [pintarArbol(plan.arbol, objetivo)]),
  ]);

  // ------------------------------------------------------------ movimientos
  const bloqueMovs = objetivo.movimientos.length
    ? tarjeta('Movimientos', [
        el('ul', {}, planMovs.entradas.map((e) => el('li', {}, [
          el('strong', { texto: e.movimiento }), ' — ',
          e.imposible ? el('span.chip.mal', { texto: e.nota }) : e.texto,
        ]))),
        planMovs.avisos.length
          ? el('div.aviso', {}, [el('ul', {}, planMovs.avisos.map((x) => el('li', { texto: x })))])
          : null,
        planMovs.padreUnico
          ? el('p.nota', { texto: `Un solo ${planMovs.padreUnico.especie} macho puede llevar ${planMovs.padreUnico.movimientos.join(' y ')}: eso ahorra un cruce por movimiento.` })
          : null,
      ])
    : null;

  // ------------------------------------------------------------- habilidad
  const bloqueHab = objetivo.habilidad
    ? tarjeta('Habilidad', [
        el('ul', {}, planHab.pasos.map((x) => el('li', { texto: x }))),
        planHab.objetos.length ? el('div.etiquetas', {}, planHab.objetos.map((o) => chip(o, 'si'))) : null,
        planHab.huecos.length
          ? el('div.nota', {}, [el('ul', {}, planHab.huecos.map((x) => el('li', { texto: x })))])
          : null,
      ])
    : null;

  // ------------------------------------------------------------ presupuesto
  const presupuesto = tarjeta('Presupuesto', [
    el('p.total', { texto: `${formatearYen(pres.totalYen)} PokéYen` }),
    pres.otrasMonedas.length
      ? el('p.nota', { texto: `Alternativa en otras monedas: ${pres.otrasMonedas.map((m) => `${numero(m.cantidad)} ${m.moneda}`).join(' · ')}` })
      : null,
    tabla(
      ['Concepto', 'Cantidad', 'Unidad', 'Total', 'Fuente'],
      pres.lineas.map((l) => [
        l.concepto,
        numero(l.cuantos),
        l.precioUnidad != null ? `${numero(l.precioUnidad)} ${l.moneda}` : (l.nota ?? '—'),
        l.coste != null ? numero(l.coste) : '—',
        l.fuente === 'wiki' ? chip('wiki', 'bien')
          : l.fuente === 'estimado' ? chip('estimado', 'ojo')
          : l.fuente === 'respaldo' ? chip('respaldo', 'ojo') : '—',
      ]),
      [1, 3],
    ),
    pres.hayEstimados
      ? aviso('Hay líneas estimadas. La wiki sólo publica los extremos del pago por sexo (5.000 y 25.000); los tramos de en medio no están en ninguna fuente.')
      : null,
    el('div.nota', {}, [pres.sinPrecio.nota]),
  ]);

  return frag([resumen, comparativa, pasos, arbol, bloqueMovs, bloqueHab, presupuesto]);
}

function irAObjetivo(e) {
  e.preventDefault();
  fijarYGuardar({ vista: 'objetivo' });
}
