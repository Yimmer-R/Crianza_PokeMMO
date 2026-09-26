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

/**
 * Abre un plegable por su título, si no lo está ya.
 *
 * Lo secundario de cada vista vive en <details> cerrados; una persona los abre
 * de un toque y la prueba tiene que hacer lo mismo. Quedan abiertos entre
 * repintados, así que sólo hace falta la primera vez.
 */
const abrir = async (titulo) => {
  const sum = pagina.locator('summary').filter({ hasText: titulo }).first();
  await sum.waitFor({ timeout: 5000 });
  if (!(await sum.evaluate((n) => n.parentElement.open))) await sum.click();
  await pagina.waitForTimeout(150);
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
  // Lo secundario va plegado; se abren una vez y se quedan abiertos.
  await abrir('Todos los pasos, en orden');
  await abrir('El árbol');
  await pagina.waitForSelector('.pasos li', { timeout: 5000 });
  const pasos = await pagina.locator('.pasos li').count();
  if (pasos < 10) throw new Error(`sólo ${pasos} pasos`);
  const total = await pagina.textContent('.total');
  if (!/PokéYen/.test(total)) throw new Error(`presupuesto raro: ${total}`);
  console.log(`       ${pasos} pasos · presupuesto ${total.trim()}`);
});

await paso('«Ahora mismo» resume lo accionable y un plegable sobrevive al repintado', async () => {
  await pagina.click('button[data-vista="plan"]');
  const ahora = await pagina.textContent('.tarjeta:has-text("Ahora mismo")');
  if (!/Padres que te faltan/.test(ahora))
    throw new Error('debería listar los padres que faltan agrupados');
  // Agrupados: una fila por requisito, no una por captura.
  const filas = await pagina.locator('.tarjeta:has-text("Ahora mismo") tbody tr').count();
  const pasos = await pagina.locator('.pasos li.conseguir').count();
  if (filas >= pasos) throw new Error(`${filas} filas para ${pasos} capturas: no está agrupando`);

  // El detalle abierto tiene que seguir abierto tras un cambio de estado: si se
  // cerrara, marcar un paso obligaría a reabrirlo en cada cruce.
  await abrir('Todos los pasos, en orden');
  await pagina.click('button[data-vista="objetivo"]');
  await abrir('Regiones desbloqueadas');
  await pagina.uncheck('#region-Unova');
  await pagina.check('#region-Unova');
  await pagina.click('button[data-vista="plan"]');
  await pagina.waitForTimeout(200);
  const sigueAbierto = await pagina.locator('summary')
    .filter({ hasText: 'Todos los pasos, en orden' })
    .first().evaluate((n) => n.parentElement.open);
  if (!sigueAbierto) throw new Error('el plegable se ha cerrado solo al repintar');
  console.log(`       ${filas} filas agrupan ${pasos} capturas`);
});

await paso('el árbol tiene nodos anidados', async () => {
  const n = await pagina.locator('.arbol li').count();
  if (n < 8) throw new Error(`sólo ${n} nodos`);
  console.log(`       ${n} nodos en el árbol`);
});

await paso('Capturas respeta el filtro de regiones', async () => {
  await pagina.click('button[data-vista="objetivo"]');
  await abrir('Regiones desbloqueadas');
  for (const r of ['Johto', 'Hoenn', 'Sinnoh', 'Unova']) await pagina.uncheck(`#region-${r}`);
  await pagina.click('button[data-vista="capturas"]');
  await pagina.waitForSelector('.tarjeta', { timeout: 5000 });
  const chips = await pagina.locator('.chip').allTextContents();
  const otras = chips.filter((c) => /^(Johto|Hoenn|Sinnoh|Unova)$/.test(c.trim()));
  if (otras.length) throw new Error(`ha propuesto regiones bloqueadas: ${otras}`);
  const texto = await pagina.textContent('#vista');
  if (!texto.includes('Kanto')) throw new Error('no propone nada en Kanto');
});

await paso('hora y estación ordenan las capturas, y no esconden nada', async () => {
  // Con 0 EVs la pestaña de Entrenamiento no tiene nada que filtrar y no pinta
  // el selector, así que primero se le pone algo que entrenar.
  await pagina.click('button[data-vista="objetivo"]');
  await pagina.waitForSelector('#ev-velocidad');
  await pagina.fill('#ev-velocidad', '252');
  await pagina.dispatchEvent('#ev-velocidad', 'change');
  await pagina.waitForTimeout(200);

  await pagina.click('button[data-vista="capturas"]');
  await pagina.waitForSelector('.tarjeta', { timeout: 5000 });
  const filas = () => pagina.locator('.tarjeta:has-text("Dónde") tbody tr').count();
  const sinFiltro = await filas();

  // El selector vive en la propia pestaña de Capturas: es «cuándo estás
  // jugando», no una propiedad del Pokémon que quieres.
  await pagina.selectOption('#cuando-hora-cap', 'noche');
  await pagina.selectOption('#cuando-estacion-cap', 'invierno');
  await pagina.waitForTimeout(300);
  await pagina.waitForSelector('.tarjeta:has-text("Dónde")', { timeout: 5000 });
  if (await filas() !== sinFiltro)
    throw new Error('el filtro de hora no puede quitar filas, sólo reordenarlas y marcarlas');

  // El filtro activo se ve, y la columna «Cuándo» existe.
  const resumen = await pagina.textContent('.tarjeta:has-text("Resumen")');
  for (const x of ['noche', 'invierno']) {
    if (!resumen.includes(x)) throw new Error(`el resumen no dice "${x}"`);
  }
  const cabeceras = await pagina.locator('.tarjeta:has-text("Dónde") thead').allTextContents();
  if (!cabeceras.some((c) => c.includes('Cuándo')))
    throw new Error('falta la columna Cuándo en la tabla de zonas');

  // Entrenamiento lo respeta también: la mejor horda tiene que servir de noche.
  await pagina.click('button[data-vista="entrenamiento"]');
  await pagina.waitForTimeout(400);
  const ent = await pagina.textContent('#vista');
  if (/La mejor:/.test(ent) && !/(siempre|noche)/.test(ent))
    throw new Error('la mejor horda propuesta no sirve de noche');

  // Y el mismo estado se ve desde Entrenamiento: es uno solo, no dos.
  if (await pagina.inputValue('#cuando-hora-ent') !== 'noche')
    throw new Error('el filtro tiene que ser el mismo en las dos pestañas');
  await pagina.selectOption('#cuando-hora-ent', '');
  await pagina.selectOption('#cuando-estacion-ent', '');
  await pagina.waitForTimeout(200);

  // Se deja el objetivo como estaba para no descolocar las pruebas de abajo.
  await pagina.click('button[data-vista="objetivo"]');
  await pagina.fill('#ev-velocidad', '0');
  await pagina.dispatchEvent('#ev-velocidad', 'change');
  await pagina.waitForTimeout(200);
  console.log(`       ${sinFiltro} filas de zonas, las mismas con y sin filtro`);
});

await paso('un objetivo sin género: sin selector de sexo y sin capturas imposibles', async () => {
  await pagina.click('text=+ Nueva');
  await pagina.click('button[data-vista="objetivo"]');
  await pagina.waitForSelector('#especie');
  await pagina.fill('#especie', 'Starmie');
  await confirmarCampo('#especie');
  await pagina.waitForSelector('text=Grupo huevo: Sin género', { timeout: 5000 });

  if (await pagina.locator('#sexo').count())
    throw new Error('Starmie no tiene sexo: el selector no debería estar');
  await pagina.check('#iv-velocidad');
  await pagina.check('#iv-at-esp');
  await pagina.waitForTimeout(400);

  await pagina.click('button[data-vista="capturas"]');
  await pagina.waitForSelector('.tarjeta', { timeout: 5000 });
  const t = await pagina.textContent('#vista');
  if (/imposible/.test(t)) throw new Error('sigue habiendo capturas imposibles');
  if (/ninguna de las especies compatibles/i.test(t))
    throw new Error('sigue diciendo que ninguna especie es compatible');
  if (!/su línea o un Ditto/.test(t))
    throw new Error('debería decir que la pareja es su línea evolutiva o un Ditto');
  const primera = await pagina.locator('.tarjeta h2').nth(2).textContent();
  console.log(`       ${primera.trim()} · sin sexo y sin imposibles`);

  await pagina.click('text=Borrar');
  await pagina.waitForTimeout(250);
  await pagina.click('.crianza:has-text("Larvitar")');
  await pagina.waitForTimeout(150);
});

await paso('Entrenamiento guía los movimientos contando con la evolución', async () => {
  await pagina.click('text=+ Nueva');
  await pagina.click('button[data-vista="objetivo"]');
  await pagina.waitForSelector('#especie');
  await pagina.fill('#especie', 'Amoonguss');
  await confirmarCampo('#especie');
  await pagina.waitForTimeout(400);

  // Polvo Veneno NO está en ninguna lista de Amoonguss: es movimiento huevo de
  // Foongus, que es lo que sale del huevo. Antes el campo lo rechazaba.
  await pagina.waitForSelector('#nuevo-mov');
  await pagina.fill('#nuevo-mov', 'Polvo Veneno');
  await confirmarCampo('#nuevo-mov');
  await pagina.waitForTimeout(400);
  const chips = await pagina.locator('.tarjeta:has-text("Habilidad y movimientos") .etiquetas .boton').allTextContents();
  if (!chips.some((c) => /Polvo Veneno/.test(c)))
    throw new Error(`no ha aceptado el movimiento huevo de la fase base: ${chips.join(', ')}`);

  await pagina.click('button[data-vista="entrenamiento"]');
  await pagina.waitForSelector('.tarjeta:has-text("Movimientos y habilidad, en orden")', { timeout: 5000 });
  const g = (await pagina.textContent('.tarjeta:has-text("Movimientos y habilidad, en orden")')).replace(/\s+/g, ' ');
  for (const esperado of ['Foongus → Amoonguss', 'de huevo: al criar', 'recordador de movimientos']) {
    if (!g.includes(esperado)) throw new Error(`la guía no dice "${esperado}"`);
  }
  if (!/al criar/.test(g)) throw new Error('el orden debería empezar por lo del huevo');
  console.log(`       ${g.slice(0, 90)}`);

  await pagina.click('text=Borrar');
  await pagina.waitForTimeout(250);
  await pagina.click('.crianza:has-text("Larvitar")');
  await pagina.waitForTimeout(150);
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

await paso('Entrenamiento avisa de los EVs que caen entre escalones', async () => {
  await pagina.click('button[data-vista="objetivo"]');
  await pagina.waitForSelector('#ev-ataque');
  await pagina.fill('#ev-ataque', '252');
  await pagina.dispatchEvent('#ev-ataque', 'change');
  await pagina.fill('#ev-ps', '6');
  await pagina.dispatchEvent('#ev-ps', 'change');

  await pagina.click('button[data-vista="entrenamiento"]');
  await pagina.waitForSelector('.tarjeta:has-text("Optimizar el reparto")', { timeout: 5000 });
  const t = await pagina.textContent('.tarjeta:has-text("Optimizar el reparto")');
  if (!t.includes('2 EVs')) throw new Error(`esperaba recuperar 2 EVs: "${t.slice(0, 120)}"`);

  await pagina.click('#aplicar-optimizacion');
  await pagina.click('button[data-vista="objetivo"]');
  await pagina.waitForSelector('#ev-ps');
  const ps = await pagina.inputValue('#ev-ps');
  if (ps !== '4') throw new Error(`los PS deberían haber bajado a 4 y están en ${ps}`);
  console.log('       PS 6 -> 4: los 2 de más no daban ni un punto');

  // Se deja como estaba para no descolocar las pruebas de más abajo.
  await pagina.fill('#ev-ataque', '0');
  await pagina.dispatchEvent('#ev-ataque', 'change');
  await pagina.fill('#ev-ps', '0');
  await pagina.dispatchEvent('#ev-ps', 'change');
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
  await abrir('Todos los pasos, en orden');
  await pagina.waitForSelector('.pasos li');
  const texto = await pagina.textContent('.pasos');
  if (!texto.includes('Piedraeterna'))
    throw new Error('el plan con naturaleza debería pedir Piedraeterna');
  if (await pagina.locator('#estrategia-nat').count())
    throw new Error('ya no hay estrategias de naturaleza que elegir');
  console.log(`       ${(await pagina.textContent('.total')).trim()}`);
});

await paso('el checklist: marcar un cruce gasta los padres y anota la cría', async () => {
  // Inventario limpio y una crianza propia y pequeña, para que esta prueba no
  // dependa de lo que hayan dejado las de arriba.
  await pagina.click('button[data-vista="inventario"]');
  await pagina.waitForSelector('#vaciar-inventario');
  await pagina.click('#vaciar-inventario');
  await pagina.click('#vaciar-si');
  await pagina.waitForSelector('text=Vacío. Anota lo que tengas', { timeout: 5000 });

  await pagina.click('text=+ Nueva');
  await pagina.click('button[data-vista="objetivo"]');
  await pagina.waitForSelector('#especie');
  await pagina.fill('#especie', 'Larvitar');
  await confirmarCampo('#especie');
  await pagina.check('#iv-ataque');
  await pagina.check('#iv-velocidad');

  const anotar = async (especie, sexo, stat) => {
    await pagina.click('button[data-vista="inventario"]');
    await pagina.waitForSelector('#b-especie');
    await pagina.fill('#b-especie', especie);
    await confirmarCampo('#b-especie');
    await pagina.selectOption('#b-sexo', sexo);
    await pagina.fill(`#b-iv-${stat}`, '31');
    await pagina.dispatchEvent(`#b-iv-${stat}`, 'change');
    await pagina.click('text=Añadir al inventario');
    await pagina.waitForTimeout(150);
  };
  await anotar('Larvitar', '♀', 'ataque');
  await anotar('Charmander', '♂', 'velocidad');

  await pagina.click('button[data-vista="plan"]');
  // El cruce listo sale también en «Ahora mismo», pero aquí se prueba el
  // checklist entero, que es el que gasta los padres.
  await abrir('Todos los pasos, en orden');
  await pagina.waitForSelector('.pasos li.cruzar.listo', { timeout: 5000 });
  await pagina.click('text=Hecho: quitar los padres');
  await pagina.waitForSelector('#deshacer-paso', { timeout: 5000 });

  await pagina.click('button[data-vista="inventario"]');
  const inv = await pagina.textContent('.inventario-lista');
  if (inv.includes('Charmander'))
    throw new Error('el padre debería haberse gastado en el cruce');
  if (!/Tu inventario · 1/.test(await pagina.textContent('.inventario-lista h2')))
    throw new Error(`deberían quedar sólo la cría; dice "${inv.slice(0, 80)}"`);
  if (!inv.includes('2×31'))
    throw new Error('la cría tendría que llevar los dos 31 garantizados');

  // Y se puede deshacer: los dos padres vuelven.
  await pagina.click('button[data-vista="plan"]');
  await abrir('Todos los pasos, en orden');
  await pagina.click('#deshacer-paso');
  await pagina.click('button[data-vista="inventario"]');
  await pagina.waitForSelector('.inventario-lista tbody tr:nth-child(2)', { timeout: 5000 });
  console.log('       cruce hecho y deshecho, con los padres de vuelta');

  await pagina.click('text=Borrar');  // se lleva esta crianza de prueba
  await pagina.waitForTimeout(200);
  await pagina.click('.crianza:has-text("Larvitar")');
  await pagina.waitForTimeout(150);
});

await paso('Inventario: marcar varios y borrarlos por tandas', async () => {
  await pagina.click('button[data-vista="inventario"]');
  await pagina.waitForSelector('#sel-todos');
  // Hay varias tablas en la vista: sólo cuenta la del inventario.
  const cuantos = () => pagina.locator('.inventario-lista tbody tr').count();
  const antes = await cuantos();
  if (antes < 1) throw new Error('hace falta algo en el inventario para esta prueba');

  await pagina.check('#sel-todos');
  await pagina.waitForSelector('#borrar-seleccion');
  const etiqueta = await pagina.textContent('#borrar-seleccion');
  if (!etiqueta.includes(String(antes)))
    throw new Error(`el botón dice "${etiqueta}" y hay ${antes} marcados`);

  await pagina.click('text=Quitar la marca');
  await pagina.waitForTimeout(120);
  if (await pagina.locator('#borrar-seleccion').count())
    throw new Error('quitar la marca debería esconder el botón de borrar');

  // Vaciar pide confirmación: un clic no basta.
  await pagina.click('#vaciar-inventario');
  await pagina.waitForSelector('#vaciar-si');
  await pagina.click('text=Cancelar');
  await pagina.waitForTimeout(120);
  if (await cuantos() !== antes) throw new Error('cancelar no debería borrar nada');

  await pagina.click('#vaciar-inventario');
  await pagina.click('#vaciar-si');
  await pagina.waitForSelector('text=Vacío. Anota lo que tengas', { timeout: 5000 });
  console.log(`       ${antes} -> 0 tras confirmar`);
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
  const inv = await pagina.textContent('.inventario-lista');
  await pagina.click('.crianza:has-text("Bulbasaur")');
  await pagina.waitForTimeout(150);
  const inv2 = await pagina.textContent('.inventario-lista');
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

  const fila = await pagina.textContent('.inventario-lista');
  if (!fila.includes('Rodar')) throw new Error('el movimiento no se ha guardado');
  console.log(`       inventario ${antes} -> ${despues}, con los movimientos`);
});

await paso('importar varios de golpe, y quitar uno antes de guardar', async () => {
  await pagina.click('button[data-vista="inventario"]');
  await pagina.click('text=📋 Texto');
  await pagina.waitForSelector('#texto-importar-inventario');
  await pagina.fill('#texto-importar-inventario', [
    'Rattata ♂ Nv. 5',
    'IVs: 31/12/9/4/7/20',
    '',
    'Charmander ♀ Nv. 5',
    'IVs: 8/31/11/6/9/14',
    '',
    'Bulbasaur ♂ Nv. 5',
    'IVs: 5/7/31/12/8/19',
  ].join('\n'));
  await pagina.click('text=Leer el texto');
  await pagina.waitForSelector('text=Revisar antes de guardar · 3', { timeout: 5000 });

  // Una tanda de tres no puede obligar a descartar las tres por una mal leída.
  await pagina.click('.tarjeta:has-text("Revisar antes de guardar") tbody tr:nth-child(2) button');
  await pagina.waitForSelector('text=Revisar antes de guardar · 2', { timeout: 5000 });

  const antes = await contarInventario();
  await pagina.click('text=Guardar 2 en el inventario');
  await pagina.waitForTimeout(250);
  const despues = await contarInventario();
  if (despues !== antes + 2) throw new Error(`inventario ${antes} -> ${despues}, esperaba +2`);
  console.log(`       3 leídos, 1 quitado, inventario ${antes} -> ${despues}`);
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
  await abrir('Importar el objetivo de una ficha');
  await pagina.click('.plegable:has-text("Importar el objetivo de una ficha") >> text=📋 Texto');
  await pagina.waitForSelector('#texto-importar-objetivo');
  await pagina.fill('#texto-importar-objetivo', [
    'Nv. 1 Chimchar ♀',
    'IVs: 19/30/15/23/21/31',
    'EVs: 252/0/0/0/0/252',
    'Naturaleza: agitada',
    'Habilidad: Mar Llamas',
    'Movimientos: Placaje, Maquinación, Tormento, Desenrollar',
  ].join('\n'));
  await pagina.click('.plegable:has-text("Importar el objetivo de una ficha") >> text=Leer el texto');
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
  const t = await pagina.textContent('.inventario-lista');
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
