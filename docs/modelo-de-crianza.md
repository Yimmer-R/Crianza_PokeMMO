# El modelo de crianza

Esto es la deducción entera, porque es lo que no se puede volver a derivar de
memoria cada vez. Todo parte de dos frases de
[`wiki/mecanicas/Crianza.md`](https://github.com/Yimmer-R/Wiki-PokeMMO/blob/main/wiki/mecanicas/Crianza.md):

> Tres IVs se heredan tal cual de los padres y los otros tres salen del promedio
> de ambos, redondeado hacia abajo.

> Llevar este objeto garantiza que su hijo herede los IV de PS de este Pokémon.
> *(descripción de la Pesa Recia en el propio juego)*

## La regla que importa

De la primera frase sale algo que no es evidente:

> **si los dos padres tienen un IV a 31, la cría lo saca a 31 seguro.**

Porque las tres ramas posibles valen lo mismo: el IV alto es 31, el bajo es 31, y
el promedio de 31 y 31 es 31. No hay tirada que pueda salir mal.

De la segunda sale la otra mitad:

> **un objeto Recio garantiza que ese IV pase desde quien lo lleva.**

Y como cada padre lleva un objeto, un cruce fuerza como máximo dos IVs.

Juntando las dos, los IVs que una cría saca garantizados a 31 son:

```
garantizados = (los 31 que comparten los dos padres)
             ∪ (el IV que fuerza el objeto del padre A, si A lo tiene a 31)
             ∪ (el IV que fuerza el objeto del padre B, si B lo tiene a 31)
```

Está implementado tal cual en `ivsGarantizados()`, en
[`src/nucleo/herencia.js`](../src/nucleo/herencia.js).

Dos corolarios que la app aprovecha:

- Un Recio puesto sobre un IV que **el portador no tiene a 31** se gasta para
  nada. La app lo marca como desperdiciado.
- Un Recio puesto sobre un IV que **los dos padres ya comparten** también, porque
  ese IV salía solo.

## De la regla al árbol

Para un objetivo de `n` IVs perfectos `T`, con dos objetos Recios disponibles:

- se eligen dos IVs de `T` para forzar, `f₁` y `f₂`;
- el resto, `T ∖ {f₁, f₂}`, tiene que estar a 31 en **los dos** padres;
- luego el padre A necesita `T ∖ {f₂}` y el padre B necesita `T ∖ {f₁}`.

Los dos son **(n-1)×31**. Repitiendo hacia abajo se llega a padres de 1×31, que
se capturan o se compran. Sale un árbol binario completo:

| objetivo | padres de 1×31 | cruces |
|---|---|---|
| 2×31 | 2 | 1 |
| 3×31 | 4 | 3 |
| 4×31 | 8 | 7 |
| 5×31 | 16 | 15 |
| 6×31 | 32 | 31 |

Son **2^(n-1) padres y 2^(n-1) - 1 cruces**. Y como en PokeMMO los padres se
consumen, esos números son Pokémon gastados, no Pokémon prestados.

## La naturaleza: sólo la Piedraeterna

> **Dos padres de la misma naturaleza NO la transmiten.** Aunque el padre y la
> madre compartan naturaleza, la cría no la hereda: sigue saliendo al azar entre
> las 25. La Piedraeterna hace falta siempre, y la pasa al 100%.
> — `wiki/mecanicas/Crianza.md` de [Yimmer-R/Wiki-PokeMMO](https://github.com/Yimmer-R/Wiki-PokeMMO)

Esto **corrige** lo que esta app dio por bueno hasta el 23-09-2026. El modelo
anterior tenía dos vías —Piedraeterna y naturaleza compartida— y elegía entre
ellas; la segunda venía de una observación del usuario al jugar (20-09-2026) que
la wiki desmiente. Los IVs se promedian; la naturaleza no, se sortea.

La consecuencia de diseño es una sola, pero manda sobre todo el árbol: **la
Piedraeterna gasta el hueco de objeto** de ese padre, así que un cruce que
prometa naturaleza sólo puede forzar **un** IV con Recio, en vez de dos.

### Lo que cuesta

Con `A(k) = 2^(k-1)` hojas para un k×31 sin naturaleza, y `B(k)` para uno con
ella: el cruce fuerza un IV, así que hacen falta un `(k-1)×31` **con** naturaleza
y un `k×31` **sin** ella → `B(k) = B(k-1) + A(k)`.

Con `B(0) = 1` (un padre con la naturaleza y ningún 31), sale **`B(k) = 2^k`**:
el doble de padres que un k×31 pelado. De ellos, **una sola hoja** es de sólo
naturaleza —la de abajo del todo, 1 de 25— y las otras `2^k - 1` son de 1×31, 1
de 32 cada una. Para k=4: `1×25 + 15×32 = 505` encuentros esperados.

Que la naturaleza entre por abajo tiene una ventaja que se aprovecha en
`asignarInventario()`: **media cadena queda sin naturaleza**, y ahí encaja
cualquier ejemplar que ya tengas aunque su naturaleza no sea la buena.

### La Piedraeterna la lleva el PADRE, y eso no es un detalle

Puede llevarla cualquiera de los dos: pasa la naturaleza de quien la tenga
puesta. Pero el hueco de la madre es el de la **espina** —especie objetivo,
hembra—, así que colgar de ahí la cadena de naturaleza ataba **todos** sus
huecos a la especie, y ningún Pokémon del inventario con la naturaleza buena
entraba en ninguno. Con la Piedraeterna en el padre, la cadena de naturaleza
entera es `ROL.LIBRE`: cualquier especie del grupo huevo, cualquier sexo. La
espina pasa a bajar por la cadena de sólo IVs, y su hoja de abajo es un 1×31 de
la especie objetivo en vez de una de sólo naturaleza.

## ¿Quién lleva la Piedraeterna? Depende de tu inventario

Para la mecánica da igual: pasa la naturaleza de quien la tenga puesta. Para el
árbol no da igual en absoluto, porque **el que NO la lleva es el que carga con
todos los IVs** (el forzado, porque lleva el Recio, y los compartidos, porque
tienen que estar en los dos padres).

| La Piedraeterna va en… | La cadena de naturaleza… | El otro padre… | Cuándo gana |
|---|---|---|---|
| **el padre** | cuelga de un hueco **libre**: cualquier especie, cualquier sexo | es la madre, y tiene que traer TODOS los IVs | partiendo de cero: las capturas de la rama libre son fáciles |
| **la madre** | cae en la **espina**: especie objetivo y hembra | es el padre, y tiene que traer todos los IVs | cuando ya tienes un macho cargado de 31 — entra tal cual y te ahorra su rama entera |

Durante un tiempo esto fue una decisión fija (siempre en el padre) y el plan se
quedaba estancado: con un Horsea ♂ 2×31 en el inventario seguía pidiendo 5
cruces y 1 captura, cuando poniendo la Piedraeterna en la madre el mismo
objetivo sale en **3 cruces y 0 capturas**. Ahora `planear()` monta el árbol de
las tres formas —`padre`, `raiz` (sólo en el cruce final) y `madre`— y
`comparaPlanes()` elige:

1. menos IVs que se queden en 30 pudiendo ser 31;
2. menos **esfuerzo** de captura, que no es lo mismo que menos capturas: dos
   capturas sin pedir IVs son 1 de cada 1 cada una, y una sola de 2×31 es 1 de
   cada 1.024. `medirArbol()` ya lo suma como encuentros esperados;
3. menos cruces, que son eclosiones y padres gastados;
4. y a igualdad, el que deja menos inventario sin usar.

El dinero no entra en la comparación a propósito: se consigue mucho más rápido
que un 31.

### El otro eje sí se probó, y se quitó

Qué IV se fuerza con un Recio y cuál queda compartido es el otro parámetro que
cambia la forma del árbol, así que parecía el siguiente candidato a buscar
probando. Se implementó y se midió contra **26.000 inventarios al azar** (de 2 a
9 ejemplares, con 31 y con 30, ocho especies, cuatro naturalezas, objetivos de 2
a 6 IVs con y sin naturaleza): forzar un IV distinto al que elige
`ordenarPorEscasez()` **no mejoró el plan ni una vez**, y multiplicaba por dos o
tres el coste de cada recálculo — que se hace en cada tecla y para cada crianza
abierta.

Y tiene su razón: el IV compartido tiene que estar a 31 en los **dos** padres,
así que lo que conviene compartir es el que más abunda en el inventario, que es
justo lo que deja al final una ordenación de escaso a abundante. La heurística
no es una aproximación a la respuesta: es la respuesta.

## ¿Y no conviene arriesgar un 31 para guardar el otro?

La pregunta, planteada por el usuario: teniendo dos 31 y un 30 en el mismo IV,
en vez de cruzar 31 × 31 —que lo garantiza— ¿no es mejor cruzar 31 × 30, tener
un 25 % de sacar el 31 y guardarse el otro 31 para otro intento?

La respuesta es que **no hay que elegir**, porque el árbol ya usa las tres cosas
sin arriesgar nada. Con un objetivo de 3×31 y ese inventario sale esto:

```
cruce PS,Ataque,Velocidad · fuerza Ataque y Velocidad · PS COMPARTIDO
├── cruce PS,Ataque · fuerza Ataque y PS
│   ├── cruce Ataque · el padre lo fuerza con su Brazal Recio
│   │   ├── tu 30 en PS          ← aquí sólo hace falta la especie
│   │   └── capturar 1×31 Ataque ♂
│   └── tu 31 en PS  + Pesa Recia   ← 31 garantizado
└── cruce PS,Velocidad · fuerza Velocidad y PS
    ├── capturar 1×31 Velocidad ♂
    └── tu 31 en PS  + Pesa Recia   ← 31 garantizado
```

Los dos 31 van donde una **Pesa Recia** los fuerza, así que las dos ramas
entregan PS a 31 **garantizado** — y el IV compartido necesita justamente eso,
31 en los dos padres. Y el 30 no se queda en la caja: cae en el hueco donde sólo
importan la especie y el sexo, que es exactamente para lo que sirve un 30
cuando hay 31 de sobra.

Cambiar uno de esos 31 por el 30 bajaría ese IV del **100 % al 25 %**, que es lo
contrario de «priorizar el 31 y asegurar la mayor probabilidad de conseguirlo».
Por eso el plan no lo hace, y por eso `comparaPlanes()` ordena primero por los
IVs que se quedan cortos: un plan que entrega un 30 donde se pidió un 31 pierde
contra cualquiera que entregue el 31, aunque ahorre material.

Dónde sí gana el 30, y el plan lo aprovecha solo:

- **en el hueco que no pide ese IV** (especie, sexo, naturaleza) — como arriba;
- **contra un 31 con el Recio puesto**: el Recio fuerza el IV de quien lo lleva,
  así que 31 + Recio × 30 da 31 **garantizado** y gasta un 31 en vez de dos. Eso
  lo coloca `ivsDelArbol()` cambiando los Recios de mano cuando ayuda;
- **cuando no hay ningún 31 de ese IV en todo el inventario**: ahí el 30 es lo
  mejor que hay, sale a 30 y el plan lo dice (`plan.ivsCortos`) en vez de
  prometer un 31 que no va a existir.

## Cuando lo único que falla es el sexo

El sexo de un Pokémon no se cambia. El de una **cría** sí: se paga en la
guardería, desde 5.000 PokéYen (`wiki/mecanicas/Crianza.md`). De ahí sale un
cambio que no es evidente y que ahorra mucho farmeo:

```
        [hueco: 1×31 (Velocidad) ♀]
                      ↓ se convierte en
                    cruce · se paga que la cría salga ♀
           ┌──────────┴──────────┐
     cualquiera ♀           tu ♂ con el 31
   (sin pedir IVs)          + Franja Recia
```

El Recio fuerza el IV de quien lo lleva, así que el 31 lo pone tu macho y el
otro padre no tiene que aportar **nada**: vale cualquier captura del grupo
huevo. Se cambia una captura de 1 de cada 64 encuentros (el IV × el sexo) por
una de 1 de cada 2, y se paga un Recio más y el sexo de la cría.

`extenderPorSexo()` lo hace, con cuatro condiciones:

1. sólo en huecos **libres** — en la espina la especie ata a la madre, y de eso
   se encarga `extenderEspinaPorEspecie()`;
2. sólo con lo que ha **sobrado** del inventario. Si el ejemplar tiene un hueco
   mejor, que se vaya a él;
3. sólo cuando al hueco le falta **un** requisito (un 31 o la naturaleza), que
   por construcción es siempre el caso de una hoja. Si el hueco no pide nada y
   sólo quiere un sexo, montar un cruce es tirar el dinero: capturar uno de ese
   sexo es 1 de cada 2;
4. y **después de `asignarSexos()`**, no antes. Hasta ahí los huecos libres no
   tienen sexo, y un hueco sin sexo se lo habría quedado ya el inventario en la
   primera pasada: lo que llega hasta aquí con un sexo pedido es porque su
   pareja ya está atada y no hay forma de darle la vuelta gratis.

## El pseudo 31: un IV a 30

Un 30 no es un 31, pero **sirve de padre** cuando no hay un 31 a mano, y es el
caso normal cuando llevas un rato capturando. Lo que hace falta saber es qué
sale de cada combinación, y eso lo dice la tabla de herencia de la wiki: cada IV
de la cría sale del valor **alto**, del **promedio redondeado hacia abajo** o del
**bajo** de los dos padres.

| Padres | Alto | Promedio | Bajo | Qué sale |
|---|---|---|---|---|
| 31 y 31 | 31 | 31 | 31 | **31 seguro** |
| 30 y 30 | 30 | 30 | 30 | **30 seguro** — la cadena no se rompe |
| 30 y 31 | 31 | 30 | 30 | **31 con la probabilidad de la rama «alto»** |

Y la rama «alto» depende de cuántos objetos de crianza haya en ese cruce: 25 %
con ninguno, 20 % con uno y 12,5 % con dos. O sea que un 30 no es un callejón
sin salida: garantiza el 30 y deja abierta la puerta del 31.

Hay un atajo que convierte esa lotería en una certeza. Un **Recio fuerza el IV
de quien lo lleva**, así que si el Recio de ese IV va en el padre que tiene el
31, la cría saca 31 **seguro**. Los dos Recios de un cruce son intercambiables
entre los dos padres y cuestan lo mismo, así que `ivsDelArbol()` los cambia de
mano cuando eso sube el suelo, y lo explica en el paso. Con una madre 30/31 y un
padre 31/30 el plan entrega los dos IVs a 31 garantizados en un solo cruce.

Tres reglas de uso, que son del usuario:

1. **primero los 31, y los 30 sólo si no hay otra cosa.** `asignarInventario()`
   ordena por lo que tapa del árbol y, a igualdad, por cuántos huecos cubre con
   un 30 en vez de con un 31;
2. **en la raíz no vale un 30.** La raíz es el Pokémon pedido: darlo por bueno
   sería mentir. En cualquier hueco de padre, sí;
3. **lo que el árbol entrega se dice.** `plan.ivsFinales` trae el suelo real,
   `plan.ivsCortos` los IVs que se quedan en 30 y `plan.suerte` los cruces que
   van a probabilidad. Eso es lo que alimenta la optimización de EVs, porque a
   nivel 50 un 30 es par y un 31 impar, y la paridad mueve los escalones.

Simplificación consciente: el suelo se propaga como un número, no como una
distribución. Si un 30 se convierte en 31 a mitad de la cadena, la mejora no se
compone hacia arriba en el cálculo — se ve al anotar la cría y recalcular, que
es como se juega. Arrastrar la distribución entera por nodo no compensa.

## La especie: sólo la espina materna la tiene atada

> La cría hereda la especie de la madre (o del progenitor que no sea Ditto).

Un Chimchar hembra cruzado con un Rattata macho da Chimchar. Así que:

- la **madre del cruce final** tiene que ser de la especie objetivo;
- la madre de ESE cruce también, y así hasta abajo → esa cadena es la
  **espina materna**, y es la única con la especie atada;
- **todo lo demás es libre**: cualquier especie que comparta grupo huevo vale, y
  conviene la más fácil de capturar en las regiones que tenga el jugador.

Y una consecuencia más fina, que costó un error: **dentro de una rama libre, el
sexo tampoco está fijado**. Un cruce sólo necesita un ♀ y un ♂; cuál de los dos
haga de madre da igual, porque la cría de ese cruce tampoco tiene la especie
atada. Fijarlo por adelantado rechaza ejemplares del inventario que sí valen.

En la app: `ROL.ESPINA` lleva especie y sexo atados, `ROL.LIBRE` no lleva ninguno
de los dos, y `asignarSexos()` reparte al final respetando lo que ya haya
colocado el inventario.

Un **Ditto** rompe la regla en el buen sentido: cría con cualquiera y la especie
sale del otro padre, así que permite usar un **macho** de la especie objetivo como
línea materna. También es la única forma de criar una especie sin género.

### «De la especie» quiere decir *de la línea*, no de la forma final

El huevo eclosiona en la **forma base**. Un Staryu y un Starmie ponen exactamente
el mismo huevo, así que para la espina da igual cuál captures: lo que cambia es
lo que cuesta encontrarlo. La app lo tenía atado a la forma final y pedía un
Starmie («Señuelo», 13 sitios) pudiendo pedir un Staryu («Común», 33 sitios); y
si la forma final no aparecía en las regiones del jugador —Starmie no está en
Unova— el hueco salía como **captura imposible** teniendo la línea a mano.

`quienPoneLaEspecie()` devuelve quién puede ocupar ese hueco y `lineaMaterna()`
los ordena por lo fácil que es pillarlos donde el jugador juega. Tres casos:

| La línea | Quién pone la especie | Qué dice la app |
|---|---|---|
| lo normal | cualquier **hembra** de la línea | propone la más fácil, y lista las demás |
| **sin género** | cualquiera de la línea, sin sexo | la pareja es su línea o un Ditto |
| **sin ninguna hembra** | un **macho** + un **Ditto** | y el Ditto hay que capturarlo o comprarlo |

Son siete líneas sin hembras (Nidoran♂, Tauros, Rufflet, Throh, Sawk, Volbeat y
la de Tyrogue) y hasta ahora las siete salían como captura imposible. La regla
de Ditto no es un adorno: **un Ditto no se puede criar**, así que su hueco no se
abre en más cruces —es una hoja, sí o sí— y por eso una línea sin hembras sale
cara de verdad.

Y 18 bebés (Pichu, Tyrogue, Riolu, Igglybuff…) están en el grupo «No cría»: se
capturan igual de bien, pero hay que **evolucionarlos** antes de cruzarlos, y
eso lo dice `comoLlegaACriar()` con la condición concreta de cada uno.

### Una hembra que sólo aporta la especie alarga la espina

Si la especie objetivo es difícil de encontrar, la hoja de abajo de la espina es
la captura cara del árbol entero: esa especie, **hembra**, y además con el 31
que pide el hueco. Pero la madre aporta **sólo** la especie. Una hembra de la
especie con los IVs que sea —una que ya tengas— sirve igual si se le pone
delante un cruce más:

```
        [hueco de la espina: 1×31 (PS), ♀, especie objetivo]
                              ↓ se convierte en
                            cruce
                   ┌──────────┴──────────┐
        tu hembra (sólo especie)   1×31 (PS) ♂, cualquier especie
              sin objeto                 + Pesa Recia
```

Se cambia una captura difícil por una fácil más un cruce. Sólo cabe **un**
requisito, porque sólo hay un objeto útil en ese cruce (el de la madre no
forzaría nada: ella no tiene ningún 31). Al hueco de abajo de la espina siempre
le falta exactamente uno —un 31, o la naturaleza—, así que siempre cabe.

`extenderEspinaPorEspecie()` lo hace **después** de colocar el inventario, y sólo
si ha sobrado una hembra así. Al revés, una hembra de la especie que además
traía la naturaleza o un 31 se gastaba como «madre que sólo pone la especie» y
se tiraba lo bueno que tenía; y en vacío sería un cruce regalado.

## Emparejar el inventario

Un detalle de implementación que cambia el resultado. El emparejado **no** puede
hacerse mientras se construye el árbol, nodo a nodo: en preorden, un 3×31 del
inventario se gasta en la primera hoja de 1×31 que aparece y se desperdicia.

Se hace en tres pasadas:

1. **construir** el árbol de requisitos, sin mirar el inventario;
2. **asignar** el inventario, eligiendo cada vez la pareja (ejemplar, hueco) que
   más capturas ahorra — a igualdad, el ejemplar más justo;
3. **repartir sexos**, que es lo único que depende de las dos cosas anteriores.

Un 3×31 colocado en un hueco de 3×31 borra siete capturas del árbol. Colocado en
una hoja de 1×31 no ahorra ninguna. La diferencia es todo el valor de la función.

## Los IVs que nadie pidió

Un ejemplar del inventario casi nunca trae **sólo** lo que el hueco pedía. El caso
que abrió esto: un Gible ♀ que entra en el árbol por ser la hembra que pone la
especie, y que además tiene **31 en Defensa** — que el objetivo (Ataque +
Velocidad + Alegre) no pide.

La pregunta natural es «¿y no puede el plan conservarlo?». La respuesta sale de la
regla del principio, y es que **no hay forma de conservar un IV a medias**:

> un IV sale 31 seguro si los DOS padres lo tienen a 31, o si un padre lleva su
> Recio y lo tiene a 31.

Los Recios de un plan ya están todos comprometidos con los IVs que sí se pidieron,
y cuando hay naturaleza uno de los dos huecos se lo lleva la Piedraeterna. No
sobra ninguno. Así que a un IV de regalo sólo le quedan tres finales:

| final | cuándo | qué hace la app |
|---|---|---|
| **gratis** | los dos padres de ese cruce lo tienen a 31 por casualidad | lo recoge el suelo de `ivsDelArbol()` y se dice que ya sale solo |
| **por suerte** | un padre lo tiene y el otro no | se dice la probabilidad de la rama alta **y en qué cruce se juega** |
| **pidiéndolo** | el usuario decide que lo quiere garantizado | el objetivo pasa de n×31 a (n+1)×31 y el árbol dobla |

Lo tercero es la única garantía, y por eso la vista Plan lo ofrece como un botón
con el **precio delante** —cruces, capturas y dinero de más— en vez de hacerlo por
su cuenta. `objetivo.conservados` recuerda qué IVs se pidieron por esa vía, para
poder soltarlos sin tener que acordarse.

Dos detalles que no son evidentes:

- **dónde se juega la tirada importa tanto como la probabilidad.** El 31 en
  Defensa del Gible se juega en el cruce más hondo, al 20 %; aunque salga,
  todavía tiene que sobrevivir a los dos cruces de encima, donde nadie lo
  comparte. Por eso la app dice «se juega en un cruce intermedio» y no sólo el
  porcentaje: un 20 % en el último cruce y un 20 % abajo del todo no valen lo
  mismo;
- **no hay un modo «pídemelo a 30».** Se pide a 31 siempre. Si en la caja sólo
  hay un 30, `cumple()` lo acepta como pseudo 31 y el plan dice a qué valor deja
  ese IV de verdad; y si capturar un 31 sale a cuenta, lo captura, que es mejor
  que conservar el 30. El «o 30 en su defecto» es el resultado, no una opción.

Lo único que la app sí hace sola, porque **no cuesta nada**, es un desempate al
emparejar: entre dos candidatos que ya empataban en todo —lo que tapan del árbol,
los 30 que usan y los 31 que gastan—, gana el que comparte un IV de regalo con su
pareja de cruce, porque entonces sale garantizado sin gastar un objeto. Va el
último de la lista a propósito: conservar un regalo nunca compensa quemar un 3×31
en un hueco de 1×31.

## Las tablas de probabilidad

Para los IVs que **no** están garantizados, el reparto depende de cuántos objetos
haya en juego:

| objetos | IV alto | promedio | IV bajo |
|---|---|---|---|
| 0 | 25 % | 50 % | 25 % |
| 1 | 20 % | 60 % | 20 % |
| 2 | 12,5 % | 75 % | 12,5 % |

Con dos objetos, tres de cada cuatro veces sale el promedio. De ahí la regla que
mueve el mercado: **el promedio de dos valores mediocres es mediocre**, y por eso
una cadena empieza comprando 1×31 y no intentando mejorar sobre la marcha.

Al criar shiny × shiny la wiki da el reparto en «n de m» y así se guarda, sin
convertirlo a porcentaje, en `TABLA_HERENCIA_SHINY`.

## Los movimientos huevo atan al padre del cruce final

Un movimiento que la especie objetivo **sólo** puede sacar de huevo no se compra
ni se enseña: lo tiene que traer el padre. Y como la cría hereda la especie de la
madre, el hueco que deja de ser libre es justo el del padre del último cruce.

En la app: `movimientosSoloDeHuevo()` separa los que tocan la crianza (sólo vía
`huevo`) de los que no (nivel, MT, tutor…), y el nodo del padre final recibe un
`movimientosNecesarios`. A partir de ahí:

- `cumple()` rechaza cualquier ejemplar del inventario que no los sepa, diciendo
  cuál falta;
- el paso de captura lo arrastra al texto («tiene que saber X»);
- la sugerencia de captura se limita a especies que puedan aprenderlo y compartan
  grupo huevo.

Por eso el inventario guarda los cuatro movimientos de cada Pokémon: sin ellos no
hay forma de saber si un padre sirve para pasar nada.

### El padre del cruce final tampoco se captura: hay que seguir bajando

Y aquí estaba el agujero. **El padre del cruce final casi nunca se captura**: en
cuanto el objetivo pasa de 2×31, ese padre es a su vez una cría. Entonces quien
tiene que saber el movimiento es el padre de ESE cruce, y así hasta abajo — hasta
un hueco que se captura o se compra, que es el único sitio por donde el
movimiento puede entrar.

Sin bajarlo, la marca se quedaba en un nodo de tipo `cruce`, donde no la mira
nadie: `cumple()` sólo la comprueba al colocar un ejemplar del inventario y
`loQueFalta()` sólo la enseña en los huecos por conseguir. El plan de un Milotic
con Neblina salía con cuatro capturas y **ninguna pedía el movimiento**: se hacían
los siete pasos y la cría nacía sin él. Lo baja `bajarMovimientosHuevo()`, que de
paso marca ♂ el hueco elegido — `asignarSexos()` respeta los sexos ya puestos.

Tres consecuencias:

1. **un hueco con movimiento deja de ser de especie libre.** No vale «cualquiera
   del grupo huevo»: tiene que poder saber el movimiento. `padresQuePasanTodos()`
   dice quiénes, y con dos movimientos es la **intersección**, no la unión — un
   huevo tiene un solo padre;
2. **un movimiento huevo obliga a criar aunque el objetivo se capturase entero.**
   Un 1×31 se captura de una pieza y el planificador lo deja como hoja, con razón;
   pero por un huevo es la única vía de que traiga el movimiento, así que la raíz
   se envuelve en un cruce mínimo: la madre pone la especie y el IV con su Recio,
   y el padre pone el movimiento;
3. **Capturas dice cómo se consigue**, no sólo a quién capturar: «lo aprende al
   nivel 36», «se le enseña con la MT/MO» o «sólo de huevo», que es el caso caro
   porque abre otra cadena. Entre dos que valen, primero el que no obliga a criar.

Si pides varios movimientos huevo y **no** hay una sola especie que los sepa
todos, cada uno cuesta un cruce más: los padres se consumen, y no caben dos
padres distintos en el mismo huevo.

## Lo que el modelo no cubre

- **Cómo se hereda la habilidad.** No está documentado en la wiki. El plan usa la
  Píldora Habilidad (normal) o el Parche de Habilidad (oculta), que son
  deterministas, en vez de dar una probabilidad inventada.
- **Las incubadoras**, que acelerarían la eclosión. El volcado de la wiki es de
  agosto de 2025 y no las trae.
