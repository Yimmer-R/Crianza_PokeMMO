// La barra de crianzas: cuál está activa y cómo cambiar de una a otra.
//
// Vive fuera de las pestañas porque es transversal: cambiar de crianza cambia el
// Objetivo, el Plan y el Entrenamiento a la vez. El Inventario no, que es el
// mismo para todas.

import { el, chip } from './componentes.js';
import {
  obtener, nombreDeCrianza, anadirCrianza, duplicarCrianza,
  cambiarDeCrianza, renombrarCrianza, borrarCrianza,
} from './estado.js';
import { contar } from '../nucleo/planificador.js';

// Qué crianza se está renombrando. Es de la barra y de nadie más, así que no
// tiene por qué estar en el estado global.
let renombrando = null;

/** "12 por conseguir" / "lista" / "sin objetivo", para saber cuál es cuál. */
function resumenCorto(crianza, planes) {
  if (!crianza.objetivo.especie) return { texto: 'sin objetivo', clase: '' };
  const plan = planes[crianza.id];
  if (!plan) return { texto: 'sin objetivo', clase: '' };
  if (!plan.ok) return { texto: 'no se puede planear', clase: 'mal' };
  const c = contar(plan.arbol);
  if (!c.conseguir) return { texto: 'lista para cruzar', clase: 'bien' };
  return { texto: `${c.conseguir} por conseguir`, clase: 'ojo' };
}

export function barraCrianzas() {
  const { crianzas, crianzaActiva, planes, disputados } = obtener();
  const activa = crianzas.find((c) => c.id === crianzaActiva) ?? crianzas[0];

  if (renombrando && !crianzas.some((c) => c.id === renombrando)) renombrando = null;

  const pestanas = el('div.crianzas-lista', { role: 'tablist' }, crianzas.map((c) => {
    const r = resumenCorto(c, planes);
    return el(`button.crianza${c.id === crianzaActiva ? '.activa' : ''}`, {
      type: 'button',
      role: 'tab',
      'aria-selected': c.id === crianzaActiva ? 'true' : 'false',
      onclick: () => { renombrando = null; cambiarDeCrianza(c.id); },
    }, [
      el('span.crianza-nombre', { texto: nombreDeCrianza(c) }),
      el(`span.crianza-estado${r.clase ? `.${r.clase}` : ''}`, { texto: r.texto }),
    ]);
  }));

  const acciones = el('div.crianzas-acciones', {}, [
    el('button.boton.mini.secundario', {
      type: 'button', title: 'Empezar otra crianza',
      onclick: () => { renombrando = null; anadirCrianza(); },
    }, ['+ Nueva']),
    el('button.boton.mini.secundario', {
      type: 'button', title: 'Copiar esta crianza para probar una variante',
      onclick: () => { renombrando = null; duplicarCrianza(activa.id); },
    }, ['Duplicar']),
    el('button.boton.mini.secundario', {
      type: 'button',
      onclick: () => { renombrando = renombrando === activa.id ? null : activa.id; repintar(); },
    }, ['Renombrar']),
    crianzas.length > 1 || activa.objetivo.especie
      ? el('button.boton.mini.peligro', {
          type: 'button', title: 'Borra el plan, no el inventario',
          onclick: () => borrarCrianza(activa.id),
        }, ['Borrar'])
      : null,
  ]);

  const campoNombre = renombrando === activa.id
    ? el('div.crianzas-renombrar', {}, [
        el('input', {
          id: 'crianza-nombre', type: 'text', value: activa.nombre ?? '',
          placeholder: nombreDeCrianza(activa), autocomplete: 'off',
          onblur: (ev) => { renombrarCrianza(activa.id, ev.target.value); },
          onkeydown: (ev) => {
            if (ev.key === 'Enter') { renombrarCrianza(activa.id, ev.target.value); renombrando = null; repintar(); }
            if (ev.key === 'Escape') { renombrando = null; repintar(); }
          },
        }),
        el('button.boton.mini', {
          type: 'button',
          onclick: () => {
            const v = document.getElementById('crianza-nombre')?.value ?? '';
            renombrando = null;
            renombrarCrianza(activa.id, v);
          },
        }, ['Hecho']),
      ])
    : null;

  // Un ejemplar que dos planes usan a la vez no es un error, pero conviene
  // saberlo antes de gastarlo: sólo se va a poder usar en una.
  const conflicto = disputados.length
    ? el('p.crianzas-conflicto', {}, [
        chip(`${disputados.length} en dos crianzas`, 'ojo'),
        ` ${disputados.map((d) => d.ejemplar.especie).join(', ')}: los cuentan dos planes a la vez. ` +
        'Se gastan en el primero que completes, y el otro se recalculará solo.',
      ])
    : null;

  return el('div.crianzas', {}, [pestanas, acciones, campoNombre, conflicto]);
}

// La barra se repinta con el resto de la app; para los cambios que son sólo
// suyos (abrir el campo de renombrar) hace falta pedirlo.
let pedirPintado = () => {};
export const alPintar = (fn) => { pedirPintado = fn; };
const repintar = () => pedirPintado();
