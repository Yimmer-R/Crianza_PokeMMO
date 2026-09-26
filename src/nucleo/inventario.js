// El inventario: los Pokémon que el usuario tiene de verdad.
//
// Es la pieza que hace que el plan sirva para algo. Un plan calculado en el vacío
// dice "captura 8 padres"; con el inventario dice "te faltan 3, y el Rattata que
// pillaste ayer vale para el hueco de Velocidad".
//
// Y el caso que más pasa: el plan pide un macho con 31 en Velocidad, capturas y
// te sale 31 en Ataque, o hembra. `evaluar()` responde exactamente eso: si sirve
// para ese hueco, si sirve para OTRO hueco del plan, o si no sirve para nada y
// hay que volver a capturar.

import { STATS, IV_MAX, SEXOS } from './constantes.js';
import { perfectos } from './herencia.js';
import { cumple, hojasBajo, ROL } from './planificador.js';
import { sirveComoLineaMaterna } from './compatibilidad.js';

const CLAVE = 'crianza-pokemmo:inventario:v1';

let siguienteId = 1;
const nuevoId = () => `e${Date.now().toString(36)}${(siguienteId++).toString(36)}`;

/** Un ejemplar vacío, listo para que el usuario lo rellene. */
export function ejemplarNuevo(parcial = {}) {
  return {
    id: nuevoId(),
    especie: '',
    sexo: SEXOS.MACHO,
    naturaleza: null,
    habilidad: null,
    ivs: Object.fromEntries(STATS.map((s) => [s, 0])),
    evs: Object.fromEntries(STATS.map((s) => [s, 0])),
    movimientos: [],
    nivel: null,
    shiny: false,
    nota: '',
    capturadoEn: null,
    ...parcial,
  };
}

/** Normaliza lo que venga de un formulario o de localStorage. */
export function normalizar(e) {
  const base = ejemplarNuevo();
  const ivs = { ...base.ivs };
  const evs = { ...base.evs };
  for (const s of STATS) {
    ivs[s] = Math.max(0, Math.min(IV_MAX, Number(e?.ivs?.[s] ?? 0) || 0));
    evs[s] = Math.max(0, Math.min(252, Number(e?.evs?.[s] ?? 0) || 0));
  }
  return {
    ...base,
    ...e,
    id: e?.id || nuevoId(),
    ivs,
    evs,
    movimientos: Array.isArray(e?.movimientos) ? e.movimientos.filter(Boolean) : [],
  };
}

export const totalIvs = (e) => STATS.reduce((a, s) => a + (e.ivs?.[s] ?? 0), 0);
export const cuantosPerfectos = (e) => perfectos(e.ivs ?? {}).size;

/** Resumen corto: "3×31 (PS, Ataque, Velocidad) · Audaz · ♀" */
export function resumen(e) {
  const p = [...perfectos(e.ivs ?? {})];
  const partes = [p.length ? `${p.length}×31 (${p.join(', ')})` : `${totalIvs(e)}/186`];
  if (e.naturaleza) partes.push(e.naturaleza);
  if (e.sexo) partes.push(e.sexo);
  if (e.shiny) partes.push('shiny');
  return partes.join(' · ');
}

// ------------------------------------------------------------- persistencia

/**
 * Guarda en localStorage. Puede fallar (ventana privada, almacenamiento
 * bloqueado), y en ese caso la app sigue funcionando con el inventario en
 * memoria: lo único que se pierde es que sobreviva al recargar.
 */
export function guardar(lista) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(lista));
    return { guardado: true };
  } catch (e) {
    return { guardado: false, motivo: String(e?.message ?? e) };
  }
}

export function cargar() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return [];
    const lista = JSON.parse(crudo);
    return Array.isArray(lista) ? lista.map(normalizar) : [];
  } catch {
    return [];
  }
}

export const exportar = (lista) => JSON.stringify(lista, null, 2);

export function importar(texto) {
  const lista = JSON.parse(texto);
  if (!Array.isArray(lista)) throw new Error('el archivo no contiene una lista de Pokémon');
  return lista.map(normalizar);
}

// ------------------------------------------------- evaluar una nueva captura

/**
 * ¿Para qué sirve este ejemplar dentro de un plan ya calculado?
 *
 * Éste es el caso del enunciado: el plan pedía un macho con 31 en Velocidad y lo
 * que ha salido es otra cosa. Devuelve los huecos donde encaja (si alguno), y si
 * no encaja en ninguno, el motivo por hueco para que se vea qué le falta.
 *
 * @param {Object} ejemplar el recién capturado
 * @param {Object} plan lo que devuelve planear()
 * @param {Object} datos los JSON
 */
export function evaluar(ejemplar, plan, datos) {
  if (!plan?.ok) return { sirve: false, motivo: 'no hay un plan calculado contra el que comparar' };

  // Todos los huecos sin cubrir, no sólo las hojas: un 3×31 puede ocupar un nodo
  // intermedio y borrar siete capturas de golpe, y eso es lo que hay que decirle
  // al usuario antes de que lo tire.
  const huecos = [];
  (function recorre(n) {
    if (n.tipo === 'inventario') return;
    huecos.push(n);
    n.hijos.forEach(recorre);
  })(plan.arbol);

  const encaja = [];
  const rechazos = [];
  for (const h of huecos) {
    const r = cumple(ejemplar, h, datos, plan.objetivo);
    if (r.ok) encaja.push({ hueco: h, ahorro: hojasBajo(h), ...r });
    else if (h.tipo === 'conseguir') rechazos.push({ hueco: h, ...r });
  }

  if (encaja.length) {
    // El hueco que más capturas ahorra: es la diferencia entre "te vale" y
    // "te vale PARA ESTO".
    encaja.sort((a, b) => b.ahorro - a.ahorro || b.hueco.stats.length - a.hueco.stats.length);
    const mejor = encaja[0];
    const queEs = mejor.hueco.stats.length
      ? `${mejor.hueco.stats.length}×31 (${mejor.hueco.stats.join(', ')})`
      : 'naturaleza';
    return {
      sirve: true,
      huecos: encaja,
      mejor,
      mensaje:
        `Sirve, y lo mejor que puedes hacer con él es el hueco de ${queEs}` +
        (mejor.hueco.sexoNecesario ? ` ${mejor.hueco.sexoNecesario}` : '') +
        `: ahorra ${mejor.ahorro} captura${mejor.ahorro === 1 ? '' : 's'}. ` +
        `Encaja en ${encaja.length} hueco${encaja.length === 1 ? '' : 's'} en total. ` +
        'Añádelo al inventario y el plan se recalcula.',
    };
  }

  // No sirve. Interesa decir qué es lo que falla en TODOS los huecos, porque eso
  // es lo que hay que buscar en la siguiente captura.
  const soloSexo = rechazos.length > 0 && rechazos.every((r) => r.sexoIncorrecto);
  const soloEspecie = rechazos.length > 0 && rechazos.every((r) => r.especieIncompatible);
  const soloNaturaleza = rechazos.length > 0 && rechazos.every((r) => r.faltanNaturaleza);
  const faltanMovs = [...new Set(rechazos.flatMap((r) => r.faltanMovimientos ?? []))];
  const ivsQueSalvarian = [...new Set(rechazos.flatMap((r) => r.faltanIvs ?? []))];

  // Antes de decir que no sirve: una hembra de la especie objetivo SIEMPRE sirve,
  // aunque no tenga ni un 31. La especie la pone la madre, así que puede ser la
  // madre de un cruce extra al final de la espina y ahorrarte la captura difícil
  // (esa especie, hembra, y además con el IV). Ver extenderEspinaPorEspecie().
  const comoMadre = sirveComoLineaMaterna(ejemplar, plan.objetivo.especie, datos.pokedex);
  if (comoMadre.sirve && !comoMadre.necesitaDitto) {
    return {
      sirve: true,
      soloEspecie: true,
      huecos: [],
      mensaje:
        `No cumple ningún hueco tal cual, pero es una hembra de ${plan.objetivo.especie} y eso ya ` +
        'vale: la especie la pone la madre. Añádela y el plan alarga la cadena por abajo con un ' +
        'cruce en el que ella sólo pone la especie y el padre trae el IV con su objeto. Te ahorra ' +
        `tener que cazar una ${plan.objetivo.especie} hembra que ADEMÁS cumpla.`,
    };
  }

  let mensaje;
  if (soloNaturaleza) {
    mensaje = `Los IVs valen, pero todos los huecos con naturaleza ${plan.objetivo.naturaleza} ya están ` +
      'ocupados. Guárdalo: si el plan cambia puede volver a entrar.';
  } else if (faltanMovs.length && rechazos.every((r) => r.faltanMovimientos)) {
    mensaje = `No sirve: los huecos libres tienen que pasar ${faltanMovs.join(', ')} y este no lo sabe. ` +
      'Anótale los movimientos si de verdad los tiene.';
  } else if (soloSexo) {
    mensaje = 'Los IVs valen, pero todos los huecos libres piden el otro sexo. ' +
      'Sirve si lo cruzas pagando por el sexo de la cría, o guárdalo para un hueco futuro.';
  } else if (soloEspecie) {
    mensaje = `No comparte grupo huevo con ${plan.objetivo.especie}, así que no entra en esta cadena.`;
  } else if (ivsQueSalvarian.length) {
    mensaje = `No sirve para esta cadena: los huecos libres piden 31 en ${ivsQueSalvarian.join(' o ')} ` +
      `y este no lo tiene. Hay que capturar otro.`;
  } else {
    mensaje = 'No encaja en ningún hueco libre del plan. Hay que capturar otro.';
  }

  return { sirve: false, rechazos, ivsQueSalvarian, soloSexo, soloEspecie, mensaje };
}

/**
 * Qué se le pide a la siguiente captura, en una frase por hueco pendiente.
 * Agrupa los huecos iguales, que en un árbol de 5×31 se repiten mucho.
 */
export function loQueFalta(plan) {
  if (!plan?.ok) return [];
  const mapa = new Map();
  for (const req of plan.pasos.conseguir) {
    const clave = JSON.stringify([req.stats, req.naturaleza, req.sexo, req.especieLibre]);
    const ya = mapa.get(clave);
    if (ya) ya.cuantos++;
    else mapa.set(clave, { ...req, cuantos: 1 });
  }
  return [...mapa.values()].sort((a, b) => b.cuantos - a.cuantos);
}
