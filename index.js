// index.js — Runner con verificación automática de dotenv + fix ARM64

import fs from "fs";
import os from "os";
import { execSync } from "child_process";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import logger from "./plugins/utils/bl-logger.js";

// ======================================
// 1. VERIFICAR SI DOTENV ESTÁ INSTALADO
// ======================================

logger.loading("Verificando dependencia dotenv");

let dotenvExists = false;

try {
    // Nota: 'require.resolve' se mantiene por compatibilidad en este bloque
    require.resolve("dotenv");
    dotenvExists = true;
    logger.success("dotenv encontrado");
} catch (e) {
    logger.warning("dotenv no encontrado, instalando automáticamente");
    try {
        execSync("npm install dotenv", { stdio: "pipe" });
        dotenvExists = true;
        logger.success("dotenv instalado correctamente");
    } catch (err) {
        logger.error("Error instalando dotenv", err.message);
    }
}

// Cargar dotenv SOLO si existe
if (dotenvExists) {
    logger.loading("Cargando configuración de entorno");
    await import("dotenv/config");
}

// ======================================
// 2. FIX PARA ARM64 — OMITIR CHROMIUM
// ======================================

const arch = os.arch();

if (arch === "arm64") {
    logger.warning("ARM64 detectado, omitiendo Chromium/Puppeteer");

    process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = "true";
    process.env.PUPPETEER_SKIP_DOWNLOAD = "true";
    process.env.PUPPETEER_EXECUTABLE_PATH = "/usr/bin/chromium";

    logger.success("Variables de entorno aplicadas para ARM64");
}

// ======================================
// 3. CARGAR EL BOT NORMALMENTE
// ======================================

// ✅ CORRECCIÓN 1: Ruta corregida para la nueva estructura
import config from "./plugins/config/config.js";
import app from "./server.js";

// ✅ CORRECCIÓN 2: Se añaden checkSessionState y sanitizePhoneNumberInput para reconexión automática
import {
    connectToWhatsApp,
    connectWithPairingCode,
    getConnectionStatus,
    clearWhatsAppSession,
    checkSessionState,
    sanitizePhoneNumberInput
} from "./whatsapp.js";

// ✅ CORRECCIÓN 3: Importar knex para migraciones automáticas
import knex from 'knex';
import knexfile from './knexfile.js';

async function runMigrationsIfNeeded() {
    try {
        logger.database("Verificando migraciones de base de datos");

        const environment = process.env.NODE_ENV || 'development';
        const config = (knexfile.default || knexfile)[environment];

        if (!config) {
            logger.warning("No se encontró configuración de base de datos", environment);
            return;
        }

        const db = knex(config);

        // Verificar si hay migraciones pendientes
        const [, pending] = await Promise.all([
            db.migrate.currentVersion(),
            db.migrate.list()
        ]);

        const pendingMigrations = pending[1]; // pending[1] contiene las migraciones pendientes

        if (pendingMigrations && pendingMigrations.length > 0) {
            logger.database(`Ejecutando ${pendingMigrations.length} migraciones pendientes`);
            await db.migrate.latest();
            logger.success("Migraciones completadas exitosamente");
        } else {
            logger.success("Base de datos actualizada, no hay migraciones pendientes");
        }

        await db.destroy();
    } catch (error) {
        logger.error("Error en migraciones automáticas", error.message);
        logger.info("Puedes ejecutar manualmente: npm run migrate");
    }
}

async function restoreSubbotsOnBoot() {
    try {
        const mod = await import("./plugins/services/subbot-manager.js");
        const restored = await mod.restoreActiveSubbots?.().catch(() => 0);
        logger.bot(`Subbots restaurados en arranque: ${restored || 0}`);
    } catch (e) {
        logger.warning("Subbots autostart falló", e?.message || e);
    }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ask = (q) => new Promise((res) => rl.question(q, (ans) => res((ans || "").trim())));
// Se elimina la función 'onlyDigits' local ya que se usa 'sanitizePhoneNumberInput'

function printBanner() {
    logger.createBanner('KONMI BOT', 'Sistema de Autenticación WhatsApp');
}

function printMenu() {
    logger.createMenu('SELECCIÓN DE AUTENTICACIÓN', [
        { text: 'Código QR (recomendado)', icon: '📱' },
        { text: 'Pairing Code (código en el teléfono)', icon: '🔢' }
    ]);
}

function dumpEnvPreview(authPath) {
    const credsPath = path.join(authPath, 'creds.json');
    const exists = fs.existsSync(credsPath);

    logger.createInfoSection('Configuración de Autenticación', [
        { key: 'Directorio', value: authPath },
        { key: 'Credenciales', value: 'creds.json', status: exists ? 'ok' : 'missing' },
        { key: 'Módulo Baileys', value: process.env.BAILEYS_MODULE || 'por defecto' }
    ]);
}

async function startWebServer(config) {
    logger.server(`Iniciando servidor web en puerto ${config.server.port}`);
    app.listen(config.server.port, config.server.host, () => {
        logger.success(`Servidor ejecutándose en http://${config.server.host}:${config.server.port}`);
        logger.info(`Health check disponible en /api/health`);
    });
}

async function main() {
    // ✅ CORRECCIÓN 3: Usar la ruta robusta ('session_data/baileys_full')
    const DEFAULT_AUTH_DIR = path.join(__dirname, 'session_data', 'baileys_full');
    const authPath = path.resolve(process.env.AUTH_DIR || DEFAULT_AUTH_DIR);

    // ✅ CORRECCIÓN 4: Ejecutar migraciones automáticas antes de iniciar
    await runMigrationsIfNeeded();

    // Autostart de subbots al arrancar el proceso (no depender de que el bot principal conecte).
    await restoreSubbotsOnBoot();

    // ===============================================
    // ✅ CORRECCIÓN 5: Lógica de Chequeo de Sesión
    // ===============================================
    try {
        const session = await checkSessionState(authPath);
        if (session.hasCreds) {
            logger.connection("Sesión encontrada, conectando automáticamente");
            dumpEnvPreview(session.authPath);
            await connectToWhatsApp(session.authPath, false, null);

            // Iniciar el servidor web y terminar
            await startWebServer(config);
            rl.close();
            return;
        }
    } catch (e) {
        logger.warning('Error al verificar la sesión, continuando al menú', e.message);
        // Continuar al menú si hay un error al chequear la sesión
    }
    // ===============================================
    // FIN de Lógica de Chequeo de Sesión
    // ===============================================

    printBanner();
    printMenu();

    let method = await ask('Elige un método (1/2) [1]: ');
    method = method || '1';

    if (method === '2') {
        logger.auth('Has elegido: Pairing Code');
        logger.space();
        dumpEnvPreview(authPath);

        let phoneNumber = await ask('Ingresa tu número de WhatsApp en formato internacional (ej: 595974154768): ');
        // Usar la función exportada y corregida 'sanitizePhoneNumberInput'
        phoneNumber = sanitizePhoneNumberInput(phoneNumber || process.env.PAIR_NUMBER);

        if (!phoneNumber) {
            logger.error('Número de teléfono inválido. Por favor, reinicia el script e inténtalo de nuevo.');
            rl.close();
            return;
        }

        logger.success(`Número proporcionado: +${phoneNumber}`);
        logger.loading('Solicitando código de emparejamiento');

        try {
            // Para pairing, usar SIEMPRE sesión limpia para evitar errores loggedOut
            try {
                await clearWhatsAppSession(authPath);
            } catch {}
            await connectWithPairingCode(phoneNumber, authPath);
        } catch (e) {
            logger.error('Error al iniciar la conexión con Pairing Code', e?.message || e);
        }
    } else {
        logger.auth('Has elegido: Código QR');
        logger.space();
        dumpEnvPreview(authPath);
        logger.loading('Generando código QR');

        try {
            await connectToWhatsApp(authPath, false, null);
        } catch (e) {
            logger.error('Error al iniciar la conexión con Código QR', e?.message || e);
        }
    }

    // Start the web server (si se conectó vía menú)
    await startWebServer(config);
    rl.close();
}

process.on('unhandledRejection', (err) => logger.error('UNHANDLED REJECTION', err?.stack || err));
process.on('uncaughtException', (err) => logger.error('UNCAUGHT EXCEPTION', err?.stack || err));

main().catch((e) => {
    logger.error('Error en la ejecución principal', e?.stack || e);
    process.exit(1);
});
