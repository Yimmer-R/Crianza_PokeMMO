// Estado de la app en un sitio, con suscripción.
//
// Todo lo que el usuario escribe vive aquí, y cada cambio dispara un repintado.
// Eso es lo que hace que añadir una captura recalcule el plan entero sin que
// haya que pulsar nada: es justo lo que pide el enunciado.

import { STATS, REGIONES } from '../nucleo/constantes.js';
import { cargar as cargarInventario, guardar as guardarInventario } from '../nucleo/inventario.js';

const CLAVE = 'crianza-pokemmo:estado:v1';

function objetivoVacio() {
  return {
    especie: '',
    ivs: Object.fromEntries(STATS.map((s) => [s, 0])),
    evs: Object.fromEntries(STATS.map((s) => [s, 0])),
    naturaleza: null,
    habilidad: null,
    movimientos: [],
    sexo: null,
    nivel: 50,
    objetoEntrenamiento: 'Vínculo de Entrenamiento',
    // 'auto' construye las dos formas de llevar la naturaleza y se queda con la
    // de menos esfuerzo. Ninguna gana siempre: depende del inventario.
    estrategiaNaturaleza: 'auto',
  };
}

const inicial = {
  vista: 'objetivo',
  objetivo: objetivoVacio(),
  regionesDisponibles: [...REGIONES],
  inventario: [],
  // El plan se recalcula en cada cambio, no se guarda.
  plan: null,
  ultimaEvaluacion: null,
  avisoPersistencia: null,
  // Importación pendiente de revisar, y estado del OCR mientras trabaja. No se
  // persisten: son de un solo uso.
  importacion: null,
  ocr: null,
  vistaImportar: 'imagen',
};

let estado = { ...inicial };
const oyentes = new Set();

export const obtener = () => estado;

export function suscribir(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

function emitir() {
  for (const fn of oyentes) fn(estado);
}

/** Cambia el estado y repinta. `parcial` puede ser objeto o función. */
export function fijar(parcial) {
  const siguiente = typeof parcial === 'function' ? parcial(estado) : parcial;
  estado = { ...estado, ...siguiente };
  emitir();
}

/** Igual que fijar(), pero además persiste lo que merece sobrevivir a un F5. */
export function fijarYGuardar(parcial) {
  fijar(parcial);
  persistir();
}

function persistir() {
  const r = guardarInventario(estado.inventario);
  try {
    localStorage.setItem(CLAVE, JSON.stringify({
      objetivo: estado.objetivo,
      regionesDisponibles: estado.regionesDisponibles,
      vista: estado.vista,
    }));
  } catch (e) {
    estado = { ...estado, avisoPersistencia: String(e?.message ?? e) };
  }
  if (!r.guardado) estado = { ...estado, avisoPersistencia: r.motivo };
}

/**
 * Recupera lo guardado. Si el almacenamiento está bloqueado (ventana privada,
 * cookies desactivadas) la app arranca en blanco y sigue funcionando: lo único
 * que se pierde es que el inventario sobreviva al recargar.
 */
export function restaurar() {
  let guardado = null;
  try {
    guardado = JSON.parse(localStorage.getItem(CLAVE) ?? 'null');
  } catch { /* da igual: se arranca en blanco */ }

  estado = {
    ...estado,
    inventario: cargarInventario(),
    objetivo: { ...objetivoVacio(), ...(guardado?.objetivo ?? {}) },
    regionesDisponibles: guardado?.regionesDisponibles ?? [...REGIONES],
    vista: guardado?.vista ?? 'objetivo',
  };
}

export { objetivoVacio };
