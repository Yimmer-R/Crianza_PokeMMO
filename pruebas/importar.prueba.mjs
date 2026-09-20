// El resolutor de nombres y el importador de texto/CSV/JSON.
//
// La prueba que más vale es la de la ficha real del juego: el texto de una captura
// de Chimchar, con «Desenrollar» (localización antigua de Rollout, que la wiki
// llama «Rodar») y los movimientos con el tipo delante.
import { bloque, prueba, igual, cierto, falso } from './marco.mjs';
import { datos } from './datos-de-prueba.mjs';
import { normalizar, distancia, crearIndice, crearResolutores, resolverSexo } from '../src/nucleo/nombres.js';
import { importar, detectarFormato, partirEnBloques, PLANTILLA } from '../src/nucleo/importar.js';
import { SEXOS, STATS } from '../src/nucleo/constantes.js';

// Tal cual sale de la ficha del juego, en su orden y con sus líneas de adorno.
const FICHA_DEL_JUEGO = `fuego
Nv. 1 Chimchar ♀
Estadísticas: 12/6/6/5/6/6
IVs: 19/30/15/23/21/31
EVs: 0/0/0/0/0/0
Naturaleza: agitada
Habilidad: Mar Llamas
Objeto: Ninguno
Marcas:
normal Placaje
siniestro Maquinación
siniestro Tormento
roca Desenrollar`;

bloque('nombres: normalizar y distancia', () => {
  prueba('normalizar quita tildes, puntos y mayúsculas', () => {
    igual(normalizar('At. Esp.'), 'at esp');
    igual(normalizar('Maquinación'), 'maquinacion');
    igual(normalizar('  MAR   LLAMAS '), 'mar llamas');
  });

  prueba('la distancia de edición corta en cuanto pasa del tope', () => {
    igual(distancia('rodar', 'rodar'), 0);
    igual(distancia('rodar', 'rodax'), 1);
    cierto(distancia('rodar', 'terremoto', 3) > 3, 'debería abandonar');
  });

  prueba('resolverSexo acepta los símbolos y las palabras', () => {
    igual(resolverSexo('♀'), SEXOS.HEMBRA);
    igual(resolverSexo('hembra'), SEXOS.HEMBRA);
    igual(resolverSexo('M'), SEXOS.MACHO);
    igual(resolverSexo('male'), SEXOS.MACHO);
    igual(resolverSexo('sin género'), SEXOS.SIN_GENERO);
    igual(resolverSexo('pepino'), null);
  });
});

bloque('nombres: resolutores sobre los datos reales', () => {
  const res = crearResolutores(datos);

  prueba('un nombre exacto se resuelve como exacto', () => {
    const r = res.movimiento('Terremoto');
    igual(r.valor, 'Terremoto');
    igual(r.via, 'exacto');
  });

  prueba('el nombre en inglés también vale', () => {
    igual(res.movimiento('Earthquake').valor, 'Terremoto');
    igual(res.movimiento('Earthquake').via, 'alias-ingles');
    igual(res.naturaleza('Impish').valor, 'Agitada');
    igual(res.habilidad('Blaze').valor, 'Mar Llamas');
  });

  prueba('"Desenrollar" (nombre del juego) resuelve a "Rodar" (nombre de la wiki)', () => {
    const r = res.movimiento('Desenrollar');
    igual(r.valor, 'Rodar');
    igual(r.via, 'alias-cliente');
  });

  prueba('una errata de OCR se corrige por aproximación', () => {
    const r = res.movimiento('Maquinacien');
    igual(r.valor, 'Maquinación');
    igual(r.via, 'aproximado');
  });

  prueba('sin tildes también resuelve, que es lo que hace el OCR la mitad de veces', () => {
    igual(res.movimiento('maquinacion').valor, 'Maquinación');
    igual(res.especie('chimchar').valor, 'Chimchar');
  });

  prueba('lo que no existe se devuelve como desconocido, no como una invención', () => {
    const r = res.movimiento('Puñetazo Cósmico Infinito');
    igual(r.valor, null);
    cierto(['desconocido', 'ambiguo'].includes(r.via), r.via);
  });

  prueba('un nombre canónico nunca se pisa por el alias inglés de otro', () => {
    for (const nombre of Object.keys(datos.movimientos)) {
      igual(res.movimiento(nombre).valor, nombre, `"${nombre}" no se resuelve a sí mismo`);
    }
  });

  prueba('crearIndice respeta la tabla de alias del cliente', () => {
    const idx = crearIndice(['Rodar', 'Terremoto'], () => [], { desenrollar: 'Rodar' });
    igual(idx('Desenrollar').valor, 'Rodar');
    igual(idx('Desenrollar').via, 'alias-cliente');
  });
});

bloque('importar: la ficha real del juego', () => {
  const r = importar(FICHA_DEL_JUEGO, datos);
  const e = r.ejemplares[0];

  prueba('saca un solo Pokémon, no dos: la línea del tipo no parte la ficha', () => {
    igual(r.ejemplares.length, 1);
    igual(r.formato, 'texto');
  });

  prueba('lee especie, sexo y nivel de "Nv. 1 Chimchar ♀"', () => {
    igual(e.especie, 'Chimchar');
    igual(e.sexo, SEXOS.HEMBRA);
    igual(e.nivel, 1);
  });

  prueba('lee los seis IVs en el orden del juego', () => {
    igual(e.ivs, { ps: 19, ataque: 30, defensa: 15, 'at-esp': 23, 'def-esp': 21, velocidad: 31 });
  });

  prueba('lee los EVs a cero sin confundirlos con los IVs', () => {
    igual(e.evs, { ps: 0, ataque: 0, defensa: 0, 'at-esp': 0, 'def-esp': 0, velocidad: 0 });
  });

  prueba('"agitada" en minúscula resuelve a la naturaleza Agitada', () => {
    igual(e.naturaleza, 'Agitada');
    igual(datos.naturalezas.Agitada.sube, 'Defensa');
  });

  prueba('lee la habilidad y comprueba que Chimchar puede tenerla', () => {
    igual(e.habilidad, 'Mar Llamas');
    cierto(datos.pokedex.Chimchar.habilidades.some((h) => h.nombre === 'Mar Llamas'));
  });

  prueba('lee los cuatro movimientos quitándoles el tipo de delante', () => {
    igual(e.movimientos, ['Placaje', 'Maquinación', 'Tormento', 'Rodar']);
  });

  prueba('ignora Estadísticas, Objeto: Ninguno y Marcas sin quejarse', () => {
    igual(r.avisos, []);
  });

  prueba('avisa de que ha traducido Desenrollar, en vez de hacerlo en silencio', () => {
    const t = r.resoluciones.find((x) => x.entrada === 'Desenrollar');
    cierto(t, JSON.stringify(r.resoluciones));
    igual(t.valor, 'Rodar');
    igual(t.via, 'alias-cliente');
  });
});

bloque('importar: tolerancia', () => {
  prueba('sin dos puntos, como los pierde el OCR', () => {
    const e = importar('Chimchar ♀\nIVs 19/30/15/23/21/31\nNaturaleza agitada', datos).ejemplares[0];
    igual(e.especie, 'Chimchar');
    igual(e.ivs.velocidad, 31);
    igual(e.naturaleza, 'Agitada');
  });

  prueba('el orden de las líneas da igual', () => {
    const e = importar('Naturaleza: Agitada\nIVs: 0/0/0/0/0/31\nChimchar ♂', datos).ejemplares[0];
    igual(e.especie, 'Chimchar');
    igual(e.sexo, SEXOS.MACHO);
    igual(e.naturaleza, 'Agitada');
  });

  prueba('acepta el nombre primero y el nivel después', () => {
    const e = importar('Chimchar ♀ Nv. 7\nIVs: 31/0/0/0/0/0', datos).ejemplares[0];
    igual(e.especie, 'Chimchar');
    igual(e.nivel, 7);
  });

  prueba('acepta características línea a línea', () => {
    const e = importar('Larvitar ♂\nPS: 31\nAtaque: 31\nVelocidad: 12', datos).ejemplares[0];
    igual(e.ivs.ps, 31);
    igual(e.ivs.ataque, 31);
    igual(e.ivs.velocidad, 12);
  });

  prueba('recorta lo que pase del tope y lo dice', () => {
    const r = importar('Larvitar\nIVs: 99/31/0/0/0/0', datos);
    igual(r.ejemplares[0].ivs.ps, 31);
    cierto(r.avisos.some((a) => a.includes('tope')), JSON.stringify(r.avisos));
  });

  prueba('varios Pokémon separados por línea en blanco', () => {
    const r = importar(PLANTILLA, datos);
    igual(r.ejemplares.length, 2);
    igual(r.ejemplares[0].especie, 'Chimchar');
    igual(r.ejemplares[1].especie, 'Rattata');
    igual(r.ejemplares[1].sexo, SEXOS.MACHO);
  });

  prueba('varias fichas seguidas sin línea en blanco, como un volcado de OCR', () => {
    const r = importar(`${FICHA_DEL_JUEGO}\nNv. 5 Rattata ♂\nIVs: 31/0/0/0/0/0`, datos);
    igual(r.ejemplares.length, 2);
    igual(r.ejemplares.map((e) => e.especie), ['Chimchar', 'Rattata']);
  });

  prueba('un movimiento que no existe se avisa y no se guarda inventado', () => {
    const r = importar('Larvitar\nMovimientos: Terremoto, Movimiento Falso Que No Existe', datos);
    igual(r.ejemplares[0].movimientos, ['Terremoto']);
    cierto(r.avisos.some((a) => a.includes('Falso')), JSON.stringify(r.avisos));
  });

  prueba('más de cuatro movimientos se recortan avisando', () => {
    const r = importar('Larvitar\nMovimientos: Terremoto, Mordisco, Triturar, Maldición, Excavar', datos);
    igual(r.ejemplares[0].movimientos.length, 4);
    cierto(r.avisos.some((a) => a.includes('cuatro')), JSON.stringify(r.avisos));
  });

  prueba('una especie que no existe se dice, no se adivina', () => {
    const r = importar('Pikachurin ♂\nIVs: 31/0/0/0/0/0', datos);
    cierto(r.avisos.some((a) => a.includes('especie')), JSON.stringify(r.avisos));
  });
});

bloque('importar: CSV y JSON', () => {
  prueba('detecta el formato por la forma del contenido', () => {
    igual(detectarFormato('[]'), 'json');
    igual(detectarFormato('especie,sexo,ivs\nLarvitar,♂,31/0/0/0/0/0'), 'csv');
    igual(detectarFormato('Larvitar ♂'), 'texto');
    igual(detectarFormato('   '), 'vacio');
  });

  prueba('un CSV con cabecera se lee con el mismo parser que el texto', () => {
    const r = importar(
      'especie,sexo,ivs,naturaleza,movimientos\nChimchar,♀,19/30/15/23/21/31,agitada,Placaje/Desenrollar',
      datos,
    );
    igual(r.ejemplares.length, 1);
    const e = r.ejemplares[0];
    igual(e.especie, 'Chimchar');
    igual(e.sexo, SEXOS.HEMBRA);
    igual(e.ivs.velocidad, 31);
    igual(e.naturaleza, 'Agitada');
    // El CSV pasa por el mismo resolutor, así que también traduce.
    igual(e.movimientos, ['Placaje', 'Rodar']);
  });

  prueba('un CSV con punto y coma también', () => {
    const r = importar('especie;sexo;ivs\nLarvitar;♂;31/0/0/0/0/0', datos);
    igual(r.ejemplares[0].especie, 'Larvitar');
  });

  prueba('un JSON exportado por la app se vuelve a importar igual', () => {
    const original = [{
      especie: 'Larvitar', sexo: SEXOS.MACHO, naturaleza: 'Audaz',
      ivs: { ps: 31, ataque: 31, defensa: 0, 'at-esp': 0, 'def-esp': 0, velocidad: 0 },
      movimientos: ['Terremoto'],
    }];
    const r = importar(JSON.stringify(original), datos);
    igual(r.formato, 'json');
    igual(r.ejemplares[0].especie, 'Larvitar');
    igual(r.ejemplares[0].ivs.ataque, 31);
    igual(r.ejemplares[0].movimientos, ['Terremoto']);
  });

  prueba('un JSON roto se dice, no se tira la app', () => {
    const r = importar('{esto no es json', datos);
    igual(r.ejemplares, []);
    cierto(r.avisos[0].includes('mal formado'), r.avisos[0]);
  });
});

bloque('importar: bloques', () => {
  prueba('la línea de guiones separa fichas', () => {
    igual(partirEnBloques('a\n---\nb').length, 2);
  });
  prueba('las líneas vacías no generan bloques fantasma', () => {
    igual(partirEnBloques('\n\n\na\n\n\n').length, 1);
  });
  prueba('el importador nunca devuelve un ejemplar sin normalizar', () => {
    for (const e of importar(PLANTILLA, datos).ejemplares) {
      for (const s of STATS) {
        cierto(Number.isInteger(e.ivs[s]), `${e.especie}: iv ${s} no es entero`);
        cierto(e.ivs[s] >= 0 && e.ivs[s] <= 31, `${e.especie}: iv ${s} fuera de rango`);
      }
      cierto(Array.isArray(e.movimientos));
      cierto(e.id, 'falta el id');
    }
  });
});
