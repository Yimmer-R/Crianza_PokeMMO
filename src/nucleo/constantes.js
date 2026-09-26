// Constantes del dominio. Todo lo que hay aquí sale de la wiki; cada bloque dice
// de qué página, y lo que es deducción propia va marcado como tal.

/** Las seis características, en el orden en que las muestra el juego. */
export const STATS = ['ps', 'ataque', 'defensa', 'at-esp', 'def-esp', 'velocidad'];

export const NOMBRE_STAT = {
  ps: 'PS',
  ataque: 'Ataque',
  defensa: 'Defensa',
  'at-esp': 'At. Esp.',
  'def-esp': 'Def. Esp.',
  velocidad: 'Velocidad',
};

/** wiki/mecanicas/IVs.md: 31 es el máximo, y el total sale sobre 186 = 6 × 31. */
export const IV_MAX = 31;
export const IV_TOTAL_MAX = 186;

/** wiki/mecanicas/EVs y entrenamiento.md: topes confirmados en el juego. */
export const EV_MAX_POR_STAT = 252;
export const EV_MAX_TOTAL = 510;
export const EV_POR_VITAMINA = 10;
export const EV_POR_BAYA = 10;

/** Cuántos EVs hacen falta para +1 punto de característica, por nivel. */
export const EVS_POR_PUNTO = { 50: 8, 100: 4 };

/**
 * Incubadoras: un huevo no eclosiona en el equipo, se mete en una incubadora.
 * Son un desbloqueo permanente de la cuenta y hay OCHO en total (cinco de los
 * encargados de guardería, una del Alto Mando de Kanto, una de la revancha a
 * Ho-Oh y una de Red). Ocho incubadoras son ocho huevos a la vez, que es el
 * techo real de la crianza en paralelo.
 * wiki/mecanicas/Incubadoras.md (añadidas el 10-07-2025, Shiny Wars 2025)
 */
export const INCUBADORAS = 8;

/**
 * Lo que acelera una incubadora, y se suma: −10 % con un Pokémon de Cuerpo
 * Llama o Escudo Magma DENTRO de la incubadora —no en el equipo, que es como
 * funciona en los juegos originales— y −10 % más con el estado de donador.
 * wiki/mecanicas/Incubadoras.md
 */
export const ACELERAR_HUEVO = [
  { que: 'un Pokémon con Cuerpo Llama o Escudo Magma dentro de la incubadora', rebaja: 0.10 },
  { que: 'estado de donador activo', rebaja: 0.10 },
];

/**
 * wiki/mecanicas/Crianza.md — reparto de cada IV no forzado según cuántos
 * objetos de crianza haya en juego. Tres IVs se heredan tal cual y tres salen
 * del promedio redondeado hacia abajo; esta tabla es la probabilidad por IV.
 */
export const TABLA_HERENCIA = {
  0: { alto: 0.25,  promedio: 0.5,  bajo: 0.25 },
  1: { alto: 0.20,  promedio: 0.6,  bajo: 0.20 },
  2: { alto: 0.125, promedio: 0.75, bajo: 0.125 },
};

/** La misma tabla cuando se cría shiny × shiny, en "n de m" como la trae la wiki. */
export const TABLA_HERENCIA_SHINY = {
  0: { maximo: [2, 6], promedio: [2, 6], mitad: [2, 6] },
  1: { maximo: [2, 5], promedio: [2, 5], mitad: [1, 5] },
  2: { maximo: [2, 4], promedio: [2, 4], mitad: [0, 4] },
};

/** Grupos huevo que no crían nunca. wiki/pokemon/ los marca así. */
export const GRUPOS_ESTERILES = ['No cría'];
export const GRUPO_DITTO = 'Ditto';
export const GRUPO_SIN_GENERO = 'Sin género';

export const REGIONES = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova'];

/**
 * Cuándo aparece un Pokémon salvaje: hora del juego y estación.
 *
 * No es un adorno. Muchas tablas de encuentro sólo existen en una franja o en
 * una estación: una horda «de noche · invierno» no está si entras de día en
 * verano, y mandar a alguien a esa zona es mandarlo a dar vueltas.
 *
 * En PokeMMO un día del juego son **6 horas reales**, así que la hora rota
 * cuatro veces al día real; las estaciones van por mes real. O sea: esperar a
 * otra franja son minutos, esperar a otra estación son semanas, y por eso la
 * app las trata distinto al ordenar.
 * (wiki/mecanicas/Dónde entrenar EVs.md, 22-09-2026)
 */
export const HORAS = ['mañana', 'día', 'noche'];
export const ESTACIONES = ['primavera', 'verano', 'otoño', 'invierno'];

/**
 * Coste de pagar por elegir el sexo de la cría.
 *
 * wiki/mecanicas/Crianza.md sólo fija los dos extremos: «desde $5.000 en
 * especies 1:1 hasta $25.000 por el sexo minoritario en especies 7:1». Los
 * tramos de en medio NO están en ninguna fuente, así que van marcados como
 * estimados y la app los muestra como tales en vez de darlos por buenos.
 */
export const PRECIO_ELEGIR_SEXO = [
  { ratioMinoritario: 50,   precio: 5000,  confianza: 'confirmado' },
  { ratioMinoritario: 25,   precio: 10000, confianza: 'estimado' },
  { ratioMinoritario: 12.5, precio: 25000, confianza: 'confirmado' },
];

/**
 * Precios en PokéYen que la wiki documenta en la ficha de cada objeto. Están
 * aquí sólo como respaldo: el cálculo de coste lee datos/objetos.json, que sale
 * de la wiki, y usa esto si un objeto no trae precio de compra.
 */
export const PRECIO_RESPALDO = {
  'Pesa Recia': 10000,
  'Brazal Recio': 10000,
  'Cinto Recio': 10000,
  'Lente Recia': 10000,
  'Banda Recia': 10000,
  'Franja Recia': 10000,
  Piedraeterna: 4000,
};

/**
 * Objetos que el volcado de la wiki dice que venden las tiendas del juego, pero
 * que en realidad NO se venden.
 *
 * La Piedraeterna es el caso: `datos/objetos.json` la da a 4.000 PokéYen en los
 * cinco encargados de guardería, y eso sale de un volcado de datos del juego,
 * pero jugando no está en ninguna tienda. Se consigue **farmeando objetos a
 * Pokémon salvajes o comprándola en el GTL**.
 * (experiencia propia del usuario, 26-09-2026 — más débil que un dato de la
 * wiki, pero es quien está delante del juego; convendría subirlo a la wiki como
 * fuente nueva para que la corrección quede allí y no aquí)
 *
 * Tenerlo en cuenta cambia el presupuesto de verdad: el precio bueno es el del
 * GTL, que se mueve, en vez de un precio de tienda fijo que no existe.
 */
export const NO_SE_VENDE_EN_TIENDA = {
  Piedraeterna: 'no está en ninguna tienda del juego: se farmea a Pokémon salvajes o se compra '
    + 'en el GTL (experiencia propia, 26-09-2026)',
};

/**
 * Precios de mercado observados en el GTL, con su fecha.
 *
 * Esto **no** sale de la wiki y no puede salir: la wiki no guarda precios de
 * mercado a propósito, porque caducan en semanas. Viene de las capturas del
 * rastreador de precios que mandó el usuario el 26-09-2026, y por eso lleva la
 * fecha pegada y se muestra siempre como estimación caducable, nunca sumado al
 * total como si fuera un dato firme.
 *
 * Para la Piedraeterna esto **es** el precio, no una comparación: no se vende en
 * ninguna tienda (ver `NO_SE_VENDE_EN_TIENDA`), así que el GTL es la vía real y
 * el presupuesto tiene que usar este número — marcado como estimación con
 * fecha, no como dato firme.
 */
export const PRECIO_GTL_OBSERVADO = {
  Piedraeterna: {
    ultimo: 4957,
    fecha: '2026-09-22',
    min: 3480,
    minFecha: '2026-08-14',
    max: 5728,
    maxFecha: '2025-11-17',
    desde: '2025-05-21',
    fuente: 'rastreador de precios del GTL (capturas del usuario, 26-09-2026)',
  },
};

/**
 * Lo que la wiki deliberadamente NO guarda y por tanto la app tampoco puede
 * calcular sola. Se le pide al usuario. (wiki/CLAUDE.md: los precios de mercado
 * y las listas de tier son una decisión, no un hueco.)
 */
export const LO_PONE_EL_USUARIO = [
  'precio de un padre 1×31 en el GTL',
  'precio de un Ditto con IVs en el GTL',
  'cuánto cuesta un Parche de Habilidad si no se compra con BP',
];

export const SEXOS = { MACHO: '♂', HEMBRA: '♀', SIN_GENERO: '—' };
