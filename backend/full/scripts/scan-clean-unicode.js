#!/usr/bin/env node
/**
 * scripts/scan-clean-unicode.js
 *
 * Uso:
 *  node backend/full/scripts/scan-clean-unicode.js --report
 *  node backend/full/scripts/scan-clean-unicode.js --fix=invisibles    # quita BOM + zero-width + control chars (seguro)
 *  node backend/full/scripts/scan-clean-unicode.js --fix=escape        # reemplaza chars no ASCII por \u{XXXX} (no destructivo)
 *  node backend/full/scripts/scan-clean-unicode.js --fix=remove-cjk    # ELIMINA caracteres CJK (peligroso, leer advertencia)
 *
 * Extensiones escaneadas por defecto: js,json,ts,jsx,tsx,vue,html,css,md,txt
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import minimist from 'minimist';
import glob from 'glob';
import stripBom from 'strip-bom';
import zeroWidthPkg from 'zero-width';

const { removeZeroWidth = zeroWidthPkg.default || zeroWidthPkg } = zeroWidthPkg;
const argv = minimist(process.argv.slice(2));
const fix = argv.fix || null; // 'invisibles' | 'escape' | 'remove-cjk'
const modeReport = argv.report || (!fix && !argv.replace);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = argv.root ? path.resolve(argv.root) : path.resolve(__dirname, '../../..');

const patterns = argv._.length ? argv._ : [
  '**/*.js',
  '**/*.ts',
  '**/*.jsx',
  '**/*.tsx',
  '**/*.json',
  '**/*.vue',
  '**/*.html',
  '**/*.css',
  '**/*.md',
  '**/*.txt'
];

const ignore = argv.ignore ? [].concat(argv.ignore) : [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.cache/**'
];

function codePointHex(cp) {
  return 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
}

function isControlExceptWhitespace(cp) {
  // Control chars except \t (0x09), \n (0x0A), \r (0x0D)
  return (cp >= 0 && cp <= 0x1F && cp !== 0x09 && cp !== 0x0A && cp !== 0x0D)
      || (cp >= 0x7F && cp <= 0x9F);
}

function isZeroWidth(cp) {
  // common zero-width codepoints
  const ZW = [
    0x200B,0x200C,0x200D,0xFEFF,0x2060,0x180E,0x200E,0x200F
  ];
  return ZW.includes(cp);
}

function isCJK(cp) {
  // Han script ranges common
  return (cp >= 0x4E00 && cp <= 0x9FFF) || // CJK Unified Ideographs
         (cp >= 0x3400 && cp <= 0x4DBF) || // CJK Unified Ideographs Extension A
         (cp >= 0x20000 && cp <= 0x2A6DF) || // Ext B
         (cp >= 0x2A700 && cp <= 0x2B73F) ||
         (cp >= 0x2B740 && cp <= 0x2B81F) ||
         (cp >= 0x2B820 && cp <= 0x2CEAF);
}

function findSuspiciousChars(text) {
  const results = [];
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i);
    const char = String.fromCodePoint(cp);
    const hex = codePointHex(cp);
    let reason = null;
    if (isZeroWidth(cp)) reason = 'ZERO_WIDTH';
    else if (isControlExceptWhitespace(cp)) reason = 'CONTROL';
    else if (isCJK(cp)) reason = 'CJK';
    // literal "U+XXXX" patterns
    // we'll detect literal text "U+XXXX" in separate pass
    if (reason) {
      results.push({ index: i, cp, hex, char, reason });
    }
    i += (cp > 0xFFFF ? 2 : 1); // advance by surrogate pair length
  }
  return results;
}

function scanFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  content = stripBom(content);

  // quick detection of textual U+ patterns (e.g. "U+200B", "u+200b")
  const uPlusMatches = [];
  const upRegex = /\bU\+[0-9A-Fa-f]{4,6}\b/g;
  for (const m of content.matchAll(upRegex)) {
    uPlusMatches.push({ index: m.index, text: m[0] });
  }

  const suspicious = findSuspiciousChars(content);

  // Build readable report
  const report = [];
  if (suspicious.length || uPlusMatches.length) {
    // Map index -> line/col
    const lines = content.split(/\n/);
    const prefixSums = [];
    let runningTotal = 0;
    for (const line of lines) {
      prefixSums.push(runningTotal);
      runningTotal += line.length + 1;
    }

    function posFromIndex(idx) {
      for (let i = 0; i < prefixSums.length; i += 1) {
        const start = prefixSums[i];
        const end = (i + 1 < prefixSums.length ? prefixSums[i + 1] : runningTotal);
        if (idx >= start && idx < end) {
          return { line: i + 1, col: idx - start + 1 };
        }
      }
      return { line: lines.length, col: Math.max(1, lines.at(-1)?.length || 1) };
    }
    for (const s of suspicious) {
      const { line, col } = posFromIndex(s.index);
      report.push({ hex: s.hex, char: s.char, reason: s.reason, line, col });
    }
    for (const u of uPlusMatches) {
      const { line, col } = posFromIndex(u.index);
      report.push({ hex: u.text, char: null, reason: 'LITERAL_U+TEXT', line, col });
    }
    return { filePath, report, original };
  }
  return null;
}

function applyFixes(original, mode) {
  let out = typeof original === 'string' ? original : String(original ?? '');
  if (mode === 'invisibles') {
    out = stripBom(out);
    out = removeZeroWidth(out) ?? out;
    out = out.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');
  } else if (mode === 'escape') {
    out = stripBom(out);
    out = out.replace(/[\u0000-\u001F\u007F-\uFFFF]/g, (m) => {
      const cp = m.codePointAt(0);
      return `\\u{${cp.toString(16).toUpperCase()}}`;
    });
  } else if (mode === 'remove-cjk') {
    out = stripBom(out);
    out = out.replace(/[\u3400-\u4DBF\u4E00-\u9FFF\u{20000}-\u{2CEAF}]/ug, '');
    out = removeZeroWidth(out) ?? out;
  }
  return out;
}

async function collectFiles() {
  const fileSet = new Set();
  for (const pattern of patterns) {
    const matchesRaw = glob.sync(pattern, {
      cwd: projectRoot,
      ignore,
      nodir: true,
      absolute: true
    });
    const matches = Array.isArray(matchesRaw) ? matchesRaw : matchesRaw ? [matchesRaw] : [];
    matches.forEach((match) => fileSet.add(match));
  }
  return Array.from(fileSet);
}

async function run() {
  const files = await collectFiles();
  const results = [];
  for (const filePath of files) {
    try {
      const res = scanFile(filePath);
      if (res) results.push(res);
    } catch (error) {
      console.error('Error analizando', path.relative(projectRoot, filePath), error.message);
    }
  }

  if (!results.length) {
    console.log('✅ No se detectaron caracteres sospechosos en los archivos analizados.');
    return;
  }

  console.log(`Se detectaron caracteres sospechosos en ${results.length} archivo(s):\n`);
  for (const r of results) {
    const relPath = path.relative(projectRoot, r.filePath);
    console.log('---', relPath);
    for (const item of r.report) {
      console.log(`  ${item.reason} ${item.hex} en línea ${item.line}, columna ${item.col}`);
    }
    console.log('');
  }

  if (fix) {
    console.log(`Aplicando correcciones con modo="${fix}" — se crearán respaldos *.bak`);
    for (const r of results) {
      const bak = r.filePath + '.bak';
      try {
        const original = typeof r.original === 'string' ? r.original : String(r.original ?? '');
        fs.writeFileSync(bak, original, 'utf8');
        const cleaned = applyFixes(original, fix);
        const safeCleaned = typeof cleaned === 'string' ? cleaned : String(cleaned ?? '');
        fs.writeFileSync(r.filePath, safeCleaned, 'utf8');
        console.log('Archivo normalizado:', path.relative(projectRoot, r.filePath), '→ respaldo en', path.relative(projectRoot, bak));
      } catch (error) {
        console.error('Error normalizando archivo', path.relative(projectRoot, r.filePath), '-', error?.message || error);
      }
    }
    console.log('✅ Correcciones aplicadas. Revisa los archivos y elimina las copias .bak cuando valides los cambios.');
  } else {
    console.log('Ejecuta con --fix=invisibles (o escape/remove-cjk) para aplicar correcciones.');
  }
}

run().catch(e=>{ console.error(e); process.exit(1); });
