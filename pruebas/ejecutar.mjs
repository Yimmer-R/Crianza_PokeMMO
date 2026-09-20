#!/usr/bin/env node
// Corre todas las pruebas: node pruebas/ejecutar.mjs

import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { estado } from './marco.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));

for (const f of readdirSync(AQUI).filter((f) => f.endsWith('.prueba.mjs')).sort()) {
  await import(join(AQUI, f));
}

console.log(`\n${estado.pasadas} pasadas, ${estado.fallos.length} fallidas`);
for (const f of estado.fallos) {
  console.log(`\n✗ ${f.nombre}`);
  console.log(`  ${f.error.message}`);
}
process.exit(estado.fallos.length ? 1 : 0);
