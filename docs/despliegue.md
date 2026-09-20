# Publicar la app

La app es estática, así que se publica gratis en **GitHub Pages** y se abre desde
el móvil o el ordenador con una URL. No hay servidor que mantener.

Cuando esté publicada, la URL será:

```
https://yimmer-r.github.io/Crianza_PokeMMO/
```

## Lo único que hay que hacer a mano (una vez)

El repositorio ya trae el flujo de publicación en
[`.github/workflows/pages.yml`](../.github/workflows/pages.yml): pasa las pruebas
y publica en cada push. Pero GitHub **no** deja que un flujo active Pages por su
cuenta: hay que decírselo una vez desde los ajustes.

### Desde el ordenador

1. Abre `https://github.com/Yimmer-R/Crianza_PokeMMO/settings/pages`
2. En **Build and deployment → Source**, elige **GitHub Actions**.
3. Ya está. En la pestaña **Actions** verás el despliegue en marcha.

### Desde el móvil

Aquí está el motivo de que no lo encontraras: **la app de GitHub para móvil no
tiene la pantalla de Pages**. Sólo sale en la web.

1. Abre el **navegador** del móvil (Chrome, Safari…), no la app de GitHub.
2. Ve directo a esta dirección, que salta al ajuste sin buscar nada:
   `https://github.com/Yimmer-R/Crianza_PokeMMO/settings/pages`
3. Si la página se ve apretada, pide la versión de escritorio:
   - **Chrome (Android)**: ⋮ arriba a la derecha → *Sitio para ordenadores*
   - **Safari (iPhone)**: el icono `ᴀA` en la barra → *Solicitar sitio web para ordenadores*
4. En **Source**, elige **GitHub Actions**.
5. Espera un par de minutos y abre `https://yimmer-r.github.io/Crianza_PokeMMO/`

### Si te dice que la rama no puede desplegar

Si en Actions sale algo como *«Branch is not allowed to deploy to github-pages
due to environment protection rules»*, es que el entorno `github-pages` sólo
acepta la rama principal. Dos salidas:

- **la fácil**: fusiona la rama de trabajo en `main`, y Pages se publica desde ahí;
- **la otra**: `Settings → Environments → github-pages → Deployment branches` y
  añade la rama.

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

## Qué hace el flujo de publicación

1. **Pruebas unitarias** (`node pruebas/ejecutar.mjs`).
2. **Comprobación de datos** (`node herramientas/comprobar-datos.mjs`): que los
   JSON sigan cuadrando, que no falte ningún objeto de crianza y que los
   recuentos no se hayan desplomado. Si alguien edita un JSON a mano y lo rompe,
   el despliegue se para antes de publicarlo.
3. **Publicación** del repositorio tal cual, sin compilar nada.

Si las pruebas fallan, no se publica. Eso es a propósito: es mejor una app vieja
que funciona que una nueva con el planificador roto.

## El OCR y la conexión

Leer una captura usa Tesseract.js, que se descarga del CDN la primera vez junto
con el modelo de español (~8 MB). Se queda guardado en el navegador, pero la
primera lectura con datos del móvil se nota. Las otras dos vías de importación
—texto y archivo— no descargan nada.
