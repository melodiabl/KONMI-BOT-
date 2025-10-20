#!/usr/bin/env node
/**
 * fix-encoding.mjs
 * Convierte archivos con codificación incorrecta a UTF-8.
 *
 * Uso:
 *   node scripts/fix-encoding.mjs --all    # Escanea y convierte todo el proyecto
 *   node scripts/fix-encoding.mjs archivo1.js archivo2.js  # Archivos específicos
 *   node scripts/fix-encoding.mjs --dry-run --all  # Solo muestra qué haría sin cambiar
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARGV = process.argv.slice(2);
const FLAG_ALL = ARGV.includes("--all");
const FLAG_DRY_RUN = ARGV.includes("--dry-run");
const FLAG_QUIET = ARGV.includes("--quiet");

const BINARY_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "psd", "ai", "eps", "pdf",
  "mp3", "mp4", "m4a", "aac", "wav", "ogg", "flac", "mkv", "avi", "mov", "webm",
  "zip", "gz", "bz2", "7z", "rar", "xz", "tar", "tgz",
  "woff", "woff2", "ttf", "otf", "eot",
  "exe", "dll", "so", "dylib", "bin", "iso",
]);

const IGNORED_DIRS = new Set([
  ".git", "node_modules", "dist", "build", ".next", "out", "coverage",
  "tmp", "temp", "panel-dist", "pgdata", "frontend-panel-backup-1757207469",
]);

function log(...args) {
  if (!FLAG_QUIET) console.log(...args);
}

function shouldIgnoreByDir(filePath) {
  const parts = filePath.split(path.sep);
  return parts.some((p) => IGNORED_DIRS.has(p));
}

function looksBinaryByExt(filePath) {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, "");
  return ext && BINARY_EXTS.has(ext);
}

function isProbablyBinaryBuffer(buf) {
  const len = Math.min(buf.length, 8192);
  let suspicious = 0;
  for (let i = 0; i < len; i++) {
    const byte = buf[i];
    if (byte === 0x00) return true;
    if (byte < 7 || (byte > 13 && byte < 32) || byte === 0x7f) {
      suspicious++;
    }
  }
  return suspicious / len > 0.3;
}

function detectEncoding(buf) {
  // Intenta detectar BOM
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return "UTF-8-BOM";
  }
  if (buf.length >= 2) {
    if (buf[0] === 0xff && buf[1] === 0xfe) return "UTF-16LE";
    if (buf[0] === 0xfe && buf[1] === 0xff) return "UTF-16BE";
  }

  // Intenta decodificar como UTF-8
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    decoder.decode(buf);
    return "UTF-8";
  } catch {}

  // Intenta decodificar como Windows-1252 (ANSI común en Windows)
  try {
    const decoder = new TextDecoder("windows-1252", { fatal: false });
    const text = decoder.decode(buf);
    // Si tiene caracteres típicos de Windows-1252 mal convertidos
    if (/[\u0080-\u009f]/.test(text)) {
      return "Windows-1252";
    }
  } catch {}

  // Intenta ISO-8859-1 (Latin-1)
  try {
    const decoder = new TextDecoder("iso-8859-1", { fatal: false });
    decoder.decode(buf);
    return "ISO-8859-1";
  } catch {}

  return "UNKNOWN";
}

async function convertToUtf8(filePath, encoding) {
  try {
    const buf = await fs.readFile(filePath);
    let text;

    if (encoding === "UTF-8-BOM") {
      // Quitar BOM
      const decoder = new TextDecoder("utf-8");
      text = decoder.decode(buf.slice(3));
      log(`   🔧 Quitando BOM...`);
    } else if (encoding === "Windows-1252" || encoding === "ISO-8859-1") {
      const decoder = new TextDecoder(encoding.toLowerCase(), { fatal: false });
      text = decoder.decode(buf);
      log(`   🔧 Convirtiendo desde ${encoding}...`);
    } else if (encoding === "UTF-16LE" || encoding === "UTF-16BE") {
      const decoder = new TextDecoder(encoding.toLowerCase(), { fatal: false });
      text = decoder.decode(buf);
      log(`   🔧 Convirtiendo desde ${encoding}...`);
    } else {
      // Intento genérico con windows-1252 como fallback
      log(`   🔧 Intentando conversión genérica...`);
      const decoder = new TextDecoder("windows-1252", { fatal: false });
      text = decoder.decode(buf);
    }

    if (!FLAG_DRY_RUN) {
      // Guardar como UTF-8 sin BOM
      await fs.writeFile(filePath, text, { encoding: "utf8" });
      log(`   ✅ Convertido a UTF-8`);
    } else {
      log(`   [DRY-RUN] Se convertiría a UTF-8`);
    }

    return true;
  } catch (e) {
    console.error(`   ❌ Error al convertir: ${e.message}`);
    return false;
  }
}

async function scanAllFilesFromFs(root = process.cwd()) {
  const results = [];
  async function walk(dir) {
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (IGNORED_DIRS.has(e.name)) continue;
        await walk(p);
      } else if (e.isFile()) {
        results.push(path.relative(root, p));
      }
    }
  }
  await walk(root);
  return results;
}

async function normalizeCandidateFiles(files) {
  const result = [];
  for (const f of files) {
    if (!f || typeof f !== "string") continue;
    const norm = f.split("/").join(path.sep);
    if (shouldIgnoreByDir(norm)) continue;

    try {
      const st = await fs.stat(norm);
      if (st.isFile()) result.push(norm);
    } catch {}
  }
  return result;
}

(async function main() {
  log("🔍 Escaneando archivos del proyecto...\n");

  const explicitFiles = ARGV.filter((a) => !a.startsWith("--"));
  let candidates = [];

  if (explicitFiles.length > 0) {
    candidates = explicitFiles;
  } else if (FLAG_ALL) {
    candidates = await scanAllFilesFromFs();
  } else {
    console.error("❌ Debes especificar --all o una lista de archivos.");
    console.error("Uso: node scripts/fix-encoding.mjs --all [--dry-run]");
    process.exit(1);
  }

  if (candidates.length === 0) {
    log("✅ No se encontraron archivos para revisar.");
    process.exit(0);
  }

  log(`📄 Analizando ${candidates.length} archivos...\n`);

  const files = await normalizeCandidateFiles(candidates);
  const problematic = [];
  let checked = 0;
  let fixed = 0;

  for (const file of files) {
    if (looksBinaryByExt(file)) continue;

    try {
      const buf = await fs.readFile(file);
      if (isProbablyBinaryBuffer(buf)) continue;

      const encoding = detectEncoding(buf);
      checked++;

      if (encoding !== "UTF-8") {
        log(`\n📄 ${file}`);
        log(`   Codificación detectada: ${encoding}`);

        const success = await convertToUtf8(file, encoding);
        if (success) {
          fixed++;
        }

        problematic.push({ file, encoding });
      }
    } catch (e) {
      console.error(`\n❌ Error procesando ${file}: ${e.message}`);
    }
  }

  log("\n" + "=".repeat(60));
  log(`\n📊 Resumen:`);
  log(`   • Archivos analizados: ${checked}`);
  log(`   • Archivos con codificación incorrecta: ${problematic.length}`);

  if (FLAG_DRY_RUN) {
    log(`   • [DRY-RUN] Se convertirían: ${fixed}`);
  } else {
    log(`   • Archivos convertidos a UTF-8: ${fixed}`);
  }

  if (problematic.length > 0) {
    log(`\n📋 Archivos procesados:`);
    for (const p of problematic) {
      log(`   • ${p.file} (${p.encoding})`);
    }
  }

  if (FLAG_DRY_RUN && problematic.length > 0) {
    log(`\n💡 Ejecuta sin --dry-run para aplicar los cambios.`);
  }

  log("");
  process.exit(0);
})().catch((e) => {
  console.error("\n❌ Error inesperado:", e?.stack || e?.message || String(e));
  process.exit(2);
});
