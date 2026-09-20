// Carga los JSON de datos/ una sola vez y los deja disponibles para todo.
//
// Los archivos salen de herramientas/extraer-wiki.mjs y no se editan a mano: si
// un dato está mal, se corrige en la wiki y se vuelve a extraer.

const ARCHIVOS = {
  pokedex: 'pokemon.json',
  encuentros: 'encuentros.json',
  naturalezas: 'naturalezas.json',
  movimientos: 'movimientos.json',
  habilidades: 'habilidades.json',
  movimientosHuevo: 'movimientos-huevo.json',
  objetos: 'objetos.json',
  dondeEntrenar: 'donde-entrenar.json',
  meta: 'meta.json',
};

let cache = null;

export async function cargarDatos(base = 'datos') {
  if (cache) return cache;
  const entradas = await Promise.all(
    Object.entries(ARCHIVOS).map(async ([clave, archivo]) => {
      const res = await fetch(`${base}/${archivo}`);
      if (!res.ok) throw new Error(`no he podido leer ${archivo} (${res.status})`);
      return [clave, await res.json()];
    }),
  );
  cache = Object.fromEntries(entradas);

  // Índices que se usan en cada tecla del buscador: mejor calcularlos una vez.
  cache.especies = Object.keys(cache.pokedex).sort();
  cache.nombresNaturaleza = Object.keys(cache.naturalezas).sort();
  cache.nombresHabilidad = Object.keys(cache.habilidades).sort();
  cache.nombresMovimiento = Object.keys(cache.movimientos).sort();

  return cache;
}

export const datosCargados = () => cache;
