// Ayudas de render. No hay framework: se construyen nodos y se pintan.

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

/** Campo de texto con lista de sugerencias (datalist nativo: sin dependencias). */
export function campoConSugerencias(id, etiqueta, valor, opciones, onChange, placeholder = '') {
  const listaId = `${id}-opciones`;
  return el('div.crece', {}, [
    el('label', { for: id, texto: etiqueta }),
    el('input', {
      id, value: valor ?? '', list: listaId, placeholder, autocomplete: 'off',
      onchange: (e) => onChange(e.target.value.trim()),
    }),
    el('datalist', { id: listaId }, opciones.map((o) => el('option', { value: o }))),
  ]);
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
