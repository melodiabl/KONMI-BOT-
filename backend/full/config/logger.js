// Configuración del logger
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Asegurar que el directorio de logs exista
const logsDir = path.join(__dirname, '..', 'storage', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logLevel = process.env.LOG_LEVEL || 'info';
const logFile = process.env.LOG_FILE || path.join(logsDir, 'app.log');

// Logger con pretty-print en consola cuando está disponible pino-pretty
function createLogger() {
  try {
    // Intentar activar pino-pretty si está instalado
    const logger = pino({
      level: logLevel,
      timestamp: pino.stdTimeFunctions.isoTime,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname'
        }
      }
    });
    return logger;
  } catch (e) {
    // Fallback: pino normal (sin pretty)
    return pino({
      level: logLevel,
      timestamp: pino.stdTimeFunctions.isoTime
    });
  }
}

const logger = createLogger();

// Funciones de logging especializadas para WhatsApp
logger.whatsapp = {
  message: (type, command, user, group, details = {}) => {
    const context = group ? `Grupo: ${group}` : 'Privado';
    const userContext = `Usuario: ${user}`;
    const fullContext = `${context} | ${userContext}`;
    
    const logMessage = `[WhatsApp] ${command} - ${fullContext}`;
    const logDetails = {
      type,
      command,
      user,
      group,
      ...details
    };
    
    logger.info(logMessage, logDetails);
  },
  
  groupMessage: (message, group, user, details = {}) => {
    logger.whatsapp.message('mensaje', message, user, group, details);
  },
  
  privateMessage: (message, user, details = {}) => {
    logger.whatsapp.message('mensaje', message, user, null, details);
  },
  
  command: (command, user, group, details = {}) => {
    logger.whatsapp.message('comando', command, user, group, details);
  },
  
  system: (message, details = {}) => {
    logger.info(`[Sistema] ${message}`, details);
  },
  
  error: (error, details = {}) => {
    logger.error(`[Error] ${error}`, details);
  }
};

// Ayudantes visuales para consola (banners bonitos)
logger.pretty = {
  banner: (title, icon = '🚀') => {
    const line = chalk.gray('─'.repeat(Math.max(24, title.length + 8)));
    console.log(`${chalk.gray('┌')}${line}${chalk.gray('┐')}`);
    console.log(`${chalk.gray('│')} ${icon}  ${chalk.bold(title)} ${chalk.gray(' '.repeat(Math.max(1, line.length - title.length - 6)))}${chalk.gray('│')}`);
    console.log(`${chalk.gray('└')}${line}${chalk.gray('┘')}`);
  },
  section: (label, icon = '•') => {
    console.log(`${chalk.cyan(icon)} ${chalk.bold(label)}`);
  },
  kv: (key, value) => {
    console.log(`  ${chalk.gray('›')} ${chalk.white(key)}: ${chalk.green(String(value))}`);
  },
  line: (text) => {
    console.log(`${chalk.gray('›')} ${text}`);
  }
};

export default logger;
