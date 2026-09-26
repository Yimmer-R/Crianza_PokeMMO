// El orden en que se aprende cada movimiento, contando con las evoluciones.
//
// Contra los JSON reales: los casos de abajo son Pokémon concretos, así que si
// la extracción cambia sus listas estas pruebas lo ven.
import { bloque, prueba, igual, cierto, falso } from './marco.mjs';
import { datos, ivs } from './datos-de-prueba.mjs';
import {
  lineaEvolutiva, nivelDeEvolucion, comoAprender, guiaDeAprendizaje, RECORDADOR,
} from '../src/nucleo/aprendizaje.js';
import { validarObjetivo, movimientosSoloDeHuevo, viasEnLaLinea, planear } from '../src/nucleo/planificador.js';
import { REGIONES } from '../src/nucleo/constantes.js';

bloque('aprendizaje: la línea evolutiva', () => {
  prueba('va de la base a la forma pedida, con la condición de cada salto', () => {
    const l = lineaEvolutiva('Tyranitar', datos.pokedex);
    igual(l.map((x) => x.especie), ['Larvitar', 'Pupitar', 'Tyranitar']);
    igual(l[1].nivel, 30);
    igual(l[2].nivel, 55);
    igual(l[0].desde, null);
  });

  prueba('una evolución por objeto no tiene nivel', () => {
    const l = lineaEvolutiva('Starmie', datos.pokedex);
    igual(l.map((x) => x.especie), ['Staryu', 'Starmie']);
    igual(l[1].nivel, null, 'la Piedra Agua no es un nivel');
    cierto(/Piedra Agua/.test(l[1].condicion));
  });

  prueba('una especie sin evoluciones es una línea de uno', () => {
    igual(lineaEvolutiva('Ditto', datos.pokedex).map((x) => x.especie), ['Ditto']);
  });

  prueba('el nivel se saca de la condición, no se adivina', () => {
    igual(nivelDeEvolucion('al subir al nivel 30'), 30);
    igual(nivelDeEvolucion('usando [[Piedra Agua]]'), null);
    igual(nivelDeEvolucion(null), null);
  });
});

bloque('aprendizaje: cómo conseguir cada movimiento', () => {
  prueba('lo que se enseña con MT no condiciona nada', () => {
    const r = comoAprender('Rugido', 'Tyranitar', datos);
    igual(r.situacion, 'mt');
  });

  prueba('un movimiento de nivel 1 lo sabe de salida', () => {
    const r = comoAprender('Hidrobomba', 'Starmie', datos);
    igual(r.situacion, 'nivel');
    igual(r.nivel, 1);
  });

  prueba('un movimiento huevo de la BASE se resuelve criando, no evolucionando', () => {
    // El fallo que esto vigila: Polvo Veneno no está en ninguna lista de
    // Amoonguss, así que la app lo daba por imposible. Es movimiento huevo de
    // Foongus, que es lo que sale del huevo.
    const r = comoAprender('Polvo Veneno', 'Amoonguss', datos);
    igual(r.situacion, 'huevo');
    cierto(/Foongus/.test(r.texto), r.texto);
    cierto(/nació con él|nació con el/.test(r.texto), 'tiene que decir que después no se puede añadir');
  });

  prueba('si sólo lo tiene una fase anterior, se entra por la MÁS TARDÍA que pueda', () => {
    // Ludicolo: Lotad lo trae de huevo, pero Lombre lo aprende al evolucionar.
    // Entrar por Lombre es una evolución menos de arrastre.
    const r = comoAprender('Hoja Afilada', 'Ludicolo', datos);
    igual(r.situacion, 'antesDeEvolucionar');
    igual(r.enFases.map((f) => f.especie), ['Lotad', 'Lombre']);
    cierto(/Lombre/.test(r.texto), r.texto);
    falso(r.hayQueRetrasar, 'la Piedra Agua no tiene nivel, así que no hay nada que retrasar');
  });

  prueba('lo que nadie de la línea aprende se dice, no se inventa', () => {
    const r = comoAprender('Hidrobomba', 'Amoonguss', datos);
    igual(r.situacion, 'imposible');
  });

  prueba('el recordador se cita donde toca y no donde no', () => {
    igual(comoAprender('Rugido', 'Tyranitar', datos).texto.includes(RECORDADOR), false);
    const conRecordador = comoAprender('Hidrobomba', 'Starmie', datos);
    cierto(conRecordador.texto.includes(RECORDADOR));
  });
});

bloque('aprendizaje: la guía entera', () => {
  const objetivo = { especie: 'Amoonguss', movimientos: ['Polvo Veneno', 'Gigadrenado'], habilidad: null };

  prueba('separa lo que va al criar de lo que va al final', () => {
    const g = guiaDeAprendizaje(objetivo, datos);
    igual(g.deHuevo.map((e) => e.movimiento), ['Polvo Veneno']);
    cierto(g.orden.length >= 2);
    igual(g.orden[0].cuando, 'al criar', 'lo del huevo va primero: no se puede añadir después');
  });

  prueba('pide Escamas Corazón sólo si hace falta el recordador', () => {
    const g = guiaDeAprendizaje(objetivo, datos);
    cierto(g.objetos.includes('Esc. Corazón'));
    const soloMt = guiaDeAprendizaje({ especie: 'Tyranitar', movimientos: ['Rugido'] }, datos);
    falso(soloMt.objetos.includes('Esc. Corazón'));
  });
});

bloque('aprendizaje: el plan de crianza cuenta los movimientos huevo de la línea', () => {
  const objetivo = {
    especie: 'Amoonguss', ivs: ivs({ ps: 31, defensa: 31 }), evs: {},
    movimientos: ['Polvo Veneno'], naturaleza: null,
  };

  prueba('el objetivo ya no se rechaza por mirar sólo la forma final', () => {
    const v = validarObjetivo(objetivo, datos);
    cierto(v.valido, JSON.stringify(v.problemas));
    cierto(v.avisos.some((a) => /Polvo Veneno/.test(a)), 'pero sí avisa de que hay que arrastrarlo');
  });

  prueba('viasEnLaLinea encuentra lo que vias() sola no ve', () => {
    igual(viasEnLaLinea('Amoonguss', 'Polvo Veneno', datos.pokedex).map((v) => v.especie), ['Foongus']);
  });

  prueba('el plan ata el padre del cruce final al movimiento', () => {
    igual(movimientosSoloDeHuevo(objetivo, datos.pokedex), ['Polvo Veneno']);
    const plan = planear(objetivo, datos, { regionesDisponibles: REGIONES });
    cierto(plan.ok, JSON.stringify(plan.problemas));
    igual(plan.movimientosDeHuevo, ['Polvo Veneno']);
    const atados = plan.pasos.conseguir.filter((r) => r.movimientos.length);
    igual(atados.length, 1, 'un solo hueco atado: el padre del cruce final');
    igual(atados[0].movimientos, ['Polvo Veneno']);
  });
});
