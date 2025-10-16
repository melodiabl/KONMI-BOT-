import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const wp = path.join(__dirname, '..', 'backend', 'full', 'whatsapp.js');

let src = fs.readFileSync(wp, 'utf8');
const backup = wp + '.bak_fix_cmds';
fs.writeFileSync(backup, src, 'utf8');

// 1) Limpiar bloque viejo sobrante debajo de /guardar|/save
// El patrón busca una llave de cierre y una llamada a handleGuardar seguida de break;
src = src.replace(/\n\s*}\s*\n\s*const\s+res\s*=\s*await\s+handleGuardar[\s\S]*?\n\s*break;\s*\n/m, '\n');

// 2) Reemplazar case '/descargar' placeholder por implementación real con handleDescargar
src = src.replace(
  /case '\/descargar':[\s\S]*?case '\/download':[\s\S]*?break;/m,
  `case '/descargar':
      case '/download':
        try {
          const parts = args || [];
          const rawUrl = parts[0];
          let nombre = parts[1];
          let categoria = parts[2];
          if (!rawUrl) {
            await sock.sendMessage(remoteJid, { text: 'ℹ️ Uso: /descargar [URL] [nombre opcional] [categoria opcional]\nEjemplo: /descargar https://sitio/archivo.pdf archivo.pdf manhwa' });
            break;
          }
          try {
            if (!nombre) {
              try { const u = new URL(rawUrl); nombre = (u.pathname.split('/').pop() || 'archivo') + ''; } catch { nombre = 'archivo_' + Date.now(); }
            }
            if (!categoria) categoria = 'general';
            const res = await handleDescargar(rawUrl, nombre, categoria, usuario, remoteJid);
            if (res?.message) {
              await sock.sendMessage(remoteJid, { text: res.message });
            } else {
              await sock.sendMessage(remoteJid, { text: '⚠️ No se pudo completar la descarga.' });
            }
          } catch (e) {
            logger.error('Error en /descargar:', e);
            await sock.sendMessage(remoteJid, { text: '⚠️ Error en la descarga. Intenta de nuevo.' });
          }
        } catch (error) {
          logger.error('Error en /descargar wrapper:', error);
          await sock.sendMessage(remoteJid, { text: '⚠️ Error interno en /descargar.' });
        }
        break;`
);

// 3) Insertar case '/buscararchivo' si no existe
if (!/case '\/buscararchivo':/.test(src)) {
  const insertPoint = src.indexOf("case '/misarchivos':");
  if (insertPoint !== -1) {
    const before = src.slice(0, insertPoint);
    const after = src.slice(insertPoint);
    const block = `case '/buscararchivo':\n      case '/findfile':\n        try {\n          const nombre = args.join(' ');\n          if (!nombre) {\n            await sock.sendMessage(remoteJid, { text: 'ℹ️ Uso: /buscararchivo [nombre]' });\n          } else {\n            const res = await handleBuscarArchivo(nombre, usuario, remoteJid);\n            if (res?.message) {\n              const content = res.mentions ? { text: res.message, mentions: res.mentions } : { text: res.message };\n              await sock.sendMessage(remoteJid, content);\n            }\n          }\n        } catch (error) {\n          logger.error('Error en /buscararchivo:', error);\n          await sock.sendMessage(remoteJid, { text: '⚠️ Error al buscar archivos.' });\n        }\n        break;\n\n`;
    src = before + block + after;
  }
}

fs.writeFileSync(wp, src, 'utf8');
console.log('Arreglos aplicados: limpiar /guardar viejo, /descargar real, /buscararchivo agregado.');
