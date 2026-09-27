// Los sprites: que la URL se arme bien y que la wiki los traiga todos.
//
// Corren contra `datos/sprites.json` de verdad, como el resto: si la extracción
// deja de encontrar las hojas de `wiki/sprites/`, tiene que verse aquí y no en
// una vista en blanco.

import { bloque, prueba, igual, cierto, falso } from './marco.mjs';
import { datos } from './datos-de-prueba.mjs';
import { urlSprite, altSprite, tieneSpriteDeHembra, VIA_3D, VIA_ANIMADO } from '../src/nucleo/sprites.js';
import { SEXOS } from '../src/nucleo/constantes.js';

const { sprites, pokedex } = datos;

bloque('sprites · los datos', () => {
  prueba('hay uno por cada Pokémon de la pokédex', () => {
    const sin = Object.keys(pokedex).filter((n) => !sprites.de[n]);
    igual(sin, [], 'Pokémon sin sprite');
  });

  prueba('el prefijo común está separado y no se repite en cada entrada', () => {
    cierto(sprites.base.startsWith('https://'), `base rara: ${sprites.base}`);
    cierto(sprites.base.endsWith('/'), 'la base tiene que cortar en una barra');
    const conProtocolo = Object.values(sprites.de).filter((s) => String(s.tresD).includes('://'));
    igual(conProtocolo.length, 0, 'alguna entrada repite el prefijo entero');
  });

  prueba('todos traen las dos vías: el 3D y el animado de 5ª', () => {
    const cojos = Object.entries(sprites.de).filter(([, s]) => !s.tresD || !s.frontal);
    igual(cojos.map(([n]) => n), []);
  });

  prueba('el sprite de hembra está sólo donde el juego dibuja distinto', () => {
    // 97 según la propia wiki (`raw/2026-09-27-sprites-pokeapi.md`). No es un
    // hueco que falten en las demás: es que no existen.
    const conHembra = Object.keys(sprites.de).filter((n) => tieneSpriteDeHembra(n, sprites));
    igual(conHembra.length, 97);
    cierto(conHembra.includes('Unfezant'), 'Unfezant sí se dibuja distinto');
    falso(tieneSpriteDeHembra('Larvitar', sprites), 'Larvitar no');
  });

  prueba('las formas con página propia no caen en el sprite de la especie base', () => {
    // Es el error que la wiki evitó a mano con los ids 10001-10018: resolver
    // «Rotom Calor» por nombre lo mandaba al Rotom de siempre.
    const rotom = urlSprite('Rotom', sprites);
    const calor = urlSprite('Rotom Calor', sprites);
    cierto(rotom !== calor, 'Rotom y Rotom Calor comparten sprite');
  });
});

bloque('sprites · armar la URL', () => {
  prueba('la vía por defecto es el render 3D', () => {
    cierto(urlSprite('Gible', sprites).endsWith('other/home/443.png'));
  });

  prueba('la vía animada da el gif de 5ª generación', () => {
    cierto(urlSprite('Gible', sprites, { via: VIA_ANIMADO })
      .endsWith('black-white/animated/443.gif'));
  });

  prueba('pedir hembra da la variante en las que la tienen', () => {
    cierto(urlSprite('Unfezant', sprites, { sexo: SEXOS.HEMBRA }).includes('/female/'));
    cierto(urlSprite('Unfezant', sprites, { sexo: SEXOS.HEMBRA, via: VIA_ANIMADO }).includes('/female/'));
  });

  prueba('pedir hembra donde no la hay devuelve la de siempre, no un hueco', () => {
    igual(urlSprite('Larvitar', sprites, { sexo: SEXOS.HEMBRA }), urlSprite('Larvitar', sprites));
  });

  prueba('un macho nunca coge la variante de hembra', () => {
    falso(urlSprite('Unfezant', sprites, { sexo: SEXOS.MACHO }).includes('/female/'));
    falso(urlSprite('Unfezant', sprites, { sexo: SEXOS.SIN_GENERO }).includes('/female/'));
  });

  prueba('una especie que no está no coge la de otra: devuelve null', () => {
    igual(urlSprite('Mewthree', sprites), null);
    igual(urlSprite('', sprites), null);
    igual(urlSprite('Gible', null), null);
    igual(urlSprite('Gible', { de: {} }), null);
  });

  prueba('la URL sale entera y sobre el volcado de PokeAPI que enlaza la wiki', () => {
    igual(
      urlSprite('Magikarp', sprites),
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/129.png',
    );
  });
});

bloque('sprites · el texto alternativo', () => {
  prueba('dice sólo la especie cuando el dibujo no cambia con el sexo', () => {
    igual(altSprite('Larvitar', sprites, SEXOS.HEMBRA), 'Larvitar');
    igual(altSprite('Gible', sprites), 'Gible');
  });

  prueba('dice el sexo cuando sí cambia', () => {
    igual(altSprite('Unfezant', sprites, SEXOS.HEMBRA), 'Unfezant hembra');
    igual(altSprite('Unfezant', sprites, SEXOS.MACHO), 'Unfezant macho');
  });

  prueba('VIA_3D y VIA_ANIMADO son las claves del JSON, no inventos', () => {
    cierto(VIA_3D in sprites.de.Gible);
    cierto(VIA_ANIMADO in sprites.de.Gible);
  });
});
