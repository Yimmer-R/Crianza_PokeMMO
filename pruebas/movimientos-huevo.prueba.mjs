// Los movimientos huevo, de punta a punta: del objetivo a la captura.
//
// El caso que lo abrió: un Milotic con Neblina. El plan salía con cuatro
// capturas y NINGUNA pedía el movimiento — se hacían los siete pasos y la cría
// nacía sin él. Tres fallos encadenados, y aquí está uno por bloque.

import { bloque, prueba, igual, cierto, falso } from './marco.mjs';
import { datos, ivs } from './datos-de-prueba.mjs';
import { planear, contar, movimientosSoloDeHuevo } from '../src/nucleo/planificador.js';
import { mejorVia, planearMovimientos } from '../src/nucleo/movimientos.js';
import { padresQuePasan, padresQuePasanTodos } from '../src/nucleo/compatibilidad.js';
import { planDeCapturas } from '../src/nucleo/capturas.js';

const TODAS = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova'];
const objetivo = (o) => ({
  especie: 'Milotic', sexo: null, ivs: ivs(), naturaleza: null, evs: ivs(),
  movimientos: [], habilidad: null, nivel: 50, conservados: [], ...o,
});
const plan = (o, inventario = []) => planear(o, datos, { inventario, regionesDisponibles: TODAS });
const conMovimiento = (p) => p.pasos.conseguir.filter((c) => (c.movimientos ?? []).length);

bloque('movimientos huevo · la vía se busca en la LÍNEA', () => {
  prueba('Neblina es de Feebas, y un Milotic la hereda igual', () => {
    // Mirando sólo la forma final salía «Milotic no aprende Neblina», que es la
    // trampa que ya estaba documentada para la guía de aprendizaje.
    const via = mejorVia('Milotic', 'Neblina', datos.pokedex);
    cierto(via, 'Milotic tiene que tener una vía: la de Feebas');
    igual(via.via, 'huevo');
    igual(via.especie, 'Feebas');
    igual(movimientosSoloDeHuevo(objetivo({ movimientos: ['Neblina'] }), datos.pokedex), ['Neblina']);
  });

  prueba('y el plan de movimientos dice qué padre lo pasa, no que sea imposible', () => {
    const r = planearMovimientos(objetivo({ movimientos: ['Neblina'] }), datos, TODAS);
    const e = r.entradas[0];
    falso(e.imposible, `lo daba por imposible: ${e.nota}`);
    igual(e.via, 'huevo');
    cierto(e.padres.length > 0, 'tiene que proponer padres');
    cierto(/padre del último cruce/.test(e.texto), e.texto);
  });
});

bloque('movimientos huevo · el plan lo pide de verdad', () => {
  const OBJ = objetivo({ ivs: ivs({ ps: 31, defensa: 31 }), naturaleza: 'Osada', movimientos: ['Neblina'] });

  prueba('la marca baja hasta una HOJA, que es donde el movimiento puede entrar', () => {
    const p = plan(OBJ);
    const pide = conMovimiento(p);
    igual(pide.length, 1, 'un solo hueco tiene que pasarlo');
    igual(pide[0].movimientos, ['Neblina']);
    // Y ningún cruce se queda con la marca: la pasa el padre, no el cruce.
    const cruces = [];
    (function r(n) { if (n.tipo === 'cruce' && (n.movimientosNecesarios ?? []).length) cruces.push(n.id); n.hijos.forEach(r); })(p.arbol);
    igual(cruces, []);
  });

  prueba('ese hueco es ♂: el movimiento huevo lo pasa el padre', () => {
    igual(conMovimiento(plan(OBJ))[0].sexo, '♂');
  });

  prueba('y deja de ser de especie libre: no vale cualquiera del grupo huevo', () => {
    const hueco = conMovimiento(plan(OBJ))[0];
    falso(hueco.especieLibre, 'un hueco que tiene que pasar un movimiento no es libre');
    cierto((hueco.especiesValidas ?? []).length > 1);
    // Todas las que propone tienen que poder saberlo de verdad.
    const pueden = new Set(padresQuePasan('Neblina', 'Milotic', datos, TODAS).map((c) => c.especie));
    for (const e of hueco.especiesValidas) cierto(pueden.has(e), `${e} no puede pasar Neblina`);
  });

  prueba('la sugerida no es un Magikarp, que no puede tenerlo', () => {
    const hueco = conMovimiento(plan(OBJ))[0];
    cierto(hueco.especieSugerida !== 'Magikarp', 'proponía Magikarp «con Neblina»');
    const como = hueco.padresDelMovimiento.find((c) => c.especie === hueco.especieSugerida);
    cierto(como, 'la sugerida tiene que venir con su vía');
    cierto(como.comoLoSabe.via !== 'huevo', 'se prefiere el que no obliga a criar otra cadena');
  });
});

bloque('movimientos huevo · obligan a criar aunque no se pida ni un 31', () => {
  prueba('1×31 + movimiento huevo ya no es una sola captura', () => {
    // Antes salía «captura un Feebas con 31 en PS» y la cría nacía sin Neblina.
    const p = plan(objetivo({ ivs: ivs({ ps: 31 }), movimientos: ['Neblina'] }));
    igual(contar(p.arbol).cruces, 1, 'un movimiento huevo sólo entra por un huevo');
    igual(conMovimiento(p).length, 1);
  });

  prueba('y sin ningún IV pedido, igual', () => {
    const p = plan(objetivo({ movimientos: ['Neblina'] }));
    igual(contar(p.arbol).cruces, 1);
    igual(conMovimiento(p)[0].movimientos, ['Neblina']);
  });

  prueba('sin movimientos huevo, un 1×31 se sigue capturando de una pieza', () => {
    const p = plan(objetivo({ ivs: ivs({ ps: 31 }) }));
    igual(contar(p.arbol).cruces, 0, 'no se cría lo que se captura');
  });
});

bloque('movimientos huevo · dos a la vez caben en un solo padre', () => {
  const dos = (datos.pokedex.Feebas.movimientos.huevo ?? []).slice(0, 2);

  prueba('un huevo tiene UN padre: se busca quien sepa los dos', () => {
    cierto(dos.length === 2, 'hacen falta dos movimientos huevo para la prueba');
    const p = plan(objetivo({ ivs: ivs({ ps: 31 }), movimientos: dos }));
    const pide = conMovimiento(p);
    igual(pide.length, 1, 'no se reparten entre dos padres');
    igual(pide[0].movimientos, dos);
  });

  prueba('padresQuePasanTodos es la intersección, no la unión', () => {
    const todos = padresQuePasanTodos(dos, 'Milotic', datos, TODAS);
    const porSeparado = dos.map((m) => new Set(padresQuePasan(m, 'Milotic', datos, TODAS).map((c) => c.especie)));
    for (const c of todos) for (const s of porSeparado) cierto(s.has(c.especie), `${c.especie} no sabe los dos`);
    cierto(todos.length <= Math.min(...porSeparado.map((s) => s.size)));
  });
});

bloque('movimientos huevo · las capturas lo dicen y dicen cómo', () => {
  const OBJ = objetivo({ ivs: ivs({ ps: 31, defensa: 31 }), naturaleza: 'Osada', movimientos: ['Neblina'] });

  prueba('el hueco del movimiento no se agrupa con uno que no lo pide', () => {
    const p = plan(OBJ);
    const capturas = planDeCapturas(p, datos, TODAS, OBJ);
    const conMov = capturas.filter((c) => (c.requisito.movimientos ?? []).length);
    igual(conMov.length, 1);
    // Hay otro hueco de «31 en Defensa ♂» sin movimiento: no pueden caer juntos.
    cierto(capturas.length > conMov.length);
  });

  prueba('y la captura recomendada dice CÓMO sabe el movimiento', () => {
    const c = planDeCapturas(plan(OBJ), datos, TODAS, OBJ)
      .find((x) => (x.requisito.movimientos ?? []).length);
    igual(c.recomendada.movimientos, ['Neblina']);
    cierto(c.recomendada.comoLoSabe, 'sin esto la vista no puede decir cómo conseguirlo');
    cierto(['nivel', 'mt', 'tutor', 'huevo', 'especial'].includes(c.recomendada.comoLoSabe.via));
  });

  prueba('entre dos que valen, primero el que no obliga a criar otra cadena', () => {
    const c = planDeCapturas(plan(OBJ), datos, TODAS, OBJ)
      .find((x) => (x.requisito.movimientos ?? []).length);
    const vias = c.viables.map((v) => v.comoLoSabe?.via);
    const primerHuevo = vias.indexOf('huevo');
    if (primerHuevo > -1)
      cierto(vias.slice(primerHuevo).every((v) => v === 'huevo'), `mal ordenado: ${vias.join(', ')}`);
  });
});
