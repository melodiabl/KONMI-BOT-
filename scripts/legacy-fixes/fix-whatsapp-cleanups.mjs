import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const wp = path.join(__dirname, '..', 'backend', 'full', 'whatsapp.js');
let src = fs.readFileSync(wp, 'utf8');
const backup = wp + '.bak_cleanup';
fs.writeFileSync(backup, src, 'utf8');

// 1) Arreglar extras con salto de línea roto (manhwa/serie)
src = src.replace(/const extra = coverPath \? '\s*[\r\n]+🖼️ Adjunto guardado' : '';?/g,
  "const extra = coverPath ? '\\n🖼️ Adjunto guardado' : '';"
);

// 2) Eliminar bloque viejo sobrante tras nuevo /guardar|/save
src = src.replace(/(case '\/guardar':[\s\S]*?case '\/save':[\s\S]*?try[\s\S]*?break;)(\s*}\s*\r?\n\s*const res = await handleGuardar[\s\S]*?break;)/m,
  '$1'
);

fs.writeFileSync(wp, src, 'utf8');
console.log('Limpieza aplicada a whatsapp.js');
