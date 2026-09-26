// Hora del juego y estación: si el Pokémon está ahí cuando tú entras.
//
// Cada fila de `datos/encuentros.json` y de `datos/donde-entrenar.json` trae
// `horas` y `estaciones` con las franjas en las que esa tabla existe. Una lista
// completa significa «siempre»; una corta, que sólo sale entonces.
//
// La app NO esconde lo que no toca ahora mismo, y es a propósito: con las
// regiones esconder tiene sentido porque no puedes jugar en una región que no
// tienes, pero una franja horaria llega sola en minutos —un día del juego son
// 6 horas reales— y una estación en semanas. Lo útil es ordenar lo de ahora
// primero y decir del resto cuándo sí.

import { HORAS, ESTACIONES } from './constantes.js';

/** Lo que el usuario tiene puesto. `null` en cualquiera de los dos = no filtrar. */
export const CUANDO_CUALQUIERA = { hora: null, estacion: null };

/** ¿Esta fila de encuentro existe con la hora y la estación elegidas? */
export function disponibleAhora(fila, cuando = CUANDO_CUALQUIERA) {
  const { hora = null, estacion = null } = cuando ?? {};
  if (hora && !(fila.horas ?? HORAS).includes(hora)) return false;
  if (estacion && !(fila.estaciones ?? ESTACIONES).includes(estacion)) return false;
  return true;
}

/** ¿Por qué no está disponible? Devuelve null si lo está. */
export function porQueNoAhora(fila, cuando = CUANDO_CUALQUIERA) {
  const { hora = null, estacion = null } = cuando ?? {};
  const horas = fila.horas ?? HORAS;
  const estaciones = fila.estaciones ?? ESTACIONES;
  const faltaHora = hora && !horas.includes(hora);
  const faltaEstacion = estacion && !estaciones.includes(estacion);
  if (!faltaHora && !faltaEstacion) return null;
  return {
    faltaHora, faltaEstacion,
    // Esperar a otra franja son minutos; a otra estación, semanas.
    espera: faltaEstacion ? 'estacion' : 'hora',
    texto: [
      faltaHora ? `sólo ${listaHumana(horas)}` : null,
      faltaEstacion ? `sólo en ${listaHumana(estaciones)}` : null,
    ].filter(Boolean).join(' y '),
  };
}

/** "de noche" / "de día o de noche" / "a cualquier hora". */
export function cuandoLegible(fila) {
  const horas = fila.horas ?? HORAS;
  const estaciones = fila.estaciones ?? ESTACIONES;
  const todaHora = horas.length >= HORAS.length;
  const todaEstacion = estaciones.length >= ESTACIONES.length;
  if (todaHora && todaEstacion) return 'siempre';
  return [
    todaHora ? null : listaHumana(horas),
    todaEstacion ? null : `en ${listaHumana(estaciones)}`,
  ].filter(Boolean).join(', ');
}

/** ¿Esta fila tiene alguna restricción, mires cuando mires? */
export const tieneRestriccion = (fila) =>
  (fila.horas ?? HORAS).length < HORAS.length
  || (fila.estaciones ?? ESTACIONES).length < ESTACIONES.length;

function listaHumana(lista) {
  if (lista.length === 1) return lista[0];
  return `${lista.slice(0, -1).join(', ')} o ${lista[lista.length - 1]}`;
}

/**
 * Ordena poniendo delante lo que se puede hacer AHORA.
 *
 * A igualdad, lo que sólo espera un cambio de franja va antes que lo que espera
 * un cambio de estación: minutos frente a semanas. `despues` desempata con el
 * criterio de quien llama (rareza, EVs…).
 */
export function ordenarPorCuando(lista, cuando, despues = () => 0) {
  const coste = (f) => {
    const no = porQueNoAhora(f, cuando);
    if (!no) return 0;
    return no.espera === 'estacion' ? 2 : 1;
  };
  return [...lista].sort((a, b) => coste(a) - coste(b) || despues(a, b));
}
