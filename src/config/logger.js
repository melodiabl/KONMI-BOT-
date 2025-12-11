// src/config/logger.js
// Logger centralizado usando pino + pino-pretty, con helpers para WhatsApp, DB y sistema.

import pino from "pino";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import chalk from "chalk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directorio de logs (solo usado si en el futuro se activa escritura a archivo)
const logsDir = path.resolve(__dirname, "..", "..", "storage", "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logLevel = process.env.LOG_LEVEL || "info";

function createLogger() {
  try {
    const prettyStream = pino.transport({
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
        ignore: "pid,hostname",
        sync: true,
      },
    });

    const loggerInstance = pino(
      {
        level: logLevel,
        timestamp: pino.stdTimeFunctions.isoTime,
      },
      prettyStream,
    );

    return loggerInstance;
  } catch (e) {
    console.error("⚠️ Error creando logger con pino-pretty:", e?.message || e);
    console.error("   Usando fallback a logger básico (pino JSON)");

    try {
      return pino({
        level: logLevel,
        timestamp: pino.stdTimeFunctions.isoTime,
      });
    } catch (fallbackError) {
      console.error("⚠️ Error en fallback de logger:", fallbackError?.message || fallbackError);
      return {
        info: console.log,
        error: console.error,
        warn: console.warn,
        debug: (...args) => {
          if (logLevel === "debug") console.log(...args);
        },
      };
    }
  }
}

const logger = createLogger();

// ---------- Helpers WhatsApp ----------
logger.whatsapp = {
  message: (type, command, user, group, details = {}) => {
    const context = group ? `Grupo: ${group}` : "Privado";
    const userContext = `Usuario: ${user}`;
    const botId =
      (details && (details.bot || details.botId || details.botJid)) ||
      null;
    const botContext = botId ? ` | Bot: ${botId}` : "";
    const fullContext = `${context} | ${userContext}${botContext}`;

    const emoji = type === "comando" ? "⌨️" : "💬";
    const logMessage = `${emoji} [WhatsApp] ${command} - ${fullContext}`;

    logger.info(
      {
        scope: "whatsapp",
        type,
        command,
        user,
        group,
        ...details,
      },
      logMessage,
    );
  },

  groupMessage: (message, group, user, details = {}) => {
    logger.whatsapp.message("mensaje", message, user, group, details);
  },

  privateMessage: (message, user, details = {}) => {
    logger.whatsapp.message("mensaje", message, user, null, details);
  },

  command: (command, user, group, details = {}) => {
    logger.whatsapp.message("comando", command, user, group, details);
  },

  system: (message, details = {}) => {
    logger.info(
      {
        scope: "whatsapp",
        type: "system",
        ...details,
      },
      `⚙️ [WhatsApp] ${message}`,
    );
  },

  error: (error, details = {}) => {
    logger.error(
      {
        scope: "whatsapp",
        error,
        ...details,
      },
      `❌ [WhatsApp] ${error}`,
    );
  },
};

// ---------- Helpers Subbots ----------
logger.subbot = {
  created: (code, type, user) => {
    logger.info(
      { scope: "subbot", event: "created", code, type, user },
      `🤖 [Subbot] Creado: ${code} | Tipo: ${type} | Usuario: ${user}`,
    );
  },

  connected: (code, number) => {
    logger.info(
      { scope: "subbot", event: "connected", code, number },
      `✅ [Subbot] Conectado: ${code} | Número: +${number}`,
    );
  },

  disconnected: (code, reason) => {
    logger.info(
      { scope: "subbot", event: "disconnected", code, reason },
      `⚪ [Subbot] Desconectado: ${code} | Razón: ${reason}`,
    );
  },

  cleaned: (code) => {
    logger.info(
      { scope: "subbot", event: "cleaned", code },
      `🧹 [Subbot] Auto-limpieza completada: ${code}`,
    );
  },

  qr: (code, user) => {
    logger.info(
      { scope: "subbot", event: "qr", code, user },
      `📷 [Subbot] QR generado: ${code} | Usuario: ${user}`,
    );
  },

  pairingCode: (code, phoneNumber, pairingCode) => {
    logger.info(
      {
        scope: "subbot",
        event: "pairing_code",
        code,
        phoneNumber,
        pairingCode,
      },
      `🔑 [Subbot] Código: ${pairingCode} | Número: ${phoneNumber} | ID: ${code}`,
    );
  },

  error: (code, error) => {
    logger.error(
      { scope: "subbot", event: "error", code, error },
      `❌ [Subbot] Error en ${code}: ${error}`,
    );
  },
};

// ---------- Helpers Comandos ----------
logger.commands = {
  executed: (command, user, success = true) => {
    const emoji = success ? "✅" : "❌";
    logger.info(
      { scope: "command", command, user, success },
      `${emoji} [Comando] ${command} | Usuario: ${user} | Estado: ${
        success ? "Éxito" : "Fallo"
      }`,
    );
  },

  aportes: (action, user, details = {}) => {
    logger.info(
      { scope: "command", type: "aportes", action, user, ...details },
      `📦 [Aportes] ${action} | Usuario: ${user}`,
    );
  },

  pedidos: (action, user, details = {}) => {
    logger.info(
      { scope: "command", type: "pedidos", action, user, ...details },
      `📝 [Pedidos] ${action} | Usuario: ${user}`,
    );
  },

  multimedia: (type, query, user) => {
    logger.info(
      { scope: "command", type: "multimedia", mediaType: type, query, user },
      `🎵 [Multimedia] ${type} | Query: ${query} | Usuario: ${user}`,
    );
  },

  admin: (action, target, executor) => {
    logger.info(
      { scope: "command", type: "admin", action, target, executor },
      `🛡️ [Admin] ${action} | Target: ${target} | Por: ${executor}`,
    );
  },

  ia: (query, user, model) => {
    logger.info(
      { scope: "command", type: "ia", query, user, model },
      `🤖 [IA] Query: ${query} | Usuario: ${user} | Modelo: ${model}`,
    );
  },
};

// ---------- Helpers Base de Datos ----------
logger.database = {
  query: (table, action) => {
    logger.info(
      { scope: "db", table, action },
      `🗄️ [DB] ${action} en tabla: ${table}`,
    );
  },

  error: (operation, error) => {
    logger.error(
      { scope: "db", operation, error },
      `❌ [DB] Error en ${operation}: ${error}`,
    );
  },

  migration: (name, status) => {
    const emoji = status === "success" ? "✅" : "❌";
    logger.info(
      { scope: "db", type: "migration", name, status },
      `${emoji} [DB] Migración ${name}: ${status}`,
    );
  },
};

// ---------- Helpers Sistema ----------
logger.system = {
  startup: (version) => {
    const line = "─".repeat(40);
    console.log(`\n${line}`);
    console.log(`🚀 KONMI BOT - BACKEND (${version || "desconocido"})`);
    console.log(`${line}`);
    logger.info({ scope: "system", event: "startup", version }, "Sistema iniciado");
  },

  shutdown: () => {
    logger.info({ scope: "system", event: "shutdown" }, "Sistema apagándose...");
  },

  connected: (platform) => {
    logger.info(
      { scope: "system", event: "connected", platform },
      `🔌 [Sistema] Conectado a ${platform}`,
    );
  },

  disconnected: (platform, reason) => {
    logger.warn(
      { scope: "system", event: "disconnected", platform, reason },
      `⚠️ [Sistema] Desconectado de ${platform}: ${reason}`,
    );
  },

  error: (component, error) => {
    logger.error(
      { scope: "system", event: "error", component, error },
      `❌ [Sistema] Error en ${component}: ${error}`,
    );
  },
};

// ---------- Helpers visuales opcionales ----------
logger.pretty = {
  banner: (title, icon = "") => {
    const line = chalk.gray("─".repeat(Math.max(24, title.length + 8)));
    console.log(`${line}`);
    console.log(
      `${icon ? `${icon} ` : ""}${chalk.bold(title)}${chalk.gray(
        " ".repeat(Math.max(1, line.length - title.length - 2)),
      )}`,
    );
    console.log(`${line}`);
  },
  section: (label, icon = "") => {
    console.log(`${chalk.cyan(icon)} ${chalk.bold(label)}`);
  },
  kv: (key, value) => {
    console.log(
      `  ${chalk.white(key)}: ${chalk.green(String(value))}`,
    );
  },
  line: (text) => {
    console.log(`${chalk.gray("•")} ${text}`);
  },
};

export default logger;

