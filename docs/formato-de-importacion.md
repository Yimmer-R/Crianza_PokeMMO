# Formato de importación

Tres vías, y las tres acaban en el mismo parser
([`src/nucleo/importar.js`](../src/nucleo/importar.js)), así que interpretan los
valores igual:

| vía | para qué |
|---|---|
| **imagen** | una captura de la ficha del juego; el OCR saca el texto y se lee igual |
| **texto** | pegar la ficha, o escribirla a mano |
| **archivo** | `.txt` con este formato, `.csv` con cabecera, o `.json` exportado por la app |

Ninguna guarda nada sin pasar por la pantalla de revisión.

## Texto

Un Pokémon por bloque, separados por una **línea en blanco** o una línea de
guiones. Este es el formato completo:

```
Chimchar ♀ Nv. 1
IVs: 19/30/15/23/21/31
EVs: 0/0/0/0/0/0
Naturaleza: Agitada
Habilidad: Mar Llamas
Movimientos: Placaje, Maquinación, Tormento, Desenrollar
```

Lo único imprescindible es **la especie**. Todo lo demás es opcional.

### El orden de los seis números

`IVs` y `EVs` van en el orden en que los muestra el juego:

```
PS / Ataque / Defensa / At. Esp. / Def. Esp. / Velocidad
```

En el ejemplo, el 31 está en el sexto hueco: es Velocidad.

### Lo que el parser acepta de más

Está hecho tolerante a propósito, porque el OCR nunca devuelve algo limpio:

- **el orden de las líneas da igual**;
- **los dos puntos son opcionales** (`IVs 19/30/...` vale);
- **el nivel puede ir delante o detrás**: `Nv. 1 Chimchar ♀` (como lo pinta el
  juego) y `Chimchar ♀ Nv. 1` valen los dos;
- **el sexo** se acepta como `♀`/`♂`, `hembra`/`macho`, `F`/`M` o en una línea
  `Sexo: hembra`;
- **los movimientos** aceptan el tipo delante, como los pinta el juego
  (`roca Desenrollar`), y separados por comas, punto y coma o barras;
- **los nombres en inglés** valen: `Earthquake`, `Impish`, `Blaze`;
- **las erratas** se corrigen por aproximación: `Maquinacien` → Maquinación;
- **líneas sueltas por característica**: `PS: 31`, `Ataque: 30`;
- **las líneas de adorno de la ficha** —`Estadísticas`, `Objeto: Ninguno`,
  `Marcas`, la etiqueta de tipo— se ignoran sin quejarse.

### Nombres del juego que la wiki llama de otra forma

El cliente usa la localización antigua de algunos movimientos y la wiki la
actual. El importador los traduce y **te dice que lo ha hecho**:

| lo que dice el juego | lo que guarda la app |
|---|---|
| Desenrollar | Rodar *(Rollout)* |

La tabla está en `ALIAS_DEL_CLIENTE`, en
[`src/nucleo/nombres.js`](../src/nucleo/nombres.js). Cuando aparezca otro, se
añade ahí con un comentario de dónde salió. Un nombre que no se reconozca **no se
inventa**: se avisa y se deja fuera.

## CSV

Primera línea de cabecera con los nombres de campo, separados por comas o punto y
coma. Las columnas reconocidas son las mismas etiquetas que en el texto:

```csv
especie,sexo,ivs,evs,naturaleza,habilidad,movimientos
Chimchar,♀,19/30/15/23/21/31,0/0/0/0/0/0,Agitada,Mar Llamas,Placaje/Maquinación/Tormento/Desenrollar
Rattata,♂,31/12/8/4/20/17,,Miedosa,,
```

Dentro de una celda, los movimientos van separados por barras para no chocar con
el separador de columnas.

## JSON

El que exporta la propia app en *Inventario → Exportar a archivo*. Es la vía
buena para mover el inventario entre el móvil y el ordenador, porque no pierde
nada.

## Imagen

Sube una captura de **menú del equipo → Datos**. Para que salga bien:

- que se lea el texto sin ampliar: una captura del sistema va perfecta, una foto
  de la pantalla con reflejos, no;
- recorta si puedes, dejando sólo la ficha;
- da igual que sea de tema oscuro: la app invierte la imagen antes de leerla,
  porque el OCR está entrenado con texto oscuro sobre fondo claro.

El resultado **siempre** pasa por la pantalla de revisión, con los IVs
destacados. Un IV mal leído estropea el plan entero sin que se note, así que
conviene mirarlos. Si el OCR se equivoca, el texto que ha leído queda en la
pestaña **Texto** para corregirlo a mano en vez de reescribir la ficha.

La primera lectura descarga el modelo de español (~8 MB) y se queda guardado en
el navegador. Si vas con datos del móvil, usa la vía de texto.
