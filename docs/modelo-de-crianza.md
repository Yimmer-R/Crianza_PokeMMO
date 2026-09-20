# El modelo de crianza

Esto es la deducción entera, porque es lo que no se puede volver a derivar de
memoria cada vez. Todo parte de dos frases de
[`wiki/mecanicas/Crianza.md`](https://github.com/Yimmer-R/PokeMMO/blob/main/wiki/mecanicas/Crianza.md):

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

## Por qué la naturaleza cuesta un escalón entero

La Piedraeterna pasa la naturaleza de quien la lleve, pero **ocupa el hueco de
objeto de ese padre**. Así que en un cruce con naturaleza sólo queda un Recio, y
sólo se puede forzar un IV. Repitiendo la cuenta de antes con un solo forzado `f`:

- `T ∖ {f}` tiene que estar a 31 en los dos padres;
- el padre con la Piedraeterna necesita `T ∖ {f}` **y la naturaleza** → es un
  **(n-1)×31 con naturaleza**;
- el otro necesita `T ∖ {f}` más `f`, o sea `T` entero → es un **n×31**.

Es decir: un n×31 con naturaleza necesita un n×31 **sin** naturaleza y un
(n-1)×31 **con** ella. Eso arrastra una segunda cadena entera, y es la razón de
que un 5×31 con naturaleza no se parezca en coste a un 5×31 pelado.

La cadena de naturaleza baja hasta un solo padre con la naturaleza y **ningún** IV
perfecto, que es lo más barato de capturar de todo el árbol.

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

## Lo que el modelo no cubre

- **Cómo se hereda la habilidad.** No está documentado en la wiki. El plan usa la
  Píldora Habilidad (normal) o el Parche de Habilidad (oculta), que son
  deterministas, en vez de dar una probabilidad inventada.
- **Los movimientos huevo** sí están cubiertos, pero cambian el árbol: el padre
  del cruce final deja de ser libre y tiene que ser uno que sepa el movimiento.
  Si no hay un solo padre que sepa todos los que pides, cada uno cuesta un cruce
  más, porque los padres se consumen.
- **Las incubadoras**, que acelerarían la eclosión. El volcado de la wiki es de
  agosto de 2025 y no las trae.
