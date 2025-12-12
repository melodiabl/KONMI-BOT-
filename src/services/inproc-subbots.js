import { fork } from "child_process";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import EventEmitter from "events";
import { fileURLToPath } from "url";
import logger from "../config/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Anchor to backend directory so it doesn't depend on process.cwd()
const SUBBOT_BASE_DIR = path.resolve(__dirname, "storage", "subbots");

const SUBBOTS_ENABLED = String(process.env.SUBBOTS_ENABLED ?? "true").toLowerCase() !== "false";
const MAX_ACTIVE_SUBBOTS = parseInt(process.env.MAX_ACTIVE_SUBBOTS ?? "5", 10);
const MAX_SUBBOTS_PER_USER = parseInt(
  process.env.MAX_SUBBOTS_PER_USER ?? "2",
  10,
);
const SUBBOT_IDLE_TIMEOUT_MS = parseInt(
  process.env.SUBBOT_IDLE_TIMEOUT_MS ?? String(5 * 60 * 1000),
  10,
); // 5 minutos por defecto (reducido de 24 horas)
const MAX_SUBBOT_DIRS = parseInt(process.env.MAX_SUBBOT_DIRS ?? "30", 10);

// Usar un EventEmitter centralizado que NO interfiera con el bot principal
const eventBus = new EventEmitter();
eventBus.setMaxListeners(100);
const activeSubbots = new Map();
const listenersByCode = new Map();

function ensureDirectory(targetPath) {
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }
}

function cleanupSubbotStorageLimit() {
  if (!fs.existsSync(SUBBOT_BASE_DIR) || MAX_SUBBOT_DIRS <= 0) return;
  try {
    const entries = fs
      .readdirSync(SUBBOT_BASE_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const dirPath = path.join(SUBBOT_BASE_DIR, entry.name);
        try {
          const stats = fs.statSync(dirPath);
          return { name: entry.name, dirPath, mtimeMs: stats.mtimeMs };
        } catch (error) {
          logger.warn("No se pudo obtener información de directorio de subbot", {
            code: entry.name,
            error: error?.message,
          });
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.mtimeMs - b.mtimeMs);

    let excess = entries.length - MAX_SUBBOT_DIRS;
    if (excess <= 0) return;

    for (const entry of entries) {
      if (excess <= 0) break;
      if (activeSubbots.has(entry.name)) continue;
      try {
        fs.rmSync(entry.dirPath, { recursive: true, force: true });
        excess -= 1;
        logger.info(
          `🗑️ Directorio de subbot ${entry.name} eliminado para liberar espacio`,
        );
      } catch (error) {
        logger.warn("No se pudo eliminar directorio de subbot", {
          code: entry.name,
          error: error?.message,
        });
      }
    }
  } catch (error) {
    logger.warn("Error durante la limpieza de directorios de subbots", {
      error: error?.message,
    });
  }
}

function generateSubbotCode() {
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `SUB-${Date.now().toString(36).toUpperCase()}-${random}`;
}

function buildSubbotRecord({
  code,
  type,
  createdBy,
  requestJid,
  requestParticipant,
  targetNumber,
  metadata,
}) {
  return {
    code,
    type,
    createdBy,
    requestJid,
    requestParticipant,
    targetNumber,
    metadata,
    status: "starting",
    startedAt: new Date().toISOString(),
  };
}

function sanitiseTarget(number) {
  return typeof number === "string" ? number.replace(/[^0-9]/g, "") : "";
}

export function onSubbotEvent(eventName, handler) {
  if (typeof handler !== "function") return () => {};
  eventBus.on(eventName, handler);
  return () => eventBus.off(eventName, handler);
}

export function offSubbotEvent(eventName, handler) {
  if (typeof handler !== "function") return;
  eventBus.off(eventName, handler);
}

export function listActiveSubbots() {
  return Array.from(activeSubbots.values()).map(({ processRef, ...info }) => ({
    ...info,
  }));
}

export function getSubbotInfo(code) {
  const entry = activeSubbots.get(code);
  if (!entry) return null;
  const { processRef, ...info } = entry;
  return { ...info };
}

export function registerSubbotListeners(code, listeners) {
  if (!code || typeof code !== "string") return () => {};
  if (!Array.isArray(listeners) || listeners.length === 0) return () => {};
  const existing = listenersByCode.get(code) || [];
  const stored = [];
  listeners.forEach(({ event, handler }) => {
    if (!event || typeof handler !== "function") return;
    const wrappedHandler = (payload) => {
      if (payload?.subbot?.code === code) {
        handler(payload);
      }
    };
    eventBus.on(event, wrappedHandler);
    stored.push({ event, handler, wrappedHandler });
  });
  listenersByCode.set(code, existing.concat(stored));
  return () => unregisterSubbotListeners(code);
}

export function unregisterSubbotListeners(code, predicate) {
  if (!code || typeof code !== "string") return;
  const items = listenersByCode.get(code);
  if (!items || items.length === 0) return;
  const remaining = [];
  items.forEach(({ event, handler, wrappedHandler }) => {
    const shouldRemove =
      typeof predicate === "function" ? predicate(event, handler) : true;
    if (shouldRemove) {
      eventBus.off(event, wrappedHandler || handler);
    } else {
      remaining.push({ event, handler, wrappedHandler });
    }
  });
  if (remaining.length === 0) listenersByCode.delete(code);
  else listenersByCode.set(code, remaining);
}

export async function stopSubbot(code) {
  const entry = activeSubbots.get(code);
  if (!entry) return false;
  try {
    entry.processRef?.kill("SIGTERM");
  } catch (error) {
    logger.warn(`Error al detener subbot ${code}:`, error);
  }
  activeSubbots.delete(code);
  unregisterSubbotListeners(code);
  return true;
}

export async function launchSubbot(options = {}) {
  const type = options.type === "code" ? "code" : "qr";
  const code = options.code || generateSubbotCode();
  const createdBy = options.createdBy || "unknown";
  const targetNumber = sanitiseTarget(options.targetNumber || "");
  const metadata = {
    ...(options.metadata || {}),
    createdBy,
    requestJid: options.requestJid || null,
    requestParticipant: options.requestParticipant || null,
    targetNumber: targetNumber || null,
  };

  try {
    if (!SUBBOTS_ENABLED) {
      return { success: false, error: "Subbots deshabilitados por configuración (SUBBOTS_ENABLED=false)." };
    }
    if (MAX_ACTIVE_SUBBOTS > 0 && activeSubbots.size >= MAX_ACTIVE_SUBBOTS) {
      return {
        success: false,
        error:
          "Capacidad máxima de subbots en ejecución alcanzada. Intenta más tarde.",
      };
    }

    if (MAX_SUBBOTS_PER_USER > 0) {
      const userActive = Array.from(activeSubbots.values()).filter(
        (info) => info.createdBy === createdBy,
      ).length;
      if (userActive >= MAX_SUBBOTS_PER_USER) {
        return {
          success: false,
          error: "Ya alcanzaste el número máximo de subbots activos permitidos.",
        };
      }
    }

    ensureDirectory(SUBBOT_BASE_DIR);
    cleanupSubbotStorageLimit();
    // Allow injecting specific directory to reuse existing credentials
    const subbotDir = options.baseDir
      ? path.resolve(options.baseDir)
      : options.authDir
        ? path.resolve(options.authDir, "..")
        : path.join(SUBBOT_BASE_DIR, code);
    ensureDirectory(subbotDir);
    ensureDirectory(path.join(subbotDir, "auth"));

    const runnerPath = path.join(__dirname, "subbot-runner.js");

    const verboseSubbots =
      String(process.env.SUBBOTS_VERBOSE || process.env.SUBBOT_VERBOSE || "false")
        .toLowerCase() === "true";

    const forkOptions = {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SUB_CODE: code,
        SUB_TYPE: type,
        SUB_DIR: subbotDir,
        SUB_TARGET: targetNumber,
        SUB_METADATA: JSON.stringify(metadata),
        SUB_DISPLAY: metadata.customPairingDisplay || "KONMI-BOT",
      },
      // Si no está en modo verbose, no heredar stdout/stderr para que
      // los QR/códigos de subbots no aparezcan en los logs del proceso padre.
      stdio: verboseSubbots
        ? ["inherit", "inherit", "inherit", "ipc"]
        : ["ignore", "ignore", "ignore", "ipc"],
    };

    const child = fork(runnerPath, [], forkOptions);

    const subbotRecord = buildSubbotRecord({
      code,
      type,
      createdBy,
      requestJid: options.requestJid || null,
      requestParticipant: options.requestParticipant || null,
      targetNumber: targetNumber || null,
      metadata,
    });

    const publicRecord = { ...subbotRecord };

    let timeoutHandle = null;

    activeSubbots.set(code, {
      ...publicRecord,
      dir: subbotDir,
      authDir: path.join(subbotDir, "auth"),
      processRef: child,
      timeoutHandle: null,
    });
    
    eventBus.emit("launching", { subbot: { ...publicRecord } });

    const emit = (event, data) => {
      const current = activeSubbots.get(code) || publicRecord;
      if (event === "error" && eventBus.listenerCount("error") === 0) {
        logger.error("Evento error de subbot sin listeners registrados", {
          subbot: current,
          data,
        });
        return;
      }
      eventBus.emit(event, { subbot: current, data });
    };

    const cleanup = (reason) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      const info = activeSubbots.get(code) || publicRecord;
      if (activeSubbots.has(code)) {
        activeSubbots.delete(code);
      }
      unregisterSubbotListeners(code);
      emit("stopped", { reason, info });
    };

    // 🔧 CORRECCIÓN CRÍTICA: Re-emitir TODOS los eventos al eventBus
    // IMPORTANTE: Este listener DEBE registrarse INMEDIATAMENTE después del fork
    child.on("message", (message) => {
      try {
        if (!message || typeof message.event !== "string") {
          return;
        }
        
        const info = activeSubbots.get(code) || publicRecord;

        // Actualizar estado interno según el evento
        if (message.event === "connected") {
          info.status = "connected";
          info.connectedAt = new Date().toISOString();
          if (info.timeoutHandle) {
            clearTimeout(info.timeoutHandle);
            info.timeoutHandle = null;
          }
        }
        
        if (message.event === "disconnected") {
          info.status = "disconnected";
          info.disconnectedAt = new Date().toISOString();
        }
        
        if (message.event === "error") {
          info.status = "error";
          info.error = message.data?.message || "Error desconocido";
        }
        
        if (message.event === "logged_out") {
          info.status = "logged_out";
          info.disconnectedAt = new Date().toISOString();
          info.error = message.data?.message || "Sesión cerrada desde WhatsApp";
          try {
            const dirToRemove = info?.dir || path.join(SUBBOT_BASE_DIR, code);
            fs.rmSync(dirToRemove, {
              recursive: true,
              force: true,
            });
          } catch (cleanupError) {
            // Silenciar error de limpieza
          }
        }

        // Emitir evento al eventBus
        eventBus.emit(message.event, {
          subbot: { ...info },
          data: message.data || null,
        });
        
      } catch (err) {
        logger.error(`Error procesando mensaje de subbot ${code}:`, err?.message || err);
      }
    });

    child.on("exit", (codeExit) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      const info = activeSubbots.get(code) || publicRecord;
      if (info) {
        info.status = "exited";
        info.exitCode = codeExit;
      }
      eventBus.emit("disconnected", {
        subbot: info ? { ...info } : { code, type },
        data: { reason: codeExit },
      });
      cleanup("exit");
    });

    child.on("error", (error) => {
      logger.error("Error en proceso de subbot:", error);
      eventBus.emit("error", {
        subbot: { ...publicRecord },
        data: { message: error.message },
      });
      cleanup("child-error");
    });

    const idleTimeoutMs = Number.isFinite(options.idleTimeoutMs)
      ? options.idleTimeoutMs
      : SUBBOT_IDLE_TIMEOUT_MS;

    if (idleTimeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        logger.warn(
          `Subbot ${code} superó el tiempo máximo de espera (${idleTimeoutMs}ms), finalizando proceso`,
        );
        try {
          child.kill("SIGTERM");
        } catch (error) {
          logger.warn("No se pudo finalizar subbot tras timeout", {
            code,
            error: error?.message,
          });
        }
        eventBus.emit("error", {
          subbot: { ...publicRecord },
          data: { message: "Tiempo de espera agotado al iniciar subbot." },
        });
        cleanup("timeout");
      }, idleTimeoutMs);

      const info = activeSubbots.get(code);
      if (info) {
        info.timeoutHandle = timeoutHandle;
      }
    }

    return {
      success: true,
      subbot: publicRecord,
    };
  } catch (error) {
    logger.error("No se pudo lanzar el subbot:", error);
    return {
      success: false,
      error: error.message || "Error desconocido",
    };
  }
}

export default {
  launchSubbot,
  stopSubbot,
  listActiveSubbots,
  onSubbotEvent,
  offSubbotEvent,
  activeSubbots,
};
