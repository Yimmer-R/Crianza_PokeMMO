#!/usr/bin/env node
// Servidor estático mínimo, sin dependencias, para abrir la app en local.
//
// Hace falta porque los navegadores bloquean fetch() sobre file:// por la política
// de mismo origen: con doble clic en index.html los JSON de datos/ no se pueden
// leer. Un servidor local lo arregla.
//
//   node herramientas/servir.mjs [puerto]

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = Number(process.argv[2] ?? process.env.PUERTO ?? 8000);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

createServer(async (peticion, respuesta) => {
  try {
    const url = new URL(peticion.url, `http://localhost:${PUERTO}`);
    let ruta = decodeURIComponent(url.pathname);
    if (ruta.endsWith('/')) ruta += 'index.html';

    // normalize() + comprobación explícita: sin esto, "../.." saldría del proyecto.
    const destino = join(RAIZ, normalize(ruta));
    if (!destino.startsWith(RAIZ)) {
      respuesta.writeHead(403).end('Fuera del proyecto');
      return;
    }

    const info = await stat(destino).catch(() => null);
    if (!info?.isFile()) {
      respuesta.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end(`No existe: ${ruta}`);
      return;
    }

    respuesta.writeHead(200, {
      'content-type': TIPOS[extname(destino)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    respuesta.end(await readFile(destino));
  } catch (e) {
    respuesta.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(String(e?.message ?? e));
  }
}).listen(PUERTO, () => {
  console.log(`Crianza PokeMMO en http://localhost:${PUERTO}`);
  console.log('Ctrl+C para parar.');
});
