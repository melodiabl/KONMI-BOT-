import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const wp = path.join(__dirname, '..', 'backend', 'full', 'whatsapp.js');

const src = fs.readFileSync(wp, 'utf8');
const lines = src.split(/\r?\n/);
let startIdx = -1;
let endIdx = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const res = await handleGuardar(')) {
    startIdx = i;
    // Also remove a stray closing brace just before, if any
    let j = i - 1;
    while (j >= 0 && lines[j].trim() === '') j--;
    if (j >= 0 && lines[j].trim() === '}') {
      startIdx = j; // remove that brace too
    }
    // find next 'break;' after this
    for (let k = i; k < lines.length; k++) {
      if (lines[k].trim() === 'break;' || lines[k].includes('break;')) {
        endIdx = k;
        break;
      }
    }
    break;
  }
}

if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
  const before = lines.slice(0, startIdx);
  const after = lines.slice(endIdx + 1);
  const out = before.concat([''], after).join('\n');
  fs.writeFileSync(wp + '.bak_guardar_legacy', src, 'utf8');
  fs.writeFileSync(wp, out, 'utf8');
  console.log(`Bloque legacy de handleGuardar eliminado (líneas ${startIdx + 1}-${endIdx + 1}).`);
} else {
  console.log('No se detectó bloque legacy de handleGuardar para eliminar.');
}
