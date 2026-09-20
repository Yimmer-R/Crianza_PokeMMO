# Publicar la app

La app es estática, así que se publica gratis en **GitHub Pages** y se abre desde
el móvil o el ordenador con una URL. No hay servidor que mantener.

Cuando esté publicada, la URL será:

```
https://yimmer-r.github.io/Crianza_PokeMMO/
```

## No hay que tocar nada a mano

El flujo de [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) pasa
las pruebas y publica en cada push a `main`. Lleva `enablement: true` en
`configure-pages`, así que **activa Pages él mismo** y lo pone en modo «GitHub
Actions» la primera vez que corre. No hace falta entrar en los ajustes.

Si alguna vez quieres comprobarlo o cambiarlo:
`https://github.com/Yimmer-R/Crianza_PokeMMO/settings/pages`. Desde el móvil, esa
pantalla **sólo existe en el navegador**: la app de GitHub no la trae. Pide la
versión de escritorio si se ve apretada (Chrome: ⋮ → *Sitio para ordenadores*;
Safari: `ᴀA` → *Solicitar sitio web para ordenadores*).

### Qué corre y en qué orden

1. **Pruebas unitarias** (`node pruebas/ejecutar.mjs`).
2. **Comprobación de datos** (`node herramientas/comprobar-datos.mjs`): que los
   JSON sigan cuadrando, que no falte ningún objeto de crianza y que los
   recuentos no se hayan desplomado. Si alguien edita un JSON a mano y lo rompe,
   el despliegue se para antes de publicarlo.
3. **Publicación** del repositorio tal cual, sin compilar nada.

Si las pruebas fallan, no se publica. Eso es a propósito: es mejor una app vieja
que funciona que una nueva con el planificador roto.

Un push a una rama de trabajo **corre las pruebas pero no publica**: sólo se
publica desde `main`. Así una rama a medias no puede tumbar el sitio, y tampoco
choca con la regla del entorno `github-pages`, que suele aceptar sólo la rama por
defecto.

### La primera vez tarda unos minutos

Publicar por primera vez tarda en propagarse: es normal que la URL dé 404 durante
unos minutos después de que el flujo termine en verde.

## Tenerla como app en el móvil

Una vez abierta la URL, se puede añadir a la pantalla de inicio y se comporta
como una app (pantalla completa, icono propio). El repositorio ya trae el
[manifiesto](../manifest.webmanifest) y los iconos.

- **Chrome (Android)**: ⋮ → *Añadir a pantalla de inicio* (o *Instalar app*)
- **Safari (iPhone)**: el icono de compartir → *Añadir a pantalla de inicio*

Ojo con una cosa: **el inventario se guarda en el navegador que lo escribió**. Si
lo llenas en el móvil, no aparece en el ordenador. Para pasarlo hay un
*Exportar a archivo* / *Restaurar copia* en la pestaña Inventario.

## Sin publicar, en local

```
node herramientas/servir.mjs
```

y abre <http://localhost:8000>. Con doble clic en `index.html` **no** funciona:
el navegador bloquea leer los JSON de `datos/` desde `file://`.

## El OCR y la conexión

Leer una captura usa Tesseract.js, que se descarga del CDN la primera vez junto
con el modelo de español (~8 MB). Se queda guardado en el navegador, pero la
primera lectura con datos del móvil se nota. Las otras dos vías de importación
—texto y archivo— no descargan nada.
