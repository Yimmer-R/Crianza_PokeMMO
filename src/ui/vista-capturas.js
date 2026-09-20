// Qué capturar, dónde, y cuántos intentos salen de media.
//
// El filtro de regiones se aplica antes de cualquier cosa: una sugerencia en una
// región que el usuario no tiene desbloqueada no es una sugerencia, es ruido.

import { el, tarjeta, chip, aviso, frag, tabla, numero, comoOportunidad } from './componentes.js';
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

  const bloques = capturas.map((c) => {
    const req = c.requisito;
    const titulo =
      `×${c.cuantos} · ` +
      (req.stats.length ? `31 en ${req.stats.map((s) => NOMBRE_STAT[s]).join(' + ')}` : '') +
      (req.naturaleza ? `${req.stats.length ? ' + ' : ''}naturaleza ${req.naturaleza}` : '') +
      (req.sexo ? ` · ${req.sexo}` : '');

    if (c.soloGtl) {
      return tarjeta(titulo, [
        el('div.aviso', {}, [c.nota]),
        c.opciones.length
          ? frag([
              el('h3', { texto: 'Dónde estarían, si desbloqueas la región' }),
              tabla(
                ['Especie', 'Región', 'Zona', 'Método', 'Rareza'],
                c.opciones.flatMap((o) => o.zonasFueraDeAlcance.map((z) => [
                  o.especie, chip(z.region, 'mal'), z.zona, z.metodo, z.rareza,
                ])),
              ),
            ])
          : null,
      ]);
    }

    const rec = c.recomendada;
    return tarjeta(titulo, [
      el('div.etiquetas', {}, [
        chip(`Mejor opción: ${rec.especie}`, 'bien'),
        req.especieLibre ? chip('hueco libre: la especie no está atada', 'si') : chip('espina materna: tiene que ser esta especie'),
        rec.gruposEnComun.length ? chip(`grupo huevo: ${rec.gruposEnComun.join(' / ')}`) : null,
        chip(`${comoOportunidad(rec.intentos)} encuentros`, 'ojo'),
        req.sexo && rec.ratioSexo < 50 ? chip(`${req.sexo} sólo el ${rec.ratioSexo} % de las veces`, 'mal') : null,
      ]),
      req.especieLibre
        ? el('p.nota', {}, [
            'Como la cría saca la especie de la MADRE, este padre puede ser de cualquier especie ',
            `que comparta grupo huevo con ${objetivo.especie}. Por eso se propone la más fácil de pillar.`,
          ])
        : null,
      tabla(
        ['Región', 'Zona', 'Método', 'Nivel', 'Rareza'],
        rec.zonas.map((z) => [chip(z.region, 'si'), z.zona, z.metodo, z.nivel, z.rareza]),
      ),
      c.viables.length > 1
        ? frag([
            el('h3', { texto: 'Otras especies que valen igual' }),
            tabla(
              ['Especie', 'Grupo en común', `${req.sexo ?? 'sexo'}`, 'Intentos', 'Zonas al alcance'],
              c.viables.slice(1, 6).map((o) => [
                o.especie, o.gruposEnComun.join(' / '), `${o.ratioSexo} %`,
                comoOportunidad(o.intentos), numero(o.zonas.length),
              ]),
              [3, 4],
            ),
          ])
        : null,
    ]);
  });

  return frag([cabecera, ...bloques]);
}
