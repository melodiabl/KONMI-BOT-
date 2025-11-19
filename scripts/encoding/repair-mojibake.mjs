#!/usr/bin/env node
/**
 * repair-mojibake.mjs
 * Escanea y repara texto mojibake (UTF-8 visto como CP1252/Latin-1) en archivos de texto.
 * Conservador por diseño: solo escribe si mejora claramente.
 *
 * Uso:
 *   node scripts/encoding/repair-mojibake.mjs            # Modo informe (no cambia)
 *   node scripts/encoding/repair-mojibake.mjs --apply    # Aplica cambios en archivos
 *   node scripts/encoding/repair-mojibake.mjs <file> ... # Limita a archivos
 */

import fs from 'fs/promises';
import path from 'path';

const ARGV = process.argv.slice(2);
const FLAG_APPLY = ARGV.includes('--apply');
const EXPLICIT = ARGV.filter(a => !a.startsWith('--'));

const IGNORED_DIRS = new Set([
  '.git','node_modules','dist','build','.next','out','coverage','tmp','temp','panel-dist','pgdata','storage'
]);

const TEXT_EXTS = new Set([
  'js','mjs','cjs','json','md','txt','yml','yaml','html','css','scss','ts','tsx','jsx','sql','conf','ini','properties','env','sh','bat'
]);

function shouldScan(file) {
  const parts = file.split(path.sep);
  if (parts.some(p => IGNORED_DIRS.has(p))) return false;
  const ext = path.extname(file).toLowerCase().replace(/^\./,'');
  if (!ext) return true; // dotfiles o sin extensión
  return TEXT_EXTS.has(ext);
}

// Patrones típicos de mojibake
const MOJIBAKE_PATTERNS = [
  /Ã./g,        // Ã¡, Ã±, Ã³, etc.
  /Â./g,        // Â¿, Â¡, Â®, etc.
  /â€./g,       // â€œ, â€", â€™, etc.
  /â€”|â€“|â€¦/g, // tipográficos
  /ðŸ./g       // emojis rotos (inicio)
];

function countSuspicious(s) {
  let score = 0;
  for (const re of MOJIBAKE_PATTERNS) {
    const m = s.match(re);
    if (m) score += m.length;
  }
  // Carácter de reemplazo (�)
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 0xFFFD) score += 3;
  return score;
}

function sanitizeText(s) {
  // Elimina ancho cero y soft-hyphen
  return s.replace(/[\u200B\u200C\u200D\uFEFF]/g, '').replace(/\u00AD/g, '');
}

function latin1ToUtf8(s) {
  try {
    return Buffer.from(s, 'latin1').toString('utf8');
  } catch { return s; }
}

function repairText(text) {
  const base = sanitizeText(text);
  const baseScore = countSuspicious(base);
  let best = { t: base, score: baseScore };

  // Estrategia 1: decodificación latin1→utf8 una vez
  const b1 = sanitizeText(latin1ToUtf8(base));
  const b1Score = countSuspicious(b1);
  if (b1Score < best.score) best = { t: b1, score: b1Score };

  // Estrategia 2: cadena doble (para doble mojibake)
  const b2 = sanitizeText(latin1ToUtf8(b1));
  const b2Score = countSuspicious(b2);
  if (b2Score < best.score) best = { t: b2, score: b2Score };

  return best.t;
}

async function listFiles(root = process.cwd()) {
  const out = [];
  async function walk(dir) {
    let entries = [];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!IGNORED_DIRS.has(e.name)) await walk(p);
      } else if (e.isFile()) {
        out.push(p);
      }
    }
  }
  await walk(root);
  return out;
}

function formatRel(p){ return path.relative(process.cwd(), p) || p; }

(async function main(){
  let files = EXPLICIT.length ? EXPLICIT : await listFiles();
  files = files.filter(shouldScan);

  let total = 0, changed = 0;
  for (const file of files) {
    total++;
    let buf;
    try { buf = await fs.readFile(file); } catch { continue; }
    // binario rápido
    if (typeof buf.includes === 'function' && buf.includes(0)) continue;
    const text = buf.toString('utf8');
    const before = countSuspicious(text);
    if (before === 0) continue;

    const repaired = repairText(text);
    const after = countSuspicious(repaired);

    if (after < before) {
      console.log(`[fixed] ${formatRel(file)}  (${before} -> ${after})`);
      if (FLAG_APPLY) {
        await fs.writeFile(file, repaired, { encoding: 'utf8' });
      }
      changed++;
    }
  }

  console.log(`\n== Mojibake scan complete ==`);
  console.log(`Files scanned: ${total}`);
  console.log(`Files improved: ${changed}${FLAG_APPLY ? ' (written)' : ' (dry-run)'}`);
  if (!FLAG_APPLY) console.log(`Run with --apply to write changes.`);
})();

