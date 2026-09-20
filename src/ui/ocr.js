// Leer una captura de la ficha del juego y sacar su texto.
//
// Vive en src/ui/ y no en src/nucleo/ porque necesita canvas, Image y la red:
// la regla del proyecto es que el núcleo no toca el DOM. Lo que hace este módulo
// es sólo producir TEXTO; interpretarlo es cosa de src/nucleo/importar.js, que es
// el mismo parser que usa el pegado a mano. Así el OCR no puede divergir.
//
// Tesseract.js se carga desde CDN y sólo cuando el usuario usa esta función. No
// es una dependencia del proyecto: si la red falla, la app sigue entera y se le
// dice que pegue el texto a mano.
//
// El modelo de español pesa unos 8 MB. Se descarga una vez y el navegador lo
// guarda en IndexedDB, pero la primera vez se nota — sobre todo en el móvil.

const CDN = 'https://cdn.jsdelivr.net/npm';
const VERSION_JS = '5.1.1';
const VERSION_CORE = '5.1.0';

export const PESO_MODELO_MB = 8;

let cargando = null;

/** Carga Tesseract.js una sola vez. */
function cargarTesseract() {
  if (globalThis.Tesseract) return Promise.resolve(globalThis.Tesseract);
  if (cargando) return cargando;

  cargando = new Promise((resolver, rechazar) => {
    const script = document.createElement('script');
    script.src = `${CDN}/tesseract.js@${VERSION_JS}/dist/tesseract.min.js`;
    script.async = true;
    script.onload = () => {
      if (globalThis.Tesseract) resolver(globalThis.Tesseract);
      else rechazar(new Error('el script ha cargado pero no expone Tesseract'));
    };
    script.onerror = () => rechazar(new Error('no he podido descargar Tesseract.js desde el CDN'));
    document.head.append(script);
  });
  return cargando;
}

/**
 * Prepara la imagen para el OCR.
 *
 * La ficha del juego es texto claro sobre fondo oscuro, y Tesseract está
 * entrenado al contrario. Sin invertir, el reconocimiento es malísimo. Además se
 * escala, porque el texto de una captura de móvil viene pequeño, y se sube el
 * contraste para separar el texto del degradado del fondo.
 *
 * @returns {Promise<HTMLCanvasElement>}
 */
export function prepararImagen(origen, { escala = 2 } = {}) {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    img.onload = () => {
      try {
        // Un lado de ~1600 px es el punto dulce: por debajo el texto pequeño se
        // pierde, por encima el OCR se vuelve lento sin acertar más.
        const factor = Math.min(escala, Math.max(1, 1600 / Math.max(img.width, img.height)));
        const ancho = Math.round(img.width * factor);
        const alto = Math.round(img.height * factor);

        const lienzo = document.createElement('canvas');
        lienzo.width = ancho;
        lienzo.height = alto;
        const ctx = lienzo.getContext('2d', { willReadFrequently: true });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, ancho, alto);

        const datos = ctx.getImageData(0, 0, ancho, alto);
        const p = datos.data;

        // Gris y media, para decidir si hay que invertir.
        let suma = 0;
        for (let i = 0; i < p.length; i += 4) {
          const gris = (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) | 0;
          p[i] = p[i + 1] = p[i + 2] = gris;
          suma += gris;
        }
        const media = suma / (p.length / 4);
        const invertir = media < 128; // fondo oscuro: la ficha del juego lo es

        // Contraste en torno a la media, y inversión si toca.
        for (let i = 0; i < p.length; i += 4) {
          let v = p[i];
          v = (v - media) * 1.6 + media;        // separa texto de fondo
          if (invertir) v = 255 - v;
          v = v < 0 ? 0 : v > 255 ? 255 : v;
          p[i] = p[i + 1] = p[i + 2] = v;
          p[i + 3] = 255;
        }
        ctx.putImageData(datos, 0, 0);
        lienzo.dataset.invertida = String(invertir);
        resolver(lienzo);
      } catch (e) {
        rechazar(e);
      }
    };
    img.onerror = () => rechazar(new Error('no he podido abrir la imagen'));
    img.src = typeof origen === 'string' ? origen : URL.createObjectURL(origen);
  });
}

/**
 * Reconoce el texto de una imagen.
 *
 * @param {File|Blob|string} origen
 * @param {{onProgreso?: (p: {fase: string, porcentaje: number}) => void}} opciones
 * @returns {Promise<{texto: string, confianza: number, invertida: boolean}>}
 */
export async function reconocer(origen, { onProgreso = () => {} } = {}) {
  onProgreso({ fase: 'Cargando el motor de OCR', porcentaje: 0 });
  const Tesseract = await cargarTesseract();

  onProgreso({ fase: 'Preparando la imagen', porcentaje: 5 });
  const lienzo = await prepararImagen(origen);

  const FASES = {
    'loading tesseract core': 'Cargando el motor',
    'initializing tesseract': 'Arrancando',
    'loading language traineddata': `Descargando el modelo de español (~${PESO_MODELO_MB} MB, sólo la primera vez)`,
    'initializing api': 'Preparando',
    'recognizing text': 'Leyendo la ficha',
  };

  let trabajador;
  try {
    trabajador = await Tesseract.createWorker('spa', 1, {
      corePath: `${CDN}/tesseract.js-core@${VERSION_CORE}`,
      logger: (m) => {
        if (!m?.status) return;
        onProgreso({
          fase: FASES[m.status] ?? m.status,
          porcentaje: Math.round(5 + (m.progress ?? 0) * 95),
        });
      },
    });

    // La ficha es una columna de líneas cortas, no prosa: decirlo mejora bastante.
    await trabajador.setParameters({ tessedit_pageseg_mode: '6' }); // un bloque uniforme

    const { data } = await trabajador.recognize(lienzo);
    onProgreso({ fase: 'Listo', porcentaje: 100 });
    return {
      texto: data.text ?? '',
      confianza: data.confidence ?? 0,
      invertida: lienzo.dataset.invertida === 'true',
    };
  } finally {
    // Liberar el trabajador siempre: si no, cada intento deja un hilo colgado.
    if (trabajador) await trabajador.terminate().catch(() => {});
  }
}
