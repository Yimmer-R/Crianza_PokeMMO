# Datos y fuentes

Nada en `datos/` se escribe a mano. Todo sale de
[Yimmer-R/Wiki-PokeMMO](https://github.com/Yimmer-R/Wiki-PokeMMO) vía
`herramientas/extraer-wiki.mjs`. Si un dato está mal, se corrige **en la wiki** y
se vuelve a extraer.

## Qué archivo sale de dónde

| archivo | de dónde | contenido |
|---|---|---|
| `pokemon.json` | `wiki/pokemon/*.md` | 667 especies: stats, tipos, grupos huevo, ratio de género, learnset por las 8 vías, evolución y forma base |
| `encuentros.json` | sección «Dónde encontrarlo» de cada ficha | 548 especies con región, zona, método, nivel y rareza |
| `naturalezas.json` | `wiki/naturalezas/*.md` | las 25, con qué sube y qué baja |
| `movimientos.json` | `wiki/movimientos/*.md` | 559 movimientos |
| `movimientos-huevo.json` | sección «Como movimiento huevo» de cada ficha de movimiento | los 177, con las especies que los traen **y sus grupos huevo**; más las especies que los aprenden por otra vía y sirven igual de padre |
| `habilidades.json` | `wiki/habilidades/*.md` + cruce con las fichas | 170, con quién las tiene y si es la oculta |
| `objetos.json` | `wiki/objetos/*.md` | objetos de crianza, entrenamiento, vitaminas, bayas de EV y habilidad, con sus precios de compra documentados |
| `donde-entrenar.json` | `wiki/mecanicas/Dónde entrenar EVs.md` | 581 hordas agrupadas por la característica que dan |
| `meta.json` | — | fecha de extracción, recuentos, regiones, grupos huevo y huecos detectados |

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

## Cómo comprobar que la extracción sigue bien

`node herramientas/extraer-wiki.mjs` imprime los recuentos y los huecos que
detecta. Con la wiki de septiembre de 2026 deben salir:

```
{"pokemon":667,"conEncuentros":548,"naturalezas":25,
 "movimientos":559,"habilidades":170,"movimientosHuevo":177}
```

Si un número baja de golpe, ha cambiado el formato de la wiki y hay algún
selector de sección que ya no encuentra nada. Las pruebas unitarias corren contra
estos JSON, así que también lo detectan.
