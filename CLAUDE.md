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
   lo que permite probar la lógica en Node sin navegador.
4. **Las pruebas corren contra los JSON reales**, no contra dobles. Si la
   extracción rompe algo, tienen que verlo.
5. **Toda constante del juego cita su fuente** en un comentario, como en
   `src/nucleo/constantes.js`.
6. **El código va en español**, salvo los nombres de especie, que van en inglés
   porque es como los muestra el juego.
7. **Nada de datos de cuenta.** Ni usuarios, ni contraseñas, ni nombres de otros
   jugadores.

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
node pruebas/ejecutar.mjs             # 102 pruebas unitarias
node pruebas/navegador.mjs            # prueba de navegador (necesita Playwright)
```

Antes de dar por bueno un cambio en el núcleo: las unitarias **y** la de
navegador. La de navegador falla ante cualquier error de consola, y los tres
fallos más caros de este proyecto sólo se veían ahí.

## Contexto del juego

PokeMMO usa mecánicas de **5ª generación**: ni tipo Hada ni Megaevoluciones. Una
fuente que hable de Gen 6+ no vale sin comprobarla. Y lo que más condiciona el
diseño: **los padres se consumen en cada cruce**, así que un árbol de 5×31 son 16
Pokémon gastados, no prestados.
