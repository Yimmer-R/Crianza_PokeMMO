// El inventario: registro manual, importación y qué hacer cuando la captura no
// sale como decía el plan.
//
// Las tres vías de registro conviven a propósito y acaban en el mismo sitio:
//
//   manual  -> formulario
//   texto   -> src/nucleo/importar.js
//   imagen  -> src/ui/ocr.js -> el MISMO importar.js
//
// La parte de importar está en src/ui/importador.js, compartida con la pestaña
// de Objetivo. Ninguna de las dos vías automáticas guarda nada sin pasar por la
// pantalla de revisión: un OCR que se equivoque en un IV rompería el plan entero
// en silencio.

import { el, tarjeta, chip, aviso, frag, tabla, campoConSugerencias } from './componentes.js';
import { STATS, NOMBRE_STAT, IV_MAX, SEXOS } from '../nucleo/constantes.js';
import { obtener, fijarYGuardar, fijar } from './estado.js';
import {
  ejemplarNuevo, normalizar, cuantosPerfectos, totalIvs,
  evaluar, loQueFalta, exportar, importar as importarJson,
} from '../nucleo/inventario.js';
import { crearResolutores } from '../nucleo/nombres.js';
import { seccionImportar, seccionRevisar, DESTINOS } from './importador.js';

let borrador = ejemplarNuevo();
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
  const { inventario, plan, ultimaEvaluacion, avisoPersistencia, alFormulario } = obtener();

  // La revisión puede mandar un ejemplar al formulario para corregirlo a mano.
  if (alFormulario) {
    borrador = { ...alFormulario };
    fijar({ alFormulario: null });
  }

  return frag([
    bloqueFaltan(plan),
    seccionImportar(datos, DESTINOS.INVENTARIO),
    seccionRevisar(datos, DESTINOS.INVENTARIO),
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

// ----------------------------------------------------------- registro manual

function bloqueManual(datos) {
  const learnset = learnsetDe(borrador.especie, datos);

  const camposIv = el('div.ivs', {}, STATS.map((s) => el('div', {}, [
    el('label', { for: `b-iv-${s}`, texto: NOMBRE_STAT[s] }),
    el('input', {
      id: `b-iv-${s}`, type: 'number', inputmode: 'numeric', min: 0, max: IV_MAX,
      value: borrador.ivs[s],
      onchange: (e) => { borrador.ivs[s] = Math.max(0, Math.min(IV_MAX, Number(e.target.value) || 0)); },
    }),
  ])));

  // Cuatro huecos de movimiento. Hacen falta para los movimientos huevo: sin
  // saber qué sabe un padre, la app no puede decidir si sirve para pasarlo.
  const camposMovimiento = el('div.rejilla', {}, [0, 1, 2, 3].map((i) =>
    campoConSugerencias(
      `b-mov-${i}`, `Movimiento ${i + 1}`, borrador.movimientos[i] ?? '', learnset,
      (bruto) => {
        if (!bruto) { borrador.movimientos[i] = undefined; limpiar(); fijar({}); return; }
        // El mismo resolutor que el importador: escribir "Desenrollar" funciona.
        const r = res(datos).movimiento(bruto);
        borrador.movimientos[i] = r.valor ?? bruto;
        borrador._avisoMov = r.valor
          ? (r.via === 'exacto' ? null : `He interpretado "${bruto}" como ${r.valor}.`)
          : `No reconozco "${bruto}"${r.candidatos.length ? ` (¿${r.candidatos.join(' o ')}?)` : ''}; lo guardo tal cual.`;
        limpiar();
        fijar({});
      },
      { placeholder: i === 0 ? 'opcional' : '' },
    )));

  return tarjeta('Anotar una captura a mano', [
    el('p.nota', {}, [
      'Los IVs se leen directamente en el juego: menú del equipo → Datos → cuarta pestaña. ',
      'No hay que estimar nada.',
    ]),
    el('div.fila', {}, [
      campoConSugerencias('b-especie', 'Especie', borrador.especie, datos.especies,
        (v) => {
          borrador.especie = v ? (res(datos).especie(v).valor ?? v) : '';
          fijar({}); // repinta para actualizar las sugerencias de movimientos
        }, { placeholder: 'Rattata, Larvitar…' }),
      el('div', { style: 'flex:0 0 130px' }, [
        el('label', { for: 'b-sexo', texto: 'Sexo' }),
        el('select', { id: 'b-sexo', onchange: (e) => { borrador.sexo = e.target.value; } }, [
          el('option', { value: SEXOS.MACHO, selected: borrador.sexo === SEXOS.MACHO }, ['♂ Macho']),
          el('option', { value: SEXOS.HEMBRA, selected: borrador.sexo === SEXOS.HEMBRA }, ['♀ Hembra']),
          el('option', { value: SEXOS.SIN_GENERO, selected: borrador.sexo === SEXOS.SIN_GENERO }, ['— Sin género']),
        ]),
      ]),
      campoConSugerencias('b-nat', 'Naturaleza', borrador.naturaleza ?? '', datos.nombresNaturaleza,
        (v) => { borrador.naturaleza = v ? (res(datos).naturaleza(v).valor ?? v) : null; },
        { placeholder: 'opcional' }),
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
    borrador._avisoMov ? aviso(borrador._avisoMov) : null,

    el('div.fila', { style: 'margin-top:12px' }, [
      el('button.boton', { onclick: () => anadir(datos) }, ['Añadir al inventario']),
      el('button.boton.secundario', { onclick: () => comprobar(datos) }, ['Sólo comprobar si me sirve']),
      el('button.boton.secundario', { onclick: () => { borrador = ejemplarNuevo(); fijar({}); } }, ['Limpiar']),
    ]),
  ]);

  function limpiar() {
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
