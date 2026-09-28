// Las seis características: de las bases del Pokémon al número que sale en el
// juego, contando IVs, EVs, naturaleza y nivel.
//
// **Esto es una inferencia declarada, no un dato verificado.** La wiki lo dice
// en `wiki/mecanicas/IVs.md`, sección «Qué falta aquí»: falta comprobar «si
// PokeMMO usa la fórmula de característica estándar de Gen 5 o la toca». Es la
// misma inferencia sobre la que ya se apoyan los escalones de EVs de
// `entrenamiento.js`, así que o valen las dos o no vale ninguna — pero se marca
// donde se enseña, que es la regla 2 del repositorio.
//
//   bruto = ⌊(2·base + IV + ⌊EV/4⌋) · nivel/100⌋
//   PS    = bruto + nivel + 10            ← la naturaleza NO toca los PS
//   resto = ⌊(bruto + 5) × naturaleza⌋    ← ×1,1 la que sube, ×0,9 la que baja
//
// Lo del 10 % y lo de que los PS se salvan sí está en la wiki, en las fichas de
// naturaleza: «sube un 10 % una de las que no son PS … y baja otra un 10 %»
// (`wiki/naturalezas/Alegre.md`).
//
// Un caso que la fórmula NO cubre, y que no se corrige a mano: Shedinja, que en
// los juegos se queda en 1 PS pase lo que pase. La wiki no documenta qué hace
// PokeMMO con él, así que aquí no se inventa; y como está en el grupo «No cría»
// no puede ser objetivo de una crianza, así que en la práctica no se le aplica.

import { STATS, NOMBRE_STAT, IV_MAX } from './constantes.js';

/** wiki/naturalezas/*.md: la naturaleza sube un 10 % una característica y baja otra. */
export const MULTIPLICADOR_NATURALEZA = { sube: 1.1, baja: 0.9, ninguno: 1 };

/**
 * El techo de la barra.
 *
 * 255 no es un número elegido: es el máximo que hay en `datos/pokemon.json`
 * —los PS base de Blissey— y también el techo del byte con que los juegos de
 * 3ª a 5ª guardan una característica base. Se usa como escala fija para que
 * dos Pokémon distintos se puedan comparar de un vistazo; si la escala fuese
 * la del propio Pokémon, todos tendrían una barra llena.
 */
export const TOPE_BASE = 255;

/** Qué le hace una naturaleza a una característica: 'sube', 'baja' o null. */
export function efectoNaturaleza(naturaleza, stat, naturalezas = {}) {
  const n = naturalezas[naturaleza];
  if (!n || n.neutra) return null;
  const nombre = NOMBRE_STAT[stat];
  if (n.sube === nombre) return 'sube';
  if (n.baja === nombre) return 'baja';
  return null;
}

/**
 * La característica final, tal cual la enseña el juego.
 *
 * @param {string} stat  cuál de las seis (los PS van por otra fórmula)
 * @param {Object} opciones base, iv, ev, nivel y el efecto de la naturaleza
 */
export function valorDe(stat, { base = 0, iv = 0, ev = 0, nivel = 50, efecto = null } = {}) {
  const bruto = Math.floor((2 * base + iv + Math.floor(ev / 4)) * nivel / 100);
  if (stat === 'ps') return bruto + nivel + 10;
  return Math.floor((bruto + 5) * (MULTIPLICADOR_NATURALEZA[efecto] ?? 1));
}

/**
 * Cuánta característica BASE equivalen los IVs y los EVs.
 *
 * Sale de la propia fórmula y es exacto: el paréntesis es `2·base + IV + ⌊EV/4⌋`,
 * o sea `2·(base + (IV + ⌊EV/4⌋)/2)`. Así que un IV y unos EVs valen justo
 * `(IV + ⌊EV/4⌋)/2` puntos de base — y, esto es lo bonito, **sin depender del
 * nivel**, porque el nivel multiplica al paréntesis entero.
 *
 * Con 31 de IV y 252 EVs son 47 puntos de base, que es lo que dibuja la barra
 * como añadido encima de la base del Pokémon.
 */
export const bonoEnBase = (iv = 0, ev = 0) => (iv + Math.floor(ev / 4)) / 2;

/**
 * Las seis filas listas para pintar.
 *
 * Los IVs que se usan son los que la crianza va a ENTREGAR de verdad
 * (`plan.ivsFinales`), no los que se pidieron: si un hueco se cubre con un
 * pseudo 31, ese IV sale 30 y el número final es otro. Es el mismo criterio que
 * usa la optimización de EVs.
 *
 * @param {Object} objetivo especie, ivs, evs, naturaleza y nivel
 * @param {Object} datos    pokedex y naturalezas
 * @param {Object} opciones `ivs` para pasar los del plan en vez de los pedidos
 */
export function estadisticasDe(objetivo, datos, { ivs = null } = {}) {
  const p = datos.pokedex?.[objetivo?.especie];
  if (!p) return null;

  const nivel = objetivo.nivel ?? 50;
  const usados = ivs ?? objetivo.ivs ?? {};

  const filas = STATS.map((stat) => {
    const base = p.stats?.[stat] ?? 0;
    const iv = usados[stat] ?? 0;
    const ev = objetivo.evs?.[stat] ?? 0;
    const efecto = efectoNaturaleza(objetivo.naturaleza, stat, datos.naturalezas);
    return {
      stat,
      nombre: NOMBRE_STAT[stat],
      base,
      iv,
      ev,
      efecto,
      // El número que se lee en el juego, y el que se leería sin IVs ni EVs:
      // la diferencia es lo que aporta la crianza y el entrenamiento.
      valor: valorDe(stat, { base, iv, ev, nivel, efecto }),
      pelado: valorDe(stat, { base, iv: 0, ev: 0, nivel, efecto }),
      // Para la barra, todo en puntos de característica BASE.
      bono: bonoEnBase(iv, ev),
      perfecto: iv >= IV_MAX,
    };
  });

  return {
    nivel,
    filas,
    total: filas.reduce((a, f) => a + f.base, 0),
    tope: TOPE_BASE,
  };
}
