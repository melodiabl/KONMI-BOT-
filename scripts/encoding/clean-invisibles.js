// scripts/clean-invisibles.js
// Limpia SOLO caracteres invisibles y de control peligrosos sin tocar acentos/emoji
// Uso:
//   node scripts/clean-invisibles.js            -> limpia todo el repo
//   node scripts/clean-invisibles.js --check    -> solo verifica (sale con 1 si encuentra)
//   node scripts/clean-invisibles.js --quiet    -> salida mínima
//   node scripts/clean-invisibles.js --root=./  -> cambia raíz

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// Extensiones consideradas texto
const INCLUDE_EXTS = new Set([
  '.js', '.mjs', '.cjs',
  '.ts', '.tsx', '.jsx',
  '.json', '.md', '.txt',
  '.yml', '.yaml',
  '.html', '.css', '.scss', '.sass', '.less',
  '.graphql', '.gql', '.csv', '.ini', '.conf'
]);

// Archivos por nombre (sin extensión) que también deben analizarse
const INCLUDE_BASENAMES = new Set([
  '.env', '.env.local', '.env.example',
  '.gitignore', '.gitattributes', '.editorconfig'
]);

// Directorios a excluir
const EXCLUDE_DIRS = new Set([
  '.git', '.husky', '.idea', '.vscode',
  'node_modules', 'dist', 'build', 'out', '.next', '.cache', 'coverage',
  'tmp', 'temp', 'logs', 'auth-sessions'
]);

// Caracteres invisibles y de control a eliminar (permitimos \t, \n, \r)
const INVISIBLE_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B\u200C\u200D\u2060\uFEFF\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069\u034F]/g;

function isExcludedDir(name) {
  return EXCLUDE_DIRS.has(name);
}

function shouldScanFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (INCLUDE_EXTS.has(ext)) return true;
  const base = path.basename(filePath);
  return INCLUDE_BASENAMES.has(base);
}

function cleanFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    // No es texto o lectura inválida
    return { changed: false, removed: 0 };
  }
  const before = content;
  const after = content.replace(INVISIBLE_REGEX, '');
  if (after !== before) {
    fs.writeFileSync(filePath, after, 'utf8');
    // contar removidos (aproximado)
    const removed = (before.match(INVISIBLE_REGEX) || []).length;
    return { changed: true, removed };
  }
  return { changed: false, removed: 0 };
}

function walk(dir, results) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isExcludedDir(entry.name)) continue;
      walk(full, results);
    } else if (entry.isFile()) {
      if (!shouldScanFile(full)) continue;
      const res = cleanFile(full);
      if (res.changed) results.push({ file: full, removed: res.removed });
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const quiet = args.includes('--quiet') || args.includes('-q');
  const checkOnly = args.includes('--check');
  const rootArg = args.find(a => a.startsWith('--root='));
  const root = rootArg ? path.resolve(rootArg.split('=')[1]) : REPO_ROOT;

  const changed = [];
  walk(root, changed);

  if (!quiet) {
    if (changed.length) {
      console.log(`✅ Limpieza aplicada en ${changed.length} archivo(s):`);
      for (const { file, removed } of changed) {
        console.log(`   • ${path.relative(root, file)} (removidos: ${removed})`);
      }
    } else {
      console.log('🚀 No se encontraron caracteres invisibles.');
    }
  }

  if (checkOnly) {
    process.exit(changed.length ? 1 : 0);
  }
}

main();
