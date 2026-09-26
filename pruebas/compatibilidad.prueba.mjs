// Compatibilidad de crianza, contra los datos reales de la wiki.
import { bloque, prueba, igual, cierto, falso } from './marco.mjs';
import { datos } from './datos-de-prueba.mjs';
import {
  puedenCriar, padresCompatibles, gruposEnComun, sinGenero, esEsteril,
  costeElegirSexo, sirveComoLineaMaterna, sexosPosibles,
} from '../src/nucleo/compatibilidad.js';
import { PRECIO_ELEGIR_SEXO, SEXOS } from '../src/nucleo/constantes.js';

const { pokedex } = datos;

bloque('compatibilidad: el caso que describe el usuario', () => {
  prueba('Chimchar ♀ × Rattata ♂ da Chimchar, porque la especie la pone la madre', () => {
    const r = puedenCriar(
      { especie: 'Chimchar', sexo: SEXOS.HEMBRA },
      { especie: 'Rattata', sexo: SEXOS.MACHO },
      pokedex,
    );
    cierto(r.puede, r.motivo);
    igual(r.especieCria, 'Chimchar');
    igual(r.gruposEnComun, ['Campo']);
  });

  prueba('al revés sale Rattata: Chimchar ♂ × Rattata ♀ NO da Chimchar', () => {
    const r = puedenCriar(
      { especie: 'Chimchar', sexo: SEXOS.MACHO },
      { especie: 'Rattata', sexo: SEXOS.HEMBRA },
      pokedex,
    );
    cierto(r.puede);
    igual(r.especieCria, 'Rattata');
  });
});

bloque('compatibilidad: reglas', () => {
  prueba('dos del mismo sexo no crían', () => {
    const r = puedenCriar(
      { especie: 'Rattata', sexo: SEXOS.MACHO },
      { especie: 'Rattata', sexo: SEXOS.MACHO },
      pokedex,
    );
    falso(r.puede);
    cierto(r.motivo.includes('sexos opuestos'), r.motivo);
  });

  prueba('sin grupo huevo en común no crían', () => {
    const r = puedenCriar(
      { especie: 'Larvitar', sexo: SEXOS.HEMBRA }, // Monstruo
      { especie: 'Rattata', sexo: SEXOS.MACHO },   // Campo
      pokedex,
    );
    falso(r.puede);
    cierto(r.motivo.includes('grupo huevo'), r.motivo);
  });

  prueba('Ditto cría con cualquiera y la especie sale del otro', () => {
    const r = puedenCriar(
      { especie: 'Ditto', sexo: SEXOS.SIN_GENERO },
      { especie: 'Larvitar', sexo: SEXOS.MACHO },
      pokedex,
    );
    cierto(r.puede, r.motivo);
    igual(r.especieCria, 'Larvitar');
    igual(r.via, 'ditto');
  });

  prueba('dos Ditto no crían entre sí', () => {
    const r = puedenCriar(
      { especie: 'Ditto', sexo: SEXOS.SIN_GENERO },
      { especie: 'Ditto', sexo: SEXOS.SIN_GENERO },
      pokedex,
    );
    falso(r.puede);
  });

  prueba('una especie sin género sólo cría con Ditto', () => {
    cierto(sinGenero(pokedex.Magnemite));
    const conDitto = puedenCriar(
      { especie: 'Magnemite', sexo: SEXOS.SIN_GENERO },
      { especie: 'Ditto', sexo: SEXOS.SIN_GENERO },
      pokedex,
    );
    cierto(conDitto.puede, conDitto.motivo);
    const sinDitto = puedenCriar(
      { especie: 'Magnemite', sexo: SEXOS.SIN_GENERO },
      { especie: 'Rattata', sexo: SEXOS.HEMBRA },
      pokedex,
    );
    falso(sinDitto.puede);
  });

  prueba('el grupo "No cría" no cría ni con Ditto', () => {
    cierto(esEsteril(pokedex.Happiny));
    const r = puedenCriar(
      { especie: 'Happiny', sexo: SEXOS.HEMBRA },
      { especie: 'Ditto', sexo: SEXOS.SIN_GENERO },
      pokedex,
    );
    falso(r.puede);
  });

  prueba('una especie de sólo machos (Tauros) no puede hacer de línea materna sin Ditto', () => {
    igual(sexosPosibles(pokedex.Tauros), [SEXOS.MACHO]);
    const r = sirveComoLineaMaterna({ especie: 'Tauros', sexo: SEXOS.MACHO }, 'Tauros', pokedex);
    cierto(r.sirve);
    cierto(r.necesitaDitto, 'tendría que avisar de que hace falta Ditto');
  });

  prueba('la cría sale siempre en la forma base: Snorlax da Munchlax', () => {
    const r = puedenCriar(
      { especie: 'Snorlax', sexo: SEXOS.HEMBRA },
      { especie: 'Larvitar', sexo: SEXOS.MACHO },
      pokedex,
    );
    cierto(r.puede, r.motivo);
    igual(r.especieCria, 'Munchlax');
  });
});

bloque('compatibilidad: padres posibles', () => {
  prueba('un Larvitar hembra tiene padres del grupo Monstruo, y Ditto', () => {
    const lista = padresCompatibles('Larvitar', pokedex);
    cierto(lista.length > 10, `sólo he encontrado ${lista.length}`);
    cierto(lista.some((c) => c.especie === 'Ditto'));
    for (const c of lista) {
      if (c.via === 'ditto') continue;
      cierto(c.grupos.includes('Monstruo'), `${c.especie} no comparte Monstruo`);
      cierto((pokedex[c.especie].genero.macho ?? 0) > 0, `${c.especie} no puede ser macho`);
    }
  });

  prueba('ningún padre propuesto es estéril ni sin género', () => {
    for (const c of padresCompatibles('Chimchar', pokedex, { incluirDitto: false })) {
      falso(esEsteril(pokedex[c.especie]), `${c.especie} es estéril`);
      falso(sinGenero(pokedex[c.especie]), `${c.especie} no tiene género`);
    }
  });
});

bloque('compatibilidad: precio de elegir el sexo', () => {
  prueba('en una especie 50/50 cuesta 5.000 y el dato está confirmado', () => {
    const r = costeElegirSexo('Rattata', SEXOS.HEMBRA, pokedex, PRECIO_ELEGIR_SEXO);
    igual(r.precio, 5000);
    igual(r.confianza, 'confirmado');
  });

  prueba('una hembra de Chimchar (12,5 %) cuesta 25.000: es el tramo 7:1 de la wiki', () => {
    const r = costeElegirSexo('Chimchar', SEXOS.HEMBRA, pokedex, PRECIO_ELEGIR_SEXO);
    igual(r.ratio, 12.5);
    igual(r.precio, 25000);
    igual(r.confianza, 'confirmado');
  });

  prueba('un macho de Chimchar (87,5 %) cae en el tramo barato', () => {
    igual(costeElegirSexo('Chimchar', SEXOS.MACHO, pokedex, PRECIO_ELEGIR_SEXO).precio, 5000);
  });

  prueba('el tramo 3:1 va marcado como estimado, porque la wiki no lo publica', () => {
    const conRatio25 = Object.entries(pokedex).find(([, p]) => p.genero?.hembra === 25);
    const r = costeElegirSexo(conRatio25[0], SEXOS.HEMBRA, pokedex, PRECIO_ELEGIR_SEXO);
    igual(r.confianza, 'estimado');
  });

  prueba('una especie sin género no tiene precio de sexo', () => {
    igual(costeElegirSexo('Magnemite', SEXOS.HEMBRA, pokedex, PRECIO_ELEGIR_SEXO), null);
  });
});

bloque('sin género: cría con su línea o con Ditto, y nada más', () => {
  // Regla de PokeMMO, no de los juegos originales: «Genderless Pokémon can only
  // breed with their evolution line Pokémon and Ditto» (wiki/mecanicas/Crianza.md).
  const sg = { especie: 'Staryu', sexo: SEXOS.SIN_GENERO };
  const sg2 = { especie: 'Starmie', sexo: SEXOS.SIN_GENERO };
  const otroSg = { especie: 'Magnemite', sexo: SEXOS.SIN_GENERO };
  const ditto = { especie: 'Ditto', sexo: SEXOS.SIN_GENERO };

  prueba('dos de la misma línea evolutiva crían', () => {
    const r = puedenCriar(sg, sg2, datos.pokedex);
    cierto(r.puede, r.motivo);
    igual(r.especieCria, 'Staryu', 'la cría sale en la forma base de la línea');
    igual(r.via, 'misma-linea');
  });

  prueba('con Ditto también', () => {
    cierto(puedenCriar(sg, ditto, datos.pokedex).puede);
  });

  prueba('con otro sin género de OTRA línea, no', () => {
    const r = puedenCriar(sg, otroSg, datos.pokedex);
    falso(r.puede);
    cierto(/línea evolutiva/.test(r.motivo), r.motivo);
  });

  prueba('con una especie cualquiera de su grupo huevo, tampoco', () => {
    const r = puedenCriar(sg, { especie: 'Rattata', sexo: SEXOS.MACHO }, datos.pokedex);
    falso(r.puede);
  });

  prueba('padresCompatibles devuelve la línea y el Ditto, no el grupo huevo', () => {
    const lista = padresCompatibles('Staryu', datos.pokedex).map((x) => x.especie).sort();
    // La propia especie ENTRA, al contrario que con una especie con sexos: dos
    // Staryu crían entre sí porque están en la misma línea evolutiva.
    igual(lista, ['Ditto', 'Starmie', 'Staryu'], `devolvió ${lista.join(', ')}`);
    cierto(!lista.includes('Rattata'), 'nada del grupo huevo que no sea de su línea');
  });

  prueba('dos de la MISMA especie sin género crían', () => {
    const r = puedenCriar(sg, { especie: 'Staryu', sexo: SEXOS.SIN_GENERO }, datos.pokedex);
    cierto(r.puede, r.motivo);
  });

  prueba('sirve como línea materna sin necesitar Ditto obligatorio', () => {
    const r = sirveComoLineaMaterna(sg, 'Starmie', datos.pokedex);
    cierto(r.sirve);
    falso(r.necesitaDitto, 'sin sexos no hace falta un Ditto por fuerza');
  });

  prueba('no se paga por el sexo de algo que no tiene sexo', () => {
    igual(costeElegirSexo('Staryu', SEXOS.HEMBRA, datos.pokedex, PRECIO_ELEGIR_SEXO), null);
  });
});
