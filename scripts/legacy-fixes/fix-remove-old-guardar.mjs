import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const wp = path.join(__dirname, '..', 'backend', 'full', 'whatsapp.js');
let src = fs.readFileSync(wp, 'utf8');
const backup = wp + '.bak_old_guardar';
fs.writeFileSync(backup, src, 'utf8');

const marker = 'const res = await handleGuardar(';
const idx = src.indexOf(marker);
if (idx !== -1) {
  // find previous closing brace before marker to start removal (likely the stray '}' from old code)
  let start = src.lastIndexOf('}', idx);
  if (start === -1) start = idx; else start = start; // remove from this brace
  // find the next 'break;' after marker
  const breakIdx = src.indexOf('break;', idx);
  let end = breakIdx !== -1 ? breakIdx + 'break;'.length : idx + marker.length;
  const toRemove = src.slice(start, end);
  // Remove and also cleanup any excessive blank lines
  src = src.slice(0, start) + '\n' + src.slice(end);
  // Collapse multiple blank lines around the change
  src = src.replace(/\n{3,}/g, '\n\n');
  fs.writeFileSync(wp, src, 'utf8');
  console.log('Bloque antiguo de /guardar eliminado.');
} else {
  console.log('No se encontró bloque antiguo de /guardar.');
}
