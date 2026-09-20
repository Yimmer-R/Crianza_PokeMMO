// Playwright no es dependencia del proyecto: se busca donde esté instalado.
const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');

const BASE = process.env.BASE ?? 'http://localhost:8099';
const navegador = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
const pagina = await navegador.newPage();

const errores = [];
pagina.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
pagina.on('console', (m) => { if (m.type() === 'error') errores.push(`console: ${m.text()}`); });

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

await navegador.close();

console.log('');
if (errores.length) {
  console.log(`${errores.length} problema(s):`);
  for (const e of errores) console.log(`  - ${e}`);
  process.exit(1);
}
console.log('Todo en verde.');
