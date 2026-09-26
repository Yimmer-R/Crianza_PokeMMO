// Qué capturar, dónde, y cuántos intentos salen de media.
//
// El filtro de regiones se aplica antes de cualquier cosa: una sugerencia en una
// región que el usuario no tiene desbloqueada no es una sugerencia, es ruido.

import { el, tarjeta, plegable, chip, aviso, frag, tabla, numero, comoOportunidad } from './componentes.js';
import { NOMBRE_STAT } from '../nucleo/constantes.js';
import { obtener } from './estado.js';
import { planDeCapturas, regionesQueHacenFalta } from '../nucleo/capturas.js';

export function vistaCapturas(datos) {
  const { plan, regionesDisponibles, objetivo } = obtener();

  if (!plan?.ok)
    return tarjeta('Sin plan no hay capturas', [el('p.vacio', { texto: 'Define el objetivo primero.' })]);

  const capturas = planDeCapturas(plan, datos, regionesDisponibles);
  const regiones = regionesQueHacenFalta(plan, datos, regionesDisponibles);

  if (!capturas.length)
    return tarjeta('Nada que capturar', [
      el('p', {}, [chip('el inventario ya cubre la cadena entera', 'bien')]),
    ]);

  const cabecera = tarjeta('Resumen', [
    el('div.etiquetas', {}, [
      chip(`${capturas.reduce((a, c) => a + c.cuantos, 0)} padres por conseguir`, 'ojo'),
      ...regiones.usadas.map((r) => chip(r, 'si')),
      ...regiones.bloqueadas.map((r) => chip(`${r} (bloqueada)`, 'mal')),
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
    return (req.stats.length ? `31 en ${req.stats.map((x) => NOMBRE_STAT[x]).join(' + ')}` : '') +
      (req.naturaleza ? `${req.stats.length ? ' + ' : ''}naturaleza ${req.naturaleza}` : '');
  };

  const bloques = [...porEspecie.entries()].map(([especie, grupo]) => {
    const rec = grupo[0].recomendada;
    const cuantos = grupo.reduce((a, c) => a + c.cuantos, 0);
    const libre = grupo.every((c) => c.requisito.especieLibre);

    return tarjeta(`${especie} · ${cuantos} ${cuantos === 1 ? 'captura' : 'capturas'}`, [
      el('div.etiquetas', {}, [
        libre
          ? chip('hueco libre: la especie no está atada', 'si')
          : chip('espina materna: tiene que ser esta especie', 'ojo'),
        rec.gruposEnComun.length ? chip(`grupo huevo: ${rec.gruposEnComun.join(' / ')}`) : null,
        chip(`${rec.zonas.length} ${rec.zonas.length === 1 ? 'zona' : 'zonas'} a tu alcance`),
      ]),
      libre
        ? el('p.nota', {}, [
            'Como la cría saca la especie de la MADRE, estos padres pueden ser de cualquier especie ',
            `que comparta grupo huevo con ${objetivo.especie}. Se propone la más fácil de pillar.`,
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
        ['Región', 'Zona', 'Método', 'Nivel', 'Rareza'],
        rec.zonas.map((z) => [chip(z.region, 'si'), z.zona, z.metodo, z.nivel, z.rareza]),
      ),

      grupo[0].viables.length > 1
        ? plegable(`Otras ${grupo[0].viables.length - 1} especies que valen igual`, [
            tabla(
              ['Especie', 'Grupo en común', 'Sexo pedido', 'Intentos', 'Zonas al alcance'],
              grupo[0].viables.slice(1, 6).map((o) => [
                o.especie, o.gruposEnComun.join(' / '), `${o.ratioSexo} %`,
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
      (req.stats.length ? `31 en ${req.stats.map((x) => NOMBRE_STAT[x]).join(' + ')}` : '') +
      (req.naturaleza ? `${req.stats.length ? ' + ' : ''}naturaleza ${req.naturaleza}` : '') +
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

  return frag([cabecera, ...bloques, ...bloquesGtl]);
}
