#!/usr/bin/env node
// Genera los iconos de la app: icono.svg, icono-192.png e icono-512.png.
//
//   node herramientas/generar-iconos.mjs
//
// El PNG se escribe a mano con zlib, que ya viene en Node, en vez de tirar de una
// librería de imagen. Son cuatro círculos de color plano: no merece una
// dependencia, y así el icono se puede regenerar dentro de diez años.

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'iconos');
mkdirSync(DESTINO, { recursive: true });

// Los mismos colores que --fondo y --acento de src/css/estilos.css.
const FONDO = [16, 19, 26];
const ACENTO = [110, 168, 254];
const BLANCO = [255, 255, 255];

// ------------------------------------------------------------- codificar PNG

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function trozo(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

/** @param {Uint8Array} pixeles RGBA, ancho*alto*4 */
function png(ancho, alto, pixeles) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;   // bits por canal
  ihdr[9] = 6;   // RGBA
  // 10, 11, 12 = compresión, filtro e interlazado, todos en 0

  // Cada línea lleva delante su byte de filtro; 0 = sin filtro.
  const conFiltro = Buffer.alloc(alto * (ancho * 4 + 1));
  for (let y = 0; y < alto; y++) {
    conFiltro[y * (ancho * 4 + 1)] = 0;
    Buffer.from(pixeles.buffer, y * ancho * 4, ancho * 4)
      .copy(conFiltro, y * (ancho * 4 + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr),
    trozo('IDAT', deflateSync(conFiltro, { level: 9 })),
    trozo('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- dibujar

/** Una Poké Ball plana, con antialias por supermuestreo de 3×3. */
function dibujar(lado) {
  const px = new Uint8Array(lado * lado * 4);
  const c = lado / 2;
  const rExterior = lado * 0.47;
  const rInterior = lado * 0.16;
  const rPunto = lado * 0.075;
  const grosorBanda = lado * 0.055;
  const M = 3; // muestras por eje

  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < M; sy++) {
        for (let sx = 0; sx < M; sx++) {
          const fx = x + (sx + 0.5) / M - c;
          const fy = y + (sy + 0.5) / M - c;
          const d = Math.hypot(fx, fy);

          let color = null;
          if (d <= rExterior) {
            if (d <= rPunto) color = BLANCO;
            else if (d <= rInterior) color = FONDO;
            else if (Math.abs(fy) <= grosorBanda / 2) color = FONDO;
            else color = fy < 0 ? ACENTO : FONDO;
          }

          if (color) { r += color[0]; g += color[1]; b += color[2]; a += 255; }
        }
      }
      const n = M * M;
      const i = (y * lado + x) * 4;
      // Se premultiplica por la cobertura para que el borde no salga con halo.
      const cobertura = a / (255 * n);
      px[i] = cobertura ? Math.round(r / (a / 255)) : 0;
      px[i + 1] = cobertura ? Math.round(g / (a / 255)) : 0;
      px[i + 2] = cobertura ? Math.round(b / (a / 255)) : 0;
      px[i + 3] = Math.round(cobertura * 255);
    }
  }
  return px;
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <circle cx="16" cy="16" r="15" fill="rgb(${ACENTO})"/>
  <path d="M1 16h30v0" stroke="rgb(${FONDO})" stroke-width="0"/>
  <path d="M1 16a15 15 0 0 0 30 0z" fill="rgb(${FONDO})"/>
  <rect x="1" y="14.5" width="30" height="3" fill="rgb(${FONDO})"/>
  <circle cx="16" cy="16" r="5" fill="rgb(${FONDO})"/>
  <circle cx="16" cy="16" r="2.4" fill="#fff"/>
</svg>
`;

writeFileSync(join(DESTINO, 'icono.svg'), SVG);
console.log('  iconos/icono.svg');
for (const lado of [192, 512]) {
  const archivo = join(DESTINO, `icono-${lado}.png`);
  writeFileSync(archivo, png(lado, lado, dibujar(lado)));
  console.log(`  iconos/icono-${lado}.png`);
}
