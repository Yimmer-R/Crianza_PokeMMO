// Playwright no es dependencia del proyecto: se busca donde esté instalado.
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');

const BASE = process.env.BASE ?? 'http://localhost:8099';
const navegador = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
const pagina = await navegador.newPage();

const errores = [];
// Hay una prueba que corta la descarga de Tesseract a propósito; el error de red
// que eso provoca no es un fallo de la app, así que se silencia sólo ahí.
let esperandoFalloDeRed = false;
pagina.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
pagina.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (esperandoFalloDeRed && /ERR_(FAILED|ABORTED|BLOCKED)/.test(m.text())) return;
  errores.push(`console: ${m.text()}`);
});

const paso = async (nombre, fn) => {
  try { await fn(); console.log(`  ok  ${nombre}`); }
  catch (e) { console.log(`  FALLA  ${nombre}: ${e.message}`); errores.push(`${nombre}: ${e.message}`); }
};

await pagina.goto(BASE, { waitUntil: 'networkidle' });

await paso('la app carga y desaparece el "Cargando"', async () => {
  await pagina.waitForSelector('#especie', { timeout: 10000 });
});

await paso('el pie muestra los recuentos extraídos', async () => {
  const t = await pagina.textContent('#pie-meta');
  if (!t?.includes('667')) throw new Error(`pie: "${t}"`);
});

await paso('escribir la especie muestra su grupo huevo', async () => {
  await pagina.fill('#especie', 'Larvitar');
  await pagina.dispatchEvent('#especie', 'change');
  await pagina.waitForSelector('text=Grupo huevo: Monstruo', { timeout: 5000 });
});

await paso('marcar 4 IVs y una naturaleza', async () => {
  for (const s of ['ps', 'ataque', 'defensa', 'velocidad']) await pagina.check(`#iv-${s}`);
  await pagina.fill('#naturaleza', 'Audaz');
  await pagina.dispatchEvent('#naturaleza', 'change');
  await pagina.waitForSelector('text=+10 % Ataque', { timeout: 5000 });
});

await paso('la pestaña Plan pinta pasos, árbol y presupuesto', async () => {
  await pagina.click('button[data-vista="plan"]');
  await pagina.waitForSelector('.pasos li', { timeout: 5000 });
  const pasos = await pagina.locator('.pasos li').count();
  if (pasos < 10) throw new Error(`sólo ${pasos} pasos`);
  const total = await pagina.textContent('.total');
  if (!/PokéYen/.test(total)) throw new Error(`presupuesto raro: ${total}`);
  console.log(`       ${pasos} pasos · presupuesto ${total.trim()}`);
});

await paso('el árbol tiene nodos anidados', async () => {
  const n = await pagina.locator('.arbol li').count();
  if (n < 8) throw new Error(`sólo ${n} nodos`);
  console.log(`       ${n} nodos en el árbol`);
});

await paso('Capturas respeta el filtro de regiones', async () => {
  await pagina.click('button[data-vista="objetivo"]');
  for (const r of ['Johto', 'Hoenn', 'Sinnoh', 'Unova']) await pagina.uncheck(`#region-${r}`);
  await pagina.click('button[data-vista="capturas"]');
  await pagina.waitForSelector('.tarjeta', { timeout: 5000 });
  const chips = await pagina.locator('.chip').allTextContents();
  const otras = chips.filter((c) => /^(Johto|Hoenn|Sinnoh|Unova)$/.test(c.trim()));
  if (otras.length) throw new Error(`ha propuesto regiones bloqueadas: ${otras}`);
  const texto = await pagina.textContent('#vista');
  if (!texto.includes('Kanto')) throw new Error('no propone nada en Kanto');
});

await paso('Inventario: anotar una captura que NO encaja lo dice', async () => {
  await pagina.click('button[data-vista="inventario"]');
  await pagina.waitForSelector('#b-especie');
  await pagina.fill('#b-especie', 'Larvitar');
  await pagina.dispatchEvent('#b-especie', 'change');
  await pagina.selectOption('#b-sexo', '♀');
  await pagina.fill('#b-iv-at-esp', '31');
  await pagina.dispatchEvent('#b-iv-at-esp', 'change');
  await pagina.click('text=Sólo comprobar si me sirve');
  await pagina.waitForSelector('text=No para esta cadena', { timeout: 5000 });
  const t = await pagina.textContent('.tarjeta:has-text("¿Me sirve?")');
  console.log(`       ${t.replace(/\s+/g, ' ').slice(0, 150)}`);
});

await paso('Inventario: una captura que SÍ encaja se acepta y recorta el plan', async () => {
  await pagina.click('button[data-vista="plan"]');
  const antes = await pagina.locator('.pasos li').count();

  await pagina.click('button[data-vista="inventario"]');
  await pagina.fill('#b-especie', 'Larvitar');
  await pagina.dispatchEvent('#b-especie', 'change');
  await pagina.selectOption('#b-sexo', '♀');
  for (const s of ['ps', 'ataque', 'defensa']) {
    await pagina.fill(`#b-iv-${s}`, '31');
    await pagina.dispatchEvent(`#b-iv-${s}`, 'change');
  }
  await pagina.click('text=Añadir al inventario');
  await pagina.waitForSelector('.tarjeta:has-text("Tu inventario · 1")', { timeout: 5000 });

  await pagina.click('button[data-vista="plan"]');
  await pagina.waitForSelector('.pasos li');
  const despues = await pagina.locator('.pasos li').count();
  console.log(`       pasos: ${antes} -> ${despues}`);
  if (despues >= antes) throw new Error(`el plan no se ha recortado (${antes} -> ${despues})`);
});

await paso('Entrenamiento calcula hordas', async () => {
  await pagina.click('button[data-vista="objetivo"]');
  await pagina.check('#region-Johto');
  await pagina.fill('#ev-ataque', '252');
  await pagina.dispatchEvent('#ev-ataque', 'change');
  await pagina.fill('#ev-velocidad', '252');
  await pagina.dispatchEvent('#ev-velocidad', 'change');
  await pagina.click('button[data-vista="entrenamiento"]');
  await pagina.waitForSelector('text=hordas', { timeout: 5000 });
  const t = await pagina.textContent('#vista');
  if (!/\d+ hordas/.test(t)) throw new Error('no calcula hordas');
  console.log(`       ${(t.match(/\d+ hordas/g) ?? []).slice(0, 3).join(' · ')}`);
});

await paso('el estado sobrevive a un recargado', async () => {
  await pagina.reload({ waitUntil: 'networkidle' });
  await pagina.waitForSelector('.tarjeta', { timeout: 10000 });
  await pagina.click('button[data-vista="inventario"]');
  await pagina.waitForSelector('.tarjeta:has-text("Tu inventario · 1")', { timeout: 5000 });
});

await paso('móvil: 390px de ancho sin scroll horizontal', async () => {
  await pagina.setViewportSize({ width: 390, height: 780 });
  await pagina.click('button[data-vista="plan"]');
  await pagina.waitForTimeout(300);
  const desborda = await pagina.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (desborda) throw new Error('hay scroll horizontal');
});

await paso('la estrategia de naturaleza es automática y enseña la comparación', async () => {
  await pagina.click('button[data-vista="objetivo"]');
  await pagina.waitForSelector('#estrategia-nat');
  const valor = await pagina.inputValue('#estrategia-nat');
  if (valor !== 'auto') throw new Error(`por defecto debería ser auto, es ${valor}`);

  await pagina.click('button[data-vista="plan"]');
  await pagina.waitForSelector('.tarjeta:has-text("Cómo se lleva la naturaleza")');
  const comp = await pagina.textContent('.tarjeta:has-text("Cómo se lleva la naturaleza")');
  for (const esperado of ['Piedraeterna', 'comparten', 'elegida']) {
    if (!comp.includes(esperado)) throw new Error(`la comparativa no menciona "${esperado}"`);
  }
  console.log(`       ${comp.replace(/\s+/g, ' ').slice(120, 330)}`);
});

await paso('forzar una estrategia cambia el presupuesto y quita la comparativa', async () => {
  await pagina.click('button[data-vista="plan"]');
  const auto = await pagina.textContent('.total');

  await pagina.click('button[data-vista="objetivo"]');
  await pagina.selectOption('#estrategia-nat', 'piedraeterna');
  await pagina.click('button[data-vista="plan"]');
  await pagina.waitForSelector('.pasos li');
  if (await pagina.locator('.tarjeta:has-text("Cómo se lleva la naturaleza")').count())
    throw new Error('con una estrategia forzada no debería haber comparativa');
  const forzada = await pagina.textContent('.total');
  console.log(`       auto ${auto.trim()} · piedraeterna forzada ${forzada.trim()}`);

  await pagina.click('button[data-vista="objetivo"]');
  await pagina.selectOption('#estrategia-nat', 'auto');
});

await paso('el registro manual acepta movimientos y traduce el nombre del juego', async () => {
  await pagina.click('button[data-vista="inventario"]');
  await pagina.waitForSelector('#b-especie');
  await pagina.fill('#b-especie', 'Chimchar');
  await pagina.dispatchEvent('#b-especie', 'change');
  await pagina.waitForSelector('#b-mov-0');
  await pagina.fill('#b-mov-0', 'Desenrollar');
  await pagina.dispatchEvent('#b-mov-0', 'change');
  await pagina.waitForSelector('text=He interpretado "Desenrollar" como Rodar', { timeout: 5000 });
  const puesto = await pagina.inputValue('#b-mov-0');
  if (puesto !== 'Rodar') throw new Error(`el campo debería quedar en Rodar, está en "${puesto}"`);
});

await paso('importar por texto rellena la revisión y guarda tras confirmar', async () => {
  await pagina.click('button[data-vista="inventario"]');
  await pagina.click('text=📋 Texto');
  await pagina.waitForSelector('#texto-importar');
  await pagina.fill('#texto-importar', [
    'Nv. 1 Chimchar ♀',
    'IVs: 19/30/15/23/21/31',
    'Naturaleza: agitada',
    'Habilidad: Mar Llamas',
    'Movimientos: Placaje, Maquinación, Tormento, Desenrollar',
  ].join('\n'));
  await pagina.click('text=Leer el texto');
  await pagina.waitForSelector('text=Revisar antes de guardar', { timeout: 5000 });

  const revision = await pagina.textContent('.tarjeta:has-text("Revisar antes de guardar")');
  for (const esperado of ['Chimchar', 'Agitada', 'Mar Llamas', 'Rodar', '31']) {
    if (!revision.includes(esperado)) throw new Error(`la revisión no muestra "${esperado}"`);
  }
  if (!revision.includes('nombre del juego'))
    throw new Error('debería avisar de que ha traducido Desenrollar');

  const antes = await contarInventario();
  await pagina.click('text=Guardar 1 en el inventario');
  await pagina.waitForTimeout(400);
  const despues = await contarInventario();
  if (despues !== antes + 1) throw new Error(`inventario ${antes} -> ${despues}`);

  const fila = await pagina.textContent('.tarjeta:has-text("Tu inventario")');
  if (!fila.includes('Rodar')) throw new Error('el movimiento no se ha guardado');
  console.log(`       inventario ${antes} -> ${despues}, con los movimientos`);
});

await paso('un texto que no se entiende se avisa y no se guarda nada', async () => {
  await pagina.click('text=📋 Texto');
  await pagina.fill('#texto-importar', 'Pikachurin ♂\nIVs: 31/0/0/0/0/0');
  await pagina.click('text=Leer el texto');
  await pagina.waitForSelector('text=Cosas que no he entendido', { timeout: 5000 });
  await pagina.click('text=Descartar');
  await pagina.waitForTimeout(200);
});

// El preprocesado de la imagen es código propio y no necesita red: se prueba
// siempre. Lo único que queda fuera es Tesseract, que es de terceros.
await paso('prepararImagen escala la captura e invierte el fondo oscuro', async () => {
  const r = await pagina.evaluate(async () => {
    const { prepararImagen } = await import('/src/ui/ocr.js');
    const blob = await fetch('/pruebas/fixtures/ficha-chimchar.png').then((x) => x.blob());
    const lienzo = await prepararImagen(blob);
    const ctx = lienzo.getContext('2d');
    // Media de luminosidad después del tratamiento: si ha invertido bien, el
    // fondo (que era oscuro) ahora es claro y la media sube.
    const d = ctx.getImageData(0, 0, lienzo.width, lienzo.height).data;
    let suma = 0;
    for (let i = 0; i < d.length; i += 4) suma += d[i];
    return {
      ancho: lienzo.width,
      alto: lienzo.height,
      invertida: lienzo.dataset.invertida,
      media: suma / (d.length / 4),
    };
  });
  if (r.invertida !== 'true') throw new Error('debería haber detectado fondo oscuro e invertido');
  if (r.ancho < 600) throw new Error(`no ha escalado: ${r.ancho}px`);
  if (r.media < 128) throw new Error(`sigue oscura después de invertir (media ${r.media.toFixed(0)})`);
  console.log(`       ${r.ancho}×${r.alto}, invertida, luminosidad media ${r.media.toFixed(0)}`);
});

// Si el CDN no responde, la app no puede quedarse colgada: tiene que decirlo y
// mandar a la vía de texto, que funciona sin descargar nada. Se fuerza el fallo
// interceptando la petición, así la prueba no depende de la red.
await paso('si Tesseract no se puede descargar, lo dice y manda a la vía de texto', async () => {
  esperandoFalloDeRed = true;
  await pagina.route('**/tesseract*', (ruta) => ruta.abort());
  await pagina.click('button[data-vista="inventario"]');
  await pagina.click('text=📷 Imagen');
  await pagina.waitForSelector('#ocr-archivo', { state: 'attached' });
  await pagina.setInputFiles('#ocr-archivo', new URL('./fixtures/ficha-chimchar.png', import.meta.url).pathname);
  await pagina.waitForSelector('text=Usa la pestaña «Texto»', { timeout: 30000 });
  await pagina.unroute('**/tesseract*');
  esperandoFalloDeRed = false;
  console.log('       degrada avisando, sin colgarse');
});

if (process.env.OCR === '1') {
  await paso('el OCR lee la ficha real del juego y la pasa a la revisión', async () => {
    await pagina.reload({ waitUntil: 'networkidle' });
    await pagina.waitForSelector('.tarjeta');
    await pagina.click('button[data-vista="inventario"]');
    await pagina.click('text=📷 Imagen');
    // El input de archivo va oculto a propósito: se espera a que exista, no a que se vea.
    await pagina.waitForSelector('#ocr-archivo', { state: 'attached' });
    await pagina.setInputFiles('#ocr-archivo', new URL('./fixtures/ficha-chimchar.png', import.meta.url).pathname);
    // Descargar el modelo de español la primera vez tarda: se le da margen.
    await pagina.waitForSelector('text=Revisar antes de guardar', { timeout: 240000 });
    const revision = await pagina.textContent('.tarjeta:has-text("Revisar antes de guardar")');
    console.log(`       ${revision.replace(/\s+/g, ' ').slice(0, 260)}`);
    if (!/Chimchar/i.test(revision)) throw new Error('no ha reconocido la especie');
    await pagina.click('text=Descartar');
  });
} else {
  console.log('  --  OCR completo omitido: necesita el CDN. Ponle OCR=1 donde haya salida a Internet.');
}

async function contarInventario() {
  const t = await pagina.textContent('.tarjeta:has-text("Tu inventario")');
  return Number((t.match(/Tu inventario · (\d+)/) ?? [0, 0])[1]);
}

await navegador.close();

console.log('');
if (errores.length) {
  console.log(`${errores.length} problema(s):`);
  for (const e of errores) console.log(`  - ${e}`);
  process.exit(1);
}
console.log('Todo en verde.');
