// Playwright no es dependencia del proyecto: se busca donde esté instalado.
import { readFileSync } from 'node:fs';

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');

const BASE = process.env.BASE ?? 'http://localhost:8099';
const navegador = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
const pagina = await navegador.newPage();

// Las imágenes de los Pokémon NO están en este repositorio: las sirve el volcado
// de PokeAPI que enlaza la wiki. Una máquina sin salida directa a internet —CI,
// o un proxy con su propia autoridad— no las baja, y Chromium lo apunta como
// error de consola. Eso no es un fallo de la app: la vista deja el hueco dicho y
// sigue funcionando, así que se cuentan aparte y se dice cuántas fueron. Lo que
// sí se comprueba siempre es que el `src` sea el que toca, que es lo que puede
// romper un cambio de código.
const HOST_SPRITES = new URL(
  JSON.parse(readFileSync(new URL('../datos/sprites.json', import.meta.url), 'utf8')).base,
).host;
let spritesSinRed = 0;

const errores = [];
// Hay una prueba que corta la descarga de Tesseract a propósito; el error de red
// que eso provoca no es un fallo de la app, así que se silencia sólo ahí.
let esperandoFalloDeRed = false;
pagina.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
pagina.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (esperandoFalloDeRed && /ERR_(FAILED|ABORTED|BLOCKED)/.test(m.text())) return;
  if ((m.location()?.url ?? '').includes(HOST_SPRITES)) { spritesSinRed++; return; }
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

await paso('Objetivo pinta las seis características, con base y número final', async () => {
  // Las bases tienen que ser las de la wiki, no unas cualesquiera: se leen del
  // mismo JSON que sirve la app y se comparan una a una.
  const dePokedex = await pagina.evaluate(async () => {
    const d = await (await fetch('datos/pokemon.json')).json();
    return d.Larvitar.stats;
  });
  const orden = ['ps', 'ataque', 'defensa', 'at-esp', 'def-esp', 'velocidad'];
  const filas = await pagina.$$eval('.stat', (ns) => ns.map((n) => ({
    nombre: n.querySelector('.stat-nombre').textContent.trim(),
    base: Number(n.querySelector('.stat-base-num').textContent),
    valor: Number(n.querySelector('.stat-cifra').textContent),
    tramos: [...n.querySelectorAll('.stat-barra > i')].map((i) => i.className),
  })));
  if (filas.length !== 6) throw new Error(`${filas.length} filas, esperaba 6`);
  orden.forEach((s, i) => {
    if (filas[i].base !== dePokedex[s]) throw new Error(`${s}: base ${filas[i].base} y la wiki dice ${dePokedex[s]}`);
    if (!(filas[i].valor > 0)) throw new Error(`${s}: sin número final`);
  });

  // Audaz (Brave) sube Ataque y baja Velocidad — lo dice la wiki, no el nombre
  // en español, que suena a otra cosa. Las flechas tienen que caer justo ahí:
  // es lo que comprueba que la naturaleza entra de verdad en la cuenta.
  const nat = await pagina.evaluate(async () => (await (await fetch('datos/naturalezas.json')).json()).Audaz);
  const conFlecha = filas.filter((f) => /[▲▼]/.test(f.nombre)).map((f) => f.nombre.replace(/\s+/g, ' '));
  if (conFlecha.length !== 2) throw new Error(`flechas de naturaleza: ${JSON.stringify(conFlecha)}`);
  if (!conFlecha.some((n) => n.startsWith(nat.sube) && n.endsWith('▲')))
    throw new Error(`Audaz sube ${nat.sube}: ${JSON.stringify(conFlecha)}`);
  if (!conFlecha.some((n) => n.startsWith(nat.baja) && n.endsWith('▼')))
    throw new Error(`Audaz baja ${nat.baja}: ${JSON.stringify(conFlecha)}`);

  // Y la tarjeta es viva: subir los EVs de Ataque sube su número y alarga su
  // tramo blanco, que es el que dibuja lo que aportan IVs y EVs.
  const antes = filas[1];
  await pagina.fill('#ev-ataque', '252');
  await pagina.dispatchEvent('#ev-ataque', 'change');
  await pagina.waitForTimeout(450);
  const despues = await pagina.$$eval('.stat', (ns) => ({
    valor: Number(ns[1].querySelector('.stat-cifra').textContent),
    tramos: ns[1].querySelectorAll('.stat-barra > i').length,
  }));
  if (!(despues.valor > antes.valor))
    throw new Error(`252 EVs en Ataque no han subido nada: ${antes.valor} -> ${despues.valor}`);
  if (despues.tramos !== 2) throw new Error('falta el tramo de IVs y EVs en la barra');
  await pagina.fill('#ev-ataque', '0');
  await pagina.dispatchEvent('#ev-ataque', 'change');
  await pagina.waitForTimeout(350);
  console.log(`       Larvitar: bases de la wiki, Audaz ▲${nat.sube} ▼${nat.baja}, `
    + `Ataque ${antes.valor} -> ${despues.valor} con 252 EVs`);
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

await paso('una línea sin hembras: macho y Ditto, no una captura imposible', async () => {
  await pagina.click('text=+ Nueva');
  await pagina.click('button[data-vista="objetivo"]');
  await pagina.waitForSelector('#especie');
  await pagina.fill('#especie', 'Nidoking');
  await confirmarCampo('#especie');
  await pagina.waitForSelector('text=Del huevo sale Nidoran', { timeout: 5000 });

  // Toda la línea de Nidoran♂ es macho: no hay sexo que elegir.
  if (await pagina.locator('#sexo').count())
    throw new Error('en la línea de Nidoking no hay hembras: el selector sobra');
  await pagina.check('#iv-velocidad');
  await pagina.check('#iv-at-esp');
  await pagina.waitForTimeout(400);

  await pagina.click('button[data-vista="capturas"]');
  await pagina.waitForSelector('.tarjeta', { timeout: 5000 });
  const t = await pagina.textContent('#vista');
  if (/imposible/.test(t)) throw new Error('sigue habiendo capturas imposibles');
  if (/♀/.test(t)) throw new Error('está pidiendo una hembra de una línea sin hembras');
  if (!/Ditto/.test(t)) throw new Error('debería decir que la pareja es un Ditto');
  const titulos = await pagina.locator('.tarjeta h2').allTextContents();
  console.log(`       ${titulos.slice(2).map((x) => x.trim()).join(' · ')}`);

  await pagina.click('text=Borrar');
  await pagina.waitForTimeout(250);
  await pagina.click('.crianza:has-text("Larvitar")');
  await pagina.waitForTimeout(150);
});

/**
 * Ningún texto por debajo del contraste mínimo, en las cinco vistas.
 *
 * La paleta es de fantasía oscura y el objetivo declarado del usuario es que no
 * se pierda ninguna letra. A ojo eso no se comprueba: hay que medirlo. Se
 * recorre el DOM de verdad, se busca el fondo efectivo de cada nodo con texto
 * —subiendo por los padres hasta encontrar uno opaco— y se exige 4,5:1, o 3:1
 * si el texto es grande, que es lo que pide la WCAG en cada caso.
 *
 * Dos valores de la paleta salieron de aquí: el carmesí aclarado para letra
 * (#ff3b57) y el borde de campo (#6b6b6b).
 */
/**
 * El pseudo 31 de punta a punta: un 30 entra en el plan, el plan dice que ese
 * IV sale a 30, y la optimización de EVs hace la cuenta con el 30 (que a nivel
 * 50 da otros escalones, porque cambia la paridad).
 */
await paso('un 30 del inventario entra en el plan y llega hasta los EVs', async () => {
  await pagina.click('text=+ Nueva');
  await pagina.click('button[data-vista="objetivo"]');
  await pagina.waitForSelector('#especie');
  await pagina.fill('#especie', 'Poliwag');
  await confirmarCampo('#especie');
  await pagina.check('#iv-ataque');
  await pagina.check('#iv-velocidad');
  await pagina.fill('#ev-ataque', '252');
  await pagina.dispatchEvent('#ev-ataque', 'change');
  await pagina.waitForTimeout(300);

  // Un Poliwag hembra con 30 en Ataque: no es un 31, pero sirve de madre.
  await pagina.click('button[data-vista="inventario"]');
  await pagina.fill('#b-especie', 'Poliwag');
  await confirmarCampo('#b-especie');
  await pagina.selectOption('#b-sexo', '♀');
  await pagina.fill('#b-iv-ataque', '30');
  await pagina.dispatchEvent('#b-iv-ataque', 'change');
  await pagina.waitForTimeout(200);
  await pagina.click('text=Sólo comprobar si me sirve');
  await pagina.waitForTimeout(300);
  const veredicto = await pagina.textContent('#vista');
  if (!/pseudo 31/i.test(veredicto)) throw new Error('el inventario no avisa de que entra como pseudo 31');
  await pagina.click('text=Añadir al inventario');
  await pagina.waitForSelector('.tarjeta:has-text("Tu inventario · 1")', { timeout: 5000});

  await pagina.click('button[data-vista="plan"]');
  await pagina.waitForTimeout(400);
  const plan = await pagina.textContent('#vista');
  if (!/Ataque a 30/.test(plan)) throw new Error('el plan no dice que Ataque sale a 30');
  if (!/pseudo 31/.test(plan)) throw new Error('el plan no explica de dónde sale el 30');

  await pagina.click('button[data-vista="entrenamiento"]');
  await pagina.waitForTimeout(500);
  const ent = await pagina.textContent('#vista');
  if (!/hecha con un 30/.test(ent)) throw new Error('la optimización de EVs no cuenta con el 30');
  // Con un IV par, 252 sobra: el escalón está en 248.
  if (!/248/.test(ent)) throw new Error('con el IV a 30 el corte debería caer en 248');
  console.log('       30 en Ataque: entra como pseudo 31, el plan lo dice y los EVs cortan en 248');

  await pagina.click('button[data-vista="inventario"]');
  await pagina.click('text=Vaciar el inventario');
  await pagina.waitForTimeout(200);
  const conf = pagina.locator('button', { hasText: 'Sí, vaciar' }).first();
  if (await conf.count()) await conf.click();
  await pagina.waitForTimeout(200);
  await pagina.click('text=Borrar');
  await pagina.waitForTimeout(250);
  await pagina.click('.crianza:has-text("Larvitar")');
  await pagina.waitForTimeout(150);
});

await paso('ningún texto por debajo del contraste mínimo', async () => {
  const audita = () => pagina.evaluate(() => {
    const lum = (c) => {
      const [r, g, b] = c.map((v) => v / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const num = (t) => t.match(/[\d.]+/g)?.map(Number) ?? null;
    const mezcla = (a, b, alfa) => a.map((v, i) => v * alfa + b[i] * (1 - alfa));
    const fondoDe = (n) => {
      for (let e = n; e; e = e.parentElement) {
        const c = num(getComputedStyle(e).backgroundColor);
        if (c && (c[3] === undefined || c[3] > 0.95)) return c.slice(0, 3);
      }
      return [255, 255, 255];
    };
    const malos = [];
    for (const n of document.querySelectorAll('body *')) {
      if (![...n.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
      const e = getComputedStyle(n);
      if (e.visibility === 'hidden' || e.display === 'none' || Number(e.opacity) < 0.5) continue;
      if (!n.getClientRects().length) continue;
      const col = num(e.color);
      if (!col) continue;
      const fondo = fondoDe(n);
      const frente = col[3] !== undefined && col[3] < 1 ? mezcla(col.slice(0, 3), fondo, col[3]) : col.slice(0, 3);
      const a = lum(frente); const z = lum(fondo);
      const r = (Math.max(a, z) + 0.05) / (Math.min(a, z) + 0.05);
      const px = parseFloat(e.fontSize);
      const minimo = (px >= 24 || (px >= 18.66 && Number(e.fontWeight) >= 700)) ? 3 : 4.5;
      if (r < minimo)
        malos.push(`${r.toFixed(2)}:1 (mín ${minimo}) ${px}px <${n.tagName.toLowerCase()} class="${n.className}"> "${n.textContent.trim().slice(0, 40)}"`);
    }
    return malos;
  });

  await pagina.click('text=+ Nueva');
  await pagina.click('button[data-vista="objetivo"]');
  await pagina.waitForSelector('#especie');
  await pagina.fill('#especie', 'Magikarp');
  await confirmarCampo('#especie');
  await pagina.check('#iv-ps');
  await pagina.check('#iv-ataque');
  await pagina.fill('#ev-ataque', '250');
  await pagina.dispatchEvent('#ev-ataque', 'change');
  await pagina.waitForTimeout(400);

  const malos = [];
  let medidos = 0;
  for (const vista of ['objetivo', 'plan', 'inventario', 'capturas', 'entrenamiento']) {
    await pagina.click(`button[data-vista="${vista}"]`);
    await pagina.waitForTimeout(350);
    // Con los plegables abiertos: lo escondido también se lee cuando se abre.
    // Sólo los cerrados — un clic a ciegas CERRABA los que ya estaban abiertos,
    // y como el estado se recuerda entre repintados, las pruebas de después se
    // encontraban la vista distinta y fallaban.
    for (const sum of await pagina.locator('summary').all()) {
      try {
        if (!(await sum.evaluate((n) => n.parentElement.open))) await sum.click({ timeout: 700 });
      } catch { /* alguno desaparece al repintar */ }
    }
    await pagina.waitForTimeout(300);
    const m = await audita();
    medidos += await pagina.evaluate(() => document.querySelectorAll('#vista *').length);
    malos.push(...m.map((x) => `${vista}: ${x}`));
  }
  await pagina.click('text=Borrar');
  await pagina.waitForTimeout(250);
  await pagina.click('.crianza:has-text("Larvitar")');
  await pagina.waitForTimeout(150);

  if (malos.length) throw new Error(`${malos.length} por debajo del mínimo:\n       ` + malos.slice(0, 6).join('\n       '));
  console.log(`       ~${medidos} elementos medidos en 5 vistas, todos por encima del mínimo`);
});


await paso('cada Pokémon sale con su sprite, y el que no lo tenga deja su hueco', async () => {
  // La crianza de Larvitar ya está montada por las pruebas de arriba, así que
  // hay objetivo, plan y capturas que mirar sin volver a rellenar nada.
  const sprites = JSON.parse(readFileSync(new URL('../datos/sprites.json', import.meta.url), 'utf8'));

  const visto = new Map();
  for (const vista of ['objetivo', 'plan', 'capturas', 'entrenamiento', 'inventario']) {
    await pagina.click(`button[data-vista="${vista}"]`);
    await pagina.waitForTimeout(300);
    // `data-sprite` sólo está en las que no han cargado, y guarda su URL buena:
    // sin red se comprueban igual que con ella.
    for (const [alt, src] of await pagina.$$eval(
      'img.sprite', (ns) => ns.map((n) => [n.alt, n.dataset.sprite ?? n.getAttribute('src')]),
    )) visto.set(`${vista}|${alt}|${src}`, [vista, alt, src]);
  }

  if (visto.size < 5) throw new Error(`sólo ${visto.size} sprites en cinco vistas`);

  // Que la URL sea la que dice la wiki, no una inventada ni la de otra especie.
  // Esto se comprueba SIEMPRE, cargue la imagen o no: es lo que puede romper un
  // cambio de código, y no depende de tener red.
  for (const [, [vista, alt, src]] of visto) {
    const especie = alt.replace(/ (hembra|macho)$/, '');
    const entrada = sprites.de[especie];
    if (!entrada) throw new Error(`${vista}: "${alt}" no es una especie de datos/sprites.json`);
    if (!src.startsWith(sprites.base)) throw new Error(`${vista}: ${especie} apunta fuera del volcado (${src})`);
    const rel = src.slice(sprites.base.length);
    if (!Object.values(entrada).includes(rel))
      throw new Error(`${vista}: ${especie} lleva "${rel}", que no es ninguna de sus imágenes`);
  }

  // El objetivo es Larvitar: su sprite tiene que estar en Objetivo, y grande.
  const delObjetivo = [...visto.values()].filter(([v, alt]) => v === 'objetivo' && alt === 'Larvitar');
  if (!delObjetivo.length) throw new Error('Objetivo no enseña el sprite de Larvitar');

  // Y sin red la app no se queda con la imagen rota: pone el hueco. En una
  // máquina con salida a internet no habrá ninguno, y eso también vale.
  const rotos = await pagina.$$eval(
    'img.sprite',
    (ns) => ns.filter((n) => n.complete && !n.naturalWidth && !n.dataset.sprite).length,
  );
  if (rotos) throw new Error(`${rotos} imágenes rotas sin marcar como hueco`);

  console.log(`       ${visto.size} sprites en 5 vistas, todos con la URL de la wiki`);
});


await paso('un movimiento huevo llega hasta la captura, y dice cómo conseguirlo', async () => {
  // El caso real: Milotic con Neblina. El movimiento es de Feebas —la forma
  // base—, lo pasa el padre y el plan tiene que pedirlo en una captura concreta.
  await pagina.click('text=+ Nueva');
  await pagina.click('button[data-vista="objetivo"]');
  await pagina.waitForSelector('#especie');
  await pagina.fill('#especie', 'Milotic');
  await confirmarCampo('#especie');
  await pagina.waitForTimeout(400);
  await pagina.check('#iv-ps');
  await pagina.check('#iv-defensa');
  await pagina.waitForSelector('#nuevo-mov');
  await pagina.fill('#nuevo-mov', 'Neblina');
  await confirmarCampo('#nuevo-mov');
  await pagina.waitForTimeout(600);

  await pagina.click('button[data-vista="plan"]');
  await pagina.waitForTimeout(500);
  const faltan = await pagina.textContent('.tarjeta:has-text("Ahora mismo")');
  if (!/con Neblina/.test(faltan))
    throw new Error(`ningún padre pide el movimiento: ${faltan.replace(/\s+/g, ' ').slice(0, 220)}`);
  // Y el hueco que lo pide es ♂: el movimiento huevo lo pasa el padre.
  const fila = await pagina.locator('tr', { hasText: 'con Neblina' }).first().textContent();
  if (!/♂/.test(fila)) throw new Error(`el hueco del movimiento debería ser ♂: ${fila.replace(/\s+/g, ' ')}`);

  // La tarjeta de movimientos ya no dice que Milotic no lo aprenda.
  const vista = await pagina.textContent('#vista');
  if (/no aprende Neblina/.test(vista)) throw new Error('sigue diciendo que Milotic no aprende Neblina');

  await pagina.click('button[data-vista="capturas"]');
  await pagina.waitForTimeout(600);
  const capturas = await pagina.textContent('#vista');
  if (!/tiene que pasar Neblina/.test(capturas))
    throw new Error('Capturas no dice que ese hueco tenga que pasar el movimiento');
  if (!/(lo aprende al|se le enseña con|se lo da el tutor|sólo de huevo)/.test(capturas))
    throw new Error('Capturas no dice CÓMO se consigue el movimiento');
  const quien = (capturas.match(/([A-Z][a-zé]+): (lo aprende al nivel \d+|se le enseña con la MT\/MO|se lo da el tutor)/) ?? [])[0];
  console.log(`       Neblina: pedida en una captura ♂ · ${(quien ?? 'sin detalle').trim()}`);

  await pagina.click('text=Borrar');
  await pagina.waitForTimeout(250);
  await pagina.click('.crianza:has-text("Larvitar")');
  await pagina.waitForTimeout(200);
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
  await pagina.waitForSelector('text=Vacío: anota lo que tengas', { timeout: 5000 });

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
  await pagina.waitForSelector('text=Vacío: anota lo que tengas', { timeout: 5000 });
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
  // La fila lleva dos botones: «Editar» y «Quitar». Se pide el segundo por su
  // texto, no por posición, que es lo que se rompió al añadir el primero.
  await pagina.click('.tarjeta:has-text("Revisar antes de guardar") tbody tr:nth-child(2) button:text-is("Quitar")');
  await pagina.waitForSelector('text=Revisar antes de guardar · 2', { timeout: 5000 });

  const antes = await contarInventario();
  await pagina.click('text=Guardar 2 en el inventario');
  await pagina.waitForTimeout(250);
  const despues = await contarInventario();
  if (despues !== antes + 2) throw new Error(`inventario ${antes} -> ${despues}, esperaba +2`);
  console.log(`       3 leídos, 1 quitado, inventario ${antes} -> ${despues}`);
});

await paso('en la revisión se corrige cada Pokémon por su cuenta', async () => {
  // El OCR se equivoca y los dedos también. Hasta ahora había que descartar la
  // tanda entera o pasar UNO al formulario; ahora cada fila se corrige en sitio.
  await pagina.click('button[data-vista="inventario"]');
  await pagina.click('text=📋 Texto');
  await pagina.waitForSelector('#texto-importar-inventario');
  await pagina.fill('#texto-importar-inventario', [
    'Magikarp ♂ Nv. 5',
    'IVs: 31/2/3/4/5/6',
    '',
    'Poliwag ♀ Nv. 5',
    'IVs: 7/8/9/10/11/12',
  ].join('\n'));
  await pagina.click('text=Leer el texto');
  await pagina.waitForSelector('text=Revisar antes de guardar · 2', { timeout: 5000 });

  const tarjeta = '.tarjeta:has-text("Revisar antes de guardar")';
  const fila2 = `${tarjeta} tbody tr:nth-child(2)`;
  await pagina.click(`${fila2} button:text-is("Editar")`);
  await pagina.waitForTimeout(250);

  // La especie se resuelve al confirmar, igual que al importar: se escribe mal
  // a propósito y tiene que salir el nombre bueno.
  const campos = pagina.locator(`${fila2} input[type="text"]`);
  await campos.first().fill('poliwhirl');
  await campos.first().dispatchEvent('change');
  await pagina.waitForTimeout(300);
  // Y un IV mal leído se arregla a mano.
  const numeros = pagina.locator(`${fila2} input[type="number"]`);
  await numeros.nth(1).fill('31');
  await numeros.nth(1).dispatchEvent('change');
  await pagina.waitForTimeout(300);

  await pagina.click(`${fila2} button:text-is("Listo")`);
  await pagina.waitForTimeout(300);
  const texto = (await pagina.textContent(fila2)).replace(/\s+/g, ' ');
  if (!/Poliwhirl/.test(texto)) throw new Error(`no ha resuelto la especie: ${texto}`);

  // La otra fila no se ha tocado: es lo que hace que corregir una no cueste la tanda.
  const fila1 = (await pagina.textContent(`${tarjeta} tbody tr:nth-child(1)`)).replace(/\s+/g, ' ');
  if (!/Magikarp/.test(fila1)) throw new Error(`la primera fila ha cambiado: ${fila1}`);

  const antesDe = await contarInventario();
  await pagina.click('text=Guardar 2 en el inventario');
  await pagina.waitForTimeout(300);
  await pagina.click('button[data-vista="inventario"]');
  await pagina.waitForTimeout(300);
  const lista = await pagina.textContent('.inventario-lista');
  if (!/Poliwhirl/.test(lista)) throw new Error('la corrección no ha llegado al inventario');
  if (!/31/.test(lista)) throw new Error('el IV corregido no ha llegado al inventario');
  console.log(`       fila 2 corregida a Poliwhirl con 31, la 1 intacta, inventario ${antesDe} -> ${await contarInventario()}`);
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

/**
 * El caso que reportó el usuario: criando un Garchomp con un Horsea ♂ 2×31 en
 * el inventario, el plan seguía pidiendo capturar una ♀ con 31 en Velocidad y
 * dejaba el Horsea sin usar. Ahora lo usa: cruza y paga el sexo de la cría.
 */
await paso('un 2×31 del sexo contrario deja de quedarse en la caja', async () => {
  await pagina.evaluate(() => {
    const cero = { ps: 0, ataque: 0, defensa: 0, ataqueEsp: 0, defensaEsp: 0, velocidad: 0 };
    localStorage.setItem('crianza-pokemmo:inventario:v1', JSON.stringify([
      { id: 'g1', especie: 'Gible', sexo: '♀', naturaleza: 'Osada',
        ivs: { ...cero, defensa: 31 }, evs: { ...cero }, movimientos: [] },
      { id: 'k1', especie: 'Magikarp', sexo: '♂', naturaleza: 'Huraña',
        ivs: { ...cero, ataque: 31 }, evs: { ...cero }, movimientos: [] },
      { id: 'k2', especie: 'Magikarp', sexo: '♂', naturaleza: 'Plácida',
        ivs: { ...cero, velocidad: 31 }, evs: { ...cero }, movimientos: [] },
      { id: 'k3', especie: 'Magikarp', sexo: '♂', naturaleza: 'Alegre',
        ivs: { ...cero }, evs: { ...cero }, movimientos: [] },
      { id: 'h1', especie: 'Horsea', sexo: '♂', naturaleza: 'Afable',
        ivs: { ...cero, ataque: 31, velocidad: 31 }, evs: { ...cero }, movimientos: [] },
    ]));
  });
  // Tras recargar, la app vuelve a la vista que estuviera guardada, que no
  // tiene por qué ser Objetivo: hay que pedirla.
  await pagina.reload({ waitUntil: 'networkidle' });
  await pagina.waitForSelector('#pestanas button', { timeout: 15000 });
  await pagina.click('text=+ Nueva');
  await pagina.click('button[data-vista="objetivo"]');
  await pagina.waitForSelector('#especie', { timeout: 10000 });
  await pagina.fill('#especie', 'Garchomp');
  await confirmarCampo('#especie');
  await pagina.check('#iv-ataque');
  await pagina.check('#iv-velocidad');
  await pagina.fill('#naturaleza', 'Alegre');
  await confirmarCampo('#naturaleza');
  await pagina.waitForTimeout(500);

  await pagina.click('button[data-vista="plan"]');
  await pagina.waitForTimeout(500);
  const t = await pagina.textContent('#vista');
  if (!/0 padres por conseguir/.test(t))
    throw new Error(`debería salir sin capturas: ${(t.match(/\d+ padres por conseguir/) ?? ['—'])[0]}`);
  await abrir('Todos los pasos');
  const pasos = await pagina.textContent('#vista');
  if (!/Horsea/.test(pasos)) throw new Error('el Horsea sigue sin aparecer en los pasos');
  // La Piedraeterna acaba en la madre para que el Horsea entre tal cual.
  if (!/La Piedraeterna la lleva la madre/.test(pasos))
    throw new Error('no explica dónde va la Piedraeterna');
  console.log('       Garchomp + Horsea ♂ 2×31: entra en el cruce final y el plan sale sin capturas');

});


await paso('el 31 en Defensa del Gible se dice, y se puede conservar', async () => {
  // Sigue el mismo montaje de la prueba de arriba: Garchomp 2×31 Alegre con el
  // Gible ♀ que además trae 31 en Defensa, que nadie pidió.
  await abrir('IVs de regalo');
  const t = await pagina.textContent('#vista');
  if (!/Defensa a 31/.test(t)) throw new Error('la tarjeta no nombra el regalo');
  if (!/Lo trae Gible/.test(t)) throw new Error('no dice quién lo trae');
  if (!/a suerte: \d+ %/.test(t)) throw new Error(`no dice a qué se juega: ${t.slice(0, 200)}`);
  const precio = (t.match(/cuesta ([^]{0,60}?PokéYen)/) ?? [])[1];
  if (!precio) throw new Error('no dice lo que costaría conservarlo');

  const antes = await pagina.textContent('.tarjeta h2');
  await pagina.click('button:text-is("Conservar Defensa")');
  await pagina.waitForTimeout(700);
  const despues = await pagina.textContent('.tarjeta h2');
  if (!/3×31/.test(despues) || !/Defensa/.test(despues))
    throw new Error(`el objetivo no ha crecido: "${antes}" -> "${despues}"`);

  // Y se puede soltar, volviendo al plan de antes.
  await abrir('IVs de regalo');
  await pagina.click('text=Dejar de conservar Defensa');
  await pagina.waitForTimeout(700);
  const final = await pagina.textContent('.tarjeta h2');
  if (final !== antes) throw new Error(`no ha vuelto: "${antes}" -> "${final}"`);
  console.log(`       Defensa: se pierde, conservarla cuesta ${precio.replace(/\s+/g, ' ')}`);

  // Es la última prueba: no hace falta devolver el estado a su sitio, sólo no
  // dejar el inventario sembrado en el navegador de la siguiente tanda.
  await pagina.evaluate(() => localStorage.removeItem('crianza-pokemmo:inventario:v1'));
});

await paso('un inicial de señuelo lo dice en Capturas y en el presupuesto', async () => {
  // Chimchar sólo sale en encuentros de señuelo, así que Infernape arrastra esa
  // vía entera: la app no puede proponerlo como si fuera una captura normal.
  await pagina.click('button[data-vista="objetivo"]');
  await pagina.waitForSelector('#especie', { timeout: 10000 });
  // Chimchar sólo vive en Sinnoh, y una prueba anterior deja regiones apagadas.
  await abrir('Regiones desbloqueadas');
  for (const r of ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova']) await pagina.check(`#region-${r}`);
  await pagina.fill('#especie', 'Infernape');
  await confirmarCampo('#especie');
  await pagina.check('#iv-ataque');
  await pagina.check('#iv-velocidad');
  await pagina.waitForTimeout(400);

  await pagina.click('button[data-vista="capturas"]');
  await pagina.waitForTimeout(500);
  const cap = await pagina.textContent('#vista');
  if (!/sólo con señuelo/.test(cap)) throw new Error('Capturas no marca que hace falta señuelo');
  if (!/consumible/.test(cap)) throw new Error('no dice que el señuelo se gasta');

  await pagina.click('button[data-vista="plan"]');
  await pagina.waitForTimeout(500);
  const plan = await pagina.textContent('#vista');
  if (!/Señuelos:/.test(plan)) throw new Error('el presupuesto no trae el bloque de señuelos');
  if (!/600 PokéYen/.test(plan)) throw new Error('no dice lo que cuesta un señuelo');
  if (!/No entra en el total/.test(plan)) throw new Error('no dice por qué queda fuera del total');
  console.log('       Chimchar: señuelo marcado en Capturas y con precio en el presupuesto');
});

await paso('Alpha y variocolor cambian el árbol entero, y se dice dónde', async () => {
  await pagina.click('button[data-vista="objetivo"]');
  await pagina.waitForSelector('#especie', { timeout: 10000 });
  await pagina.fill('#especie', 'Gible');
  await confirmarCampo('#especie');
  await pagina.waitForTimeout(400);

  // Alpha: Garchomp está en los enjambres, así que es posible y sale la nota.
  await pagina.check('#var-alpha');
  await pagina.waitForTimeout(500);
  const conAlpha = await pagina.textContent('#vista');
  if (!/dos padres de cada cruce tienen que ser Alpha/.test(conAlpha))
    throw new Error('Objetivo no explica la regla de los dos padres Alpha');

  await pagina.click('button[data-vista="capturas"]');
  await pagina.waitForTimeout(500);
  const capAlpha = await pagina.textContent('#vista');
  if (!/enjambres/.test(capAlpha)) throw new Error('Capturas no manda a los enjambres');
  if (!/tasa de captura 10/.test(capAlpha)) throw new Error('no dice que la tasa no es la de la especie');

  // Variocolor: cada captura pasa a costar los 24.000 encuentros.
  await pagina.click('button[data-vista="objetivo"]');
  await pagina.waitForTimeout(300);
  await pagina.uncheck('#var-alpha');
  await pagina.check('#var-shiny');
  await pagina.waitForTimeout(500);
  const conShiny = await pagina.textContent('#vista');
  if (!/24.000 encuentros/.test(conShiny)) throw new Error(`Objetivo no dice el coste: ${conShiny.slice(0, 200)}`);

  await pagina.click('button[data-vista="capturas"]');
  await pagina.waitForTimeout(500);
  const capShiny = await pagina.textContent('#vista');
  if (!/no cría con uno que no lo es/.test(capShiny))
    throw new Error('Capturas no explica por qué toda la cadena es variocolor');

  // Y una línea que sólo se repartió una vez no es una vía: se dice y no se planea.
  await pagina.click('button[data-vista="objetivo"]');
  await pagina.waitForTimeout(300);
  await pagina.uncheck('#var-shiny');
  await pagina.fill('#especie', 'Venusaur');
  await confirmarCampo('#especie');
  await pagina.check('#var-alpha');
  await pagina.waitForTimeout(600);
  const imposible = await pagina.textContent('#vista');
  if (!/una sola vez/.test(imposible)) throw new Error('no avisa de que Venusaur Alpha no vuelve');
  await pagina.uncheck('#var-alpha');
  await pagina.waitForTimeout(300);
  console.log('       Gible Alpha a los enjambres, variocolor a 24.000, y Venusaur Alpha dicho como imposible');
});

async function contarInventario() {
  const t = await pagina.textContent('.inventario-lista');
  return Number((t.match(/Tu inventario · (\d+)/) ?? [0, 0])[1]);
}

await navegador.close();

console.log('');
if (spritesSinRed)
  console.log(`(${spritesSinRed} sprites no han cargado: ${HOST_SPRITES} no es alcanzable desde aquí. `
    + 'La app deja su hueco y sigue; el `src` sí se ha comprobado.)');
if (errores.length) {
  console.log(`${errores.length} problema(s):`);
  for (const e of errores) console.log(`  - ${e}`);
  process.exit(1);
}
console.log('Todo en verde.');
