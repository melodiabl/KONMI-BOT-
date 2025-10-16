import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const wp = path.join(__dirname, '..', 'backend', 'full', 'whatsapp.js');

let src = fs.readFileSync(wp, 'utf8');
const backup = wp + '.bak_multiline_texts';
fs.writeFileSync(backup, src, 'utf8');

let changes = 0;
// Replace any text: '...\n...' (single-quoted multiline) with template literal
src = src.replace(/text:\s*'([\s\S]*?)'/g, (m, inner) => {
  if (!inner.includes('\n')) return m; // only multiline
  // Escape backticks inside inner
  const safe = inner.replace(/`/g, '\\`');
  changes++;
  return 'text: `' + safe + '`';
});

if (changes > 0) {
  fs.writeFileSync(wp, src, 'utf8');
  console.log(`Reemplazados ${changes} textos multilinea por template literals en whatsapp.js`);
} else {
  console.log('No se encontraron textos multilinea con comillas simples.');
}
