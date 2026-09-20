// Resolver nombres escritos a mano, sacados de OCR o copiados del juego.
//
// Hace falta porque **el cliente del juego y la wiki no siempre llaman igual a la
// misma cosa**. El caso que lo destapó: una ficha del juego que dice
// «Desenrollar», que es la localización antigua de Rollout; la wiki lo tiene como
// «Rodar», que es como lo llama PokeAPI. Comparar cadenas a pelo lo habría dado
// por movimiento inexistente y habría descartado el dato.
//
// El orden de intentos va de más fiable a menos, y SIEMPRE se devuelve por qué
// vía se resolvió, para que la interfaz pueda decir «he interpretado X como Y» en
// vez de decidir en silencio.

/** Quita tildes, signos y dobles espacios: "At. Esp." y "at esp" se comparan igual. */
export function normalizar(txt) {
  return String(txt ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // fuera los diacríticos
    .toLowerCase()
    .replace(/[''`´]/g, "'")
    .replace(/[^a-z0-9'♀♂]+/g, ' ')
    .trim();
}

/**
 * Nombres que el cliente del juego usa y la wiki no.
 *
 * No es una lista completa y no puede serlo: se va llenando a medida que
 * aparecen. Cada entrada lleva de dónde salió, para poder revisarla.
 */
export const ALIAS_DEL_CLIENTE = {
  movimientos: {
    // El juego usa la localización de 3ª-5ª generación; la wiki, la actual.
    // (visto en una ficha de Chimchar del propio juego, 20-09-2026)
    desenrollar: 'Rodar',
  },
  naturalezas: {},
  habilidades: {},
  especies: {},
};

/** Distancia de edición con corte: en cuanto pasa del tope, se abandona. */
export function distancia(a, b, tope = 3) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  let previa = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    let minimoDeLaFila = i;
    for (let j = 1; j <= b.length; j++) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1;
      fila[j] = Math.min(previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + coste);
      if (fila[j] < minimoDeLaFila) minimoDeLaFila = fila[j];
    }
    if (minimoDeLaFila > tope) return tope + 1; // ya no puede bajar
    previa = fila;
  }
  return previa[b.length];
}

/**
 * Índice de búsqueda para una familia de nombres.
 *
 * @param {string[]} canonicos nombres tal cual están en los datos
 * @param {(n: string) => string[]} sinonimos otros nombres del mismo (p. ej. el inglés)
 * @param {Object} aliasCliente tabla manual de nombres del juego
 */
export function crearIndice(canonicos, sinonimos = () => [], aliasCliente = {}) {
  const porNormal = new Map();
  const apunta = (clave, valor, via) => {
    const k = normalizar(clave);
    if (!k) return;
    // El nombre canónico nunca se pisa por un sinónimo de otro.
    if (porNormal.has(k) && porNormal.get(k).via === 'exacto') return;
    porNormal.set(k, { valor, via });
  };

  for (const n of canonicos) apunta(n, n, 'exacto');
  for (const n of canonicos) for (const s of sinonimos(n)) apunta(s, n, 'alias-ingles');
  for (const [clave, valor] of Object.entries(aliasCliente)) apunta(clave, valor, 'alias-cliente');

  const claves = [...porNormal.keys()];

  return function resolver(texto, { aproximar = true } = {}) {
    const bruto = String(texto ?? '').trim();
    if (!bruto) return { valor: null, via: 'vacio', entrada: bruto, candidatos: [] };

    const k = normalizar(bruto);
    const directo = porNormal.get(k);
    if (directo) return { valor: directo.valor, via: directo.via, entrada: bruto, candidatos: [] };

    if (!aproximar) return { valor: null, via: 'desconocido', entrada: bruto, candidatos: [] };

    // Aproximado: tolera erratas y ruido de OCR ("Maquinacien", "Rodar " con basura).
    // El tope crece con la longitud, pero nunca tanto como para confundir dos
    // nombres cortos distintos.
    const tope = Math.max(1, Math.min(3, Math.floor(k.length / 5)));
    const cerca = [];
    for (const clave of claves) {
      const d = distancia(k, clave, tope);
      if (d <= tope) cerca.push({ clave, d, valor: porNormal.get(clave).valor });
    }
    // Un prefijo también vale: el OCR corta el final más veces que el principio.
    if (!cerca.length) {
      for (const clave of claves) {
        if (clave.startsWith(k) && k.length >= 4) cerca.push({ clave, d: 0.5, valor: porNormal.get(clave).valor });
      }
    }
    cerca.sort((a, b) => a.d - b.d || a.clave.length - b.clave.length);

    const distintos = [...new Set(cerca.map((c) => c.valor))];
    if (distintos.length === 1)
      return { valor: distintos[0], via: 'aproximado', entrada: bruto, candidatos: distintos };

    return { valor: null, via: distintos.length ? 'ambiguo' : 'desconocido', entrada: bruto, candidatos: distintos.slice(0, 6) };
  };
}

/** Los cuatro resolutores que necesita la app, montados sobre los datos ya cargados. */
export function crearResolutores(datos) {
  const ingles = (mapa) => (n) => (mapa[n]?.ingles ? [mapa[n].ingles] : []);

  return {
    especie: crearIndice(Object.keys(datos.pokedex), () => [], ALIAS_DEL_CLIENTE.especies),
    movimiento: crearIndice(Object.keys(datos.movimientos), ingles(datos.movimientos), ALIAS_DEL_CLIENTE.movimientos),
    naturaleza: crearIndice(Object.keys(datos.naturalezas), ingles(datos.naturalezas), ALIAS_DEL_CLIENTE.naturalezas),
    habilidad: crearIndice(Object.keys(datos.habilidades), ingles(datos.habilidades), ALIAS_DEL_CLIENTE.habilidades),
  };
}

/** "♀", "hembra", "f", "female" -> "♀" */
export function resolverSexo(texto) {
  const k = normalizar(texto);
  if (!k) return null;
  if (k.includes('♀') || /^(f|h|hembra|female|fem)$/.test(k)) return '♀';
  if (k.includes('♂') || /^(m|macho|male)$/.test(k)) return '♂';
  if (/sin genero|genderless|neutro|^-$|^—$/.test(k)) return '—';
  return null;
}
