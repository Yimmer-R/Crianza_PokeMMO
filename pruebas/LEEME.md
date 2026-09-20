# Pruebas

## Unitarias

```
node pruebas/ejecutar.mjs
```

158 pruebas, contra los JSON reales de `datos/` y no contra dobles inventados: si
la extracción de la wiki rompe algo, las pruebas lo ven.

Las dos que más valen:

- **`arbolSolido()`** en `planificador.prueba.mjs`. Para cada cruce del árbol
  simula dos padres con exactamente los IVs y la naturaleza que el plan les pide,
  con los objetos que el plan les pone, y comprueba con las funciones reales
  (`ivsGarantizados`, `naturalezaGarantizada`) que la cría saca garantizado lo que
  el cruce promete. Si el planificador se inventa un atajo, eso lo detecta — y lo
  hace para árboles de 2×31 hasta 6×31, que son 32 hojas.
- **la ficha real del juego** en `importar.prueba.mjs`. El texto de una captura de
  Chimchar, con «Desenrollar» (que la wiki llama «Rodar») y los movimientos con el
  tipo delante. Comprueba que sale sin un solo aviso y que la traducción se
  reporta en vez de hacerse en silencio.

## Navegador

Necesita la app servida y Playwright instalado (no es dependencia del proyecto):

```
node herramientas/servir.mjs 8099 &
node pruebas/navegador.mjs
```

Variables, por si Playwright o Chromium no están en la ruta por defecto:

| variable | para qué |
|---|---|
| `BASE` | URL de la app (por defecto `http://localhost:8099`) |
| `PLAYWRIGHT` | ruta al módulo de Playwright |
| `CHROMIUM` | ruta al binario de Chromium |
| `OCR=1` | incluye la lectura real de una imagen (necesita CDN, ~8 MB) |

Recorre el flujo entero: cargar, elegir objetivo, ver el plan y la comparativa de
estrategias de naturaleza, filtrar regiones, anotar una captura que no sirve,
anotar una que sí y comprobar que el plan se recorta, escribir un movimiento con
el nombre del juego, importar por texto con su pantalla de revisión, calcular
hordas, recargar y comprobar que el inventario sigue ahí, y que a 390 px no hay
scroll horizontal.

**Falla ante cualquier error de consola.** Los fallos más caros de este proyecto
sólo se veían aquí.

### Probarla también desde un subdirectorio

En GitHub Pages la app no vive en la raíz del dominio sino en
`/Crianza_PokeMMO/`, así que una ruta absoluta funciona en local y se rompe en
producción. Conviene correr la batería en las dos formas:

```
# como en local
node herramientas/servir.mjs 8099 & node pruebas/navegador.mjs

# como en Pages: la app dentro de un subdirectorio
mkdir -p /tmp/sim && ln -sfn "$PWD" /tmp/sim/Crianza_PokeMMO
(cd /tmp/sim && python3 -m http.server 8098 &)
BASE=http://localhost:8098/Crianza_PokeMMO/ node pruebas/navegador.mjs
```

Esto ya pilló una ruta absoluta escrita en la propia prueba. Dentro de
`page.evaluate`, resuelve siempre contra `document.baseURI`:

```js
const desdeLaPagina = (ruta) => new URL(ruta, document.baseURI).href;
```

### Sobre el OCR

Está partido en tres, a propósito:

1. **el preprocesado** (`prepararImagen`) se prueba siempre: es código propio, no
   necesita red, y se comprueba con la imagen real de `fixtures/` que escala y que
   detecta el fondo oscuro y lo invierte;
2. **el camino de fallo** se prueba siempre, cortando la descarga de Tesseract con
   `page.route`. Es determinista y verifica que la app avisa y manda a la vía de
   texto en vez de colgarse;
3. **la lectura completa** sólo con `OCR=1`, porque descarga Tesseract y el modelo
   de español del CDN.

Si el paso 3 falla con `ERR_CERT_AUTHORITY_INVALID`, es que el navegador no
confía en la CA del proxy de tu entorno: es del entorno, no de la app.
