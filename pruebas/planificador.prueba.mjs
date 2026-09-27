// El árbol de crianza. La prueba que importa es la de solidez: para cada cruce
// del árbol, aplicar la regla de herencia a los IVs de sus dos hijos tiene que
// dar los IVs que el cruce promete. Si el planificador se inventa un atajo, eso
// lo detecta.
import { bloque, prueba, igual, cierto, falso } from './marco.mjs';
import { datos, ivs } from './datos-de-prueba.mjs';
import {
  planear, validarObjetivo, contar, statsPedidos, elegirRelleno, cumple,
  movimientosSoloDeHuevo, medirArbol, criaDe, ROL, lineaMaterna, ivsDelArbol,
  extenderPorSexo, comparaPlanes, MODOS_PIEDRA,
} from '../src/nucleo/planificador.js';
import { ivsGarantizados, naturalezaGarantizada, perfectos, IV_PSEUDO } from '../src/nucleo/herencia.js';
import { SEXOS, REGIONES } from '../src/nucleo/constantes.js';
import { planDeCapturas } from '../src/nucleo/capturas.js';
import { presupuestar } from '../src/nucleo/coste.js';

const objetivoDe = (o) => ({ especie: 'Larvitar', ivs: ivs(), evs: {}, movimientos: [], ...o });

/** Recorre el árbol y devuelve todos los nodos. */
function nodos(arbol) {
  const out = [];
  (function r(n) { out.push(n); n.hijos.forEach(r); })(arbol);
  return out;
}

/**
 * Comprueba que cada cruce cumple la regla de herencia de verdad: se simulan dos
 * padres con exactamente los IVs que el plan les pide, con los objetos que el
 * plan les pone, y los 31 garantizados tienen que cubrir lo que el cruce promete.
 */
function arbolSolido(arbol) {
  for (const n of nodos(arbol)) {
    if (n.tipo !== 'cruce') continue;
    const [madre, padre] = n.hijos;
    const ivsMadre = ivs(Object.fromEntries(madre.stats.map((s) => [s, 31])));
    const ivsPadre = ivs(Object.fromEntries(padre.stats.map((s) => [s, 31])));
    const r = ivsGarantizados(ivsMadre, ivsPadre, n.objetos.madre, n.objetos.padre);
    for (const s of n.stats) {
      if (!r.garantizados.has(s))
        throw new Error(
          `el cruce ${n.id} promete ${n.stats.join(',')} pero ${s} no queda garantizado ` +
          `con madre=[${madre.stats}] +${n.objetos.madre} y padre=[${padre.stats}] +${n.objetos.padre}`,
        );
    }
    if (n.naturaleza) {
      // Se simulan los padres con la naturaleza que el plan les asigna y se
      // comprueba con la regla real que la cría la saca garantizada.
      const nat = 'Audaz';
      const r2 = naturalezaGarantizada(
        { naturaleza: madre.naturaleza ? nat : null },
        { naturaleza: padre.naturaleza ? nat : null },
        n.objetos.madre, n.objetos.padre,
      );
      if (r2.naturaleza !== nat)
        throw new Error(
          `el cruce ${n.id} promete naturaleza pero no queda garantizada ` +
          `(madre naturaleza=${madre.naturaleza}, padre naturaleza=${padre.naturaleza}, ` +
          `objetos ${n.objetos.madre} / ${n.objetos.padre})`,
        );
      if (n.viaNaturaleza && r2.via !== n.viaNaturaleza)
        throw new Error(`el cruce ${n.id} dice vía ${n.viaNaturaleza} y la regla da ${r2.via}`);
    }
  }
  return true;
}

bloque('planificador: forma del árbol', () => {
  for (const n of [2, 3, 4, 5, 6]) {
    prueba(`un ${n}×31 sin naturaleza sale de 2^${n - 1} = ${2 ** (n - 1)} padres que hay que conseguir`, () => {
      const stats = ['ps', 'ataque', 'defensa', 'at-esp', 'def-esp', 'velocidad'].slice(0, n);
      const plan = planear(
        objetivoDe({ ivs: ivs(Object.fromEntries(stats.map((s) => [s, 31]))) }),
        datos,
        { regionesDisponibles: REGIONES },
      );
      cierto(plan.ok, JSON.stringify(plan.problemas));
      cierto(arbolSolido(plan.arbol));
      igual(contar(plan.arbol).conseguir, 2 ** (n - 1));
      igual(contar(plan.arbol).cruces, 2 ** (n - 1) - 1);
    });
  }

  prueba('todas las hojas de un árbol sin naturaleza piden un solo IV a 31', () => {
    const plan = planear(
      objetivoDe({ ivs: ivs({ ps: 31, ataque: 31, defensa: 31, velocidad: 31 }) }),
      datos, { regionesDisponibles: REGIONES },
    );
    for (const n of nodos(plan.arbol)) {
      if (n.tipo !== 'conseguir') continue;
      igual(n.stats.length, 1, `la hoja ${n.id} pide ${n.stats.length} IVs`);
    }
  });

  prueba('pedir la naturaleza añade un escalón: sale más caro que el mismo n×31 sin ella', () => {
    const base = { ps: 31, ataque: 31, defensa: 31, velocidad: 31 };
    const sinNat = planear(objetivoDe({ ivs: ivs(base) }), datos, { regionesDisponibles: REGIONES });
    const conNat = planear(objetivoDe({ ivs: ivs(base), naturaleza: 'Audaz' }), datos, { regionesDisponibles: REGIONES });
    cierto(conNat.ok);
    cierto(arbolSolido(conNat.arbol));
    cierto(
      contar(conNat.arbol).conseguir > contar(sinNat.arbol).conseguir,
      `con naturaleza ${contar(conNat.arbol).conseguir} vs sin ${contar(sinNat.arbol).conseguir}`,
    );
  });

  prueba('una sola rama arrastra la naturaleza: la de la Piedraeterna', () => {
    const plan = planear(
      objetivoDe({ ivs: ivs({ ataque: 31, velocidad: 31 }), naturaleza: 'Audaz' }),
      datos, { regionesDisponibles: REGIONES },
    );
    cierto(arbolSolido(plan.arbol));
    const hojasConNaturaleza = nodos(plan.arbol).filter((n) => n.tipo === 'conseguir' && n.naturaleza);
    igual(hojasConNaturaleza.length, 1);
    igual(hojasConNaturaleza[0].stats.length, 0, 'la hoja de naturaleza no debería pedir IVs');
  });




  prueba('un 1×31 no necesita cruce: es una captura', () => {
    const plan = planear(objetivoDe({ ivs: ivs({ ataque: 31 }) }), datos, { regionesDisponibles: REGIONES });
    igual(contar(plan.arbol).cruces, 0);
    igual(contar(plan.arbol).conseguir, 1);
  });
});

bloque('planificador: el inventario recorta el árbol', () => {
  const objetivo = objetivoDe({ ivs: ivs({ ps: 31, ataque: 31, defensa: 31, velocidad: 31 }) });

  prueba('sin inventario hay que conseguir los 8 padres', () => {
    igual(contar(planear(objetivo, datos, { regionesDisponibles: REGIONES }).arbol).conseguir, 8);
  });

  prueba('un 3×31 del inventario corta media cadena de golpe', () => {
    const plan = planear(objetivo, datos, {
      regionesDisponibles: REGIONES,
      inventario: [{
        id: 'a', especie: 'Larvitar', sexo: SEXOS.HEMBRA,
        ivs: ivs({ ps: 31, ataque: 31, defensa: 31 }),
      }],
    });
    const c = contar(plan.arbol);
    igual(c.inventario, 1);
    cierto(c.conseguir < 8, `todavía pide ${c.conseguir} capturas`);
    cierto(arbolSolido(plan.arbol));
  });

  prueba('un padre del inventario se gasta en un solo hueco: en PokeMMO se consume', () => {
    const uno = { id: 'a', especie: 'Rattata', sexo: SEXOS.MACHO, ivs: ivs({ ataque: 31 }) };
    const plan = planear(
      objetivoDe({ especie: 'Rattata', ivs: ivs({ ataque: 31, velocidad: 31, defensa: 31 }) }),
      datos, { regionesDisponibles: REGIONES, inventario: [uno] },
    );
    igual(contar(plan.arbol).inventario, 1, 'el mismo ejemplar no puede rellenar dos huecos');
  });

  prueba('se prefiere el ejemplar más justo: no se gasta un 4×31 donde vale un 1×31', () => {
    const plan = planear(
      objetivoDe({ ivs: ivs({ ataque: 31, velocidad: 31 }) }),
      datos,
      {
        regionesDisponibles: REGIONES,
        inventario: [
          { id: 'gordo', especie: 'Larvitar', sexo: SEXOS.HEMBRA, ivs: ivs({ ps: 31, ataque: 31, defensa: 31, velocidad: 31 }) },
          { id: 'justo', especie: 'Larvitar', sexo: SEXOS.HEMBRA, ivs: ivs({ ataque: 31 }) },
        ],
      },
    );
    // El 4×31 ya cumple el objetivo entero, así que la raíz lo coge y no cría nada.
    // Lo que NO debe pasar es gastar el 4×31 en una hoja de 1×31.
    const usados = nodos(plan.arbol).filter((n) => n.tipo === 'inventario').map((n) => n.ejemplar.id);
    cierto(usados.includes('gordo') || usados.includes('justo'), 'no ha usado el inventario');
    const gordoEnHoja = nodos(plan.arbol).some(
      (n) => n.tipo === 'inventario' && n.ejemplar.id === 'gordo' && n.stats.length === 1,
    );
    falso(gordoEnHoja, 'ha gastado el 4×31 en un hueco de 1×31');
  });
});

bloque('planificador: el hueco paterno acepta otras especies', () => {
  prueba('un Rattata macho vale como padre de una cadena de Chimchar (comparten Campo)', () => {
    const r = cumple(
      { especie: 'Rattata', sexo: SEXOS.MACHO, ivs: ivs({ ataque: 31 }) },
      { stats: ['ataque'], naturaleza: false, rol: ROL.LIBRE },
      datos,
      { especie: 'Chimchar' },
    );
    cierto(r.ok, r.motivo);
    igual(r.gruposEnComun, ['Campo']);
  });

  prueba('ese mismo Rattata NO vale como línea materna de Chimchar', () => {
    const r = cumple(
      { especie: 'Rattata', sexo: SEXOS.HEMBRA, ivs: ivs({ ataque: 31 }) },
      { stats: ['ataque'], naturaleza: false, rol: ROL.ESPINA },
      datos,
      { especie: 'Chimchar' },
    );
    falso(r.ok);
    cierto(r.especieIncompatible);
  });

  prueba('el relleno sugerido comparte grupo huevo y se captura en las regiones dadas', () => {
    const lista = elegirRelleno('Larvitar', datos, ['Kanto']);
    cierto(lista.length > 0, 'no ha propuesto ninguna especie de relleno');
    for (const c of lista.slice(0, 5)) {
      cierto(c.grupos.includes('Monstruo'), `${c.especie} no comparte Monstruo`);
      cierto(
        (datos.encuentros[c.especie] ?? []).some((e) => e.region === 'Kanto'),
        `${c.especie} no aparece en Kanto`,
      );
    }
  });

  prueba('si la región no está disponible, no se propone relleno de allí', () => {
    for (const c of elegirRelleno('Larvitar', datos, ['Hoenn'])) {
      cierto(
        (datos.encuentros[c.especie] ?? []).some((e) => e.region === 'Hoenn'),
        `${c.especie} no aparece en Hoenn y se ha propuesto igual`,
      );
    }
  });
});

bloque('planificador: motivos de rechazo', () => {
  prueba('avisa del IV que falta, que es el caso de "creía que capturaba velocidad"', () => {
    const r = cumple(
      { especie: 'Larvitar', sexo: SEXOS.MACHO, ivs: ivs({ ataque: 31 }) },
      { stats: ['velocidad'], naturaleza: false, rol: ROL.LIBRE },
      datos, { especie: 'Larvitar' },
    );
    falso(r.ok);
    igual(r.faltanIvs, ['velocidad']);
  });

  prueba('un hueco LIBRE acepta los dos sexos: quién hace de madre ahí da igual', () => {
    for (const sexo of [SEXOS.MACHO, SEXOS.HEMBRA]) {
      const r = cumple(
        { especie: 'Larvitar', sexo, ivs: ivs({ velocidad: 31 }) },
        { stats: ['velocidad'], naturaleza: false, rol: ROL.LIBRE },
        datos, { especie: 'Larvitar' },
      );
      cierto(r.ok, `${sexo}: ${r.motivo}`);
    }
  });

  prueba('la ESPINA sí rechaza un macho sin Ditto: la especie la pone la madre', () => {
    const r = cumple(
      { especie: 'Larvitar', sexo: SEXOS.MACHO, ivs: ivs({ velocidad: 31 }) },
      { stats: ['velocidad'], naturaleza: false, rol: ROL.ESPINA },
      datos, { especie: 'Larvitar' },
    );
    cierto(r.ok, 'vale, pero');
    cierto(r.necesitaDitto, 'tiene que avisar de que hace falta un Ditto');
  });

  prueba('la raíz respeta el sexo que ha pedido el usuario', () => {
    const r = cumple(
      { especie: 'Larvitar', sexo: SEXOS.MACHO, ivs: ivs({ velocidad: 31 }) },
      { stats: ['velocidad'], naturaleza: false, rol: ROL.RAIZ },
      datos, { especie: 'Larvitar', sexo: SEXOS.HEMBRA },
    );
    falso(r.ok);
    cierto(r.sexoIncorrecto);
  });

  prueba('avisa de la naturaleza cuando el hueco la pide y no coincide', () => {
    const r = cumple(
      { especie: 'Larvitar', sexo: SEXOS.HEMBRA, ivs: ivs({ velocidad: 31 }), naturaleza: 'Miedoso' },
      { stats: ['velocidad'], naturaleza: true, rol: ROL.ESPINA },
      datos, { especie: 'Larvitar', naturaleza: 'Audaz' },
    );
    falso(r.ok);
    cierto(r.faltanNaturaleza);
  });
});

bloque('planificador: validación del objetivo', () => {
  prueba('rechaza una especie del grupo "No cría"', () => {
    const v = validarObjetivo(objetivoDe({ especie: 'Happiny', ivs: ivs({ ps: 31, ataque: 31 }) }), datos);
    falso(v.valido);
    cierto(v.problemas.some((p) => p.includes('No cría')), JSON.stringify(v.problemas));
  });

  prueba('rechaza EVs que pasen de 510 en total', () => {
    const v = validarObjetivo(objetivoDe({ evs: { ps: 252, ataque: 252, velocidad: 252 } }), datos);
    falso(v.valido);
    cierto(v.problemas.some((p) => p.includes('510')));
  });

  prueba('rechaza más de 252 EVs en una característica', () => {
    const v = validarObjetivo(objetivoDe({ evs: { ataque: 300 } }), datos);
    falso(v.valido);
    cierto(v.problemas.some((p) => p.includes('252')));
  });

  prueba('rechaza una habilidad que la especie no puede tener', () => {
    const v = validarObjetivo(objetivoDe({ habilidad: 'Clorofila' }), datos);
    falso(v.valido);
  });

  prueba('acepta una habilidad que la especie sí tiene', () => {
    const v = validarObjetivo(objetivoDe({ habilidad: 'Agallas' }), datos);
    cierto(v.valido, JSON.stringify(v.problemas));
  });

  prueba('rechaza un movimiento que la especie no aprende', () => {
    const v = validarObjetivo(objetivoDe({ movimientos: ['Hidrobomba'] }), datos);
    falso(v.valido);
  });

  prueba('avisa de que del huevo sale la forma base', () => {
    const v = validarObjetivo(objetivoDe({ especie: 'Tyranitar', ivs: ivs({ ataque: 31, velocidad: 31 }) }), datos);
    cierto(v.avisos.some((a) => a.includes('Larvitar')), JSON.stringify(v.avisos));
  });

  prueba('avisa de que una especie sin género necesita Ditto en cada cruce', () => {
    const v = validarObjetivo(objetivoDe({ especie: 'Magnemite', ivs: ivs({ at_esp: 31 }) }), datos);
    cierto(v.avisos.some((a) => a.toLowerCase().includes('ditto')), JSON.stringify(v.avisos));
  });
});


bloque('planificador: reparto de sexos y espina materna', () => {
  const objetivo = objetivoDe({ ivs: ivs({ ps: 31, ataque: 31, defensa: 31, velocidad: 31 }) });

  prueba('todo cruce reparte un ♀ y un ♂ entre sus dos padres', () => {
    const plan = planear(objetivo, datos, { regionesDisponibles: REGIONES });
    for (const n of nodos(plan.arbol)) {
      if (n.tipo !== 'cruce') continue;
      const sexos = n.hijos.map((h) => h.sexoNecesario).sort();
      igual(sexos, [SEXOS.MACHO, SEXOS.HEMBRA].sort(), `el cruce ${n.id} reparte ${sexos}`);
    }
  });

  prueba('la espina materna cuelga de la raíz y siempre pide hembra', () => {
    const plan = planear(objetivo, datos, { regionesDisponibles: REGIONES });
    let nodo = plan.arbol;
    let pasos = 0;
    while (nodo.tipo === 'cruce') {
      const espina = nodo.hijos.find((h) => h.rol === ROL.ESPINA);
      cierto(espina, `el cruce ${nodo.id} no tiene hijo de espina`);
      igual(espina.sexoNecesario, SEXOS.HEMBRA);
      nodo = espina;
      pasos++;
    }
    cierto(pasos >= 1, 'debería haber al menos un tramo de espina');
  });

  prueba('sólo la espina lleva la especie atada; el resto de huecos son libres', () => {
    const plan = planear(objetivo, datos, { regionesDisponibles: REGIONES });
    const libres = plan.pasos.conseguir.filter((r) => r.especieLibre);
    const atados = plan.pasos.conseguir.filter((r) => !r.especieLibre);
    cierto(libres.length > atados.length, `libres ${libres.length} vs atados ${atados.length}`);
    for (const a of atados) igual(a.especieSugerida, 'Larvitar');
  });

  prueba('una hembra del inventario encaja en un hueco libre y su pareja pasa a macho', () => {
    const plan = planear(objetivo, datos, {
      regionesDisponibles: REGIONES,
      inventario: [{
        id: 'h', especie: 'Larvitar', sexo: SEXOS.HEMBRA,
        ivs: ivs({ ps: 31, ataque: 31, defensa: 31 }),
      }],
    });
    const usado = nodos(plan.arbol).find((n) => n.tipo === 'inventario' && n.ejemplar.id === 'h');
    cierto(usado, 'no ha colocado la hembra en ningún hueco');
    cierto(arbolSolido(plan.arbol));
    igual(usado.sexoNecesario, SEXOS.HEMBRA);
    const cruce = nodos(plan.arbol).find((n) => n.hijos.includes(usado));
    const pareja = cruce.hijos.find((h) => h !== usado);
    igual(pareja.sexoNecesario, SEXOS.MACHO, 'la pareja tiene que quedarse con el sexo contrario');
  });

  prueba('un Rattata hembra del inventario sirve de hueco libre en una cadena de Chimchar', () => {
    const plan = planear(
      objetivoDe({ especie: 'Chimchar', ivs: ivs({ ataque: 31, velocidad: 31, defensa: 31 }) }),
      datos,
      {
        regionesDisponibles: REGIONES,
        inventario: [{ id: 'r', especie: 'Rattata', sexo: SEXOS.HEMBRA, ivs: ivs({ velocidad: 31 }) }],
      },
    );
    cierto(
      nodos(plan.arbol).some((n) => n.tipo === 'inventario' && n.ejemplar.id === 'r'),
      'un Rattata del grupo Campo debería encajar en un hueco libre de Chimchar',
    );
  });
});


bloque('planificador: movimientos huevo atan al padre final', () => {
  // Un movimiento que Larvitar SÓLO puede sacar de huevo.
  const soloHuevo = Object.entries(datos.movimientosHuevo.deHuevo)
    .filter(([mov, lista]) => lista.some((x) => x.especie === 'Larvitar')
      && !datos.pokedex.Larvitar.movimientos.nivel.some((m) => m.nombre === mov)
      && !datos.pokedex.Larvitar.movimientos.mt.includes(mov)
      && !datos.pokedex.Larvitar.movimientos.tutor.includes(mov))
    .map(([mov]) => mov);

  prueba('detecta qué movimientos son sólo de huevo y cuáles no tocan la crianza', () => {
    cierto(soloHuevo.length > 0, 'esperaba algún movimiento exclusivo de huevo en Larvitar');
    const porNivel = datos.pokedex.Larvitar.movimientos.nivel[0].nombre;
    igual(movimientosSoloDeHuevo({ especie: 'Larvitar', movimientos: [porNivel] }, datos.pokedex), []);
    igual(
      movimientosSoloDeHuevo({ especie: 'Larvitar', movimientos: [soloHuevo[0]] }, datos.pokedex),
      [soloHuevo[0]],
    );
  });

  prueba('el padre del cruce final queda obligado a saberlo, y la espina no', () => {
    const plan = planear(
      objetivoDe({ ivs: ivs({ ataque: 31, velocidad: 31 }), movimientos: [soloHuevo[0]] }),
      datos, { regionesDisponibles: REGIONES },
    );
    cierto(plan.ok, JSON.stringify(plan.problemas));
    igual(plan.movimientosDeHuevo, [soloHuevo[0]]);
    const conMovs = nodos(plan.arbol).filter((n) => (n.movimientosNecesarios ?? []).length);
    igual(conMovs.length, 1, 'sólo un hueco debería quedar atado');
    igual(conMovs[0].rol, ROL.LIBRE, 'lo pasa el padre, no la madre');
    igual(conMovs[0].sexoNecesario, SEXOS.MACHO);
  });

  prueba('un ejemplar del inventario que no sabe el movimiento no vale para ese hueco', () => {
    const hueco = { stats: ['ataque'], naturaleza: false, rol: ROL.LIBRE, movimientosNecesarios: [soloHuevo[0]] };
    const sinEl = cumple(
      { especie: 'Larvitar', sexo: SEXOS.MACHO, ivs: ivs({ ataque: 31 }), movimientos: [] },
      hueco, datos, { especie: 'Larvitar' },
    );
    falso(sinEl.ok);
    igual(sinEl.faltanMovimientos, [soloHuevo[0]]);

    const conEl = cumple(
      { especie: 'Larvitar', sexo: SEXOS.MACHO, ivs: ivs({ ataque: 31 }), movimientos: [soloHuevo[0]] },
      hueco, datos, { especie: 'Larvitar' },
    );
    cierto(conEl.ok, conEl.motivo);
  });

  prueba('el requisito de captura arrastra el movimiento al texto del paso', () => {
    const plan = planear(
      objetivoDe({ ivs: ivs({ ataque: 31, velocidad: 31 }), movimientos: [soloHuevo[0]] }),
      datos, { regionesDisponibles: REGIONES },
    );
    const conMov = plan.pasos.conseguir.filter((r) => r.movimientos.length);
    igual(conMov.length, 1);
    igual(conMov[0].movimientos, [soloHuevo[0]]);
  });
});


bloque('planificador: la naturaleza sólo viaja con Piedraeterna', () => {
  const conNat = objetivoDe({
    ivs: ivs({ ps: 31, ataque: 31, defensa: 31, velocidad: 31 }),
    naturaleza: 'Agitada',
  });

  prueba('todos los cruces que prometen naturaleza llevan Piedraeterna', () => {
    const plan = planear(conNat, datos, { regionesDisponibles: REGIONES });
    cierto(arbolSolido(plan.arbol));
    const conNaturaleza = nodos(plan.arbol).filter((n) => n.tipo === 'cruce' && n.naturaleza);
    cierto(conNaturaleza.length > 0);
    for (const n of conNaturaleza) {
      cierto(
        n.objetos.madre === 'Piedraeterna' || n.objetos.padre === 'Piedraeterna',
        `el cruce ${n.id} promete naturaleza sin Piedraeterna`,
      );
      igual(n.forzados.length, 1, 'con Piedraeterna sólo se puede forzar un IV');
    }
  });

  prueba('hay exactamente una hoja de sólo naturaleza, la de abajo de la espina', () => {
    const plan = planear(conNat, datos, { regionesDisponibles: REGIONES });
    const soloNat = nodos(plan.arbol).filter(
      (n) => n.tipo === 'conseguir' && n.naturaleza && !n.stats.length,
    );
    igual(soloNat.length, 1);
  });

  prueba('ya no existe la vía compartida: planear() devuelve una sola cadena', () => {
    const plan = planear(conNat, datos, { regionesDisponibles: REGIONES });
    igual(plan.comparativa, undefined, 'no hay dos cadenas que comparar');
    igual(plan.estrategiaNaturaleza, undefined, 'ni estrategia que elegir');
  });

  prueba('medirArbol sigue midiendo esfuerzo, capturas y objetos', () => {
    const plan = planear(objetivoDe({ ivs: ivs({ ataque: 31, velocidad: 31, defensa: 31 }) }), datos, { regionesDisponibles: REGIONES });
    const m = medirArbol(plan.arbol);
    igual(m.capturas, contar(plan.arbol).conseguir);
    igual(m.esfuerzo, 4 * 32);
    igual(m.objetos.reduce((a, o) => a + o.cuantos, 0), contar(plan.arbol).cruces * 2);
  });
});


bloque('planificador: el inventario reestructura el árbol', () => {
  const conNat = objetivoDe({
    ivs: ivs({ ps: 31, ataque: 31, defensa: 31, velocidad: 31 }),
    naturaleza: 'Agitada',
  });
  const plan = (inventario) => planear(conNat, datos, { inventario, regionesDisponibles: REGIONES });

  prueba('la cadena de naturaleza es libre, no la espina: la Piedraeterna la lleva el padre', () => {
    const p = plan([]);
    for (const n of nodos(p.arbol)) {
      if (n.tipo !== 'cruce' || !n.naturaleza) continue;
      igual(n.objetos.padre, 'Piedraeterna', `el cruce ${n.id} debería llevarla en el padre`);
      const conNaturaleza = n.hijos.find((h) => h.naturaleza);
      igual(conNaturaleza.rol, ROL.LIBRE, 'la cadena de naturaleza no puede ir atada a la especie');
    }
  });

  prueba('un ejemplar de otra especie con la naturaleza y un 31 se aprovecha', () => {
    const sin = plan([]);
    const bicho = {
      id: 'x', especie: 'Charmander', sexo: SEXOS.MACHO, naturaleza: 'Agitada',
      ivs: ivs({ velocidad: 31 }), evs: {}, movimientos: [],
    };
    const con = plan([bicho]);
    igual(con.sobrantes.length, 0, 'debería haberlo colocado en algún hueco');
    cierto(
      contar(con.arbol).conseguir < contar(sin.arbol).conseguir,
      'usarlo tiene que quitar al menos una captura',
    );
    cierto(arbolSolido(con.arbol));
  });

  prueba('una hembra de la especie que no aporta nada más alarga la espina', () => {
    const hembra = {
      id: 'h', especie: 'Larvitar', sexo: SEXOS.HEMBRA, naturaleza: 'Miedosa',
      ivs: ivs(), evs: {}, movimientos: [],
    };
    const con = plan([hembra]);
    igual(con.sobrantes.length, 0, 'la hembra difícil de capturar no puede quedarse sin usar');

    const alargado = nodos(con.arbol).find((n) => n.alargadaPorEspecie);
    cierto(alargado, 'debería haber un cruce que alarga la espina');
    const [madre, padre] = alargado.hijos;
    igual(madre.tipo, 'inventario', 'la hembra tiene que ser la madre del cruce nuevo');
    igual(madre.ejemplar.id, 'h');
    igual(padre.rol, ROL.LIBRE, 'el padre ya no está atado a la especie');
    igual(alargado.objetos.madre, null, 'la madre no aporta ningún IV que forzar');
    cierto(arbolSolido(con.arbol));
  });

  prueba('una hembra de la especie que SÍ aporta algo no se quema como madre pelada', () => {
    // El error que esto vigila: alargar la espina antes de colocar el
    // inventario gastaba a esta hembra como «madre que sólo pone la especie» y
    // tiraba la naturaleza que traía.
    const conNaturaleza = {
      id: 'n', especie: 'Larvitar', sexo: SEXOS.HEMBRA, naturaleza: 'Agitada',
      ivs: ivs(), evs: {}, movimientos: [],
    };
    const sin = plan([]);
    const con = plan([conNaturaleza]);
    igual(con.sobrantes.length, 0);
    falso(nodos(con.arbol).some((n) => n.alargadaPorEspecie),
      'con la naturaleza puesta no hace falta alargar nada');
    cierto(
      con.pasos.conseguir.length < sin.pasos.conseguir.length,
      'y tiene que ahorrar una captura de verdad, no sólo ocupar un hueco',
    );
    cierto(arbolSolido(con.arbol));
  });

  prueba('lo mismo con una hembra que trae un 31: se usa por el IV, no por la especie', () => {
    const sin = plan([]);
    const conIv = {
      id: 'i', especie: 'Larvitar', sexo: SEXOS.HEMBRA,
      ivs: ivs({ ps: 31 }), evs: {}, movimientos: [],
    };
    const con = plan([conIv]);
    igual(con.sobrantes.length, 0);
    falso(nodos(con.arbol).some((n) => n.alargadaPorEspecie));
    cierto(con.pasos.conseguir.length < sin.pasos.conseguir.length);
  });

  prueba('la hembra pelada quita la captura difícil: especie + sexo + IV a la vez', () => {
    const atadas = (p) => p.pasos.conseguir.filter((r) => !r.especieLibre);
    const sin = plan([]);
    cierto(atadas(sin).length === 1, 'sin inventario hay una captura atada a la especie');
    const con = plan([{
      id: 'h', especie: 'Larvitar', sexo: SEXOS.HEMBRA, naturaleza: 'Miedosa',
      ivs: ivs(), evs: {}, movimientos: [],
    }]);
    igual(atadas(con).length, 0, 'con ella, ya no hace falta cazar ningún Larvitar');
  });

  prueba('sin una hembra así no se alarga nada: sería un cruce regalado', () => {
    const p = plan([]);
    falso(nodos(p.arbol).some((n) => n.alargadaPorEspecie));
  });

  prueba('tampoco se alarga si la hembra ya cumple el hueco de la espina', () => {
    const buena = {
      id: 'b', especie: 'Larvitar', sexo: SEXOS.HEMBRA, naturaleza: 'Agitada',
      ivs: ivs({ ps: 31, ataque: 31, defensa: 31, velocidad: 31 }), evs: {}, movimientos: [],
    };
    const p = plan([buena]);
    falso(nodos(p.arbol).some((n) => n.alargadaPorEspecie));
  });
});


bloque('planificador: la cría de un cruce, para el checklist', () => {
  const objetivo = objetivoDe({ ivs: ivs({ ataque: 31, velocidad: 31 }) });
  const ejemplar = (p) => ({ evs: {}, movimientos: [], naturaleza: null, ...p });

  const conLosDosPadres = () => {
    const madre = ejemplar({
      id: 'm', especie: 'Larvitar', sexo: SEXOS.HEMBRA, ivs: ivs({ ataque: 31 }),
    });
    const padre = ejemplar({
      id: 'p', especie: 'Charmander', sexo: SEXOS.MACHO, ivs: ivs({ velocidad: 31 }),
    });
    const plan = planear(objetivo, datos, {
      inventario: [madre, padre], regionesDisponibles: REGIONES,
    });
    return plan;
  };

  prueba('un cruce sin los dos padres en el inventario todavía no da cría', () => {
    const plan = planear(objetivo, datos, { regionesDisponibles: REGIONES });
    igual(criaDe(plan.arbol, objetivo, datos), null);
  });

  prueba('la cría sale de la especie de la madre y con los 31 garantizados', () => {
    const plan = conLosDosPadres();
    igual(plan.sobrantes.length, 0, 'los dos deberían encajar');
    const cria = criaDe(plan.arbol, objetivo, datos);
    cierto(cria, 'con los dos padres puestos tiene que haber cría');
    igual(cria.especie, 'Larvitar', 'la especie la pone la madre');
    igual([...perfectos(cria.ivs)].sort(), ['ataque', 'velocidad']);
    igual(cria.padres.sort(), ['m', 'p']);
  });

  prueba('sin Piedraeterna la cría sale sin naturaleza anotada, aunque los padres la compartan', () => {
    const madre = ejemplar({
      id: 'm', especie: 'Larvitar', sexo: SEXOS.HEMBRA, naturaleza: 'Agitada',
      ivs: ivs({ ataque: 31 }),
    });
    const padre = ejemplar({
      id: 'p', especie: 'Charmander', sexo: SEXOS.MACHO, naturaleza: 'Agitada',
      ivs: ivs({ velocidad: 31 }),
    });
    const plan = planear(objetivo, datos, {
      inventario: [madre, padre], regionesDisponibles: REGIONES,
    });
    const cria = criaDe(plan.arbol, objetivo, datos);
    igual(cria.naturaleza, null, 'compartir naturaleza no la transmite');
  });

  prueba('un 31 de más que comparten los dos padres también se anota', () => {
    const madre = ejemplar({
      id: 'm', especie: 'Larvitar', sexo: SEXOS.HEMBRA, ivs: ivs({ ataque: 31, defensa: 31 }),
    });
    const padre = ejemplar({
      id: 'p', especie: 'Charmander', sexo: SEXOS.MACHO, ivs: ivs({ velocidad: 31, defensa: 31 }),
    });
    const plan = planear(objetivo, datos, {
      inventario: [madre, padre], regionesDisponibles: REGIONES,
    });
    const cria = criaDe(plan.arbol, objetivo, datos);
    cierto(perfectos(cria.ivs).has('defensa'), 'la defensa la tienen los dos: sale a 31 seguro');
  });
});


bloque('planificador: un objetivo sin género', () => {
  // El fallo que esto vigila: con Starmie el plan pedía ♀ y ♂ en los huecos, y
  // como la especie no tiene sexos salía «1 de cada 0» — captura imposible.
  const objetivo = {
    especie: 'Starmie', ivs: ivs({ ps: 31, ataque: 31, velocidad: 31 }), evs: {},
    movimientos: [], naturaleza: 'Tímida',
  };
  const plan = planear(objetivo, datos, { regionesDisponibles: REGIONES });

  prueba('se puede planear', () => {
    cierto(plan.ok, JSON.stringify(plan.problemas));
    cierto(arbolSolido(plan.arbol));
  });

  prueba('ningún hueco pide ♀ ni ♂', () => {
    const conSexo = nodos(plan.arbol).filter(
      (n) => n.sexoNecesario === SEXOS.HEMBRA || n.sexoNecesario === SEXOS.MACHO,
    );
    igual(conSexo.length, 0, `${conSexo.length} huecos piden un sexo que la especie no tiene`);
    for (const r of plan.pasos.conseguir) igual(r.sexo, SEXOS.SIN_GENERO);
  });

  prueba('ninguna captura es imposible', () => {
    const capturas = planDeCapturas(plan, datos, REGIONES);
    cierto(capturas.length > 0, 'debería haber capturas que hacer');
    for (const c of capturas) {
      falso(c.soloGtl, `«ninguna especie compatible» con ${JSON.stringify(c.requisito.stats)}`);
      cierto(Number.isFinite(c.recomendada.intentos),
        `intentos infinitos para ${JSON.stringify(c.requisito.stats)}`);
    }
  });

  prueba('el relleno es su línea evolutiva o un Ditto', () => {
    const especies = plan.relleno.map((r) => r.especie);
    cierto(especies.length > 0, 'sin relleno no hay huecos libres que rellenar');
    for (const e of especies)
      cierto(['Staryu', 'Starmie', 'Ditto'].includes(e), `${e} no cría con un sin género`);
  });

  prueba('no se paga por elegir el sexo de la cría', () => {
    const pres = presupuestar(plan, datos);
    igual(pres.pagosSexo, []);
    falso(pres.lineas.some((l) => /sexo/i.test(l.concepto)));
  });
});

bloque('la espina acepta la línea entera, y lo dice cuando no hay hembras', () => {
  const objetivoDeEspecie = (especie, extra = {}) => ({
    especie, ivs: ivs({ ps: 31, ataque: 31, velocidad: 31 }), evs: {}, movimientos: [], ...extra,
  });

  prueba('para un Starmie se propone un Staryu: pone el mismo huevo y es más común', () => {
    const l = lineaMaterna('Starmie', datos, REGIONES);
    igual(l.sugerida, 'Staryu');
    igual(l.especies.sort(), ['Starmie', 'Staryu']);
  });

  prueba('sin la región del objetivo, la espina tira de otro de la línea', () => {
    // Starmie no aparece en Unova y Staryu sí. Antes esto salía como
    // «ninguna especie compatible: toca el GTL».
    igual(lineaMaterna('Starmie', datos, ['Unova']).sugerida, 'Staryu');
    const plan = planear(objetivoDeEspecie('Starmie'), datos, { regionesDisponibles: ['Unova'] });
    cierto(plan.ok);
    for (const c of planDeCapturas(plan, datos, ['Unova'], plan.objetivo))
      falso(c.soloGtl, `hueco sin salida: ${JSON.stringify(c.requisito.stats)}`);
  });

  prueba('ninguna captura de un sin género sale imposible', () => {
    const plan = planear(objetivoDeEspecie('Starmie'), datos, { regionesDisponibles: REGIONES });
    for (const c of planDeCapturas(plan, datos, REGIONES, plan.objetivo))
      cierto(Number.isFinite(c.recomendada?.intentos), JSON.stringify(c.requisito));
  });

  prueba('Nidoking: la espina es macho, la pareja un Ditto, y ninguna imposible', () => {
    const plan = planear(objetivoDeEspecie('Nidoking'), datos, { regionesDisponibles: REGIONES });
    cierto(plan.ok);
    cierto(plan.espina.conDitto);
    cierto(plan.avisos.some((a) => /no hay hembras/.test(a)), plan.avisos.join(' | '));

    const huecos = plan.pasos.conseguir;
    cierto(huecos.some((r) => r.sexo === SEXOS.MACHO), 'la espina va a macho');
    falso(huecos.some((r) => r.sexo === SEXOS.HEMBRA), 'no puede pedir ninguna hembra');
    cierto(huecos.some((r) => r.especieSugerida === 'Ditto' && r.noSeCria), 'falta el Ditto');

    for (const c of planDeCapturas(plan, datos, REGIONES, plan.objetivo))
      cierto(Number.isFinite(c.recomendada?.intentos), `captura imposible: ${JSON.stringify(c.requisito)}`);
  });

  prueba('el hueco del Ditto no se abre en más cruces: un Ditto no se cría', () => {
    const plan = planear(objetivoDeEspecie('Nidoking'), datos, { regionesDisponibles: REGIONES });
    for (const n of nodos(plan.arbol))
      if (n.especieFija === 'Ditto') igual(n.tipo, 'conseguir', 'el Ditto no puede ser un cruce');
  });

  prueba('un bebé de la línea vale de captura, avisando de que hay que evolucionarlo', () => {
    const plan = planear(objetivoDeEspecie('Raichu'), datos, { regionesDisponibles: REGIONES });
    const espina = planDeCapturas(plan, datos, REGIONES, plan.objetivo)
      .find((c) => !c.requisito.especieLibre);
    const pichu = espina.viables.find((v) => v.especie === 'Pichu');
    cierto(pichu, 'Pichu debería salir entre las que valen');
    cierto(pichu.noCria && pichu.evolucionar?.especie === 'Pikachu');
    falso(espina.recomendada.noCria, 'con todo igual se recomienda el que ya cría');
    cierto(plan.avisos.some((a) => /Pichu.*evolucionarlo/.test(a)), plan.avisos.join(' | '));
  });
});

bloque('el pseudo 31: un 30 sirve de padre, pero no miente', () => {
  const cero = { ps: 0, ataque: 0, defensa: 0, ataqueEsp: 0, defensaEsp: 0, velocidad: 0 };
  const bicho = (id, ivs, extra = {}) => ({
    id, especie: 'Larvitar', sexo: SEXOS.HEMBRA, naturaleza: null,
    ivs: { ...cero, ...ivs }, evs: {}, movimientos: [], ...extra,
  });
  const obj = (ivsPedidos) => ({
    especie: 'Larvitar', ivs: { ...cero, ...ivsPedidos }, evs: {}, movimientos: [],
  });
  const conInventario = (inventario, pedidos = { ps: 31, ataque: 31, velocidad: 31 }) =>
    planear(obj(pedidos), datos, { inventario, regionesDisponibles: REGIONES });
  const usados = (plan) => {
    const out = [];
    (function r(n) { if (n.tipo === 'inventario') out.push(n.ejemplar.id); n.hijos.forEach(r); })(plan.arbol);
    return out;
  };

  prueba('un 30 tapa un hueco que pide 31, y se dice que es un 30', () => {
    const plan = conInventario([bicho('treinta', { ataque: IV_PSEUDO })]);
    igual(usados(plan), ['treinta']);
    igual(plan.ivsFinales.ataque, 30, 'el plan entrega 30, no 31');
    igual(plan.ivsCortos, ['ataque']);
    cierto(plan.avisos.some((a) => /pseudo 31/.test(a)), plan.avisos.join(' | '));
  });

  prueba('entre un 30 y un 31 para el mismo hueco, se coge el 31', () => {
    const plan = conInventario([
      bicho('treinta', { ataque: IV_PSEUDO }),
      bicho('treintayuno', { ataque: 31 }, { especie: 'Slowpoke', sexo: SEXOS.MACHO }),
    ], { ps: 31, ataque: 31 });
    const huecoDe = (id) => {
      let r = null;
      (function rec(n) { if (n.tipo === 'inventario' && n.ejemplar.id === id) r = n; n.hijos.forEach(rec); })(plan.arbol);
      return r;
    };
    const conHueco = huecoDe('treintayuno');
    cierto(conHueco, 'el 31 tiene que estar colocado');
    cierto(conHueco.stats.includes('ataque'), 'y en el hueco que pide el ataque');
  });

  prueba('la RAÍZ no se da por cumplida con un 30: no es lo que se ha pedido', () => {
    const plan = conInventario([bicho('casi', { ps: 31, ataque: IV_PSEUDO })], { ps: 31, ataque: 31 });
    falso(plan.arbol.tipo === 'inventario', 'un 30 no puede ser el objetivo');
  });

  prueba('30 × 31 no garantiza nada: sale 31 con la probabilidad de la tabla', () => {
    const plan = conInventario([
      bicho('m', { ps: IV_PSEUDO, ataque: 31 }),
      bicho('p', { ps: 31, ataque: IV_PSEUDO }, { especie: 'Slowpoke', sexo: SEXOS.MACHO }),
    ], { ps: 31, ataque: 31 });
    // Aquí los dos Recios se cambian de mano y los dos IVs salen a 31 seguros,
    // que es mejor que la lotería: cada Recio acaba en el padre que tiene el 31.
    igual(plan.ivsFinales.ps, 31);
    igual(plan.ivsFinales.ataque, 31);
    igual(plan.suerte, []);
    igual(plan.objetosRecolocados.length, 1);
  });

  prueba('sin poder recolocar, el 30 contra el 31 queda a suerte y se dice', () => {
    // Un solo IV pedido: el cruce tiene un Recio para él, así que da igual la
    // mano. Se fuerza el caso a mano sobre el árbol.
    const plan = conInventario([], { ps: 31, ataque: 31, velocidad: 31 });
    const [a, b] = plan.arbol.hijos;
    // Se simula que las dos ramas entregan 30 y 31 en el IV compartido.
    const compartido = plan.arbol.stats.find((st) => !plan.arbol.forzados.includes(st));
    for (const n of [a, b]) { n.tipo = 'conseguir'; n.hijos = []; }
    a.stats = [compartido]; b.stats = [compartido];
    a.tipo = 'inventario'; a.ejemplar = bicho('x', { [compartido]: IV_PSEUDO });
    const r = ivsDelArbol(plan.arbol, obj({ ps: 31, ataque: 31, velocidad: 31 }));
    igual(r.ivs[compartido], 30, 'el suelo del compartido es el 30');
    igual(r.suerte.length, 1);
    cierto(r.suerte[0].probabilidad > 0 && r.suerte[0].probabilidad < 1);
  });

  prueba('la cría de un 30 con un 31 se anota como 30 y avisa de que se mire', () => {
    const plan = conInventario([
      bicho('m', { ataque: IV_PSEUDO, ps: 31 }),
      bicho('p', { ataque: 31, ps: 31 }, { especie: 'Slowpoke', sexo: SEXOS.MACHO }),
    ], { ps: 31, ataque: 31 });
    let cruce = null;
    (function r(n) {
      if (n.tipo === 'cruce' && n.hijos.every((h) => h.tipo === 'inventario')) cruce = n;
      n.hijos.forEach(r);
    })(plan.arbol);
    cierto(cruce, 'tiene que haber un cruce con los dos padres puestos');
    const cria = criaDe(cruce, plan.objetivo, datos);
    cierto(cria.ivs.ataque >= IV_PSEUDO, `ataque anotado: ${cria.ivs.ataque}`);
    if (cria.ivs.ataque === IV_PSEUDO)
      cierto(/comprueba en el juego/.test(cria.nota), cria.nota);
  });
});

bloque('cuando lo único que falla es el sexo, se cruza en vez de capturar', () => {
  // El caso que reportó el usuario: criando un Garchomp 2×31 + Alegre, con un
  // Horsea ♂ 2×31 en el inventario que el plan no usaba, mientras seguía
  // pidiendo capturar una ♀ con 31 en Velocidad.
  const cero = { ps: 0, ataque: 0, defensa: 0, ataqueEsp: 0, defensaEsp: 0, velocidad: 0 };
  const inventarioDelUsuario = [
    { id: 'gible', especie: 'Gible', sexo: SEXOS.HEMBRA, naturaleza: 'Osada',
      ivs: { ...cero, defensa: 31 }, evs: {}, movimientos: [] },
    { id: 'karp-a', especie: 'Magikarp', sexo: SEXOS.MACHO, naturaleza: 'Huraña',
      ivs: { ...cero, ataque: 31 }, evs: {}, movimientos: [] },
    { id: 'karp-v', especie: 'Magikarp', sexo: SEXOS.MACHO, naturaleza: 'Plácida',
      ivs: { ...cero, velocidad: 31 }, evs: {}, movimientos: [] },
    { id: 'karp-n', especie: 'Magikarp', sexo: SEXOS.MACHO, naturaleza: 'Alegre',
      ivs: { ...cero }, evs: {}, movimientos: [] },
    { id: 'horsea', especie: 'Horsea', sexo: SEXOS.MACHO, naturaleza: 'Afable',
      ivs: { ...cero, ataque: 31, velocidad: 31 }, evs: {}, movimientos: [] },
  ];
  const objetivoGarchomp = {
    especie: 'Garchomp', ivs: ivs({ ataque: 31, velocidad: 31 }), evs: {},
    movimientos: [], naturaleza: 'Alegre', sexo: null,
  };
  const plan = planear(objetivoGarchomp, datos, {
    inventario: inventarioDelUsuario, regionesDisponibles: REGIONES,
  });
  const usados = [];
  (function r(n) { if (n.tipo === 'inventario') usados.push(n.ejemplar.id); n.hijos.forEach(r); })(plan.arbol);

  prueba('el 2×31 del sexo contrario entra en el plan', () => {
    cierto(usados.includes('horsea'), `usados: ${usados.join(', ')}`);
    // Sobra un Magikarp porque con el Horsea dentro ya no hace falta: eso es
    // que el plan aprovecha lo bueno, no que se le olvide nada.
    falso(plan.sobrantes.some((e) => e.id === 'horsea'));
  });

  prueba('y con eso no queda ni una captura', () => {
    // Con la Piedraeterna en la madre, el Horsea entra tal cual en el cruce
    // final: 3 cruces y 0 capturas, que es la cadena que describió el usuario.
    igual(plan.pasos.conseguir.length, 0, 'no debería quedar nada que capturar');
    igual(contar(plan.arbol).cruces, 3);
    igual(plan.modoPiedra, 'raiz');
  });

  prueba('el árbol sigue siendo sólido y los sexos se pagan', () => {
    arbolSolido(plan.arbol);
    const pres = presupuestar(plan, datos);
    cierto(pres.pagosSexo.length >= 1);
  });

  prueba('el cruce que monta extenderPorSexo pone el Recio en el que trae el 31', () => {
    // Sobre un hueco a mano, porque en el plan de arriba ya no hace falta.
    const ctx = {
      datos,
      objetivo: objetivoGarchomp,
      inventarioLibre: [{ ...inventarioDelUsuario[4] }],
    };
    const hueco = {
      id: 'x1', tipo: 'conseguir', stats: ['velocidad'], naturaleza: false,
      rol: ROL.LIBRE, profundidad: 1, sexoNecesario: SEXOS.HEMBRA, hijos: [],
    };
    const raiz = {
      id: 'r', tipo: 'cruce', stats: ['velocidad'], naturaleza: false, rol: ROL.LIBRE,
      profundidad: 0, objetos: {}, hijos: [hueco],
    };
    cierto(extenderPorSexo(raiz, ctx).alargada);
    cierto(hueco.alargadaPorSexo);
    igual(hueco.sexoNecesario, SEXOS.HEMBRA, 'la cría sale del sexo que pedía el hueco');
    const [madre, padre] = hueco.hijos;
    igual(madre.objeto ?? null, null);
    igual(padre.objeto, 'Franja Recia');
    igual(padre.sexoNecesario, SEXOS.MACHO);
  });

  prueba('no se monta el truco si no sobra nadie', () => {
    const solo = planear(objetivoGarchomp, datos, { inventario: [], regionesDisponibles: REGIONES });
    let hay = false;
    (function r(n) { if (n.alargadaPorSexo) hay = true; n.hijos.forEach(r); })(solo.arbol);
    falso(hay, 'sin inventario no hay nada que rescatar');
  });

  prueba('un mismo ejemplar no monta dos cruces a la vez', () => {
    // Dos huecos podrían querer el mismo sobrante; sólo uno puede gastarlo.
    const ctx = {
      datos,
      objetivo: objetivoGarchomp,
      inventarioLibre: [inventarioDelUsuario[4]],
    };
    const falso1 = {
      id: 'x1', tipo: 'conseguir', stats: ['velocidad'], naturaleza: false,
      rol: ROL.LIBRE, profundidad: 1, sexoNecesario: SEXOS.HEMBRA, hijos: [],
    };
    const falso2 = { ...falso1, id: 'x2', hijos: [] };
    const raiz = {
      id: 'r', tipo: 'cruce', stats: ['velocidad'], naturaleza: false, rol: ROL.LIBRE,
      profundidad: 0, objetos: {}, hijos: [falso1, falso2],
    };
    extenderPorSexo(raiz, ctx);
    const montados = raiz.hijos.filter((h) => h.alargadaPorSexo).length;
    igual(montados, 1, 'con un solo sobrante sólo puede montarse un cruce');
  });
});

bloque('el plan no se queda estancado en una forma de criar', () => {
  const cero = { ps: 0, ataque: 0, defensa: 0, ataqueEsp: 0, defensaEsp: 0, velocidad: 0 };
  const objetivoConNaturaleza = {
    especie: 'Larvitar', ivs: ivs({ ataque: 31, velocidad: 31 }), evs: {},
    movimientos: [], naturaleza: 'Agitada', sexo: null,
  };

  prueba('partiendo de cero, la Piedraeterna va en el padre', () => {
    // Sin inventario, la cadena de naturaleza tiene que ser de especie LIBRE:
    // sus capturas son mucho más fáciles que las de la espina.
    const plan = planear(objetivoConNaturaleza, datos, { regionesDisponibles: REGIONES });
    igual(plan.modoPiedra, 'padre');
    falso(plan.arbol.piedraEnLaMadre);
  });

  prueba('con un macho cargado de 31, la pone en la madre y se ahorra su rama', () => {
    const conMacho = [{
      id: 'crack', especie: 'Slowpoke', sexo: SEXOS.MACHO, naturaleza: 'Afable',
      ivs: { ...cero, ataque: 31, velocidad: 31 }, evs: {}, movimientos: [],
    }];
    const conEl = planear(objetivoConNaturaleza, datos, {
      inventario: conMacho, regionesDisponibles: REGIONES,
    });
    const sinEl = planear(objetivoConNaturaleza, datos, { regionesDisponibles: REGIONES });
    cierto(conEl.pasos.conseguir.length < sinEl.pasos.conseguir.length,
      `con el macho ${conEl.pasos.conseguir.length} capturas, sin él ${sinEl.pasos.conseguir.length}`);
    const usados = [];
    (function r(n) { if (n.tipo === 'inventario') usados.push(n.ejemplar.id); n.hijos.forEach(r); })(conEl.arbol);
    igual(usados, ['crack']);
    arbolSolido(conEl.arbol);
  });

  prueba('sin naturaleza no hay nada que repartir y no se prueba tres veces', () => {
    const plan = planear(
      { especie: 'Larvitar', ivs: ivs({ ataque: 31, velocidad: 31 }), evs: {}, movimientos: [] },
      datos, { regionesDisponibles: REGIONES },
    );
    igual(plan.modoPiedra, 'padre');
  });

  prueba('gana el que menos capturas pide, y a igualdad el de menos cruces', () => {
    const peor = { pasos: { conseguir: [1, 2] }, arbol: { tipo: 'conseguir', hijos: [] }, ivsCortos: [], sobrantes: [] };
    const mejor = { pasos: { conseguir: [1] }, arbol: { tipo: 'conseguir', hijos: [] }, ivsCortos: [], sobrantes: [] };
    igual([peor, mejor].sort(comparaPlanes)[0], mejor);
    // Un plan que entrega un 30 donde se pidió un 31 pierde aunque ahorre capturas.
    const conTreinta = { ...mejor, ivsCortos: ['ataque'] };
    igual([conTreinta, peor].sort(comparaPlanes)[0], peor);
  });
});
