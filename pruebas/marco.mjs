// Marco de pruebas mínimo, sin dependencias. Separado del corredor a propósito:
// si las aserciones viviesen en ejecutar.mjs, cada archivo de pruebas importaría
// al corredor mientras el corredor lo está importando a él, y el import circular
// deja el `await import` colgado sin decir por qué.

export const estado = { pasadas: 0, fallos: [], bloqueActual: '' };

export function bloque(nombre, fn) {
  estado.bloqueActual = nombre;
  fn();
}

export function prueba(nombre, fn) {
  const etiqueta = `${estado.bloqueActual} › ${nombre}`;
  try {
    fn();
    estado.pasadas++;
  } catch (e) {
    estado.fallos.push({ nombre: etiqueta, error: e });
  }
}

export function igual(actual, esperado, mensaje = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(esperado);
  if (a !== b) throw new Error(`${mensaje}\n    esperaba: ${b}\n    recibido: ${a}`);
}

export function cerca(actual, esperado, tolerancia = 1e-9, mensaje = '') {
  if (Math.abs(actual - esperado) > tolerancia)
    throw new Error(`${mensaje}\n    esperaba: ${esperado} (±${tolerancia})\n    recibido: ${actual}`);
}

export function cierto(valor, mensaje = 'esperaba un valor verdadero') {
  if (!valor) throw new Error(mensaje);
}

export function falso(valor, mensaje = 'esperaba un valor falso') {
  if (valor) throw new Error(mensaje);
}
