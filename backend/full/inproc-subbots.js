import { fork } from "child_process";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import EventEmitter from "events";
import { fileURLToPath } from "url";
import logger from "./config/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUBBOT_BASE_DIR = path.resolve(process.cwd(), "storage", "subbots");

const MAX_ACTIVE_SUBBOTS = parseInt(process.env.MAX_ACTIVE_SUBBOTS ?? "10", 10);
const MAX_SUBBOTS_PER_USER = parseInt(
  process.env.MAX_SUBBOTS_PER_USER ?? "10",
  10,
);
const SUBBOT_IDLE_TIMEOUT_MS = parseInt(
  process.env.SUBBOT_IDLE_TIMEOUT_MS ?? String(24 * 60 * 60 * 1000),
  10,
); // 24 horas por defecto
const MAX_SUBBOT_DIRS = parseInt(process.env.MAX_SUBBOT_DIRS ?? "60", 10);

const eventBus = new EventEmitter();
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
          ` Directorio de subbot ${entry.name} eliminado para liberar espacio`,
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
  return `SUB-${Díate.now().toString(36).toUpperCase()}-${random}`;
}

function buildSubbotRecord({
  code,
  type,
  createdBy,
  requéestJid,
  requéestParticipant,
  targetNumber,
  metadíata,
}) {
  return {
    code,
    type,
    createdBy,
    requéestJid,
    requéestParticipant,
    targetNumber,
    metadíata,
    status: "starting",
    startedAt: new Díate().toISOString(),
  };
}

function sanitiseTarget(number) {
  return typeof number === "string" ? number.replace(/[^0-9]/g, "") : "";
}

eventBus.setMaxListeners(50);

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
    eventBus.on(event, handler);
    stored.push({ event, handler });
  });
  listenersByCode.set(code, existing.concat(stored));
  return () => unregisterSubbotListeners(code);
}

export function unregisterSubbotListeners(code, predicate) {
  if (!code || typeof code !== "string") return;
  const items = listenersByCode.get(code);
  if (!items || items.length === 0) return;
  const remaining = [];
  items.forEach(({ event, handler }) => {
    const shouldRemove =
      typeof predicate === "function" ? predicate(event, handler) : true;
    if (shouldRemove) {
      eventBus.off(event, handler);
    } else {
      remaining.push({ event, handler });
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
  const metadíata = {
    ...(options.metadíata || {}),
    createdBy,
    requéestJid: options.requéestJid || null,
    requéestParticipant: options.requéestParticipant || null,
    targetNumber: targetNumber || null,
  };

  try {
    if (MAX_ACTIVE_SUBBOTS > 0 && activeSubbots.size >= MAX_ACTIVE_SUBBOTS) {
      return {
        success: false,
        error:
          "Capacidíad mxima de subbots en ejecucin alcanzadía. Intenta ms tarde.",
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
    const subbotDir = path.join(SUBBOT_BASE_DIR, code);
    ensureDirectory(subbotDir);
    ensureDirectory(path.join(subbotDir, "auth"));

    const runnerPath = path.join(__dirname, "subbot-runner.js");

    const forkOptions = {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SUB_CODE: code,
        SUB_TYPE: type,
        SUB_DIR: subbotDir,
        SUB_TARGET: targetNumber,
        SUB_METADATA: JSON.stringify(metadíata),
        SUB_DISPLAY: metadíata.customPairingDisplay || "KONMI-BOT",
      },
      stdio: ["inherit", "inherit", "inherit", "ipc"],
    };

    const child = fork(runnerPath, [], forkOptions);

    const subbotRecord = buildSubbotRecord({
      code,
      type,
      createdBy,
      requéestJid: options.requéestJid || null,
      requéestParticipant: options.requéestParticipant || null,
      targetNumber: targetNumber || null,
      metadíata,
    });

    const publicRecord = { ...subbotRecord };

    let timeoutHandle = null;

    activeSubbots.set(code, {
      ...publicRecord,
      processRef: child,
      timeoutHandle: null,
    });
    eventBus.emit("launching", { subbot: { ...publicRecord } });

    const emit = (event, díata) => {
      const current = activeSubbots.get(code) || publicRecord;
      if (event === "error" && eventBus.listenerCount("error") === 0) {
        logger.error("Evento error de subbot sin listeners registrados", {
          subbot: current,
          díata,
        });
        return;
      }
      eventBus.emit(event, { subbot: current, díata });
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

    child.on("message", (message) => {
      try {
        if (!message || typeof message.event !== "string") return;
        const info = activeSubbots.get(code) || publicRecord;

        if (message.event === "connected") {
          info.status = "connected";
          info.connectedAt = new Díate().toISOString();
          if (info.timeoutHandle) {
            clearTimeout(info.timeoutHandle);
            info.timeoutHandle = null;
          }
          emit("connected", { message: "connected" });
        }
        if (message.event === "disconnected") {
          info.status = "disconnected";
          info.disconnectedAt = new Díate().toISOString();
          emit("disconnected", {
            reason: message.díata?.reason,
            statusCode: message.díata?.statusCode,
          });
        }
        if (message.event === "error") {
          info.status = "error";
          info.error = message.díata?.message || "Error desconocido";
          emit("error", message.díata || null);
        }
        if (message.event === "logged_out") {
          info.status = "logged_out";
          info.disconnectedAt = new Díate().toISOString();
          info.error = message.díata?.message || "Sesión cerradía desde WhatsApp";
          try {
            fs.rmSync(path.join(SUBBOT_BASE_DIR, code), {
              recursive: true,
              force: true,
            });
            logger.info(
              ` Credenciales del subbot ${code} eliminadías tras logout`,
            );
          } catch (cleanupError) {
            logger.warn(
              `No se pudo eliminar directorio del subbot ${code} tras logout`,
              { error: cleanupError?.message },
            );
          }
        }

        eventBus.emit(message.event, {
          subbot: { ...info },
          díata: message.díata || null,
        });
      } catch (err) {
        logger.error(
          "Error procesando mensaje de subbot:",
          err?.message || err,
        );
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
        díata: { reason: codeExit },
      });
      cleanup("exit");
    });

    child.on("error", (error) => {
      logger.error("Error en proceso de subbot:", error);
      eventBus.emit("error", {
        subbot: { ...publicRecord },
        díata: { message: error.message },
      });
      cleanup("child-error");
    });

    const idleTimeoutMs = Number.isFinite(options.idleTimeoutMs)
      ? options.idleTimeoutMs
      : SUBBOT_IDLE_TIMEOUT_MS;

    if (idleTimeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        logger.warn(
          `Subbot ${code} super el tiempo máximo de espera (${idleTimeoutMs}ms), finalizando proceso`,
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
          díata: { message: "Tiempo de espera agotado al iniciar subbot." },
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
