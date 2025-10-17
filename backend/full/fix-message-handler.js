// fix-message-handler.js - Diagnóstico del handler de mensajes
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("\n╔═══════════════════════════════════════════════════════════╗");
console.log("║     🔧 ANÁLISIS DEL HANDLER DE MENSAJES                  ║");
console.log("╚═══════════════════════════════════════════════════════════╝\n");

const whatsappPath = path.join(__dirname, "whatsapp.js");
const content = fs.readFileSync(whatsappPath, "utf8");

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("1️⃣  ANÁLISIS DEL FILTRO DE MENSAJES");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

// Buscar la sección problemática
const lines = content.split("\n");
let inMessageUpsert = false;
let allowLogicStart = -1;
let allowLogicEnd = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('sock.ev.on("messages.upsert"')) {
    inMessageUpsert = true;
    console.log(`✅ Encontrado listener en línea ${i + 1}`);
  }

  if (inMessageUpsert && lines[i].includes("let allow = !message.key.fromMe")) {
    allowLogicStart = i;
    console.log(`⚠️  Filtro 'allow' encontrado en línea ${i + 1}`);
  }

  if (allowLogicStart > 0 && lines[i].includes("if (!allow) continue")) {
    allowLogicEnd = i;
    console.log(`⚠️  Bloqueo 'if (!allow)' en línea ${i + 1}\n`);
    break;
  }
}

if (allowLogicStart > 0 && allowLogicEnd > 0) {
  console.log("📋 Código actual del filtro:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  for (let i = allowLogicStart; i <= allowLogicEnd; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  console.log("⚠️  PROBLEMA DETECTADO:");
  console.log("   El filtro 'allow' está bloqueando mensajes de otros usuarios");
  console.log("   Solo permite mensajes del owner cuando fromMe = true\n");

  console.log("✅ SOLUCIÓN:");
  console.log("   El filtro debe permitir TODOS los mensajes que NO sean fromMe");
  console.log("   Los mensajes fromMe solo se permiten si son comandos del owner\n");

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("2️⃣  VERIFICACIÓN DE LÓGICA");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  console.log("Comportamiento actual:");
  console.log("  • fromMe = false → allow = true ✅ (mensajes de otros)");
  console.log("  • fromMe = true + comando + owner → allow = true ✅");
  console.log("  • fromMe = true + NO comando → allow = false ❌");
  console.log("  • fromMe = true + comando + NO owner → allow = false ❌\n");

  console.log("Esto es CORRECTO si el bot está en el mismo número que el owner.");
  console.log("Pero puede causar problemas si:");
  console.log("  1. El bot está en un número diferente al owner");
  console.log("  2. Hay mensajes duplicados (fromMe y no fromMe)\n");

} else {
  console.log("❌ No se encontró la lógica del filtro 'allow'\n");
}

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("3️⃣  RECOMENDACIONES");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

console.log("Para diagnosticar el problema:");
console.log("  1. Verifica que el bot esté conectado y recibiendo mensajes");
console.log("  2. Envía un comando desde un número que NO sea el bot");
console.log("  3. Revisa los logs para ver si llega a handleMessage");
console.log("  4. Si no llega, el problema está en el filtro 'allow'");
console.log("  5. Si llega pero no responde, el problema está en handleMessage\n");

console.log("Prueba estos comandos:");
console.log("  • /ping - Comando simple de prueba");
console.log("  • /status - Ver estado del bot");
console.log("  • /whoami - Ver tu información de usuario\n");

console.log("Si el bot NO responde a NINGÚN comando:");
console.log("  1. Verifica que esté activo: /bot global on");
console.log("  2. En grupos, actívalo: /bot on");
console.log("  3. Registra el grupo: /addgroup\n");
