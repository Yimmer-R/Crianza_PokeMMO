// Las seis características: la fórmula y lo que dibuja la barra.
//
// Los números esperados son los que da el juego para Garchomp, que es un
// Pokémon muy medido por la comunidad competitiva: sirven de contraste externo
// a una fórmula que la wiki todavía no ha verificado (`wiki/mecanicas/IVs.md`
// lo deja escrito en «Qué falta aquí»).

import { bloque, prueba, igual, cierto } from './marco.mjs';
import { datos, ivs } from './datos-de-prueba.mjs';
import { STATS } from '../src/nucleo/constantes.js';
import {
  valorDe, bonoEnBase, efectoNaturaleza, estadisticasDe, TOPE_BASE,
} from '../src/nucleo/estadisticas.js';

const GARCHOMP = datos.pokedex.Garchomp.stats;

bloque('estadísticas · la fórmula', () => {
  prueba('Garchomp Alegre 252 Ataque a nivel 50 da 182', () => {
    igual(valorDe('ataque', { base: GARCHOMP.ataque, iv: 31, ev: 252, nivel: 50, efecto: null }), 182);
  });

  prueba('y con naturaleza que sube el Ataque, 200', () => {
    igual(valorDe('ataque', { base: GARCHOMP.ataque, iv: 31, ev: 252, nivel: 50, efecto: 'sube' }), 200);
  });

  prueba('Alegre 252 Velocidad: 169 a nivel 50 y 333 a nivel 100', () => {
    igual(valorDe('velocidad', { base: GARCHOMP.velocidad, iv: 31, ev: 252, nivel: 50, efecto: 'sube' }), 169);
    igual(valorDe('velocidad', { base: GARCHOMP.velocidad, iv: 31, ev: 252, nivel: 100, efecto: 'sube' }), 333);
  });

  prueba('los PS van por otra fórmula: 357 a nivel 100 con 31 y sin EVs', () => {
    igual(valorDe('ps', { base: GARCHOMP.ps, iv: 31, ev: 0, nivel: 100 }), 357);
  });

  prueba('la naturaleza NO toca los PS', () => {
    const conNada = valorDe('ps', { base: GARCHOMP.ps, iv: 31, ev: 0, nivel: 50 });
    igual(valorDe('ps', { base: GARCHOMP.ps, iv: 31, ev: 0, nivel: 50, efecto: 'sube' }), conNada);
    igual(valorDe('ps', { base: GARCHOMP.ps, iv: 31, ev: 0, nivel: 50, efecto: 'baja' }), conNada);
  });

  prueba('un 30 en vez de un 31 no da lo mismo, que es de lo que avisa el plan', () => {
    const con31 = valorDe('velocidad', { base: GARCHOMP.velocidad, iv: 31, ev: 252, nivel: 50, efecto: 'sube' });
    const con30 = valorDe('velocidad', { base: GARCHOMP.velocidad, iv: 30, ev: 252, nivel: 50, efecto: 'sube' });
    cierto(con30 < con31, `${con30} debería ser menor que ${con31}`);
  });
});

bloque('estadísticas · lo que dibuja la barra', () => {
  prueba('31 IVs y 252 EVs valen 47 puntos de característica base', () => {
    igual(bonoEnBase(31, 252), 47);
    igual(bonoEnBase(0, 0), 0);
    igual(bonoEnBase(30, 252), 46.5);
  });

  prueba('y eso es exacto: sumarlo a la base da el mismo número, a cualquier nivel', () => {
    // Es lo que justifica dibujar los dos tramos en la misma barra. Si no fuese
    // exacto, la barra estaría mintiendo sobre lo que aporta cada parte.
    for (const nivel of [50, 100]) {
      igual(
        valorDe('ataque', { base: 100, iv: 31, ev: 252, nivel }),
        valorDe('ataque', { base: 100 + bonoEnBase(31, 252), iv: 0, ev: 0, nivel }),
        `a nivel ${nivel}`,
      );
    }
  });

  prueba('el tope de la barra es el máximo que hay en la pokédex, no un número inventado', () => {
    const maximo = Math.max(...Object.values(datos.pokedex).flatMap((p) => STATS.map((s) => p.stats[s] ?? 0)));
    igual(TOPE_BASE, maximo, 'si la wiki trae una base más alta, hay que subir el tope');
  });
});

bloque('estadísticas · la naturaleza', () => {
  prueba('Alegre sube Velocidad y baja At. Esp.', () => {
    igual(efectoNaturaleza('Alegre', 'velocidad', datos.naturalezas), 'sube');
    igual(efectoNaturaleza('Alegre', 'at-esp', datos.naturalezas), 'baja');
    igual(efectoNaturaleza('Alegre', 'ataque', datos.naturalezas), null);
  });

  prueba('una neutra no toca nada, y sin naturaleza tampoco', () => {
    const neutra = Object.entries(datos.naturalezas).find(([, n]) => n.neutra)?.[0];
    cierto(neutra, 'la wiki trae naturalezas neutras');
    for (const s of STATS) igual(efectoNaturaleza(neutra, s, datos.naturalezas), null);
    for (const s of STATS) igual(efectoNaturaleza(null, s, datos.naturalezas), null);
  });
});

bloque('estadísticas · la tarjeta entera', () => {
  const objetivo = {
    especie: 'Garchomp',
    ivs: ivs({ ataque: 31, velocidad: 31 }),
    evs: ivs({ ataque: 252, velocidad: 252, ps: 6 }),
    naturaleza: 'Alegre',
    nivel: 50,
  };

  prueba('salen las seis, en orden, con su base y su número final', () => {
    const st = estadisticasDe(objetivo, datos);
    igual(st.filas.map((f) => f.stat), STATS);
    igual(st.filas.map((f) => f.base), STATS.map((s) => GARCHOMP[s]));
    igual(st.filas.map((f) => f.valor), [168, 182, 100, 76, 90, 169]);
    igual(st.total, Object.values(GARCHOMP).reduce((a, b) => a + b, 0));
  });

  prueba('«pelado» es el mismo Pokémon sin IVs ni EVs: la diferencia es lo que ganas', () => {
    const st = estadisticasDe(objetivo, datos);
    const atq = st.filas.find((f) => f.stat === 'ataque');
    igual(atq.pelado, 135);
    cierto(atq.valor - atq.pelado === 47, `gana ${atq.valor - atq.pelado}`);
  });

  prueba('los IVs que se le pasan mandan sobre los del objetivo', () => {
    // Es lo que permite enseñar lo que la crianza entrega DE VERDAD: con un
    // pseudo 31, el número final es otro.
    const st = estadisticasDe(objetivo, datos, { ivs: ivs({ ataque: 30, velocidad: 31 }) });
    igual(st.filas.find((f) => f.stat === 'ataque').iv, 30);
    cierto(st.filas.find((f) => f.stat === 'ataque').valor < 182);
  });

  prueba('una especie que no existe no inventa una tarjeta', () => {
    igual(estadisticasDe({ ...objetivo, especie: 'Mewthree' }, datos), null);
    igual(estadisticasDe({ ...objetivo, especie: '' }, datos), null);
  });

  prueba('Shedinja, el único al que la fórmula no le vale, no puede ser objetivo', () => {
    // En los juegos se queda en 1 PS pase lo que pase y la wiki no documenta
    // qué hace PokeMMO. No se corrige a mano porque no hace falta: está en el
    // grupo «No cría», así que nunca es el Pokémon que se cría.
    igual(datos.pokedex.Shedinja.stats.ps, 1);
    igual(datos.pokedex.Shedinja.gruposHuevo, ['No cría']);
  });
});
