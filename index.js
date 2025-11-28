// index.js — Runner con verificación automática de dotenv + fix ARM64 + Fix de Sesión

import fs from "fs";
import os from "os";
import { execSync } from "child_process";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import { clearWhatsAppSession, connectToWhatsApp, connectWithPairingCode, checkSessionState, sanitizePhoneNumberInput } from "./whatsapp.js";
import config from './src/config/index.js';

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
    process.env.PUPPETEER_EXECUTABLE_PATH = "";
    process.env.CHROME_BIN = "";

    console.log("✔ Variables aplicadas (sin Chromium).");
} else {
    console.log("ℹ️ Arquitectura no ARM64. El bot intentará descargar Chromium si es necesario.");
}

// ======================================
// 3. MAIN RUNNER
// ======================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function dumpEnvPreview(authPath) {
  console.log('ℹ️ Sesión se guardará en:', authPath);
  console.log('ℹ️ Para usar Pairing Code, la variable PHONE_NUMBER debe estar en .env');
}

function getSessionPath() {
    // RUTA SEGURA: USAMOS 'session_data' COMO VALOR POR DEFECTO
    return process.env.AUTH_DIR || path.join(__dirname, 'session_data');
}

async function main() {
  // 1. Cargar configuración global antes de la conexión
  await import('./src/config/global-config.js');

  const authPath = getSessionPath();
  const state = await checkSessionState(authPath);

  const isRegistered = !!state?.creds?.registered;
  const forceAuth = String(process.env.FORCE_AUTH || 'false').toLowerCase() === 'true';

  // 2. Comprobar si existe una sesión guardada y no está forzando una nueva
  if (isRegistered && !forceAuth) {
    console.log('✅ Sesión existente detectada. Conectando automáticamente...');
    await connectToWhatsApp(authPath, false, null); // Conexión normal con credenciales guardadas
  } else {
    // 3. Si no hay sesión o se forzó, mostrar menú de autenticación
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('\n🤖 KONMI BOT 🤖');
    console.log('🔐 Sistema de Autenticación');
    console.log('╔════════════════════════════════════════╗');
    console.log('║   🔐 SELECCIÓN DE AUTENTICACIÓN         ║');
    console.log('╠════════════════════════════════════════╣');
    console.log('║ 1) 📱 Código QR (recomendado)          ║');
    console.log('║ 2) 🔢 Pairing Code (código en el tel.) ║');
    console.log('╚════════════════════════════════════════╝');

    const answer = await new Promise(resolve => {
      rl.question('Elige una opción (1 o 2): ', resolve);
    });

    if (answer.trim() === '2') {
      console.log('\nHas elegido: 🔢 Pairing Code\n');
      const phoneNumber = sanitizePhoneNumberInput(process.env.PHONE_NUMBER);
      if (!phoneNumber) {
        console.error('❌ Para usar Pairing Code, la variable PHONE_NUMBER debe estar configurada en .env o en el entorno.');
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

    rl.close(); // Cerrar la interfaz readline
  }

  // Start the web server
  console.log(`\n🌐 Starting web server on port ${config.server.port}...`);
  app.listen(config.server.port, config.server.host, () => {
    console.log(`✅ Server running at http://${config.server.host}:${config.server.port}`);
    console.log(`📊 Health check: http://${config.server.host}:${config.server.port}/api/health`);
  });
}

import app from './src/server.js'; // Asegúrate de importar tu servidor

main();

process.on('unhandledRejection', (err) => console.error('UNHANDLED REJECTION:', err?.stack || err));
process.on('uncaughtException', (err) => console.error('UNCAUGHT EXCEPTION:', err?.stack || err));
