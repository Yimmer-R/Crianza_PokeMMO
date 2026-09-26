// Hora del juego y estación: lo que decide si el Pokémon está ahí cuando entras.
//
// Se prueba contra los JSON reales, así que si la extracción pierde el sufijo
// de las zonas estas pruebas lo ven: sin él no quedaría ninguna fila restringida.
import { bloque, prueba, igual, cierto, falso } from './marco.mjs';
import { datos, ivs } from './datos-de-prueba.mjs';
import {
  disponibleAhora, porQueNoAhora, cuandoLegible, tieneRestriccion, ordenarPorCuando,
  CUANDO_CUALQUIERA,
} from '../src/nucleo/cuando.js';
import { HORAS, ESTACIONES, REGIONES } from '../src/nucleo/constantes.js';
import { planearEvs } from '../src/nucleo/entrenamiento.js';
import { planDeCapturas } from '../src/nucleo/capturas.js';
import { planear } from '../src/nucleo/planificador.js';

const deNoche = { horas: ['noche'], estaciones: [...ESTACIONES] };
const soloInvierno = { horas: [...HORAS], estaciones: ['invierno'] };
const siempre = { horas: [...HORAS], estaciones: [...ESTACIONES] };

bloque('cuándo: la hora y la estación de una fila', () => {
  prueba('sin filtro todo está disponible', () => {
    for (const f of [deNoche, soloInvierno, siempre]) cierto(disponibleAhora(f, CUANDO_CUALQUIERA));
  });

  prueba('una tabla de noche no existe de día', () => {
    falso(disponibleAhora(deNoche, { hora: 'día', estacion: null }));
    cierto(disponibleAhora(deNoche, { hora: 'noche', estacion: null }));
    cierto(disponibleAhora(deNoche, { hora: null, estacion: 'invierno' }));
  });

  prueba('dice por qué no, y si la espera son minutos o semanas', () => {
    igual(porQueNoAhora(siempre, { hora: 'día', estacion: 'verano' }), null);
    igual(porQueNoAhora(deNoche, { hora: 'día' }).espera, 'hora');
    igual(porQueNoAhora(soloInvierno, { estacion: 'verano' }).espera, 'estacion');
    // Si falla la estación, esperar a la estación es lo que manda aunque también
    // falle la hora: es la espera larga.
    igual(porQueNoAhora({ horas: ['noche'], estaciones: ['invierno'] },
      { hora: 'día', estacion: 'verano' }).espera, 'estacion');
  });

  prueba('lo legible se entiende sin mirar el objeto', () => {
    igual(cuandoLegible(siempre), 'siempre');
    igual(cuandoLegible(deNoche), 'noche');
    igual(cuandoLegible(soloInvierno), 'en invierno');
    igual(cuandoLegible({ horas: ['mañana', 'día'], estaciones: ['primavera'] }),
      'mañana o día, en primavera');
    falso(tieneRestriccion(siempre));
    cierto(tieneRestriccion(deNoche));
  });

  prueba('ordenar pone delante lo de ahora, y la espera corta antes que la larga', () => {
    const lista = [soloInvierno, deNoche, siempre];
    const orden = ordenarPorCuando(lista, { hora: 'día', estacion: 'verano' });
    igual(orden[0], siempre, 'lo que vale siempre va primero');
    igual(orden[1], deNoche, 'esperar a la noche son minutos');
    igual(orden[2], soloInvierno, 'esperar al invierno son semanas');
  });
});

bloque('cuándo: los datos reales lo traen', () => {
  prueba('hay encuentros restringidos, o sea que el sufijo de las zonas no se perdió', () => {
    const filas = Object.values(datos.encuentros).flat();
    const restringidos = filas.filter(tieneRestriccion);
    cierto(restringidos.length > 100, `sólo ${restringidos.length} de ${filas.length} restringidos`);
    for (const f of filas) {
      cierto(f.horas.every((h) => HORAS.includes(h)), `hora rara: ${f.horas}`);
      cierto(f.estaciones.every((e) => ESTACIONES.includes(e)), `estación rara: ${f.estaciones}`);
    }
  });

  prueba('las hordas de EVs también, y sale de la columna «Cuándo»', () => {
    const hordas = Object.values(datos.dondeEntrenar).flat();
    cierto(hordas.filter(tieneRestriccion).length > 50);
  });

  prueba('el nombre de la zona ya no arrastra ningún paréntesis', () => {
    // Ni el de hora/estación ni el número de variante, y hay zonas con LOS DOS
    // a la vez («Ruta 13 (noche) (2)»), que es lo que se colaba quitando sólo
    // el último paréntesis.
    const zonas = [
      ...Object.values(datos.encuentros).flat(),
      ...Object.values(datos.dondeEntrenar).flat(),
    ].map((e) => e.zona);
    const sucias = [...new Set(zonas.filter((z) => z.includes('(')))];
    igual(sucias, [], `zonas con paréntesis en el nombre: ${sucias.slice(0, 5).join(' · ')}`);
  });
});

bloque('cuándo: capturas y entrenamiento lo respetan', () => {
  const objetivo = {
    especie: 'Larvitar', ivs: ivs({ ataque: 31, velocidad: 31 }), evs: {},
    movimientos: [], naturaleza: null,
  };

  prueba('las zonas que sirven ahora salen antes que las que no', () => {
    const plan = planear(objetivo, datos, { regionesDisponibles: REGIONES });
    for (const hora of HORAS) {
      const capturas = planDeCapturas(plan, datos, REGIONES, { hora, estacion: null });
      for (const c of capturas) {
        if (!c.recomendada) continue;
        const z = c.recomendada.zonas;
        const primerNo = z.findIndex((x) => x.noAhora);
        const ultimoSi = z.map((x) => !x.noAhora).lastIndexOf(true);
        if (primerNo !== -1 && ultimoSi !== -1)
          cierto(primerNo > ultimoSi, `en ${hora} hay una zona que no sirve por delante de una que sí`);
      }
    }
  });

  prueba('entrenar de noche no propone una horda que sólo sale de día', () => {
    const plan = planearEvs({ velocidad: 252 }, {}, datos, {
      regionesDisponibles: REGIONES, nivel: 50, cuando: { hora: 'noche', estacion: null },
    });
    const vel = plan.porStat.find((s) => s.stat === 'velocidad');
    cierto(vel.hordas.length, 'debería haber hordas de Velocidad');
    cierto(vel.mejor.horas.includes('noche'), `la mejor horda es ${vel.mejor.horas}`);
    cierto(vel.hordasAhora > 0);
  });

  prueba('el filtro no esconde hordas: cambia el orden y marca las que no tocan', () => {
    const de = (cuando) => planearEvs({ velocidad: 252 }, {}, datos, {
      regionesDisponibles: REGIONES, nivel: 50, cuando,
    }).porStat.find((s) => s.stat === 'velocidad');

    const sinFiltro = de(undefined);
    const conFiltro = de({ hora: 'noche', estacion: 'invierno' });
    igual(conFiltro.hordasTotales, sinFiltro.hordasTotales, 'no puede desaparecer ninguna');
    cierto(conFiltro.hordasAhora < conFiltro.hordasTotales,
      'con noche+invierno tiene que haber alguna que no sirva');
    cierto(conFiltro.hordas.every((h) => h.ahora),
      'y las seis que se enseñan tienen que ser de las que sí sirven');
  });
});
