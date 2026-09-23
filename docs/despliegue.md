# Publicar la app

La app es estática, así que se publica gratis en **GitHub Pages** y se abre desde
el móvil o el ordenador con una URL. No hay servidor que mantener.

Cuando esté publicada, la URL será:

```
https://yimmer-r.github.io/Crianza_PokeMMO/
```

## Un paso manual, una sola vez

El repositorio trae el flujo de publicación en
[`.github/workflows/pages.yml`](../.github/workflows/pages.yml): pasa las pruebas
y publica en cada push a `main`. Pero **hay que activar Pages a mano la primera
vez**, y no se puede automatizar.

El motivo, para no volver a investigarlo: el `GITHUB_TOKEN` del flujo tiene
`pages: write`, que permite **desplegar** en un sitio de Pages que ya exista y
cambiarle el modo de construcción, pero **no crearlo**. Crear el sitio necesita
permisos de administración del repositorio, que ese token no tiene. Por eso
`enablement: true` falla con `Create Pages site failed: Resource not accessible
by integration` cuando no hay sitio previo.

### Desde el ordenador

1. Abre `https://github.com/Yimmer-R/Crianza_PokeMMO/settings/pages`
2. En **Build and deployment → Source**, elige **GitHub Actions**.
3. Lanza el flujo desde la pestaña **Actions** (botón *Run workflow*) o haz un
   push a `main`.

### Desde el móvil

La app de GitHub **no tiene la pantalla de Pages**, ni la de ajustes del
repositorio. Hay que ir por el navegador.

1. Abre el **navegador**, no la app de GitHub.
2. Ve directo a `https://github.com/Yimmer-R/Crianza_PokeMMO/settings/pages`
3. Si se ve apretado, pide la versión de escritorio:
   - **Chrome (Android)**: ⋮ → *Sitio para ordenadores*
   - **Safari (iPhone)**: `ᴀA` en la barra → *Solicitar sitio web para ordenadores*
4. En **Source**, elige **GitHub Actions**.

## El repositorio tiene que ser público

Con plan gratuito, **Pages no funciona en repositorios privados**. Si el repo
pasa a privado, GitHub **despublica el sitio al instante** y la URL empieza a
responder *«There isn't a GitHub Pages site here»* — que parece un fallo de la
app pero no lo es.

Al volver a hacerlo público, el sitio **no vuelve solo**: hay que repetir el paso
manual de arriba, porque la configuración de Pages se perdió.

Si quieres mantenerlo privado sin pagar, Cloudflare Pages y Netlify sí sirven
desde repositorios privados en su plan gratuito.

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
