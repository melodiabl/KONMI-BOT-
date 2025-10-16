#!/usr/bin/env node
/**
 * safe-edit.mjs
 * Editor seguro de archivos que preserva UTF-8, emojis y acentos
 *
 * Uso:
 *   node scripts/encoding/safe-edit.mjs <archivo>
 *   node scripts/encoding/safe-edit.mjs <archivo> --backup
 *
 * Abre el archivo en un editor temporal seguro que garantiza UTF-8
 */

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARGV = process.argv.slice(2);
const FLAG_BACKUP = ARGV.includes('--backup');
const FLAG_HELP = ARGV.includes('--help') || ARGV.includes('-h');

function showHelp() {
  console.log(`
🛡️  Safe Edit - Editor Seguro UTF-8

Abre archivos garantizando que se mantengan en UTF-8 sin corrupción.

USO:
  node scripts/encoding/safe-edit.mjs <archivo> [opciones]

OPCIONES:
  --backup        Crea backup antes de editar
  --help, -h      Muestra esta ayuda

EJEMPLOS:
  # Editar archivo con backup automático
  node scripts/encoding/safe-edit.mjs backend/full/handler.js --backup

  # Editar sin backup
  node scripts/encoding/safe-edit.mjs backend/full/whatsapp.js

RECOMENDACIONES:
  1. Usa VS Code con la configuración del proyecto
  2. Verifica después: npm run encoding:verify
  3. Si usas otro editor, asegúrate que soporte UTF-8

EDITORES SEGUROS:
  ✅ VS Code (recomendado)
  ✅ Sublime Text (config UTF-8)
  ✅ Notepad++ (config UTF-8)
  ❌ Notepad de Windows (NUNCA usarlo)
`);
}

async function createBackup(filePath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupPath = `${filePath}.backup-${timestamp}`;
  await fs.copyFile(filePath, backupPath);
  console.log(`💾 Backup creado: ${backupPath}`);
  return backupPath;
}

async function validateUTF8(filePath) {
  try {
    const buf = await fs.readFile(filePath);
    const decoder = new TextDecoder('utf-8', { fatal: true });
    decoder.decode(buf);
    return { valid: true };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

async function detectEditor() {
  // Intentar detectar VS Code
  try {
    const { execSync } = await import('child_process');
    execSync('code --version', { stdio: 'ignore' });
    return { name: 'code', cmd: 'code', args: ['-w'] };
  } catch {}

  // Fallback a notepad++ si existe
  try {
    const { execSync } = await import('child_process');
    execSync('notepad++ --version', { stdio: 'ignore' });
    return { name: 'notepad++', cmd: 'notepad++', args: ['-multiInst'] };
  } catch {}

  // En Windows, buscar Notepad++
  if (process.platform === 'win32') {
    const possiblePaths = [
      'C:\\Program Files\\Notepad++\\notepad++.exe',
      'C:\\Program Files (x86)\\Notepad++\\notepad++.exe'
    ];

    for (const p of possiblePaths) {
      try {
        await fs.access(p);
        return { name: 'notepad++', cmd: p, args: ['-multiInst'] };
      } catch {}
    }
  }

  console.warn('⚠️  No se encontró VS Code ni Notepad++');
  console.warn('⚠️  Asegúrate de que tu editor esté configurado en UTF-8');

  return null;
}

async function openInEditor(filePath, editor) {
  return new Promise((resolve, reject) => {
    console.log(`\n📝 Abriendo ${filePath} en ${editor.name}...`);
    console.log(`💡 Guarda y cierra el editor cuando termines\n`);

    const proc = spawn(editor.cmd, [...editor.args, filePath], {
      stdio: 'inherit',
      shell: true
    });

    proc.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Editor cerrado con código ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

async function showFileInfo(filePath) {
  const stats = await fs.stat(filePath);
  const buf = await fs.readFile(filePath);

  // Contar emojis
  const text = buf.toString('utf8');
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  const emojis = text.match(emojiRegex) || [];

  // Contar acentos
  const spanishRegex = /[áéíóúÁÉÍÓÚñÑüÜ¿¡]/g;
  const acentos = text.match(spanishRegex) || [];

  console.log(`\n📄 Información del archivo:`);
  console.log(`   Ruta: ${filePath}`);
  console.log(`   Tamaño: ${stats.size} bytes`);
  console.log(`   Líneas: ${text.split('\n').length}`);
  console.log(`   Emojis: ${emojis.length}`);
  console.log(`   Acentos: ${acentos.length}`);
}

(async function main() {
  if (FLAG_HELP || ARGV.length === 0) {
    showHelp();
    process.exit(0);
  }

  const targetFile = ARGV.find(a => !a.startsWith('--'));

  if (!targetFile) {
    console.error('❌ Error: Debes especificar un archivo');
    console.error('   Usa: node scripts/encoding/safe-edit.mjs <archivo>');
    process.exit(1);
  }

  const filePath = path.resolve(targetFile);

  // Verificar que el archivo existe
  try {
    await fs.access(filePath);
  } catch {
    console.error(`❌ Error: El archivo no existe: ${filePath}`);
    process.exit(1);
  }

  // Mostrar info del archivo
  await showFileInfo(filePath);

  // Validar UTF-8 antes
  console.log(`\n🔍 Validando codificación actual...`);
  const beforeValidation = await validateUTF8(filePath);
  if (!beforeValidation.valid) {
    console.error(`❌ El archivo NO es UTF-8 válido: ${beforeValidation.error}`);
    console.error(`💡 Ejecuta primero: npm run encoding:fix`);
    process.exit(1);
  }
  console.log(`✅ Archivo es UTF-8 válido`);

  // Crear backup si se solicita
  let backupPath = null;
  if (FLAG_BACKUP) {
    backupPath = await createBackup(filePath);
  }

  // Detectar editor
  const editor = await detectEditor();

  if (!editor) {
    console.log(`\n⚠️  IMPORTANTE:`);
    console.log(`   1. Abre el archivo manualmente con un editor UTF-8`);
    console.log(`   2. Configura el editor en UTF-8 sin BOM`);
    console.log(`   3. Guarda el archivo`);
    console.log(`   4. Verifica con: npm run encoding:verify`);
    console.log(`\n📄 Archivo: ${filePath}`);
    process.exit(0);
  }

  try {
    // Abrir en editor
    await openInEditor(filePath, editor);

    // Validar UTF-8 después
    console.log(`\n🔍 Validando codificación después de editar...`);
    const afterValidation = await validateUTF8(filePath);

    if (!afterValidation.valid) {
      console.error(`\n❌ ERROR: El archivo se corrompió durante la edición!`);
      console.error(`   ${afterValidation.error}`);

      if (backupPath) {
        console.log(`\n🔄 Restaurando desde backup...`);
        await fs.copyFile(backupPath, filePath);
        console.log(`✅ Archivo restaurado desde backup`);
      }

      console.error(`\n💡 Solución:`);
      console.error(`   1. Configura tu editor en UTF-8 sin BOM`);
      console.error(`   2. Vuelve a intentar`);
      process.exit(1);
    }

    console.log(`✅ Codificación UTF-8 preservada correctamente`);

    // Mostrar info final
    await showFileInfo(filePath);

    // Ejecutar verificación completa
    console.log(`\n🔍 Ejecutando verificación completa...`);
    const { spawn: spawnVerify } = await import('child_process');
    const verify = spawnVerify('node', ['scripts/encoding/verify-all-files.mjs', filePath], {
      stdio: 'inherit',
      shell: true
    });

    verify.on('exit', (code) => {
      if (code === 0) {
        console.log(`\n✅ EDICIÓN EXITOSA - Archivo preservado correctamente`);
        if (backupPath) {
          console.log(`💾 Backup disponible en: ${backupPath}`);
        }
      } else {
        console.log(`\n⚠️  Verifica los problemas reportados arriba`);
      }
    });

  } catch (err) {
    console.error(`\n❌ Error durante la edición: ${err.message}`);

    if (backupPath) {
      console.log(`\n🔄 Restaurando desde backup...`);
      await fs.copyFile(backupPath, filePath);
      console.log(`✅ Archivo restaurado desde backup`);
    }

    process.exit(1);
  }

})().catch((e) => {
  console.error('\n❌ Error inesperado:', e.stack || e.message || String(e));
  process.exit(2);
});
