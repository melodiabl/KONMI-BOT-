import fs from 'fs';
import path from 'path';

const target = path.join(process.cwd(), 'backend/full/utils/api-providers.js');
const raw = fs.readFileSync(target, 'utf8');
const lines = raw.split(/\r?\n/);

function setLine(n, text){
  if (n-1 >= 0 && n-1 < lines.length) lines[n-1] = text;
}

setLine(2, "// Utilidades para manejar múltiples APIs con fallback automático y formato unificado");
setLine(19, " * Lee una API key de env y sólo usa el proveedor si está presente.");
setLine(20, " * Retorna `headers` para la petición o `null` si no hay key.");
setLine(29, " * Estructura estándar de respuesta que todos los parsers deben respetar:");
setLine(32, " *   // campos opcionales según el tipo:");
setLine(379, "      // Sólo usar si hay API key real");
setLine(430, " * Realiza una petición HTTP teniendo en cuenta método, body y headers del provider");
setLine(433, "  // Provider local (yt-search) como último recurso");
setLine(438, "      const r = await ytSearch(url) // aquí la url es el query");
setLine(457, "      throw new Error('yt-search local falló: ' + (e?.message || e))");
setLine(473, " * Intenta descargar desde múltiples APIs con fallback automático");
setLine(475, " * @param {string|object} param - URL o parámetro para la API");
setLine(486, "    // Si el proveedor requiere una API key y no está, saltar");
setLine(528, "        logger.info?.('Descarga exitosa con ' + provider.name)");
setLine(535, "      logger.warn?.('Fallo con ' + msg)");
setLine(544, "// ==== Wrappers específicos por plataforma ====");

fs.writeFileSync(target, lines.join('\n'), 'utf8');
console.log('Patched', target);
