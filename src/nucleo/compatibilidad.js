// Quién puede criar con quién, y de quién sale la especie de la cría.
//
// Fuente: wiki/mecanicas/Crianza.md — «Hacen falta dos Pokémon del mismo grupo
// huevo y de sexo opuesto. Ditto cría con cualquiera. La cría hereda la especie
// de la madre (o del progenitor que no sea Ditto)».
//
// Esa segunda frase es la que abre la puerta al truco que hace baratas las
// cadenas: el PADRE puede ser de cualquier especie que comparta grupo huevo, así
// que se elige la más fácil de capturar. Sólo la línea materna tiene que ser de
// la especie objetivo.

import { GRUPOS_ESTERILES, GRUPO_DITTO, GRUPO_SIN_GENERO, SEXOS } from './constantes.js';

const DITTO = 'Ditto';

export const esDitto = (especie) => especie === DITTO;

export const esEsteril = (p) => !p || (p.gruposHuevo ?? []).some((g) => GRUPOS_ESTERILES.includes(g));

export const sinGenero = (p) =>
  !!p && (p.genero?.sinGenero === true || (p.gruposHuevo ?? []).includes(GRUPO_SIN_GENERO));

/** Sexos que puede tener una especie, según su ratio. */
export function sexosPosibles(p) {
  if (sinGenero(p)) return [SEXOS.SIN_GENERO];
  const out = [];
  if ((p.genero?.macho ?? 0) > 0) out.push(SEXOS.MACHO);
  if ((p.genero?.hembra ?? 0) > 0) out.push(SEXOS.HEMBRA);
  return out;
}

/** Grupos huevo en común entre dos especies. */
export const gruposEnComun = (a, b) =>
  (a?.gruposHuevo ?? []).filter((g) => (b?.gruposHuevo ?? []).includes(g) && g !== GRUPO_DITTO);

/**
 * ¿Pueden criar estos dos? Devuelve el motivo cuando no, porque en la práctica
 * el "no" es la respuesta útil: dice qué hay que cambiar.
 *
 * @param {{especie: string, sexo: string}} a
 * @param {{especie: string, sexo: string}} b
 * @param {Object} pokedex datos/pokemon.json
 */
export function puedenCriar(a, b, pokedex) {
  const pa = pokedex[a.especie];
  const pb = pokedex[b.especie];
  if (!pa) return { puede: false, motivo: `no conozco la especie "${a.especie}"` };
  if (!pb) return { puede: false, motivo: `no conozco la especie "${b.especie}"` };

  if (esEsteril(pa)) return { puede: false, motivo: `${a.especie} no cría` };
  if (esEsteril(pb)) return { puede: false, motivo: `${b.especie} no cría` };

  if (esDitto(a.especie) && esDitto(b.especie))
    return { puede: false, motivo: 'dos Ditto no crían entre sí' };

  // Ditto cría con cualquiera, y la especie sale del otro. Es la única forma de
  // criar una especie sin género, y de usar un macho como línea materna.
  if (esDitto(a.especie) || esDitto(b.especie)) {
    const otro = esDitto(a.especie) ? b : a;
    return { puede: true, especieCria: pokedex[otro.especie].base, via: 'ditto', madre: otro };
  }

  // Sin género: cría con su PROPIA LÍNEA EVOLUTIVA o con Ditto, y nada más.
  //
  // Esto es de PokeMMO y no de los juegos originales, donde un sin género sólo
  // cría con Ditto. La wiki lo dice en una línea: «Genderless Pokémon can only
  // breed with their evolution line Pokémon and Ditto»
  // (wiki/mecanicas/Crianza.md). La app lo tenía como los juegos originales y
  // por eso un objetivo sin género salía como captura imposible.
  if (sinGenero(pa) || sinGenero(pb)) {
    const losDos = sinGenero(pa) && sinGenero(pb);
    if (losDos && pa.base === pb.base)
      return {
        puede: true,
        especieCria: pa.base,
        via: 'misma-linea',
        // Sin sexos no hay madre ni padre: la cría sale de la especie, que es
        // la misma en los dos.
        madre: a,
        padre: b,
      };
    return {
      puede: false,
      motivo: `${sinGenero(pa) ? a.especie : b.especie} no tiene género: sólo cría con su misma `
        + 'línea evolutiva o con un Ditto',
    };
  }

  const comunes = gruposEnComun(pa, pb);
  if (!comunes.length)
    return {
      puede: false,
      motivo: `no comparten grupo huevo (${a.especie}: ${pa.gruposHuevo.join(', ')} · ${b.especie}: ${pb.gruposHuevo.join(', ')})`,
    };

  if (a.sexo === b.sexo)
    return { puede: false, motivo: `los dos son ${a.sexo}: hacen falta sexos opuestos` };

  const madre = a.sexo === SEXOS.HEMBRA ? a : b;
  const padre = madre === a ? b : a;
  return {
    puede: true,
    // La cría sale de la especie de la madre, y siempre en su forma base.
    especieCria: pokedex[madre.especie].base,
    gruposEnComun: comunes,
    via: 'grupo-huevo',
    madre,
    padre,
  };
}

/**
 * Especies que pueden hacer de PADRE de una madre dada: comparten grupo huevo y
 * pueden ser macho. Ordenadas por lo fácil que es conseguirlas, que lo decide
 * quien llama pasando `puntua`.
 */
export function padresCompatibles(especieMadre, pokedex, { puntua = null, incluirDitto = true } = {}) {
  const madre = pokedex[especieMadre];
  if (!madre || esEsteril(madre)) return [];

  const out = [];

  // Un sin género no mira grupos huevo: su lista es su propia línea evolutiva
  // más el Ditto, y ahí se acaba. Devolver la lista del grupo huevo dejaba al
  // planificador sin ninguna pareja válida.
  if (sinGenero(madre)) {
    for (const [nombre, p] of Object.entries(pokedex)) {
      if (esEsteril(p) || esDitto(nombre)) continue;
      if (p.base !== madre.base) continue;
      out.push({ especie: nombre, via: 'misma-linea', grupos: [] });
    }
    if (incluirDitto) out.push({ especie: DITTO, via: 'ditto', grupos: [] });
    if (puntua) out.sort((a, b) => puntua(b) - puntua(a));
    return out;
  }

  for (const [nombre, p] of Object.entries(pokedex)) {
    if (nombre === especieMadre) continue;
    if (esEsteril(p)) continue;
    if (esDitto(nombre)) {
      if (incluirDitto) out.push({ especie: nombre, via: 'ditto', grupos: [] });
      continue;
    }
    if (sinGenero(p)) continue;
    if ((p.genero?.macho ?? 0) <= 0) continue; // tiene que poder ser macho
    const comunes = gruposEnComun(madre, p);
    if (!comunes.length) continue;
    out.push({ especie: nombre, via: 'grupo-huevo', grupos: comunes });
  }

  if (puntua) out.sort((a, b) => puntua(b) - puntua(a));
  return out;
}

/**
 * ¿Sirve este Pokémon del inventario como línea materna de la especie objetivo?
 *
 * La especie la da la madre, así que sólo valen: una hembra de la especie
 * objetivo (o de su misma línea evolutiva), o un macho de esa especie si se le
 * pone un Ditto delante.
 */
export function sirveComoLineaMaterna(ejemplar, especieObjetivo, pokedex) {
  const p = pokedex[ejemplar.especie];
  const objetivo = pokedex[especieObjetivo];
  if (!p || !objetivo) return { sirve: false, motivo: 'especie desconocida' };
  if (p.base !== objetivo.base)
    return { sirve: false, motivo: `${ejemplar.especie} no es de la línea de ${especieObjetivo}` };
  if (ejemplar.sexo === SEXOS.HEMBRA) return { sirve: true, necesitaDitto: false };
  // Sin género no hay madre: la cría sale de la especie, y la pareja es su
  // misma línea o un Ditto. Cualquiera de los dos vale, así que no hace falta
  // Ditto de forma obligatoria.
  if (sinGenero(p)) return { sirve: true, necesitaDitto: false, sinGenero: true };
  return { sirve: true, necesitaDitto: true, motivo: 'es macho: hace falta un Ditto para que la cría sea de su especie' };
}

/** Precio de pagar por el sexo, según lo raro que sea ese sexo en la especie. */
export function costeElegirSexo(especie, sexoQuerido, pokedex, tabla) {
  const p = pokedex[especie];
  if (!p || sinGenero(p)) return null;
  const ratio = sexoQuerido === SEXOS.HEMBRA ? p.genero.hembra : p.genero.macho;
  // El tramo que aplica es el del ratio más bajo que siga siendo >= al del sexo pedido.
  const tramo = [...tabla]
    .sort((a, b) => b.ratioMinoritario - a.ratioMinoritario)
    .find((t) => ratio >= t.ratioMinoritario) ?? tabla[tabla.length - 1];
  return { ratio, precio: tramo.precio, confianza: tramo.confianza };
}
