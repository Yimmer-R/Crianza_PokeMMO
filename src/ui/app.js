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
import { barraCrianzas, alPintar } from './barra-crianzas.js';

const VISTAS = {
  objetivo: vistaObjetivo,
  plan: vistaPlan,
  inventario: vistaInventario,
  capturas: vistaCapturas,
  entrenamiento: vistaEntrenamiento,
};

const contenedor = document.getElementById('vista');
const pestanas = document.getElementById('pestanas');
const barra = document.getElementById('crianzas');

let datos = null;
let recalculando = false;

/**
 * Recalcula el plan de TODAS las crianzas cuando cambia algo que les afecta.
 *
 * Todas ven el inventario entero: esconderle a una lo que otra "ha pedido"
 * sería mentir, porque hasta que no completas el paso el Pokémon sigue en tu PC
 * y lo puedes usar donde quieras. Lo que sí se calcula es qué ejemplares están
 * usando dos planes a la vez, para poder decirlo.
 */
function recalcular() {
  if (recalculando) return;
  const { crianzas, crianzaActiva, inventario, regionesDisponibles } = obtener();

  const planes = {};
  for (const c of crianzas) {
    if (!c.objetivo.especie) continue;
    try {
      planes[c.id] = planear(c.objetivo, datos, { inventario, regionesDisponibles });
    } catch (e) {
      planes[c.id] = { ok: false, problemas: [`error al planear: ${e.message}`], avisos: [] };
    }
  }

  recalculando = true;
  fijar({ planes, plan: planes[crianzaActiva] ?? null, disputados: buscarDisputados(crianzas, planes) });
  recalculando = false;
}

/** Ejemplares del inventario que aparecen en el plan de más de una crianza. */
function buscarDisputados(crianzas, planes) {
  const porEjemplar = new Map();
  for (const c of crianzas) {
    const plan = planes[c.id];
    if (!plan?.ok) continue;
    (function recorre(n) {
      if (n.tipo === 'inventario') {
        const ya = porEjemplar.get(n.ejemplar.id) ?? { ejemplar: n.ejemplar, crianzas: [] };
        ya.crianzas.push(c.id);
        porEjemplar.set(n.ejemplar.id, ya);
        return;
      }
      n.hijos.forEach(recorre);
    })(plan.arbol);
  }
  return [...porEjemplar.values()].filter((x) => x.crianzas.length > 1);
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

  if (barra) barra.replaceChildren(barraCrianzas());

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

  alPintar(programarPintado);
  restaurar();
  // Se suscribe ANTES del primer recalculo para que el primer pintado ya lleve plan.
  suscribir(() => { recalcular(); programarPintado(); });
  recalcular();
  pintar();
}

arrancar();
