// Coste, entrenamiento, movimientos, habilidades y capturas: los módulos que
// rodean al planificador. Corren contra los datos reales.
import { bloque, prueba, igual, cerca, cierto, falso } from './marco.mjs';
import { datos, ivs } from './datos-de-prueba.mjs';
import { planear } from '../src/nucleo/planificador.js';
import { presupuestar, parsearPrecio, precioEnYen } from '../src/nucleo/coste.js';
import {
  planearEvs, validarEvs, VITAMINA_DE, BAYA_DE,
  puntosPorEvs, escalonInferior, escalonSiguiente, optimizarEvs,
} from '../src/nucleo/entrenamiento.js';
import { planearMovimientos, padresQuePasan, mejorVia } from '../src/nucleo/movimientos.js';
import { planearHabilidad, habilidadesDe } from '../src/nucleo/habilidades.js';
import { comoConseguir, planDeCapturas, dondeAparece, intentosEsperados } from '../src/nucleo/capturas.js';
import { REGIONES, SEXOS, STATS } from '../src/nucleo/constantes.js';

const TODAS = REGIONES;
const objetivoLarvitar = {
  especie: 'Larvitar',
  ivs: ivs({ ps: 31, ataque: 31, defensa: 31, velocidad: 31 }),
  evs: {}, movimientos: [], naturaleza: null,
};

bloque('coste: precios', () => {
  prueba('parsea los formatos de precio que trae la wiki', () => {
    igual(parsearPrecio('10000 PokéYen'), { cantidad: 10000, moneda: 'PokéYen' });
    igual(parsearPrecio('750 BP'), { cantidad: 750, moneda: 'BP' });
    igual(parsearPrecio('1,000 RP'), { cantidad: 1000, moneda: 'RP' });
    igual(parsearPrecio(null), null);
  });

  prueba('los objetos Recios cuestan 10.000 PokéYen, como dice su ficha', () => {
    const p = precioEnYen('Brazal Recio', datos.objetos);
    igual(p.cantidad, 10000);
    igual(p.moneda, 'PokéYen');
    igual(p.fuente, 'wiki');
  });

  prueba('la Piedraeterna cuesta 4.000 PokéYen', () => {
    igual(precioEnYen('Piedraeterna', datos.objetos).cantidad, 4000);
  });

  prueba('prefiere el precio en PokéYen antes que el de BP', () => {
    // La Pesa Recia se vende a 750 BP y a 10.000 PokéYen: debe coger el segundo.
    igual(precioEnYen('Pesa Recia', datos.objetos).moneda, 'PokéYen');
  });
});

bloque('coste: presupuesto de un plan', () => {
  const plan = planear(objetivoLarvitar, datos, { regionesDisponibles: TODAS });
  const pres = presupuestar(plan, datos);

  prueba('gasta dos objetos por cruce, porque se consumen los dos', () => {
    const total = pres.objetosUsados.reduce((a, o) => a + o.cuantos, 0);
    igual(total, 7 * 2, 'un 4×31 son 7 cruces');
  });

  prueba('el total en PokéYen es positivo y cuadra con las líneas', () => {
    const suma = pres.lineas
      .filter((l) => l.coste != null && (!l.moneda || /yen/i.test(l.moneda)))
      .reduce((a, l) => a + l.coste, 0);
    cerca(pres.totalYen, suma, 1, 'el total no cuadra con el desglose');
    cierto(pres.totalYen > 0);
  });

  prueba('los padres de partida quedan FUERA del total, porque la wiki no guarda precios', () => {
    igual(pres.sinPrecio.padres, 8);
    cierto(pres.sinPrecio.nota.includes('GTL'));
  });

  prueba('con naturaleza el presupuesto incluye Piedraeterna', () => {
    const conNat = planear({ ...objetivoLarvitar, naturaleza: 'Audaz' }, datos, { regionesDisponibles: TODAS });
    const p2 = presupuestar(conNat, datos);
    cierto(p2.objetosUsados.some((o) => o.nombre === 'Piedraeterna'), JSON.stringify(p2.objetosUsados));
  });

  prueba('una cadena de Chimchar marca los pagos de sexo de 25.000 (hembra al 12,5 %)', () => {
    const plan = planear(
      { especie: 'Chimchar', ivs: ivs({ ataque: 31, velocidad: 31, 'at-esp': 31 }), evs: {}, movimientos: [] },
      datos, { regionesDisponibles: TODAS },
    );
    const p = presupuestar(plan, datos);
    cierto(
      p.pagosSexo.some((x) => x.especie === 'Chimchar' && x.sexo === SEXOS.HEMBRA && x.precio === 25000),
      JSON.stringify(p.pagosSexo),
    );
  });
});

bloque('entrenamiento: EVs', () => {
  prueba('acepta el reparto clásico 252/252/6', () => {
    const v = validarEvs({ ataque: 252, velocidad: 252, ps: 6 });
    cierto(v.valido);
    igual(v.total, 510);
    igual(v.libres, 0);
  });

  prueba('rechaza pasarse de 510', () => falso(validarEvs({ ataque: 252, velocidad: 252, ps: 252 }).valido));

  prueba('propone hordas de la región disponible y calcula cuántas hacen falta', () => {
    const plan = planearEvs({ ataque: 252 }, {}, datos, { regionesDisponibles: ['Kanto'], objeto: 'Vínculo de Entrenamiento' });
    const ataque = plan.porStat.find((s) => s.stat === 'ataque');
    cierto(ataque.mejor, 'no ha encontrado ninguna horda de Ataque en Kanto');
    igual(ataque.mejor.region, 'Kanto');
    // 5 Pokémon por horda × EV de la especie × 2 por el objeto
    igual(ataque.evsPorHorda, ataque.mejor.ev * 5 * 2);
    igual(ataque.hordasNecesarias, Math.ceil(252 / ataque.evsPorHorda));
  });

  prueba('sin el objeto duplicador hacen falta el doble de hordas', () => {
    const con = planearEvs({ ataque: 252 }, {}, datos, { regionesDisponibles: TODAS, objeto: 'Vínculo de Entrenamiento' });
    const sin = planearEvs({ ataque: 252 }, {}, datos, { regionesDisponibles: TODAS, objeto: 'ninguno' });
    igual(
      sin.porStat.find((s) => s.stat === 'ataque').evsPorHorda,
      con.porStat.find((s) => s.stat === 'ataque').evsPorHorda / 2,
    );
  });

  prueba('si se ha pasado de EVs, propone la baya que los baja', () => {
    const plan = planearEvs({ ataque: 100 }, { ataque: 150 }, datos, { regionesDisponibles: TODAS });
    const a = plan.porStat.find((s) => s.stat === 'ataque');
    igual(a.sobran, 50);
    igual(a.comoQuitar.baya, BAYA_DE.ataque);
    igual(a.comoQuitar.cuantas, 5);
  });

  prueba('avisa de que el Brazal Firme baja la Velocidad si se entrena Velocidad', () => {
    const plan = planearEvs({ velocidad: 252 }, {}, datos, { regionesDisponibles: TODAS, objeto: 'Brazal Firme' });
    cierto(plan.avisos.some((a) => a.includes('Velocidad')), JSON.stringify(plan.avisos));
  });

  prueba('cada característica tiene su vitamina y su baya, y no se repiten', () => {
    igual(new Set(Object.values(VITAMINA_DE)).size, 6);
    igual(new Set(Object.values(BAYA_DE)).size, 6);
    for (const s of STATS) { cierto(VITAMINA_DE[s]); cierto(BAYA_DE[s]); }
  });
});

bloque('movimientos', () => {
  prueba('un movimiento de nivel no toca la crianza', () => {
    const via = mejorVia('Larvitar', 'Mordisco', datos.pokedex);
    igual(via.via, 'nivel');
    const plan = planearMovimientos({ especie: 'Larvitar', movimientos: ['Mordisco'] }, datos, TODAS);
    falso(plan.entradas[0].afectaLaCrianza);
  });

  prueba('si un movimiento se aprende por nivel Y por MT, gana el nivel: es más barato', () => {
    const p = datos.pokedex.Larvitar;
    const porNivel = new Set(p.movimientos.nivel.map((m) => m.nombre));
    const enAmbas = p.movimientos.mt.find((m) => porNivel.has(m));
    cierto(enAmbas, 'esperaba algún movimiento en las dos listas');
    igual(mejorVia('Larvitar', enAmbas, datos.pokedex).via, 'nivel');
  });

  prueba('un movimiento sólo de MT no toca la crianza: se enseña y punto', () => {
    const p = datos.pokedex.Larvitar;
    const porNivel = new Set(p.movimientos.nivel.map((m) => m.nombre));
    const tutor = new Set(p.movimientos.tutor);
    const soloMt = p.movimientos.mt.find((m) => !porNivel.has(m) && !tutor.has(m));
    cierto(soloMt, 'esperaba algún movimiento exclusivo de MT');
    const plan = planearMovimientos({ especie: 'Larvitar', movimientos: [soloMt] }, datos, TODAS);
    igual(plan.entradas[0].via, 'mt');
    falso(plan.entradas[0].afectaLaCrianza);
  });

  prueba('un movimiento huevo obliga a que el padre lo sepa, y propone padres compatibles', () => {
    // Absol trae Deseo como movimiento especial/huevo según la wiki.
    const eggMove = Object.entries(datos.movimientosHuevo.deHuevo)
      .find(([, lista]) => lista.some((x) => x.especie === 'Larvitar'));
    cierto(eggMove, 'Larvitar debería tener algún movimiento huevo en los datos');
    const [mov] = eggMove;
    const padres = padresQuePasan(mov, 'Larvitar', datos, TODAS);
    cierto(padres.length > 0, `nadie puede pasar ${mov} a Larvitar`);
    for (const p of padres) {
      cierto(p.gruposEnComun.length > 0, `${p.especie} no comparte grupo`);
      cierto(p.ratioMacho > 0, `${p.especie} no puede ser macho`);
    }
  });

  prueba('prefiere el padre que lo aprende sin criar (nivel/MT/tutor) antes que el que sólo lo trae de huevo', () => {
    const conAmbos = Object.keys(datos.movimientosHuevo.deHuevo).find((m) => {
      const otros = datos.movimientosHuevo.otrosModos[m] ?? [];
      return otros.length > 0 && (datos.movimientosHuevo.deHuevo[m] ?? []).length > 0;
    });
    cierto(conAmbos, 'esperaba algún movimiento con las dos vías');
    const especie = datos.movimientosHuevo.deHuevo[conAmbos][0].especie;
    const padres = padresQuePasan(conAmbos, especie, datos, TODAS);
    if (padres.length > 1 && padres.some((p) => p.comoLoSabe.via !== 'huevo'))
      cierto(padres[0].comoLoSabe.via !== 'huevo', `el primero es ${padres[0].comoLoSabe.via}`);
  });

  prueba('avisa de cuántos cruces extra cuestan varios movimientos huevo', () => {
    const movs = Object.entries(datos.movimientosHuevo.deHuevo)
      .filter(([, l]) => l.some((x) => x.especie === 'Larvitar'))
      .map(([m]) => m).slice(0, 2);
    if (movs.length === 2) {
      const plan = planearMovimientos({ especie: 'Larvitar', movimientos: movs }, datos, TODAS);
      igual(plan.deHuevo.length, 2);
      cierto(plan.avisos.length > 0);
    }
  });
});

bloque('habilidades', () => {
  prueba('lee las normales y las ocultas de la ficha', () => {
    const h = habilidadesDe('Larvitar', datos.pokedex);
    igual(h.normales, ['Agallas']);
    igual(h.ocultas, ['Velo Arena']);
  });

  prueba('la única habilidad normal sale siempre', () => {
    const p = planearHabilidad({ especie: 'Larvitar', habilidad: 'Agallas' }, datos);
    cierto(p.ok);
    igual(p.via, 'unica');
    igual(p.objetos, []);
  });

  prueba('la oculta se resuelve con el Parche, no con suerte', () => {
    const p = planearHabilidad({ especie: 'Larvitar', habilidad: 'Velo Arena' }, datos);
    cierto(p.ok);
    igual(p.via, 'oculta');
    igual(p.objetos, ['Parche de Habilidad']);
    cierto(p.huecos.length > 0, 'debería admitir que la wiki no documenta la herencia de habilidad');
  });

  prueba('una habilidad imposible se rechaza y se listan las que sí tiene', () => {
    const p = planearHabilidad({ especie: 'Larvitar', habilidad: 'Clorofila' }, datos);
    falso(p.ok);
    cierto(p.pasos[0].includes('Agallas'));
  });
});

bloque('capturas: el filtro de regiones', () => {
  prueba('intentosEsperados: un IV suelto es 1 de 32', () => {
    igual(intentosEsperados({ ivs31: 1 }), 32);
    igual(intentosEsperados({ ivs31: 2 }), 1024);
    igual(intentosEsperados({ ivs31: 1, sexo: SEXOS.HEMBRA, ratioSexo: 50 }), 64);
    igual(intentosEsperados({ ivs31: 1, sexo: SEXOS.HEMBRA, ratioSexo: 12.5 }), 256);
  });

  prueba('dondeAparece separa lo que está al alcance de lo que no', () => {
    const r = dondeAparece('Larvitar', datos, ['Kanto']);
    cierto(r.disponibles.every((e) => e.region === 'Kanto'));
    cierto(r.hayEnOtraRegion, 'Larvitar también sale en Johto y Unova');
    cierto(r.fueraDeAlcance.length > 0);
  });

  prueba('no propone ninguna zona de una región que el usuario no tiene', () => {
    const plan = planear(objetivoLarvitar, datos, { regionesDisponibles: ['Kanto'] });
    for (const c of planDeCapturas(plan, datos, ['Kanto'])) {
      for (const z of c.recomendada?.zonas ?? []) igual(z.region, 'Kanto');
    }
  });

  prueba('si la especie sólo sale en una región bloqueada, lo dice en vez de callarlo', () => {
    // Larvitar no aparece en Hoenn; con sólo Hoenn, el hueco materno no es capturable.
    const r = comoConseguir(
      { stats: ['ataque'], naturaleza: null, sexo: SEXOS.HEMBRA, especieSugerida: 'Larvitar', especieLibre: false },
      datos, ['Hoenn'], { especie: 'Larvitar' },
    );
    cierto(r.soloGtl, 'debería avisar de que no hay forma de capturarlo en Hoenn');
    cierto(r.nota.includes('GTL'));
    cierto(r.opciones[0].soloEnOtraRegion);
  });

  prueba('el hueco paterno propone otras especies del grupo huevo, más fáciles de pillar', () => {
    const r = comoConseguir(
      { stats: ['ataque'], naturaleza: null, sexo: SEXOS.MACHO, especieSugerida: 'Larvitar', especieLibre: true },
      datos, ['Kanto'], { especie: 'Larvitar' },
    );
    cierto(r.viables.length > 1, 'debería dar varias especies de relleno');
    for (const o of r.viables) {
      cierto(o.gruposEnComun.includes('Monstruo'), `${o.especie} no comparte Monstruo`);
      cierto(o.zonas.every((z) => z.region === 'Kanto'));
    }
  });
});


bloque('entrenamiento: los escalones de EVs', () => {
  prueba('a nivel 100 un punto son 4 EVs y da igual el IV', () => {
    igual([0, 3, 4, 7, 8, 252].map((e) => puntosPorEvs(e, 100, 31)), [0, 0, 1, 1, 2, 63]);
    igual([0, 3, 4, 7, 8, 252].map((e) => puntosPorEvs(e, 100, 30)), [0, 0, 1, 1, 2, 63]);
  });

  prueba('a nivel 50 con IV impar los escalones caen en 4, 12, 20…', () => {
    igual([0, 3, 4, 11, 12, 19, 20].map((e) => puntosPorEvs(e, 50, 31)), [0, 0, 1, 1, 2, 2, 3]);
    igual(puntosPorEvs(252, 50, 31), 32);
    igual(escalonInferior(11, 50, 31), 4);
    igual(escalonSiguiente(4, 50, 31), 12);
  });

  prueba('a nivel 50 con IV par caen en 8, 16, 24… y 252 tira 4', () => {
    igual([0, 7, 8, 15, 16].map((e) => puntosPorEvs(e, 50, 30)), [0, 0, 1, 1, 2]);
    igual(puntosPorEvs(248, 50, 30), 31);
    igual(puntosPorEvs(252, 50, 30), 31, '252 no da más punto que 248 con IV par');
    igual(escalonInferior(252, 50, 30), 248);
  });

  prueba('252/252/6 con IVs a 31 sólo tira 2 EVs, y no hay dónde reinvertirlos', () => {
    const o = optimizarEvs(
      { ataque: 252, velocidad: 252, ps: 6 },
      { ataque: 31, velocidad: 31, ps: 31 }, 50,
    );
    igual(o.recuperados, 2);
    igual(o.ajustados.ps, 4);
    igual(o.reinversiones, []);
    igual(o.sobrantes, 2);
    igual(o.puntosDespues, o.puntosAntes, 'no se gana nada, pero tampoco se pierde');
  });

  prueba('con IVs pares el mismo reparto tira 14 EVs y uno de ellos vale un punto', () => {
    const o = optimizarEvs(
      { ataque: 252, velocidad: 252, ps: 6 },
      { ataque: 30, velocidad: 30, ps: 30 }, 50,
    );
    igual(o.recuperados, 14, '4 + 4 de los 252, y 6 de los PS');
    igual(o.ajustados.ataque, 248);
    igual(o.ajustados.velocidad, 248);
    igual(o.reinversiones.length, 1);
    igual(o.ajustados.ps, 8);
    cierto(o.puntosDespues > o.puntosAntes, 'reinvertir tiene que ganar un punto');
  });

  prueba('nunca se pasa de los topes', () => {
    const o = optimizarEvs(
      { ataque: 252, velocidad: 250, defensa: 8 },
      { ataque: 31, velocidad: 31, defensa: 31 }, 50,
    );
    for (const [, v] of Object.entries(o.ajustados)) cierto(v <= 252);
    cierto(Object.values(o.ajustados).reduce((a, b) => a + b, 0) <= 510);
  });

  prueba('un reparto ya en escalones no recupera nada', () => {
    const o = optimizarEvs({ ataque: 252, velocidad: 4 }, { ataque: 31, velocidad: 31 }, 50);
    igual(o.recuperados, 0);
    falso(o.mereceLaPena);
  });
});

bloque('coste: tienda contra GTL', () => {
  const objetivo = {
    especie: 'Larvitar', ivs: ivs({ ataque: 31, velocidad: 31 }), evs: {},
    movimientos: [], naturaleza: 'Audaz',
  };
  const plan = planear(objetivo, datos, { regionesDisponibles: REGIONES });
  const pres = presupuestar(plan, datos);

  prueba('la Piedraeterna sale más cara en el GTL que en la guardería', () => {
    const d = pres.dondeComprar.find((x) => x.objeto === 'Piedraeterna');
    cierto(d, 'un plan con naturaleza tiene que usar Piedraeterna');
    igual(d.tienda, 4000, 'la guardería la vende a 4.000 fijos en las cinco regiones');
    cierto(d.masCaroEnGtl, `el GTL estaba a ${d.gtl.ultimo}, no por debajo de 4.000`);
    cierto(d.diferencia > 0);
    cierto(/guardería/.test(d.consejo));
  });

  prueba('el total NO usa el precio de mercado, que caduca', () => {
    const conGtl = pres.lineas.find((l) => l.concepto === 'Piedraeterna');
    igual(conGtl.precioUnidad, 4000, 'el presupuesto suma el precio de tienda');
  });

  prueba('el precio observado viene con su fecha, para poder desconfiar de él', () => {
    const d = pres.dondeComprar.find((x) => x.objeto === 'Piedraeterna');
    cierto(/^\d{4}-\d{2}-\d{2}$/.test(d.gtl.fecha));
    cierto(d.gtl.min < d.gtl.ultimo && d.gtl.ultimo < d.gtl.max, 'el rango tiene que contener al último');
    cierto(d.gtl.fuente.includes('usuario'));
  });
});
