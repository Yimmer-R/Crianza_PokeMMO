// Criar Alphas y variocolor: las dos reglas que se propagan al árbol entero.
import { bloque, prueba, igual, cerca, cierto, falso } from './marco.mjs';
import { datos, ivs } from './datos-de-prueba.mjs';
import {
  saleComoAlpha, sirveLaVariante, puedenCriarPorVariante, tablaDeHerencia,
  encuentrosPorShiny, variantesPedidas,
} from '../src/nucleo/variantes.js';
import { planear, cumple, elegirRelleno, ROL } from '../src/nucleo/planificador.js';
import { planDeCapturas, intentosEsperados, probabilidadEnAlpha } from '../src/nucleo/capturas.js';
import { distribucionDe } from '../src/nucleo/herencia.js';
import { REGIONES, STATS, SEXOS, IV_MAX } from '../src/nucleo/constantes.js';
import { ejemplarNuevo } from '../src/nucleo/inventario.js';

const TODAS = REGIONES;
const objetivo = (parcial) => ({
  especie: 'Larvitar', ivs: ivs({ ps: 31, ataque: 31, velocidad: 31 }),
  evs: {}, movimientos: [], naturaleza: null, ...parcial,
});
const plan = (o) => planear(o, datos, { regionesDisponibles: TODAS });

bloque('Alpha: qué líneas salen y cómo se capturan', () => {
  prueba('la lista de enjambres son las 112 de la wiki', () => {
    igual(datos.alphas.enjambres.length, 112);
  });

  prueba('la línea manda, no la forma final', () => {
    // La lista nombra «Garchomp», pero del huevo sale Gible: los dos valen.
    igual(saleComoAlpha('Garchomp', datos).via, 'enjambre');
    igual(saleComoAlpha('Gible', datos).via, 'enjambre');
    igual(saleComoAlpha('Gabite', datos).via, 'enjambre');
  });

  prueba('temporada y tiempo limitado no son lo mismo que enjambre', () => {
    const gengar = saleComoAlpha('Gengar', datos);
    igual(gengar.via, 'temporada');
    igual(gengar.evento, 'Halloween');
    cierto(gengar.sale);
    const venusaur = saleComoAlpha('Venusaur', datos);
    igual(venusaur.via, 'limitado');
    falso(venusaur.sale, 'se repartió una vez y no vuelve: no es una vía');
  });

  prueba('una línea que no sale como Alpha hace imposible el objetivo', () => {
    const p = plan(objetivo({ especie: 'Magikarp', alpha: true }));
    // Gyarados sí está, pero en el evento de Año Nuevo Lunar, no en enjambres.
    igual(saleComoAlpha('Magikarp', datos).via, 'temporada');
    cierto(p.ok, 'un evento de temporada sigue siendo una vía');
    const imposible = plan(objetivo({ especie: 'Venusaur', alpha: true }));
    falso(imposible.ok);
    cierto(imposible.problemas.some((x) => /una sola vez/.test(x)), imposible.problemas.join(' | '));
  });

  prueba('el relleno de una cadena Alpha también tiene que salir como Alpha', () => {
    const conAlpha = elegirRelleno('Larvitar', datos, TODAS, undefined, { soloAlpha: true });
    cierto(conAlpha.length, 'tiene que quedar alguna especie');
    for (const c of conAlpha) cierto(saleComoAlpha(c.especie, datos).sale, `${c.especie} no sale como Alpha`);
    // Y la primera es de enjambre diario, no de un evento de una vez al año.
    igual(saleComoAlpha(conAlpha[0].especie, datos).via, 'enjambre');
  });

  prueba('los dos IVs regalados bajan los encuentros, y la cuenta es exacta', () => {
    // Con 1 pedido: o cae en uno de los dos huecos perfectos (5 de 15 parejas
    // lo tocan) o se juega a 1/32.
    cerca(probabilidadEnAlpha(1), (5 / 15) + (10 / 15) * (1 / 32), 1e-12);
    cerca(probabilidadEnAlpha(0), 1, 1e-12);
    // Un 3×31 pasa de 32.768 encuentros a unos 150.
    igual(intentosEsperados({ ivs31: 3 }), 32768);
    const conAlpha = intentosEsperados({ ivs31: 3, alpha: true });
    cierto(conAlpha > 100 && conAlpha < 200, `${conAlpha}`);
  });

  prueba('las capturas de un plan Alpha vienen marcadas y con su vía', () => {
    const p = plan(objetivo({ especie: 'Gible', alpha: true }));
    cierto(p.ok);
    const caps = planDeCapturas(p, datos, TODAS, p.objetivo);
    cierto(caps.length);
    for (const c of caps) {
      cierto(c.conAlpha);
      cierto(c.recomendada, 'un hueco Alpha tiene que tener recomendación');
      cierto(c.recomendada.comoSaleDeAlpha.sale, `${c.recomendada.especie} no sale como Alpha`);
    }
  });
});

bloque('variocolor: la regla que se propaga al árbol entero', () => {
  prueba('un variocolor no cría con uno que no lo es', () => {
    falso(puedenCriarPorVariante({ shiny: true }, { shiny: false }).ok);
    cierto(puedenCriarPorVariante({ shiny: true }, { shiny: true }).ok);
    cierto(puedenCriarPorVariante({ shiny: true }, { shiny: true }).criaShiny);
  });

  prueba('un Alpha con un normal sí cría, pero la cría sale normal', () => {
    const r = puedenCriarPorVariante({ alpha: true }, { alpha: false });
    cierto(r.ok);
    falso(r.criaAlpha);
  });

  prueba('el inventario tiene que traer la variante que se pide', () => {
    const nodo = { rol: ROL.LIBRE, stats: [], hijos: [] };
    const normal = ejemplarNuevo({ especie: 'Larvitar', sexo: SEXOS.MACHO, ivs: ivs({}) });
    const brillante = { ...normal, shiny: true };
    falso(cumple(normal, nodo, datos, objetivo({ shiny: true })).ok, 'un normal no vale en un árbol shiny');
    cierto(cumple(brillante, nodo, datos, objetivo({ shiny: true })).ok);
    // Y al revés: meter un variocolor en una cadena normal es el error caro.
    falso(cumple(brillante, nodo, datos, objetivo({})).ok);
  });

  prueba('todas las capturas de un plan variocolor lo son, y cuestan lo suyo', () => {
    const p = plan(objetivo({ shiny: true }));
    cierto(p.ok);
    const caps = planDeCapturas(p, datos, TODAS, p.objetivo);
    cierto(caps.length);
    for (const c of caps) {
      cierto(c.conShiny);
      igual(c.recomendada.porShiny, encuentrosPorShiny());
      igual(c.recomendada.intentosReales, c.recomendada.intentos * encuentrosPorShiny());
    }
  });

  prueba('criar shiny × shiny reparte los IVs con otra tabla, y a mejor', () => {
    const t0 = tablaDeHerencia(0, { shiny: true });
    cerca(t0.alto + t0.promedio + t0.bajo, 1, 1e-12);
    cerca(t0.alto, 0.5, 1e-12, 'sin objetos, la mitad de las veces coge el mejor de los dos');
    cierto(t0.derivada, 'la wiki la publica contando IVs, no en probabilidad por IV');
    cerca(tablaDeHerencia(2, { shiny: true }).bajo, 0, 1e-12);
    // La normal no cambia.
    cerca(tablaDeHerencia(0).alto, 0.25, 1e-12);
  });

  prueba('un 30 contra un 31 sale 31 más veces criando shiny', () => {
    const a = ivs({ velocidad: 30 });
    const b = ivs({ velocidad: 31 });
    const p = (o) => distribucionDe('velocidad', a, b, null, null, o)
      .filter((d) => d.valor >= IV_MAX).reduce((s, d) => s + d.probabilidad, 0);
    cerca(p({}), 0.25, 1e-12);
    cerca(p({ shiny: true }), 0.5, 1e-12);
  });

  prueba('la regla de los dos 31 compartidos no cambia con la tabla shiny', () => {
    const treintayuno = ivs(Object.fromEntries(STATS.map((s) => [s, 31])));
    for (const shiny of [false, true]) {
      const d = distribucionDe('ps', treintayuno, treintayuno, null, null, { shiny });
      igual(d.length, 1);
      igual(d[0].valor, 31);
    }
  });
});

bloque('variantes: lo básico', () => {
  prueba('variantesPedidas dice lo que pide el objetivo', () => {
    igual(variantesPedidas(objetivo({})), []);
    igual(variantesPedidas(objetivo({ shiny: true, alpha: true })), ['shiny', 'alpha']);
  });

  prueba('se usa el mejor ritmo permanente, que es el suelo honesto', () => {
    igual(encuentrosPorShiny(), 24000);
    igual(encuentrosPorShiny({ donador: false, amuleto: false }), 30000);
  });

  prueba('sirveLaVariante dice qué falta y qué sobra', () => {
    igual(sirveLaVariante({ shiny: false }, { shiny: true }).falta, 'shiny');
    igual(sirveLaVariante({ shiny: true }, {}).sobra, 'shiny');
    cierto(sirveLaVariante({ shiny: true, alpha: true }, { shiny: true, alpha: true }).ok);
  });
});
