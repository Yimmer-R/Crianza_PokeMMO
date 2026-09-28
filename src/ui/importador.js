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

import { el, tarjeta, plegable, chip, aviso, frag, tabla, interruptor } from './componentes.js';
import { STATS, NOMBRE_STAT, IV_MAX } from '../nucleo/constantes.js';
import { obtener, fijar, fijarYGuardar } from './estado.js';
import { importar as importarTexto, aObjetivo, PLANTILLA } from '../nucleo/importar.js';
import { crearResolutores, resolverSexo } from '../nucleo/nombres.js';
import { reconocer, PESO_MODELO_MB } from './ocr.js';

/** El texto pegado vive fuera del estado global: cambia en cada tecla. */
const textoPegado = { inventario: '', objetivo: '' };

/**
 * Qué fila de la revisión se está corrigiendo a mano, por posición en
 * `importacion.ejemplares`.
 *
 * Vive aquí y no en el estado global por lo mismo que el renombrar de la barra
 * de crianzas: es de esta tarjeta y no tiene que persistir. `null` = ninguna.
 */
let editando = null;

/** Los resolutores de nombres, una sola vez: montarlos cuesta. */
let resolutores = null;
const res = (datos) => (resolutores ??= crearResolutores(datos));

export const DESTINOS = { INVENTARIO: 'inventario', OBJETIVO: 'objetivo' };

// ------------------------------------------------------------- la tarjeta

/**
 * @param {Object} opciones `comoTarjeta: false` devuelve sólo el contenido, para
 *   meterlo dentro de un plegable sin anidar una tarjeta dentro de otra.
 */
export function seccionImportar(datos, destino, { comoTarjeta = true } = {}) {
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
      el('p.nota', {
        texto: `Sube una captura de la ficha (menú del equipo → Datos) y la leo ${queHace}. `
          + 'Siempre la revisas antes: el OCR se equivoca.'
          + (varios ? ' Puedes elegir varias de golpe.' : ''),
      }),
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
      el('p.nota', {
        texto: `La primera vez descarga ~${PESO_MODELO_MB} MB. Con datos del móvil, mejor la vía de texto.`,
      }),
      varios ? notaSinExport() : null,
    ]),

    texto: () => frag([
      el('p.nota', {
        texto: 'Pega la ficha tal cual: el orden da igual.'
          + (varios ? ' Varios seguidos, separados por una línea en blanco.' : ''),
      }),
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
      varios ? notaSinExport() : null,
    ]),
  }[sub] ?? (() => null);

  const contenido = [
    el('div.fila', { style: 'margin-bottom:12px' }, [
      pestana('imagen', '📷 Imagen'),
      pestana('texto', '📋 Texto'),
      pestana('archivo', '📄 Archivo'),
    ]),
    cuerpo(),
  ];

  return comoTarjeta
    ? tarjeta(destino === DESTINOS.OBJETIVO ? 'Importar el objetivo de una ficha' : 'Importar', contenido)
    : frag(contenido);
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

/**
 * Una fila de la revisión, en modo corrección.
 *
 * El OCR se equivoca y los dedos también, y hasta ahora la única salida era
 * quitar la fila y volver a escribirla entera en el formulario manual — que
 * además sólo estaba disponible cuando la tanda traía UN Pokémon. Aquí se
 * corrige en el sitio, sin tocar a los demás de la tanda.
 *
 * Los nombres se RESUELVEN al confirmar, igual que al importar: el usuario
 * puede escribir «Desenrollar» o «jolly» y se guarda lo que entiende la app.
 * Lo que no se reconozca se queda tal cual y la fila lo enseña en rojo, que es
 * mejor que tragárselo.
 */
function celdasEditables(datos, ej, guardar) {
  const texto = (valor, alCambiar, ancho = '7em') => el('input', {
    type: 'text', value: valor ?? '', style: `width:${ancho}`,
    onchange: (e) => alCambiar(e.target.value.trim()),
  });
  const r = res(datos);

  return [
    texto(ej.especie, (v) => guardar({ especie: v ? (r.especie(v).valor ?? v) : '' }), '7em'),
    texto(ej.sexo, (v) => guardar({ sexo: resolverSexo(v) ?? v }), '2.6em'),
    texto(ej.naturaleza, (v) => guardar({ naturaleza: v ? (r.naturaleza(v).valor ?? v) : null }), '6em'),
    texto(ej.habilidad, (v) => guardar({ habilidad: v ? (r.habilidad(v).valor ?? v) : null }), '6em'),
    ...STATS.map((st) => el('input', {
      type: 'number', min: 0, max: IV_MAX, value: ej.ivs[st] ?? 0, style: 'width:3.4em',
      onchange: (e) => guardar({
        ivs: { ...ej.ivs, [st]: Math.max(0, Math.min(IV_MAX, Number(e.target.value) || 0)) },
      }),
    })),
    texto((ej.movimientos ?? []).join(', '), (v) => guardar({
      movimientos: v.split(',').map((m) => m.trim()).filter(Boolean)
        .map((m) => r.movimiento(m).valor ?? m),
    }), '9em'),
    // Variocolor y Alpha son dos casillas, no texto: el OCR no siempre las lee
    // de la ficha y marcarlas a mano tiene que costar un toque.
    el('div.fila-acciones', {}, [
      interruptor(`ed-shiny-${ej.id}`, 'Var.', !!ej.shiny, (v) => guardar({ shiny: v })),
      interruptor(`ed-alpha-${ej.id}`, 'Alpha', !!ej.alpha, (v) => guardar({ alpha: v })),
    ]),
  ];
}

function revisarInventario(datos, imp) {
  const utiles = imp.ejemplares.filter((e) => e.especie);

  // Con una tanda de diez, un solo Pokémon mal leído no puede obligar a
  // descartar los otros nueve: cada fila se quita por su cuenta.
  const quitar = (i) => fijar((st) => {
    const quedan = st.importacion.ejemplares.filter((e) => e !== utiles[i]);
    editando = null; // los índices se mueven al quitar una fila
    return {
      importacion: quedan.some((e) => e.especie)
        ? { ...st.importacion, ejemplares: quedan }
        : null,
    };
  });

  /** Escribe un cambio sobre la fila `pos` de la tanda, sin tocar a las demás. */
  const guardarEn = (pos) => (parcial) => fijar((st) => ({
    importacion: {
      ...st.importacion,
      ejemplares: st.importacion.ejemplares.map((x, j) => (j === pos ? { ...x, ...parcial } : x)),
    },
  }));

  return tarjeta(`Revisar antes de guardar · ${utiles.length} Pokémon`, [
    el('p.nota', { texto: 'Comprueba los IVs. Toca «Editar» para corregir cualquiera.' }),
    bloqueResoluciones(imp),
    bloqueAvisos(imp.avisos),
    utiles.length
      ? tabla(
          ['Especie', 'Sexo', 'Naturaleza', 'Habilidad', ...STATS.map((s) => NOMBRE_STAT[s]),
            'Movimientos', 'Variante', ''],
          utiles.map((e, i) => {
            const pos = imp.ejemplares.indexOf(e);
            const enEdicion = editando === pos;
            return [
              ...(enEdicion
                ? celdasEditables(datos, e, guardarEn(pos))
                : [
                    e.especie, e.sexo, e.naturaleza ?? '—', e.habilidad ?? '—',
                    ...filaDeIvs(e),
                    (e.movimientos ?? []).join(', ') || '—',
                    [e.shiny ? 'variocolor' : null, e.alpha ? 'Alpha' : null].filter(Boolean).join(' · ') || '—',
                  ]),
              el('div.fila-acciones', {}, [
                el(`button.boton.mini${enEdicion ? '' : '.secundario'}`, {
                  onclick: () => { editando = enEdicion ? null : pos; fijar({}); },
                }, [enEdicion ? 'Listo' : 'Editar']),
                el('button.boton.mini.peligro', { onclick: () => quitar(i) }, ['Quitar']),
              ]),
            ];
          }),
          [4, 5, 6, 7, 8, 9],
        )
      : aviso('No he sacado ningún Pokémon con especie reconocible. Prueba con la vía de texto.', 'error'),
    el('div.fila', { style: 'margin-top:12px' }, [
      utiles.length
        ? el('button.boton', {
            onclick: () => {
              editando = null;
              fijarYGuardar((st) => ({
                inventario: [...st.inventario, ...utiles],
                importacion: null,
                ultimaEvaluacion: null,
              }));
            },
          }, [`Guardar ${utiles.length} en el inventario`])
        : null,
      el('button.boton.secundario', {
        onclick: () => { editando = null; fijar({ importacion: null }); },
      }, ['Descartar']),
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

/**
 * Por qué hay que fotografiar o teclear en vez de exportar las cajas.
 *
 * La pregunta sale sola en cuanto uno tiene veinte Pokéman que anotar, así que
 * la respuesta está en la propia pantalla y no sólo en los documentos.
 */
function notaSinExport() {
  return plegable('¿No se pueden sacar las cajas del juego de golpe?', [
    el('p', {}, [
      'No: PokeMMO no tiene export ni API que devuelva tus Pokémon, y leerlos de la memoria ',
      'del juego o del tráfico de red lo prohíben sus términos de servicio — el cliente vigila ',
      'la RAM mientras juegas, así que es un riesgo de baneo y esta app no va por ahí. ',
      'Fotografiar la pantalla sí vale, y por eso puedes subir varias capturas de golpe. ',
      'Está explicado en ', el('code', { texto: 'docs/exportar-el-pc.md' }), '.',
    ]),
  ], { pequeno: true });
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
