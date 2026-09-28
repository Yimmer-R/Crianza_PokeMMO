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

Y el **pseudo 31**, que es un IV a 30: vale de padre cuando no hay un 31, pero no
es un 31. Dos 30 dan 30 seguro; un 30 contra un 31 da 31 sólo con la
probabilidad de la rama «alto» de la tabla (25 % sin objetos, 20 % con uno,
12,5 % con dos) — salvo que el Recio de ese IV lo lleve el padre que tiene el
31, y entonces sí sale 31 seguro. La app coloca los Recios así sola.

La naturaleza va por otro camino: **sólo la pasa la Piedraeterna, y la pasa
siempre**. Que los dos padres la compartan **no** la transmite — la cría la
sortea igual entre las 25 (`wiki/mecanicas/Crianza.md`). La app tuvo esto al
revés hasta el 23-09-2026, con una vía «compartida» y un selector de estrategia
que ya no existen; si ves rastros de eso en algún sitio, es código viejo.

Dos cosas más de la Piedraeterna. **Ocupa el hueco de objeto**, así que un cruce
que prometa naturaleza sólo fuerza **un** IV con Recio en vez de dos, y la hoja
de sólo naturaleza entra por abajo de la espina. Y **quién la lleva ya no es una
decisión fija**: `planear()` monta el árbol con las tres formas de repartirla
(`MODOS_PIEDRA`) y se queda con la que menos pida contra tu inventario — ver el
punto 12 de más abajo. Y **no se vende en ninguna tienda**, por mucho que el
volcado la dé a 4.000 en las cinco guarderías: se farmea a Pokémon salvajes o se
compra en el GTL, así que el presupuesto usa un
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
   **En la interfaz, el hueco se dice sin nombrar la wiki**: al jugador le
   importa que un dato no esté comprobado, no de qué repositorio sale. «No está
   documentado si…», no «la wiki no dice si…». La procedencia se sigue
   documentando aquí, en el README y en `docs/`, que es donde se consulta.
   El campo interno `fuente: 'wiki'` de `coste.js` se queda como está: no sale
   a pantalla.
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

Dieciocho cosas que no son evidentes leyendo un archivo suelto:

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
7. **La especie la pone la LÍNEA, no la forma final.** El huevo eclosiona en la
   base, así que un Staryu y un Starmie ponen el mismo huevo: el hueco de la
   espina acepta a cualquiera de la línea y se propone el más fácil de pillar
   (`quienPoneLaEspecie()`, `lineaMaterna()`). Atado a la forma final, un
   Starmie en Unova salía como «captura imposible» con Staryu a mano. Dos
   derivadas: los 18 bebés («No cría») valen como captura pero hay que
   evolucionarlos antes, y las 7 líneas sin ninguna hembra (Nidoran♂, Tauros,
   Rufflet, Throh, Sawk, Volbeat, Tyrogue) sólo pasan su especie con un macho y
   un **Ditto** — y como un Ditto no se cría, su hueco es una hoja: se captura o
   se compra, nunca sale de un cruce.
8. **Sin género ≠ sólo con Ditto.** En PokeMMO un sin género cría con **su
   propia línea evolutiva** o con un Ditto (`wiki/mecanicas/Crianza.md`), al
   contrario que en los juegos originales. Y no tiene sexos: ningún hueco del
   árbol puede pedir ♀ ni ♂, o salen capturas de «1 de cada 0».
9. **Un 30 entra como pseudo 31, pero nunca en la raíz.** `cumple()` acepta un
   30 en cualquier hueco de PADRE y lo marca (`r.pseudo`), y
   `asignarInventario()` ordena los candidatos poniendo los 31 de verdad
   delante. En la RAÍZ no se acepta: la raíz es el Pokémon que el usuario ha
   pedido, y darle por cumplido un 6×31 con un 30 es decirle que ya está cuando
   no está. Lo que el árbol entrega de verdad lo calcula `ivsDelArbol()`, que
   propaga el **suelo** (el peor valor posible) de abajo arriba y va apuntando
   en qué cruces hay un 30 contra un 31 y con qué probabilidad sale el 31. De
   ahí salen `plan.ivsFinales`, `plan.ivsCortos` y `plan.suerte`, y esos son los
   IVs que usa la optimización de EVs — con un 30 los escalones de nivel 50
   caen en otro sitio, porque cambia la paridad.

10. **Si lo único que falla es el sexo, se cruza en vez de capturar.** El sexo
   de un Pokémon no se cambia, pero el de una cría sí: se paga en la guardería.
   Así que un hueco «1×31 ♀» que nadie puede cubrir se convierte en un cruce
   entre el ♂ que SÍ tiene ese 31 —con su Recio, que lo fuerza— y una captura
   que no pide nada (`extenderPorSexo()`). Cambia 1 de cada 64 encuentros por 1
   de cada 2, más un Recio y el pago del sexo. Tiene que correr **después de
   `asignarSexos()`**: hasta ahí los huecos libres no tienen sexo, y uno sin
   sexo ya se lo habría quedado el inventario en la primera pasada — o sea que
   lo que llega con un sexo pedido es porque su pareja ya está atada y de verdad
   no le queda otro. Y sólo con lo que ha SOBRADO, un ejemplar por cruce.
11. **Lo que el plan NO usa se explica.** `plan.sobrantes` va en un plegable de
   la vista Plan con el motivo de cada uno (`evaluar()`, el mismo de la pestaña
   Inventario). Un 2×31 en la caja mientras el plan pide capturas parece un
   fallo del plan aunque el motivo sea bueno; callárselo fue exactamente el
   reporte del usuario.
12. **La Piedraeterna se reparte probando, no por norma.** En el padre, la
   cadena de naturaleza cuelga de un hueco libre (cualquier especie, cualquier
   sexo) y es lo mejor partiendo de cero. En la madre, esa cadena cae en la
   espina, pero entonces **el padre es el que carga con todos los IVs** — y eso
   es lo mejor en cuanto tienes un macho del inventario cargado de 31: entra tal
   cual en el cruce final y te ahorra su rama entera. Así que `planear()` monta
   el árbol tres veces (`padre`, `raiz`, `madre`), lo puntúa con
   `comparaPlanes()` —primero los IVs que se quedan cortos, luego el ESFUERZO de
   captura (encuentros esperados, no número de capturas: dos «cualquiera» son
   más fáciles que un 2×31), luego los cruces— y devuelve el mejor. Con el
   inventario del usuario (un Horsea ♂ 2×31) eso pasó de 5 cruces y 1 captura a
   **3 cruces y 0 capturas**. Si vuelves a fijar el reparto, el plan se queda
   estancado otra vez.
   **El otro eje —qué IV se fuerza y cuál se comparte— NO se prueba, y está
   medido**: se implementó y en 26.000 inventarios al azar no mejoró el plan ni
   una vez, mientras doblaba el coste del recálculo. El motivo es estructural y
   está en la nota de `ordenarPorEscasez()`: el IV compartido tiene que estar a
   31 en los DOS padres, así que compartir el que más abunda —lo que ya hace la
   heurística— es la respuesta, no una aproximación. No lo vuelvas a añadir sin
   volver a medirlo.
13. **El presupuesto trae la vía sin dinero.** Cada objeto lleva para qué es
   (`paraQueEs()`: «Franja Recia (Velocidad)», «Piedraeterna (Naturaleza)») y su
   precio en Puntos de Batalla (`precioEnPb()`), que para los seis Recios son
   750 BP en la Torre Batalla de Kanto. La Piedraeterna **no** tiene precio en
   PB y elegir el sexo de la cría tampoco —es un servicio, no un objeto—, y eso
   se dice en su línea en vez de dejarla en blanco (`pres.pbNoCubre`).

14. **Los sprites se enlazan, no se guardan.** Cada Pokémon sale con su imagen, y
   la imagen NO está en este repositorio ni en la wiki: son unos 150 MB y las dos
   cosas son texto. La wiki (`wiki/sprites/`) las enlaza al volcado de PokeAPI, y
   `datos/sprites.json` guarda el prefijo común **una vez** en `base` más, de cada
   Pokémon, sólo lo que cambia. Dos vías: el render 3D de Pokémon HOME —lo que
   pidió el usuario, y lo más nuevo que hay publicado suelto— y el sprite animado
   de 5ª generación, que es el del propio juego. De Escarlata/Púrpura y de
   Leyendas Z-A **no hay volcado**, y en 3D **no existe el dorso**: las dos cosas
   están comprobadas pidiendo el archivo, no supuestas. Tres consecuencias:
   **la especie manda sobre la forma final** también aquí — cada página de la
   wiki tiene su hoja, así que «Rotom Calor» no cae en el sprite de Rotom;
   **el sexo importa en 97 de las 667**, que son las que el juego dibuja distintas,
   y en el resto pedir la hembra devuelve la de siempre, que no es un hueco;
   y **una imagen que no carga deja su hueco dicho**, nunca la de otra especie
   ni el icono de rota del navegador. El hueco NO lleva texto dentro: el sprite va
   pegado al nombre en tablas y sugerencias, y dos letras de más bastaron para que
   una opción dejara de decir «Rattata» y dijera «RARattata».

15. **Un IV que no se pide NO se conserva, y eso no es un fallo.** Un cruce
   garantiza los 31 que comparten los DOS padres más los que fuerce un Recio, y
   los Recios de un plan ya están todos comprometidos con lo pedido —uno de los
   dos huecos se lo lleva la Piedraeterna cuando hay naturaleza—. Así que el 31
   en Defensa de un Gible que está ahí sólo por poner la especie sale por una de
   tres vías, y ninguna se puede fabricar: **gratis** si los dos padres de ese
   cruce lo tienen (lo recoge el suelo de `ivsDelArbol()`), **por suerte** con la
   probabilidad de la rama alta, o **pidiéndolo**, y entonces el objetivo pasa de
   n×31 a (n+1)×31 y el árbol dobla. `src/nucleo/regalos.js` mide las tres y la
   vista Plan las enseña con el precio delante; `objetivo.conservados` recuerda
   cuáles se pidieron así para poder soltarlos. No añadas una heurística que
   «intente conservarlos»: no existe tal cosa, y prometerla sería mentir.
   Dos derivadas: el «o 30 en su defecto» **no es un modo aparte** —se pide a 31,
   `cumple()` acepta el 30 como pseudo si es lo mejor que hay y el plan dice a qué
   valor lo deja (`saldriaA`)—; y lo único gratis que sí se hace es un desempate,
   el último de `asignarInventario()`: entre candidatos que ya costaban lo mismo
   gana el que comparte un regalo con su pareja de cruce. Va el último a
   propósito, detrás de `perfectos`: conservar un regalo nunca vale quemar un
   3×31 en un hueco de 1×31.

16. **Las características van en Objetivo, y son una inferencia declarada.** Las
   barras viven DENTRO de «¿Qué quieres criar?», justo debajo de las etiquetas de
   la especie, porque son parte de saber qué Pokémon es; y en Objetivo y no en
   Entrenamiento porque **todo lo que entra en el número se toca en esa misma
   página** —especie, IVs, naturaleza, EVs y nivel—. Entrenamiento responde a
   otra pregunta, que es dónde farmear esos EVs. Dos cosas del dibujo: una sola barra por
   característica con **dos tramos** —la base en gris y encima, en blanco, lo
   que suman IVs y EVs—, y los dos tramos están en la MISMA unidad porque eso
   sale de la fórmula, no de un apaño: un IV y unos EVs valen exactamente
   `(IV + ⌊EV/4⌋)/2` puntos de base, y **no depende del nivel**, porque el nivel
   multiplica al paréntesis entero. El carmesí no entra en la barra: es de las
   acciones. Y lo importante, que es la regla 2: la fórmula de característica
   **no está verificada** —`wiki/mecanicas/IVs.md` lo dice en «Qué falta aquí»—,
   así que la tarjeta lo avisa en su propia línea. Los IVs que se usan son los
   que la crianza entrega de verdad (`plan.ivsFinales`), y los que no se piden
   cuentan como 0, que es el suelo honesto.

17. **Se corrige cada fila de la importación por su cuenta.** El OCR se equivoca
   y los dedos también, y una tanda de diez no puede depender de que las diez
   salgan bien: en la tabla de revisión cada fila tiene su «Editar», que la
   convierte en campos sin tocar a las demás (`celdasEditables()` en
   `importador.js`). Los nombres se **resuelven** al confirmar, igual que al
   importar —se escribe «poliwhirl» y se guarda «Poliwhirl»—, que es la regla 9.
   Sustituye al viejo «pasarlo al formulario», que sólo salía con UN Pokémon en
   la tanda y obligaba a reescribirlo entero.

18. **Un movimiento huevo tiene que llegar hasta una CAPTURA.** Lo pasa el padre,
   y el padre del cruce final casi nunca se captura: es a su vez una cría. Así
   que la marca baja por la rama paterna hasta una hoja (`bajarMovimientosHuevo()`),
   que es el único sitio donde el movimiento puede entrar de verdad. Antes se
   quedaba en un nodo de tipo `cruce`, donde no la mira nadie —`cumple()` sólo la
   comprueba al colocar un ejemplar y `loQueFalta()` sólo la enseña en los huecos
   por conseguir—, y el plan de un Milotic con Neblina salía con cuatro capturas
   y ninguna pedía el movimiento. Tres consecuencias más:
   **un hueco con movimiento deja de ser de especie libre** (`padresQuePasanTodos()`
   dice quién puede saberlo, y con dos movimientos es la INTERSECCIÓN: un huevo
   tiene un solo padre); **obliga a criar aunque el objetivo se capturase entero**,
   porque un movimiento huevo sólo entra por un huevo — de ahí
   `raizParaMovimientoHuevo()`, que envuelve en un cruce un objetivo de 1×31 o de
   ninguno; y **Capturas dice cómo lo sabe** cada especie que vale («lo aprende al
   nivel 36», «se le enseña con la MT/MO», «sólo de huevo: hace falta criarlo
   aparte»), que es lo que decide a quién buscar.
   Y ojo con el punto 6: `mejorVia()` miraba `vias()` en vez de `viasEnLaLinea()`
   y por eso decía «Milotic no aprende Neblina» — el movimiento es de **Feebas**.
   La misma trampa, en otro archivo.

## El aspecto

La **forma** sale de una plantilla que pasó el usuario (un PSD de 1440×8000, «UI
Design / Web Template»); el **color**, de una paleta de fantasía oscura que dio
después. Las dos cosas están en `src/css/estilos.css` y en ningún otro sitio.

De la plantilla, la geometría y la tipografía:

- **esquinas rectas** en todo (`--radio: 0`). Nada de píldoras ni de sombras;
- **un solo acento**, con cuentagotas. El resto es blanco y gris;
- **los rótulos pequeños van en MAYÚSCULAS muy espaciadas** (`--rotulo` y
  `--espaciado-rotulo`): etiquetas de campo, cabeceras de tabla, botones, chips
  y `h3`. El texto corrido NO;
- **los titulares llevan un subrayado corto** del acento, que pone `h2::after`;
- **las listas numeradas llevan su pestañita** `.01` montada sobre el borde de
  arriba (`.pasos li::before`), como las tarjetas de curso de la plantilla;
- **el pie es un bloque macizo** de color.

De la paleta, los colores y la profundidad. Los tokens están en `:root` con el
nombre que les puso el usuario: tres superficies (`--fondo` abisal, `--tarjeta`,
`--elevada` para lo anidado), tres niveles de texto, el carmesí de las acciones
con su contenedor para lo elegido, el gris tonal, la insignia blanca y el rojo
anaranjado del estado. Tres reglas que no son evidentes:

1. **El carmesí es de las acciones y el rojo anaranjado de las alertas.** Un
   chip que sólo informa va en el contenedor terciario gris: con los dos rojos
   juntos no se distinguía una acción de un aviso, que es justo lo que la paleta
   quiere evitar. Error y aviso sí comparten color, pero no forma — el aviso es
   un contorno y el error va relleno sobre `--mal-suave`.
2. **Hay dos valores derivados, y los dos por contraste.** `--acento-texto`
   (`#ff3b57`) porque el carmesí `#d90429` como LETRA pequeña se queda en 3,6:1
   sobre una tarjeta, y `--borde-campo` (`#6b6b6b`) porque el borde `#3d3d3d` se
   queda en 1,7:1 y el campo no se veía. Todo lo demás va tal cual.
3. **No hay tema claro.** La paleta es oscura y no tiene versión clara, así que
   se quitó el bloque de `prefers-color-scheme: light` y `:root` declara
   `color-scheme: dark` — sin eso, con el sistema en claro el navegador pintaba
   los `<select>` y las casillas en blanco sobre negro.

Lo de la legibilidad **no se comprueba a ojo**: la prueba de navegador recorre
el DOM de las cinco vistas, con los plegables abiertos, busca el fondo efectivo
de cada nodo con texto y exige 4,5:1 (3:1 si el texto es grande). Si tocas
colores y algo baja de ahí, falla. Son ~760 elementos.

## Al tocar la interfaz

Tres trampas que ya han costado caro y que no se ven en las pruebas unitarias:

- **Un cambio de estado que no cambia nada no debe repintar.** Al repintar, el
  navegador dispara `blur` y `change` sobre los elementos que se están quitando
  del DOM; si ese manejador llama a `fijar()` con el mismo valor, se repinta otra
  vez y la página entra en bucle síncrono y se cuelga. `fijar()` compara antes de
  emitir, y `campoConSugerencias` comprueba `isConnected` y el valor previo. No
  quites ninguna de las dos guardas.
- **Los textos son cortos, y eso es una decisión del usuario.** Una nota sólo se
  queda si cambia lo que el jugador va a hacer: la Piedraeterna, los 30 contra
  31, que la fórmula de característica es una estimación, que no se pueden sacar
  las cajas del juego. Lo que se deduce del propio encabezado o del sentido común
  se borra — «Marca los IVs que quieres perfectos» debajo de «IVs a 31 · 2
  marcados» era eso. Antes de añadir un párrafo, mira si el rótulo de al lado ya
  lo dice.
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
node herramientas/medir-ordenes.mjs   # por qué NO se busca el orden de los IVs
node pruebas/ejecutar.mjs             # 318 pruebas unitarias
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
