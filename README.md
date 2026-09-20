# Crianza PokeMMO

Le dices el Pokémon que quieres —IVs, naturaleza, EVs, movimientos y habilidad—
y te dice cómo llegar hasta él desde los Pokémon que ya tienes: qué cruces hacer,
en qué orden, con qué objetos, qué te falta capturar y dónde, y cuánto cuesta.

Es una web estática: sin dependencias, sin paso de compilación y sin backend.
Todo el conocimiento del juego sale de la
[wiki de PokeMMO](https://github.com/Yimmer-R/PokeMMO), de donde se extrae a
`datos/*.json` con un script.

## Arrancarla

```
node herramientas/servir.mjs
```

y abre <http://localhost:8000>.

> **Con doble clic en `index.html` no funciona.** El navegador bloquea la lectura
> de los JSON de `datos/` cuando la página viene de `file://` (política de mismo
> origen). Cualquier servidor estático sirve: `python3 -m http.server` también.

## Qué resuelve

**El árbol de crianza.** Un cruce garantiza los IVs a 31 que **comparten** los dos
padres —el promedio de 31 y 31 es 31— más los que fuerce un objeto Recio, uno por
padre. De ahí sale todo: un n×31 necesita dos padres de n-1 que compartan n-2, y
eso baja hasta padres de 1×31, que son los que se capturan. Un 5×31 son 16 padres,
y en PokeMMO **los padres se consumen**.

**La naturaleza cuesta un escalón.** La Piedraeterna la pasa, pero ocupa un hueco
de objeto, así que ese cruce ya sólo puede forzar un IV. No es una decisión de la
app: es la consecuencia de que la naturaleza y dos IVs forzados no caben en el
mismo cruce.

**Tu inventario.** Cada vez que anotas un Pokémon, el plan se recalcula entero y
se recorta por donde puede. El emparejado busca el hueco que **más capturas
ahorra**, no el primero que encaja: un 3×31 metido en un hueco de 3×31 borra siete
capturas del árbol, y metido en una hoja de 1×31 no ahorra ninguna.

**Cuando la captura no sale como decía el plan.** Pedías un macho con 31 en
Velocidad y te ha salido hembra con 31 en Ataque. Lo anotas y la app te dice si
encaja en otro hueco, en cuál conviene más, o si no sirve para esta cadena y hay
que volver a capturar — con el motivo, no sólo el «no».

**La especie la pone la madre.** Un Chimchar hembra cruzado con un Rattata macho
da Chimchar. Así que sólo la línea materna que cuelga del objetivo tiene la especie
atada: todos los demás huecos aceptan **cualquier especie que comparta grupo
huevo**, y la app propone la más fácil de capturar. Dentro de esas ramas ni el sexo
está fijado, porque da igual quién haga de madre.

**Filtro de regiones.** Marcas las que tienes desbloqueadas y no se te propone
nada de las demás. Cuando algo sólo existe en una región que no tienes, lo dice en
vez de callarlo.

**Entrenamiento.** Para los EVs que pidas: qué hordas los dan, en qué zona de qué
región, cuántas rondas con el objeto duplicador, y qué baya usar si te has pasado.

## Estructura

```
index.html              la app
src/nucleo/             la lógica, sin nada del DOM
  constantes.js           topes, tablas y precios, cada uno con su fuente
  herencia.js             la matemática de los IVs al criar
  compatibilidad.js       grupos huevo, sexos, de quién sale la especie
  planificador.js         el árbol: requisitos, inventario y reparto de sexos
  inventario.js           los Pokémon que tienes, y si te sirven
  capturas.js             dónde conseguir lo que falta, filtrado por región
  coste.js                el presupuesto, separando lo confirmado de lo estimado
  entrenamiento.js        el plan de EVs
  movimientos.js          cómo llega cada movimiento, y cuál obliga a criar
  habilidades.js          normal, oculta, y qué objeto hace falta
src/ui/                 vistas y estado; nada de reglas del juego
src/datos/cargador.js   carga los JSON
datos/*.json            generados desde la wiki — no se editan a mano
herramientas/
  extraer-wiki.mjs        regenera datos/ desde el repo de la wiki
  servir.mjs              servidor estático mínimo
pruebas/                102 pruebas unitarias + una de navegador
docs/                   el modelo de crianza, las fuentes y las decisiones
```

El `nucleo/` no toca el DOM y el `ui/` no contiene ninguna regla del juego. Por eso
las pruebas corren en Node sin navegador.

## Regenerar los datos

```
node herramientas/extraer-wiki.mjs [ruta-al-repo-de-la-wiki]
```

Busca `../PokeMMO` por defecto. Saca 667 Pokémon con sus grupos huevo, ratios de
género, learnsets completos y encuentros por región; las 25 naturalezas; los 177
movimientos huevo cruzados al revés con sus grupos; las hordas de EVs por
característica; y los precios de los objetos de crianza y entrenamiento.

## Pruebas

```
node pruebas/ejecutar.mjs
```

Ver [pruebas/LEEME.md](pruebas/LEEME.md).

## Lo que esta app no sabe

No es una lista de pendientes: son huecos con motivo.

- **Precios de mercado del GTL.** La wiki no los guarda a propósito, porque un
  precio apuntado miente a los dos meses. Los padres de partida quedan fuera del
  presupuesto y ese número lo pones tú.
- **Los tramos intermedios del pago por sexo.** La wiki publica los extremos
  (5.000 en especies 1:1, 25.000 por el sexo minoritario en 7:1). El tramo 3:1 va
  marcado como estimado en la propia tabla del presupuesto.
- **Cómo se hereda la habilidad al criar.** No está documentado, así que el plan
  cuenta con la Píldora o el Parche y no con la suerte.
- **Si las vitaminas tienen tope de EVs** en PokeMMO. El número sale de dividir.
- **Incubadoras.** El volcado de la wiki es de agosto de 2025 y no las lleva.

Mecánicas de 5ª generación: ni tipo Hada ni Megaevoluciones.
