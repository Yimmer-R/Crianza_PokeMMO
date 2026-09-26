// Estado de la app en un sitio, con suscripción.
//
// Todo lo que el usuario escribe vive aquí, y cada cambio dispara un repintado.
// Eso es lo que hace que añadir una captura recalcule el plan entero sin que
// haya que pulsar nada: es justo lo que pide el enunciado.
//
// Hay VARIAS crianzas a la vez y UN solo inventario. El inventario es de verdad
// compartido —los Pokémon son los mismos, están en tu PC— así que dos crianzas
// pueden querer el mismo ejemplar. Eso no se resuelve escondiéndolo: se calcula
// el plan de todas contra el inventario entero y se AVISA de los ejemplares que
// dos planes se están disputando. Lo que de verdad reparte es completar un paso,
// porque ahí el Pokémon se gasta y sale del inventario.

import { STATS, REGIONES } from '../nucleo/constantes.js';
import { cargar as cargarInventario, guardar as guardarInventario } from '../nucleo/inventario.js';

const CLAVE = 'crianza-pokemmo:estado:v2';
const CLAVE_V1 = 'crianza-pokemmo:estado:v1';

let contadorCrianza = 0;
const nuevoIdCrianza = () => `c${Date.now().toString(36)}${(contadorCrianza++).toString(36)}`;

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
  };
}

/** Una crianza: un objetivo con nombre propio. El inventario NO es suyo. */
export function crianzaVacia(parcial = {}) {
  return { id: nuevoIdCrianza(), nombre: '', objetivo: objetivoVacio(), ...parcial };
}

/**
 * Cómo se llama una crianza en la lista. Si el usuario no le ha puesto nombre,
 * se deduce del objetivo, que es lo que quiere leer: "Larvitar 4×31 Agitada".
 */
export function nombreDeCrianza(c) {
  if (c.nombre?.trim()) return c.nombre.trim();
  const o = c.objetivo;
  if (!o.especie) return 'Crianza sin objetivo';
  const n = STATS.filter((s) => (o.ivs[s] ?? 0) >= 31).length;
  return [o.especie, n ? `${n}×31` : null, o.naturaleza].filter(Boolean).join(' ');
}

const primera = crianzaVacia();

const inicial = {
  vista: 'objetivo',
  crianzas: [primera],
  crianzaActiva: primera.id,
  // Espejo del objetivo de la crianza activa. Es de sólo lectura para las
  // vistas: se escribe con fijar({ objetivo }) y estado.js lo propaga a la
  // crianza activa. Ver la nota de fijar().
  objetivo: primera.objetivo,
  regionesDisponibles: [...REGIONES],
  inventario: [],
  // Los planes se recalculan en cada cambio, no se guardan. `plan` es el de la
  // crianza activa; `planes` los de todas, que es lo que permite avisar de un
  // ejemplar que dos crianzas se disputan.
  plan: null,
  planes: {},
  disputados: [],
  ultimaEvaluacion: null,
  avisoPersistencia: null,
  // Importación pendiente de revisar, y estado del OCR mientras trabaja. No se
  // persisten: son de un solo uso.
  importacion: null,
  ocr: null,
  vistaImportar: 'imagen',
  // Al importar al objetivo: marcar los seis IVs a 31 en vez de sólo los que la
  // ficha ya trae perfectos.
  importarTodosLosIvs: false,
  // Ejemplar que la revisión manda al formulario manual para corregirlo.
  alFormulario: null,
  // Por qué no se ha podido añadir un movimiento al objetivo.
  avisoMovimiento: null,
  // Ejemplares marcados en el inventario para borrarlos por tandas.
  seleccion: [],
  // Inventario de antes del último paso completado, para poder deshacerlo.
  deshacer: null,
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

/**
 * ¿Son el mismo valor? Para primitivos, identidad; para objetos, comparación por
 * contenido. Se usa para no repintar cuando un cambio no cambia nada.
 */
function mismoValor(a, b) {
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false; // estructuras raras: mejor repintar de más que de menos
  }
}

/**
 * Cambia el estado y repinta. `parcial` puede ser objeto o función.
 *
 * **Si el cambio no cambia nada, no se repinta.** No es una optimización: es la
 * defensa contra un bucle real. Al repintar, el navegador dispara eventos
 * (`blur`, `change`) sobre los elementos que se están QUITANDO del DOM; si el
 * manejador de uno de ellos llama aquí con el valor que ya tenía, se repinta
 * otra vez, se vuelve a disparar el evento, y la página se congela. Pasó con el
 * campo de especie y desde fuera parecía que la app no cargaba.
 *
 * Y una regla más: **escribir `objetivo` escribe también en la crianza activa**.
 * Las vistas siguen leyendo y escribiendo `estado.objetivo` como cuando sólo
 * había una crianza; el reparto entre crianzas se hace aquí, en un sitio, y no
 * en veinte llamadas repartidas por las vistas.
 */
export function fijar(parcial) {
  let siguiente = typeof parcial === 'function' ? parcial(estado) : parcial;
  if (!siguiente) return;

  if ('objetivo' in siguiente && !('crianzas' in siguiente)) {
    siguiente = {
      ...siguiente,
      crianzas: estado.crianzas.map((c) =>
        (c.id === estado.crianzaActiva ? { ...c, objetivo: siguiente.objetivo } : c)),
    };
  }

  const claves = Object.keys(siguiente);
  if (claves.length && claves.every((k) => mismoValor(estado[k], siguiente[k]))) return;

  estado = { ...estado, ...siguiente };
  emitir();
}

/** Igual que fijar(), pero además persiste lo que merece sobrevivir a un F5. */
export function fijarYGuardar(parcial) {
  fijar(parcial);
  persistir();
}

// ------------------------------------------------------------- las crianzas

export const crianzaActiva = (st = estado) =>
  st.crianzas.find((c) => c.id === st.crianzaActiva) ?? st.crianzas[0];

/** Crea una crianza vacía y se cambia a ella. */
export function anadirCrianza() {
  const c = crianzaVacia();
  fijarYGuardar((st) => ({
    crianzas: [...st.crianzas, c],
    crianzaActiva: c.id,
    objetivo: c.objetivo,
    ultimaEvaluacion: null,
  }));
  return c.id;
}

/** Copia una crianza con su objetivo: sirve para variar un plan sin perder el otro. */
export function duplicarCrianza(id) {
  const orig = estado.crianzas.find((c) => c.id === id);
  if (!orig) return null;
  const c = crianzaVacia({
    nombre: `${nombreDeCrianza(orig)} (copia)`,
    objetivo: JSON.parse(JSON.stringify(orig.objetivo)),
  });
  fijarYGuardar((st) => ({
    crianzas: [...st.crianzas, c],
    crianzaActiva: c.id,
    objetivo: c.objetivo,
    ultimaEvaluacion: null,
  }));
  return c.id;
}

export function cambiarDeCrianza(id) {
  const c = estado.crianzas.find((x) => x.id === id);
  if (!c || c.id === estado.crianzaActiva) return;
  // Va `crianzas` a propósito, aunque no cambie: sin él, fijar() entendería el
  // `objetivo` nuevo como una edición y lo escribiría en la crianza que TODAVÍA
  // está activa, dejando las dos con el mismo objetivo. Pasó de verdad.
  fijarYGuardar({
    crianzas: estado.crianzas,
    crianzaActiva: c.id,
    objetivo: c.objetivo,
    ultimaEvaluacion: null,
    seleccion: [],
  });
}

export function renombrarCrianza(id, nombre) {
  fijarYGuardar((st) => ({
    crianzas: st.crianzas.map((c) => (c.id === id ? { ...c, nombre } : c)),
  }));
}

/**
 * Borra una crianza. No toca el inventario: los Pokémon siguen ahí, sólo
 * desaparece el plan. Nunca se queda sin ninguna: si era la última, entra una
 * vacía.
 */
export function borrarCrianza(id) {
  fijarYGuardar((st) => {
    const quedan = st.crianzas.filter((c) => c.id !== id);
    const lista = quedan.length ? quedan : [crianzaVacia()];
    const activa = lista.some((c) => c.id === st.crianzaActiva) ? st.crianzaActiva : lista[0].id;
    const c = lista.find((x) => x.id === activa);
    return { crianzas: lista, crianzaActiva: activa, objetivo: c.objetivo, ultimaEvaluacion: null };
  });
}

// ------------------------------------------------------------- persistencia

function persistir() {
  const r = guardarInventario(estado.inventario);
  try {
    localStorage.setItem(CLAVE, JSON.stringify({
      crianzas: estado.crianzas,
      crianzaActiva: estado.crianzaActiva,
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
    // Versión anterior: un solo objetivo suelto. Se convierte en la primera
    // crianza en vez de tirarlo.
    if (!guardado) {
      const v1 = JSON.parse(localStorage.getItem(CLAVE_V1) ?? 'null');
      if (v1?.objetivo)
        guardado = {
          crianzas: [crianzaVacia({ objetivo: v1.objetivo })],
          regionesDisponibles: v1.regionesDisponibles,
          vista: v1.vista,
        };
    }
  } catch { /* da igual: se arranca en blanco */ }

  const crianzas = (Array.isArray(guardado?.crianzas) && guardado.crianzas.length
    ? guardado.crianzas
    : [crianzaVacia()]
  ).map((c) => ({
    ...crianzaVacia(),
    ...c,
    objetivo: { ...objetivoVacio(), ...(c.objetivo ?? {}) },
  }));
  const activa = crianzas.some((c) => c.id === guardado?.crianzaActiva)
    ? guardado.crianzaActiva : crianzas[0].id;

  estado = {
    ...estado,
    inventario: cargarInventario(),
    crianzas,
    crianzaActiva: activa,
    objetivo: crianzas.find((c) => c.id === activa).objetivo,
    regionesDisponibles: guardado?.regionesDisponibles ?? [...REGIONES],
    vista: guardado?.vista ?? 'objetivo',
  };
}

export { objetivoVacio };
