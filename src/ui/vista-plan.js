// El plan: el árbol de padres, los pasos en orden y el presupuesto.

import { el, tarjeta, plegable, chip, aviso, frag, tabla, numero, sprite } from './componentes.js';
import { NOMBRE_STAT, STATS, IV_MAX, INCUBADORAS, ACELERAR_HUEVO } from '../nucleo/constantes.js';
import { obtener, fijar, fijarYGuardar, crianzaActiva } from './estado.js';
import { contar, criaDe, ROL } from '../nucleo/planificador.js';
import { normalizar, ejemplarNuevo, loQueFalta, evaluar } from '../nucleo/inventario.js';
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

/**
 * Qué Pokémon enseña un nodo del árbol.
 *
 * La raíz es el objetivo y un nodo del inventario es el ejemplar que ya está en
 * la caja. Para un hueco por conseguir, la especie NO está en el nodo: la
 * resuelve `loQueFalta()` mirando la espina, así que aquí llega ya hecha en
 * `sugeridas`, indexada por id de nodo. Un hueco «libre» no tiene especie y no
 * enseña ninguna — que es justo lo que «libre» quiere decir.
 *
 * Un cruce intermedio tampoco enseña nada: la cría sale de la madre, y quién es
 * la madre lo dicen sus hijos, un renglón más abajo.
 */
const especieDelNodo = (nodo, objetivo, esRaiz, sugeridas) => {
  if (esRaiz) return objetivo.especie;
  if (nodo.tipo === 'inventario') return nodo.ejemplar?.especie ?? null;
  if (nodo.tipo === 'conseguir') return sugeridas.get(nodo.id) ?? null;
  return null;
};

function pintarArbol(nodo, objetivo, sugeridas, esRaiz = true) {
  const sexo = nodo.sexoNecesario ?? '';
  const especie = especieDelNodo(nodo, objetivo, esRaiz, sugeridas);

  const cabeza = el('span.nodo', {}, [
    especie ? sprite(especie, { tam: 'mini', sexo }) : null,
    el('strong', { texto: etiquetaBonita(nodo, objetivo) }),
    !esRaiz && sexo ? chip(sexo) : null,
    nodo.tipo === 'inventario' ? chip(`ya lo tienes: ${nodo.ejemplar.especie}`, 'bien') : null,
    nodo.tipo === 'conseguir' ? chip(nodo.rol === ROL.LIBRE ? 'capturar · especie libre' : 'capturar', 'ojo') : null,
    nodo.objeto ? el('span.obj', { texto: `lleva ${nodo.objeto}` }) : null,
  ]);

  return el('li', {}, [
    cabeza,
    nodo.hijos.length ? el('ul', {}, nodo.hijos.map((h) => pintarArbol(h, objetivo, sugeridas, false))) : null,
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
  // Qué especie propone el plan para cada hueco por conseguir. Se calcula una
  // vez aquí y se pasa al árbol: el nodo no la lleva encima, la deduce
  // `loQueFalta()` a partir de la espina.
  const sugeridas = new Map(
    plan.pasos.conseguir.filter((r) => !r.especieLibre).map((r) => [r.nodo, r.especieSugerida]),
  );
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
      // Lo que la cadena entrega de verdad: con un pseudo 31 de por medio, ese
      // IV sale a 30 y hay que verlo sin abrir nada.
      ...(plan.ivsCortos ?? []).map((st) => chip(`${NOMBRE_STAT[st]} a 30`, 'ojo')),
      ...(plan.suerte ?? []).map((x) =>
        chip(`${NOMBRE_STAT[x.stat]}: ${Math.round(x.probabilidad * 100)} % de 31`, 'ojo')),
      // Que se vea que el plan no es la primera forma que salió: se prueban
      // varias y se queda la que menos pide contra TU inventario.
      plan.candidatosProbados > 1
        ? chip(`el mejor de ${plan.candidatosProbados} formas de criarlo`, 'si')
        : null,
    ]),
    plan.avisos?.length
      ? el('div.aviso', {}, [el('ul', {}, plan.avisos.map((x) => el('li', { texto: x })))])
      : null,
    cuentas.inventario === 0 && obtener().inventario.length > 0
      ? aviso('Nada de tu inventario encaja en esta cadena. Mira la pestaña Inventario para ver por qué.')
      : null,
    bloqueSobrantes(plan, datos),
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
    el('ul.arbol', {}, [pintarArbol(plan.arbol, objetivo, sugeridas)]),
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
      ['Concepto', 'Para qué', 'Cantidad', 'Unidad', 'Total', 'En PB', 'Fuente'],
      pres.lineas.map((l) => [
        l.concepto,
        // Cuál es cuál: en la tienda «Franja Recia» a secas no dice nada.
        l.para ?? '—',
        numero(l.cuantos),
        l.precioUnidad != null ? `${numero(l.precioUnidad)} ${l.moneda}` : (l.nota ?? '—'),
        l.coste != null ? numero(l.coste) : '—',
        // La vía sin dinero. Lo que no se puede pagar en PB se dice, no se deja
        // en blanco: la Piedraeterna y el pago del sexo no tienen precio en PB.
        l.pb != null ? `${numero(l.pb)} BP` : chip('no se paga en PB', 'ojo'),
        l.fuente === 'wiki' ? chip('wiki', 'bien')
          : l.fuente === 'estimado' ? chip('estimado', 'ojo')
          : l.fuente === 'respaldo' ? chip('respaldo', 'ojo') : '—',
      ]),
      [2, 4],
    ),
    pres.totalPb
      ? el('p.nota', {}, [
          el('strong', { texto: `${numero(pres.totalPb)} BP` }),
          ' es lo que costarían en Puntos de Batalla los objetos que se venden por PB ',
          `(los Recios, a 750 BP en la ${pres.lineas.find((l) => l.pbDonde)?.pbDonde ?? 'Torre Batalla'}). `,
          pres.pbNoCubre.length
            ? `Lo que NO se puede pagar en PB: ${pres.pbNoCubre.join(', ')} — eso va en PokéYen y no hay alternativa.`
            : '',
        ])
      : null,
    pres.hayEstimados
      ? aviso('Hay líneas estimadas. La wiki sólo publica los extremos del pago por sexo (5.000 y 25.000); los tramos de en medio no están en ninguna fuente.')
      : null,

    // Casi todo el presupuesto son precios de tienda, que no se mueven. La
    // Piedraeterna es la excepción: no se vende en ninguna tienda, así que su
    // línea lleva un precio de mercado, y un precio de mercado caduca.
    pres.dondeComprar?.length
      ? el('div.nota', {}, [
          ...pres.dondeComprar.flatMap((d) => [
            el('span', {}, [
              el('strong', { texto: `${d.objeto} × ${d.cuantos}: ` }),
              `${d.consejo} `,
              `En el último año se movió entre ${numero(d.gtl.min)} (${d.gtl.minFecha}) y `,
              `${numero(d.gtl.max)} (${d.gtl.maxFecha}), así que las ${d.cuantos} pueden salirte `,
              `desde ${numero(d.gtl.min * d.cuantos)} hasta ${numero(d.gtl.max * d.cuantos)} PokéYen.`,
            ]),
            el('br'),
          ]),
          el('span.tenue', {
            texto: `El precio de mercado sale de ${pres.dondeComprar[0].gtl.fuente} y caduca: `
              + 'vuelve a mirarlo antes de comprar. Lo demás son precios de tienda, que no se mueven.',
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
              ' — ',
              // Los dos padres con su cara: en una tanda de ocho huevos, leer
              // seis nombres parecidos seguidos es donde se equivoca uno.
              el('span.con-sprite', {}, [
                sprite(n.hijos[0].ejemplar.especie, { tam: 'mini', sexo: '♀' }),
                el('span', { texto: `${n.hijos[0].ejemplar.especie} ♀` }),
              ]),
              ' × ',
              el('span.con-sprite', {}, [
                sprite(n.hijos[1].ejemplar.especie, { tam: 'mini', sexo: '♂' }),
                el('span', { texto: `${n.hijos[1].ejemplar.especie} ♂` }),
              ]),
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
              (f.stats.length || f.naturaleza
                ? (f.stats.length ? `31 en ${f.stats.map((x) => NOMBRE_STAT[x]).join(' + ')}` : '')
                  + (f.naturaleza ? `${f.stats.length ? ' + ' : ''}naturaleza ${f.naturaleza}` : '')
                : 'cualquiera: no le pido IVs ni naturaleza') +
                ((f.movimientos ?? []).length ? ` · con ${f.movimientos.join(', ')}` : ''),
              f.sexo ?? 'cualquiera',
              f.especieLibre
                ? el('span.chip.si.con-sprite', {}, [
                    sprite(f.especieSugerida, { tam: 'mini', sexo: f.sexo }),
                    el('span', { texto: `libre — p. ej. ${f.especieSugerida}` }),
                  ])
                : (f.especiesValidas?.length ?? 0) > 1
                  ? el('span.chip.ojo.con-sprite', {}, [
                      sprite(f.especieSugerida, { tam: 'mini', sexo: f.sexo }),
                      el('span', { texto: `${f.especieSugerida} o su línea` }),
                    ])
                  : el('span.con-sprite', {}, [
                      sprite(f.especieSugerida, { tam: 'mini', sexo: f.sexo }),
                      el('span', { texto: f.especieSugerida ?? '' }),
                    ]),
              el('button.boton.mini.secundario', {
                onclick: () => alFormularioDesde(f, datos),
              }, ['Ya lo tengo']),
            ]),
            [0],
          ),
          el('p.nota', {}, [
            '«Libre» quiere decir que vale cualquier especie que comparta grupo huevo: sólo la ',
            'madre de la cadena tiene la especie atada, porque la cría sale de ella. Y «atada» es ',
            'a la LÍNEA evolutiva, no a la forma final: del huevo sale la base, así que vale ',
            'cualquiera de la línea — se sugiere el más fácil de pillar.',
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
 * Lo que el plan NO usa del inventario, y por qué.
 *
 * Es la pregunta que se hace cualquiera al ver un 2×31 en la caja mientras el
 * plan sigue pidiendo capturas: «¿por qué no lo coge?». Casi siempre la razón
 * es el sexo o la naturaleza, y callársela parece un fallo del plan. El motivo
 * lo calcula evaluar(), el mismo que usa la pestaña Inventario.
 */
function bloqueSobrantes(plan, datos) {
  const sobrantes = plan.sobrantes ?? [];
  if (!sobrantes.length) return null;

  const filas = sobrantes.map((e) => {
    const v = evaluar(e, plan, datos);
    const perfectos = STATS.filter((s) => (e.ivs?.[s] ?? 0) >= IV_MAX);
    return [
      el('span.con-sprite', {}, [
        sprite(e.especie, { tam: 'mini', sexo: e.sexo }),
        el('span', { texto: `${e.especie}${e.mote ? ` "${e.mote}"` : ''} ${e.sexo ?? ''}` }),
      ]),
      perfectos.length ? `${perfectos.length}×31 (${perfectos.map((s) => NOMBRE_STAT[s]).join(', ')})` : '—',
      e.naturaleza ?? '—',
      // Si encaja en algún hueco es que el plan ya lo tiene cubierto con algo
      // que aprovecha menos: eso no es un problema, es una reserva.
      v.sirve
        ? chip('cabe, pero ese hueco ya está cubierto', 'si')
        : (v.motivo ?? v.mensaje ?? 'no encaja en ningún hueco'),
    ];
  });

  return plegable(`Del inventario no uso ${sobrantes.length}`, [
    el('p.nota', {}, [
      'Ni se pierden ni estorban: siguen en el inventario para la siguiente crianza. ',
      'Esto es sólo para que no parezca que el plan no se ha enterado.',
    ]),
    tabla(['Cuál', 'IVs a 31', 'Naturaleza', 'Por qué no entra'], filas),
  ], { pequeno: true, id: 'sobrantes' });
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
