// El árbol de crianza. La prueba que importa es la de solidez: para cada cruce
// del árbol, aplicar la regla de herencia a los IVs de sus dos hijos tiene que
// dar los IVs que el cruce promete. Si el planificador se inventa un atajo, eso
// lo detecta.
import { bloque, prueba, igual, cierto, falso } from './marco.mjs';
import { datos, ivs } from './datos-de-prueba.mjs';
import {
  planear, validarObjetivo, contar, statsPedidos, elegirRelleno, cumple,
  movimientosSoloDeHuevo, medirArbol, criaDe, ROL,
} from '../src/nucleo/planificador.js';
import { ivsGarantizados, naturalezaGarantizada, perfectos } from '../src/nucleo/herencia.js';
import { SEXOS, REGIONES } from '../src/nucleo/constantes.js';

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

  prueba('ya no existe la vía compartida: planear() no acepta estrategias', () => {
    const plan = planear(conNat, datos, { regionesDisponibles: REGIONES });
    igual(plan.comparativa, undefined);
    igual(plan.estrategiaNaturaleza, undefined);
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
