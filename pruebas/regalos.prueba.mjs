// Los IVs que el inventario trae y el objetivo no pide.
//
// Lo que fijan estas pruebas es sobre todo lo que NO se puede hacer: un IV que
// no se pide no se conserva por arte de magia. O los dos padres lo comparten y
// sale gratis, o se juega a una tirada, o se pide — y entonces cuesta.

import { bloque, prueba, igual, cierto, falso, cerca } from './marco.mjs';
import { datos, ivs } from './datos-de-prueba.mjs';
import { planear, contar, comparaPlanes } from '../src/nucleo/planificador.js';
import {
  regalosDelPlan, regalosConPrecio, conservando, dejandoDeConservar, conservadosDe, diferencia,
} from '../src/nucleo/regalos.js';

const TODAS = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova'];
const ej = (id, especie, sexo, iv, extra = {}) =>
  ({ id, especie, sexo, ivs: ivs(iv), naturaleza: null, movimientos: [], ...extra });

const objetivo = (iv, extra = {}) => ({
  especie: 'Garchomp', sexo: '♀', ivs: ivs(iv), naturaleza: null,
  evs: ivs(), movimientos: [], habilidad: null, nivel: 50, conservados: [], ...extra,
});

const plan = (obj, inventario) =>
  planear(obj, datos, { inventario, regionesDisponibles: TODAS });

// El inventario de la captura del usuario: el Gible que pone la especie lleva
// además 31 en Defensa, que el objetivo (Ataque + Velocidad + Alegre) no pide.
const CAJA = [
  ej('a', 'Gible', '♀', { defensa: 31 }),
  ej('b', 'Magikarp', '♂', { ataque: 31 }),
  ej('c', 'Magikarp', '♂', { velocidad: 31 }),
  ej('d', 'Magikarp', '♂', {}),
  ej('e', 'Horsea', '♂', { ataque: 31, velocidad: 31 }),
];
const GARCHOMP = objetivo({ ataque: 31, velocidad: 31 }, { naturaleza: 'Alegre' });

bloque('regalos · encontrarlos', () => {
  const p = plan(GARCHOMP, CAJA);

  prueba('el 31 en Defensa del Gible se detecta aunque no se haya pedido', () => {
    igual(p.regalo, ['defensa']);
    const [r] = regalosDelPlan(p, CAJA);
    igual(r.stat, 'defensa');
    igual(r.mejorEnLaCaja, 31);
    igual(r.quienes.map((q) => q.especie), ['Gible']);
    cierto(r.quienes[0].enElPlan, 'el Gible sí está en el plan');
  });

  prueba('sin él, el plan NO lo entrega: el suelo en Defensa es 0', () => {
    igual(p.ivsFinales.defensa, 0);
    igual(p.regaloEntregado, 0);
  });

  prueba('se dice a qué se juega y dónde, no se promete', () => {
    const [r] = regalosDelPlan(p, CAJA);
    igual(r.estado, 'a-suerte');
    igual(r.tiradas.length, 1);
    cerca(r.tiradas[0].probabilidad, 0.2, 1e-9, 'un objeto en juego: rama alta al 20 %');
    falso(r.tiradas[0].esRaiz, 'se juega en un cruce intermedio, no en el último');
  });

  prueba('un IV que nadie tiene en la caja no sale como regalo', () => {
    cierto(!p.regalo.includes('ps'));
    cierto(!p.regalo.includes('at-esp'));
  });

  prueba('un IV que SÍ se pidió nunca es un regalo', () => {
    falso(p.regalo.includes('ataque'));
    falso(p.regalo.includes('velocidad'));
  });

  prueba('los avisos del plan no se llenan con los regalos', () => {
    // El regalo se mide igual que un 30 pedido, pero no es un problema del plan:
    // si entrara en `avisos` habría un aviso rojo por cada IV suelto de la caja.
    igual(p.suerte, []);
    cierto(p.suerteRegalo.length > 0);
    falso((p.avisos ?? []).some((x) => /Defensa/.test(x)), 'Defensa no debe generar aviso');
  });
});

bloque('regalos · cuando sale gratis', () => {
  // Un cruce y nada más: si los DOS padres traen el 31 de Defensa, se comparte y
  // la cría lo saca garantizado sin gastar ni un objeto.
  //
  // El objetivo pide dos IVs y cada padre trae uno, así que ninguno vale de raíz
  // y el cruce final existe de verdad. Con un objetivo de un solo IV el propio
  // Gible cumpliría la raíz y no habría cruce que mirar.
  const unCruce = objetivo({ ataque: 31, velocidad: 31 });
  const caja = [
    ej('a', 'Gible', '♀', { ataque: 31, defensa: 31 }),
    ej('b', 'Magikarp', '♂', { velocidad: 31, defensa: 31 }),
  ];

  prueba('lo que comparten los dos padres llega solo', () => {
    const p = plan(unCruce, caja);
    igual(contar(p.arbol).cruces, 1);
    igual(p.ivsFinales.defensa, 31);
    const [r] = regalosDelPlan(p, caja);
    igual(r.estado, 'garantizado');
    igual(r.entregado, 31);
  });

  prueba('y entonces no hay nada que decidir: conservarlo no cuesta', () => {
    const p = plan(unCruce, caja);
    const otro = plan(conservando(unCruce, 'defensa'), caja);
    igual(diferencia(p, otro), { cruces: 0, capturas: 0, esfuerzo: 0, dinero: 0, cortos: 0 });
  });
});

bloque('regalos · conservarlo', () => {
  prueba('pedirlo agranda el árbol, y se dice cuánto ANTES de tocarlo', () => {
    const p = plan(GARCHOMP, CAJA);
    const { candidatos } = regalosConPrecio(p, GARCHOMP, datos, {
      inventario: CAJA, regionesDisponibles: TODAS,
    });
    igual(candidatos.length, 1);
    cierto(candidatos[0].precio.cruces > 0, `esperaba más cruces: ${JSON.stringify(candidatos[0].precio)}`);
    cierto(candidatos[0].precio.capturas > 0, 'y más capturas');
    igual(candidatos[0].saldriaA, 31, 'con un 31 de verdad en la caja, pedirlo lo entrega a 31');
  });

  prueba('conservando() lo pide de verdad y el plan lo entrega', () => {
    const conDefensa = conservando(GARCHOMP, 'defensa');
    igual(conDefensa.ivs.defensa, 31);
    igual(conDefensa.conservados, ['defensa']);
    const p = plan(conDefensa, CAJA);
    igual(p.ivsFinales.defensa, 31);
    igual(p.ivsCortos, []);
    // Y deja de ser un regalo: ahora es parte del objetivo.
    igual(p.regalo, []);
  });

  prueba('se puede soltar, y el plan vuelve a lo que era', () => {
    const conDefensa = conservando(GARCHOMP, 'defensa');
    const sinDefensa = dejandoDeConservar(conDefensa, 'defensa');
    igual(sinDefensa.ivs.defensa, 0);
    igual(sinDefensa.conservados, []);
    igual(contar(plan(sinDefensa, CAJA).arbol), contar(plan(GARCHOMP, CAJA).arbol));
  });

  prueba('quitar la casilla en Objetivo también lo suelta', () => {
    // La marca de «conservado» no manda: manda lo que pide el objetivo. Si no
    // fuese así, desmarcar Defensa dejaría una fila fantasma en la tarjeta.
    const raro = { ...conservando(GARCHOMP, 'defensa'), ivs: ivs({ ataque: 31, velocidad: 31 }) };
    igual(conservadosDe(raro), []);
  });

  prueba('un regalo que sólo está a 30 se puede pedir, y se avisa de que saldrá 30', () => {
    const caja = [
      ej('a', 'Gible', '♀', { defensa: 30 }),
      ej('b', 'Magikarp', '♂', { defensa: 30 }),
    ];
    const obj = objetivo({ ataque: 31 });
    const p = plan(obj, caja);
    igual(p.regalo, ['defensa']);
    const { candidatos } = regalosConPrecio(p, obj, datos, { inventario: caja, regionesDisponibles: TODAS });
    igual(candidatos[0].mejorEnLaCaja, 30);
    // «o 30 en su defecto»: se pide a 31 y el plan dice a qué lo deja de verdad.
    // No hay un modo «pídemelo a 30»: el 30 entra como pseudo 31 si es lo mejor
    // que hay, y si capturar un 31 sale a cuenta el plan captura, que es mejor.
    cierto(candidatos[0].saldriaA >= 30, `saldría a ${candidatos[0].saldriaA}`);
    const conDef = plan(conservando(obj, 'defensa'), caja);
    igual(conDef.ivsFinales.defensa, candidatos[0].saldriaA, 'el aviso y el plan dicen lo mismo');
  });
});

bloque('regalos · lo único gratis: compartirlo con la pareja', () => {
  prueba('a igualdad de todo, entra el que comparte el regalo con su hermano', () => {
    // Los dos Magikarp valen exactamente lo mismo para el hueco (1×31 Velocidad,
    // un solo 31 cada uno... no: los dos tienen dos 31, así que empatan también
    // en `perfectos`). El desempate es que uno comparte Defensa con el Gible.
    const obj = objetivo({ ataque: 31, velocidad: 31 });
    const caja = [
      ej('a', 'Gible', '♀', { ataque: 31, defensa: 31 }),
      ej('x', 'Magikarp', '♂', { velocidad: 31, 'at-esp': 31 }),
      ej('y', 'Magikarp', '♂', { velocidad: 31, defensa: 31 }),
    ];
    const p = plan(obj, caja);
    const usados = [];
    (function r(n) { if (n.tipo === 'inventario') usados.push(n.ejemplar.id); n.hijos.forEach(r); })(p.arbol);
    cierto(usados.includes('y'), `esperaba el que comparte Defensa; usó ${usados.join(', ')}`);
    igual(p.ivsFinales.defensa, 31, 'y por eso la Defensa sale garantizada, gratis');
  });

  prueba('pero nunca a costa de quemar un ejemplar mejor', () => {
    // Aquí el que comparte Defensa tiene un 31 MÁS: gastarlo por un regalo sería
    // pagar por algo que se presenta como gratis. Manda `perfectos`.
    const obj = objetivo({ ataque: 31, velocidad: 31 });
    const caja = [
      ej('a', 'Gible', '♀', { ataque: 31, defensa: 31 }),
      ej('x', 'Magikarp', '♂', { velocidad: 31 }),
      ej('y', 'Magikarp', '♂', { velocidad: 31, defensa: 31, 'at-esp': 31 }),
    ];
    const p = plan(obj, caja);
    const usados = [];
    (function r(n) { if (n.tipo === 'inventario') usados.push(n.ejemplar.id); n.hijos.forEach(r); })(p.arbol);
    cierto(usados.includes('x'), `esperaba el más justo; usó ${usados.join(', ')}`);
  });
});

bloque('regalos · y sólo deciden cuando todo lo demás empata', () => {
  prueba('comparaPlanes los mira el último, detrás del coste', () => {
    const mismoArbol = { tipo: 'cruce', hijos: [], stats: [], objetos: { madre: null, padre: null } };
    const caro = { ivsCortos: [], arbol: mismoArbol, sobrantes: [], regaloEntregado: 5 };
    const barato = { ivsCortos: [], arbol: mismoArbol, sobrantes: [], regaloEntregado: 0 };
    // Con el mismo árbol empatan en todo menos en los regalos: gana el que más conserva.
    cierto(comparaPlanes(caro, barato) < 0, 'a igualdad, el que conserva más va primero');
    // Pero un corto pesa más que cualquier regalo.
    cierto(comparaPlanes({ ...caro, ivsCortos: ['ps'] }, barato) > 0, 'un IV corto manda sobre los regalos');
  });
});
