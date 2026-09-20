// El plan de EVs: cuántos faltan, en qué hordas y cuántas rondas.

import { el, tarjeta, chip, aviso, frag, tabla, numero } from './componentes.js';
import { NOMBRE_STAT, EV_MAX_TOTAL } from '../nucleo/constantes.js';
import { obtener } from './estado.js';
import { planearEvs } from '../nucleo/entrenamiento.js';

export function vistaEntrenamiento(datos) {
  const { objetivo, regionesDisponibles } = obtener();

  const plan = planearEvs(objetivo.evs, {}, datos, {
    regionesDisponibles,
    objeto: objetivo.objetoEntrenamiento,
    nivel: objetivo.nivel,
  });

  if (!plan.porStat.length)
    return tarjeta('Sin EVs que repartir', [
      el('p.vacio', {}, ['Pon los EVs que quieres en la pestaña Objetivo. El reparto típico es 252 + 252 + 6.']),
    ]);

  const resumen = tarjeta(`EVs · ${plan.total} de ${EV_MAX_TOTAL}`, [
    el('div.etiquetas', {}, [
      chip(`nivel ${plan.nivel}`),
      chip(plan.objeto.nombre ? `${plan.objeto.nombre} (×${plan.objeto.factor})` : 'sin objeto', plan.objeto.factor > 1 ? 'si' : ''),
      chip(`${plan.libres} EVs libres`),
    ]),
    el('p.nota', { texto: plan.objeto.nota }),
    plan.problemas.length
      ? el('div.error', {}, [el('ul', {}, plan.problemas.map((x) => el('li', { texto: x })))])
      : null,
    plan.avisos.length
      ? el('div.aviso', {}, [el('ul', {}, plan.avisos.map((x) => el('li', { texto: x })))])
      : null,
  ]);

  const bloques = plan.porStat.map((s) => {
    if (s.sobran) {
      return tarjeta(`${NOMBRE_STAT[s.stat]} · te sobran ${s.sobran}`, [
        el('p', {}, [
          `Dale ${s.comoQuitar.cuantas} × `, el('strong', { texto: s.comoQuitar.baya }),
          `: ${s.comoQuitar.nota}.`,
        ]),
      ]);
    }

    if (s.sinHordasAlAlcance) {
      return tarjeta(`${NOMBRE_STAT[s.stat]} · faltan ${s.faltan}`, [
        aviso(
          `No hay hordas de ${NOMBRE_STAT[s.stat]} en tus regiones.` +
          (s.hayHordasEnOtraRegion ? ' Sí las hay en otras: desbloquéalas o usa vitaminas.' : ''),
        ),
        el('p', {}, [
          `Con vitaminas: ${s.vitamina.cuantas} × `, el('strong', { texto: s.vitamina.nombre }),
          ` (10 EVs cada una). ${s.vitamina.nota}.`,
        ]),
      ]);
    }

    return tarjeta(`${NOMBRE_STAT[s.stat]} · faltan ${s.faltan} EVs`, [
      el('div.etiquetas', {}, [
        chip(`${s.hordasNecesarias} hordas`, 'si'),
        chip(`${s.evsPorHorda} EVs por horda`),
        chip(`+${s.puntosANivel} puntos a nivel ${plan.nivel}`, 'bien'),
      ]),
      el('p.nota', {}, [
        `Una horda son 5 Pokémon, así que cada ronda da ${s.mejor.ev} × 5`,
        plan.objeto.factor > 1 ? ` × ${plan.objeto.factor}` : '',
        ` = ${s.evsPorHorda} EVs. Las hordas salen con Dulce Aroma.`,
      ]),
      tabla(
        ['EV', 'Especie', 'Región', 'Zona', 'Nivel'],
        s.hordas.map((h) => [`+${h.ev}`, h.especie, chip(h.region, 'si'), h.zona, h.nivel]),
      ),
      el('p.nota', {}, [
        'Alternativa sin moverse: ', el('strong', { texto: `${s.vitamina.cuantas} × ${s.vitamina.nombre}` }),
        `. ${s.vitamina.nota}.`,
      ]),
    ]);
  });

  const huecos = tarjeta('Lo que no sé', [
    el('ul', {}, plan.huecos.map((x) => el('li', { texto: x }))),
  ]);

  return frag([resumen, ...bloques, huecos]);
}
