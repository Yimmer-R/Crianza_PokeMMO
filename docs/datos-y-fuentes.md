# Datos y fuentes

Nada en `datos/` se escribe a mano. Todo sale de
[Yimmer-R/Wiki-PokeMMO](https://github.com/Yimmer-R/Wiki-PokeMMO) vía
`herramientas/extraer-wiki.mjs`. Si un dato está mal, se corrige **en la wiki** y
se vuelve a extraer.

## Los encuentros salen de las ZONAS, no de la ficha del Pokémon

La ficha de cada Pokémon trae su tabla de «Dónde encontrarlo», y es lo primero
que uno mira. **No sirve**: ahí la zona viene con el nombre pelado («Monte
Plateado») y se pierde el sufijo de hora y estación, que es justo lo que decide
si el Pokémon está ahí cuando tú entras. Dos filas idénticas salvo por eso
quedan como duplicados inexplicables.

Las 687 fichas de `wiki/zonas/` sí lo traen, y encima **estructurado en el
frontmatter**:

```yaml
horas: [noche]
estaciones: [primavera]
```

Eso es mejor que deducirlo del nombre del archivo, que viene medio traducido y
en cinco formas distintas —`nightspring`, `NochePrimavera`, `nocturnootoño`,
`mañana  invierno`— y sería una fuente de errores silenciosos. `[todas]`
significa siempre, y el extractor lo convierte en la lista entera.

Dos detalles del extractor:

- **el nombre de la zona se limpia del paréntesis** («Ruta 39 (noche/verano)» →
  «Ruta 39»), porque el paréntesis ya está en `horas` y `estaciones`. Un sufijo
  que NO sea de hora/estación —«Altering Cave (2)», tablas distintas del mismo
  mapa— no lleva paréntesis en el `title` de la ficha, así que no se toca;
- **se juntan las filas que sólo difieren en cuándo**, y sólo cuando una de las
  dos dimensiones coincide. Snorunt en Acuity Lakefront sale de noche y hay una
  ficha por estación: cuatro filas iguales que son «de noche, todo el año».
  Unir `{noche, primavera}` con `{día, verano}` sería incorrecto —daría un «día
  en primavera» que no existe— y por eso no se hace.

Que esto funciona se comprueba solo: la extracción por zonas da **exactamente
las mismas 548 especies** que daba la de las fichas, y
`herramientas/comprobar-datos.mjs` falla si menos de 100 filas quedan con hora o
estación restringida, que es lo que pasaría si el sufijo se volviera a perder.

## Qué archivo sale de dónde

| archivo | de dónde | contenido |
|---|---|---|
| `pokemon.json` | `wiki/pokemon/*.md` | 667 especies: stats, tipos, grupos huevo, ratio de género, learnset por las 8 vías, evolución y forma base |
| `encuentros.json` | `wiki/zonas/*.md` | 548 especies con región, zona, método, nivel, rareza **y cuándo**: en qué horas del juego y en qué estaciones existe esa tabla |
| `naturalezas.json` | `wiki/naturalezas/*.md` | las 25, con qué sube y qué baja |
| `movimientos.json` | `wiki/movimientos/*.md` | 559 movimientos |
| `movimientos-huevo.json` | sección «Como movimiento huevo» de cada ficha de movimiento | los 177, con las especies que los traen **y sus grupos huevo**; más las especies que los aprenden por otra vía y sirven igual de padre |
| `habilidades.json` | `wiki/habilidades/*.md` + cruce con las fichas | 170, con quién las tiene y si es la oculta |
| `objetos.json` | `wiki/objetos/*.md` | objetos de crianza, entrenamiento, vitaminas, bayas de EV y habilidad, con sus precios de compra documentados; y los **seis señuelos**, con los pasos que duran y el porcentaje de exclusivas sacados de la descripción del propio objeto |
| `sprites.json` | `wiki/sprites/*.md` | la imagen de las 667: el render 3D de Pokémon HOME y el sprite animado de 5ª generación, más la variante ♀ de las 97 que se dibujan distintas |
| `donde-entrenar.json` | `wiki/mecanicas/Dónde entrenar EVs.md` | 581 hordas agrupadas por la característica que dan, con su hora y estación |
| `alphas.json` | notas de la comunidad de `wiki/mecanicas/Pokémon Alpha.md` | las 112 líneas de los enjambres diarios, las de temporada por evento y las de tiempo limitado, con su procedencia dentro |
| `meta.json` | — | fecha de extracción, recuentos, regiones, grupos huevo y huecos detectados |

## Los sprites se enlazan, no se copian

Las imágenes **no están en este repositorio ni en la wiki**: son unos 150 MB y las dos
cosas son texto. La wiki las enlaza al volcado de
[PokeAPI/sprites](https://github.com/PokeAPI/sprites), lo deja escrito en
`raw/2026-09-27-sprites-pokeapi.md`, y `sprites.json` guarda ese prefijo **una sola vez**
en `base` más, de cada Pokémon, la parte que cambia. Repetir la URL entera 1.334 veces
triplicaba el archivo para no decir nada nuevo.

Tres cosas que la wiki ya comprobó pidiendo el archivo, y que no hay que volver a mirar:

- **de Escarlata/Púrpura y de Leyendas Z-A no hay volcado público.** `other/scarlet-violet/1.png`
  da 404 y de Z-A no hay carpeta. Lo más nuevo que existe suelto es el render de Pokémon HOME,
  y ése es el que usa la app;
- **en 3D no existe el dorso**, y no es un hueco del volcado: desde la 6ª generación el combate
  se renderiza con el modelo. El único dorso que hay es el 2D de 5ª generación — que es, justo,
  la generación de PokeMMO. La app no lo usa: esto es un planificador, no un simulador;
- **97 especies tienen sprite de hembra.** En las demás no falta: es que el juego las dibuja
  igual.

Una imagen que no carga —sin red, o el volcado movido de sitio— **no es un error de la app**:
`src/ui/componentes.js` deja el hueco marcado, con el porqué en el `title`, y la vista sigue.
La prueba de navegador comprueba el `src` aunque no pueda bajar ni una imagen, y dice cuántas
se quedaron sin cargar.

## Dos trampas del formato de la wiki

Las dos están avisadas en el `CLAUDE.md` de la wiki, y las dos muerden de verdad.

**1. El pipe escapado de un alias no separa celdas.** En una tabla, un enlace con
alias se escribe `[[Ruta 14 (2)\|Ruta 14]]`. Si se parte la fila por todos los
`|`, esa celda se rompe en dos y **toda la fila se desplaza una columna**: la
región aparece donde va la zona y así. `filas()` parte por `/(?<!\\)\|/` justo por
eso. Pasó aquí: las 581 hordas salían con la zona partida en dos columnas.

**2. El nombre visible de un wikilink es la PRIMERA parte.** `[[Mime Jr|Mime Jr.]]`
resuelve por `Mime Jr`, que es el nombre de archivo. Quedarse con la segunda parte
inventa especies que no existen.

## Un desacuerdo de la propia wiki, y cómo se resolvió

Las fichas de Pokémon tienen `### Huevo` (271 especies) y también
`### Movimiento especial` (232). Contando sólo la primera salen **168**
movimientos huevo; la wiki dice que son **177**.

La diferencia son nueve movimientos que las fichas de Pokémon colocan bajo
«Movimiento especial» pero que las fichas de movimiento sí listan como de huevo
(por ejemplo Absorber en Phanpy).

Se usa el índice de las **fichas de movimiento**, y salen 177 exactos. Es además
lo que dice el `CLAUDE.md` de la wiki que hay que usar, porque es el único sitio
que trae la columna de grupos huevo — que es el dato que hace falta para armar la
cadena, no el nombre del movimiento.

## Precios, y qué se cree la app

| dato | valor | confianza |
|---|---|---|
| objetos Recios | 10.000 PokéYen (o 750 BP) | de la ficha del objeto |
| Piedraeterna | 4.000 PokéYen | de la ficha del objeto |
| vitaminas | 3.650 PokéYen, 10 EVs cada una | de la ficha del objeto |
| Brazal Firme | 3.000 PokéYen | de la ficha del objeto |
| elegir sexo, especies 1:1 | 5.000 PokéYen | publicado |
| elegir sexo, sexo minoritario en 7:1 | 25.000 PokéYen | publicado |
| elegir sexo, tramo 3:1 | 10.000 PokéYen | **estimado**: ninguna fuente lo publica |

El tramo estimado sale marcado como tal en la tabla del presupuesto de la app, en
su propia línea. No se mezcla con el total confirmado.

**Los precios de mercado del GTL no están, y no es un olvido.** La wiki no los
guarda a propósito: un precio apuntado miente a los dos meses. Los padres de
partida quedan fuera del presupuesto con una nota que lo dice.

## Los señuelos: los números salen del objeto, no de una guía

De los seis señuelos (`Señuelo`, `Super Señuelo`, `Señuelo Experto` y sus tres
versiones premium) hace falta saber tres cosas, y las tres están en la
**descripción del propio objeto** dentro del juego, que es lo que la wiki copia:
cuántos pasos dura, cuánto sube los encuentros y qué probabilidad da de que el
encuentro sea de especie exclusiva. `efectosDelSenuelo()` las saca con tres
expresiones regulares sobre ese texto.

Importa porque **circula otra versión**: que los premium dan +20 % de encuentros
y 8 % de exclusivas. El texto del juego dice **+25 % y 10 %**, y ése es el número
que usa la app. Los normales dan +10 % y 5 %.

Lo que **no** está en ninguna parte es cuántos pasos cuesta un encuentro, y sin
eso no se puede convertir «te hacen falta 5.120 encuentros» en «te hacen falta N
señuelos». Por eso el presupuesto da el precio de uno y deja el total fuera.

## Las 112 líneas Alpha vienen de la comunidad, no del volcado

El `CLAUDE.md` de la wiki tiene «las 112 líneas evolutivas que salen como Alpha»
apuntado como hueco de la ingesta, y lo sigue siendo: la lista existe, pero en las
**notas de la comunidad** de la página, rastreadas de una wiki de jugadores. Se
extrae igual —es la única fuente que hay— y `datos/alphas.json` lleva dentro
`fuente` y `confianza: 'wiki de la comunidad'` para que no se lea como un dato
del juego.

Tres listas, y la diferencia entre ellas decide si un objetivo es posible:

- **`enjambres`**: las 112 de todos los días. `comprobar-datos.mjs` comprueba que
  sigan siendo 112 y que las 112 estén en la pokédex;
- **`temporada`**: por evento (Halloween, Navidad, Año Nuevo Lunar). Son una vía,
  pero sólo durante el evento;
- **`limitados`**: los tres iniciales de Kanto, Suicune y Articuno. **No son una
  vía**: se repartieron una vez y la propia página dice que no vuelven.

## Alphapedia: por qué se enlaza y no se lee

[Alphapedia](https://alpha.pokemmotools.org/) tiene justo lo que a esta app le
falta: qué Alpha está activo ahora mismo, qué enjambres se han cantado y qué
fenómenos hay. Son datos que avisan los propios jugadores y que caducan en
minutos, así que no pueden vivir en `datos/`.

Se miró si la app podía leerlos, y **no puede**. Comprobado el 28-09-2026:

- **No hay API pública.** `/alpha-list`, `/swarm-list` y `/pheno-list` son HTML
  montado en el servidor. El único JSON suelto son dos contadores
  (`/api/subscriber-count`, `/api/webhook-count`) y un canal de eventos
  (`/events/stream`) que es para su propia página. No hay `/api/docs` ni
  `openapi.json`: los dos dan 404.
- **No hay CORS.** Ninguna respuesta trae `access-control-allow-origin`, así que
  el navegador **no deja** a una página servida desde `yimmer-r.github.io` leer
  ese dominio. Esto no se arregla con código: o lo pone Alphapedia, o hace falta
  un servidor propio que haga de intermediario, y esta app es estática.
- **La vía que ellos ofrecen es Discord**, con su bot y sus webhooks, y sus
  condiciones de uso son de uso personal y no comercial.
- **`robots.txt` no pone ninguna directiva**: sólo el preámbulo de las «content
  signals», que sin valores ni concede ni restringe nada.

Así que la app hace lo que vale igual y no depende de nada: **enlaza**. Cada
tarjeta de captura lleva su enlace a la lista en vivo, ya filtrada con
`?pokemon=<especie>`, que es un parámetro que su propia página lee al abrir. En
un hueco Alpha se enlaza la especie de la LÍNEA que sale en los enjambres, no la
que se cría: se pide un Gible y el enjambre lo canta como Garchomp.

Está en `src/nucleo/alphapedia.js`. Si algún día publican un JSON con CORS, lo
único que hay que añadir ahí es la llamada.

## Cómo comprobar que la extracción sigue bien

`node herramientas/extraer-wiki.mjs` imprime los recuentos y los huecos que
detecta. Con la wiki de septiembre de 2026 deben salir:

```
{"pokemon":667,"conEncuentros":548,"naturalezas":25,
 "movimientos":559,"habilidades":170,"movimientosHuevo":177,
 "conSprite":667,"lineasAlpha":112}
```

Si un número baja de golpe, ha cambiado el formato de la wiki y hay algún
selector de sección que ya no encuentra nada. Las pruebas unitarias corren contra
estos JSON, así que también lo detectan.
