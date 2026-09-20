// El inventario: registro manual, importación y qué hacer cuando la captura no
// sale como decía el plan.
//
// Las tres vías de registro conviven a propósito y acaban en el mismo sitio:
//
//   manual  -> formulario
//   texto   -> src/nucleo/importar.js
//   imagen  -> src/ui/ocr.js -> el MISMO importar.js
//
// Y ninguna de las dos automáticas guarda nada sin pasar por la pantalla de
// revisión: un OCR que se equivoque en un IV rompería el plan entero en silencio.

import { el, tarjeta, chip, aviso, frag, tabla, campoConSugerencias } from './componentes.js';
import { STATS, NOMBRE_STAT, IV_MAX, EV_MAX_POR_STAT, SEXOS } from '../nucleo/constantes.js';
import { obtener, fijarYGuardar, fijar } from './estado.js';
import {
  ejemplarNuevo, normalizar, resumen, cuantosPerfectos, totalIvs,
  evaluar, loQueFalta, exportar, importar as importarJson,
} from '../nucleo/inventario.js';
import { importar as importarTexto, PLANTILLA } from '../nucleo/importar.js';
import { crearResolutores } from '../nucleo/nombres.js';
import { reconocer, PESO_MODELO_MB } from './ocr.js';

let borrador = ejemplarNuevo();
let textoPegado = '';
let resolutores = null;

const res = (datos) => (resolutores ??= crearResolutores(datos));

/** Movimientos que la especie puede aprender, para las sugerencias. */
function learnsetDe(especie, datos) {
  const p = datos.pokedex[especie];
  if (!p) return Object.keys(datos.movimientos);
  const m = p.movimientos;
  return [...new Set([
    ...m.nivel.map((x) => x.nombre), ...m.mt, ...m.tutor, ...m.huevo,
    ...m.huevoEspecial, ...m.especial, ...m.alEvolucionar, ...m.dePreevolucion,
  ])].sort();
}

export function vistaInventario(datos) {
  const { inventario, plan, ultimaEvaluacion, importacion, ocr, vistaImportar, avisoPersistencia } = obtener();

  return frag([
    bloqueFaltan(plan),
    bloqueImportar(datos, vistaImportar ?? 'imagen', ocr),
    importacion ? bloqueRevisar(datos, importacion) : null,
    bloqueManual(datos),
    ultimaEvaluacion ? bloqueEvaluacion(ultimaEvaluacion) : null,
    bloqueLista(inventario),
    bloqueCopia(inventario, avisoPersistencia),
  ]);
}

// ----------------------------------------------------- qué pide el plan ahora

function bloqueFaltan(plan) {
  if (!plan?.ok) return null;
  const faltan = loQueFalta(plan);
  return tarjeta('Lo que le falta al plan', [
    faltan.length
      ? tabla(
          ['Cuántos', 'Qué', 'Sexo', 'Especie', 'Movimientos'],
          faltan.map((f) => [
            `×${f.cuantos}`,
            (f.stats.length ? `31 en ${f.stats.map((s) => NOMBRE_STAT[s]).join(' + ')}` : '') +
              (f.naturaleza ? `${f.stats.length ? ' + ' : ''}naturaleza ${f.naturaleza}` : ''),
            f.sexo ?? 'cualquiera',
            f.especieLibre ? chip('cualquiera del grupo huevo', 'si') : f.especieSugerida,
            (f.movimientos ?? []).length ? chip(f.movimientos.join(', '), 'ojo') : '—',
          ]),
          [0],
        )
      : el('p', {}, [chip('nada: el inventario ya cubre el plan', 'bien')]),
  ]);
}

// ------------------------------------------------------------- importación

function bloqueImportar(datos, sub, ocr) {
  const pestana = (clave, etiqueta) =>
    el(`button.boton.mini${sub === clave ? '' : '.secundario'}`, {
      onclick: () => fijar({ vistaImportar: clave }),
    }, [etiqueta]);

  const cuerpo = {
    imagen: () => frag([
      el('p.nota', {}, [
        'Sube una captura de la ficha del juego (menú del equipo → Datos) y la leo para ',
        'rellenarte los campos. Siempre te la enseño antes de guardar: el OCR se equivoca, ',
        'y un IV mal leído rompería el plan sin que se note.',
      ]),
      el('div.fila', {}, [
        el('label.boton', { for: 'ocr-archivo', style: 'cursor:pointer;text-align:center' }, ['Elegir imagen…']),
        el('input', {
          id: 'ocr-archivo', type: 'file', accept: 'image/*', style: 'display:none',
          onchange: (ev) => leerImagen(ev.target.files?.[0], datos),
        }),
      ]),
      ocr?.activo
        ? el('div.nota', {}, [
            el('strong', { texto: `${ocr.fase}… ${ocr.porcentaje}%` }),
            el('div', { style: 'margin-top:6px;height:6px;background:var(--fondo-alt2);border-radius:3px;overflow:hidden' }, [
              el('div', { style: `height:100%;width:${ocr.porcentaje}%;background:var(--acento);transition:width .2s` }),
            ]),
          ])
        : null,
      ocr?.error ? aviso(ocr.error, 'error') : null,
      el('p.nota', {}, [
        `La primera vez descarga el modelo de español (~${PESO_MODELO_MB} MB) y se queda guardado. `,
        'Si estás con datos del móvil, mejor la vía de texto.',
      ]),
    ]),

    texto: () => frag([
      el('p.nota', {}, [
        'Pega la ficha tal cual, o varios Pokémon separados por una línea en blanco. ',
        'El orden de las líneas da igual y los dos puntos son opcionales.',
      ]),
      el('textarea', {
        id: 'texto-importar', value: textoPegado, placeholder: PLANTILLA,
        oninput: (ev) => { textoPegado = ev.target.value; },
        style: 'min-height:170px',
      }),
      el('div.fila', { style: 'margin-top:10px' }, [
        el('button.boton', { onclick: () => procesarTexto(textoPegado, datos) }, ['Leer el texto']),
        el('button.boton.secundario', {
          onclick: () => { textoPegado = PLANTILLA; fijar({}); },
        }, ['Rellenar con el ejemplo']),
      ]),
    ]),

    archivo: () => frag([
      el('p.nota', {}, [
        'Vale un ',
        el('code', { texto: '.txt' }), ' con el formato de arriba, un ',
        el('code', { texto: '.csv' }), ' con cabecera (', el('code', { texto: 'especie,sexo,ivs,naturaleza,movimientos' }),
        ') o un ', el('code', { texto: '.json' }), ' exportado por esta misma app.',
      ]),
      el('div.fila', {}, [
        el('label.boton', { for: 'archivo-importar', style: 'cursor:pointer;text-align:center' }, ['Elegir archivo…']),
        el('input', {
          id: 'archivo-importar', type: 'file', accept: '.txt,.csv,.json,text/plain', style: 'display:none',
          onchange: (ev) => leerArchivoTexto(ev.target.files?.[0], datos),
        }),
      ]),
      el('p.nota', {}, ['El formato completo está en ', el('code', { texto: 'docs/formato-de-importacion.md' }), '.']),
    ]),
  }[sub] ?? (() => null);

  return tarjeta('Importar', [
    el('div.fila', { style: 'margin-bottom:12px' }, [
      pestana('imagen', '📷 Imagen'),
      pestana('texto', '📋 Texto'),
      pestana('archivo', '📄 Archivo'),
    ]),
    cuerpo(),
  ]);
}

function bloqueRevisar(datos, imp) {
  const utiles = imp.ejemplares.filter((e) => e.especie);
  return tarjeta(`Revisar antes de guardar · ${utiles.length} Pokémon`, [
    el('p.nota', {}, ['Comprueba los IVs uno por uno: es lo que más cuesta de leer y lo que más daño hace si está mal.']),

    imp.resoluciones.length
      ? el('div.nota', {}, [
          el('strong', { texto: 'Nombres que he interpretado:' }),
          el('ul', {}, imp.resoluciones.map((r) => el('li', {}, [
            `${r.campo}: "${r.entrada}" → `, el('strong', { texto: r.valor }),
            ' ', chip(r.via === 'alias-cliente' ? 'nombre del juego' : r.via, r.via === 'aproximado' ? 'ojo' : 'si'),
          ]))),
        ])
      : null,

    imp.avisos.length
      ? el('div.aviso', {}, [
          el('strong', { texto: 'Cosas que no he entendido:' }),
          el('ul', {}, imp.avisos.map((a) => el('li', { texto: a }))),
        ])
      : null,

    utiles.length
      ? tabla(
          ['Especie', 'Sexo', 'Naturaleza', 'Habilidad', ...STATS.map((s) => NOMBRE_STAT[s]), 'Movimientos'],
          utiles.map((e) => [
            e.especie, e.sexo, e.naturaleza ?? '—', e.habilidad ?? '—',
            ...STATS.map((s) => el('span', {
              texto: String(e.ivs[s]),
              style: e.ivs[s] >= IV_MAX ? 'color:var(--bien);font-weight:700' : '',
            })),
            (e.movimientos ?? []).join(', ') || '—',
          ]),
          [4, 5, 6, 7, 8, 9],
        )
      : aviso('No he sacado ningún Pokémon con especie reconocible. Prueba con la vía de texto.', 'error'),

    el('div.fila', { style: 'margin-top:12px' }, [
      utiles.length
        ? el('button.boton', {
            onclick: () => fijarYGuardar((st) => ({
              inventario: [...st.inventario, ...utiles],
              importacion: null,
              ultimaEvaluacion: null,
            })),
          }, [`Guardar ${utiles.length} en el inventario`])
        : null,
      utiles.length === 1
        ? el('button.boton.secundario', {
            onclick: () => { borrador = { ...utiles[0] }; fijar({ importacion: null }); },
          }, ['Pasarlo al formulario para corregirlo'])
        : null,
      el('button.boton.secundario', { onclick: () => fijar({ importacion: null }) }, ['Descartar']),
    ]),
  ]);
}

// ----------------------------------------------------------- registro manual

function bloqueManual(datos) {
  const learnset = learnsetDe(borrador.especie, datos);

  const camposIv = el('div.ivs', {}, STATS.map((s) => el('div', {}, [
    el('label', { for: `b-iv-${s}`, texto: NOMBRE_STAT[s] }),
    el('input', {
      id: `b-iv-${s}`, type: 'number', min: 0, max: IV_MAX, value: borrador.ivs[s],
      onchange: (e) => { borrador.ivs[s] = Math.max(0, Math.min(IV_MAX, Number(e.target.value) || 0)); },
    }),
  ])));

  // Cuatro huecos de movimiento. Hacen falta para los movimientos huevo: sin
  // saber qué sabe un padre, la app no puede decidir si sirve para pasarlo.
  const camposMovimiento = el('div.rejilla', {}, [0, 1, 2, 3].map((i) => el('div', {}, [
    el('label', { for: `b-mov-${i}`, texto: `Movimiento ${i + 1}` }),
    el('input', {
      id: `b-mov-${i}`, value: borrador.movimientos[i] ?? '', list: 'b-mov-opciones',
      autocomplete: 'off', placeholder: i === 0 ? 'opcional' : '',
      onchange: (e) => {
        const bruto = e.target.value.trim();
        if (!bruto) { borrador.movimientos[i] = undefined; limpiarMovimientos(); fijar({}); return; }
        // El mismo resolutor que el importador: escribir "Desenrollar" funciona.
        const r = res(datos).movimiento(bruto);
        borrador.movimientos[i] = r.valor ?? bruto;
        borrador._avisoMov = r.valor
          ? (r.via === 'exacto' ? null : `He interpretado "${bruto}" como ${r.valor}.`)
          : `No reconozco "${bruto}"${r.candidatos.length ? ` (¿${r.candidatos.join(' o ')}?)` : ''}; lo guardo tal cual.`;
        limpiarMovimientos();
        fijar({});
      },
    }),
  ])));

  return tarjeta('Anotar una captura a mano', [
    el('p.nota', {}, [
      'Los IVs se leen directamente en el juego: menú del equipo → Datos → cuarta pestaña. ',
      'No hay que estimar nada.',
    ]),
    el('div.fila', {}, [
      campoConSugerencias('b-especie', 'Especie', borrador.especie, datos.especies,
        (v) => {
          const r = res(datos).especie(v);
          borrador.especie = r.valor ?? v;
          fijar({}); // repinta para actualizar las sugerencias de movimientos
        }, 'Rattata, Larvitar…'),
      el('div', { style: 'flex:0 0 130px' }, [
        el('label', { for: 'b-sexo', texto: 'Sexo' }),
        el('select', { id: 'b-sexo', onchange: (e) => { borrador.sexo = e.target.value; } }, [
          el('option', { value: SEXOS.MACHO, selected: borrador.sexo === SEXOS.MACHO }, ['♂ Macho']),
          el('option', { value: SEXOS.HEMBRA, selected: borrador.sexo === SEXOS.HEMBRA }, ['♀ Hembra']),
          el('option', { value: SEXOS.SIN_GENERO, selected: borrador.sexo === SEXOS.SIN_GENERO }, ['— Sin género']),
        ]),
      ]),
      campoConSugerencias('b-nat', 'Naturaleza', borrador.naturaleza ?? '', datos.nombresNaturaleza,
        (v) => { borrador.naturaleza = v ? (res(datos).naturaleza(v).valor ?? v) : null; }, 'opcional'),
    ]),

    el('h3', { texto: 'IVs' }),
    camposIv,

    el('h3', { texto: 'Movimientos' }),
    el('p.nota', {}, [
      borrador.especie
        ? `${learnset.length} movimientos posibles para ${borrador.especie}.`
        : 'Pon la especie y te sugiero sólo los que puede aprender.',
      ' Hacen falta para los movimientos huevo: un padre sólo pasa lo que sabe.',
    ]),
    camposMovimiento,
    el('datalist', { id: 'b-mov-opciones' }, learnset.map((m) => el('option', { value: m }))),
    borrador._avisoMov ? aviso(borrador._avisoMov) : null,

    el('div.fila', { style: 'margin-top:12px' }, [
      el('button.boton', { onclick: () => anadir(datos) }, ['Añadir al inventario']),
      el('button.boton.secundario', { onclick: () => comprobar(datos) }, ['Sólo comprobar si me sirve']),
      el('button.boton.secundario', { onclick: () => { borrador = ejemplarNuevo(); fijar({}); } }, ['Limpiar']),
    ]),
  ]);

  function limpiarMovimientos() {
    borrador.movimientos = borrador.movimientos.filter(Boolean);
  }
}

// ---------------------------------------------------------------- evaluación

function bloqueEvaluacion(ev) {
  return tarjeta('¿Me sirve?', [
    el(`div.${ev.sirve ? 'nota' : 'aviso'}`, {}, [
      el('strong', { texto: ev.sirve ? '✔ Sí' : '✘ No para esta cadena' }), ' — ', ev.mensaje,
    ]),
    ev.sirve && ev.mejor
      ? el('p.nota', {
          texto: `Mejor hueco: ${ev.mejor.hueco.stats.map((s) => NOMBRE_STAT[s]).join(' + ') || 'el de naturaleza'}` +
            ` · ahorra ${ev.mejor.ahorro} captura(s).`,
        })
      : el('p.nota', { texto: 'Puedes guardarlo igual: si cambias el objetivo o el plan avanza, quizá sirva después.' }),
    el('button.boton.mini.secundario', { onclick: () => fijar({ ultimaEvaluacion: null }) }, ['Cerrar']),
  ]);
}

// -------------------------------------------------------------------- lista

function bloqueLista(inventario) {
  const filas = inventario.map((e) => [
    e.especie || '(sin especie)',
    e.sexo,
    `${cuantosPerfectos(e)}×31`,
    STATS.map((s) => (e.ivs[s] >= IV_MAX ? NOMBRE_STAT[s] : null)).filter(Boolean).join(', ') || '—',
    `${totalIvs(e)}/186`,
    e.naturaleza ?? '—',
    (e.movimientos ?? []).join(', ') || '—',
    el('button.boton.mini.peligro', {
      onclick: () => fijarYGuardar((st) => ({ inventario: st.inventario.filter((x) => x.id !== e.id) })),
    }, ['Borrar']),
  ]);

  return tarjeta(`Tu inventario · ${inventario.length}`, [
    inventario.length
      ? tabla(['Especie', 'Sexo', 'Perfectos', 'IVs a 31', 'Total', 'Naturaleza', 'Movimientos', ''], filas, [4])
      : el('p.vacio', { texto: 'Vacío. Anota lo que tengas y el plan se recalculará con ello.' }),
  ]);
}

function bloqueCopia(inventario, avisoPersistencia) {
  return tarjeta('Copia de seguridad', [
    el('p.nota', {}, [
      'El inventario se guarda en este navegador (localStorage), así que no viaja a ningún sitio ',
      'ni se comparte. Si cambias de equipo, expórtalo.',
    ]),
    avisoPersistencia
      ? aviso(`No he podido guardar en este navegador (${avisoPersistencia}). La app funciona igual, pero el inventario se perderá al recargar.`)
      : null,
    el('div.fila', {}, [
      el('button.boton.secundario', { onclick: () => descargar(inventario) }, ['Exportar a archivo']),
      el('label.boton.secundario', { for: 'importar-json', style: 'cursor:pointer;text-align:center' }, ['Restaurar copia']),
      el('input', {
        id: 'importar-json', type: 'file', accept: '.json', style: 'display:none',
        onchange: (ev) => restaurarCopia(ev.target.files?.[0]),
      }),
    ]),
  ]);
}

// ---------------------------------------------------------------- acciones

function comprobar(datos) {
  const e = normalizar({ ...borrador, movimientos: borrador.movimientos.filter(Boolean) });
  if (!e.especie) { fijar({ ultimaEvaluacion: { sirve: false, mensaje: 'Pon la especie primero.' } }); return; }
  fijar({ ultimaEvaluacion: evaluar(e, obtener().plan, datos) });
}

function anadir(datos) {
  const e = normalizar({ ...borrador, movimientos: borrador.movimientos.filter(Boolean) });
  if (!e.especie) { fijar({ ultimaEvaluacion: { sirve: false, mensaje: 'Pon la especie primero.' } }); return; }
  const plan = obtener().plan;
  const evaluacion = plan?.ok ? evaluar(e, plan, datos) : null;
  borrador = ejemplarNuevo();
  fijarYGuardar((st) => ({ inventario: [...st.inventario, e], ultimaEvaluacion: evaluacion }));
}

function procesarTexto(texto, datos) {
  const imp = importarTexto(texto, datos);
  fijar({ importacion: imp, ocr: null });
}

async function leerImagen(archivo, datos) {
  if (!archivo) return;
  fijar({ ocr: { activo: true, fase: 'Empezando', porcentaje: 0 } });
  try {
    const r = await reconocer(archivo, {
      onProgreso: (p) => fijar({ ocr: { activo: true, ...p } }),
    });
    const imp = importarTexto(r.texto, datos);
    // El texto crudo se guarda para que el usuario pueda corregirlo a mano si el
    // OCR ha leído mal: es más rápido que volver a escribir la ficha entera.
    textoPegado = r.texto;
    if (!imp.ejemplares.some((e) => e.especie)) {
      fijar({
        ocr: {
          activo: false,
          error: `He leído la imagen (confianza ${Math.round(r.confianza)} %) pero no he reconocido ninguna ficha. ` +
            'Te he dejado el texto en la pestaña «Texto» para que lo corrijas a mano.',
        },
        vistaImportar: 'texto',
        importacion: imp,
      });
      return;
    }
    fijar({ ocr: null, importacion: imp });
  } catch (e) {
    fijar({
      ocr: {
        activo: false,
        error: `${e.message}. Usa la pestaña «Texto» y pega la ficha a mano: funciona sin descargar nada.`,
      },
    });
  }
}

function leerArchivoTexto(archivo, datos) {
  if (!archivo) return;
  const lector = new FileReader();
  lector.onload = () => procesarTexto(String(lector.result), datos);
  lector.onerror = () => fijar({ ocr: { activo: false, error: 'no he podido leer el archivo' } });
  lector.readAsText(archivo);
}

function descargar(inventario) {
  const blob = new Blob([exportar(inventario)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `inventario-crianza-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function restaurarCopia(archivo) {
  if (!archivo) return;
  const lector = new FileReader();
  lector.onload = () => {
    try {
      fijarYGuardar({ inventario: importarJson(String(lector.result)) });
    } catch (e) {
      fijar({ ultimaEvaluacion: { sirve: false, mensaje: `No he podido leer el archivo: ${e.message}` } });
    }
  };
  lector.readAsText(archivo);
}
