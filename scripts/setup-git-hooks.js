// scripts/setup-git-hooks.js
// Instala un hook pre-commit que limpia caracteres invisibles antes de cada commit
// No requiere dependencias externas (sin Husky)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const gitDir = path.join(repoRoot, '.git');
const hooksDir = path.join(gitDir, 'hooks');
const hookPath = path.join(hooksDir, 'pre-commit');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function installPreCommit() {
  if (!fs.existsSync(gitDir)) {
    console.log('⚠️ No se encontró carpeta .git. Omite instalación de hooks.');
    return;
  }
  ensureDir(hooksDir);

  const script = `#!/bin/sh
# pre-commit: limpia caracteres invisibles y evita que se suban
# generado por scripts/setup-git-hooks.js

# Ejecutar limpieza en modo verificación primero
node scripts/clean-invisibles.js --check --quiet
STATUS=$?

if [ "$STATUS" -ne 0 ]; then
  echo "\n🔍 Se detectaron caracteres invisibles/control en archivos."
  echo "🧹 Corrigiendo automáticamente..."
  node scripts/clean-invisibles.js --quiet
  echo "📌 Re-etiquetando cambios..."
  git add -A
  echo "❌ Commit abortado porque se realizaron cambios de limpieza."
  echo "✅ Revisa los cambios y vuelve a ejecutar el commit."
  exit 1
fi

exit 0
`;

  fs.writeFileSync(hookPath, script, { encoding: 'utf8' });
  try {
    fs.chmodSync(hookPath, 0o755);
  } catch {}
  console.log('✅ Hook pre-commit instalado en .git/hooks/pre-commit');
}

installPreCommit();
