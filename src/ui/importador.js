// La interfaz de importar, compartida por Inventario y Objetivo.
//
// Las dos pestañas necesitan lo mismo —imagen, texto o archivo, y una revisión
// antes de guardar— y lo único que cambia es dónde acaba el resultado:
//
//   destino 'inventario' -> se añade a la lista de Pokémon que tienes
//   destino 'objetivo'   -> se convierte en el Pokémon que quieres criar
//
// Por eso vive aquí y no duplicado en las dos vistas: si el formato cambia, no
// hay dos sitios que puedan quedarse desincronizados.

import { el, tarjeta, chip, aviso, frag, tabla, interruptor } from './componentes.js';
import { STATS, NOMBRE_STAT, IV_MAX } from '../nucleo/constantes.js';
import { obtener, fijar, fijarYGuardar } from './estado.js';
import { importar as importarTexto, aObjetivo, PLANTILLA } from '../nucleo/importar.js';
import { reconocer, PESO_MODELO_MB } from './ocr.js';

/** El texto pegado vive fuera del estado global: cambia en cada tecla. */
const textoPegado = { inventario: '', objetivo: '' };

export const DESTINOS = { INVENTARIO: 'inventario', OBJETIVO: 'objetivo' };

// ------------------------------------------------------------- la tarjeta

export function seccionImportar(datos, destino) {
  const { vistaImportar, ocr } = obtener();
  const sub = vistaImportar ?? 'imagen';
  const activo = ocr?.destino === destino ? ocr : null;

  const pestana = (clave, etiqueta) =>
    el(`button.boton.mini${sub === clave ? '' : '.secundario'}`, {
      onclick: () => fijar({ vistaImportar: clave }),
    }, [etiqueta]);

  const queHace = destino === DESTINOS.OBJETIVO
    ? 'y lo pongo como el Pokémon que quieres criar'
    : 'y lo añado a tu inventario';

  const cuerpo = {
    imagen: () => frag([
      el('p.nota', {}, [
        `Sube una captura de la ficha del juego (menú del equipo → Datos), la leo ${queHace}. `,
        'Siempre te la enseño antes: el OCR se equivoca, y un IV mal leído descuadra el plan ',
        'sin que se note.',
      ]),
      el('div.fila', {}, [
        el('label.boton', { for: `ocr-archivo-${destino}`, style: 'cursor:pointer;text-align:center' }, ['Elegir imagen…']),
        el('input', {
          id: `ocr-archivo-${destino}`, type: 'file', accept: 'image/*', style: 'display:none',
          onchange: (ev) => leerImagen(ev.target.files?.[0], datos, destino),
        }),
      ]),
      activo?.activo
        ? el('div.nota', {}, [
            el('strong', { texto: `${activo.fase}… ${activo.porcentaje}%` }),
            el('div', { style: 'margin-top:6px;height:6px;background:var(--fondo-alt2);border-radius:3px;overflow:hidden' }, [
              el('div', { style: `height:100%;width:${activo.porcentaje}%;background:var(--acento);transition:width .2s` }),
            ]),
          ])
        : null,
      activo?.error ? aviso(activo.error, 'error') : null,
      el('p.nota', {}, [
        `La primera vez descarga el modelo de español (~${PESO_MODELO_MB} MB) y se queda guardado. `,
        'Si estás con datos del móvil, mejor la vía de texto.',
      ]),
    ]),

    texto: () => frag([
      el('p.nota', {}, [
        'Pega la ficha tal cual. El orden de las líneas da igual y los dos puntos son opcionales.',
        destino === DESTINOS.INVENTARIO ? ' Puedes pegar varios separados por una línea en blanco.' : '',
      ]),
      el('textarea', {
        id: `texto-importar-${destino}`,
        value: textoPegado[destino],
        placeholder: PLANTILLA,
        oninput: (ev) => { textoPegado[destino] = ev.target.value; },
        style: 'min-height:170px',
      }),
      el('div.fila', { style: 'margin-top:10px' }, [
        el('button.boton', {
          onclick: () => procesar(textoPegado[destino], datos, destino),
        }, ['Leer el texto']),
        el('button.boton.secundario', {
          onclick: () => { textoPegado[destino] = PLANTILLA; fijar({}); },
        }, ['Rellenar con el ejemplo']),
      ]),
    ]),

    archivo: () => frag([
      el('p.nota', {}, [
        'Vale un ', el('code', { texto: '.txt' }), ' con el formato de arriba, un ',
        el('code', { texto: '.csv' }), ' con cabecera, o un ',
        el('code', { texto: '.json' }), ' exportado por esta misma app.',
      ]),
      el('div.fila', {}, [
        el('label.boton', { for: `archivo-importar-${destino}`, style: 'cursor:pointer;text-align:center' }, ['Elegir archivo…']),
        el('input', {
          id: `archivo-importar-${destino}`, type: 'file', accept: '.txt,.csv,.json,text/plain',
          style: 'display:none',
          onchange: (ev) => leerArchivo(ev.target.files?.[0], datos, destino),
        }),
      ]),
      el('p.nota', {}, ['El formato completo está en ', el('code', { texto: 'docs/formato-de-importacion.md' }), '.']),
    ]),
  }[sub] ?? (() => null);

  return tarjeta(
    destino === DESTINOS.OBJETIVO ? 'Importar el objetivo de una ficha' : 'Importar',
    [
      el('div.fila', { style: 'margin-bottom:12px' }, [
        pestana('imagen', '📷 Imagen'),
        pestana('texto', '📋 Texto'),
        pestana('archivo', '📄 Archivo'),
      ]),
      cuerpo(),
    ],
  );
}

// ----------------------------------------------------------- la revisión

export function seccionRevisar(datos, destino) {
  const { importacion, importarTodosLosIvs } = obtener();
  if (!importacion || importacion.destino !== destino) return null;

  return destino === DESTINOS.OBJETIVO
    ? revisarObjetivo(datos, importacion, !!importarTodosLosIvs)
    : revisarInventario(datos, importacion);
}

function filaDeIvs(e) {
  return STATS.map((s) => el('span', {
    texto: String(e.ivs[s]),
    style: e.ivs[s] >= IV_MAX ? 'color:var(--bien);font-weight:700' : '',
  }));
}

function bloqueResoluciones(imp) {
  if (!imp.resoluciones.length) return null;
  return el('div.nota', {}, [
    el('strong', { texto: 'Nombres que he interpretado:' }),
    el('ul', {}, imp.resoluciones.map((r) => el('li', {}, [
      `${r.campo}: "${r.entrada}" → `, el('strong', { texto: r.valor }), ' ',
      chip(r.via === 'alias-cliente' ? 'nombre del juego' : r.via, r.via === 'aproximado' ? 'ojo' : 'si'),
    ]))),
  ]);
}

function bloqueAvisos(avisos, titulo = 'Cosas que no he entendido:') {
  if (!avisos.length) return null;
  return el('div.aviso', {}, [
    el('strong', { texto: titulo }),
    el('ul', {}, avisos.map((a) => el('li', { texto: a }))),
  ]);
}

function revisarInventario(datos, imp) {
  const utiles = imp.ejemplares.filter((e) => e.especie);
  return tarjeta(`Revisar antes de guardar · ${utiles.length} Pokémon`, [
    el('p.nota', {}, ['Comprueba los IVs uno por uno: es lo que más cuesta de leer y lo que más daño hace si está mal.']),
    bloqueResoluciones(imp),
    bloqueAvisos(imp.avisos),
    utiles.length
      ? tabla(
          ['Especie', 'Sexo', 'Naturaleza', 'Habilidad', ...STATS.map((s) => NOMBRE_STAT[s]), 'Movimientos'],
          utiles.map((e) => [
            e.especie, e.sexo, e.naturaleza ?? '—', e.habilidad ?? '—',
            ...filaDeIvs(e),
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
            onclick: () => fijar({ importacion: null, alFormulario: utiles[0] }),
          }, ['Pasarlo al formulario para corregirlo'])
        : null,
      el('button.boton.secundario', { onclick: () => fijar({ importacion: null }) }, ['Descartar']),
    ]),
  ]);
}

function revisarObjetivo(datos, imp, todosLosIvs) {
  const primero = imp.ejemplares.find((e) => e.especie);
  if (!primero) {
    return tarjeta('Revisar antes de aplicar', [
      bloqueResoluciones(imp),
      bloqueAvisos(imp.avisos),
      aviso('No he reconocido ninguna especie. Prueba con la vía de texto.', 'error'),
      el('button.boton.secundario', { onclick: () => fijar({ importacion: null }) }, ['Descartar']),
    ]);
  }

  const r = aObjetivo(primero, datos, { todosLosIvs });
  const o = r.objetivo;

  return tarjeta(`Revisar antes de aplicar · ${o.especie}`, [
    el('p.nota', {}, [
      'De los IVs de la ficha tomo como objetivo ',
      el('strong', { texto: 'los que ya están a 31' }),
      '. Un objetivo es «quiero estos IVs perfectos», no los valores del ejemplar.',
    ]),
    el('div', { style: 'margin:10px 0' }, [
      interruptor('importar-todos-ivs', 'Marcar los seis IVs a 31 (competitivo)', todosLosIvs,
        (v) => fijar({ importarTodosLosIvs: v })),
    ]),
    bloqueResoluciones(imp),
    bloqueAvisos(imp.avisos),
    bloqueAvisos(r.avisos, 'Al pasarlo a objetivo:'),

    el('div.etiquetas', { style: 'margin-bottom:10px' }, [
      chip(`Especie: ${o.especie}`, 'si'),
      chip(r.marcados.length
        ? `${r.marcados.length}×31 (${r.marcados.map((s) => NOMBRE_STAT[s]).join(', ')})`
        : 'sin IVs a 31', r.marcados.length ? 'bien' : 'ojo'),
      o.naturaleza ? chip(`Naturaleza: ${o.naturaleza}`, 'si') : null,
      o.habilidad ? chip(`Habilidad: ${o.habilidad}`, 'si') : null,
      o.movimientos.length ? chip(`Movimientos: ${o.movimientos.join(', ')}`) : null,
      STATS.some((s) => o.evs[s]) ? chip(`EVs: ${STATS.filter((s) => o.evs[s]).map((s) => `${o.evs[s]} ${NOMBRE_STAT[s]}`).join(' · ')}`) : null,
    ]),

    el('p.nota', {}, ['Esto sustituye el objetivo que tengas puesto ahora.']),
    el('div.fila', {}, [
      el('button.boton', {
        onclick: () => fijarYGuardar((st) => ({
          objetivo: { ...st.objetivo, ...o },
          importacion: null,
          vista: 'plan',
        })),
      }, ['Usar como objetivo y ver el plan']),
      el('button.boton.secundario', { onclick: () => fijar({ importacion: null }) }, ['Descartar']),
    ]),
  ]);
}

// ------------------------------------------------------------- acciones

function procesar(texto, datos, destino) {
  const imp = importarTexto(texto, datos);
  fijar({ importacion: { ...imp, destino }, ocr: null });
}

async function leerImagen(archivo, datos, destino) {
  if (!archivo) return;
  fijar({ ocr: { activo: true, destino, fase: 'Empezando', porcentaje: 0 } });
  try {
    const r = await reconocer(archivo, {
      onProgreso: (p) => fijar({ ocr: { activo: true, destino, ...p } }),
    });
    const imp = importarTexto(r.texto, datos);
    // El texto crudo se deja en la pestaña de texto: corregirlo a mano es más
    // rápido que reescribir la ficha entera.
    textoPegado[destino] = r.texto;
    if (!imp.ejemplares.some((e) => e.especie)) {
      fijar({
        ocr: {
          activo: false, destino,
          error: `He leído la imagen (confianza ${Math.round(r.confianza)} %) pero no he reconocido ninguna ficha. ` +
            'Te he dejado el texto en la pestaña «Texto» para que lo corrijas a mano.',
        },
        vistaImportar: 'texto',
        importacion: { ...imp, destino },
      });
      return;
    }
    fijar({ ocr: null, importacion: { ...imp, destino } });
  } catch (e) {
    fijar({
      ocr: {
        activo: false, destino,
        error: `${e.message}. Usa la pestaña «Texto» y pega la ficha a mano: funciona sin descargar nada.`,
      },
    });
  }
}

function leerArchivo(archivo, datos, destino) {
  if (!archivo) return;
  const lector = new FileReader();
  lector.onload = () => procesar(String(lector.result), datos, destino);
  lector.onerror = () => fijar({ ocr: { activo: false, destino, error: 'no he podido leer el archivo' } });
  lector.readAsText(archivo);
}
