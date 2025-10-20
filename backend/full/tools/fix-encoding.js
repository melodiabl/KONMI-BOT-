#!/usr/bin/env node

/**
 * Script para arreglar encoding UTF-8 en archivos JavaScript
 * Reemplaza caracteres mal codificados por sus equivalentes correctos
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mapa de reemplazos de caracteres mal codificados
const replacements = {
  // Tildes y acentos
  á: "á",
  é: "é",
  í: "í",
  ó: "ó",
  ú: "ú",
  ñ: "ñ",
  Á: "Á",
  É: "É",
  Í: "Í",
  Ó: "Ó",
  Ú: "Ú",
  Ñ: "Ñ",
  "¿": "¿",
  "¡": "¡",

  // Palabras específicas comunes
  mtodo: "método",
  cdigo: "código",
  telfono: "teléfono",
  nmero: "número",
  Configuracin: "Configuración",
  configuracin: "configuración",
  Opcin: "Opción",
  opcin: "opción",
  Categora: "Categoría",
  categora: "categoría",
  informacin: "información",
  vinculacin: "vinculación",
  mximo: "máximo",
  mnimo: "mínimo",
  Vlido: "Válido",
  vlido: "válido",
  Aparecer: "Aparecerá",
  aparecer: "aparecerá",
  mdico: "médico",
  Qu: "Qué",
  qu: "qué",
  Cul: "Cuál",
  cul: "cuál",
  "Por qu": "Por qué",
  "por qu": "por qué",
  Da: "Día",
  da: "día",

  // Emojis mal codificados (reemplazar con versión correcta)
  // Nota: Se manejan en la función con escape
};

// Emojis específicos por contexto
const emojiReplacements = {
  "bugs! ??": "bugs! 😄",
  "reproducible ??": "reproducible 😂",
  "bugs ????": "bugs 🐛",
  "programes' ?????": "programes' 😆",
  "bus! ??": "bus! 😄",
  "*Chiste del Da*": "*Chiste del Día* 😂",
  "*Frase Inspiradora Real*": "*Frase Inspiradora* 💭",
  "*Frase Inspiradora*": "*Frase Inspiradora* 💭",
  "*Dato Curioso Real*": "*Dato Curioso* 🔍",
  "*Dato Curioso*": "*Dato Curioso* 🔍",
  "*Pregunta de Trivia*": "*Pregunta de Trivia* 🧠",
  "**Opciones:**": "**Opciones:** 📋",
  "**Categora:**": "**Categoría:** 🏷️",
  "**Respuesta correcta:**": "**Respuesta correcta:** ✅",
  "Solicitado por:": "📝 Solicitado por:",
};

function fixEncoding(content) {
  let fixed = content;

  // Primero arreglar palabras completas
  for (const [wrong, correct] of Object.entries(replacements)) {
    // Escapar caracteres especiales de regex
    const escapedWrong = wrong.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escapedWrong, "g");
    fixed = fixed.replace(regex, correct);
  }

  // Luego arreglar emojis en contexto
  for (const [wrong, correct] of Object.entries(emojiReplacements)) {
    const regex = new RegExp(wrong.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    fixed = fixed.replace(regex, correct);
  }

  // Arreglar secuencias específicas de ?? en strings solamente
  // IMPORTANTE: NO tocar el operador nullish coalescing (??)
  // Solo reemplazar ?? cuando están dentro de strings (entre comillas)

  // Reemplazar ?? en strings con contexto de chistes
  fixed = fixed.replace(
    /"Por qué los programadores prefieren el modo oscuro\? Porque la luz atrae a los bugs! \?\?"/g,
    '"Por qué los programadores prefieren el modo oscuro? Porque la luz atrae a los bugs! 😄"',
  );
  fixed = fixed.replace(
    /"Cuál es el colmo de un programador\? Que su mujer le diga que tiene un bug y él le pregunte si es reproducible \?\?"/g,
    '"Cuál es el colmo de un programador? Que su mujer le diga que tiene un bug y él le pregunte si es reproducible 😂"',
  );
  fixed = fixed.replace(
    /"Por qué los programadores odian la naturaleza\? Porque tiene demasiados bugs \?\?\?\?"/g,
    '"Por qué los programadores odian la naturaleza? Porque tiene demasiados bugs 🐛"',
  );
  fixed = fixed.replace(
    /"Un programador va al médico y le dice: 'Doctor, me duele cuando programo'\. El médico le responde: 'Entonces no programes' \?\?\?\?\?"/g,
    "\"Un programador va al médico y le dice: 'Doctor, me duele cuando programo'. El médico le responde: 'Entonces no programes' 😆\"",
  );
  fixed = fixed.replace(
    /"Qué le dice un bit a otro bit\? Nos vemos en el bus! \?\?"/g,
    '"Qué le dice un bit a otro bit? Nos vemos en el bus! 😄"',
  );

  // Reemplazar ?? en el título del chiste
  fixed = fixed.replace(
    /text: `\?\? \*Chiste del Día\*\\n\\n\$\{randomJoke\}`/g,
    "text: `😂 *Chiste del Día*\\n\\n${randomJoke}`",
  );

  return fixed;
}

function processFile(filePath) {
  try {
    console.log(`\n📄 Procesando: ${filePath}`);

    const content = fs.readFileSync(filePath, "utf-8");
    const fixed = fixEncoding(content);

    if (content === fixed) {
      console.log("   ✅ No se encontraron problemas de encoding");
      return { processed: true, changed: false };
    }

    // Crear backup
    const backupPath = filePath + ".backup-encoding";
    fs.writeFileSync(backupPath, content, "utf-8");
    console.log(`   💾 Backup creado: ${backupPath}`);

    // Guardar archivo corregido
    fs.writeFileSync(filePath, fixed, "utf-8");
    console.log("   ✨ Archivo corregido y guardado");

    // Contar cambios
    const changes = content.split("\n").filter((line, i) => {
      const fixedLines = fixed.split("\n");
      return line !== fixedLines[i];
    }).length;

    console.log(`   📊 Líneas modificadas: ${changes}`);

    return { processed: true, changed: true, changes };
  } catch (error) {
    console.error(`   ❌ Error procesando archivo: ${error.message}`);
    return { processed: false, changed: false, error: error.message };
  }
}

function main() {
  console.log(
    "\n╔════════════════════════════════════════════════════════════╗",
  );
  console.log("║                                                            ║");
  console.log("║    🔧 FIX UTF-8 ENCODING - KONMI BOT v2.5.0              ║");
  console.log("║                                                            ║");
  console.log(
    "╚════════════════════════════════════════════════════════════╝\n",
  );

  const projectRoot = path.join(__dirname, "..");

  // Archivos a procesar
  const filesToProcess = [
    path.join(projectRoot, "whatsapp.js"),
    path.join(projectRoot, "handler.js"),
    path.join(projectRoot, "api.js"),
    path.join(projectRoot, "commands-complete.js"),
    path.join(projectRoot, "inproc-subbots.js"),
  ];

  let totalProcessed = 0;
  let totalChanged = 0;
  let totalChanges = 0;

  for (const file of filesToProcess) {
    if (fs.existsSync(file)) {
      const result = processFile(file);
      if (result.processed) {
        totalProcessed++;
        if (result.changed) {
          totalChanged++;
          totalChanges += result.changes || 0;
        }
      }
    } else {
      console.log(`\n⚠️  Archivo no encontrado: ${file}`);
    }
  }

  console.log(
    "\n╔════════════════════════════════════════════════════════════╗",
  );
  console.log("║                   📊 RESUMEN FINAL                         ║");
  console.log(
    "╚════════════════════════════════════════════════════════════╝\n",
  );

  console.log(`📁 Archivos procesados: ${totalProcessed}`);
  console.log(`✨ Archivos modificados: ${totalChanged}`);
  console.log(`📝 Total de líneas cambiadas: ${totalChanges}`);

  if (totalChanged > 0) {
    console.log("\n✅ ¡Encoding corregido exitosamente!");
    console.log("💡 Se crearon backups con extensión .backup-encoding");
  } else {
    console.log("\n✅ No se encontraron problemas de encoding");
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main();
