import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const wp = path.join(__dirname, '..', 'backend', 'full', 'whatsapp.js');

const src = fs.readFileSync(wp, 'utf8');
const lines = src.split(/\r?\n/);
let changed = false;

for (let i = 0; i < lines.length - 1; i++) {
  const a = lines[i];
  const b = lines[i + 1];
  if (/^\s*const extra = coverPath \? '\s*$/.test(a) && /^\s*🖼️ Adjunto guardado' : ''\;\s*$/.test(b)) {
    lines[i] = "          const extra = coverPath ? '\\n🖼️ Adjunto guardado' : '';";
    lines.splice(i + 1, 1);
    changed = true;
  }
}

if (changed) {
  fs.writeFileSync(wp + '.bak_fix', src, 'utf8');
  fs.writeFileSync(wp, lines.join('\n'), 'utf8');
  console.log('Arreglo aplicado en whatsapp.js (extra = coverPath)');
} else {
  console.log('No se detectaron patrones a corregir');
}
