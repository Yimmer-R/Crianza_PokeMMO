// El selector de hora del juego y estación.
//
// Vive en Capturas y en Entrenamiento —las dos pestañas donde el dato se usa— y
// no en Objetivo: lo que se elige aquí no describe el Pokémon que quieres, sino
// cuándo estás jugando ahora mismo. Es el mismo estado en las dos, así que
// cambiarlo en una lo cambia en la otra.

import { el, chip } from './componentes.js';
import { HORAS, ESTACIONES } from '../nucleo/constantes.js';
import { obtener, fijarYGuardar } from './estado.js';

/**
 * @param {string} sufijo distingue los ids cuando el selector sale en dos
 *   pestañas a la vez; sin esto habría dos `#cuando-hora` en el documento.
 */
export function selectorCuando(sufijo) {
  const { cuando } = obtener();

  const uno = (clave, etiqueta, opciones) => el('div', { style: 'flex:1 1 150px' }, [
    el('label', { for: `cuando-${clave}-${sufijo}`, texto: etiqueta }),
    el('select', {
      id: `cuando-${clave}-${sufijo}`,
      onchange: (ev) => fijarYGuardar((e) => ({
        cuando: { ...e.cuando, [clave]: ev.target.value || null },
      })),
    }, [
      el('option', { value: '', selected: !cuando[clave] }, ['Cualquiera']),
      ...opciones.map((o) => el('option', { value: o, selected: cuando[clave] === o }, [o])),
    ]),
  ]);

  const puesto = [cuando.hora, cuando.estacion].filter(Boolean);

  return el('div.cuando-barra', {}, [
    el('div.fila', {}, [
      uno('hora', 'Hora del juego', HORAS),
      uno('estacion', 'Estación', ESTACIONES),
      puesto.length
        ? el('button.boton.mini.secundario', {
            id: `cuando-limpiar-${sufijo}`,
            onclick: () => fijarYGuardar({ cuando: { hora: null, estacion: null } }),
          }, ['Quitar el filtro'])
        : null,
    ]),
    puesto.length
      ? el('p.nota', {}, [
          'Primero lo que sale con ', ...puesto.flatMap((x, i) => (i ? [' y ', chip(x, 'si')] : [chip(x, 'si')])),
          '. Lo que no, se queda abajo marcado con cuándo sí.',
        ])
      : el('p.nota', {}, [
          'Sin elegir nada, la columna ', el('strong', { texto: 'Cuándo' }),
          ' dice a qué horas sale cada sitio: ',
          el('strong', { texto: 'M' }), ' mañana, ', el('strong', { texto: 'D' }), ' día, ',
          el('strong', { texto: 'N' }), ' noche — y combinadas (M/D, D/N, M/D/N) cuando sale en varias.',
        ]),
  ]);
}
