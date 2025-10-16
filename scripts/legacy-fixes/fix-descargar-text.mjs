import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const wp = path.join(__dirname, '..', 'backend', 'full', 'whatsapp.js');

let src = fs.readFileSync(wp, 'utf8');
const backup = wp + '.bak_fix_descargar';
fs.writeFileSync(backup, src, 'utf8');

// Replace broken single-quoted multiline string in /descargar usage message with a proper template literal
const pattern = /text:\s*'ℹ️ Uso: \/descargar \[URL\] \[nombre opcional\] \[categoria opcional\][\r\n]+Ejemplo: \/descargar https:\/\/sitio\/archivo\.pdf archivo\.pdf manhwa'\s*\}/m;
const replacement = "text: `ℹ️ Uso: /descargar [URL] [nombre opcional] [categoria opcional]\nEjemplo: /descargar https://sitio/archivo.pdf archivo.pdf manhwa` }";

if (pattern.test(src)) {
  src = src.replace(pattern, replacement);
  fs.writeFileSync(wp, src, 'utf8');
  console.log('Reparado el mensaje de uso de /descargar');
} else {
  console.log('No se encontró el patrón de /descargar a reparar');
}
