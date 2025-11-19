import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const wp = path.join(__dirname, '..', 'backend', 'full', 'whatsapp.js');

let src = fs.readFileSync(wp, 'utf8');
const backup = wp + '.bak_addaporte_send';
fs.writeFileSync(backup, src, 'utf8');

// Insert a confirmation send after handleAddAporte success
const pattern = /(case '\/addaporte':[\s\S]*?result\s*=\s*await\s*handleAddAporte\([\s\S]*?\);)(\s*\n\s*}\s*catch\s*\(error\)\s*\{)/m;
if (pattern.test(src)) {
  src = src.replace(pattern, `$1\n            if (result?.message) {\n              await sock.sendMessage(remoteJid, { text: result.message });\n            } else {\n              await sock.sendMessage(remoteJid, { text: '✅ Aporte registrado.' });\n            }\n$2`);
  fs.writeFileSync(wp, src, 'utf8');
  console.log('Añadido envío de confirmación en /addaporte.');
} else {
  console.log('No se encontró el patrón de /addaporte para insertar confirmación.');
}
