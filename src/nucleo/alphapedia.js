// Enlazar con Alphapedia (https://alpha.pokemmotools.org/).
//
// Alphapedia es el sitio donde los jugadores avisan de lo que la wiki NO puede
// saber porque cambia cada rato: qué Alpha está activo ahora mismo, qué
// enjambres se han cantado y qué fenómenos hay. Es exactamente lo que le falta
// a esta app, que trabaja con datos fijos.
//
// **Y aun así la app no lo lee, a propósito.** Comprobado el 28-09-2026:
//
//   1. **No hay API pública.** Las listas se sirven como HTML montado en el
//      servidor; el único JSON suelto son dos contadores (`/api/subscriber-count`
//      y `/api/webhook-count`) y un canal de eventos (`/events/stream`) que es
//      para su propia página. No hay `/api/docs` ni `openapi.json`.
//   2. **No hay CORS.** Ninguna respuesta trae `access-control-allow-origin`,
//      así que un navegador **no deja** a esta página leer nada de ese dominio.
//      Esto no se arregla con código: o lo pone Alphapedia, o hace falta un
//      servidor propio que haga de intermediario — y esta app es estática, se
//      publica en GitHub Pages y no tiene ninguno.
//   3. **La vía que ellos ofrecen es Discord**, con su bot y sus webhooks, y sus
//      condiciones de uso son de uso personal y no comercial.
//
// Así que lo que sí se hace es lo que vale igual y no rompe nada: **llevar al
// jugador a la página exacta**, ya filtrada por la especie que el plan le pide.
// Un enlace no necesita permiso, no caduca y no miente cuando el sitio cambie.
//
// Si algún día publican un JSON con CORS, lo único que hay que añadir aquí es
// la llamada: el resto de la app ya sabe qué especie buscar.

/** La raíz del sitio. Sale de aquí y no repartida por las vistas. */
export const ALPHAPEDIA = 'https://alpha.pokemmotools.org';

/**
 * Por qué la app enlaza en vez de enseñar el dato dentro.
 *
 * Se dice en la interfaz, en una línea: un enlace sin explicación parece que la
 * app no se ha molestado. Y se dice sin nombrar ni CORS ni APIs, que al jugador
 * no le importan — igual que con la wiki (regla 2).
 */
export const POR_QUE_ENLACE =
  'Los cantan los jugadores y caducan en minutos, así que no se guardan aquí.';

const conPokemon = (ruta, especie) =>
  `${ALPHAPEDIA}${ruta}${especie ? `?pokemon=${encodeURIComponent(especie)}` : ''}`;

/**
 * Los tres enlaces que importan, y opcionalmente ya filtrados por especie.
 *
 * `/alpha-list` acepta `?pokemon=` y `?region=` y los aplica al abrir, así que
 * el enlace cae directo en lo que el plan pide en vez de en la lista entera.
 */
export const enlaceAlphas = (especie = null) => conPokemon('/alpha-list', especie);
export const enlaceEnjambres = (especie = null) => conPokemon('/swarm-list', especie);
export const enlaceFenomenos = (especie = null) => conPokemon('/pheno-list', especie);

/**
 * Los enlaces que le tocan a un hueco de captura.
 *
 * Un hueco Alpha va a la lista de Alphas; uno normal, a enjambres y fenómenos,
 * que es lo que puede hacer que esa especie salga hoy más de lo normal.
 */
export function enlacesDeCaptura(especie, { alpha = false } = {}) {
  if (alpha) return [{ texto: 'Alphas activos ahora', url: enlaceAlphas(especie) }];
  return [
    { texto: 'Enjambres', url: enlaceEnjambres(especie) },
    { texto: 'Fenómenos', url: enlaceFenomenos(especie) },
  ];
}
