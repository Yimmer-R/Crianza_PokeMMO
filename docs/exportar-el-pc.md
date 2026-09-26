# ¿Se puede exportar el PC de PokeMMO?

**No.** Buscado el 26-09-2026, y conviene dejarlo escrito para no volver a
buscarlo.

## Lo que no existe

- **No hay export en el cliente.** Ni en las cajas, ni en el equipo, ni en la
  ficha de un Pokémon. No hay «copiar al portapapeles», ni volcado a archivo, ni
  formato Showdown. Se ha pedido en el foro más de una vez —hay un hilo de
  sugerencia para exportar el equipo a PokéPaste y un hilo recopilatorio de
  peticiones de API— y sigue sin implementarse.
- **No hay API oficial** que devuelva tus Pokémon. Lo que sí hay son volcados de
  datos del JUEGO hechos por la comunidad (especies, movimientos, grupos huevo,
  objetos), como [PokeMMOZone/PokeMMO-Data](https://github.com/PokeMMOZone/PokeMMO-Data).
  Eso es el catálogo, no tu caja: sirve para saber qué IVs puede tener un
  Larvitar, no cuáles tiene el tuyo.

## Lo que existe pero no se va a hacer

Leer los Pokémon directamente de la memoria del juego, o del tráfico de red.
Técnicamente se puede; **está prohibido y es un riesgo de baneo**. Los
[términos de servicio](https://pokemmo.com/tos/?local=en) prohíben expresamente
el software de terceros que intercepte o recoja información del juego, incluido
el que lee zonas de la RAM que usa el cliente, y el que intercepta o manipula el
tráfico entre el cliente y el servidor. Y no es letra muerta: **el propio
cliente vigila la RAM** buscando programas de terceros mientras juegas, y las
sanciones se aplican en tandas, a veces mucho después.

Así que esta app no va por ahí, ni ahora ni si alguien lo pide: no compensa
perder una cuenta por ahorrarse teclear IVs.

## Lo que sí se puede, y es lo que hace esta app

**Leer la pantalla.** Una captura de la ficha del juego es un archivo tuyo, no
una intrusión en el cliente, y es la vía que usan también las herramientas de
la comunidad que sí son legítimas (por ejemplo
[PeachyMon](https://github.com/LeSteak11/PeachyMon), que captura el resumen de
la pantalla). Aquí está en la pestaña **Inventario → Importar → Imagen**, y
desde el 26-09-2026 admite **varias capturas de golpe**: eliges las diez fotos
de tus diez Pokémon, pasan todas por el OCR una detrás de otra y salen en la
misma tabla de revisión.

Las otras dos vías siguen ahí y son más rápidas si ya tienes los datos en algún
sitio:

- **Texto**: pega todas las fichas seguidas, separadas por una línea en blanco.
- **Archivo**: un `.txt`, un `.csv` con cabecera o un `.json` de esta misma app,
  y también admite varios archivos a la vez. El formato está en
  [formato-de-importacion.md](formato-de-importacion.md).

Ninguna de las tres guarda nada sin pasar por la tabla de revisión, y cada fila
se puede quitar por su cuenta antes de guardar: un IV mal leído produce un árbol
plausible y equivocado, que es peor que un error visible.

## Si algún día cambia

Lo que habría que vigilar es que PokeMMO saque un export oficial (del cliente o
por API). Si aparece, el sitio donde engancharlo es `src/nucleo/importar.js`,
que ya es tolerante con el formato y no toca el DOM: bastaría con añadir un
parseador más al lado del de CSV y el de JSON.
