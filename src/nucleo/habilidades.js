// Cómo llega la habilidad pedida.
//
// Aquí hay un hueco real y conviene decirlo en vez de rellenarlo: la wiki NO
// documenta cómo se hereda la habilidad al criar en PokeMMO. Así que este módulo
// no da probabilidades inventadas; da las vías que sí están documentadas:
//
//   - habilidad normal  -> [[Píldora Habilidad]], que la cambia y se consume
//   - habilidad oculta  -> [[Parche de Habilidad]], que desbloquea la oculta
//   - o un Alpha, que ya viene con la oculta y dos IVs perfectos, con la pega de
//     que para CRIAR Alphas los dos padres tienen que ser Alpha
//     (wiki/mecanicas/Pokémon Alpha.md)

export const PILDORA = 'Píldora Habilidad';
export const PARCHE = 'Parche de Habilidad';

/** Qué habilidades puede tener la especie, y cuáles son ocultas. */
export function habilidadesDe(especie, pokedex) {
  const p = pokedex[especie];
  if (!p) return { normales: [], ocultas: [] };
  return {
    normales: (p.habilidades ?? []).filter((h) => !h.oculta).map((h) => h.nombre),
    ocultas: (p.habilidades ?? []).filter((h) => h.oculta).map((h) => h.nombre),
  };
}

/**
 * Plan para la habilidad pedida.
 * @returns {{ok: boolean, via: string, pasos: string[], objetos: string[], huecos: string[]}}
 */
export function planearHabilidad(objetivo, datos) {
  const { pokedex } = datos;
  const especie = objetivo.especie;
  const quiere = objetivo.habilidad;
  if (!quiere) return { ok: true, via: 'ninguna', pasos: [], objetos: [], huecos: [] };

  const { normales, ocultas } = habilidadesDe(especie, pokedex);

  if (!normales.includes(quiere) && !ocultas.includes(quiere)) {
    return {
      ok: false,
      via: 'imposible',
      pasos: [`${especie} no puede tener ${quiere}. Sus habilidades son: ` +
        [...normales, ...ocultas.map((h) => `${h} (oculta)`)].join(', ')],
      objetos: [], huecos: [],
    };
  }

  if (ocultas.includes(quiere)) {
    return {
      ok: true,
      via: 'oculta',
      esOculta: true,
      pasos: [
        `${quiere} es la habilidad OCULTA de ${especie}.`,
        `Vía documentada: un ${PARCHE} sobre la cría ya terminada. Se consume al usarse.`,
        `Alternativa: capturar un Alpha de la línea, que ya viene con la oculta y dos IVs ` +
        `perfectos — pero para criar Alphas los DOS padres tienen que ser Alpha, así que ` +
        `como arranque de cadena sale carísimo.`,
      ],
      objetos: [PARCHE],
      huecos: [
        'La wiki no documenta si la habilidad oculta se hereda al criar, así que el plan ' +
        'cuenta con el Parche y no con la suerte.',
      ],
    };
  }

  // Habilidad normal. Si es la única que tiene la especie, sale sí o sí.
  if (normales.length === 1) {
    return {
      ok: true, via: 'unica',
      pasos: [`${quiere} es la única habilidad normal de ${especie}: sale siempre.`],
      objetos: [], huecos: [],
    };
  }

  return {
    ok: true,
    via: 'normal',
    alternativas: normales.filter((h) => h !== quiere),
    pasos: [
      `${especie} puede salir con ${normales.join(' o ')}.`,
      `Si la cría sale con la otra, una ${PILDORA} la cambia. Se consume al usarse.`,
    ],
    objetos: [PILDORA],
    huecos: [
      'La wiki no documenta con qué probabilidad se hereda cada habilidad normal al criar, ' +
      'así que no pongo un número: cuenta con la Píldora por si sale la otra.',
    ],
  };
}
