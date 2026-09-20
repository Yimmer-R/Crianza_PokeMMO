// El inventario, y lo que el enunciado pide de verdad: qué hacer cuando la
// captura no sale como decía el plan.
//
// El flujo es: el plan te dice "captura un macho con 31 en Velocidad"; capturas,
// te sale 31 en Ataque y hembra; lo anotas aquí; la app te dice si encaja en otro
// hueco o si no sirve y hay que volver. Y el plan se recalcula solo.

import { el, tarjeta, chip, aviso, frag, tabla, interruptor, campoConSugerencias } from './componentes.js';
import { STATS, NOMBRE_STAT, IV_MAX, SEXOS } from '../nucleo/constantes.js';
import { obtener, fijarYGuardar, fijar } from './estado.js';
import { ejemplarNuevo, normalizar, resumen, cuantosPerfectos, totalIvs, evaluar, loQueFalta, exportar, importar } from '../nucleo/inventario.js';

let borrador = ejemplarNuevo();

export function vistaInventario(datos) {
  const { inventario, plan, ultimaEvaluacion, objetivo, avisoPersistencia } = obtener();

  const repinta = () => fijar({});

  // --------------------------------------------------- qué pide el plan ahora
  const faltan = loQueFalta(plan);
  const bloqueFaltan = plan?.ok
    ? tarjeta('Lo que le falta al plan', [
        faltan.length
          ? tabla(
              ['Cuántos', 'Qué', 'Sexo', 'Especie'],
              faltan.map((f) => [
                `×${f.cuantos}`,
                (f.stats.length ? `31 en ${f.stats.map((s) => NOMBRE_STAT[s]).join(' + ')}` : '') +
                  (f.naturaleza ? `${f.stats.length ? ' + ' : ''}naturaleza ${f.naturaleza}` : ''),
                f.sexo ?? 'cualquiera',
                f.especieLibre
                  ? chip('cualquiera del grupo huevo', 'si')
                  : f.especieSugerida,
              ]),
              [0],
            )
          : el('p', {}, [chip('nada: el inventario ya cubre el plan', 'bien')]),
      ])
    : null;

  // ---------------------------------------------- anotar una nueva captura
  const camposIv = el('div.ivs', {}, STATS.map((s) => el('div', {}, [
    el('label', { for: `b-iv-${s}`, texto: NOMBRE_STAT[s] }),
    el('input', {
      id: `b-iv-${s}`, type: 'number', min: 0, max: IV_MAX, value: borrador.ivs[s],
      onchange: (e) => { borrador.ivs[s] = Math.max(0, Math.min(IV_MAX, Number(e.target.value) || 0)); },
    }),
  ])));

  const formulario = tarjeta('Anotar una captura', [
    el('p.nota', {}, [
      'Los IVs se leen directamente en el juego: menú del equipo → Datos → cuarta pestaña. ',
      'No hay que estimar nada.',
    ]),
    el('div.fila', {}, [
      campoConSugerencias('b-especie', 'Especie', borrador.especie, datos.especies,
        (v) => { borrador.especie = v; }, 'Rattata, Larvitar…'),
      el('div', { style: 'flex:0 0 130px' }, [
        el('label', { for: 'b-sexo', texto: 'Sexo' }),
        el('select', { id: 'b-sexo', onchange: (e) => { borrador.sexo = e.target.value; } }, [
          el('option', { value: SEXOS.MACHO, selected: borrador.sexo === SEXOS.MACHO }, ['♂ Macho']),
          el('option', { value: SEXOS.HEMBRA, selected: borrador.sexo === SEXOS.HEMBRA }, ['♀ Hembra']),
          el('option', { value: SEXOS.SIN_GENERO, selected: borrador.sexo === SEXOS.SIN_GENERO }, ['— Sin género']),
        ]),
      ]),
      campoConSugerencias('b-nat', 'Naturaleza', borrador.naturaleza ?? '', datos.nombresNaturaleza,
        (v) => { borrador.naturaleza = v || null; }, 'opcional'),
    ]),
    el('h3', { texto: 'IVs' }),
    camposIv,
    el('div.fila', { style: 'margin-top:12px' }, [
      el('button.boton', { onclick: () => añadir(datos) }, ['Añadir al inventario']),
      el('button.boton.secundario', { onclick: () => comprobar(datos) }, ['Sólo comprobar si me sirve']),
    ]),
  ]);

  // ------------------------------------------------- resultado de comprobar
  const bloqueEvaluacion = ultimaEvaluacion
    ? tarjeta('¿Me sirve?', [
        el(`div.${ultimaEvaluacion.sirve ? 'nota' : 'aviso'}`, {}, [
          el('strong', { texto: ultimaEvaluacion.sirve ? '✔ Sí' : '✘ No para esta cadena' }),
          ' — ', ultimaEvaluacion.mensaje,
        ]),
        ultimaEvaluacion.sirve
          ? el('p.nota', { texto:
              `Mejor hueco: ${ultimaEvaluacion.mejor.hueco.stats.map((s) => NOMBRE_STAT[s]).join(' + ') || 'el de naturaleza'}` +
              ` · ahorra ${ultimaEvaluacion.mejor.ahorro} captura(s).` })
          : el('p.nota', { texto: 'Puedes guardarlo igual: si cambias el objetivo o el plan avanza, quizá sirva después.' }),
        el('button.boton.mini.secundario', { onclick: () => fijar({ ultimaEvaluacion: null }) }, ['Cerrar']),
      ])
    : null;

  // -------------------------------------------------------- lista actual
  const filas = inventario.map((e) => [
    e.especie || '(sin especie)',
    e.sexo,
    `${cuantosPerfectos(e)}×31`,
    STATS.map((s) => (e.ivs[s] >= IV_MAX ? NOMBRE_STAT[s] : null)).filter(Boolean).join(', ') || '—',
    `${totalIvs(e)}/186`,
    e.naturaleza ?? '—',
    el('button.boton.mini.peligro', {
      onclick: () => fijarYGuardar((st) => ({ inventario: st.inventario.filter((x) => x.id !== e.id) })),
    }, ['Borrar']),
  ]);

  const bloqueLista = tarjeta(`Tu inventario · ${inventario.length}`, [
    inventario.length
      ? tabla(['Especie', 'Sexo', 'Perfectos', 'IVs a 31', 'Total', 'Naturaleza', ''], filas, [4])
      : el('p.vacio', { texto: 'Vacío. Anota lo que tengas y el plan se recalculará con ello.' }),
  ]);

  // -------------------------------------------------- importar / exportar
  const bloqueDatos = tarjeta('Copia de seguridad', [
    el('p.nota', {}, [
      'El inventario se guarda en este navegador (localStorage), así que no viaja a ningún sitio ',
      'ni se comparte. Si cambias de equipo, expórtalo.',
    ]),
    avisoPersistencia
      ? aviso(`No he podido guardar en este navegador (${avisoPersistencia}). La app funciona igual, pero el inventario se perderá al recargar.`)
      : null,
    el('div.fila', {}, [
      el('button.boton.secundario', { onclick: () => descargar(inventario) }, ['Exportar a archivo']),
      el('label.boton.secundario', { for: 'importar', style: 'cursor:pointer;text-align:center' }, ['Importar archivo']),
      el('input', {
        id: 'importar', type: 'file', accept: '.json', style: 'display:none',
        onchange: (ev) => leerArchivo(ev.target.files?.[0]),
      }),
    ]),
  ]);

  return frag([bloqueFaltan, formulario, bloqueEvaluacion, bloqueLista, bloqueDatos]);

  // ------------------------------------------------------------- acciones

  function comprobar(datos) {
    const e = normalizar({ ...borrador });
    if (!e.especie) { fijar({ ultimaEvaluacion: { sirve: false, mensaje: 'Pon la especie primero.' } }); return; }
    fijar({ ultimaEvaluacion: evaluar(e, plan, datos) });
  }

  function añadir(datos) {
    const e = normalizar({ ...borrador });
    if (!e.especie) { fijar({ ultimaEvaluacion: { sirve: false, mensaje: 'Pon la especie primero.' } }); return; }
    const evaluacion = plan?.ok ? evaluar(e, plan, datos) : null;
    borrador = ejemplarNuevo();
    // Al cambiar el inventario, app.js recalcula el plan entero: es lo que hace
    // que una captura inesperada reajuste el camino sin tocar nada más.
    fijarYGuardar((st) => ({ inventario: [...st.inventario, e], ultimaEvaluacion: evaluacion }));
  }
}

function descargar(inventario) {
  const blob = new Blob([exportar(inventario)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `inventario-crianza-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function leerArchivo(archivo) {
  if (!archivo) return;
  const lector = new FileReader();
  lector.onload = () => {
    try {
      fijarYGuardar({ inventario: importar(String(lector.result)) });
    } catch (e) {
      fijar({ ultimaEvaluacion: { sirve: false, mensaje: `No he podido leer el archivo: ${e.message}` } });
    }
  };
  lector.readAsText(archivo);
}
