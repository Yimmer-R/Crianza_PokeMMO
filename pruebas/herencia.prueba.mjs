// Comprueba la matemática de herencia contra las tablas de wiki/mecanicas/Crianza.md.
import { bloque, prueba, igual, cerca, cierto, falso } from './marco.mjs';
import {
  ivsGarantizados, distribucionDe, probabilidadDe, probabilidadDelCruce,
  tablaShiny, topeGarantizable, RECIO_DE, PIEDRAETERNA, statQueFuerza, perfectos,
} from '../src/nucleo/herencia.js';

const ivs = (o = {}) => ({ ps: 0, ataque: 0, defensa: 0, 'at-esp': 0, 'def-esp': 0, velocidad: 0, ...o });

bloque('herencia: IVs garantizados', () => {
  prueba('el promedio de 31 y 31 es 31, así que un IV compartido sale seguro sin objetos', () => {
    const r = ivsGarantizados(ivs({ ataque: 31 }), ivs({ ataque: 31 }));
    igual([...r.garantizados], ['ataque']);
    igual([...r.compartidos], ['ataque']);
  });

  prueba('dos 1×31 distintos SIN objetos no garantizan nada: el promedio de 31 y 0 es 15', () => {
    const r = ivsGarantizados(ivs({ ataque: 31 }), ivs({ velocidad: 31 }));
    igual([...r.garantizados], []);
  });

  prueba('dos 1×31 distintos CON sus Recios dan un 2×31: es el primer paso de toda cadena', () => {
    const r = ivsGarantizados(
      ivs({ ataque: 31 }), ivs({ velocidad: 31 }),
      RECIO_DE.ataque, RECIO_DE.velocidad,
    );
    igual([...r.garantizados].sort(), ['ataque', 'velocidad']);
    igual(r.desperdiciados, []);
  });

  prueba('un Recio sobre un IV que el portador no tiene a 31 se gasta para nada', () => {
    const r = ivsGarantizados(ivs({ ataque: 31 }), ivs({ velocidad: 31 }), RECIO_DE.defensa, null);
    igual([...r.garantizados], []);
    igual(r.desperdiciados, [RECIO_DE.defensa]);
  });

  prueba('un Recio sobre un IV que ya comparten los dos padres también se desperdicia', () => {
    const r = ivsGarantizados(ivs({ ataque: 31 }), ivs({ ataque: 31 }), RECIO_DE.ataque, null);
    igual([...r.garantizados], ['ataque']);
    igual(r.desperdiciados, [RECIO_DE.ataque]);
  });

  prueba('dos 2×31 que comparten un IV dan un 3×31 (compartido + dos forzados)', () => {
    const a = ivs({ ps: 31, ataque: 31 });
    const b = ivs({ ps: 31, velocidad: 31 });
    const r = ivsGarantizados(a, b, RECIO_DE.ataque, RECIO_DE.velocidad);
    igual([...r.garantizados].sort(), ['ataque', 'ps', 'velocidad']);
  });

  prueba('dos 4×31 que comparten tres IVs dan un 5×31', () => {
    const a = ivs({ ps: 31, ataque: 31, defensa: 31, velocidad: 31 });
    const b = ivs({ ps: 31, ataque: 31, defensa: 31, 'def-esp': 31 });
    const r = ivsGarantizados(a, b, RECIO_DE.velocidad, RECIO_DE['def-esp']);
    igual([...r.garantizados].sort(), ['ataque', 'def-esp', 'defensa', 'ps', 'velocidad']);
  });

  prueba('la Piedraeterna no fuerza ningún IV: gasta un hueco de objeto', () => {
    igual(statQueFuerza(PIEDRAETERNA), null);
    const r = ivsGarantizados(ivs({ ataque: 31 }), ivs({ velocidad: 31 }), PIEDRAETERNA, RECIO_DE.velocidad);
    igual([...r.garantizados], ['velocidad']); // el 31 en Ataque de la madre se pierde
  });

  prueba('el tope garantizable es compartidos + 2, y + 1 si hay naturaleza', () => {
    igual(topeGarantizable(3, false), 5);
    igual(topeGarantizable(3, true), 4);
  });
});

bloque('herencia: tablas de probabilidad', () => {
  prueba('sin objetos el reparto es 25 / 50 / 25', () => {
    const d = distribucionDe('ataque', ivs({ ataque: 31 }), ivs({ ataque: 0 }));
    const alto = d.find((x) => x.valor === 31);
    const medio = d.find((x) => x.valor === 15); // floor(31/2)
    const bajo = d.find((x) => x.valor === 0);
    cerca(alto.probabilidad, 0.25, 1e-9, 'el IV alto');
    cerca(medio.probabilidad, 0.5, 1e-9, 'el promedio, redondeado hacia abajo');
    cerca(bajo.probabilidad, 0.25, 1e-9, 'el IV bajo');
  });

  prueba('con un objeto en juego el reparto pasa a 20 / 60 / 20', () => {
    const d = distribucionDe('ataque', ivs({ ataque: 31 }), ivs({ ataque: 0 }), RECIO_DE.velocidad, null);
    cerca(d.find((x) => x.valor === 31).probabilidad, 0.20);
    cerca(d.find((x) => x.valor === 15).probabilidad, 0.60);
  });

  prueba('con dos objetos, 3 de cada 4 veces sale el promedio (12,5 / 75 / 12,5)', () => {
    const d = distribucionDe('ataque', ivs({ ataque: 31 }), ivs({ ataque: 0 }), RECIO_DE.velocidad, RECIO_DE.ps);
    cerca(d.find((x) => x.valor === 31).probabilidad, 0.125);
    cerca(d.find((x) => x.valor === 15).probabilidad, 0.75);
  });

  prueba('un IV forzado por su Recio sale al 100 %', () => {
    cerca(probabilidadDe('ataque', ivs({ ataque: 31 }), ivs(), RECIO_DE.ataque, null), 1);
  });

  prueba('un IV que los dos padres tienen a 31 sale al 100 % aunque nadie lleve objeto', () => {
    cerca(probabilidadDe('ataque', ivs({ ataque: 31 }), ivs({ ataque: 31 })), 1);
  });

  prueba('cada rama de la tabla suma 1 en total', () => {
    for (const objetos of [[null, null], [RECIO_DE.ps, null], [RECIO_DE.ps, RECIO_DE.defensa]]) {
      const d = distribucionDe('ataque', ivs({ ataque: 31 }), ivs({ ataque: 7 }), ...objetos);
      cerca(d.reduce((a, x) => a + x.probabilidad, 0), 1, 1e-9, `objetos: ${objetos}`);
    }
  });

  prueba('los IVs son independientes: la probabilidad del cruce es el producto', () => {
    const a = ivs({ ataque: 31, velocidad: 31 });
    const b = ivs({ ataque: 31, velocidad: 0 });
    const r = probabilidadDelCruce(['ataque', 'velocidad'], a, b);
    cerca(r.porStat.ataque, 1);
    cerca(r.porStat.velocidad, 0.25);
    cerca(r.total, 0.25);
    cerca(r.intentosEsperados, 4);
  });

  prueba('la tabla shiny sale tal cual la publica la wiki, en "n de m"', () => {
    igual(tablaShiny(0).maximo, { n: 2, m: 6, probabilidad: 2 / 6 });
    igual(tablaShiny(2).mitad, { n: 0, m: 4, probabilidad: 0 });
  });
});

bloque('herencia: utilidades', () => {
  prueba('perfectos() devuelve sólo los IVs a 31', () => {
    igual([...perfectos(ivs({ ps: 31, ataque: 30, velocidad: 31 }))].sort(), ['ps', 'velocidad']);
  });
  prueba('cada IV tiene su Recio y no se repiten', () => {
    igual(new Set(Object.values(RECIO_DE)).size, 6);
  });
});
