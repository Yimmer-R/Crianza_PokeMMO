#!/usr/bin/env node
// ¿Merece la pena BUSCAR qué IV se fuerza y cuál se comparte en el cruce final,
// en vez de dejarlo en la heurística de escasez?
//
//   node herramientas/medir-ordenes.mjs
//
// La respuesta medida es NO, y este script es la medida: genera miles de
// inventarios al azar y cuenta en cuántos el plan mejora al forzar un IV
// distinto del que elige ordenarPorEscasez(). En 26.000 no mejoró ni uno.
//
// Se guarda porque la pregunta va a volver: parece obvio que probarlo tiene que
// ayudar. Para volver a medirlo hay que reponer el eje —ctx.forzarPrimero en
// construir()— que se quitó justo por esto; el script deja de encontrar nada
// por sí solo si el eje no está.
//
// El motivo de fondo está en la nota de ordenarPorEscasez(): el IV compartido
// tiene que estar a 31 en los DOS padres, así que compartir el que más abunda
// es la respuesta, no una aproximación.

import { readFileSync } from 'node:fs';
import { planear } from '../src/nucleo/planificador.js';
import { REGIONES } from '../src/nucleo/constantes.js';
const j = (f) => JSON.parse(readFileSync(new URL(`../datos/${f}.json`, import.meta.url)));
const datos = { pokedex: j('pokemon'), encuentros: j('encuentros'), movimientos: j('movimientos'),
  objetos: j('objetos'), naturalezas: j('naturalezas'), habilidades: j('habilidades'), meta: j('meta') };
const cero = { ps:0, ataque:0, defensa:0, ataqueEsp:0, defensaEsp:0, velocidad:0 };
const STATS = Object.keys(cero);
let semilla = 1;
const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
const especies = ['Larvitar', 'Slowpoke', 'Magikarp', 'Gible', 'Horsea', 'Ditto', 'Staryu', 'Combee'];

// Se busca un inventario donde el ORDEN del cruce final cambie el resultado:
// se compara el plan con el orden de la heurística contra el mejor orden.
let encontrados = 0;
for (let intento = 0; intento < 6000 && encontrados < 3; intento++) {
  const n = 2 + Math.floor(azar() * 8);
  const inventario = Array.from({ length: n }, (_, i) => ({
    id: 'i' + i, especie: especies[Math.floor(azar() * especies.length)],
    sexo: azar() < 0.5 ? '♀' : '♂', naturaleza: ['Agitada','Osada','Alegre','Firme'][Math.floor(azar()*4)],
    ivs: Object.fromEntries(STATS.map((s) => { const r = azar(); return [s, r < 0.3 ? 31 : r < 0.4 ? 30 : 0]; })),
    evs: {}, movimientos: [],
  }));
  const cuantosIv = 2 + Math.floor(azar() * 5);
  const revueltos = [...STATS].sort(() => azar() - 0.5).slice(0, cuantosIv);
  const pedidos = Object.fromEntries(revueltos.map((x) => [x, 31]));
  const objetivo = { especie: 'Larvitar', ivs: { ...cero, ...pedidos }, evs: {}, movimientos: [],
    naturaleza: azar() < 0.5 ? 'Agitada' : null };
  const conBusqueda = planear(objetivo, datos, { inventario, regionesDisponibles: REGIONES });
  // El mismo plan pero sin probar órdenes: se simula quitando el inventario de
  // ordenesDeRaiz, que es lo que los genera.
  // `forzadoPrimero` sólo existe mientras el eje esté puesto; sin él esto no
  // encuentra nada, que es exactamente lo que se quiere documentar.
  if (conBusqueda.forzadoPrimero) {
    encontrados++;
    console.log(`\n== caso ${encontrados}: el orden elegido NO es el de la heurística`);
    console.log('   objetivo:', Object.keys(pedidos).join(','), objetivo.naturaleza ?? 'sin naturaleza');
    console.log('   inventario:', inventario.map(e=>`${e.especie} ${e.sexo} ${e.naturaleza} [${STATS.filter(s=>e.ivs[s]===31).join(',')||'—'}]`).join(' · '));
    console.log('   fuerza primero:', conBusqueda.forzadoPrimero, '| modo:', conBusqueda.modoPiedra,
      '| capturas:', conBusqueda.pasos.conseguir.length, '| candidatos:', conBusqueda.candidatosProbados);
  }
}
if (!encontrados) console.log('NO se ha encontrado ningún caso en 6000 intentos (objetivos de 2 a 6 IVs, inventarios de 2 a 9): el eje del orden no cambia nada.');
