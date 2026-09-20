// Carga los JSON reales de datos/ para que las pruebas corran contra los datos
// de verdad y no contra un doble inventado. Si la extracción rompe algo, las
// pruebas lo ven.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (n) => JSON.parse(readFileSync(join(RAIZ, 'datos', n), 'utf8'));

export const datos = {
  pokedex: leer('pokemon.json'),
  encuentros: leer('encuentros.json'),
  naturalezas: leer('naturalezas.json'),
  objetos: leer('objetos.json'),
  movimientosHuevo: leer('movimientos-huevo.json'),
  habilidades: leer('habilidades.json'),
  dondeEntrenar: leer('donde-entrenar.json'),
  meta: leer('meta.json'),
};

export const ivs = (o = {}) => ({ ps: 0, ataque: 0, defensa: 0, 'at-esp': 0, 'def-esp': 0, velocidad: 0, ...o });
