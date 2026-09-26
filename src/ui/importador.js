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

  // Al inventario caben varios; el objetivo es uno solo por definición.
  const varios = destino === DESTINOS.INVENTARIO;

  const cuerpo = {
    imagen: () => frag([
      el('p.nota', {}, [
        `Sube una captura de la ficha del juego (menú del equipo → Datos), la leo ${queHace}. `,
        'Siempre te la enseño antes: el OCR se equivoca, y un IV mal leído descuadra el plan ',
        'sin que se note.',
        varios ? ' Puedes elegir varias de golpe: salen todas en la misma tabla de revisión.' : '',
      ]),
      el('div.fila', {}, [
        el('label.boton', { for: `ocr-archivo-${destino}`, style: 'cursor:pointer;text-align:center' },
          [varios ? 'Elegir imágenes…' : 'Elegir imagen…']),
        el('input', {
          id: `ocr-archivo-${destino}`, type: 'file', accept: 'image/*', style: 'display:none',
          multiple: varios,
          onchange: (ev) => leerImagenes([...(ev.target.files ?? [])], datos, destino),
        }),
      ]),
      activo?.activo
        ? el('div.nota', {}, [
            el('strong', {
              texto: `${activo.deCuantas > 1 ? `Imagen ${activo.cual} de ${activo.deCuantas} · ` : ''}` +
                `${activo.fase}… ${activo.porcentaje}%`,
            }),
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
        varios ? ' Puedes pegar todos los que quieras, separados por una línea en blanco.' : '',
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
        varios ? ' Puedes elegir varios a la vez, y mezclar formatos.' : '',
      ]),
      el('div.fila', {}, [
        el('label.boton', { for: `archivo-importar-${destino}`, style: 'cursor:pointer;text-align:center' },
          [varios ? 'Elegir archivos…' : 'Elegir archivo…']),
        el('input', {
          id: `archivo-importar-${destino}`, type: 'file', accept: '.txt,.csv,.json,text/plain',
          style: 'display:none', multiple: varios,
          onchange: (ev) => leerArchivos([...(ev.target.files ?? [])], datos, destino),
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

  // Con una tanda de diez, un solo Pokémon mal leído no puede obligar a
  // descartar los otros nueve: cada fila se quita por su cuenta.
  const quitar = (i) => fijar((st) => {
    const quedan = st.importacion.ejemplares.filter((e) => e !== utiles[i]);
    return {
      importacion: quedan.some((e) => e.especie)
        ? { ...st.importacion, ejemplares: quedan }
        : null,
    };
  });

  return tarjeta(`Revisar antes de guardar · ${utiles.length} Pokémon`, [
    el('p.nota', {}, ['Comprueba los IVs uno por uno: es lo que más cuesta de leer y lo que más daño hace si está mal.']),
    bloqueResoluciones(imp),
    bloqueAvisos(imp.avisos),
    utiles.length
      ? tabla(
          ['Especie', 'Sexo', 'Naturaleza', 'Habilidad', ...STATS.map((s) => NOMBRE_STAT[s]), 'Movimientos', ''],
          utiles.map((e, i) => [
            e.especie, e.sexo, e.naturaleza ?? '—', e.habilidad ?? '—',
            ...filaDeIvs(e),
            (e.movimientos ?? []).join(', ') || '—',
            el('button.boton.mini.secundario', { onclick: () => quitar(i) }, ['Quitar']),
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

/**
 * Mete lo leído en la tabla de revisión.
 *
 * Al inventario se ACUMULA: leer cinco capturas de una en una tiene que acabar
 * en la misma tabla que leerlas de golpe, porque si cada una pisara a la
 * anterior habría que confirmar cinco veces y el error sería confirmar sin
 * mirar. Al objetivo se sustituye: sólo se cría un Pokémon a la vez.
 */
function acumular(imp, destino) {
  fijar((st) => {
    const previo = st.importacion?.destino === destino && destino === DESTINOS.INVENTARIO
      ? st.importacion : null;
    if (!previo) return { importacion: { ...imp, destino }, ocr: null };
    return {
      importacion: {
        ...imp,
        destino,
        ejemplares: [...previo.ejemplares, ...imp.ejemplares],
        avisos: [...previo.avisos, ...imp.avisos],
        resoluciones: [...previo.resoluciones, ...imp.resoluciones],
      },
      ocr: null,
    };
  });
}

function procesar(texto, datos, destino) {
  acumular(importarTexto(texto, datos), destino);
}

/**
 * Lee una o varias capturas con el OCR, una detrás de otra.
 *
 * En serie a propósito: Tesseract carga un modelo de ~15 MB por trabajador y
 * lanzar cinco a la vez en un móvil es la forma más rápida de quedarse sin
 * memoria. Además así la barra de progreso dice algo cierto.
 */
async function leerImagenes(archivos, datos, destino) {
  if (!archivos.length) return;
  const deCuantas = archivos.length;
  const leidos = [];
  const fallos = [];

  for (const [i, archivo] of archivos.entries()) {
    const cual = i + 1;
    fijar({ ocr: { activo: true, destino, fase: 'Empezando', porcentaje: 0, cual, deCuantas } });
    try {
      const r = await reconocer(archivo, {
        onProgreso: (p) => fijar({ ocr: { activo: true, destino, cual, deCuantas, ...p } }),
      });
      leidos.push({ nombre: archivo.name, texto: r.texto, confianza: r.confianza });
    } catch (e) {
      fallos.push(`${archivo.name}: ${e.message}`);
    }
  }

  if (!leidos.length) {
    fijar({
      ocr: {
        activo: false, destino,
        error: `${fallos.join(' · ')}. Usa la pestaña «Texto» y pega la ficha a mano: ` +
          'funciona sin descargar nada.',
      },
    });
    return;
  }

  // El texto crudo se deja en la pestaña de texto: corregirlo a mano es más
  // rápido que reescribir las fichas enteras.
  const crudo = leidos.map((l) => l.texto).join('\n\n');
  textoPegado[destino] = crudo;

  const imp = importarTexto(crudo, datos);
  if (fallos.length) imp.avisos = [...imp.avisos, ...fallos];

  if (!imp.ejemplares.some((e) => e.especie)) {
    const media = Math.round(leidos.reduce((a, l) => a + l.confianza, 0) / leidos.length);
    fijar({
      ocr: {
        activo: false, destino,
        error: `He leído ${leidos.length === 1 ? 'la imagen' : `las ${leidos.length} imágenes`} ` +
          `(confianza ${media} %) pero no he reconocido ninguna ficha. ` +
          'Te he dejado el texto en la pestaña «Texto» para que lo corrijas a mano.',
      },
      vistaImportar: 'texto',
    });
    acumular(imp, destino);
    return;
  }
  acumular(imp, destino);
}

/** Igual con archivos: se leen todos y se revisan juntos. */
function leerArchivos(archivos, datos, destino) {
  if (!archivos.length) return;
  let pendientes = archivos.length;
  const textos = [];
  const fallos = [];

  const cuandoTermine = () => {
    if (--pendientes) return;
    // Cada archivo se parsea por separado: un .csv y un .json juntos no se
    // pueden concatenar como texto, cada uno tiene su formato.
    const partes = textos.map((t) => importarTexto(t, datos));
    const imp = {
      ejemplares: partes.flatMap((x) => x.ejemplares),
      avisos: [...partes.flatMap((x) => x.avisos), ...fallos],
      resoluciones: partes.flatMap((x) => x.resoluciones),
      formato: partes.length === 1 ? partes[0].formato : 'varios',
    };
    acumular(imp, destino);
  };

  for (const archivo of archivos) {
    const lector = new FileReader();
    lector.onload = () => { textos.push(String(lector.result)); cuandoTermine(); };
    lector.onerror = () => { fallos.push(`no he podido leer ${archivo.name}`); cuandoTermine(); };
    lector.readAsText(archivo);
  }
}
