# Pruebas

## Unitarias

```
node pruebas/ejecutar.mjs
```

Corren contra los JSON reales de `datos/`, no contra dobles inventados: si la
extracción de la wiki rompe algo, las pruebas lo ven.

La que más vale es `arbolSolido()` en `planificador.prueba.mjs`. Para cada cruce
del árbol simula dos padres con exactamente los IVs que el plan les pide y los
objetos que el plan les pone, y comprueba que los 31 garantizados cubren lo que
el cruce promete. Si el planificador se inventa un atajo, eso lo detecta — y lo
hace para árboles de 2×31 hasta 6×31, que son 32 hojas.

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

Recorre el flujo entero: cargar, elegir objetivo, ver el plan, filtrar regiones,
anotar una captura que no sirve, anotar una que sí y comprobar que el plan se
recorta, calcular hordas, recargar y comprobar que el inventario sigue ahí, y
que a 390 px no hay scroll horizontal. Falla si aparece cualquier error de
consola.
