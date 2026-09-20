# Crianza PokeMMO

App web para planificar crianza y entrenamiento en PokeMMO. **No** es una wiki:
el conocimiento del juego vive en el repo hermano
[Yimmer-R/PokeMMO](https://github.com/Yimmer-R/PokeMMO) y aquí sólo se consume.

## Lo primero que hay que saber

Lee [`docs/modelo-de-crianza.md`](docs/modelo-de-crianza.md) antes de tocar
`src/nucleo/planificador.js` o `src/nucleo/herencia.js`. Tiene la deducción entera
del árbol a partir de las reglas de la wiki, y sin ella los cambios en esos dos
archivos son a ciegas.

El resumen de una línea: **un cruce garantiza los 31 que comparten los dos padres,
más uno forzado por cada objeto Recio**. Todo lo demás sale de ahí.

Y lo mismo con la naturaleza: **la pasa la Piedraeterna, o el que los dos padres la
compartan**. La segunda vía no gasta hueco de objeto, así que el cruce sigue
forzando dos IVs. Ese dato viene de la experiencia del usuario jugando
(20-09-2026), **no** de la wiki, que no documenta qué pasa sin Piedraeterna: está
marcado como tal en `herencia.js` y convendría subirlo a la wiki como fuente
nueva.

Ninguna de las dos vías gana siempre, así que el planificador construye las dos y
se queda con la de menos esfuerzo (`estrategiaNaturaleza: 'auto'`). No vuelvas a
poner un defecto fijo: la compartida es más barata en vacío pero la Piedraeterna
gana en cuanto hay inventario, porque deja huecos sin naturaleza que el inventario
sí puede rellenar.

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

## Al tocar la interfaz

Dos trampas que ya han costado caro y que no se ven en las pruebas unitarias:

- **Un cambio de estado que no cambia nada no debe repintar.** Al repintar, el
  navegador dispara `blur` y `change` sobre los elementos que se están quitando
  del DOM; si ese manejador llama a `fijar()` con el mismo valor, se repinta otra
  vez y la página entra en bucle síncrono y se cuelga. `fijar()` compara antes de
  emitir, y `campoConSugerencias` comprueba `isConnected` y el valor previo. No
  quites ninguna de las dos guardas.
- **`<datalist>` no sirve en el móvil.** En Android Chrome no lista nada, y
  `autocomplete="off"` lo remata. El autocompletado es propio
  (`campoConSugerencias`), abre la lista con `pointerdown` —no con `focus`, que lo
  dispara el propio repintado al devolver el foco— y confirma al salir del campo
  o con Enter, no con `change`. Las pruebas tienen que salir del campo para
  confirmar, igual que una persona.

## Al parsear la wiki

Dos cosas que rompen en silencio y ya han roto una vez:

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
node pruebas/ejecutar.mjs             # 158 pruebas unitarias
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
