// El formulario del Pokémon objetivo: lo que el usuario quiere conseguir.

import { el, tarjeta, chip, aviso, frag, campoConSugerencias, interruptor } from './componentes.js';
import { STATS, NOMBRE_STAT, REGIONES, EV_MAX_POR_STAT, EV_MAX_TOTAL, IV_MAX, SEXOS } from '../nucleo/constantes.js';
import { obtener, fijarYGuardar } from './estado.js';
import { validarObjetivo } from '../nucleo/planificador.js';
import { habilidadesDe } from '../nucleo/habilidades.js';
import { crearResolutores } from '../nucleo/nombres.js';
import { seccionImportar, seccionRevisar, DESTINOS } from './importador.js';

let resolutores = null;
const res = (datos) => (resolutores ??= crearResolutores(datos));

export function vistaObjetivo(datos) {
  const { objetivo, regionesDisponibles } = obtener();
  const p = datos.pokedex[objetivo.especie];

  // Acepta un objeto o una función del objetivo ACTUAL. La forma de función es
  // la importante: el `objetivo` del cierre es del último pintado, y si se
  // encadenan dos cambios sin repintar en medio, el segundo pisaría al primero.
  const cambiaObjetivo = (parcial) =>
    fijarYGuardar((e) => ({
      objetivo: { ...e.objetivo, ...(typeof parcial === 'function' ? parcial(e.objetivo) : parcial) },
    }));

  // ------------------------------------------------------------- la especie
  const bloqueEspecie = tarjeta('¿Qué quieres criar?', [
    el('div.fila', {}, [
      campoConSugerencias(
        'especie', 'Especie', objetivo.especie, datos.especies,
        (v) => {
          const especie = v ? (res(datos).especie(v).valor ?? v) : '';
          // Al cambiar de especie, habilidad y movimientos dejan de valer.
          cambiaObjetivo((o) => (o.especie === especie ? {} : { especie, habilidad: null, movimientos: [] }));
        },
        { placeholder: 'Larvitar, Chimchar…' },
      ),
      el('div', { style: 'flex:0 0 150px' }, [
        el('label', { for: 'sexo', texto: 'Sexo que quieres' }),
        el('select', { id: 'sexo', onchange: (e) => cambiaObjetivo({ sexo: e.target.value || null }) }, [
          el('option', { value: '', selected: !objetivo.sexo }, ['Me da igual']),
          el('option', { value: SEXOS.MACHO, selected: objetivo.sexo === SEXOS.MACHO }, ['♂ Macho']),
          el('option', { value: SEXOS.HEMBRA, selected: objetivo.sexo === SEXOS.HEMBRA }, ['♀ Hembra']),
        ]),
      ]),
    ]),
    p ? el('div.etiquetas', { style: 'margin-top:10px' }, [
      chip(`Grupo huevo: ${p.gruposHuevo.join(' / ')}`, 'si'),
      chip(`Género: ${p.genero.sinGenero ? 'sin género' : `${p.genero.macho}% ♂ / ${p.genero.hembra}% ♀`}`),
      p.base !== objetivo.especie ? chip(`Del huevo sale ${p.base}`, 'ojo') : null,
      chip(`Tipos: ${p.tipos.join(' / ')}`),
    ]) : el('p.vacio', { texto: 'Escribe una especie para empezar.' }),
  ]);

  // ----------------------------------------------------------------- IVs
  const cuantos31 = STATS.filter((s) => objetivo.ivs[s] >= IV_MAX).length;
  const bloqueIvs = tarjeta(`IVs a 31 · ${cuantos31} marcados`, [
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
  const bloqueNaturaleza = tarjeta('Naturaleza', [
    el('div.fila', {}, [
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
  const bloqueEvs = tarjeta(`EVs · ${totalEv} de ${EV_MAX_TOTAL}`, [
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

  // ------------------------------------------------- habilidad y movimientos
  const habs = p ? habilidadesDe(objetivo.especie, datos.pokedex) : { normales: [], ocultas: [] };
  const bloqueHabilidad = tarjeta('Habilidad', [
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

  const movsPosibles = p
    ? [...new Set([
        ...p.movimientos.nivel.map((m) => m.nombre),
        ...p.movimientos.mt, ...p.movimientos.tutor, ...p.movimientos.huevo,
        ...p.movimientos.huevoEspecial, ...p.movimientos.especial,
        ...p.movimientos.alEvolucionar, ...p.movimientos.dePreevolucion,
      ])].sort()
    : [];

  const bloqueMovimientos = tarjeta(`Movimientos · ${objetivo.movimientos.length} de 4`, [
    p
      ? frag([
          el('p.nota', {}, [`${movsPosibles.length} movimientos posibles para ${objetivo.especie}.`]),
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
                        `${objetivo.especie} no aprende "${v}"` +
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
  const bloqueRegiones = tarjeta('Regiones que tienes desbloqueadas', [
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
  ]);

  // ------------------------------------------------------------ validación
  let validacion = null;
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
      v.valido ? el('p', {}, [
        el('a.boton', { href: '#', onclick: (e) => { e.preventDefault(); fijarYGuardar({ vista: 'plan' }); } }, ['Ver el plan →']),
      ]) : null,
    ]);
  }

  return frag([
    // La importación va primero: si ya tienes la ficha del competitivo que
    // quieres criar, es más rápido pegarla que rellenar siete bloques.
    seccionImportar(datos, DESTINOS.OBJETIVO),
    seccionRevisar(datos, DESTINOS.OBJETIVO),
    bloqueEspecie, bloqueIvs, bloqueNaturaleza, bloqueHabilidad,
    bloqueMovimientos, bloqueEvs, bloqueRegiones,
    validacion ? tarjeta(null, [validacion]) : null,
  ]);
}
