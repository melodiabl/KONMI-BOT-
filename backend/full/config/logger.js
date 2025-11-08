// Configuracin del logger
import pino from "pino";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import chalk from "chalk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Asegurar que el directorio de logs exista
const logsDir = path.join(__dirname, "..", "storage", "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logLevel = process.env.LOG_LEVEL || "info";
const logFile = process.env.LOG_FILE || path.join(logsDir, "app.log");

// Logger simplificado sin workers para evitar problemas de stack
function createLogger() {
  try {
    // Modo simple: solo consola con pretty-print directo (sin workers)
    // Esto evita problemas con circular dependencies y stack overflow
    const prettyStream = pino.transport({
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
        ignore: "pid,hostname",
        sync: true, // Modo síncrono para evitar problemas de workers
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
    console.error("⚠️ Error creando logger con pino-pretty:", e.message);
    console.error("   Usando fallback a logger básico");

    // Fallback: pino normal sin pretty
    try {
      return pino({
        level: logLevel,
        timestamp: pino.stdTimeFunctions.isoTime,
      });
    } catch (fallbackError) {
      // Último recurso: console básico
      console.error("⚠️ Error en fallback de logger:", fallbackError.message);
      return {
        info: console.log,
        error: console.error,
        warn: console.warn,
        debug: console.log,
        trace: console.log,
      };
    }
  }
}

const logger = createLogger();

// Funciones de logging especializadas para WhatsApp con emojis
logger.whatsapp = {
  message: (type, command, user, group, details = {}) => {
    const context = group ? `📱 Grupo: ${group}` : "💬 Privado";
    const userContext = `👤 Usuario: ${user}`;
    const botId = (details && (details.bot || details.botId || details.botJid)) ? (details.bot || details.botId || details.botJid) : null;
    const botContext = botId ? ` | 🤖 Bot: ${botId}` : '';
    const fullContext = `${context} | ${userContext}${botContext}`;

    const emoji = type === "comando" ? "⚡" : "💬";
    const logMessage = `${emoji} [WhatsApp] ${command} - ${fullContext}`;
    const logDetails = {
      type,
      command,
      user,
      group,
      ...details,
    };

    logger.info(logMessage, logDetails);
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
    logger.info(`🔧 [Sistema] ${message}`, details);
  },

  error: (error, details = {}) => {
    logger.error(`❌ [Error] ${error}`, details);
  },
};

// Logging mejorado para subbots
logger.subbot = {
  created: (code, type, user) => {
    logger.info(
      `✨ [Subbot] Creado: ${code} | Tipo: ${type} | Usuario: ${user}`,
    );
  },

  connected: (code, number) => {
    logger.info(`🟢 [Subbot] Conectado: ${code} | Número: +${number}`);
  },

  disconnected: (code, reason) => {
    logger.info(`🔴 [Subbot] Desconectado: ${code} | Razón: ${reason}`);
  },

  cleaned: (code) => {
    logger.info(`🗑️ [Subbot] Auto-limpieza completada: ${code}`);
  },

  qr: (code, user) => {
    logger.info(`📱 [Subbot] QR generado: ${code} | Usuario: ${user}`);
  },

  pairingCode: (code, phoneNumber, pairingCode) => {
    logger.info(
      `🔢 [Subbot] Código generado: ${pairingCode} | Número: ${phoneNumber} | ID: ${code}`,
    );
  },

  error: (code, error) => {
    logger.error(`❌ [Subbot] Error en ${code}: ${error}`);
  },
};

// Logging para comandos específicos
logger.commands = {
  executed: (command, user, success = true) => {
    const emoji = success ? "✅" : "❌";
    logger.info(
      `${emoji} [Comando] ${command} | Usuario: ${user} | Estado: ${success ? "Éxito" : "Falló"}`,
    );
  },

  aportes: (action, user, details = {}) => {
    logger.info(`📦 [Aportes] ${action} | Usuario: ${user}`, details);
  },

  pedidos: (action, user, details = {}) => {
    logger.info(`📝 [Pedidos] ${action} | Usuario: ${user}`, details);
  },

  multimedia: (type, query, user) => {
    logger.info(`🎵 [Multimedia] ${type} | Query: ${query} | Usuario: ${user}`);
  },

  admin: (action, target, executor) => {
    logger.info(`🛡️ [Admin] ${action} | Target: ${target} | Por: ${executor}`);
  },

  ia: (query, user, model) => {
    logger.info(
      `🤖 [IA] Query: ${query} | Usuario: ${user} | Modelo: ${model}`,
    );
  },
};

// Logging para base de datos
logger.database = {
  query: (table, action) => {
    logger.info(`🗄️ [DB] ${action} en tabla: ${table}`);
  },

  error: (operation, error) => {
    logger.error(`❌ [DB] Error en ${operation}: ${error}`);
  },

  migration: (name, status) => {
    const emoji = status === "success" ? "✅" : "❌";
    logger.info(`${emoji} [DB] Migración ${name}: ${status}`);
  },
};

// Logging para el sistema
logger.system = {
  startup: (version) => {
    console.log("\n╔═══════════════════════════════════════════╗");
    console.log("║  🤖 KONMI BOT - SISTEMA INICIADO         ║");
    console.log("╚═══════════════════════════════════════════╝");
    logger.info(`✨ [Sistema] Versión: ${version}`);
    logger.info(`🚀 [Sistema] Iniciado exitosamente`);
  },

  shutdown: () => {
    logger.info(`🛑 [Sistema] Cerrando aplicación...`);
  },

  connected: (platform) => {
    logger.info(`🔌 [Sistema] Conectado a ${platform}`);
  },

  disconnected: (platform, reason) => {
    logger.warn(`⚠️ [Sistema] Desconectado de ${platform}: ${reason}`);
  },

  error: (component, error) => {
    logger.error(`❌ [Sistema] Error en ${component}: ${error}`);
  },
};

// Ayudantes visuales para consola (banners bonitos)
logger.pretty = {
  banner: (title, icon = "") => {
    const line = chalk.gray("".repeat(Math.max(24, title.length + 8)));
    console.log(`${chalk.gray("")}${line}${chalk.gray("")}`);
    console.log(
      `${chalk.gray("")} ${icon}  ${chalk.bold(title)} ${chalk.gray(" ".repeat(Math.max(1, line.length - title.length - 6)))}${chalk.gray("")}`,
    );
    console.log(`${chalk.gray("")}${line}${chalk.gray("")}`);
  },
  section: (label, icon = "") => {
    console.log(`${chalk.cyan(icon)} ${chalk.bold(label)}`);
  },
  kv: (key, value) => {
    console.log(
      `  ${chalk.gray("")} ${chalk.white(key)}: ${chalk.green(String(value))}`,
    );
  },
  line: (text) => {
    console.log(`${chalk.gray("")} ${text}`);
  },
};

export default logger;
