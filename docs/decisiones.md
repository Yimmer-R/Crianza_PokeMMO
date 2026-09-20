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

## El estado se lee siempre fresco, nunca del cierre del render

`cambiaObjetivo()` acepta una función del objetivo **actual**, no un objeto
calculado con el `objetivo` que capturó el render. Si se encadenan dos cambios sin
repintar en medio —marcar dos IVs seguidos—, la forma con objeto hace que el
segundo pise al primero.

## Emparejado del inventario en tres pasadas

Construir el árbol, colocar el inventario encima y repartir los sexos al final,
en ese orden. La versión de una sola pasada gastaba un 3×31 en la primera hoja de
1×31 del recorrido. Está explicado en [modelo-de-crianza.md](modelo-de-crianza.md).

## La estrategia de naturaleza se elige sola, no por decreto

Había un defecto fijo («la compartida es más barata») que resultó ser falso en
cuanto hay inventario: la compartida exige la naturaleza en todos los huecos, así
que un 3×31 que ya tengas y no la lleve no encaja en ninguno. La Piedraeterna deja
media cadena sin naturaleza y ahí sí entra.

Se construyen las dos cadenas y se elige la de menos esfuerzo, midiéndolo en
encuentros salvajes esperados. La comparación se enseña en la pestaña Plan, y se
puede forzar una de las dos. Construir el árbol dos veces cuesta microsegundos;
equivocarse de estrategia cuesta decenas de capturas.

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
