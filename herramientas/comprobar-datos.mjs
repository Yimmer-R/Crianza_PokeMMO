#!/usr/bin/env node
// Comprueba que datos/*.json siguen siendo coherentes, sin necesitar la wiki.
//
//   node herramientas/comprobar-datos.mjs
//
// Corre en el flujo de publicación: si alguien toca un JSON a mano o la
// extracción se rompe, el despliegue falla antes de publicar datos malos.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (n) => JSON.parse(readFileSync(join(RAIZ, 'datos', n), 'utf8'));

const problemas = [];
const mal = (m) => problemas.push(m);

const ARCHIVOS = [
  'pokemon.json', 'encuentros.json', 'naturalezas.json', 'movimientos.json',
  'habilidades.json', 'movimientos-huevo.json', 'objetos.json',
  'donde-entrenar.json', 'meta.json',
];
for (const a of ARCHIVOS) if (!existsSync(join(RAIZ, 'datos', a))) mal(`falta datos/${a}`);
if (problemas.length) { console.error(problemas.join('\n')); process.exit(1); }

const pokedex = leer('pokemon.json');
const naturalezas = leer('naturalezas.json');
const movimientos = leer('movimientos.json');
const habilidades = leer('habilidades.json');
const movHuevo = leer('movimientos-huevo.json');
const encuentros = leer('encuentros.json');
const dondeEntrenar = leer('donde-entrenar.json');
const meta = leer('meta.json');

// Recuentos: si uno se desploma, la extracción ha dejado de encontrar una sección.
const MINIMOS = {
  pokemon: 600, naturalezas: 25, movimientos: 500,
  habilidades: 150, movimientosHuevo: 150, conEncuentros: 500,
};
const reales = {
  pokemon: Object.keys(pokedex).length,
  naturalezas: Object.keys(naturalezas).length,
  movimientos: Object.keys(movimientos).length,
  habilidades: Object.keys(habilidades).length,
  movimientosHuevo: Object.keys(movHuevo.deHuevo ?? {}).length,
  conEncuentros: Object.keys(encuentros).length,
};
for (const [clave, minimo] of Object.entries(MINIMOS))
  if (reales[clave] < minimo) mal(`${clave}: ${reales[clave]}, esperaba al menos ${minimo}`);

// Integridad interna: cada Pokémon tiene lo que la app da por seguro.
const STATS = ['ps', 'ataque', 'defensa', 'at-esp', 'def-esp', 'velocidad'];
let sinGrupos = 0;
for (const [nombre, p] of Object.entries(pokedex)) {
  if (!Array.isArray(p.gruposHuevo)) mal(`${nombre}: gruposHuevo no es lista`);
  else if (!p.gruposHuevo.length) sinGrupos++;
  if (!p.genero || typeof p.genero.macho !== 'number') mal(`${nombre}: ratio de género mal`);
  for (const s of STATS) if (typeof p.stats?.[s] !== 'number') mal(`${nombre}: falta stat ${s}`);
  if (!p.base || !pokedex[p.base]) mal(`${nombre}: forma base "${p.base}" no existe`);
  if (!p.movimientos?.nivel?.length) mal(`${nombre}: sin movimientos por nivel`);
}
if (sinGrupos > 5) mal(`${sinGrupos} Pokémon sin grupo huevo: sospechoso`);

// Las naturalezas tienen que decir qué suben y qué bajan (salvo las neutras).
for (const [nombre, n] of Object.entries(naturalezas))
  if (!n.neutra && (!n.sube || !n.baja)) mal(`naturaleza ${nombre}: sin sube/baja`);

// Las hordas de EVs, agrupadas por característica.
for (const s of STATS)
  if (!(dondeEntrenar[s] ?? []).length) mal(`donde-entrenar: sin hordas de ${s}`);

// Los objetos de crianza que el planificador da por existentes.
const objetos = leer('objetos.json');
for (const o of ['Pesa Recia', 'Brazal Recio', 'Cinto Recio', 'Lente Recia', 'Banda Recia', 'Franja Recia', 'Piedraeterna'])
  if (!objetos.crianza?.[o]) mal(`objetos: falta ${o}`);

// El alias del cliente que el importador necesita para traducir "Desenrollar".
if (!movimientos.Rodar) mal('movimientos: falta Rodar, al que el juego llama Desenrollar');

console.log(`datos/ generados el ${meta.generado}`);
console.log(JSON.stringify(reales));
if (problemas.length) {
  console.error(`\n${problemas.length} problema(s):`);
  for (const p of problemas.slice(0, 40)) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('Todo coherente.');
