// Arranque: carga los datos, restaura el estado y pinta la vista activa.
//
// El bucle es deliberadamente tonto: cualquier cambio de estado recalcula el plan
// y repinta todo. Con estos volúmenes va sobrado, y a cambio no hay forma de que
// el plan se quede desincronizado del inventario — que es el fallo que más
// dolería en esta app.

import { cargarDatos } from '../datos/cargador.js';
import { obtener, suscribir, fijar, fijarYGuardar, restaurar } from './estado.js';
import { planear } from '../nucleo/planificador.js';
import { el } from './componentes.js';
import { vistaObjetivo } from './vista-objetivo.js';
import { vistaPlan } from './vista-plan.js';
import { vistaInventario } from './vista-inventario.js';
import { vistaCapturas } from './vista-capturas.js';
import { vistaEntrenamiento } from './vista-entrenamiento.js';

const VISTAS = {
  objetivo: vistaObjetivo,
  plan: vistaPlan,
  inventario: vistaInventario,
  capturas: vistaCapturas,
  entrenamiento: vistaEntrenamiento,
};

const contenedor = document.getElementById('vista');
const pestanas = document.getElementById('pestanas');

let datos = null;
let recalculando = false;

/** Recalcula el plan cuando cambia algo que le afecta. */
function recalcular() {
  if (recalculando) return;
  const { objetivo, inventario, regionesDisponibles } = obtener();
  if (!objetivo.especie) { if (obtener().plan) { recalculando = true; fijar({ plan: null }); recalculando = false; } return; }

  let plan;
  try {
    plan = planear(objetivo, datos, { inventario, regionesDisponibles });
  } catch (e) {
    plan = { ok: false, problemas: [`error al planear: ${e.message}`], avisos: [] };
  }
  recalculando = true;
  fijar({ plan });
  recalculando = false;
}

/**
 * Repintar se aplaza siempre a un microtask.
 *
 * Sin eso, un cambio disparado desde un `change` de un input repinta el DOM
 * DENTRO del propio evento: el elemento que lo está disparando se queda
 * huérfano a media ejecución y replaceChildren() revienta. Aplazarlo deja que
 * el evento termine primero, y de paso agrupa varios cambios seguidos en un
 * solo pintado.
 */
let pintadoPedido = false;
function programarPintado() {
  if (pintadoPedido) return;
  pintadoPedido = true;
  queueMicrotask(() => { pintadoPedido = false; pintar(); });
}

// Qué vista se pintó la última vez. Sirve para decidir si hay que ir arriba:
// cambiar de pestaña sí, repintar por un cambio de estado no.
let vistaPintada = null;

function pintar() {
  const { vista } = obtener();
  const cambioDeVista = vista !== vistaPintada;

  for (const b of pestanas.querySelectorAll('button'))
    b.classList.toggle('activa', b.dataset.vista === vista);

  // Qué estaba enfocado y dónde estaba el scroll, para devolverlo después. Sin
  // esto, escribir en un campo te echaba del campo y mandaba la página al
  // principio: en el móvil, con el formulario largo, era inusable.
  const activo = document.activeElement;
  const enfocadoId = activo && activo !== document.body ? activo.id : null;
  const seleccion = enfocadoId && 'selectionStart' in activo
    ? [activo.selectionStart, activo.selectionEnd] : null;
  const scroll = window.scrollY;

  const render = VISTAS[vista] ?? vistaObjetivo;
  contenedor.replaceChildren();
  try {
    contenedor.append(render(datos));
  } catch (e) {
    contenedor.append(el('div.error', {}, [
      el('strong', { texto: 'Se ha roto al pintar esta vista.' }),
      el('pre', { texto: `${e.message}\n${e.stack ?? ''}` }),
    ]));
    console.error(e);
  }

  if (cambioDeVista) {
    vistaPintada = vista;
    window.scrollTo({ top: 0, behavior: 'instant' });
    return;
  }

  // Mismo sitio donde estabas, y con el foco puesto otra vez.
  window.scrollTo({ top: scroll, behavior: 'instant' });
  if (enfocadoId) {
    const vuelve = document.getElementById(enfocadoId);
    if (vuelve) {
      vuelve.focus({ preventScroll: true });
      if (seleccion && 'setSelectionRange' in vuelve) {
        try { vuelve.setSelectionRange(seleccion[0], seleccion[1]); } catch { /* type sin selección */ }
      }
      // focus() puede haber movido el scroll otra vez: se vuelve a fijar.
      window.scrollTo({ top: scroll, behavior: 'instant' });
    }
  }
}

pestanas.addEventListener('click', (ev) => {
  const boton = ev.target.closest('button[data-vista]');
  if (boton) fijarYGuardar({ vista: boton.dataset.vista });
});

async function arrancar() {
  try {
    datos = await cargarDatos();
  } catch (e) {
    contenedor.replaceChildren(el('div.error', {}, [
      el('strong', { texto: 'No he podido cargar los datos.' }),
      el('p', { texto: e.message }),
      el('p', {}, [
        'Si has abierto el index.html con doble clic, el navegador bloquea la lectura de los ',
        'JSON por seguridad (política de mismo origen sobre file://). Arranca un servidor local: ',
        el('code', { texto: 'node herramientas/servir.mjs' }),
        ' o ',
        el('code', { texto: 'python3 -m http.server' }),
        '.',
      ]),
    ]));
    return;
  }

  const meta = document.getElementById('pie-meta');
  if (meta)
    meta.textContent =
      `Extraídos el ${datos.meta.generado}: ${datos.meta.recuentos.pokemon} Pokémon, ` +
      `${datos.meta.recuentos.conEncuentros} con encuentros, ` +
      `${datos.meta.recuentos.movimientosHuevo} movimientos huevo.`;

  restaurar();
  // Se suscribe ANTES del primer recalculo para que el primer pintado ya lleve plan.
  suscribir(() => { recalcular(); programarPintado(); });
  recalcular();
  pintar();
}

arrancar();
