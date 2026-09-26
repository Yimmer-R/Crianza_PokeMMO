# Crianza PokeMMO

App web para planificar crianza y entrenamiento en PokeMMO. **No** es una wiki:
el conocimiento del juego vive en el repo hermano
[Yimmer-R/Wiki-PokeMMO](https://github.com/Yimmer-R/Wiki-PokeMMO) y aquí sólo se
consume. (Hasta el 24-09-2026 la wiki era `Yimmer-R/PokeMMO`; el extractor
todavía la acepta como respaldo, pero la buena es la nueva.)

## Lo primero que hay que saber

Lee [`docs/modelo-de-crianza.md`](docs/modelo-de-crianza.md) antes de tocar
`src/nucleo/planificador.js` o `src/nucleo/herencia.js`. Tiene la deducción entera
del árbol a partir de las reglas de la wiki, y sin ella los cambios en esos dos
archivos son a ciegas.

El resumen de una línea: **un cruce garantiza los 31 que comparten los dos padres,
más uno forzado por cada objeto Recio**. Todo lo demás sale de ahí.

La naturaleza va por otro camino: **sólo la pasa la Piedraeterna, y la pasa
siempre**. Que los dos padres la compartan **no** la transmite — la cría la
sortea igual entre las 25 (`wiki/mecanicas/Crianza.md`). La app tuvo esto al
revés hasta el 23-09-2026, con una vía «compartida» y un selector de estrategia
que ya no existen; si ves rastros de eso en algún sitio, es código viejo.

Dos cosas más de la Piedraeterna. **Ocupa el hueco de objeto**, así que un cruce
que prometa naturaleza sólo fuerza **un** IV con Recio en vez de dos, y la hoja
de sólo naturaleza entra por abajo de la espina. Y **no se vende en ninguna
tienda**, por mucho que el volcado la dé a 4.000 en las cinco guarderías: se
farmea a Pokémon salvajes o se compra en el GTL, así que el presupuesto usa un
precio de mercado con fecha (`NO_SE_VENDE_EN_TIENDA` y `PRECIO_GTL_OBSERVADO` en
`constantes.js`).

## Reglas de este repositorio

1. **`datos/*.json` no se edita a mano.** Se regenera con
   `node herramientas/extraer-wiki.mjs`. Si un dato está mal, se corrige en la
   wiki y se vuelve a extraer. Un JSON tocado a mano se pierde en la siguiente
   extracción sin avisar.
2. **Ningún dato del juego se inventa.** Si la wiki no lo trae, va como hueco
   declarado —una nota visible en la vista y una entrada en el README— no como
   estimación disfrazada de dato. Lo que sí sea estimación va marcado
   (`confianza: 'estimado'`) y se muestra en su propia línea.
3. **`src/nucleo/` no toca el DOM y `src/ui/` no contiene reglas del juego.** Es
   lo que permite probar la lógica en Node sin navegador. Por eso el OCR vive en
   `src/ui/ocr.js` (necesita canvas) pero sólo produce texto: interpretarlo es de
   `src/nucleo/importar.js`, el mismo parser que usa el pegado a mano.
4. **Las pruebas corren contra los JSON reales**, no contra dobles. Si la
   extracción rompe algo, tienen que verlo.
5. **Toda constante del juego cita su fuente** en un comentario, como en
   `src/nucleo/constantes.js`.
6. **El código va en español**, salvo los nombres de especie, que van en inglés
   porque es como los muestra el juego.
7. **Nada de datos de cuenta.** Ni usuarios, ni contraseñas, ni nombres de otros
   jugadores.
8. **Nada importado se guarda sin revisión.** Imagen, texto y archivo pasan por
   la tabla de confirmación. Un IV mal leído produce un árbol plausible y
   equivocado, y eso es peor que un error visible.
9. **Los nombres se resuelven, no se comparan.** El cliente del juego dice
   «Desenrollar» y la wiki «Rodar». Todo lo que venga de fuera pasa por
   `src/nucleo/nombres.js`, que además dice por qué vía resolvió. Lo que no
   reconozca se avisa, nunca se inventa.

## Cómo está montada la app

Siete cosas que no son evidentes leyendo un archivo suelto:

1. **Hay varias crianzas y un solo inventario.** `estado.crianzas` es la lista,
   `estado.objetivo` es un espejo de la activa que `fijar()` propaga: las vistas
   siguen escribiendo `objetivo` como cuando sólo había una. Si escribes
   `objetivo` **y** quieres que la crianza activa NO lo reciba (al cambiar de
   crianza), pasa también `crianzas` en la misma llamada. Sin eso, cambiar de
   crianza escribe el objetivo de la nueva sobre la vieja. Pasó de verdad.
2. **Lo que marca un paso como hecho es el inventario, no una casilla.**
   Completar un cruce borra sus dos padres y anota la cría (`criaDe()`), y el
   plan se recalcula. No guardes casillas por su lado: irían atadas a un id de
   nodo que cambia en cada recálculo y acabarían mintiendo.
3. **Los plegables recuerdan si están abiertos** en un `Set` de
   `componentes.js`, porque la app repinta la vista entera en cada cambio. Sin
   eso, marcar un paso cerraba la lista de pasos.
4. **El inventario se coloca antes de alargar la espina.** Al revés, una hembra
   de la especie que además traía la naturaleza o un 31 se gastaba como «madre
   que sólo pone la especie» y se tiraba lo bueno. No cambies ese orden en
   `planear()`.
5. **La hora y la estación se ordenan, no se esconden.** Con las regiones
   esconder está bien; con la hora no, porque un día del juego son 6 horas
   reales. Lo que no toca ahora se queda en la tabla marcado con cuándo sí. El
   selector vive en Capturas y en Entrenamiento, no en Objetivo: es «cuándo
   estás jugando», no una propiedad del Pokémon que quieres.
6. **Un movimiento se busca en la LÍNEA EVOLUTIVA, no en la forma final.** El
   huevo eclosiona en la base, así que los movimientos huevo son los de la base.
   Mirando sólo la forma final, un Amoonguss con Polvo Veneno salía como «no lo
   aprende por ninguna vía». Usa `viasEnLaLinea()`, no `vias()` a secas.
7. **Sin género ≠ sólo con Ditto.** En PokeMMO un sin género cría con **su
   propia línea evolutiva** o con un Ditto (`wiki/mecanicas/Crianza.md`), al
   contrario que en los juegos originales. Y no tiene sexos: ningún hueco del
   árbol puede pedir ♀ ni ♂, o salen capturas de «1 de cada 0».

## Al tocar la interfaz

Tres trampas que ya han costado caro y que no se ven en las pruebas unitarias:

- **Un cambio de estado que no cambia nada no debe repintar.** Al repintar, el
  navegador dispara `blur` y `change` sobre los elementos que se están quitando
  del DOM; si ese manejador llama a `fijar()` con el mismo valor, se repinta otra
  vez y la página entra en bucle síncrono y se cuelga. `fijar()` compara antes de
  emitir, y `campoConSugerencias` comprueba `isConnected` y el valor previo. No
  quites ninguna de las dos guardas.
- **Lo secundario va plegado.** Una vista con nueve tarjetas iguales no es una
  vista, es un pasillo. El plan tenía 31 pasos en una lista plana y medía cinco
  pantallas; ahora «Ahora mismo» dice lo accionable y el resto va en
  `plegable()`. Al plegar algo, comprueba que las pruebas de navegador lo abran
  (`abrir()` en `pruebas/navegador.mjs`): un `<details>` cerrado esconde sus
  hijos y Playwright no los puede tocar.
- **`<datalist>` no sirve en el móvil.** En Android Chrome no lista nada, y
  `autocomplete="off"` lo remata. El autocompletado es propio
  (`campoConSugerencias`), abre la lista con `pointerdown` —no con `focus`, que lo
  dispara el propio repintado al devolver el foco— y confirma al salir del campo
  o con Enter, no con `change`. Las pruebas tienen que salir del campo para
  confirmar, igual que una persona.

## Al parsear la wiki

Tres cosas que rompen en silencio y ya han roto una vez:

- **los encuentros salen de `wiki/zonas/`, no de la ficha del Pokémon.** La
  ficha trae su tabla de «Dónde encontrarlo» y es lo primero que uno mira, pero
  ahí la zona viene con el nombre pelado y se pierde el sufijo de hora y
  estación — que es justo lo que decide si el Pokémon está cuando tú entras. Las
  fichas de zona lo traen en el frontmatter (`horas:`, `estaciones:`), y eso es
  mejor que deducirlo del nombre del archivo, que viene medio traducido en cinco
  formas distintas. Ver [`docs/datos-y-fuentes.md`](docs/datos-y-fuentes.md).

- **el `\|` escapado de un alias no separa celdas** en una tabla. Partir por
  todos los `|` desplaza la fila entera una columna. Usa el `filas()` del
  extractor, que parte por `/(?<!\\)\|/`.
- **el nombre visible de un `[[enlace|alias]]` es la PRIMERA parte**, que es el
  nombre de archivo.

Detalle más: las fichas de Pokémon tienen 8 secciones de movimientos, no 3, y el
índice bueno de movimientos huevo está en las fichas de **movimiento**, porque es
el único que trae los grupos huevo. Ver
[`docs/datos-y-fuentes.md`](docs/datos-y-fuentes.md).

## Comandos

```
node herramientas/servir.mjs          # arranca la app en localhost:8000
node herramientas/extraer-wiki.mjs    # regenera datos/ desde ../PokeMMO
node herramientas/comprobar-datos.mjs # valida datos/ sin la wiki (corre en CI)
node herramientas/generar-iconos.mjs  # regenera iconos/
node pruebas/ejecutar.mjs             # 217 pruebas unitarias
node pruebas/navegador.mjs            # prueba de navegador (necesita Playwright)
OCR=1 node pruebas/navegador.mjs      # incluye el OCR (descarga ~8 MB)
```

Antes de dar por bueno un cambio en el núcleo: las unitarias **y** la de
navegador. La de navegador falla ante cualquier error de consola, y los fallos
más caros de este proyecto sólo se veían ahí — incluido que el defecto fijo de
estrategia de naturaleza dejaba el inventario inservible.

## Contexto del juego

PokeMMO usa mecánicas de **5ª generación**: ni tipo Hada ni Megaevoluciones. Una
fuente que hable de Gen 6+ no vale sin comprobarla. Y lo que más condiciona el
diseño: **los padres se consumen en cada cruce**, así que un árbol de 5×31 son 16
Pokémon gastados, no prestados.
