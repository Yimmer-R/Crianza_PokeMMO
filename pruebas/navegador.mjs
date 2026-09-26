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

/**
 * Confirma un campo con autocompletado.
 *
 * El componente propio confirma al SALIR del campo o con Enter, que es lo que
 * hace una persona; no escucha 'change'. Por eso las pruebas tienen que salir
 * del campo, igual que el usuario.
 */
const confirmarCampo = async (selector) => {
  await pagina.dispatchEvent(selector, 'blur');
  await pagina.waitForTimeout(120);
};

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
  await confirmarCampo('#especie');
  await pagina.waitForSelector('text=Grupo huevo: Monstruo', { timeout: 5000 });
});

await paso('marcar 4 IVs y una naturaleza', async () => {
  for (const s of ['ps', 'ataque', 'defensa', 'velocidad']) await pagina.check(`#iv-${s}`);
  await pagina.fill('#naturaleza', 'Audaz');
  await confirmarCampo('#naturaleza');
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
  // Macho a propósito: una HEMBRA de Larvitar siempre sirve aunque no tenga
  // ningún 31, porque la especie la pone la madre. Un macho con el 31 que no
  // toca no vale para nada.
  await pagina.fill('#b-especie', 'Larvitar');
  await confirmarCampo('#b-especie');
  await pagina.selectOption('#b-sexo', '♂');
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
  await confirmarCampo('#b-especie');
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

await paso('todos los cruces con naturaleza llevan Piedraeterna', async () => {
  await pagina.click('button[data-vista="plan"]');
  await pagina.waitForSelector('.pasos li');
  const texto = await pagina.textContent('.pasos');
  if (!texto.includes('Piedraeterna'))
    throw new Error('el plan con naturaleza debería pedir Piedraeterna');
  if (await pagina.locator('#estrategia-nat').count())
    throw new Error('ya no hay estrategias de naturaleza que elegir');
  console.log(`       ${(await pagina.textContent('.total')).trim()}`);
});

await paso('dos crianzas a la vez, con inventario compartido y sin pisarse', async () => {
  const cuantas = () => pagina.locator('.crianza').count();
  await pagina.click('button[data-vista="objetivo"]');
  await pagina.waitForSelector('#especie');
  const antes = await cuantas();

  await pagina.click('text=+ Nueva');
  await pagina.waitForFunction((n) => document.querySelectorAll('.crianza').length === n + 1, antes);
  if (await pagina.inputValue('#especie') !== '')
    throw new Error('la crianza nueva debería empezar en blanco');

  await pagina.fill('#especie', 'Bulbasaur');
  await confirmarCampo('#especie');
  await pagina.check('#iv-ataque');
  await pagina.waitForSelector('.crianza.activa:has-text("Bulbasaur")', { timeout: 5000 });

  // Volver a la primera: su objetivo tiene que seguir intacto.
  await pagina.click('.crianza:has-text("Larvitar")');
  await pagina.waitForTimeout(150);
  if (await pagina.inputValue('#especie') !== 'Larvitar')
    throw new Error('cambiar de crianza ha perdido el objetivo de la primera');
  if (!(await pagina.isChecked('#iv-ps')))
    throw new Error('la primera crianza ha perdido sus IVs');

  // Y el inventario es el mismo para las dos.
  await pagina.click('button[data-vista="inventario"]');
  const inv = await pagina.textContent('.tarjeta:has-text("Tu inventario")');
  await pagina.click('.crianza:has-text("Bulbasaur")');
  await pagina.waitForTimeout(150);
  const inv2 = await pagina.textContent('.tarjeta:has-text("Tu inventario")');
  if (inv.replace(/\s+/g, '') !== inv2.replace(/\s+/g, ''))
    throw new Error('el inventario debería ser el mismo en las dos crianzas');

  // Se borra la de prueba y vuelve a quedar la de Larvitar.
  await pagina.click('text=Borrar');
  await pagina.waitForFunction((n) => document.querySelectorAll('.crianza').length === n, antes);
  await pagina.click('.crianza:has-text("Larvitar")');
  await pagina.click('button[data-vista="objetivo"]');
  await pagina.waitForSelector('#especie');
  console.log(`       ${antes} -> ${antes + 1} -> ${await cuantas()} crianzas`);
});

await paso('el registro manual acepta movimientos y traduce el nombre del juego', async () => {
  await pagina.click('button[data-vista="inventario"]');
  await pagina.waitForSelector('#b-especie');
  await pagina.fill('#b-especie', 'Chimchar');
  await confirmarCampo('#b-especie');
  await pagina.waitForSelector('#b-mov-0');
  await pagina.fill('#b-mov-0', 'Desenrollar');
  await confirmarCampo('#b-mov-0');
  await pagina.waitForSelector('text=He interpretado "Desenrollar" como Rodar', { timeout: 5000 });
  const puesto = await pagina.inputValue('#b-mov-0');
  if (puesto !== 'Rodar') throw new Error(`el campo debería quedar en Rodar, está en "${puesto}"`);
});

await paso('importar por texto rellena la revisión y guarda tras confirmar', async () => {
  await pagina.click('button[data-vista="inventario"]');
  await pagina.click('text=📋 Texto');
  await pagina.waitForSelector('#texto-importar-inventario');
  await pagina.fill('#texto-importar-inventario', [
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
  await pagina.fill('#texto-importar-inventario', 'Pikachurin ♂\nIVs: 31/0/0/0/0/0');
  await pagina.click('text=Leer el texto');
  await pagina.waitForSelector('text=Cosas que no he entendido', { timeout: 5000 });
  await pagina.click('text=Descartar');
  await pagina.waitForTimeout(200);
});

// El preprocesado de la imagen es código propio y no necesita red: se prueba
// siempre. Lo único que queda fuera es Tesseract, que es de terceros.
await paso('al tocar el campo sale la lista completa, aunque ya tenga valor', async () => {
  await pagina.click('button[data-vista="inventario"]');
  await pagina.waitForSelector('#b-especie');
  // Se le deja un valor puesto a propósito: tocar un campo que ya dice algo es
  // justo cuando enseñar sólo ese valor no sirve de nada.
  await pagina.fill('#b-especie', 'Larvitar');
  await confirmarCampo('#b-especie');
  if (await pagina.inputValue('#b-especie') !== 'Larvitar')
    throw new Error('el valor previo no se ha quedado puesto');

  await pagina.click('#b-especie');
  await pagina.waitForSelector('#b-especie ~ .sug-lista .sug-opcion', { timeout: 5000 });
  const cuantas = await pagina.locator('#b-especie ~ .sug-lista .sug-opcion').count();
  if (cuantas < 5) throw new Error(`sólo ${cuantas} opciones al tocar un campo con valor`);
  console.log(`       ${cuantas} opciones con "Larvitar" ya escrito`);
});

await paso('filtra al escribir y al tocar una opción la confirma', async () => {
  await pagina.fill('#b-especie', 'Ra');
  await pagina.waitForSelector('#b-especie ~ .sug-lista .sug-opcion', { timeout: 5000 });
  const textos = await pagina.locator('#b-especie ~ .sug-lista .sug-opcion').allTextContents();
  if (!textos.length) throw new Error('no ha filtrado nada con "Ra"');
  for (const t of textos.slice(0, 5)) {
    if (!/ra/i.test(t)) throw new Error(`"${t}" no contiene "ra"`);
  }
  const elegida = textos.find((t) => t === 'Rattata') ?? textos[0];
  await pagina.click(`#b-especie ~ .sug-lista .sug-opcion:text-is("${elegida}")`);
  const valor = await pagina.inputValue('#b-especie');
  if (valor !== elegida) throw new Error(`el campo quedó en "${valor}" y esperaba "${elegida}"`);
  // Al confirmar, la lista se cierra y el estado se ha enterado.
  if (await pagina.locator('#b-especie ~ .sug-lista .sug-opcion').count())
    throw new Error('la lista debería cerrarse al elegir');
  console.log(`       "Ra" -> ${textos.length} opciones -> elegida ${elegida}`);
});

await paso('filtra sin tildes, que es como se escribe en el móvil', async () => {
  await pagina.fill('#b-especie', 'Chimchar');
  await confirmarCampo('#b-especie');
  await pagina.click('#b-mov-0');
  await pagina.fill('#b-mov-0', 'maquinacion');
  await pagina.waitForSelector('#b-mov-0 ~ .sug-lista .sug-opcion', { timeout: 5000 });
  const textos = await pagina.locator('#b-mov-0 ~ .sug-lista .sug-opcion').allTextContents();
  if (!textos.includes('Maquinación'))
    throw new Error(`esperaba Maquinación entre [${textos.slice(0, 6)}]`);
  console.log('       "maquinacion" encuentra Maquinación');
});

await paso('escribir a mano sigue valiendo: se confirma al salir del campo', async () => {
  await pagina.fill('#b-mov-1', 'Desenrollar');
  await confirmarCampo('#b-mov-1');
  await pagina.waitForSelector('text=He interpretado "Desenrollar" como Rodar', { timeout: 5000 });
  const puesto = await pagina.inputValue('#b-mov-1');
  if (puesto !== 'Rodar') throw new Error(`el campo debería quedar en Rodar, está en "${puesto}"`);
});

await paso('la página NO salta al principio al cambiar algo', async () => {
  await pagina.click('button[data-vista="objetivo"]');
  await pagina.waitForSelector('#iv-ps');
  await pagina.evaluate(() => window.scrollTo(0, 500));
  await pagina.waitForTimeout(200);
  const antes = await pagina.evaluate(() => window.scrollY);
  if (antes < 100) throw new Error(`no he podido bajar la página (scrollY=${antes})`);

  // Marcar un IV recalcula el plan y repinta la vista entera.
  await pagina.check('#iv-defensa');
  await pagina.waitForTimeout(400);
  const despues = await pagina.evaluate(() => window.scrollY);
  if (Math.abs(despues - antes) > 60)
    throw new Error(`la página ha saltado: ${antes} -> ${despues}`);
  console.log(`       scrollY ${antes} -> ${despues} tras repintar`);
  await pagina.uncheck('#iv-defensa');
});

await paso('cambiar de pestaña SÍ lleva al principio', async () => {
  await pagina.evaluate(() => window.scrollTo(0, 400));
  await pagina.click('button[data-vista="plan"]');
  await pagina.waitForTimeout(400);
  const y = await pagina.evaluate(() => window.scrollY);
  if (y > 40) throw new Error(`debería ir arriba al cambiar de pestaña, está en ${y}`);
});

await paso('Objetivo tiene su propio importador y aplica la ficha al objetivo', async () => {
  await pagina.click('button[data-vista="objetivo"]');
  await pagina.waitForSelector('.tarjeta:has-text("Importar el objetivo de una ficha")');
  await pagina.click('.tarjeta:has-text("Importar el objetivo de una ficha") >> text=📋 Texto');
  await pagina.waitForSelector('#texto-importar-objetivo');
  await pagina.fill('#texto-importar-objetivo', [
    'Nv. 1 Chimchar ♀',
    'IVs: 19/30/15/23/21/31',
    'EVs: 252/0/0/0/0/252',
    'Naturaleza: agitada',
    'Habilidad: Mar Llamas',
    'Movimientos: Placaje, Maquinación, Tormento, Desenrollar',
  ].join('\n'));
  await pagina.click('.tarjeta:has-text("Importar el objetivo de una ficha") >> text=Leer el texto');
  await pagina.waitForSelector('text=Revisar antes de aplicar', { timeout: 5000 });

  const rev = await pagina.textContent('.tarjeta:has-text("Revisar antes de aplicar")');
  for (const esperado of ['Chimchar', 'Velocidad', 'Agitada', 'Mar Llamas', 'Rodar']) {
    if (!rev.includes(esperado)) throw new Error(`la revisión no menciona "${esperado}"`);
  }

  // La casilla de los seis IVs cambia lo que se va a aplicar.
  await pagina.check('#importar-todos-ivs');
  await pagina.waitForTimeout(300);
  const conSeis = await pagina.textContent('.tarjeta:has-text("Revisar antes de aplicar")');
  if (!conSeis.includes('6×31')) throw new Error('con la casilla marcada debería ofrecer 6×31');
  await pagina.uncheck('#importar-todos-ivs');
  await pagina.waitForTimeout(300);

  await pagina.click('text=Usar como objetivo y ver el plan');
  await pagina.waitForSelector('.pasos li', { timeout: 5000 });
  const plan = await pagina.textContent('.tarjeta:has-text("Chimchar")');
  if (!/Agitada/.test(plan)) throw new Error('el plan no ha cogido la naturaleza importada');
  console.log(`       ${plan.replace(/\s+/g, ' ').slice(0, 110)}`);
});

await paso('prepararImagen escala la captura e invierte el fondo oscuro', async () => {
  const r = await pagina.evaluate(async () => {
    // Relativo a la página, NO absoluto: en GitHub Pages la app vive en un
    // subdirectorio (/Crianza_PokeMMO/) y una ruta absoluta se sale de él.
    const desdeLaPagina = (ruta) => new URL(ruta, document.baseURI).href;
    const { prepararImagen } = await import(desdeLaPagina('src/ui/ocr.js'));
    const blob = await fetch(desdeLaPagina('pruebas/fixtures/ficha-chimchar.png')).then((x) => x.blob());
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
  await pagina.waitForSelector('#ocr-archivo-inventario', { state: 'attached' });
  await pagina.setInputFiles('#ocr-archivo-inventario', new URL('./fixtures/ficha-chimchar.png', import.meta.url).pathname);
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
    await pagina.waitForSelector('#ocr-archivo-inventario', { state: 'attached' });
    await pagina.setInputFiles('#ocr-archivo-inventario', new URL('./fixtures/ficha-chimchar.png', import.meta.url).pathname);
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
