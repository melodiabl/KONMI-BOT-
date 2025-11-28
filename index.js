// index.js — Runner con verificación automática de dotenv + fix ARM64

import fs from "fs";
import os from "os";
import { execSync } from "child_process";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

// ======================================
// 1. VERIFICAR SI DOTENV ESTÁ INSTALADO
// ======================================

console.log("🔍 Verificando dependencia dotenv...");

let dotenvExists = false;

try {
    require.resolve("dotenv");
    dotenvExists = true;
    console.log("✔ dotenv encontrado.");
} catch (e) {
    console.log("⚠ dotenv NO encontrado. Instalando...");
    try {
        execSync("npm install dotenv", { stdio: "inherit" });
        dotenvExists = true;
        console.log("✔ dotenv instalado correctamente.");
    } catch (err) {
        console.error("❌ Error instalando dotenv:", err);
    }
}

// Cargar dotenv SOLO si existe
if (dotenvExists) {
    console.log("⚙ Cargando dotenv...");
    await import("dotenv/config");
}

// ======================================
// 2. FIX PARA ARM64 — OMITIR CHROMIUM
// ======================================

const arch = os.arch();

if (arch === "arm64") {
    console.log("🛑 ARM64 detectado — omitiendo Chromium/Puppeteer...");

    process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = "true";
    process.env.PUPPETEER_SKIP_DOWNLOAD = "true";
    process.env.PUPPETEER_EXECUTABLE_PATH = "/usr/bin/chromium";

    console.log("✔ Variables aplicadas (sin Chromium).");
}

// ======================================
// 3. CARGAR EL BOT NORMALMENTE
// ======================================

import config from "./src/config/config.js";
import app from "./server.js";

import {
    connectToWhatsApp,
    connectWithPairingCode,
    getConnectionStatus,
    clearWhatsAppSession,
} from "./whatsapp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ask = (q) => new Promise((res) => rl.question(q, (ans) => res((ans || "").trim())));
const onlyDigits = (v) => String(v || "").replace(/\D/g, "");

function printBanner() {
  console.log('\n🤖 KONMI BOT 🤖\n');
  console.log('🔐 Sistema de Autenticación\n');
}

function printMenu() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   🔐 SELECCIÓN DE AUTENTICACIÓN        ║');
  console.log('╠════════════════════════════════════════╣');
  console.log('║ 1) 📱 Código QR (recomendado)          ║');
  console.log('║ 2) 🔢 Pairing Code (código en el tel.) ║');
  console.log('╚════════════════════════════════════════╝');
}

function dumpEnvPreview(authPath) {
  const credsPath = path.join(authPath, 'creds.json');
  const exists = fs.existsSync(credsPath);
  console.log('─────────────────────────────────────────────');
  console.log('📄 Directorio de Autenticación:', authPath);
  console.log('💾 creds.json:', exists ? 'Existe ✅' : 'No existe ❌');
  console.log('📦 Módulo Baileys:', process.env.BAILEYS_MODULE || '(por defecto)');
  console.log('─────────────────────────────────────────────');
}

async function main() {
  printBanner();
  printMenu();

  let method = await ask('Elige un método (1/2) [1]: ');
  method = method || '1';

  const authPath = path.resolve(process.env.AUTH_DIR || path.join(__dirname, 'storage', 'baileys_full'));

  if (method === '2') {
    console.log('\nHas elegido: 🔢 Pairing Code\n');
    dumpEnvPreview(authPath);

    let phoneNumber = await ask('Ingresa tu número de WhatsApp en formato internacional (ej: 595974154768): ');
    phoneNumber = onlyDigits(phoneNumber || process.env.PAIR_NUMBER);

    if (!phoneNumber) {
      console.log('❌ Número de teléfono inválido. Por favor, reinicia el script e inténtalo de nuevo.');
      rl.close();
      return;
    }

    console.log(`✅ Número proporcionado: +${phoneNumber}`);
    console.log('⏳ Solicitando código de emparejamiento...');

    try {
      // Para pairing, usar SIEMPRE sesión limpia para evitar errores loggedOut
      try {
        await clearWhatsAppSession(authPath);
      } catch {}
      await connectWithPairingCode(phoneNumber, authPath);
    } catch (e) {
      console.error('❌ Error al iniciar la conexión con Pairing Code:', e?.message || e);
    }
  } else {
    console.log('\nHas elegido: 📱 Código QR\n');
    dumpEnvPreview(authPath);
    console.log('⏳ Generando código QR...');

    try {
      await connectToWhatsApp(authPath, false, null);
    } catch (e) {
      console.error('❌ Error al iniciar la conexión con Código QR:', e?.message || e);
    }
  }

  // Start the web server
  console.log(`\n🌐 Starting web server on port ${config.server.port}...`);
  app.listen(config.server.port, config.server.host, () => {
    console.log(`✅ Server running at http://${config.server.host}:${config.server.port}`);
    console.log(`📊 Health check: http://${config.server.host}:${config.server.port}/api/health`);
  });
}

process.on('unhandledRejection', (err) => console.error('UNHANDLED REJECTION:', err?.stack || err));
process.on('uncaughtException', (err) => console.error('UNCAUGHT EXCEPTION:', err?.stack || err));

main().catch((e) => {
  console.error('Error en la ejecución principal:', e?.stack || e);
  process.exit(1);
});
