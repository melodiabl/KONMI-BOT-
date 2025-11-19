#!/usr/bin/env node
/**
 * check-encoding.mjs
 * Verifica que los archivos staged en Git estén en UTF-8 (texto), ignorando binarios.
 *
 * Uso:
 *   - Por defecto: valida archivos staged (ACMRTUXB).
 *   - Con argumentos: valida solo los archivos pasados por argv (p.ej. lint-staged).
 *   - Flags:
 *       --quiet        Reduce el output (solo errores).
 *       --all          Escanea todos los archivos trackeados (no recomendado por defecto).
 *
 * Salida:
 *   - Código 0 si todo OK.
 *   - Código 1 si se detectan archivos no UTF-8.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import { TextDecoder as _TextDecoder } from "util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Opciones a través de flags */
const ARGV = process.argv.slice(2);
const FLAG_QUIET = ARGV.includes("--quiet");
const FLAG_ALL = ARGV.includes("--all");

/** Lista explícita de extensiones binarias comunes para ignorar de forma rápida */
const BINARY_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "bmp",
  "psd",
  "ai",
  "eps",
  "pdf",
  "mp3",
  "mp4",
  "m4a",
  "aac",
  "wav",
  "ogg",
  "flac",
  "mkv",
  "avi",
  "mov",
  "webm",
  "zip",
  "gz",
  "bz2",
  "7z",
  "rar",
  "xz",
  "tar",
  "tgz",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  "exe",
  "dll",
  "so",
  "dylib",
  "bin",
  "iso",
]);

/** Directorios a ignorar por seguridad (aunque normalmente no deberían estar staged) */
const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "out",
  "coverage",
  "tmp",
  "temp",
  "panel-dist",
  "pgdata",
  "frontend-panel-backup-1757207469",
]);

/** TextDecoder con estricto (lanza si encuentra bytes inválidos) */
const TextDecoderStrict = new _TextDecoder("utf-8", {
  fatal: true,
  ignoreBOM: false,
});

/** Helper logging */
function log(...args) {
  if (!FLAG_QUIET) console.log(...args);
}
function err(...args) {
  console.error(...args);
}

/** Devuelve true si la ruta debe ignorarse por directorio */
function shouldIgnoreByDir(filePath) {
  const parts = filePath.split(path.sep);
  return parts.some((p) => IGNORED_DIRS.has(p));
}

/** Devuelve true si la extensión sugiere binario */
function looksBinaryByExt(filePath) {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, "");
  return ext && BINARY_EXTS.has(ext);
}

/** Heurística simple de binario basada en contenido */
function isProbablyBinaryBuffer(buf) {
  const len = Math.min(buf.length, 8192); // inspecciona primeros 8KB
  let suspicious = 0;
  for (let i = 0; i < len; i++) {
    const byte = buf[i];

    // byte nulo es fuerte indicador de binario
    if (byte === 0x00) return true;

    // Control chars "no típicos" en texto, permitimos \t(9), \n(10), \r(13)
    if (byte < 7 || (byte > 13 && byte < 32) || byte === 0x7f) {
      suspicious++;
      continue;
    }
  }
  // Si más del 30% de los bytes iniciales son "sospechosos", tratamos como binario
  return suspicious / len > 0.3;
}

/** Verifica si un buffer es UTF-8 válido usando TextDecoder en modo estricto */
function isValidUtf8(buf) {
  try {
    // decode lanzará si encuentra secuencias inválidas
    TextDecoderStrict.decode(buf);
    return true;
  } catch {
    return false;
  }
}

/** Obtiene archivos staged (ACMRTUXB) desde git */
function getStagedFilesFromGit() {
  try {
    const out = execFileSync(
      "git",
      ["diff", "--name-only", "--cached", "--diff-filter=ACMRTUXB", "-z"],
      { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 50 * 1024 * 1024 },
    );
    const raw = out.toString("utf8");
    const files = raw.split("\0").filter(Boolean);
    return files;
  } catch (e) {
    if (!FLAG_QUIET) {
      err("⚠️ No se pudo obtener la lista de archivos staged desde Git.");
      err(String(e?.message || e));
    }
    return [];
  }
}

/** Obtiene todos los archivos trackeados por git (cuando se usa --all) */
function getAllTrackedFiles() {
  try {
    const out = execFileSync("git", ["ls-files", "-z"], {
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 100 * 1024 * 1024, // 100MB buffer para repos grandes
    });
    const raw = out.toString("utf8");
    const files = raw.split("\0").filter(Boolean);
    return files;
  } catch (e) {
    if (!FLAG_QUIET) {
      err("⚠️ No se pudo obtener la lista de archivos con git ls-files.");
      err(String(e?.message || e));
    }
    return [];
  }
}

// Fallback: escaneo del filesystem cuando --all y git ls-files falla
async function scanAllFilesFromFs(root = process.cwd()) {
  log("🔍 Usando fallback: escaneando filesystem directamente...");
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
  try {
    await walk(root);
  } catch (e) {
    if (!FLAG_QUIET) {
      err("Fallo escaneando el filesystem:", e?.message || String(e));
    }
  }
  return results;
}

/** Filtra la lista para descartar directorios ignorados y archivos inexistentes */
async function normalizeCandidateFiles(files) {
  const result = [];
  for (const f of files) {
    if (!f || typeof f !== "string") continue;
    const norm = f.split("/").join(path.sep); // soporta rutas con / en Windows
    if (shouldIgnoreByDir(norm)) continue;

    try {
      const st = await fs.stat(norm);
      if (st.isFile()) result.push(norm);
    } catch {
      // Podría ser un delete staged u otra condición; lo ignoramos.
    }
  }
  return result;
}

/** Punto de entrada principal */
(async function main() {
  const explicitFiles = ARGV.filter((a) => !a.startsWith("--"));
  let candidates = [];

  if (explicitFiles.length > 0) {
    candidates = explicitFiles;
  } else if (FLAG_ALL) {
    candidates = getAllTrackedFiles();
    // Fallback si git ls-files falla o retorna vacío
    if (candidates.length === 0) {
      candidates = await scanAllFilesFromFs();
    }
  } else {
    candidates = getStagedFilesFromGit();
  }

  if (candidates.length === 0) {
    log("✅ No se encontraron archivos para validar codificación.");
    process.exit(0);
  }

  log(`📄 Verificando codificación de ${candidates.length} archivos...`);

  const files = await normalizeCandidateFiles(candidates);
  if (files.length === 0) {
    log("✅ Sin archivos válidos para revisar después del filtrado.");
    process.exit(0);
  }

  const offenders = [];
  let checked = 0;
  let skipped = 0;

  for (const file of files) {
    try {
      const extBinary = looksBinaryByExt(file);
      if (extBinary) {
        skipped++;
        continue;
      }

      const buf = await fs.readFile(file);

      // Heurística de binario antes de validar UTF-8
      if (isProbablyBinaryBuffer(buf)) {
        skipped++;
        continue;
      }

      // Valida UTF-8 estricto (lanza en inválidos)
      const valid = isValidUtf8(buf);
      if (!valid) {
        offenders.push(file);
      }
      checked++;
    } catch (e) {
      // Si hay error de lectura, lo reportamos como posible problema de codificación/acceso
      offenders.push(file + " (error de lectura: " + (e?.message || e) + ")");
    }
  }

  if (offenders.length > 0) {
    err("");
    err(
      "❌ Se detectaron archivos de texto con codificación NO UTF-8 o ilegibles:",
    );
    err("");
    for (const f of offenders) {
      err("   • " + f);
    }
    err("");
    err(
      "💡 Acción recomendada: vuelve a guardar esos archivos en UTF-8 (sin BOM preferiblemente) y reintenta.",
    );
    err("");
    process.exit(1);
  }

  log(
    `✅ Codificación UTF-8 verificada correctamente (${checked} archivos de texto, ${skipped} binarios ignorados).`,
  );
  process.exit(0);
})().catch((e) => {
  err("");
  err("❌ Fallo inesperado en check-encoding:");
  err(e?.stack || e?.message || String(e));
  err("");
  process.exit(2);
});
