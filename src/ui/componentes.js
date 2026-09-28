// Ayudas de render. No hay framework: se construyen nodos y se pintan.

import { datosCargados } from '../datos/cargador.js';
import { urlSprite, altSprite, VIA_3D, VIA_ANIMADO } from '../nucleo/sprites.js';

/* eslint-disable no-use-before-define -- `el` se define aquí abajo. */

/** el('div.tarjeta', {onclick}, [hijos]) */
export function el(selector, props = {}, hijos = []) {
  const [etiqueta, ...clases] = selector.split('.');
  const nodo = document.createElement(etiqueta || 'div');
  if (clases.length) nodo.className = clases.join(' ');
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'html') nodo.innerHTML = v;
    else if (k === 'texto') nodo.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') nodo.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(nodo.dataset, v);
    else if (k in nodo && k !== 'list') nodo[k] = v;
    else nodo.setAttribute(k, v);
  }
  for (const h of [].concat(hijos)) {
    if (h == null || h === false) continue;
    nodo.append(typeof h === 'string' || typeof h === 'number' ? String(h) : h);
  }
  return nodo;
}

export const frag = (hijos) => {
  const f = document.createDocumentFragment();
  for (const h of [].concat(hijos)) if (h != null && h !== false) f.append(h);
  return f;
};

export const tarjeta = (titulo, hijos, clase = '') =>
  el(`section.tarjeta${clase ? `.${clase}` : ''}`, {}, [titulo ? el('h2', { texto: titulo }) : null, ...[].concat(hijos)]);

export const chip = (texto, clase = '') => el(`span.chip${clase ? `.${clase}` : ''}`, { texto });

export { VIA_3D, VIA_ANIMADO };

/** Un píxel transparente: lo que se le pone a una imagen que no ha cargado para
 *  que el navegador no pinte su icono de rota. */
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * La imagen de un Pokémon.
 *
 * Sale de `datos/sprites.json`, que a su vez sale de `wiki/sprites/`: el
 * componente no sabe ni de dónde se sirven ni cómo se arma la URL, eso es de
 * `src/nucleo/sprites.js`. Aquí sólo se decide el tamaño y qué hacer cuando no
 * hay imagen.
 *
 * **Cuando no la hay, se dice.** Ni se pone la de otra especie ni se deja el
 * icono de imagen rota del navegador: queda un hueco con las dos primeras
 * letras y un `title` que explica por qué. Es la regla 2 del repositorio.
 *
 * @param {string} especie nombre en inglés, como en la pokédex
 * @param {Object} opciones `sexo` pinta la variante hembra en las 97 especies
 *   que la tienen; `tam` es 'mini' | 'normal' | 'grande'; `via` es el render 3D
 *   (por defecto) o el sprite animado de 5ª generación.
 */
export function sprite(especie, { sexo = null, tam = 'normal', via = VIA_3D } = {}) {
  // El hueco NO lleva texto dentro, y no es un descuido: el sprite va pegado al
  // nombre en tablas, chips y sugerencias, y dos letras más dentro del mismo
  // elemento ensucian su `textContent` — bastó para que una sugerencia dejara de
  // decir «Rattata» y empezara a decir «RARattata». Lo que explica el hueco es
  // el `title`, y quien lee con lector de pantalla tiene el nombre al lado.
  const hueco = (motivo) => el(`span.sprite.sprite-${tam}.sprite-hueco`, {
    title: motivo, 'aria-hidden': 'true',
  });
  if (!especie) return hueco('sin especie');

  const sprites = datosCargados()?.sprites;
  const url = urlSprite(especie, sprites, { sexo, via });
  if (!url) return hueco(`${especie}: no tengo su imagen`);

  return el(`img.sprite.sprite-${tam}`, {
    src: url,
    alt: altSprite(especie, sprites, sexo),
    loading: 'lazy',
    decoding: 'async',
    // Las imágenes viven fuera (el volcado de PokeAPI), así que sin red no
    // llegan. Eso no es un error de la app: la imagen se queda como el mismo
    // hueco, en el sitio. No se SUSTITUYE el nodo a propósito — así conserva su
    // `alt` para quien lee con lector de pantalla y su URL en `data-sprite`,
    // que es lo que comprueba la prueba de navegador aunque no haya red.
    onerror: (ev) => {
      const img = ev.target;
      if (img.dataset.sprite) return;
      img.dataset.sprite = url;
      img.title = `${especie}: no he podido cargar su sprite`;
      img.classList.add('sprite-hueco');
      img.src = PIXEL;
    },
  });
}

/** Sprite + nombre en una línea, que es como se lee un Pokémon en casi todas las vistas. */
export const conSprite = (especie, textoOpcional = null, opciones = {}) =>
  el('span.con-sprite', {}, [sprite(especie, opciones), el('span', { texto: textoOpcional ?? especie })]);

/**
 * Qué plegables ha abierto el usuario, por título.
 *
 * Hace falta porque la app repinta la vista entera en cada cambio: sin esto,
 * abrir «Todos los pasos» y marcar un paso volvía a cerrarlo, y había que
 * abrirlo otra vez en cada cruce. Vive aquí y no en el estado global porque no
 * es un dato de la crianza y no tiene que persistir entre sesiones.
 */
const abiertos = new Set();

/**
 * Una tarjeta plegada: mismo aire, pero cerrada hasta que hace falta.
 *
 * Es lo que mantiene las pantallas cortas. Lo que se guarda aquí es lo
 * secundario —importar, el árbol entero, la copia de seguridad—, nunca el
 * control principal de una vista.
 *
 * @param {string} titulo lo que se lee siempre
 * @param {Object} opciones `extra` es la aclaración pequeña al lado del título;
 *   `pequeno` lo pinta como una línea dentro de una tarjeta en vez de como
 *   tarjeta propia; `id` distingue dos plegables con el mismo título.
 */
export function plegable(titulo, hijos, { extra = null, abierto = false, pequeno = false, id = null } = {}) {
  const clave = id ?? titulo;
  return el(pequeno ? 'details.pequeno' : 'details.tarjeta.plegable', {
    open: abiertos.has(clave) || abierto,
    ontoggle: (ev) => {
      if (ev.target.open) abiertos.add(clave);
      else abiertos.delete(clave);
    },
  }, [
    el(pequeno ? 'summary.mas' : 'summary', {},
      [titulo, extra ? el('span.sumario-extra', { texto: ` · ${extra}` }) : null]),
    ...[].concat(hijos),
  ]);
}

export const aviso = (texto, clase = 'aviso') => el(`div.${clase}`, {}, [texto]);

export function lista(clase, items) {
  return el(`ul.${clase}`, {}, items.map((x) => (x instanceof Node ? x : el('li', {}, [x]))));
}

/** Tabla con cabecera. `filas` es un array de arrays de celdas. */
export function tabla(cabeceras, filas, alinearNum = []) {
  if (!filas.length) return el('p.vacio', { texto: 'Nada que mostrar.' });
  return el('div.desliza', {}, [
    el('table', {}, [
      el('thead', {}, [el('tr', {}, cabeceras.map((c, i) =>
        el(`th${alinearNum.includes(i) ? '.num' : ''}`, {}, [c])))]),
      el('tbody', {}, filas.map((f) =>
        el('tr', {}, f.map((c, i) =>
          el(`td${alinearNum.includes(i) ? '.num' : ''}`, {}, [c instanceof Node ? c : String(c ?? '')]))))),
    ]),
  ]);
}

/**
 * Campo de texto con autocompletado propio.
 *
 * Antes esto usaba `<datalist>`, y en el móvil no servía: en Android Chrome la
 * flecha aparece pero no lista nada, y encima el `autocomplete="off"` que llevaba
 * suprime las sugerencias del datalist en varios navegadores. Resultado: había
 * que escribir el nombre entero a mano, con 667 especies y 559 movimientos.
 *
 * Así que la lista se pinta a mano. Dos cosas importantes de este componente:
 *
 * 1. **Filtra sin tocar el estado global.** Escribir sólo mueve DOM de aquí
 *    dentro; `onChange` se llama al CONFIRMAR (tocar una opción, Enter, o salir
 *    del campo). Si cada tecla disparase un repintado de la vista, el campo
 *    perdería el foco y la página daría un salto en cada letra.
 * 2. **Al enfocar ya enseña opciones**, sin escribir nada. En el móvil es la
 *    diferencia entre descubrir que hay lista y creer que está roto.
 *
 * @param {string[]} opciones lista completa de valores posibles
 * @param {(valor: string) => void} onChange se llama al confirmar
 * @param {{placeholder?: string, cuantas?: number, exigirDeLaLista?: boolean}} extra
 */
export function campoConSugerencias(id, etiqueta, valor, opciones, onChange, extra = {}) {
  // Se acepta una cadena como sexto argumento por compatibilidad: era el placeholder.
  // `conSprites` es para los campos de ESPECIE: cada sugerencia lleva su cara.
  // No se activa solo porque el campo no sabe qué lista le han dado — la misma
  // función sirve para movimientos, naturalezas y habilidades.
  const { placeholder = '', cuantas = 30, exigirDeLaLista = false, conSprites = false } =
    typeof extra === 'string' ? { placeholder: extra } : extra;

  const lista = el('ul.sug-lista', { hidden: true, role: 'listbox' });

  const entrada = el('input', {
    id,
    value: valor ?? '',
    placeholder,
    type: 'text',
    // 'off' rompía el datalist; ahora la lista es nuestra, pero se siguen
    // desactivando corrector y mayúscula automática, que en el móvil estorban.
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: false,
    role: 'combobox',
    'aria-expanded': 'false',
    'aria-autocomplete': 'list',
  });

  let resaltado = -1;
  let visibles = [];

  // Valor con el que se pintó el campo. Confirmar algo idéntico no avisa al
  // estado: sin eso, la app entra en bucle. Ver confirmar().
  const valorInicial = String(valor ?? '').trim();
  let yaConfirmado = false;

  const cerrar = () => {
    lista.hidden = true;
    lista.replaceChildren();
    entrada.setAttribute('aria-expanded', 'false');
    resaltado = -1;
  };

  /**
   * Confirma el valor del campo, con dos guardas que no son paranoia.
   *
   * Al repintar, la vista entera se reemplaza y el navegador dispara `blur`
   * sobre el input que se está QUITANDO del DOM. Sin guardas eso confirmaba otra
   * vez -> repintaba -> volvía a disparar blur: bucle infinito que congelaba la
   * página. Pasó, y desde fuera parecía que la app no cargaba.
   *
   * 1. si el elemento ya no está en el documento, no hay nada que confirmar;
   * 2. si el valor no ha cambiado respecto al que se pintó, no se avisa al
   *    estado. El input recién pintado siempre cumple esto, así que el ciclo se
   *    corta solo aunque el navegador dispare el blur.
   *
   * Y una vez por instancia: tras confirmar, el repintado trae un campo nuevo.
   */
  const confirmar = (texto) => {
    if (yaConfirmado || !entrada.isConnected) return;
    const limpio = String(texto ?? '').trim();
    entrada.value = texto;
    cerrar();
    if (limpio === valorInicial) return;
    yaConfirmado = true;
    onChange(limpio);
  };

  const pintarLista = (encontradas) => {
    visibles = encontradas;
    if (!encontradas.length) { cerrar(); return; }
    lista.replaceChildren(...encontradas.map((o, i) => el('li', {}, [
      el(`button.sug-opcion${i === resaltado ? '.resaltada' : ''}`, {
        type: 'button',
        role: 'option',
        // mousedown/touchstart va antes que el blur del input: con click se
        // cerraría la lista antes de que llegara el evento.
        onmousedown: (ev) => { ev.preventDefault(); confirmar(o); },
        ontouchstart: (ev) => { ev.preventDefault(); confirmar(o); },
        // El nombre va como texto suelto del botón, NO envuelto en un <span>:
        // el motor de texto de Playwright busca el elemento MÁS PEQUEÑO que
        // contiene la cadena, y con el envoltorio `.sug-opcion:text-is("…")`
        // deja de encontrar nada. En flex un nodo de texto se comporta igual.
      }, conSprites ? [sprite(o, { tam: 'mini' }), o] : [o]),
    ])));
    lista.hidden = false;
    entrada.setAttribute('aria-expanded', 'true');
  };

  const filtrar = (texto) => {
    const k = normalizarBusqueda(texto);
    if (!k) return opciones.slice(0, cuantas);
    const empiezan = [];
    const contienen = [];
    for (const o of opciones) {
      const n = normalizarBusqueda(o);
      if (n.startsWith(k)) empiezan.push(o);
      else if (n.includes(k)) contienen.push(o);
      if (empiezan.length >= cuantas) break;
    }
    return [...empiezan, ...contienen].slice(0, cuantas);
  };

  entrada.addEventListener('input', () => { resaltado = -1; pintarLista(filtrar(entrada.value)); });

  // Se abre al TOCAR el campo, no al recibir el foco. La diferencia importa: tras
  // elegir una opción, el repintado devuelve el foco al campo, y con 'focus' la
  // lista se reabría sola —y en el móvil dejaba el teclado abierto— justo después
  // de haber elegido. 'pointerdown' sólo lo dispara una persona.
  //
  // Y se abre con la lista COMPLETA, no filtrada por lo que ya hay escrito: si
  // tocas un campo que ya dice "Larvitar" es porque quieres cambiarlo, y
  // enseñarte sólo "Larvitar" no sirve de nada. Se selecciona el texto para que
  // la primera tecla lo sustituya en vez de pegarse a lo que había.
  entrada.addEventListener('pointerdown', () => {
    pintarLista(filtrar(''));
    if (entrada.value) {
      // Aplazado: el navegador coloca el cursor después del pointerdown, así que
      // seleccionar antes no sirve de nada.
      setTimeout(() => { try { entrada.select(); } catch { /* da igual */ } }, 0);
    }
  });

  entrada.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (lista.hidden) { pintarLista(filtrar(entrada.value)); return; }
      resaltado = ev.key === 'ArrowDown'
        ? Math.min(resaltado + 1, visibles.length - 1)
        : Math.max(resaltado - 1, 0);
      pintarLista(visibles);
      lista.querySelector('.resaltada')?.scrollIntoView({ block: 'nearest' });
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      const elegida = visibles[resaltado] ?? visibles[0];
      if (elegida) confirmar(elegida);
      else if (!exigirDeLaLista) confirmar(entrada.value);
    } else if (ev.key === 'Escape') {
      cerrar();
    }
  });

  entrada.addEventListener('blur', () => {
    // Al salir del campo se confirma lo escrito aunque no se haya tocado la
    // lista: el usuario tiene que poder escribirlo a mano y que valga.
    if (!entrada.isConnected) { cerrar(); return; }
    const texto = entrada.value.trim();
    const exacta = opciones.find((o) => normalizarBusqueda(o) === normalizarBusqueda(texto));
    if (exacta) { confirmar(exacta); return; }
    if (exigirDeLaLista) { cerrar(); return; }
    confirmar(texto);
  });

  return el('div.crece.campo-sug', {}, [
    el('label', { for: id, texto: etiqueta }),
    el('div.sug-caja', {}, [entrada, lista]),
  ]);
}

/** Comparación sin tildes ni mayúsculas, para filtrar. */
function normalizarBusqueda(txt) {
  return String(txt ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Interruptor con etiqueta: se usa para IVs y regiones. */
export function interruptor(id, etiqueta, activo, onChange) {
  const input = el('input', {
    type: 'checkbox', id, checked: !!activo,
    onchange: (e) => onChange(e.target.checked),
  });
  return el('label.iv', { for: id }, [input, el('span', { texto: etiqueta })]);
}

export const numero = (n) => new Intl.NumberFormat('es-ES').format(n);

/** "1 de cada 1.024 intentos" */
export const comoOportunidad = (intentos) =>
  !Number.isFinite(intentos) ? 'imposible' : `1 de cada ${numero(intentos)}`;
