# Decisiones

Por qué está hecho así y no de otra forma. Sirve para no volver a discutirlo.

## Web estática, sin dependencias ni build

No hay `package.json`, ni npm, ni paso de compilación. Módulos ES nativos y una
hoja de CSS. Motivos:

- se publica en GitHub Pages tal cual;
- se puede abrir dentro de cinco años y seguirá funcionando, porque no hay
  ninguna versión de nada que caducar;
- el corredor de pruebas son 40 líneas y corre con `node`, sin instalar nada.

El coste es que no hay tipos ni tree-shaking. Con 10 módulos de lógica no compensa.

## Hace falta un servidor local, aunque sea estática

Los navegadores bloquean `fetch()` sobre `file://`, así que con doble clic los
JSON de `datos/` no se pueden leer. Las alternativas eran:

- **incrustar los datos en el HTML** como script clásico: funcionaría con doble
  clic, pero mete 3,5 MB en el propio `index.html`, se recarga entero en cada
  visita y no se puede cachear aparte;
- **pedir un servidor**, que es una línea: `node herramientas/servir.mjs`.

Se eligió lo segundo y se incluye el servidor en el repo para que sea una línea de
verdad. El mensaje de error de la app explica el motivo si alguien lo abre con
doble clic.

## La lógica no toca el DOM

`src/nucleo/` no sabe que existe un navegador y `src/ui/` no contiene ninguna
regla del juego. Por eso las 102 pruebas corren en Node en menos de un segundo,
sin navegador ni jsdom, y por eso la prueba de solidez del árbol puede simular
cruces sin pintar nada.

## Repintado completo en cada cambio, aplazado a un microtask

Cualquier cambio de estado recalcula el plan y repinta la vista entera. Con estos
volúmenes va sobrado, y a cambio es imposible que el plan se quede desincronizado
del inventario — que es el fallo que más dolería aquí.

El aplazamiento a `queueMicrotask` no es un detalle de rendimiento: sin él, un
cambio disparado desde el `change` de un input repinta el DOM **dentro** del
propio evento, el elemento que lo está disparando se queda huérfano y
`replaceChildren()` revienta. Pasó, y se ve en el historial. De paso, el foco y la
posición del cursor se restauran por `id` después de cada pintado, o escribir en
un campo te echaría de él.

## El autocompletado es propio, no `<datalist>`

La primera versión usaba `<datalist>`, que es el control nativo del navegador y
no cuesta nada. **En el móvil no servía.** Probándolo en Android Chrome, el campo
pintaba su flecha —el navegador reconoce el datalist— pero no listaba ni una
opción, ni al tocar ni al escribir. Con 667 especies y 559 movimientos, eso
significa escribir cada nombre entero a mano.

Dos causas, y las dos apuntan a lo mismo:

- el soporte de `<datalist>` en Android Chrome es irregular, más aún con cientos
  de opciones;
- el campo llevaba `autocomplete="off"`, que **en varios navegadores suprime
  precisamente las sugerencias del datalist**. Estaba puesto para que el
  navegador no ofreciera valores guardados, y de paso mataba la lista.

Así que la lista se pinta a mano (`campoConSugerencias` en
`src/ui/componentes.js`). Dos detalles que no son adorno:

- **filtra sin tocar el estado global**: escribir sólo mueve DOM del propio
  componente, y `onChange` se llama al confirmar. Si cada tecla repintara la
  vista, el campo perdería el foco en cada letra;
- **al enfocar ya enseña opciones**, sin escribir nada. En el móvil es la
  diferencia entre descubrir que hay lista y creer que está roto.

Se sigue aceptando texto escrito a mano: al salir del campo se confirma lo
escrito, y pasa por el resolutor de nombres. Así «Desenrollar» acaba en «Rodar»
aunque no se toque la lista.

## Un cambio que no cambia nada no repinta

Esto no es una optimización, es la defensa contra un bucle que congelaba la app.

Al repintar, la vista entera se reemplaza y el navegador dispara eventos —`blur`,
`change`— sobre los elementos que se están **quitando** del DOM. Si el manejador
de uno de ellos llama a `fijar()` con el valor que ya tenía, se repinta otra vez,
se vuelve a disparar el evento, y la página se queda colgada en un bucle
síncrono. Desde fuera parecía que la app no cargaba: el campo de especie
desaparecía y nada respondía.

Se ataca en dos capas:

- **en `fijar()`**: si todas las claves del cambio son iguales a lo que ya había,
  no se emite. Corta la clase entera de bug, para cualquier campo presente o
  futuro. `fijar({})` sigue forzando un repintado, que es como se pide a propósito.
- **en el campo de autocompletado**: no confirma si el elemento ya no está en el
  documento, ni si el valor no ha cambiado, y como mucho una vez por instancia.

Dos capas porque la de abajo es barata y la de arriba explica el porqué. El fallo
sólo se vio en la prueba de navegador, y como un cuelgue, no como un error.

## Repintar no mueve la página

El repintado completo llevaba un `scrollTo(0)`. En el ordenador apenas se nota;
en el móvil, con el formulario del objetivo largo, **cada cambio te devolvía al
principio** y había que bajar otra vez. Inusable.

Ahora `pintar()` guarda `scrollY` y el foco antes de repintar y los devuelve
después, y sólo va arriba cuando **cambia la pestaña**, que es el único caso en
que el usuario espera empezar desde el principio.

## El estado se lee siempre fresco, nunca del cierre del render

`cambiaObjetivo()` acepta una función del objetivo **actual**, no un objeto
calculado con el `objetivo` que capturó el render. Si se encadenan dos cambios sin
repintar en medio —marcar dos IVs seguidos—, la forma con objeto hace que el
segundo pise al primero.

## Emparejado del inventario en tres pasadas

Construir el árbol, colocar el inventario encima y repartir los sexos al final,
en ese orden. La versión de una sola pasada gastaba un 3×31 en la primera hoja de
1×31 del recorrido. Está explicado en [modelo-de-crianza.md](modelo-de-crianza.md).

## La naturaleza sólo viaja con Piedraeterna (corrección del 23-09-2026)

Durante unos días la app creyó que dos padres de la misma naturaleza la
transmitían, y encima elegía entre esa vía y la Piedraeterna comparando esfuerzo.
El dato venía de una observación del usuario jugando; `wiki/mecanicas/Crianza.md`
de la wiki nueva lo desmiente en una sección expresa: **la cría no la hereda, la
sortea entre las 25, y la Piedraeterna hace falta siempre**.

Se ha quitado entero: la vía compartida, el selector de estrategia, la
comparativa de la pestaña Plan y el `estrategiaNaturaleza` del estado. Queda una
sola cadena, la de Piedraeterna.

Lección, y por eso está escrito aquí: **una observación al jugar es una fuente
débil**. Un cruce que salió con la naturaleza buena sin Piedraeterna es 1 de 25,
no una prueba. Cuando la wiki calle sobre algo, el hueco se declara; no se rellena
con una partida.

## Hora y estación se ordenan, no se esconden

Con las regiones, esconder es lo correcto: una sugerencia en Unova no vale nada
si no tienes Unova, y desbloquearla es una partida entera. Con la hora y la
estación no: **un día del juego son 6 horas reales**, así que esperar a la noche
son minutos; las estaciones van por mes real, así que esperar al invierno son
semanas. Esconder una zona porque ahora es de día sería tirar información útil.

Así que el filtro **ordena**: primero lo que sirve ahora, luego lo que espera un
cambio de franja, y al final lo que espera un cambio de estación. Lo que no toca
se queda en la tabla con una etiqueta que dice cuándo sí, en tres colores: verde
«sirve ahora», amarillo «espera minutos», rojo «espera semanas».

## El inventario se coloca ANTES de alargar la espina

El orden de esas dos pasadas cambia el resultado, y al revés se pierde valor.
Alargando primero, una hembra de la especie objetivo que además traía la
naturaleza —o un 31— se gastaba como «madre que sólo pone la especie» y se
tiraba lo bueno que tenía: el hueco nuevo ahorra lo mismo que el de naturaleza
(una captura), así que el desempate la mandaba a cualquiera de los dos.

Colocando el inventario primero, esa hembra cae donde de verdad aprovecha, y la
espina sólo se alarga si después **sigue sobrando** alguna hembra de la línea que
no encaja en ningún sitio. Lo vigilan tres pruebas en
`pruebas/planificador.prueba.mjs`.

## Los precios de mercado se enseñan, no se suman

La wiki no guarda precios del GTL a propósito: caducan en semanas. Pero el
usuario mandó capturas de un rastreador de precios de la Piedraeterna, y ahí
había algo que sí merece estar: la guardería la vende a **4.000 fijos** en las
cinco regiones, y el GTL lleva un año oscilando entre 3.480 y 5.728 — **casi
siempre por encima**. O sea que comprarla en el GTL, que es lo que uno hace por
costumbre, suele salir más caro.

La solución respeta las dos cosas. El total del presupuesto sigue usando el
precio de tienda, que es firme. El precio observado va aparte, en
`PRECIO_GTL_OBSERVADO`, **con su fecha pegada**, su rango y de dónde sale, y la
vista dice explícitamente que caduca y que hay que volver a mirarlo. Un número
de mercado sin fecha miente a los dos meses; con fecha, es un dato.

## Sin género no es «sólo con Ditto», y por eso salían capturas imposibles

La app tenía la regla de los juegos originales: un Pokémon sin género sólo cría
con Ditto. En PokeMMO no es así — `wiki/mecanicas/Crianza.md` lo dice en una
línea: *«Genderless Pokémon can only breed with their evolution line Pokémon and
Ditto»*. O sea que dos Staryu crían entre sí.

El síntoma era peor que un dato mal: el árbol pedía ♀ en la espina y ♂ en el
hueco libre, y como Starmie tiene 0 % de los dos, `intentosEsperados` salía
infinito y la app mostraba **«captura imposible»** junto a «ninguna de las
especies compatibles aparece en tus regiones». Un plan correcto presentado como
imposible es peor que un error visible.

Arreglado en tres sitios, porque el sexo se decide en tres: `puedenCriar()` y
`padresCompatibles()` (la pareja es su línea o un Ditto),
`restriccionesDeLosHijos()` y `asignarSexos()` (ningún hueco pide sexo, todos
`SIN_GENERO`), y el formulario del objetivo (el selector de sexo desaparece y el
sexo pedido se borra al elegir una especie sin género). Lo vigilan seis pruebas
de compatibilidad y cinco de planificador.

## Un movimiento se busca en la línea evolutiva, no en la forma final

Pedirle Polvo Veneno a un Amoonguss salía como *«Amoonguss no aprende Polvo
Veneno por ninguna vía que traiga la wiki»*, y es un objetivo perfectamente
normal: es movimiento huevo de **Foongus**, que es lo que sale del huevo. El
error era mirar sólo las listas de la forma final, cuando toda la crianza
funciona sobre la base.

`viasEnLaLinea()` recorre de la forma final hacia la base y devuelve cada vía con
la fase en la que está. Eso arregla tres cosas de golpe: la validación deja de
rechazar el objetivo, `movimientosSoloDeHuevo()` ata el padre del cruce final al
movimiento —que es lo que había que calcular—, y el campo de «añadir
movimiento» acepta lo que la línea puede aprender.

## El recordador de movimientos resuelve casi todo el problema del orden

La pregunta era: ¿qué pasa si la fase anterior aprende un movimiento a un nivel
más alto que el de su evolución, o si la forma final lo tiene a un nivel que ya
habrás pasado? La respuesta está en `wiki/mundo/conceptos/Relearners.md`, y
cambia el diseño: el **recordador** está en todos los centros Pokémon, cobra en
Escamas Corazón y puede enseñar los movimientos de cualquier nivel **aunque no
hayas llegado** y los de una evolución anterior **aunque nunca los haya sabido**.

Así que «retrasar la evolución» casi nunca hace falta. De hecho, con los datos
actuales, **cero** Pokémon lo necesitan: no hay ninguna fase anterior que
aprenda por nivel un movimiento por encima del nivel de su evolución y que la
final no pueda recuperar. La app tiene la rama por si aparece, pero no se
inventa el caso.

Lo que el recordador **no** puede es añadir un movimiento huevo después: sólo lo
recupera si la cría nació con él. Por eso la guía pone lo del huevo en el paso 1
y el resto detrás, y ese orden no es cosmético.

Sí queda un caso real, y sólo uno en todo el juego con estos datos: un
movimiento que una fase anterior tiene y la final no puede conseguir por ningún
medio (Ludicolo y Hoja Afilada). Ahí el orden manda, y la app entra por la fase
**más tardía** que lo consiga sin huevo para arrastrarlo lo menos posible.

## El precio que no existe: la Piedraeterna

`datos/objetos.json` dice que la venden los cinco encargados de guardería a
4.000 PokéYen. Sale de un volcado de datos del juego, y jugando no está en
ninguna tienda: se farmea a Pokémon salvajes o se compra en el GTL.

No se corrige el JSON a mano —regla 1 de este repositorio— sino con una lista
declarada en `constantes.js` (`NO_SE_VENDE_EN_TIENDA`) que dice cuál es el objeto
y por qué, con la fecha y la fuente: la experiencia del usuario, que es más
débil que un dato de la wiki pero es quien está delante del juego. Convendría
subirlo a la wiki como fuente nueva para que la corrección viva allí.

Consecuencia: la línea de la Piedraeterna en el presupuesto lleva un precio de
mercado (4.957 el 22-09-2026) marcado como estimado, y el rango del último año
al lado, para que se vea que cuatro Piedraeternas pueden costar entre 13.920 y
22.912 según cuándo compres.

## Tesseract.js es la única excepción a «sin dependencias»

El OCR necesita un motor, y escribirlo no es razonable. Se carga desde CDN, **sólo
cuando el usuario sube una imagen**, y si falla la app sigue entera y te manda a
la vía de texto. No hay `package.json` ni instalación: sigue siendo una web
estática.

El modelo de español pesa unos 8 MB. Por eso el OCR no es la vía principal sino
una de tres, y las otras dos no descargan nada.

## Nada importado se guarda sin revisión

El OCR se equivoca, y un IV mal leído rompe el plan entero **sin que se note**: el
árbol sale plausible y está mal. Así que las tres vías automáticas (imagen, texto,
archivo) pasan por una tabla de revisión con los IVs destacados, y hay que
confirmar. Cuando el OCR falla, el texto que leyó se deja en la pestaña de texto
para corregirlo, que es más rápido que reescribir la ficha.

## Un resolutor de nombres, no comparación literal

El cliente del juego y la wiki no llaman igual a todo: la ficha dice
«Desenrollar» y la wiki lo tiene como «Rodar». Comparar cadenas habría descartado
el dato como movimiento inexistente.

El resolutor intenta, en este orden: exacto → sin tildes → nombre en inglés →
tabla de alias del cliente → aproximado por distancia de edición. Y **siempre dice
por qué vía resolvió**, para que la interfaz pueda enseñar «he interpretado X como
Y» en vez de decidir en silencio. Lo que no reconoce no se inventa: se avisa.

La tabla de alias del cliente no puede estar completa y no se pretende: se llena
cuando aparece un caso, con un comentario de dónde salió.

## Se marca lo estimado en vez de redondearlo

La wiki publica el pago por sexo sólo en los extremos (5.000 y 25.000). El tramo
de en medio va en su **propia línea** del presupuesto, marcado «estimado», en vez
de sumarse callando al total. Lo mismo con los huecos: cada vista tiene su nota de
«lo que no sé», con el motivo.

La alternativa —dar un número redondo y quedar bien— convierte la app en algo en
lo que no se puede confiar para gastar 300.000 PokéYen.

## No se guardan precios de mercado

Es la decisión de la wiki y se hereda: un precio del GTL apuntado miente a los dos
meses. Los padres de partida quedan **fuera** del total, con una nota que dice que
ese número lo pone el usuario. Preferible a un presupuesto que parece completo y
no lo es.

## GitHub Pages con las pruebas por delante

El flujo de publicación corre las pruebas unitarias y una comprobación de
coherencia de `datos/` **antes** de publicar. Si algo falla, no se publica: es
mejor una app vieja que funciona que una nueva con el planificador roto.

Se publica el repositorio tal cual, sin compilar, porque no hay nada que
compilar. El único paso manual es decirle a GitHub que la fuente de Pages son las
Actions, y eso no se puede automatizar desde un flujo.

## Importar está en las dos pestañas, con el mismo parser

Importar una ficha sirve para dos cosas distintas: registrar un Pokémon que
tienes, o describir el que quieres criar. Estaba sólo en Inventario, y rellenar
siete bloques a mano para decir «quiero este competitivo» no tiene sentido si ya
tienes la ficha.

La interfaz vive en `src/ui/importador.js` y se comparte, con un `destino` que
decide dónde acaba el resultado. No duplicada en las dos vistas: si el formato
cambia, no hay dos sitios que puedan quedarse desincronizados.

Al pasar una ficha a objetivo se toman **los IVs que ya están a 31**, no los
valores tal cual: un objetivo es «quiero estos IVs perfectos». Como eso no es lo
que se quiere cuando la ficha se usa como plantilla de un competitivo, hay una
casilla para marcar los seis.

## El inventario vive en el navegador

`localStorage`, con exportación e importación a JSON. No hay backend, así que no
hay nada que mantener ni ninguna cuenta que crear, y los datos no salen del
equipo. Si el almacenamiento está bloqueado (ventana privada) la app funciona
igual en memoria y avisa de que no sobrevivirá al recargar.

Tampoco se guarda ni se pide nada que identifique a otros jugadores, igual que en
la wiki.

## Todo en español, incluido el código

Nombres de funciones, variables y archivos en español. El dominio está en
español, la wiki está en español y quien lo va a mantener escribe en español;
traducir a medias (`planear()` pero `getIvs()`) es peor que no traducir. La única
excepción son los nombres de especie, que van en inglés porque es como los muestra
el juego — igual que en la wiki.
