// El formulario del Pokémon objetivo: lo que el usuario quiere conseguir.

import {
  el, tarjeta, plegable, chip, aviso, frag, campoConSugerencias, interruptor, sprite,
} from './componentes.js';
import {
  STATS, NOMBRE_STAT, REGIONES, EV_MAX_POR_STAT, EV_MAX_TOTAL, IV_MAX, SEXOS,
} from '../nucleo/constantes.js';
import { obtener, fijarYGuardar } from './estado.js';
import { validarObjetivo } from '../nucleo/planificador.js';
import { sexosPosibles } from '../nucleo/compatibilidad.js';
import { lineaEvolutiva } from '../nucleo/aprendizaje.js';
import { habilidadesDe } from '../nucleo/habilidades.js';
import { crearResolutores } from '../nucleo/nombres.js';
import { estadisticasDe } from '../nucleo/estadisticas.js';
import { seccionImportar, seccionRevisar, DESTINOS } from './importador.js';

let resolutores = null;
const res = (datos) => (resolutores ??= crearResolutores(datos));

export function vistaObjetivo(datos) {
  const { objetivo, regionesDisponibles } = obtener();
  const p = datos.pokedex[objetivo.especie];
  const posibles = p ? sexosPosibles(p) : [];

  // Acepta un objeto o una función del objetivo ACTUAL. La forma de función es
  // la importante: el `objetivo` del cierre es del último pintado, y si se
  // encadenan dos cambios sin repintar en medio, el segundo pisaría al primero.
  const cambiaObjetivo = (parcial) =>
    fijarYGuardar((e) => ({
      objetivo: { ...e.objetivo, ...(typeof parcial === 'function' ? parcial(e.objetivo) : parcial) },
    }));

  // ------------------------------------------------------------- la especie
  const bloqueEspecie = frag([
    el('div.fila', {}, [
      campoConSugerencias(
        'especie', 'Especie', objetivo.especie, datos.especies,
        (v) => {
          const especie = v ? (res(datos).especie(v).valor ?? v) : '';
          // Al cambiar de especie, habilidad y movimientos dejan de valer. Y si
          // la nueva no tiene género, el sexo pedido se quita solo: si no, se
          // quedaba un «quiero una hembra» imposible de cumplir.
          const nueva = datos.pokedex[especie];
          cambiaObjetivo((o) => (o.especie === especie ? {} : {
            especie,
            habilidad: null,
            movimientos: [],
            sexo: sexosPosibles(nueva).includes(o.sexo) ? o.sexo : null,
          }));
        },
        { placeholder: 'Larvitar, Chimchar…', conSprites: true },
      ),
      // El selector sólo sale cuando de verdad hay algo que elegir. Sin género
      // no hay sexos; y en una línea de un solo sexo (Starmie, Nidoking,
      // Tauros) elegir el otro era pedir una captura imposible, que es justo lo
      // que el usuario veía.
      posibles.length < 2
        ? el('div', { style: 'flex:0 0 150px' }, [
            el('label', { texto: 'Sexo' }),
            el('p', { style: 'margin:0', texto: posibles[0] ?? (p ? '—' : '') }),
          ])
        : el('div', { style: 'flex:0 0 150px' }, [
            el('label', { for: 'sexo', texto: 'Sexo que quieres' }),
            el('select', { id: 'sexo', onchange: (e) => cambiaObjetivo({ sexo: e.target.value || null }) }, [
              el('option', { value: '', selected: !objetivo.sexo }, ['Me da igual']),
              el('option', { value: SEXOS.MACHO, selected: objetivo.sexo === SEXOS.MACHO }, ['♂ Macho']),
              el('option', { value: SEXOS.HEMBRA, selected: objetivo.sexo === SEXOS.HEMBRA }, ['♀ Hembra']),
            ]),
          ]),
    ]),
    // El sprite al lado de las etiquetas: es lo que confirma de un vistazo que
    // la especie escrita es la que se quería. El sexo cuenta porque 97 especies
    // se dibujan distintas según sea ♂ o ♀.
    p ? el('div.ficha-especie', {}, [
      sprite(objetivo.especie, { tam: 'grande', sexo: objetivo.sexo }),
      el('div.etiquetas', {}, [
        chip(`Grupo huevo: ${p.gruposHuevo.join(' / ')}`, 'si'),
        chip(`Género: ${p.genero.sinGenero ? 'sin género' : `${p.genero.macho}% ♂ / ${p.genero.hembra}% ♀`}`),
        // De la línea sale la base, así que se enseña también a quién se cría
        // de verdad: el huevo no eclosiona en la forma final.
        p.base !== objetivo.especie
          ? el('span.chip.ojo.con-sprite', {}, [
              sprite(p.base, { tam: 'mini' }), el('span', { texto: `Del huevo sale ${p.base}` }),
            ])
          : null,
        chip(`Tipos: ${p.tipos.join(' / ')}`),
      ]),
    ]) : el('p.vacio', { texto: 'Escribe una especie para empezar.' }),
  ]);

  // ----------------------------------------------------------------- IVs
  const cuantos31 = STATS.filter((s) => objetivo.ivs[s] >= IV_MAX).length;
  const bloqueIvs = frag([
    el('h3', { texto: `IVs a 31 · ${cuantos31} marcados` }),
    el('p.nota', {}, [
      'Marca los IVs que quieres perfectos. Cada uno que añades DUPLICA la cadena: ',
      'un n×31 sale de 2', el('sup', { texto: 'n-1' }), ' padres.',
    ]),
    el('div.ivs', {}, STATS.map((s) => interruptor(
      `iv-${s}`, NOMBRE_STAT[s], objetivo.ivs[s] >= IV_MAX,
      (activo) => cambiaObjetivo((o) => ({ ivs: { ...o.ivs, [s]: activo ? IV_MAX : 0 } })),
    ))),
    cuantos31 >= 5 ? aviso(
      `${cuantos31}×31 son ${2 ** (cuantos31 - 1)} padres de partida, y en PokeMMO los padres se consumen. ` +
      'Mira el presupuesto en la pestaña Plan antes de empezar.',
    ) : null,
  ]);

  // --------------------------------------------------------- naturaleza
  const nat = objetivo.naturaleza ? datos.naturalezas[objetivo.naturaleza] : null;
  const bloqueNaturaleza = frag([
    el('div.fila', { style: 'margin-top:18px' }, [
      campoConSugerencias(
        'naturaleza', 'Naturaleza (opcional)', objetivo.naturaleza ?? '', datos.nombresNaturaleza,
        (v) => cambiaObjetivo({ naturaleza: v ? (res(datos).naturaleza(v).valor ?? v) : null }),
        { placeholder: 'Agitada, Miedosa…' },
      ),
    ]),
    nat ? el('div.etiquetas', { style: 'margin-top:10px' }, [
      nat.sube ? chip(`+10 % ${nat.sube}`, 'bien') : null,
      nat.baja ? chip(`−10 % ${nat.baja}`, 'mal') : null,
      nat.neutra ? chip('neutra') : null,
      chip(`en inglés: ${nat.ingles}`),
    ]) : null,
    objetivo.naturaleza ? el('div.nota', {}, [
      el('p', { style: 'margin:0 0 6px' }, [
        'La naturaleza sólo la pasa la ', el('strong', { texto: 'Piedraeterna' }),
        ', y la pasa siempre. Ocupa el hueco de objeto de quien la lleve, así que ese cruce ',
        'se queda con un solo Recio y sólo puede forzar un IV.',
      ]),
      el('p', { style: 'margin:0' }, [
        'Que los dos padres tengan la misma naturaleza ',
        el('strong', { texto: 'no sirve de nada' }),
        ': la cría la saca al azar igual. Con los IVs sí funciona, con la naturaleza no.',
      ]),
    ]) : null,
  ]);

  // ----------------------------------------------------------------- EVs
  const totalEv = STATS.reduce((a, s) => a + (objetivo.evs[s] ?? 0), 0);
  const bloqueEvs = tarjeta(`Entrenamiento · ${totalEv} de ${EV_MAX_TOTAL} EVs`, [
    el('p.nota', {}, [
      `Máximo ${EV_MAX_POR_STAT} por característica y ${EV_MAX_TOTAL} en total. `,
      'El reparto típico es 252 + 252 + 6.',
    ]),
    el('div.rejilla', {}, STATS.map((s) => el('div', {}, [
      el('label', { for: `ev-${s}`, texto: NOMBRE_STAT[s] }),
      el('input', {
        id: `ev-${s}`, type: 'number', min: 0, max: EV_MAX_POR_STAT, step: 2,
        value: objetivo.evs[s] ?? 0,
        onchange: (e) => {
          const v = Math.max(0, Math.min(EV_MAX_POR_STAT, Number(e.target.value) || 0));
          cambiaObjetivo((o) => ({ evs: { ...o.evs, [s]: v } }));
        },
      }),
    ]))),
    el('div.fila', { style: 'margin-top:10px' }, [
      el('div', { style: 'flex:0 0 130px' }, [
        el('label', { for: 'nivel', texto: 'Nivel al que juegas' }),
        el('select', { id: 'nivel', onchange: (e) => cambiaObjetivo({ nivel: Number(e.target.value) }) }, [
          el('option', { value: 50, selected: objetivo.nivel === 50 }, ['50']),
          el('option', { value: 100, selected: objetivo.nivel === 100 }, ['100']),
        ]),
      ]),
      el('div', { style: 'flex:1 1 240px' }, [
        el('label', { for: 'obj-ent', texto: 'Objeto de entrenamiento' }),
        el('select', { id: 'obj-ent', onchange: (e) => cambiaObjetivo({ objetoEntrenamiento: e.target.value }) }, [
          el('option', { value: 'Vínculo de Entrenamiento', selected: objetivo.objetoEntrenamiento === 'Vínculo de Entrenamiento' }, ['Vínculo de Entrenamiento (×2 EVs, sin EXP)']),
          el('option', { value: 'Brazal Firme', selected: objetivo.objetoEntrenamiento === 'Brazal Firme' }, ['Brazal Firme (×2 EVs, baja Velocidad)']),
          el('option', { value: 'ninguno', selected: objetivo.objetoEntrenamiento === 'ninguno' }, ['Ninguno']),
        ]),
      ]),
    ]),
    totalEv > EV_MAX_TOTAL ? aviso(`Te pasas: ${totalEv} de ${EV_MAX_TOTAL}.`, 'error') : null,
  ]);

  // ------------------------------------------------------- características
  const bloqueStats = bloqueEstadisticas(objetivo, datos);

  // ------------------------------------------------- habilidad y movimientos
  const habs = p ? habilidadesDe(objetivo.especie, datos.pokedex) : { normales: [], ocultas: [] };
  const bloqueHabilidad = frag([
    p
      ? el('div.fila', {}, [
          el('div.crece', {}, [
            el('label', { for: 'habilidad', texto: 'Habilidad (opcional)' }),
            el('select', { id: 'habilidad', onchange: (e) => cambiaObjetivo({ habilidad: e.target.value || null }) }, [
              el('option', { value: '', selected: !objetivo.habilidad }, ['Me da igual']),
              ...habs.normales.map((h) => el('option', { value: h, selected: objetivo.habilidad === h }, [h])),
              ...habs.ocultas.map((h) => el('option', { value: h, selected: objetivo.habilidad === h }, [`${h} (oculta)`])),
            ]),
          ]),
        ])
      : el('p.vacio', { texto: 'Elige una especie primero.' }),
    habs.ocultas.includes(objetivo.habilidad) ? aviso(
      'Es la habilidad oculta: la vía documentada es un Parche de Habilidad sobre la cría terminada. ' +
      'La wiki no dice si se hereda al criar, así que el plan no cuenta con la suerte.',
    ) : null,
  ]);

  // La lista sale de la LÍNEA EVOLUTIVA entera, no sólo de la forma final.
  // El huevo eclosiona en la base, así que un movimiento huevo de la base llega
  // a la evolución: pedirle Polvo Veneno a un Amoonguss es legítimo —lo trae
  // Foongus— y el campo lo rechazaba por mirar sólo a Amoonguss.
  const movsPosibles = p
    ? [...new Set(
        lineaEvolutiva(objetivo.especie, datos.pokedex)
          .map((f) => datos.pokedex[f.especie])
          .filter(Boolean)
          .flatMap((x) => [
            ...x.movimientos.nivel.map((m) => m.nombre),
            ...x.movimientos.mt, ...x.movimientos.tutor, ...x.movimientos.huevo,
            ...x.movimientos.huevoEspecial, ...x.movimientos.especial,
            ...x.movimientos.alEvolucionar, ...x.movimientos.dePreevolucion,
          ]),
      )].sort()
    : [];

  const bloqueMovimientos = frag([
    el('h3', { texto: `Movimientos · ${objetivo.movimientos.length} de 4` }),
    p
      ? frag([
          el('p.nota', {}, [
            `${movsPosibles.length} movimientos posibles para ${objetivo.especie}`,
            lineaEvolutiva(objetivo.especie, datos.pokedex).length > 1
              ? ' y su línea evolutiva: los de una fase anterior también valen, y el orden para '
                + 'conseguirlos sale en Entrenamiento.'
              : '.',
          ]),
          el('div.etiquetas', { style: 'margin-bottom:10px' }, objetivo.movimientos.map((m) =>
            el('button.boton.mini.secundario', {
              onclick: () => cambiaObjetivo((o) => ({ movimientos: o.movimientos.filter((x) => x !== m) })),
              title: 'quitar',
            }, [`${m} ✕`]))),
          objetivo.movimientos.length < 4
            ? frag([
                el('div.fila', {}, [campoConSugerencias(
                  'nuevo-mov', 'Añadir movimiento', '',
                  movsPosibles.filter((m) => !objetivo.movimientos.includes(m)),
                  (v) => {
                    if (!v) return;
                    // Se resuelve igual que en el importador, así que escribir
                    // "Desenrollar" añade Rodar. Lo que no aprende la especie no
                    // entra: se dice, no se cuela.
                    const r = res(datos).movimiento(v);
                    const nombre = r.valor;
                    if (!nombre || !movsPosibles.includes(nombre)) {
                      fijarYGuardar({ avisoMovimiento:
                        `Ni ${objetivo.especie} ni su línea evolutiva aprenden "${v}"` +
                        (nombre && nombre !== v ? ` (lo he leído como ${nombre})` : '') + '.' });
                      return;
                    }
                    fijarYGuardar({ avisoMovimiento: null });
                    cambiaObjetivo((o) =>
                      (!o.movimientos.includes(nombre) && o.movimientos.length < 4
                        ? { movimientos: [...o.movimientos, nombre] }
                        : {}));
                  },
                  { placeholder: 'toca para ver la lista' },
                )]),
                obtener().avisoMovimiento ? aviso(obtener().avisoMovimiento) : null,
              ])
            : el('p.nota', { texto: 'Ya tienes cuatro: quita uno para cambiarlo.' }),
        ])
      : el('p.vacio', { texto: 'Elige una especie primero.' }),
  ]);

  // ------------------------------------------------------------- regiones
  const bloqueRegiones = plegable('Regiones desbloqueadas', [
    el('p.nota', {}, [
      'Esto filtra TODAS las sugerencias de captura y de entrenamiento. Hay Pokémon que sólo ',
      'aparecen en una región: si no la tienes, no te lo propongo.',
    ]),
    el('div.regiones', {}, REGIONES.map((r) => interruptor(
      `region-${r}`, r, regionesDisponibles.includes(r),
      (activo) => fijarYGuardar((e) => ({
        regionesDisponibles: activo
          ? [...new Set([...e.regionesDisponibles, r])]
          : e.regionesDisponibles.filter((x) => x !== r),
      })),
    ))),
    regionesDisponibles.length === 0
      ? aviso('Sin ninguna región no puedo sugerir dónde capturar nada.', 'error')
      : null,
  ], {
    extra: regionesDisponibles.length === REGIONES.length
      ? 'las cinco' : (regionesDisponibles.join(', ') || 'ninguna'),
    abierto: regionesDisponibles.length === 0,
  });

  // ------------------------------------------------------------ validación
  let validacion = null;
  let sueltoAlFinal = false;
  if (objetivo.especie && p) {
    const v = validarObjetivo(objetivo, datos);
    validacion = frag([
      v.problemas.length
        ? el('div.error', {}, [el('strong', { texto: 'Esto no se puede criar así:' }),
            el('ul', {}, v.problemas.map((x) => el('li', { texto: x })))])
        : null,
      v.avisos.length
        ? el('div.aviso', {}, [el('strong', { texto: 'A tener en cuenta:' }),
            el('ul', {}, v.avisos.map((x) => el('li', { texto: x })))])
        : null,
      v.valido ? el('p', { style: 'margin:0' }, [
        el('a.boton', { href: '#', onclick: (e) => { e.preventDefault(); fijarYGuardar({ vista: 'plan' }); } }, ['Ver el plan →']),
      ]) : null,
    ]);
    // Sin problemas ni avisos es sólo un botón: no merece una tarjeta vacía.
    if (v.valido && !v.problemas.length && !v.avisos.length) sueltoAlFinal = true;
  }

  // Tres tarjetas y dos plegables, no nueve tarjetas: el formulario entero
  // cabía en una pantalla y media de móvil y era un pasillo de cajas iguales.
  // Lo secundario —importar y las regiones— se pliega; lo que se toca en cada
  // crianza se queda a la vista.
  return frag([
    // Si ya tienes la ficha del competitivo que quieres criar, pegarla es más
    // rápido que rellenar el formulario; pero es el camino de menos gente, así
    // que va plegado y ocupa una línea.
    plegable('Importar el objetivo de una ficha', [
      seccionImportar(datos, DESTINOS.OBJETIVO, { comoTarjeta: false }),
    ], { extra: 'imagen, texto o archivo', abierto: !!obtener().importacion }),
    seccionRevisar(datos, DESTINOS.OBJETIVO),

    tarjeta('¿Qué quieres criar?', [bloqueEspecie, bloqueIvs, bloqueNaturaleza]),
    p ? tarjeta('Habilidad y movimientos', [bloqueHabilidad, bloqueMovimientos]) : null,
    bloqueEvs,
    bloqueStats,
    bloqueRegiones,
    validacion ? (sueltoAlFinal ? validacion : tarjeta(null, [validacion])) : null,
  ]);
}

// -------------------------------------------------------- características

/**
 * Las seis características del objetivo, con barra.
 *
 * Va en Objetivo y no en Entrenamiento a propósito: **todo lo que entra en el
 * número se toca en esta misma página** —la especie, los IVs, la naturaleza,
 * los EVs y el nivel—, así que aquí la tarjeta es el resultado de lo de arriba
 * y se mueve mientras el usuario juega con los mandos. Entrenamiento habla de
 * DÓNDE farmear esos EVs, que es otra pregunta.
 *
 * Una sola barra por característica, con dos tramos, que es lo que pidió el
 * usuario: la **base** del Pokémon y encima lo que suman los **IVs y los EVs**.
 * Los dos tramos están en la misma unidad y eso no es un apaño de dibujo: sale
 * de la propia fórmula, donde un IV y unos EVs valen exactamente
 * `(IV + ⌊EV/4⌋)/2` puntos de base, sin depender del nivel. Ver
 * `nucleo/estadisticas.js`.
 *
 * Los colores: la base en gris y lo que tú aportas en la insignia blanca. El
 * carmesí NO se usa aquí — es de las acciones, y una barra de datos no lo es;
 * la imagen de referencia coloreaba por tramos de valor (rojo/verde/azul) y esa
 * escala no existe en esta paleta.
 */
function bloqueEstadisticas(objetivo, datos) {
  const { plan } = obtener();
  // Los IVs que la crianza entrega DE VERDAD, no los que se pidieron: con un
  // pseudo 31 el número final es otro. Es el mismo criterio de Entrenamiento.
  const ivsReales = plan?.ok ? { ...objetivo.ivs, ...plan.ivsFinales } : objetivo.ivs;
  const st = estadisticasDe(objetivo, datos, { ivs: ivsReales });
  if (!st) return null;

  const pct = (n) => `${Math.max(0, Math.min(100, (n / st.tope) * 100))}%`;

  const fila = (f) => el('div.stat', {}, [
    el('span.stat-nombre', {}, [
      f.nombre,
      f.efecto
        ? el('span', {
            class: `stat-nat ${f.efecto}`,
            title: `La naturaleza ${objetivo.naturaleza} se la ${f.efecto} un 10 %`,
            texto: f.efecto === 'sube' ? ' ▲' : ' ▼',
          })
        : null,
    ]),
    el('span.stat-base-num', { texto: String(f.base) }),
    el('span.stat-barra', {
      title: `${f.base} de base + ${f.bono} que ponen ${f.iv} IVs y ${f.ev} EVs`,
    }, [
      el('i.stat-tramo-base', { style: `width:${pct(f.base)}` }),
      f.bono ? el('i.stat-tramo-bono', { style: `width:${pct(f.bono)}` }) : null,
    ]),
    el('span.stat-cifra', {}, [el('strong', { texto: String(f.valor) })]),
  ]);

  const conIvs = st.filas.filter((f) => f.iv > 0);

  return tarjeta('Estadísticas', [
    el('div.etiquetas', {}, [
      chip(`${st.total} de base en total`, 'si'),
      chip(`a nivel ${st.nivel}`),
      objetivo.naturaleza ? chip(`naturaleza ${objetivo.naturaleza}`) : null,
    ]),
    el('div.stats', {}, st.filas.map(fila)),
    el('p.leyenda', {}, [
      el('span.muestra.base', { 'aria-hidden': 'true' }), ' base del Pokémon ',
      el('span.muestra.bono', { 'aria-hidden': 'true' }), ' lo que suman IVs y EVs ',
      '· la cifra de la derecha es la característica final',
    ]),
    el('p.nota', {}, [
      conIvs.length
        ? `Cuenta los EVs de arriba y los IVs que la crianza entrega de verdad: ${conIvs.map((f) => `${f.nombre} ${f.iv}`).join(', ')}. `
        : 'Todavía no has pedido ningún IV, así que la parte blanca es sólo lo que ponen los EVs. ',
      'Los IVs que NO pides cuentan como 0: salen al azar entre 0 y 31 y darlos por altos sería mentir ',
      '— si alguno te sale bien, anótalo y el número sube solo.',
    ]),
    // Regla 2: lo que es inferencia se dice, no se disimula.
    el('p.nota', {}, [
      el('strong', { texto: 'Ojo: ' }),
      'la fórmula es la estándar de 5ª generación. La wiki avisa de que no está comprobado ',
      'si PokeMMO la usa tal cual o la toca (',
      el('code', { texto: 'wiki/mecanicas/IVs.md' }),
      '), así que estos números son una estimación buena, no un dato del juego.',
    ]),
  ]);
}
