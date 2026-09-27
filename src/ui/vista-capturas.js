// Qué capturar, dónde, y cuántos intentos salen de media.
//
// El filtro de regiones se aplica antes de cualquier cosa: una sugerencia en una
// región que el usuario no tiene desbloqueada no es una sugerencia, es ruido.

import { el, tarjeta, plegable, chip, aviso, frag, tabla, numero, comoOportunidad } from './componentes.js';
import { NOMBRE_STAT } from '../nucleo/constantes.js';
import { obtener } from './estado.js';
import { planDeCapturas, regionesQueHacenFalta } from '../nucleo/capturas.js';
import { sinGenero } from '../nucleo/compatibilidad.js';
import { cuandoLegible, siglaDeHoras, siglaDeEstaciones } from '../nucleo/cuando.js';
import { selectorCuando } from './selector-cuando.js';

export function vistaCapturas(datos) {
  const { plan, regionesDisponibles, objetivo, cuando } = obtener();
  const sinGeneroObjetivo = sinGenero(datos.pokedex[objetivo.especie]);

  if (!plan?.ok)
    return tarjeta('Sin plan no hay capturas', [el('p.vacio', { texto: 'Define el objetivo primero.' })]);

  const capturas = planDeCapturas(plan, datos, regionesDisponibles, cuando);
  const regiones = regionesQueHacenFalta(plan, datos, regionesDisponibles, cuando);

  if (!capturas.length)
    return tarjeta('Nada que capturar', [
      el('p', {}, [chip('el inventario ya cubre la cadena entera', 'bien')]),
    ]);

  const cabecera = tarjeta('Cuándo estás jugando', [
    selectorCuando('cap'),
  ]);

  const resumen = tarjeta('Resumen', [
    el('div.etiquetas', {}, [
      chip(`${capturas.reduce((a, c) => a + c.cuantos, 0)} padres por conseguir`, 'ojo'),
      ...regiones.usadas.map((r) => chip(r, 'si')),
      ...regiones.bloqueadas.map((r) => chip(`${r} (bloqueada)`, 'mal')),
      cuando.hora ? chip(cuando.hora, 'si') : null,
      cuando.estacion ? chip(cuando.estacion, 'si') : null,
    ]),
    el('p.nota', {}, [
      'Los IVs no se pueden filtrar al capturar, así que la columna de intentos es una media, ',
      'no una promesa: cada IV suelto es 1 de 32.',
    ]),
    capturas.some((c) => c.soloGtl)
      ? aviso('Hay huecos que no se pueden cubrir capturando en tus regiones. Están marcados abajo.')
      : null,
  ]);

  // Agrupadas por la especie que se recomienda, no por el hueco.
  //
  // Casi todos los huecos son libres y acaban en la MISMA especie —la más fácil
  // de pillar del grupo huevo—, así que por hueco salían seis tarjetas con la
  // misma tabla de zonas repetida y la página medía cuatro pantallas. Lo que
  // cambia de un hueco a otro es qué IV buscas y con qué sexo, y eso cabe en una
  // fila. Dónde se captura depende sólo de la especie.
  const porEspecie = new Map();
  const fueraDeAlcance = [];
  for (const c of capturas) {
    if (c.soloGtl) { fueraDeAlcance.push(c); continue; }
    const clave = c.recomendada.especie;
    const ya = porEspecie.get(clave);
    if (ya) ya.push(c);
    else porEspecie.set(clave, [c]);
  }

  const queBuscar = (c) => {
    const req = c.requisito;
    // Hay huecos que no piden nada: sólo el sexo. Dejar la celda vacía parecía
    // un error, y es justo la captura más fácil de todas.
    if (!req.stats.length && !req.naturaleza) return 'cualquiera: no le pido IVs ni naturaleza';
    return (req.stats.length ? `31 en ${req.stats.map((x) => NOMBRE_STAT[x]).join(' + ')}` : '') +
      (req.naturaleza ? `${req.stats.length ? ' + ' : ''}naturaleza ${req.naturaleza}` : '');
  };

  const bloques = [...porEspecie.entries()].map(([especie, grupo]) => {
    // En la misma tarjeta pueden caer huecos de la espina y huecos libres: se
    // agrupa por la especie recomendada, y desde que la espina acepta la línea
    // entera es normal que coincidan. Manda el más estricto, que es la espina.
    const base = grupo.find((c) => !c.requisito.especieLibre) ?? grupo[0];
    const rec = base.recomendada;
    const cuantos = grupo.reduce((a, c) => a + c.cuantos, 0);
    const hayLibres = grupo.some((c) => c.requisito.especieLibre);
    const hayEspina = grupo.some((c) => !c.requisito.especieLibre);

    return tarjeta(`${especie} · ${cuantos} ${cuantos === 1 ? 'captura' : 'capturas'}`, [
      el('div.etiquetas', {}, [
        hayLibres
          ? chip(
              sinGeneroObjetivo ? 'hueco libre: su línea o un Ditto' : 'hueco libre: la especie no está atada',
              'si',
            )
          : null,
        hayEspina
          ? chip(
              rec.noSeCria ? 'sin hembras en la línea: la pareja tiene que ser un Ditto'
                : `espina materna: ${especie} o cualquiera de su línea`,
              'ojo',
            )
          : null,
        rec.gruposEnComun.length ? chip(`grupo huevo: ${rec.gruposEnComun.join(' / ')}`) : null,
        chip(`${rec.zonas.length} ${rec.zonas.length === 1 ? 'zona' : 'zonas'} a tu alcance`),
        (cuando.hora || cuando.estacion)
          ? chip(
              rec.zonasAhora ? `${rec.zonasAhora} ahora mismo` : 'ninguna ahora mismo',
              rec.zonasAhora ? 'bien' : 'mal',
            )
          : null,
      ]),
      // Lo que hay que hacer cuando la especie más fácil de pillar todavía no
      // puede criar, que es el caso de los 18 bebés.
      rec.noCria && rec.evolucionar
        ? aviso(
            `${especie} no cría: está en el grupo "No cría". Captúralo igual y evoluciónalo a `
            + `${rec.evolucionar.especie}${rec.evolucionar.condicion ? ` (${rec.evolucionar.condicion})` : ''}`
            + ' antes de cruzarlo.',
          )
        : null,
      rec.noSeCria
        ? aviso(
            'Un Ditto no se puede criar, así que este no sale de ningún cruce: hay que capturarlo '
            + 'o comprarlo ya con esos IVs. Es lo que hace cara una línea sin hembras.',
          )
        : null,
      (cuando.hora || cuando.estacion) && !rec.zonasAhora
        ? aviso(
            `Con ${[cuando.hora, cuando.estacion].filter(Boolean).join(' y ')} no sale en ninguna ` +
            'de estas zonas. La tabla dice cuándo sí: espera a esa franja, o quita el filtro en Objetivo.',
          )
        : null,
      hayEspina && !rec.noSeCria
        ? el('p.nota', {}, [
            'Del huevo sale la forma base, así que para la espina da igual cuál de la línea ',
            `captures: ${base.viables.map((v) => v.especie).join(', ')} ponen el mismo huevo. `,
            'Se propone el más fácil de pillar donde juegas.',
          ])
        : null,
      hayLibres
        ? el('p.nota', {}, [
            sinGeneroObjetivo
              // Sin género la regla es otra y más estrecha: sólo su propia
              // línea evolutiva o un Ditto, no el grupo huevo entero.
              ? `${objetivo.especie} no tiene género, así que su pareja sólo puede ser otro de su `
                + 'misma línea evolutiva o un Ditto. Se propone el más fácil de pillar de esos.'
              : 'Como la cría saca la especie de la MADRE, estos padres pueden ser de cualquier '
                + `especie que comparta grupo huevo con ${objetivo.especie}. Se propone la más `
                + 'fácil de pillar.',
          ])
        : null,

      el('h3', { texto: 'Qué buscar' }),
      tabla(
        ['Cuántos', 'Qué', 'Sexo', 'Encuentros esperados'],
        grupo.map((c) => [
          `×${c.cuantos}`,
          queBuscar(c),
          c.requisito.sexo ?? 'cualquiera',
          comoOportunidad(c.recomendada.intentos),
        ]),
        [0, 3],
      ),
      grupo.some((c) => c.requisito.sexo && c.recomendada.ratioSexo < 50)
        ? aviso(`Ojo con el sexo: en ${especie} sale el minoritario sólo el ${rec.ratioSexo} % de las veces.`)
        : null,

      el('h3', { texto: 'Dónde' }),
      tabla(
        ['Región', 'Zona', 'Método', 'Nivel', 'Rareza', 'Cuándo'],
        rec.zonas.map((z) => [
          chip(z.region, 'si'), z.zona, z.metodo, z.nivel, z.rareza, celdaCuando(z, cuando),
        ]),
      ),

      base.viables.length > 1
        ? plegable(`Otras ${base.viables.length - 1} especies que valen igual`, [
            tabla(
              ['Especie', 'Grupo en común', 'Sexo pedido', 'Intentos', 'Zonas al alcance'],
              base.viables.slice(1, 6).map((o) => [
                o.noCria && o.evolucionar ? `${o.especie} (evoluciónalo a ${o.evolucionar.especie})` : o.especie,
                o.gruposEnComun.join(' / '), `${o.ratioSexo} %`,
                comoOportunidad(o.intentos), numero(o.zonas.length),
              ]),
              [3, 4],
            ),
          ], { pequeno: true, id: `otras-${especie}` })
        : null,
    ]);
  });

  const bloquesGtl = fueraDeAlcance.map((c) => {
    const req = c.requisito;
    const titulo =
      `×${c.cuantos} · ` +
      (req.stats.length || req.naturaleza
        ? (req.stats.length ? `31 en ${req.stats.map((x) => NOMBRE_STAT[x]).join(' + ')}` : '')
          + (req.naturaleza ? `${req.stats.length ? ' + ' : ''}naturaleza ${req.naturaleza}` : '')
        : 'cualquiera') +
      (req.sexo ? ` · ${req.sexo}` : '');
    return tarjeta(titulo, [
      el('div.aviso', {}, [c.nota]),
      c.opciones.length
        ? plegable('Dónde estarían, si desbloqueas la región', [
            tabla(
              ['Especie', 'Región', 'Zona', 'Método', 'Rareza'],
              c.opciones.flatMap((o) => o.zonasFueraDeAlcance.map((z) => [
                o.especie, chip(z.region, 'mal'), z.zona, z.metodo, z.rareza,
              ])),
            ),
          ])
        : null,
    ]);
  });

  return frag([cabecera, resumen, ...bloques, ...bloquesGtl]);
}


/**
 * La columna «Cuándo» de una zona.
 *
 * Tres casos distintos y los tres importan: la que vale siempre no necesita
 * aviso, la que vale ahora mismo se marca en verde, y la que no se marca con
 * lo que hay que esperar — que no es lo mismo esperar a la noche (minutos) que
 * a otra estación (semanas).
 */
function celdaCuando(z, cuando) {
  // Sin filtro puesto interesa el dato crudo y abreviado: M, D, N y sus
  // combinaciones. Con filtro interesa si sirve o cuánto hay que esperar.
  if (!cuando?.hora && !cuando?.estacion) {
    const horas = siglaDeHoras(z);
    const est = siglaDeEstaciones(z);
    return el('span.sig', {}, [
      chip(horas, horas === 'M/D/N' ? '' : 'ojo'),
      est ? chip(est, 'ojo') : null,
    ]);
  }
  const texto = cuandoLegible(z);
  if (texto === 'siempre') return chip('siempre');
  if (z.ahora !== false && !z.noAhora) return chip(texto, 'bien');
  return chip(texto, z.noAhora?.espera === 'estacion' ? 'mal' : 'ojo');
}
