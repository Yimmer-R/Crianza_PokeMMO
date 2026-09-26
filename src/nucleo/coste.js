// Cuánto cuesta la cadena.
//
// Regla de honestidad de este módulo: sólo suma lo que la wiki documenta. Los
// precios de mercado del GTL NO están en la wiki, y no por olvido — es una
// decisión explícita suya, porque un precio guardado miente a los dos meses. Así
// que los padres que haya que comprar salen aparte, como "lo pones tú", y nunca
// mezclados con el total confirmado.

import {
  PRECIO_ELEGIR_SEXO, PRECIO_RESPALDO, PRECIO_GTL_OBSERVADO, NO_SE_VENDE_EN_TIENDA, SEXOS,
} from './constantes.js';
import { costeElegirSexo } from './compatibilidad.js';
import { ROL } from './planificador.js';

/** "10000 PokéYen" -> {cantidad: 10000, moneda: 'PokéYen'} · "1,000 RP" -> 1000 RP */
export function parsearPrecio(texto) {
  if (!texto) return null;
  const m = String(texto).match(/([\d.,]+)\s*(.*)$/);
  if (!m) return null;
  const cantidad = Number(m[1].replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'));
  if (!Number.isFinite(cantidad)) return null;
  return { cantidad, moneda: (m[2] || '').trim() || 'PokéYen' };
}

const ES_YEN = (moneda) => /yen/i.test(moneda);

/** 346000 -> "346.000". Se usa aquí y en las vistas. */
export const formatearYen = (n) => new Intl.NumberFormat('es-ES').format(Math.round(n));

/**
 * Precio en PokéYen de un objeto, leído de datos/objetos.json.
 *
 * Con una excepción que va primero: hay objetos que el volcado da como «se
 * vende en la guardería» y que jugando no están en ninguna tienda. Para esos el
 * precio bueno es el del GTL, y se devuelve marcado como estimación con su
 * fecha: es un precio de mercado y caduca. Ver `NO_SE_VENDE_EN_TIENDA`.
 */
export function precioEnYen(nombre, objetos) {
  if (NO_SE_VENDE_EN_TIENDA[nombre]) {
    const gtl = PRECIO_GTL_OBSERVADO[nombre];
    if (gtl)
      return {
        cantidad: gtl.ultimo,
        moneda: 'PokéYen',
        donde: 'GTL',
        fuente: 'estimado',
        porQue: NO_SE_VENDE_EN_TIENDA[nombre],
        observado: gtl,
      };
    return null;
  }

  for (const grupo of Object.values(objetos)) {
    const ficha = grupo?.[nombre];
    if (!ficha) continue;
    const enYen = (ficha.compra ?? [])
      .map((c) => ({ ...c, p: parsearPrecio(c.precio) }))
      .filter((c) => c.p && ES_YEN(c.p.moneda))
      .sort((a, b) => a.p.cantidad - b.p.cantidad)[0];
    if (enYen) return { cantidad: enYen.p.cantidad, moneda: 'PokéYen', donde: enYen.sitio, fuente: 'wiki' };

    const otra = (ficha.compra ?? [])
      .map((c) => ({ ...c, p: parsearPrecio(c.precio) }))
      .filter((c) => c.p)
      .sort((a, b) => a.p.cantidad - b.p.cantidad)[0];
    if (otra) return { cantidad: otra.p.cantidad, moneda: otra.p.moneda, donde: otra.sitio, fuente: 'wiki' };
  }
  if (PRECIO_RESPALDO[nombre] != null)
    return { cantidad: PRECIO_RESPALDO[nombre], moneda: 'PokéYen', donde: null, fuente: 'respaldo' };
  return null;
}

/**
 * Presupuesto del plan.
 *
 * Lo que entra en el total: los objetos de crianza (uno por padre y cruce, y se
 * consumen todos) y el pago por elegir el sexo de cada padre intermedio.
 * Lo que NO entra: los padres de 1×31, porque o se capturan (gratis, cuesta
 * tiempo) o se compran a un precio que sólo sabe el usuario.
 */
export function presupuestar(plan, datos, { pagarSexo = true } = {}) {
  if (!plan?.ok) return null;
  const { objetos, pokedex } = datos;

  const lineas = [];
  const objetosUsados = new Map();
  let yen = 0;
  const otrasMonedas = new Map();
  let hayEstimados = false;

  const suma = (nombre, cuantos) => {
    const precio = precioEnYen(nombre, objetos);
    objetosUsados.set(nombre, (objetosUsados.get(nombre) ?? 0) + cuantos);
    if (!precio) {
      lineas.push({ concepto: nombre, cuantos, coste: null, nota: 'la wiki no trae precio de compra' });
      return;
    }
    const total = precio.cantidad * cuantos;
    if (ES_YEN(precio.moneda)) yen += total;
    else otrasMonedas.set(precio.moneda, (otrasMonedas.get(precio.moneda) ?? 0) + total);
    if (precio.fuente === 'respaldo') hayEstimados = true;
    lineas.push({
      concepto: nombre, cuantos, precioUnidad: precio.cantidad, moneda: precio.moneda,
      coste: total, donde: precio.donde, fuente: precio.fuente,
    });
  };

  // 1. Objetos de crianza: dos por cruce, y se consumen.
  const porObjeto = new Map();
  (function recorre(n) {
    if (n.tipo === 'cruce') {
      // .filter(Boolean): el cruce que alarga la espina no lleva objeto en la
      // madre, que sólo aporta la especie.
      for (const o of [n.objetos.madre, n.objetos.padre].filter(Boolean))
        porObjeto.set(o, (porObjeto.get(o) ?? 0) + 1);
    }
    n.hijos.forEach(recorre);
  })(plan.arbol);
  for (const [nombre, cuantos] of [...porObjeto].sort()) suma(nombre, cuantos);

  // 2. Pago por el sexo de cada padre intermedio. La cría de cada cruce que no
  //    sea la final tiene que salir de un sexo concreto, y eso se paga o se
  //    reintenta. Se presupuesta pagando, que es el caso predecible.
  const pagosSexo = [];
  if (pagarSexo) {
    (function recorre(n) {
      if (n.tipo === 'cruce' && n.rol !== ROL.RAIZ && n.sexoNecesario) {
        const sexo = n.sexoNecesario;
        // Un hueco libre se cubre con la especie de relleno, más barata de sexar
        // que la objetivo cuando ésta tiene el sexo que hace falta en minoría.
        const especie = n.rol === ROL.LIBRE
          ? (plan.relleno?.[0]?.especie ?? plan.objetivo.especie)
          : plan.objetivo.especie;
        const c = costeElegirSexo(especie, sexo, pokedex, PRECIO_ELEGIR_SEXO);
        if (c) {
          pagosSexo.push({ nodo: n.id, especie, sexo, ...c });
          yen += c.precio;
          if (c.confianza === 'estimado') hayEstimados = true;
        }
      }
      n.hijos.forEach(recorre);
    })(plan.arbol);
  }

  if (pagosSexo.length) {
    const confirmados = pagosSexo.filter((p) => p.confianza === 'confirmado');
    const estimados = pagosSexo.filter((p) => p.confianza === 'estimado');
    if (confirmados.length)
      lineas.push({
        concepto: 'Elegir el sexo de la cría',
        cuantos: confirmados.length,
        coste: confirmados.reduce((a, p) => a + p.precio, 0),
        moneda: 'PokéYen', fuente: 'wiki',
      });
    if (estimados.length)
      lineas.push({
        concepto: 'Elegir el sexo de la cría (tramo no publicado)',
        cuantos: estimados.length,
        coste: estimados.reduce((a, p) => a + p.precio, 0),
        moneda: 'PokéYen', fuente: 'estimado',
        nota: 'la wiki sólo publica los extremos 5.000 y 25.000; este tramo es una estimación',
      });
  }

  // 3. Dónde conviene comprar cada objeto.
  const dondeComprar = comparaConElGtl(objetosUsados, objetos);

  // 4. Lo que no se puede presupuestar aquí.
  const padresQueComprar = plan.pasos.conseguir.length;

  return {
    lineas,
    dondeComprar,
    totalYen: yen,
    otrasMonedas: [...otrasMonedas].map(([moneda, cantidad]) => ({ moneda, cantidad })),
    objetosUsados: [...objetosUsados].map(([nombre, cuantos]) => ({ nombre, cuantos })),
    pagosSexo,
    hayEstimados,
    sinPrecio: {
      padres: padresQueComprar,
      nota: `Los ${padresQueComprar} padres de partida no van en el total: o los capturas (gratis, ` +
        `cuesta tiempo) o los compras en el GTL. La wiki no guarda precios de mercado a propósito, ` +
        `porque caducan en semanas, así que ese número lo pones tú.`,
    },
  };
}

/** Formatea 1234567 como "1.234.567". */

/**
 * De dónde sale el precio de cada objeto que tiene precio de mercado.
 *
 * Para la Piedraeterna no hay tienda: no se vende en ninguna, así que el número
 * del presupuesto **es** el del GTL, con su fecha y su rango. Se enseña aparte
 * porque un precio de mercado caduca y hay que volver a mirarlo; el resto del
 * presupuesto son precios de tienda, que no se mueven.
 */
export function comparaConElGtl(objetosUsados, objetos) {
  const salida = [];
  for (const [nombre, cuantos] of objetosUsados) {
    const gtl = PRECIO_GTL_OBSERVADO[nombre];
    if (!gtl) continue;
    const soloGtl = !!NO_SE_VENDE_EN_TIENDA[nombre];
    const precio = precioEnYen(nombre, objetos);
    if (!precio || !ES_YEN(precio.moneda)) continue;

    salida.push({
      objeto: nombre,
      cuantos,
      soloGtl,
      porQue: NO_SE_VENDE_EN_TIENDA[nombre] ?? null,
      // Lo que se está usando en el total, y a qué precio de mercado.
      usado: precio.cantidad,
      gtl,
      total: precio.cantidad * cuantos,
      consejo: soloGtl
        ? `No se vende en ninguna tienda: o la farmeas a Pokémon salvajes o la compras en el GTL. `
          + `El presupuesto usa ${formatearYen(gtl.ultimo)}, que es lo que valía el ${gtl.fecha}.`
        : `El GTL estaba a ${formatearYen(gtl.ultimo)} el ${gtl.fecha}; en la tienda, `
          + `${formatearYen(precio.cantidad)}.`,
    });
  }
  return salida;
}
