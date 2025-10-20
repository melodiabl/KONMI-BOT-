#!/usr/bin/env node
/**
 * verify-all-files.mjs
 * Verifica exhaustivamente que todos los archivos de texto tengan:
 * - Codificación UTF-8 válida
 * - Emojis renderizables correctamente
 * - Acentos y caracteres especiales preservados
 * - Sin caracteres de control inválidos
 * - Sin secuencias UTF-8 corruptas
 *
 * Uso:
 *   node scripts/verify-all-files.mjs                # Escanea todo el proyecto
 *   node scripts/verify-all-files.mjs --fix          # Intenta reparar problemas
 *   node scripts/verify-all-files.mjs --verbose      # Muestra detalles de cada archivo
 *   node scripts/verify-all-files.mjs archivo.js     # Verifica archivo específico
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Argumentos
const ARGV = process.argv.slice(2);
const FLAG_FIX = ARGV.includes("--fix");
const FLAG_VERBOSE = ARGV.includes("--verbose");
const FLAG_QUIET = ARGV.includes("--quiet");

// Extensiones binarias a ignorar
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
  "node",
  "lock",
]);

// Directorios a ignorar
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
  ".vscode",
  ".idea",
  ".husky",
]);

// Extensiones de texto a revisar prioritariamente
const TEXT_EXTS = new Set([
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "json",
  "md",
  "txt",
  "yml",
  "yaml",
  "html",
  "css",
  "scss",
  "sass",
  "env",
  "sh",
  "sql",
  "conf",
  "config",
  "ini",
  "properties",
  "xml",
  "svg",
  "csv",
  "log",
]);

const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

function log(...args) {
  if (!FLAG_QUIET) console.log(...args);
}

function verbose(...args) {
  if (FLAG_VERBOSE) console.log(COLORS.gray, ...args, COLORS.reset);
}

function warn(...args) {
  console.warn(COLORS.yellow, ...args, COLORS.reset);
}

function error(...args) {
  console.error(COLORS.red, ...args, COLORS.reset);
}

function success(...args) {
  if (!FLAG_QUIET) console.log(COLORS.green, ...args, COLORS.reset);
}

function info(...args) {
  if (!FLAG_QUIET) console.log(COLORS.cyan, ...args, COLORS.reset);
}

function shouldIgnoreByDir(filePath) {
  const parts = filePath.split(path.sep);
  return parts.some((p) => IGNORED_DIRS.has(p));
}

function looksBinaryByExt(filePath) {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, "");
  return ext && BINARY_EXTS.has(ext);
}

function isTextFileByExt(filePath) {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, "");
  return ext && TEXT_EXTS.has(ext);
}

function isProbablyBinaryBuffer(buf) {
  const len = Math.min(buf.length, 8192);
  let nullBytes = 0;
  let suspicious = 0;

  for (let i = 0; i < len; i++) {
    const byte = buf[i];

    // Byte nulo es binario definitivo
    if (byte === 0x00) {
      nullBytes++;
      if (nullBytes > 3) return true;
    }

    // Control chars sospechosos (excepto tab, LF, CR)
    if (byte < 7 || (byte > 13 && byte < 32) || byte === 0x7f) {
      suspicious++;
    }
  }

  return suspicious / len > 0.3;
}

/**
 * Detecta BOM y tipo de codificación
 */
function detectBOM(buf) {
  if (
    buf.length >= 3 &&
    buf[0] === 0xef &&
    buf[1] === 0xbb &&
    buf[2] === 0xbf
  ) {
    return { type: "UTF-8-BOM", offset: 3 };
  }
  if (buf.length >= 2) {
    if (buf[0] === 0xff && buf[1] === 0xfe) {
      return { type: "UTF-16LE", offset: 2 };
    }
    if (buf[0] === 0xfe && buf[1] === 0xff) {
      return { type: "UTF-16BE", offset: 2 };
    }
  }
  return { type: null, offset: 0 };
}

/**
 * Valida que el buffer sea UTF-8 válido estricto
 */
function isValidUTF8(buf, startOffset = 0) {
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
  try {
    const slice = startOffset > 0 ? buf.slice(startOffset) : buf;
    decoder.decode(slice);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Detecta emojis en el texto
 */
function detectEmojis(text) {
  // Regex para detectar emojis (incluyendo secuencias complejas)
  const emojiRegex =
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}\u{238C}-\u{2454}\u{20D0}-\u{20FF}\u{FE0F}\u{1F004}\u{1F0CF}]/gu;
  const matches = text.match(emojiRegex);
  return matches ? matches : [];
}

/**
 * Detecta caracteres acentuados y especiales del español
 */
function detectSpanishChars(text) {
  const spanishRegex = /[áéíóúÁÉÍÓÚñÑüÜ¿¡]/g;
  const matches = text.match(spanishRegex);
  return matches ? matches : [];
}

/**
 * Detecta secuencias UTF-8 potencialmente corruptas o mal decodificadas
 */
function detectCorruptedSequences(text) {
  const issues = [];

  // Secuencias típicas de doble codificación o Windows-1252 mal interpretado
  const patterns = [
    { pattern: /\u00C3\u00A1/g, expected: "á", name: "á corrupto" },
    { pattern: /\u00C3\u00A9/g, expected: "é", name: "é corrupto" },
    { pattern: /\u00C3\u00AD/g, expected: "í", name: "í corrupto" },
    { pattern: /\u00C3\u00B3/g, expected: "ó", name: "ó corrupto" },
    { pattern: /\u00C3\u00BA/g, expected: "ú", name: "ú corrupto" },
    { pattern: /\u00C3\u00B1/g, expected: "ñ", name: "ñ corrupto" },
    { pattern: /\u00C3\u0081/g, expected: "Á", name: "Á corrupto" },
    { pattern: /\u00C3\u0089/g, expected: "É", name: "É corrupto" },
    { pattern: /\u00C2\u00BF/g, expected: "¿", name: "¿ corrupto" },
    { pattern: /\u00C2\u00A1/g, expected: "¡", name: "¡ corrupto" },
    { pattern: /\u00E2\u0080\u0094/g, expected: "—", name: "em dash corrupto" },
    {
      pattern: /\u00E2\u0080\u0099/g,
      expected: "'",
      name: "apostrofe corrupto",
    },
    { pattern: /\u00E2\u0080\u009C/g, expected: '"', name: "comilla corrupta" },
  ];

  for (const { pattern, expected, name } of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      issues.push({
        type: "corrupted_sequence",
        name,
        count: matches.length,
        expected,
      });
    }
  }

  // Caracteres de reemplazo (\uFFFD) indican decodificación fallida
  const replacementChars = text.match(/\uFFFD/g);
  if (replacementChars) {
    issues.push({
      type: "replacement_char",
      name: "Carácter de reemplazo (\uFFFD)",
      count: replacementChars.length,
      expected: "caracteres originales",
    });
  }

  return issues;
}

/**
 * Analiza un archivo completo
 */
async function analyzeFile(filePath) {
  const result = {
    path: filePath,
    status: "ok",
    encoding: "UTF-8",
    issues: [],
    emojis: [],
    spanishChars: [],
    size: 0,
  };

  try {
    const buf = await fs.readFile(filePath);
    result.size = buf.length;

    // Detectar BOM
    const bom = detectBOM(buf);
    if (bom.type) {
      result.encoding = bom.type;
      result.issues.push({
        type: "bom",
        severity: "warning",
        message: `Archivo tiene BOM (${bom.type})`,
        fixable: true,
      });
    }

    // Verificar si es binario
    if (isProbablyBinaryBuffer(buf)) {
      result.status = "binary";
      return result;
    }

    // Validar UTF-8 estricto
    if (!isValidUTF8(buf, bom.offset)) {
      result.status = "error";
      result.issues.push({
        type: "invalid_utf8",
        severity: "error",
        message: "Archivo no es UTF-8 válido",
        fixable: false,
      });
      return result;
    }

    // Decodificar como texto
    const decoder = new TextDecoder("utf-8", { fatal: false });
    let text = decoder.decode(buf);

    // Si había BOM, quitarlo del texto
    if (bom.type === "UTF-8-BOM" && text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }

    // Detectar emojis
    result.emojis = detectEmojis(text);

    // Detectar caracteres españoles
    result.spanishChars = detectSpanishChars(text);

    // Detectar secuencias corruptas
    const corrupted = detectCorruptedSequences(text);
    if (corrupted.length > 0) {
      result.status = "corrupted";
      for (const issue of corrupted) {
        result.issues.push({
          type: issue.type,
          severity: "error",
          message: `${issue.name} encontrado ${issue.count} veces (esperado: ${issue.expected})`,
          fixable: false,
        });
      }
    }

    // Verificar fin de línea inconsistente
    const crlf = (text.match(/\r\n/g) || []).length;
    const lf = (text.match(/(?<!\r)\n/g) || []).length;
    const cr = (text.match(/\r(?!\n)/g) || []).length;

    if (crlf > 0 && lf > 0) {
      result.issues.push({
        type: "mixed_line_endings",
        severity: "warning",
        message: `Fin de línea mixto (${crlf} CRLF, ${lf} LF)`,
        fixable: true,
      });
    }

    if (cr > 0) {
      result.issues.push({
        type: "old_mac_line_endings",
        severity: "warning",
        message: `Fin de línea estilo Mac clásico (${cr} CR)`,
        fixable: true,
      });
    }

    // Verificar espacios trailing
    const trailingSpaces = (text.match(/ +$/gm) || []).length;
    if (trailingSpaces > 0) {
      result.issues.push({
        type: "trailing_spaces",
        severity: "info",
        message: `${trailingSpaces} líneas con espacios al final`,
        fixable: true,
      });
    }
  } catch (e) {
    result.status = "error";
    result.issues.push({
      type: "read_error",
      severity: "error",
      message: `Error al leer archivo: ${e.message}`,
      fixable: false,
    });
  }

  return result;
}

/**
 * Intenta reparar un archivo
 */
async function fixFile(filePath, analysis) {
  const fixableIssues = analysis.issues.filter((i) => i.fixable);

  if (fixableIssues.length === 0) {
    return { fixed: false, message: "No hay problemas reparables" };
  }

  try {
    const buf = await fs.readFile(filePath);
    const bom = detectBOM(buf);

    // Decodificar
    const decoder = new TextDecoder("utf-8", { fatal: false });
    let text = decoder.decode(buf);

    // Quitar BOM si existe
    if (bom.type === "UTF-8-BOM" && text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }

    // Normalizar fin de línea a LF
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // Quitar espacios trailing
    text = text.replace(/ +$/gm, "");

    // Asegurar newline final si no existe
    if (text.length > 0 && !text.endsWith("\n")) {
      text += "\n";
    }

    // Guardar como UTF-8 sin BOM
    await fs.writeFile(filePath, text, { encoding: "utf8" });

    return {
      fixed: true,
      message: `Reparado: ${fixableIssues.map((i) => i.type).join(", ")}`,
    };
  } catch (e) {
    return { fixed: false, message: `Error al reparar: ${e.message}` };
  }
}

/**
 * Escanea recursivamente el proyecto
 */
async function scanAllFiles(root = process.cwd()) {
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
        const relativePath = path.relative(root, p);

        // Ignorar archivos binarios conocidos
        if (looksBinaryByExt(relativePath)) continue;

        // Analizar solo archivos de texto o sin extensión conocida
        if (isTextFileByExt(relativePath) || !path.extname(relativePath)) {
          results.push(relativePath);
        }
      }
    }
  }

  await walk(root);
  return results;
}

/**
 * Main
 */
(async function main() {
  const startTime = Date.now();

  info("\n🔍 Verificando archivos del proyecto...\n");

  // Obtener lista de archivos
  const explicitFiles = ARGV.filter((a) => !a.startsWith("--"));
  let filesToCheck = [];

  if (explicitFiles.length > 0) {
    filesToCheck = explicitFiles;
    info(`📄 Verificando ${filesToCheck.length} archivo(s) específico(s)...\n`);
  } else {
    info("📂 Escaneando proyecto completo...\n");
    filesToCheck = await scanAllFiles();
    info(
      `📄 Encontrados ${filesToCheck.length} archivos de texto para verificar\n`,
    );
  }

  if (filesToCheck.length === 0) {
    success("✅ No hay archivos para verificar\n");
    process.exit(0);
  }

  // Analizar archivos
  const stats = {
    total: 0,
    ok: 0,
    warnings: 0,
    errors: 0,
    binary: 0,
    corrupted: 0,
    fixed: 0,
    totalEmojis: 0,
    totalSpanishChars: 0,
  };

  const problemFiles = [];

  for (const file of filesToCheck) {
    if (shouldIgnoreByDir(file)) continue;

    stats.total++;

    verbose(`Analizando: ${file}`);

    const analysis = await analyzeFile(file);

    if (analysis.status === "binary") {
      stats.binary++;
      continue;
    }

    stats.totalEmojis += analysis.emojis.length;
    stats.totalSpanishChars += analysis.spanishChars.length;

    const hasErrors = analysis.issues.some((i) => i.severity === "error");
    const hasWarnings = analysis.issues.some((i) => i.severity === "warning");

    if (hasErrors) {
      stats.errors++;
      error(`\n❌ ERROR: ${file}`);
      for (const issue of analysis.issues.filter(
        (i) => i.severity === "error",
      )) {
        error(`   • ${issue.message}`);
      }
      problemFiles.push(analysis);
    } else if (hasWarnings) {
      stats.warnings++;
      warn(`\n⚠️  ADVERTENCIA: ${file}`);
      for (const issue of analysis.issues.filter(
        (i) => i.severity === "warning",
      )) {
        warn(`   • ${issue.message}`);
      }
      problemFiles.push(analysis);
    } else if (analysis.emojis.length > 0 || analysis.spanishChars.length > 0) {
      stats.ok++;
      if (FLAG_VERBOSE) {
        success(`✅ ${file}`);
        if (analysis.emojis.length > 0) {
          verbose(
            `   Emojis: ${analysis.emojis.slice(0, 10).join(" ")}${analysis.emojis.length > 10 ? "..." : ""}`,
          );
        }
        if (analysis.spanishChars.length > 0) {
          verbose(
            `   Caracteres españoles: ${[...new Set(analysis.spanishChars)].join(" ")}`,
          );
        }
      }
    } else {
      stats.ok++;
    }

    // Intentar reparar si está habilitado
    if (FLAG_FIX && analysis.issues.length > 0) {
      const fixResult = await fixFile(file, analysis);
      if (fixResult.fixed) {
        stats.fixed++;
        success(`   ✅ ${fixResult.message}`);
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  // Resumen final
  log("\n" + "=".repeat(70));
  log("\n📊 RESUMEN DE VERIFICACIÓN:\n");

  log(
    `   Archivos analizados:       ${COLORS.cyan}${stats.total}${COLORS.reset}`,
  );
  log(
    `   ✅ Sin problemas:          ${COLORS.green}${stats.ok}${COLORS.reset}`,
  );
  log(
    `   ⚠️  Con advertencias:       ${COLORS.yellow}${stats.warnings}${COLORS.reset}`,
  );
  log(
    `   ❌ Con errores:            ${COLORS.red}${stats.errors}${COLORS.reset}`,
  );
  log(
    `   📦 Binarios ignorados:     ${COLORS.gray}${stats.binary}${COLORS.reset}`,
  );

  if (stats.totalEmojis > 0) {
    log(
      `   😀 Emojis encontrados:     ${COLORS.magenta}${stats.totalEmojis}${COLORS.reset}`,
    );
  }

  if (stats.totalSpanishChars > 0) {
    log(
      `   🇪🇸 Acentos españoles:     ${COLORS.magenta}${stats.totalSpanishChars}${COLORS.reset}`,
    );
  }

  if (FLAG_FIX && stats.fixed > 0) {
    log(
      `   🔧 Archivos reparados:     ${COLORS.green}${stats.fixed}${COLORS.reset}`,
    );
  }

  log(`\n   ⏱️  Tiempo: ${elapsed}s\n`);

  // Archivos problemáticos
  if (problemFiles.length > 0 && !FLAG_VERBOSE) {
    log("📋 ARCHIVOS CON PROBLEMAS:\n");
    for (const file of problemFiles) {
      const severity = file.issues.some((i) => i.severity === "error")
        ? "❌"
        : "⚠️";
      log(`   ${severity} ${file.path}`);
      for (const issue of file.issues) {
        log(`      • ${issue.message}`);
      }
    }
    log("");
  }

  // Recomendaciones finales
  if (stats.errors > 0) {
    error("⚠️  SE ENCONTRARON ERRORES CRÍTICOS\n");
    error("Los archivos con secuencias corruptas necesitan corrección manual.");
    error("Revisa los archivos marcados con ❌ y verifica su contenido.\n");

    if (!FLAG_FIX) {
      info(
        "💡 Ejecuta con --fix para intentar reparar problemas automáticamente.\n",
      );
    }

    process.exit(1);
  } else if (stats.warnings > 0) {
    warn("⚠️  SE ENCONTRARON ADVERTENCIAS\n");

    if (!FLAG_FIX) {
      info("💡 Ejecuta con --fix para reparar problemas automáticamente.\n");
    } else {
      success("✅ Todos los problemas reparables fueron corregidos.\n");
    }

    process.exit(0);
  } else {
    success("✅ TODOS LOS ARCHIVOS ESTÁN CORRECTOS\n");
    success("Codificación UTF-8 válida en todos los archivos.");

    if (stats.totalEmojis > 0) {
      success(`Emojis preservados correctamente: ${stats.totalEmojis}`);
    }

    if (stats.totalSpanishChars > 0) {
      success(
        `Acentos y caracteres especiales correctos: ${stats.totalSpanishChars}`,
      );
    }

    log("");
    process.exit(0);
  }
})().catch((e) => {
  error("\n❌ ERROR INESPERADO:");
  error(e?.stack || e?.message || String(e));
  error("");
  process.exit(2);
});
