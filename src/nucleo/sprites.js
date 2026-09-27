// La imagen de cada Pokémon: de dónde sale y cuál toca.
//
// Las imágenes NO están en este repositorio ni en la wiki: son unos 150 MB y
// las dos cosas son texto. La wiki las enlaza al volcado de PokeAPI
// (`raw/2026-09-27-sprites-pokeapi.md`) y `datos/sprites.json` guarda el
// prefijo común una vez y, de cada Pokémon, sólo lo que cambia. Aquí se vuelven
// a juntar.
//
// Dos vías por Pokémon, y las dos son de la wiki:
//
//   · `tresD`   — el render 3D del modelo de Pokémon HOME. Es lo que pidió el
//                 usuario y es lo más nuevo que existe publicado suelto: de
//                 Escarlata/Púrpura y de Leyendas Z-A no hay volcado, y está
//                 comprobado pidiendo el archivo, no supuesto.
//   · `frontal` — el sprite animado de 5ª generación, que es la generación que
//                 usa PokeMMO. Es el respaldo cuando el 3D no está, y es lo que
//                 uno ve de verdad dentro del juego.
//
// No hay dorso: desde la 6ª generación el combate se renderiza con el modelo,
// así que en 3D no existe. Tampoco haría falta aquí — esto es un planificador,
// no un simulador de combate.

import { SEXOS } from './constantes.js';

export const VIA_3D = 'tresD';
export const VIA_ANIMADO = 'frontal';

/** Qué clave del JSON lleva la variante hembra de cada vía. */
const HEMBRA = { [VIA_3D]: 'tresDHembra', [VIA_ANIMADO]: 'frontalHembra' };

/**
 * URL de la imagen de una especie, o `null` si la wiki no la trae.
 *
 * El sexo importa en 97 de las 667: son las que el juego dibuja distinto según
 * sea ♂ o ♀ (Unfezant, Pyroar, Hippopotas…). En el resto la clave de hembra no
 * existe y se devuelve la de siempre, que es lo correcto: no es un hueco.
 *
 * Nunca se devuelve la imagen de OTRA especie. Un Pokémon sin sprite se queda
 * sin sprite y la vista enseña su hueco, que es la regla 2 del repositorio:
 * antes un hueco declarado que un dato plausible y falso.
 *
 * @param {string} especie nombre de la ficha, en inglés
 * @param {Object} sprites `datos/sprites.json`
 * @param {Object} opciones `sexo` es uno de SEXOS; `via` es VIA_3D o VIA_ANIMADO
 * @returns {string|null}
 */
export function urlSprite(especie, sprites, { sexo = null, via = VIA_3D } = {}) {
  const entrada = sprites?.de?.[especie];
  if (!entrada) return null;
  const preferidas = [
    sexo === SEXOS.HEMBRA ? HEMBRA[via] : null,
    via,
    // Si la vía pedida falta, la otra sirve: enseñar al Pokémon importa más que
    // enseñarlo en 3D. Mothim en «Envuelto en Planta» es justo este caso.
    via === VIA_3D ? VIA_ANIMADO : VIA_3D,
  ];
  const rel = preferidas.map((k) => k && entrada[k]).find(Boolean);
  return rel ? `${sprites.base ?? ''}${rel}` : null;
}

/** ¿Esta especie se dibuja distinta según el sexo? */
export const tieneSpriteDeHembra = (especie, sprites) =>
  Boolean(sprites?.de?.[especie]?.[HEMBRA[VIA_3D]] || sprites?.de?.[especie]?.[HEMBRA[VIA_ANIMADO]]);

/**
 * Texto alternativo. Lo lee quien no ve la imagen, así que dice la especie y,
 * sólo cuando cambia el dibujo, el sexo.
 */
export function altSprite(especie, sprites, sexo = null) {
  if (sexo === SEXOS.HEMBRA && tieneSpriteDeHembra(especie, sprites)) return `${especie} hembra`;
  if (sexo === SEXOS.MACHO && tieneSpriteDeHembra(especie, sprites)) return `${especie} macho`;
  return especie;
}
