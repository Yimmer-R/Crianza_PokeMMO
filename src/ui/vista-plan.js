// El plan: el árbol de padres, los pasos en orden y el presupuesto.

import { el, tarjeta, plegable, chip, aviso, frag, tabla, numero } from './componentes.js';
import { NOMBRE_STAT, STATS, IV_MAX, INCUBADORAS, ACELERAR_HUEVO } from '../nucleo/constantes.js';
import { obtener, fijar, fijarYGuardar, crianzaActiva } from './estado.js';
import { contar, criaDe, ROL } from '../nucleo/planificador.js';
import { normalizar, ejemplarNuevo, loQueFalta } from '../nucleo/inventario.js';
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

  // ---------------------------------------------------------------- pasos
  const ahora = bloqueAhora(plan, objetivo, datos);
  const pasos = bloquePasos(plan, objetivo, datos);

  // ---------------------------------------------------------------- árbol
  const arbol = plegable('El árbol', [
    el('p.nota', {}, [
      'Cada cruce garantiza los 31 que COMPARTEN sus dos padres (el promedio de 31 y 31 es 31), ',
      'más los que fuerce un objeto Recio. De ahí sale la forma del árbol.',
    ]),
    el('ul.arbol', {}, [pintarArbol(plan.arbol, objetivo)]),
  ], { extra: `${cuentas.total} nodos` });

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

    // El total usa el precio de TIENDA, que es firme y no caduca. Lo del GTL va
    // aparte y con fecha, porque un precio de mercado miente a los dos meses.
    pres.dondeComprar?.length
      ? el('div.nota', {}, [
          el('strong', { texto: 'Tienda o GTL: ' }),
          ...pres.dondeComprar.flatMap((d) => [
            el('span', {}, [
              `${d.objeto} × ${d.cuantos}. ${d.consejo} `,
              `En el último año se movió entre ${numero(d.gtl.min)} (${d.gtl.minFecha}) y `,
              `${numero(d.gtl.max)} (${d.gtl.maxFecha}). `,
              d.masCaroEnGtl && d.diferencia > 0
                ? el('strong', { texto: `Comprarla en la guardería te ahorra ${numero(d.diferencia)} PokéYen.` })
                : null,
            ]),
            el('br'),
          ]),
          el('span.tenue', {
            texto: `Los precios de GTL salen de ${pres.dondeComprar[0].gtl.fuente} y caducan: `
              + 'la wiki no los guarda a propósito. Vuelve a mirarlos antes de comprar.',
          }),
        ])
      : null,
    el('div.nota', {}, [pres.sinPrecio.nota]),
  ]);

  return frag([resumen, ahora, pasos, arbol, bloqueMovs, bloqueHab, presupuesto]);
}

function irAObjetivo(e) {
  e.preventDefault();
  fijarYGuardar({ vista: 'objetivo' });
}


// --------------------------------------------------------------- ahora mismo

/**
 * Lo único que se puede hacer hoy, y nada más.
 *
 * Un 4×31 con naturaleza son 31 pasos, y enseñarlos todos de golpe no ayuda:
 * 30 de ellos están bloqueados hasta que existan sus padres. Aquí van las dos
 * cosas que sí se pueden hacer ya —los cruces cuyos dos padres están en el
 * inventario, y las capturas que faltan agrupadas por lo que piden— y la lista
 * entera queda plegada debajo para cuando se quiera ver el camino completo.
 */
function bloqueAhora(plan, objetivo, datos) {
  const listos = [];
  (function recorre(n) {
    if (n.tipo === 'cruce' && n.hijos.every((h) => h.tipo === 'inventario')) listos.push(n);
    n.hijos.forEach(recorre);
  })(plan.arbol);

  const faltan = loQueFalta(plan);

  if (!listos.length && !faltan.length)
    return tarjeta('Ahora mismo', [
      el('p', {}, [chip('el plan está terminado', 'bien'), ' No queda ningún padre por conseguir ni ningún cruce por hacer.']),
    ]);

  return tarjeta('Ahora mismo', [
    listos.length
      ? el('div', {}, [
          el('h3', { texto: `Cruces que ya puedes hacer · ${listos.length}` }),
          listos.length > INCUBADORAS
            ? el('p.nota', {}, [
                `Tienes ${listos.length} listos pero sólo ${INCUBADORAS} incubadoras, que son `,
                `${INCUBADORAS} huevos a la vez: el techo de la crianza en paralelo. `,
                'Van por tandas.',
              ])
            : null,
          el('ul.listos', {}, listos.map((n) => el('li', {}, [
            el('span', {}, [
              el('strong', { texto: etiquetaBonita(n, objetivo) }),
              ` — ${n.hijos[0].ejemplar.especie} ♀ × ${n.hijos[1].ejemplar.especie} ♂`,
              ` · ${[n.objetos.madre, n.objetos.padre].filter(Boolean).join(' + ') || 'sin objetos'}`,
              n.sexoNecesario && n.rol !== ROL.RAIZ ? ` · cría ${n.sexoNecesario}` : '',
            ]),
            el('button.boton.mini', {
              onclick: () => completarCruce(n, objetivo, datos),
            }, ['Hecho']),
          ]))),
        ])
      : null,

    faltan.length
      ? el('div', {}, [
          el('h3', { texto: `Padres que te faltan · ${faltan.reduce((a, f) => a + f.cuantos, 0)}` }),
          tabla(
            ['Cuántos', 'Qué', 'Sexo', 'Especie', ''],
            faltan.map((f) => [
              `×${f.cuantos}`,
              (f.stats.length ? `31 en ${f.stats.map((x) => NOMBRE_STAT[x]).join(' + ')}` : '') +
                (f.naturaleza ? `${f.stats.length ? ' + ' : ''}naturaleza ${f.naturaleza}` : '') +
                ((f.movimientos ?? []).length ? ` · con ${f.movimientos.join(', ')}` : ''),
              f.sexo ?? 'cualquiera',
              f.especieLibre ? chip(`libre — p. ej. ${f.especieSugerida}`, 'si') : f.especieSugerida,
              el('button.boton.mini.secundario', {
                onclick: () => alFormularioDesde(f, datos),
              }, ['Ya lo tengo']),
            ]),
            [0],
          ),
          el('p.nota', {}, [
            '«Libre» quiere decir que vale cualquier especie que comparta grupo huevo: sólo la ',
            'madre de la cadena tiene la especie atada, porque la cría sale de ella.',
          ]),
        ])
      : null,
  ]);
}

// -------------------------------------------------------------- el checklist

/**
 * Los pasos, como lista para ir tachando.
 *
 * Lo que marca un paso como hecho **no** es una casilla guardada aparte: es el
 * inventario. Completar un cruce borra sus dos padres —en PokeMMO se consumen—
 * y anota la cría, y con eso el plan se recalcula y el paso desaparece solo.
 * Guardar casillas por su lado obligaría a atarlas a un identificador de nodo
 * que cambia en cuanto el árbol se recalcula, y acabarían mintiendo.
 *
 * Por eso un cruce sólo se puede marcar cuando sus DOS padres están ya en el
 * inventario. Eso es también lo que da el orden: la lista se desbloquea de
 * abajo hacia arriba, igual que se juega.
 */
function bloquePasos(plan, objetivo, datos) {
  const porId = new Map();
  (function recorre(n) { porId.set(n.id, n); n.hijos.forEach(recorre); })(plan.arbol);

  const { deshacer } = obtener();
  const hechos = crianzaActiva().hechos ?? [];

  const filas = plan.pasos.pasos.map((p) => {
    const nodo = porId.get(p.nodo);

    if (p.tipo === 'usar')
      return el('li.usar.hecho', {}, [
        el('span.marca', { texto: '✔' }),
        el('span', {}, [el('strong', { texto: 'Ya lo tienes: ' }), p.texto.replace(/^Usa tu /, '')]),
        p.aviso ? el('span.porque', { texto: `⚠ ${p.aviso}` }) : null,
      ]);

    if (p.tipo === 'conseguir')
      return el('li.conseguir', {}, [
        el('span.marca', { texto: '○' }),
        el('span', {}, [p.texto]),
        el('button.boton.mini.secundario', {
          onclick: () => alFormularioDesde(p.requisito, datos),
        }, ['Ya lo tengo']),
      ]);

    const listo = nodo && nodo.hijos.every((h) => h.tipo === 'inventario');
    return el(`li.cruzar${listo ? '.listo' : ''}`, {}, [
      el('span.marca', { texto: listo ? '▸' : '·' }),
      el('span', {}, [p.texto]),
      p.explicacion ? el('span.porque', { texto: p.explicacion }) : null,
      listo
        ? el('button.boton.mini', {
            onclick: () => completarCruce(nodo, objetivo, datos),
          }, ['Hecho: quitar los padres'])
        : el('span.porque', { texto: 'Primero los dos padres de este cruce.' }),
    ]);
  });

  return plegable('Todos los pasos, en orden', [
    el('p.nota', {}, [
      'De abajo hacia arriba. Un cruce se puede marcar cuando sus dos padres están en el ',
      'inventario; al marcarlo se gastan —en PokeMMO los padres se consumen— y la cría entra ',
      'en el inventario con los 31 que el cruce garantiza. El plan se recalcula solo.',
    ]),
    el('p.nota', {}, [
      `Los huevos eclosionan en incubadora, y tienes ${INCUBADORAS}: `,
      `${INCUBADORAS} a la vez como mucho. Se aceleran con `,
      ACELERAR_HUEVO.map((a) => `${a.que} (−${Math.round(a.rebaja * 100)} %)`).join(' y con '),
      ', y las dos cosas se suman. El de Cuerpo Llama va DENTRO de la incubadora, no en el ',
      'equipo: no es como en los juegos originales.',
    ]),
    deshacer
      ? el('div.aviso', {}, [
          `${deshacer.texto} `,
          el('button.boton.mini.secundario', {
            id: 'deshacer-paso',
            onclick: () => fijarYGuardar({ inventario: deshacer.inventario, deshacer: null }),
          }, ['Deshacer']),
        ])
      : null,
    el('ol.pasos', {}, filas),
    hechos.length
      ? plegable(`Lo que ya has hecho · ${hechos.length}`, [
          el('ol', {}, hechos.map((h) => el('li', { texto: h }))),
          el('button.boton.mini.secundario', {
            onclick: () => fijarYGuardar((st) => ({
              crianzas: st.crianzas.map((c) =>
                (c.id === st.crianzaActiva ? { ...c, hechos: [] } : c)),
            })),
          }, ['Vaciar el registro']),
        ], { pequeno: true, id: 'registro-hechos' })
      : null,
  ], { extra: `${plan.pasos.pasos.length} pasos` });
}

/**
 * Marca un cruce como hecho: los dos padres se gastan y la cría entra.
 *
 * Se guarda el inventario de antes para poder deshacerlo, porque marcar un paso
 * por error borra dos Pokémon y eso duele.
 */
function completarCruce(nodo, objetivo, datos) {
  const cria = criaDe(nodo, objetivo, datos);
  if (!cria) return;
  const { padres, ...limpio } = cria;
  const nuevo = normalizar({ ...ejemplarNuevo(), ...limpio, id: undefined });
  const texto = `${cria.nota} → ${cria.especie} ${cria.sexo}` +
    ` (${STATS.filter((s) => nuevo.ivs[s] >= IV_MAX).length}×31` +
    `${cria.naturaleza ? `, ${cria.naturaleza}` : ''})`;

  fijarYGuardar((st) => ({
    inventario: [...st.inventario.filter((e) => !padres.includes(e.id)), nuevo],
    deshacer: { inventario: st.inventario, texto: `Hecho: ${texto}.` },
    seleccion: st.seleccion.filter((x) => !padres.includes(x)),
    crianzas: st.crianzas.map((c) =>
      (c.id === st.crianzaActiva ? { ...c, hechos: [...(c.hechos ?? []), texto] } : c)),
  }));
}

/**
 * "Ya lo tengo" lleva al formulario del inventario con lo que pedía el paso ya
 * puesto. No lo guarda: un padre anotado de menos rompe el plan en silencio, así
 * que lo confirma el usuario mirando la ficha del juego.
 */
function alFormularioDesde(req, datos) {
  const ivs = Object.fromEntries(STATS.map((s) => [s, req.stats.includes(s) ? IV_MAX : 0]));
  const especie = req.especieLibre ? (req.especieSugerida ?? '') : req.especieSugerida;
  fijar({
    vista: 'inventario',
    alFormulario: ejemplarNuevo({
      especie: datos.pokedex[especie] ? especie : '',
      sexo: req.sexo ?? undefined,
      naturaleza: req.naturaleza ?? null,
      ivs,
      movimientos: [...(req.movimientos ?? [])],
    }),
  });
}
