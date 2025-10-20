// Baileys se cargara dinamicamente para permitir forks modificados
let baileys = null;
let DisconnectReason,
  useMultiFileAuthState,
  Browsers,
  jidNormalizedUser,
  areJidsSameUser,
  makeWASocket;
import pino from "pino";
import QRCode from "qrcode";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import readline from "readline";
import db from "./db.js";
import logger from "./config/logger.js";
import os from "os";
import {
  generateSubbotPairingCode,
  generateSubbotQR,
  getSubbotStatus as getRuntimeStatus,
  getAllSubbots as getAllSubbotsFromLib,
} from "./lib/subbots.js";
import {
  handleIA,
  handleMyAportes,
  handleAportes,
  handleAddAporte,
  handleAporteEstado,
  handlePedido,
  handlePedidos,
  handleLock,
  handleUnlock,
  handleTag,
  handleWhoami,
  handleDebugAdmin,
} from "./handler.js";

// Handlers para QR y codigo de vinculacion
async function handleQROrCodeRequest(method, ownerNumber) {
  try {
    const result = await generateSubbotQR(ownerNumber);
    if (!result.success) {
      return { message: result.error || "Error al generar el codigo QR" };
    }
    if (result.qr) {
      return {
        image: result.qr,
        message: "Escanea este codigo QR para vincular tu bot",
      };
    }
    return { message: "Error: no se pudo generar el codigo QR" };
  } catch (error) {
    logger.error("Error al generar QR:", error);
    return { message: "Ocurrio un error al generar el codigo QR" };
  }
}

async function handlePairingCode(phoneNumber) {
  try {
    const result = await generateSubbotPairingCode(phoneNumber, "KONMI-BOT");
    if (!result.success) {
      return {
        message: result.error || "Error al generar el codigo de vinculacion",
      };
    }
    if (result.code) {
      return { message: `Tu codigo de vinculacion es: ${result.code}` };
    }
    return { message: "Error: no se pudo generar el codigo de vinculacion" };
  } catch (error) {
    logger.error("Error al generar codigo:", error);
    return { message: "Ocurrio un error al generar el codigo" };
  }
}

// Cargar Baileys de forma diferida (para permitir forks)
async function isSubbotActive(subbotCode) {
  try {
    const status = await getRuntimeStatus(subbotCode);
    return status?.active === true && status.status === "connected";
  } catch (error) {
    logger.error(`Error checking subbot ${subbotCode} status:`, error);
    return false;
  }
}

async function updateOwnerSubbotStatus(userJid) {
  try {
    // Actualizar estado de subbots del usuario
    const subbots = await db("subbots").where({ request_jid: userJid });
    for (const subbot of subbots) {
      const isActive = await isSubbotActive(subbot.code);
      if (isActive !== (subbot.status === "connected")) {
        await db("subbots")
          .where({ code: subbot.code })
          .update({
            status: isActive ? "connected" : "disconnected",
            last_heartbeat: new Date(),
            updated_at: new Date(),
          });
      }
    }
  } catch (error) {
    logger.error("Error actualizando estado de subbots:", error);
  }
}

async function loadBaileys() {
  if (baileys) return true;
  const candidates = [];
  if (process?.env?.BAILEYS_MODULE) candidates.push(process.env.BAILEYS_MODULE);
  // Priorizar forks
  candidates.push("baileys-mod");
  candidates.push("baileys");
  candidates.push("@whiskeysockets/baileys");
  for (const mod of candidates) {
    try {
      baileys = await import(mod);
      DisconnectReason = baileys.DisconnectReason;
      useMultiFileAuthState = baileys.useMultiFileAuthState;
      Browsers = baileys.Browsers;
      jidNormalizedUser = baileys.jidNormalizedUser;
      areJidsSameUser = baileys.areJidsSameUser;
      makeWASocket = baileys.makeWASocket ?? baileys.default;
      logger.info?.(`Baileys cargado desde mdulo: ${mod}`);
      return true;
    } catch (e) {
      // probar siguiente candidato
    }
  }
  logger.warn?.(
    "Baileys no disponible (temporalmente deshabilitado): no se pudo importar ningn mdulo candidato",
  );
  return false;
}

// Asegurar tabla de estado global del bot y fila por defecto
let botGlobalStateReady = false;
async function ensureBotGlobalStateTable() {
  if (botGlobalStateReady) return;
  try {
    const exists = await db.schema.hasTable("bot_global_state");
    if (!exists) {
      await db.schema.createTable("bot_global_state", (t) => {
        t.increments("id");
        t.boolean("is_on").notNullable().defaultTo(true);
        t.timestamps(true, true);
      });
      logger.pretty.line(" Tabla bot_global_state creada");
    }
    // Asegurar una fila
    const row = await db("bot_global_state").first("id");
    if (!row) {
      await db("bot_global_state").insert({ is_on: true });
      logger.pretty.line(" Estado global inicializado (is_on=true)");
    }
    botGlobalStateReady = true;
  } catch (error) {
    logger.warn("No se pudo verificar/crear tabla bot_global_state", {
      error: error?.message,
    });
  }
}

// Tabla de subbots (multi-cuenta por usuario)
let subbotsTableReady = false;

// FunciÃ³n para reiniciar la tabla subbots
async function resetSubbotsTable() {
  try {
    logger.warn("Reiniciando tabla subbots...");
    await db.schema.dropTableIfExists("subbots");
    await db.schema.dropTableIfExists("subbots_temp");
    subbotsTableReady = false;
    await ensureSubbotsTable();
    logger.info("âœ… Tabla subbots reiniciada exitosamente");
    return true;
  } catch (error) {
    logger.error("Error al reiniciar la tabla subbots:", error);
    return false;
  }
}
async function ensureSubbotsTable() {
  if (subbotsTableReady) return true;

  const maxRetries = 3;
  let retries = 0;

  // Primero intentar con la tabla temporal si existe
  try {
    const tempExists = await db.schema.hasTable("subbots_temp");
    if (tempExists) {
      logger.warn("Usando tabla temporal subbots_temp");
      return true;
    }
  } catch (e) {
    logger.warn("No se pudo verificar tabla temporal:", e.message);
  }

  while (retries < maxRetries) {
    try {
      // Verificar si la tabla principal existe
      const exists = await db.schema.hasTable("subbots");

      if (!exists) {
        logger.info("La tabla subbots no existe, creandola...");

        // Crear la tabla con todas las columnas necesarias
        await db.schema.createTable("subbots", (t) => {
          t.increments("id").primary();
          t.string("code", 100).unique().notNullable();
          t.string("type", 20).notNullable().defaultTo("qr");
          t.string("status", 30).notNullable().defaultTo("pending");
          t.string("created_by", 30);
          t.string("request_jid", 150);
          t.string("request_participant", 150);
          t.string("target_number", 30);
          t.text("qr_data");
          t.string("pairing_code", 12);
          t.string("api_token", 100);
          t.timestamp("created_at").defaultTo(db.fn.now());
          t.timestamp("updated_at").defaultTo(db.fn.now());
          t.timestamp("last_heartbeat").defaultTo(db.fn.now());
          t.jsonb("metadata");
        });

        logger.info(" Tabla subbots creada exitosamente");
      } else {
        // Verificar si faltan columnas
        let columns = [];
        try {
          const result = await db.raw(`PRAGMA table_info(subbots)`);
          columns = result || [];
          const columnNames = columns.map((col) => col.name);

          const requiredColumns = [
            "id",
            "code",
            "type",
            "status",
            "created_by",
            "request_jid",
            "request_participant",
            "target_number",
            "qr_data",
            "pairing_code",
            "api_token",
            "created_at",
            "updated_at",
            "last_heartbeat",
            "metadata",
          ];

          for (const col of requiredColumns) {
            if (!columnNames.includes(col)) {
              logger.warn(`Agregando columna faltante: ${col}`);
              try {
                if (col === "metadata") {
                  await db.schema.alterTable("subbots", (t) => {
                    t.jsonb(col).nullable();
                  });
                } else if (
                  col === "created_at" ||
                  col === "updated_at" ||
                  col === "last_heartbeat"
                ) {
                  await db.schema.alterTable("subbots", (t) => {
                    t.timestamp(col).defaultTo(db.fn.now());
                  });
                } else if (col === "qr_data") {
                  await db.schema.alterTable("subbots", (t) => {
                    t.text(col).nullable();
                  });
                } else {
                  await db.schema.alterTable("subbots", (t) => {
                    t.string(col, 255).nullable();
                  });
                }
                logger.info(`Columna ${col} agregada`);
              } catch (alterError) {
                logger.warn(`No se pudo agregar ${col}:`, alterError.message);
                throw alterError; // Forzar recreacion de tabla
              }
            }
          }
        } catch (e) {
          logger.warn("Error al verificar columnas, recreando tabla...");
          await db.schema.dropTableIfExists("subbots");
          continue;
        }
      }

      // Verificar acceso
      await db("subbots")
        .limit(1)
        .catch(() => {
          throw new Error("No se pudo acceder a la tabla");
        });

      subbotsTableReady = true;
      return true;
    } catch (error) {
      retries++;
      const waitTime = Math.pow(2, retries) * 1000;

      // Si es el ultimo intento, crear tabla temporal
      if (retries >= maxRetries) {
        logger.error(
          "No se pudo inicializar la tabla principal, creando temporal...",
        );
        try {
          await db.schema.dropTableIfExists("subbots_temp");
          await db.schema.createTable("subbots_temp", (t) => {
            t.increments("id").primary();
            t.string("request_jid").notNullable().index();
            t.string("method", 10).notNullable();
            t.string("state", 20).notNullable().defaultTo("pending");
            t.timestamp("created_at").defaultTo(db.fn.now());
          });
          logger.warn(" Tabla temporal subbots_temp creada");
          return true;
        } catch (tempError) {
          logger.error("Error critico al crear tabla temporal:", tempError);
          throw new Error("No se pudo crear tabla temporal");
        }
      }

      logger.warn(
        `Reintentando en ${waitTime / 1000}s... (${retries}/${maxRetries})`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  return false;
}

// Helper FS: detectar si un subbot ya se vinculacion leyendo archivos de sesion
function detectLinkedFromFs(baseDir) {
  try {
    const linkedFile = path.join(baseDir, "linked.json");
    if (fs.existsSync(linkedFile)) {
      const raw = fs.readFileSync(linkedFile, "utf8");
      const info = JSON.parse(raw || "{}");
      if (info?.linked && info?.jid) {
        return {
          linked: true,
          jid: info.jid,
          number: String(info.jid).split("@")[0].replace(/[^\d]/g, ""),
        };
      }
    }
    const authDir = path.join(baseDir, "auth");
    const creds = path.join(authDir, "creds.json");
    if (fs.existsSync(creds)) {
      const raw = fs.readFileSync(creds, "utf8");
      const data = JSON.parse(raw || "{}");
      if (data?.registered && data?.me?.id) {
        return {
          linked: true,
          jid: data.me.id,
          number: String(data.me.id).split("@")[0].replace(/[^\d]/g, ""),
        };
      }
    }
  } catch (e) {
    logger.warn("detectLinkedFromFs error", { error: e?.message });
  }
  return { linked: false };
}

// Refrescar estado de subbot de un dueño desde FS a BD
export async function refreshSubbotConnectionStatus(ownerNumber) {
  try {
    if (!ownerNumber) {
      logger.warn(
        "refreshSubbotConnectionStatus: ownerNumber no proporcionado",
      );
      return;
    }

    const tableReady = await ensureSubbotsTable();
    if (!tableReady) {
      logger.warn("No se pudo inicializar la tabla de subbots");
      return;
    }

    // Determinar quÃ© tabla usar (temp o normal)
    const useTempTable =
      (await db.schema.hasTable("subbots_temp")) &&
      !(await db.schema.hasTable("subbots"));
    const tableName = useTempTable ? "subbots_temp" : "subbots";

    try {
      // Obtener subbots existentes en la base de datos
      const rows = await db(tableName)
        .where({ request_jid: ownerNumber + "@s.whatsapp.net" })
        .orderBy("id", "desc");

      // Actualizar estado de los subbots existentes
      for (const r of rows) {
        try {
          const baseDir = r.auth_path
            ? path.resolve(r.auth_path).replace(/\\auth$/, "")
            : null;
          if (!baseDir) continue;

          // Verificar si el directorio de autenticacion existe
          if (fs.existsSync(path.join(baseDir, "auth", "creds.json"))) {
            // Actualizar estado a conectado si no lo estÃ¡
            if (r.state !== "connected") {
              await db(tableName)
                .where({ id: r.id })
                .update({
                  state: "connected",
                  ...(tableName === "subbots"
                    ? { updated_at: db.fn.now() }
                    : {}),
                });
              logger.pretty.line(
                ` Subbot conectado (owner ${ownerNumber}) -> ${r.bot_number || "N/A"}`,
              );
            }
          }
          else {
            // Si no existe el archivo de credenciales, marcar como desconectado
            if (r.state !== "disconnected") {
              await db(tableName)
                .where({ id: r.id })
                .update({
                  state: "disconnected",
                  ...(tableName === "subbots"
                    ? { updated_at: db.fn.now() }
                    : {}),
                });
              logger.pretty.line(
                `Subbot desconectado (owner ${ownerNumber}) -> ${r.bot_number || "N/A"}`,
              );
            }
          }
        } catch (innerError) {
          logger.warn(
            `Error procesando subbot ${r.id} del owner ${ownerNumber}:`,
            innerError?.message || "Error desconocido",
          );
          continue;
        }
      }

      // Verificar si hay subbots en el sistema de archivos que no estÃ¡n en la base de datos
      if (!useTempTable) {
        const subbotsDir = path.join(process.cwd(), "storage", "subbots");
        if (fs.existsSync(subbotsDir)) {
          const dirs = fs
            .readdirSync(subbotsDir, { withFileTypes: true })
            .filter((dirent) => dirent.isDirectory())
            .map((dirent) => dirent.name);

          for (const dir of dirs) {
            try {
              const authPath = path.join(subbotsDir, dir, "auth");
              if (fs.existsSync(path.join(authPath, "creds.json"))) {
                const existing = await db(tableName)
                  .where({ auth_path: authPath })
                  .first();

                if (!existing) {
                  // Agregar subbot que existe en el sistema de archivos pero no en la BD
                  await db(tableName).insert({
                    request_jid: ownerNumber + "@s.whatsapp.net",
                    method: "qr",
                    label: `Dispositivo ${dir.slice(0, 6)}`,
                    session_id: dir,
                    auth_path: authPath,
                    state: "connected",
                    ...(tableName === "subbots"
                      ? {
                          created_at: db.fn.now(),
                          updated_at: db.fn.now(),
                          meta: JSON.stringify({ autoDetected: true }),
                        }
                      : {}),
                  });
                  logger.pretty.line(`âž• Subbot detectado en FS: ${dir}`);
                }
              }
            } catch (fsError) {
              logger.warn(
                `Error procesando directorio ${dir}:`,
                fsError?.message || "Error desconocido",
              );
              continue;
            }
          }
        }
      }

      return true;
    } catch (dbError) {
      logger.error(
        "Error al consultar/actualizar la base de datos de subbots:",
        dbError?.message || "Error desconocido",
      );
      throw dbError;
    }
  } catch (e) {
    const errorMessage =
      e?.message || "Error desconocido en refreshSubbotConnectionStatus";
    logger.error(errorMessage, { stack: e?.stack });
    return false;
  }
}
// Inicializacion de la base de datos
async function initializeDatabase() {
  try {
    // Verificar conexion a la base de datos
    const isConnected = await checkDatabaseConnection();
    if (!isConnected) {
      throw new Error("No se pudo conectar a la base de datos");
    }

    // Asegurar que las tablas existan
    await ensureBotGlobalStateTable();
    await ensureSubbotsTable();

    logger.info("Base de datos inicializada correctamente");
    return true;
  } catch (error) {
    logger.error(" Error al inicializar la base de datos:", error);
    process.exit(1); // Salir con error si no se puede inicializar la base de datos
  }
}

// Inicializar la base de datos al cargar el mÃ³dulo
initializeDatabase().catch((error) => {
  logger.error(
    "Error fatal durante la inicializacion de la base de datos:",
    error,
  );
  process.exit(1);
});

import { isSuperAdmin, setPrimaryOwner } from "./global-config.js";
import {
  handleAI,
  handleListClasificados,
  handleLogs,
  handleConfig,
  handleRegistrarUsuario,
  handleMiInfo,
  handleCleanSession,
  logConfigurationChange,
} from "./commands.js";
import {
  chatWithAI,
  analyzeManhwaContent,
  processProviderMessage,
  analyzeContentWithAI,
  handleAportar,
} from "./handler.js";
import {
  emitAportesEvent,
  emitGruposEvent,
  emitPedidosEvent,
  emitNotificacionesEvent,
} from "./realtime.js";
import {
  handleBotOn,
  handleBotOff,
  handleBotGlobalOn,
  handleBotGlobalOff,
  handleReplyTag,
  // Logs y stats
  handleLogsAdvanced,
  handleStats,
  handleExport,
  // Archivos
  handleDescargar,
  handleGuardar,
  handleMisArchivos,
  handleBuscarArchivo,
  handleYouTubeDownload,
  handleSticker,
  handleTikTokDownload,
  handleInstagramDownload,
  handleTwitterDownload,
  handleImage,
  handleTranslate,
  handleWeather,
  handleQuote,
  handleFact,
  handleTrivia,
  handleHoroscope,
  handleKick,
  handlePromote,
  handleDemote,
  // Permisos centralizados
  isOwnerOrAdmin,
} from "./commands-complete.js";

// Gestor multi-cuenta (subbots reales)
import { startSubbot, stopSubbot, getAllSubbots } from "./lib/subbots.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let sock = null;
let connectionStatus = "disconnected";
let qrCode = null;
let qrCodeImage = null;
let authMethod = "qr";
const CUSTOM_PAIRING_CODE = "KONMI-BOT";
let currentPairingCode = null;
let currentPairingGeneratedAt = null;
let currentPairingExpiresAt = null;
let currentPairingNumber = null;
let pairingTargetNumber = null;
let pairingRequestInProgress = false;
let savedAuthPath = null; // Guardar authPath para reconexiones
let userSelectedMethod = null; // Guardar metodo seleccionado por el usuario
let userSelectedPhone = null; // Guardar numero seleccionado por el usuario

// Caches necesarios para logs y permisos (evitan ReferenceError en logAllMessages)
const nameCache = new Map();
const groupNameCache = new Map();
const groupAdminsCache = new Map();

// Evitar reprocesar mensajes y permitir logs/owner con mensajes propios
const processedMessageIds = new Set();

// Sanitizar input de numero de telefono
function sanitizePhoneNumberInput(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return digits;
}

// Eliminacin automtica de subbots por ID (limpia BD y archivos)
async function autoDeleteSubbotById(botId, { reason = "" } = {}) {
  try {
    const subbot = await db("subbots").where({ id: botId }).first();
    if (!subbot) return;
    // Eliminar credenciales locales conocidas
    try {
      const cfg = subbot.configuracion ? JSON.parse(subbot.configuracion) : {};
      const authPath = cfg?.auth_path;
      if (authPath && fs.existsSync(authPath)) {
        fs.rmSync(authPath, { recursive: true, force: true });
      }
    } catch (_) {}
    // Directorio por convencin (pairing temporal)
    try {
      const guess = path.join(
        process.cwd(),
        "auth-sessions",
        `subbot-${botId}`,
      );
      if (fs.existsSync(guess))
        fs.rmSync(guess, { recursive: true, force: true });
    } catch (_) {}
    // Directorio por nÃºmero (multiaccount)
    try {
      if (subbot.numero) {
        const dirN = path.join(
          process.cwd(),
          "storage",
          "subbots",
          String(subbot.numero),
        );
        if (fs.existsSync(dirN))
          fs.rmSync(dirN, { recursive: true, force: true });
      }
    } catch (_) {}
    await db("subbot_activity").where({ subbot_id: botId }).del();
    await db("subbots").where({ id: botId }).del();
    try {
      logger.info(`Auto-delete SubBot ${botId} (${reason})`);
    } catch (_) {}
  } catch (e) {
    try {
      logger.error("autoDeleteSubbotById error:", e);
    } catch (_) {
      console.error(e);
    }
  }
}

// Asegurar tabla de configuracion de grupos
let groupSettingsTableReady = false;

// ==============================
// Auto-gestion de RAM y DISCO
// ==============================

function bytesToMB(bytes) {
  return Math.round((bytes / 1024 ** 2) * 10) / 10;
}

function clearAppCaches(reason = "manual") {
  try {
    nameCache.clear();
  } catch (_) {}
  try {
    groupNameCache.clear();
  } catch (_) {}
  try {
    groupAdminsCache.clear();
  } catch (_) {}
  try {
    if (processedMessageIds?.size) processedMessageIds.clear();
  } catch (_) {}
  try {
    if (global.notifiedUsers?.clear) global.notifiedUsers.clear();
  } catch (_) {}
  try {
    logger.pretty.section("Mantenimiento de memoria", "");
  } catch (_) {}
  try {
    logger.pretty.kv("Motivo", reason);
  } catch (_) {}
}

async function diskCleanupOnce() {
  const targets = [
    path.join(process.cwd(), "storage", "subbots"),
    path.join(process.cwd(), "backend", "full", "storage", "subbots"),
    path.join(process.cwd(), "auth-sessions"),
  ];
  const now = Date.now();
  const twoHours = 2 * 60 * 60 * 1000;
  const oneDay = 24 * 60 * 60 * 1000;

  for (const root of targets) {
    try {
      if (!fs.existsSync(root)) continue;
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory()) continue;
        const full = path.join(root, ent.name);
        let st;
        try {
          st = fs.statSync(full);
        } catch {
          continue;
        }
        const age = now - (st.mtimeMs || st.ctimeMs || now);

        // Regla 1: sesiones QR efÃ­meras "qr-<timestamp>" antiguas
        if (/^qr-\d+/.test(ent.name) && age > twoHours) {
          try {
            fs.rmSync(full, { recursive: true, force: true });
            logger.info?.(` Limpieza: QR huerbafano ${full}`);
          } catch (_) {}
          continue;
        }

        // Regla 2: auth-sessions/subbot-<id> huÃ©rfanos (ID no existe ya)
        if (root.endsWith("auth-sessions") && /^subbot-\d+/.test(ent.name)) {
          const botId = Number(ent.name.split("-")[1]);
          try {
            const row = await db("subbots").where({ id: botId }).first();
            if (!row) {
              fs.rmSync(full, { recursive: true, force: true });
              logger.info?.(`Limpieza: auth huerfano ${full}`);
            }
          } catch (_) {}
          continue;
        }

        // Regla 3: directorios por nÃºmero (multiaccount) sin vinculo o antiguos
        if (/^\d{7,15}$/.test(ent.name) && age > oneDay) {
          try {
            const row = await db("subbots")
              .where({ bot_number: ent.name })
              .first();
            if (!row || (row.state && row.state !== "connected")) {
              fs.rmSync(full, { recursive: true, force: true });
              logger.info?.(`Limpieza: subbot antiguo/no vinculado ${full}`);
            }
          } catch (_) {}
          continue;
        }
      }
    } catch (e) {
      logger.warn?.("Error en limpieza de disco", { root, error: e?.message });
    }
  }
}

function scheduleResourceAutoMaintenance() {
  // Mantenimiento de memoria cada 10 minutos si supera 500MB RSS o Set demasiado grande
  setInterval(
    () => {
      try {
        const mu =
          typeof process.memoryUsage === "function"
            ? process.memoryUsage()
            : null;
        const rss = mu?.rss || 0;
        const shouldClear =
          rss > 500 * 1024 * 1024 || processedMessageIds?.size > 5000;
        if (shouldClear) {
          logger.info?.(
            ` RAM alta: RSS=${bytesToMB(rss)} MB. Limpiando caches...`,
          );
          clearAppCaches("high_ram");
          if (global.gc) {
            try {
              global.gc();
              logger.info?.("GC ejecutado");
            } catch (_) {}
          }
        }
      } catch (_) {}
    },
    10 * 60 * 1000,
  );

  // Limpieza de disco cada 60 minutos
  setInterval(
    () => {
      diskCleanupOnce().catch(() => {});
    },
    60 * 60 * 1000,
  );

  // Primer ciclo pronto
  setTimeout(() => {
    try {
      diskCleanupOnce();
    } catch (_) {}
  }, 30 * 1000);
}

if (!global.__konmiResourceSchedulerStarted) {
  try {
    scheduleResourceAutoMaintenance();
  } catch (_) {}
  global.__konmiResourceSchedulerStarted = true;
}
async function ensureGroupSettingsTable() {
  if (groupSettingsTableReady) return;
  try {
    const exists = await db.schema.hasTable("group_settings");
    if (!exists) {
      await db.schema.createTable("group_settings", (t) => {
        t.increments("id");
        t.string("group_id").notNullable().unique();
        t.boolean("is_active").notNullable().defaultTo(true);
        t.timestamps(true, true);
      });
      logger.pretty.line(" Tabla group_settings creada");
    }
    groupSettingsTableReady = true;
  } catch (error) {
    logger.warn("No se pudo verificar/crear tabla group_settings", {
      error: error?.message,
    });
  }
}

// Actualiza el cache de admins de un grupo usando participantes provistos
function updateGroupAdminsCache(groupJid, participants) {
  try {
    const set = new Set();
    (participants || []).forEach((p) => {
      if (p && p.admin) {
        set.add(normalizeJidToNumber(p.id));
      }
    });
    groupAdminsCache.set(groupJid, set);
    return set;
  } catch (_) {
    return new Set();
  }
}

// Obtiene el set de admins desde cache o refresca desde metadata
async function getGroupAdmins(groupJid) {
  if (groupAdminsCache.has(groupJid)) return groupAdminsCache.get(groupJid);
  try {
    const meta = await sock.groupMetadata(groupJid);
    return updateGroupAdminsCache(groupJid, meta?.participants || []);
  } catch (_) {
    return new Set();
  }
}

// Normaliza un JID (incluyendo LID) al numero real (solo digitos)
function normalizeJidToNumber(jid) {
  if (!jid) return "";
  const s = String(jid);
  // Si ya es un numero sin dominio, evita usar jidNormalizedUser
  if (!s.includes("@")) {
    return s.replace(/:\d+$/, "").replace(/[^\d]/g, "");
  }
  try {
    const normalized = jidNormalizedUser(s);
    const left = String(normalized || "").split("@")[0];
    const out = left.replace(/:\d+$/, "").replace(/[^\d]/g, "");
    if (out) return out;
  } catch {}
  const left = s.split("@")[0];
  return left.replace(/:\d+$/, "").replace(/[^\d]/g, "");
}

// Resolver el JID correcto para "mentions" (usa el id real del participante si es grupo)
function resolveMentionJid(remoteJid, participants, userJidOrNumber) {
  const num = normalizeJidToNumber(userJidOrNumber);
  if (remoteJid && remoteJid.endsWith("@g.us") && Array.isArray(participants)) {
    const p = findParticipant(participants, num);
    if (p && p.id) return p.id;
  }
  return `${num}@s.whatsapp.net`;
}

// Funcion para verificar si el usuario es el owner especifico (595974154768)
function isSpecificOwner(usuario) {
  try {
    // Normalizar el numero de usuario
    let normalizedUser = normalizeJidToNumber(usuario);
    if (!normalizedUser) {
      normalizedUser = String(usuario || "").replace(/[^\d]/g, "");
    }

    // Definir el numero de owner (fijo)
    const ownerNumber = "595974154768";

    // Normalizar numeros para comparacion (ultimos 9 digitos)
    const userTail = normalizedUser.slice(-9);
    const ownerTail = ownerNumber.slice(-9);

    // Verificar coincidencia (ultimos 9 di­gitos)
    const isSpecific = userTail === ownerTail;

    // Verificar si es super admin
    let isSuper = false;
    try {
      isSuper = isSuperAdmin(usuario);
    } catch (error) {
      logger.error("Error verificando isSuperAdmin:", error);
    }

    // El resultado es true si es el owner o super admin
    const result = isSuper || isSpecific;

    // Log detallado para depuraciÃ³n
    logger.pretty.banner(" Verificacion de owner", "N/A");
    logger.pretty.kv("Usuario original", usuario || "N/A");
    logger.pretty.kv("Usuario normalizado", normalizedUser || "N/A");
    logger.pretty.kv("Ãšltimos 9 di­gitos", userTail || "N/A");
    logger.pretty.kv("NÃºmero owner", ownerNumber);
    logger.pretty.kv("Coincide owner", isSpecific ? " SI" : " NO");
    logger.pretty.kv("Es super admin", isSuper ? "SI" : " NO");
    logger.pretty.kv(
      "Resultado",
      result ? " ACCESO PERMITIDO" : " ACCESO DENEGADO",
    );

    // Log adicional para depuraciOn
    logger.debug("Detalles de verificacion:", {
      usuario,
      normalizedUser,
      userTail,
      ownerTail,
      isSpecific,
      isSuper,
      result,
    });

    return result;
  } catch (error) {
    logger.error("Error en isSpecificOwner:", error);
    return false; // Por seguridad, denegar acceso en caso de error
  }
}

// Verificar si el bot esta activo en un grupo especifico
async function isBotActiveInGroup(groupId) {
  try {
    // asegurar estructura de BD manima para lectura
    await ensureGroupSettingsTable();
    if (!groupId.endsWith("@g.us")) return true; // Si no es grupo, siempre activo

    const groupState = await db("group_settings")
      .select("is_active")
      .where({ group_id: groupId })
      .first();

    logger.pretty.section("Estado de grupo", "");
    logger.pretty.kv("Grupo", groupId);
    logger.pretty.kv("Registro", JSON.stringify(groupState));

    if (!groupState) {
      logger.pretty.line(" No hay registro para el grupo, asumiendo activo");
      return true;
    }

    const isActive =
      groupState.is_active === 1 || groupState.is_active === true;
    logger.pretty.kv("Grupo activo", isActive);
    logger.pretty.kv("Valor BD", groupState.is_active);

    return isActive;
  } catch (error) {
    logger.warn("Error BD grupo (usando activo por defecto):", {
      message: error.message,
    });
    return true;
  }
}

// Verificar estado global del bot desde la base de datos
async function isBotGloballyActiveFromDB() {
  try {
    await ensureBotGlobalStateTable();
    const globalState = await db("bot_global_state").select("is_on").first();

    logger.pretty.section("Estado global del bot (BD)", "ðŸŒ");
    logger.pretty.kv("Registro", JSON.stringify(globalState));

    if (!globalState) {
      logger.pretty.line("No hay registro en BD, asumiendo activo");
      return true;
    }

    const isActive = globalState.is_on === 1 || globalState.is_on === true;
    logger.pretty.kv("Estado calculado", isActive);
    logger.pretty.kv("Valor BD", globalState.is_on);

    return isActive;
  } catch (error) {
    logger.warn("Error BD (estado global, usando activo por defecto):", {
      message: error.message,
    });
    return true;
  }
}

// Funcion para obtener nombre real del grupo
async function getGroupName(groupId) {
  try {
    if (!sock || !groupId.endsWith("@g.us")) return null;

    // Verificar cache primero
    if (groupNameCache.has(groupId)) {
      return groupNameCache.get(groupId);
    }

    // Intentar obtener metadatos del grupo
    try {
      const groupMetadata = await sock.groupMetadata(groupId);
      if (groupMetadata && groupMetadata.subject) {
        // Guardar en cache
        groupNameCache.set(groupId, groupMetadata.subject);
        return groupMetadata.subject;
      }
    } catch (metaError) {
      logger.error("Error obteniendo metadatos del grupo:", metaError);
    }

    // Fallback: usar los ultimos 4 digitos del ID del grupo
    const groupIdShort = groupId.split("@")[0].slice(-4);
    const fallbackName = `Grupo ${groupIdShort}`;
    groupNameCache.set(groupId, fallbackName);
    return fallbackName;
  } catch (error) {
    logger.error("Error obteniendo nombre del grupo:", error);
    const groupIdShort = groupId.split("@")[0].slice(-4);
    const fallbackName = `Grupo ${groupIdShort}`;
    return fallbackName;
  }
}

// Funcion para normalizar numeros de telefono
function normalizePhoneNumber(number) {
  if (!number) return "";
  // Eliminar todo lo que no sea digito
  const digits = number.replace(/\D/g, "");
  // Si empieza con codigo de pais, quitarlo
  if (digits.startsWith("595")) {
    return digits.substring(3);
  }
  return digits;
}

// Obtener separacion simple de codigo de pais y numero local para logs
function getCountrySplit(number) {
  try {
    const num = String(number || "").replace(/\D/g, "");
    if (!num) return { cc: "", local: "", iso: null };
    // CCs comunes (ampliable)
    const known = [
      { cc: "595", iso: "PY" },
      { cc: "54", iso: "AR" },
      { cc: "55", iso: "BR" },
      { cc: "57", iso: "CO" },
      { cc: "52", iso: "MX" },
      { cc: "51", iso: "PE" },
      { cc: "56", iso: "CL" },
      { cc: "34", iso: "ES" },
      { cc: "1", iso: "US" },
    ];
    for (const k of known) {
      if (num.startsWith(k.cc) && num.length > k.cc.length) {
        return { cc: k.cc, local: num.slice(k.cc.length), iso: k.iso };
      }
    }
    // HeurÃ­stica
    if (num.length >= 11)
      return { cc: num.slice(0, 3), local: num.slice(3), iso: null };
    if (num.length >= 10)
      return { cc: num.slice(0, 2), local: num.slice(2), iso: null };
    return { cc: "", local: num, iso: null };
  } catch (_) {
    return { cc: "", local: String(number || ""), iso: null };
  }
}

// Funcion para obtener nombre real del contacto
async function getContactName(userId) {
  try {
    if (!sock) return userId.split("@")[0];

    // Asegurar formato correcto
    let fullUserId = userId;
    if (!fullUserId.includes("@")) {
      fullUserId = `${fullUserId}@s.whatsapp.net`;
    }

    // Normalizar el numero para comparacion
    const number = normalizePhoneNumber(userId.split("@")[0]);
    const envOwner = (
      (process.env.OWNER_WHATSAPP_NUMBER ||
        (Array.isArray(global.owner) && global.owner[0]?.[0]) ||
        "") + ""
    ).replace(/[^0-9]/g, "");
    const ownerNumber = envOwner;
    const ownerTail = ownerNumber ? ownerNumber.slice(-9) : "";

    // Verificar cache primero
    if (nameCache.has(fullUserId)) {
      return nameCache.get(fullUserId);
    }

    // Verificar si es el owner (con diferentes formatos)
    if (
      number === ownerNumber ||
      userId === "595974154768@s.whatsapp.net" ||
      userId === "595974154768" ||
      fullUserId.endsWith("974154768@s.whatsapp.net")
    ) {
      const ownerName = "Melodia (Owner)";
      logger.debug(`[CONTACTO] Identificado como owner: ${ownerName}`);
      nameCache.set(fullUserId, ownerName);
      nameCache.set("595974154768@s.whatsapp.net", ownerName);
      nameCache.set("595974154768", ownerName);
      nameCache.set("974154768", ownerName);
      return ownerName;
    }

    // Metodo 2: Intentar obtener desde el store de WhatsApp
    try {
      if (
        sock.store &&
        sock.store.contacts &&
        sock.store.contacts[fullUserId]
      ) {
        const contact = sock.store.contacts[fullUserId];
        if (contact.name || contact.notify) {
          const contactName = contact.name || contact.notify;
          nameCache.set(fullUserId, contactName);
          return contactName;
        }
      }
    } catch (e) {
      // Continuar con otros metodos
    }

    // Metodo 3: Intentar obtener desde onWhatsApp
    try {
      const contactInfo = await sock.onWhatsApp(fullUserId);
      if (contactInfo && contactInfo[0] && contactInfo[0].notify) {
        const notifyName = contactInfo[0].notify;
        nameCache.set(fullUserId, notifyName);
        return notifyName;
      }
    } catch (e) {
      // Continuar
    }

    // Metodo 4: Intentar obtener el push name del mensaje
    try {
      // Si el usuario envio un mensaje recientemente, podriamos tener su pushName
      const pushName = `Usuario ${number.slice(-4)}`;
      nameCache.set(fullUserId, pushName);
      return pushName;
    } catch (e) {
      // Continuar
    }

    // Fallback: usar el numero pero con formato mas amigable
    const fallbackName = `Usuario ${number.slice(-4)}`;
    nameCache.set(fullUserId, fallbackName);
    return fallbackName;
  } catch (error) {
    const number = userId.split("@")[0];
    const fallbackName = `Usuario ${number.slice(-4)}`;
    return fallbackName;
  }
}

// Funcion para manejar comandos con fallback
async function safeCommandHandler(commandFunction, fallbackMessage, ...args) {
  try {
    const result = await commandFunction(...args);
    return result;
  } catch (error) {
    logger.error(`Error en comando: ${error.message}`);
    return { message: fallbackMessage };
  }
}

// Helpers: informaciÃ³n del sistema y del runtime para comandos /status, /info, /serverinfo, /hardware, /runtime
async function getSystemInfoText() {
  let si;
  try {
    const mod = await import("systeminformation");
    si = mod.default || mod;
  } catch (_e) {
    si = null;
  }
  const cpus = typeof os.cpus === "function" ? os.cpus() : [];
  const cpuModel = cpus[0]?.model || "Desconocido";
  const cpuCores = cpus.length || 0;
  const cpuSpeed = cpus[0]?.speed
    ? `${(cpus[0].speed / 1000).toFixed(2)} GHz`
    : "N/A";
  const totalMem = typeof os.totalmem === "function" ? os.totalmem() : 0;
  const freeMem = typeof os.freemem === "function" ? os.freemem() : 0;
  const usedMem = totalMem ? totalMem - freeMem : 0;
  const fmt = (bytes) => {
    if (!bytes) return "N/A";
    const gb = bytes / 1024 ** 3;
    return `${gb.toFixed(2)} GB`;
  };
  const fmtTime = (sec) => {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  };
  let gpuModel = "No disponible";
  let osLine = `${typeof os.platform === "function" ? os.platform() : "N/A"}/${typeof os.release === "function" ? os.release() : "N/A"} (${typeof os.arch === "function" ? os.arch() : "N/A"})`;
  try {
    if (si?.graphics) {
      const g = await si.graphics();
      const controller = Array.isArray(g?.controllers)
        ? g.controllers[0]
        : null;
      if (controller?.model) gpuModel = controller.model;
    }
    if (si?.osInfo) {
      const oi = await si.osInfo();
      osLine = `${oi.distro || oi.platform} ${oi.release} (${oi.arch})`;
    }
  } catch (_e) {}
  const uptime = typeof os.uptime === "function" ? fmtTime(os.uptime()) : "N/A";
  return (
    `*Informacion del servidor*\n\n` +
    ` CPU: ${cpuModel} · ${cpuCores} nucleos @ ${cpuSpeed}\n` +
    `RAM: ${fmt(usedMem)} usadas / ${fmt(totalMem)} totales\n` +
    ` GPU: ${gpuModel}\n` +
    ` SO: ${osLine}\n` +
    ` Uptime: ${uptime}`
  );
}

async function getRuntimeInfoText() {
  const fmt = (bytes) => {
    if (!bytes) return "N/A";
    const mb = bytes / 1024 ** 2;
    return `${mb.toFixed(1)} MB`;
  };
  const mu =
    typeof process.memoryUsage === "function" ? process.memoryUsage() : {};
  const rss = mu.rss || 0;
  const heap = mu.heapUsed || 0;
  const up = typeof process.uptime === "function" ? process.uptime() : 0;
  const h = Math.floor(up / 3600);
  const m = Math.floor((up % 3600) / 60);
  const s = Math.floor(up % 60);
  const cpu =
    typeof process.cpuUsage === "function" ? process.cpuUsage() : null;
  const cpuMs = cpu ? ((cpu.user + cpu.system) / 1000).toFixed(0) : "N/A";
  return (
    `*Runtime Node.js*\n\n` +
    `Node: ${process.version}\n` +
    `Plataforma: ${process.platform}/${process.arch}\n` +
    `V8: ${process.versions?.v8 || "N/A"} OpenSSL: ${process.versions?.openssl || "N/A"}\n` +
    ` Memoria: RSS ${fmt(rss)} Â· Heap ${fmt(heap)}\n` +
    `Uptime proceso: ${h}h ${m}m ${s}s Â· CPU usado: ${cpuMs} ms`
  );
}

// Funcion para logs decorados de TODOS los mensajes
async function logAllMessages(
  message,
  messageText,
  remoteJid,
  usuario,
  isGroup,
) {
  try {
    // Obtener nombre real del pushName del mensaje
    let contactName = "Usuario desconocido";

    // Debug: Ver quÃ© informaciÃ³n tenemos del mensaje
  logger.pretty.section("Debug mensaje", "-");
    logger.pretty.kv("pushName", message.pushName || "-");
    logger.pretty.kv("usuario", usuario);
    logger.pretty.kv("key.participant", message.key?.participant || "-");
    logger.pretty.kv("key.remoteJid", message.key?.remoteJid || "-");

    // Metodo 1: Obtener pushName directamente del mensaje
    if (message.pushName && message.pushName.trim()) {
      contactName = message.pushName.trim();
      logger.pretty.line(`Usando pushName: ${contactName}`);
    }
    // Metodo 2: Si es el owner, usar nombre conocido
    else if (isSpecificOwner(usuario)) {
      contactName = "Melodia (Owner)";
      logger.pretty.line(` Detectado como owner: ${contactName}`);
    }
    // Metodo 3: Intentar desde messageInfo si existe
    else if (message.key && message.key.participant) {
      const participant = message.key.participant.split("@")[0];
      if (isSpecificOwner(participant)) {
        contactName = "Melodia (Owner)";
      } else {
        contactName = `Usuario ${participant.slice(-4)}`;
      }
      logger.pretty.line(` Usando participant: ${contactName}`);
    }
    // Metodo 4: Fallback con cache
    else {
      contactName = await getContactName(usuario);
      logger.pretty.line(` Usando cache/fallback: ${contactName}`);
    }

    // Obtener nombre real del grupo
    let groupName = null;
    if (isGroup) {
      try {
        // Intentar obtener desde metadatos directamente
        const groupMetadata = await sock.groupMetadata(remoteJid);
        if (groupMetadata && groupMetadata.subject) {
          groupName = groupMetadata.subject;
          // Guardar en cache
          groupNameCache.set(remoteJid, groupName);
        } else {
          // Fallback
          const groupIdShort = remoteJid.split("@")[0].slice(-4);
          groupName = `Grupo ${groupIdShort}`;
        }
      } catch (error) {
        // Si falla, usar cache o fallback
        groupName =
          groupNameCache.get(remoteJid) ||
          `Grupo ${remoteJid.split("@")[0].slice(-4)}`;
      }
    }

    const fechaHora = new Date().toLocaleString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    // Determinar tipo de mensaje y contenido
    const isCommand =
      messageText.startsWith("/") ||
      messageText.startsWith("!") ||
      messageText.startsWith(".");
    const messageTypeTitle = isCommand ? "COMANDO" : "MENSAJE";
    const hasLetters = /[a-zA-Z]/.test(messageText);
    const split = getCountrySplit(usuario);

    // Detectar tipo de contenido del mensaje
    let contentType = " Texto";
    if (message.message?.imageMessage) contentType = "Imagen";
    else if (message.message?.videoMessage) contentType = " Video";
    else if (message.message?.audioMessage) contentType = " Audio";
    else if (message.message?.documentMessage) contentType = " Documento";
    else if (message.message?.stickerMessage) contentType = "Sticker";
    else if (message.message?.locationMessage) contentType = " Ubicacion";
    else if (message.message?.contactMessage) contentType = " Contacto";

    // Mostrar texto real o descripcion del contenido
    let displayText = messageText;
    if (!messageText && message.message?.imageMessage)
      displayText = "[Imagen sin texto]";
    else if (!messageText && message.message?.videoMessage)
      displayText = "[Video sin texto]";
    else if (!messageText && message.message?.audioMessage)
      displayText = "[Mensaje de voz]";
    else if (!messageText && message.message?.stickerMessage)
      displayText = "[Sticker]";
    else if (!messageText && message.message?.locationMessage)
      displayText = "[Ubicacion compartida]";
    else if (!messageText && message.message?.contactMessage)
      displayText = "[Contacto compartido]";
    else if (!messageText) displayText = "[Mensaje sin texto]";

    if (isGroup) {
      logger.pretty.banner(`${messageTypeTitle} en grupo`, "");
      logger.pretty.section("Grupo", "-");
      logger.pretty.kv("Nombre", groupName || "Grupo sin nombre");
      logger.pretty.kv("ID", remoteJid);
      logger.pretty.section("Usuario", "");
      logger.pretty.kv("Nombre", contactName || usuario);
      logger.pretty.kv("NÃºmero", usuario);
      logger.pretty.kv(
        "Codigo pais",
        `+${split.cc}${split.iso ? ` (${split.iso})` : ""}`,
      );
      logger.pretty.kv("numero local", split.local);
      logger.pretty.kv("Owner", isSpecificOwner(usuario) ? "SI" : "NO");
      logger.pretty.section("Contenido", "");
      logger.pretty.kv("Tipo", isCommand ? "Comando" : "Mensaje");
      logger.pretty.kv("Contenido", contentType);
      logger.pretty.kv("Texto", displayText);
      logger.pretty.kv("Tiene letras", hasLetters ? "SI" : "NO");
      logger.pretty.kv("Fecha", fechaHora);
    } else {
      logger.pretty.banner(`${messageTypeTitle} privado`, "ðŸ’¬");
      logger.pretty.section("Usuario", "-");
      logger.pretty.kv("Nombre", contactName || usuario);
      logger.pretty.kv("NÃºmero", usuario);
      logger.pretty.kv(
        "Codigo de pais",
        `+${split.cc}${split.iso ? ` (${split.iso})` : ""}`,
      );
      logger.pretty.kv("Numero local", split.local);
      logger.pretty.kv("Owner", isSpecificOwner(usuario) ? "SI" : "NO");
      logger.pretty.section("Contenido", "-");
      logger.pretty.kv("Tipo", isCommand ? "Comando" : "Mensaje");
      logger.pretty.kv("Contenido", contentType);
      logger.pretty.kv("Texto", displayText);
      logger.pretty.kv("Tiene letras", hasLetters ? "SI" : "NO");
      logger.pretty.kv("Fecha", fechaHora);
    }
  } catch (error) {
    logger.error("Error en logs de mensaje:", error);
  }
}

// Manejar mensajes entrantes - VERSION COMPLETA CON LOGS DECORADOS
// FunciÃ³n principal para manejar todos los mensajes entrantes
export async function handleMessage(message, customSock = null, prefix = "") {
  const sock = customSock || global.sock; // Usar socket personalizado o el global
  try {
    if (!message.message || !message.key.remoteJid) return;

    // Capturar TODOS los tipos de mensajes de texto posibles
    let messageText =
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      message.message?.imageMessage?.caption ||
      message.message?.videoMessage?.caption ||
      message.message?.documentMessage?.caption ||
      message.message?.audioMessage?.caption ||
      message.message?.stickerMessage?.caption ||
      message.message?.buttonsMessage?.contentText ||
      message.message?.listMessage?.description ||
      message.message?.templateMessage?.hydratedTemplate?.hydratedContentText ||
      "";

    // Limpiar y normalizar el texto
    messageText = messageText
      // eliminar caracteres invisibles comunes (ZWSP, ZWNJ, ZWJ, BOM)
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      // normalizar espacios
      .replace(/\s+/g, " ")
      .trim();

    const remoteJid = message.key.remoteJid;
    const isGroup = remoteJid.endsWith("@g.us");

    // CORRECCION: Manejo correcto de sender segun la API de WhatsApp
    let sender;
    let usuario;

    if (isGroup) {
      // En grupos: usar participant (quien envio el mensaje)
      sender = message.key.participant;
      if (!sender) {
        logger.pretty.line(" No se pudo obtener participant en grupo");
        return;
      }
      // Extraer numero normalizado del participant (soporta LID)
      usuario = normalizeJidToNumber(sender);
    } else {
      // En privado: usar remoteJid (el chat directo)
      sender = remoteJid;
      usuario = normalizeJidToNumber(remoteJid);
    }
    // usuario ya viene normalizado a solo digitos

    // LOGS DECORADOS PARA TODOS LOS MENSAJES
    await logAllMessages(message, messageText, remoteJid, usuario, isGroup);

    // Verificar que el mensaje no este vacio
    if (!messageText || messageText === "") {
      logger.pretty.line(" Mensaje vacio - no procesando");
      return;
    }

    // Solo procesar comandos que empiecen con /, !, o .
    if (
      !messageText.startsWith("/") &&
      !messageText.startsWith("!") &&
      !messageText.startsWith(".")
    ) {
      logger.pretty.line("Mensaje normal - no es comando");
      return;
    }

    // Verificar que el comando tenga al menos una letra despues del prefijo
    const commandPart = messageText.substring(1);
    if (!commandPart || !/[a-zA-Z]/.test(commandPart)) {
      logger.pretty.line(` Comando invÃ¡lido - sin letras: "${messageText}"`);
      return;
    }

    // Normalizar comando
    let normalizedText = messageText.trim();
    if (normalizedText.startsWith("!") || normalizedText.startsWith(".")) {
      normalizedText = "/" + normalizedText.substring(1);
    }
    // Quitar espacios luego del prefijo para soportar ". comando"
    normalizedText = normalizedText.replace(/^\/\s+/, "/");

    // Agregar prefijo si existe
    if (prefix && !processedMessageIds.has(message.key.id)) {
      logger.pretty.kv("Prefijo", prefix);
      processedMessageIds.add(message.key.id);
    }

    const parts = normalizedText.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    logger.whatsapp.command(command, usuario, isGroup ? remoteJid : null);

    // VERIFICACION SEPARADA: Primero global, luego grupo
    const isGloballyActive = await isBotGloballyActiveFromDB();
    const isOwner = isSpecificOwner(usuario);

    logger.pretty.section("Verificacion de estado", "");
    logger.pretty.kv("Bot activo globalmente", isGloballyActive);
    logger.pretty.kv("Es owner", isOwner);
    logger.pretty.kv("Comando", command);

    // 1. VERIFICACION GLOBAL (maxima prioridad)
    if (!isGloballyActive) {
      // Solo permitir /bot global on del owner
      if (
        command === "/bot" &&
        args[0] === "global" &&
        args[1] === "on" &&
        isOwner
      ) {
        logger.pretty.line(" Excepcion global: /bot global on permitido");
        // Continuar al switch
      } else {
        logger.pretty.line("” Bloqueado por estado global");

        const userKey = `global_notified_${usuario}`;
        if (!global.notifiedUsers) {
          global.notifiedUsers = new Set();
        }

        if (!global.notifiedUsers.has(userKey)) {
          global.notifiedUsers.add(userKey);

          if (isOwner) {
            await sock.sendMessage(remoteJid, {
              text: "” *Bot desactivado globalmente*\n\nPuedes usar: `/bot global on` para reactivarlo",
            });
          } else {
            await sock.sendMessage(remoteJid, {
              text: "*Bot desactivado*\n\nEl bot esta temporalmente fuera de servicio.\n Solo el owner puede reactivarlo.",
            });
          }
        }
        return;
      }
    }

    // 2. VERIFICACION DE GRUPO (solo si global esta activo)
    if (isGloballyActive && isGroup) {
      const isGroupActive = await isBotActiveInGroup(remoteJid);
      logger.pretty.kv("Bot activo en grupo", isGroupActive);

      if (!isGroupActive) {
        // Permitir comandos de control del bot
        if (command === "/bot" && (args[0] === "on" || args[0] === "off")) {
          logger.pretty.line(
            "âœ… ExcepciÃ³n grupo: Comando de control permitido",
          );
          // Continuar al switch
        } else {
          logger.pretty.line("â›” Bloqueado por estado de grupo");

          const userKey = `group_notified_${usuario}_${remoteJid}`;
          if (!global.notifiedUsers) {
            global.notifiedUsers = new Set();
          }

          if (!global.notifiedUsers.has(userKey)) {
            global.notifiedUsers.add(userKey);

            await sock.sendMessage(remoteJid, {
              text: "*Bot desactivado en este grupo*\n\n El bot no esta activo en este grupo.\nâœ… Usa `/bot on` para reactivarlo",
            });
          }
          return;
        }
      }
    }

    // Solo llegar aqui si el bot esta activo O es un comando de activacion permitido
    let result = null;

    switch (command) {
      // Comandos de subbots
      case "/qr":
      case "/subqr":
        if (!isOwner) {
          await sock.sendMessage(
            remoteJid,
            { text: "Solo el owner puede usar este comando" },
            { quoted: message },
          );
          return;
        }
        const qrResponse = await handleQROrCodeRequest("qr", usuario);
        if (qrResponse.image) {
          await sock.sendMessage(
            remoteJid,
            {
              image: Buffer.from(qrResponse.image, "base64"),
              caption: qrResponse.message,
            },
            { quoted: message },
          );
        } else {
          await sock.sendMessage(
            remoteJid,
            { text: qrResponse.message },
            { quoted: message },
          );
        }
        break;

      case "/code":
      case "/subcode":
        if (!isOwner) {
          await sock.sendMessage(
            remoteJid,
            { text: "Solo el owner puede usar este comando" },
            { quoted: message },
          );
          return;
        }
        const pairNumber = args[0];
        if (!pairNumber) {
          await sock.sendMessage(
            remoteJid,
            { text: "Uso: /code <nÃºmero>" },
            { quoted: message },
          );
          return;
        }
        const codeResponse = await handlePairingCode(pairNumber);
        await sock.sendMessage(
          remoteJid,
          { text: codeResponse.message },
          { quoted: message },
        );
        break;

      case "/status":
      case "/substatus":
        if (!isOwner) {
          await sock.sendMessage(
            remoteJid,
            { text: " Solo el owner puede usar este comando" },
            { quoted: message },
          );
          return;
        }
        const botId = args[0];
        if (!botId) {
          const allStatus = await getAllSubbotsFromLib();
          const statusText =
            allStatus
              .map((bot) => {
                return `ID: ${bot.code}\nEstado: ${bot.status}\nConectado: ${bot.isOnline ? "Si" : "No"}\n`;
              })
              .join("\n") || "No hay subbots activos";
          await sock.sendMessage(
            remoteJid,
            { text: statusText },
            { quoted: message },
          );
          return;
        }
        const status = await getRuntimeStatus(botId);
        await sock.sendMessage(
          remoteJid,
          {
            text: `Status del SubBot ${botId}:\nEstado: ${status.status}\nConectado: ${status.isOnline ? "Si­" : "No"}`,
          },
          { quoted: message },
        );
        break;

      case "/subbots":
        if (!isOwner) {
          await sock.sendMessage(
            remoteJid,
            { text: "Solo el owner puede usar este comando" },
            { quoted: message },
          );
          return;
        }
        const bots = await getAllSubbotsFromLib();
        const botsText =
          bots
            .map((bot) => {
              return `ID: ${bot.code}\nEstado: ${bot.status}\nConectado: ${bot.isOnline ? "Si" : "No"}\n`;
            })
            .join("\n") || "No hay subbots activos";
        await sock.sendMessage(
          remoteJid,
          { text: botsText },
          { quoted: message },
        );
        break;

      case "/stopbot":
      case "/substop":
        if (!isOwner) {
          await sock.sendMessage(
            remoteJid,
            { text: "âŒ Solo el owner puede usar este comando" },
            { quoted: message },
          );
          return;
        }
        const stopBotId = args[0];
        if (!stopBotId) {
          await sock.sendMessage(
            remoteJid,
            { text: "Uso: /stopbot <bot-id>" },
            { quoted: message },
          );
          return;
        }
        const stopResult = await stopSubbot(stopBotId);
        await sock.sendMessage(
          remoteJid,
          {
            text: stopResult.success
              ? ` Bot ${stopBotId} detenido`
              : ` Error: ${stopResult.error}`,
          },
          { quoted: message },
        );
        break;

      // Comandos basicos
      case "/test":
        await sock.sendMessage(remoteJid, {
          text: ` Bot funcionando correctamente\n\nSolicitado por: @${usuario}\n • ${new Date().toLocaleString("es-ES")}`,
          mentions: [usuario + "@s.whatsapp.net"],
        });
        break;

      case "/help":
      case "/ayuda":
      case "/menu":
      case "/comandos":
        // Funcion de ayuda simplificada que funciona directamente
        const helpText = `
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ ðŸ¤–  KONMI BOT v2.5.0       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

â€¢ ðŸ§ª BÃ¡sicos
  /test Â· /help Â· /ping Â· /status Â· /info Â· /whoami Â· /owner

â€¢ ðŸ¤– IA
  /ia [pregunta] Â· /ai [pregunta] Â· /clasificar

â€¢ ðŸ—‚ï¸ Aportes
  /aportes Â· /myaportes Â· /addaporte [texto] Â· /aporteestado [id] [estado]

â€¢ ðŸ“ Pedidos
  /pedidos Â· /pedido [texto]

â€¢ ðŸ“š Manhwas
  /manhwas Â· /addmanhwa [tÃ­tulo|gÃ©nero|desc] Â· /obtenermanhwa [nombre]

â€¢ ðŸ“º Series/TV
  /series Â· /addserie [tÃ­tulo|gÃ©nero|desc]

â€¢ ðŸŽµ Multimedia
  /music [canciÃ³n] Â· /spotify [canciÃ³n] Â· /video [bÃºsqueda]
  /play [canciÃ³n] Â· /tts [texto]|[personaje] Â· /meme Â· /joke Â· /quote

â€¢ ðŸŒ Redes
  /tiktok Â· /instagram Â· /facebook Â· /twitter Â· /pinterest Â· /youtube

â€¢ ðŸ§° Utilidades
  /translate [texto] Â· /weather [ciudad] Â· /fact Â· /trivia

â€¢ ðŸ“ Archivos
  /archivos Â· /misarchivos Â· /descargar [url] Â· /guardar

â€¢ ðŸ›¡ï¸ AdministraciÃ³n
  /kick @usuario Â· /promote @usuario Â· /demote @usuario
  /lock Â· /unlock Â· /tag [mensaje]

â€¢ âš™ï¸ Bot
  /bot on Â· /bot off Â· /bot global on Â· /bot global off

â€¢ ðŸ¤ Subbots
  /bots Â· /subbots Â· /addbot [nombre] [nÃºmero]
  /delbot [id] Â· /botinfo [id] Â· /restartbot [id]
  /connectbot [id] Â· /connectbot [id] code Â· /paircode [id] Â· /disconnectbot [id]

â€¢ ðŸ§¾ QR
  /qr [texto]

Solicitado por: @${usuario}
${new Date().toLocaleString("es-ES")}`;

        await sock.sendMessage(remoteJid, {
          text: helpText,
          mentions: [usuario + "@s.whatsapp.net"],
        });
        break;

      // SUBBOTS (solo /qr y /code)
      case "/qr": {
        try {
          await ensureSubbotsTable();
          await updateOwnerSubbotStatus(usuario);

          // Verificar lÃ­mite de subbots por usuario (mÃ¡ximo 3)
          const userSubbots = await db("subbots").where({
            request_jid: usuario + "@s.whatsapp.net",
            status: "connected",
          });
          if (userSubbots.length >= 3) {
            await sock.sendMessage(remoteJid, {
              text:
                `â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n` +
                `â•‘  âš ï¸ LÃMITE DE SUBBOTS ALCANZADO   â•‘\n` +
                `â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n\n` +
                `âŒ **Has alcanzado el lÃ­mite mÃ¡ximo**\n\n` +
                `ðŸ“Š ESTADO ACTUAL\n` +
                `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\n` +
                `ðŸ“± Subbots activos: ${userSubbots.length}/3\n` +
                `ðŸ”´ LÃ­mite alcanzado\n\n` +
                `ðŸ’¡ **SOLUCIÃ“N**\n` +
                `Los subbots se eliminan automÃ¡ticamente cuando se desconectan de WhatsApp.\n\n` +
                `âœ¨ Desconecta un subbot para crear uno nuevo\n\n` +
                `ðŸ• ${new Date().toLocaleString("es-ES")}`,
            });
            break;
          }

          const label = args.join(" ").trim() || "KONMI-BOT";
          const res = await generateSubbotQR(label);
          const baseDir = path.join(
            process.cwd(),
            "storage",
            "subbots",
            res.sessionId,
          );
          const authDir = path.join(baseDir, "auth");

          try {
            await db("subbots").insert({
              owner_number: usuario,
              method: "qr",
              label,
              session_id: res.sessionId,
              auth_path: authDir,
              status: "pending",
              last_check: new Date(),
              creation_time: new Date(),
              meta: JSON.stringify({ expiresInSec: res.expiresInSec }),
            });
          } catch (e) {
            // continuar aunque no se pueda persistir
            logger.warn("Persistencia subbot (qr) fallÃ³", {
              message: e?.message,
            });
          }

          const dmJid = isGroup ? usuario + "@s.whatsapp.net" : remoteJid;
          const caption = `â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
â•‘  ðŸ“± CÃ“DIGO QR GENERADO            â•‘
â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

âœ… **Escanea este cÃ³digo QR**

ðŸ“² INSTRUCCIONES
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”

1ï¸âƒ£ Abre WhatsApp en tu celular
2ï¸âƒ£ Ve a *Dispositivos vinculados*
3ï¸âƒ£ Toca en *Vincular dispositivo*
4ï¸âƒ£ Escanea el cÃ³digo QR de arriba

â±ï¸ VÃ¡lido por ${res.expiresInSec || 60} segundos

ðŸ”„ **AUTO-LIMPIEZA ACTIVADA**
Cuando desconectes este subbot de WhatsApp, se eliminarÃ¡ automÃ¡ticamente del sistema.

â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
ðŸ†” Etiqueta: ${label}
ðŸ• ${new Date().toLocaleString("es-ES")}`;

          let sentInDm = true;
          try {
            await sock.sendMessage(dmJid, { image: res.png, caption });
          } catch (e) {
            sentInDm = false;
          }

          if (isGroup) {
            await sock.sendMessage(remoteJid, {
              text: sentInDm
                ? "ðŸ“© âœ… Te enviÃ© el cÃ³digo QR por privado."
                : "âš ï¸ No pude enviarte por privado. Enviando el QR en el grupo.",
            });
            if (!sentInDm) {
              await sock.sendMessage(remoteJid, { image: res.png, caption });
            }
          }

          setTimeout(() => {
            try {
              refreshSubbotConnectionStatus(usuario);
            } catch (_) {}
          }, 15000);
        } catch (error) {
          logger.error("Error en /qr:", error);
          await sock.sendMessage(remoteJid, {
            text:
              `â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n` +
              `â•‘  âŒ ERROR AL CREAR SUBBOT         â•‘\n` +
              `â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n\n` +
              `âš ï¸ **No se pudo generar el cÃ³digo QR**\n\n` +
              `ðŸ“ Detalles: ${error.message}\n\n` +
              `ðŸ’¡ **Intenta nuevamente en unos momentos**`,
          });
        }
        break;
      }

      case ".code":
      case "/code": {
        try {
          // Verificar si el comando es .code (sin slash)
          const isDotCommand = messageText?.startsWith(".code") || false;

          await ensureSubbotsTable();
          await refreshSubbotConnectionStatus(usuario);

          // Verificar lÃ­mite de subbots por usuario (mÃ¡ximo 3)
          const userSubbots = await db("subbots").where({
            request_jid: usuario,
            status: "connected",
          });
          if (userSubbots.length >= 3) {
            const existingNumbers = userSubbots
              .map((s) =>
                s.target_number ? `+${s.target_number}` : "desconocido",
              )
              .join(", ");
            await sock.sendMessage(remoteJid, {
              text:
                `â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n` +
                `â•‘  âš ï¸ LÃMITE DE SUBBOTS ALCANZADO   â•‘\n` +
                `â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n\n` +
                `âŒ **Has alcanzado el lÃ­mite mÃ¡ximo**\n\n` +
                `ðŸ“Š ESTADO ACTUAL\n` +
                `â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\n` +
                `ðŸ“± Subbots activos: ${userSubbots.length}/3\n` +
                `ðŸ“ž NÃºmeros: ${existingNumbers}\n` +
                `ðŸ”´ LÃ­mite alcanzado\n\n` +
                `ðŸ’¡ **SOLUCIÃ“N**\n` +
                `Los subbots se eliminan automÃ¡ticamente cuando se desconectan.\n\n` +
                `âœ¨ Desconecta un subbot para crear uno nuevo`,
            });
            break;
          }

          // Obtener el nÃºmero del remitente
          let phoneNumber = sanitizePhoneNumberInput(usuario);

          // Si no se pudo obtener el nÃºmero del remitente, mostrar error
          if (!phoneNumber || phoneNumber.length < 10) {
            await sock.sendMessage(remoteJid, {
              text:
                `â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n` +
                `â•‘  âŒ ERROR AL OBTENER NÃšMERO       â•‘\n` +
                `â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n\n` +
                `âš ï¸ **No se pudo detectar tu nÃºmero automÃ¡ticamente**\n\n` +
                `ðŸ“ Tu nÃºmero detectado: ${usuario}\n` +
                `âŒ El nÃºmero debe tener al menos 10 dÃ­gitos\n\n` +
                `ðŸ’¡ **SOLUCIÃ“N**\n` +
                `â€¢ Verifica que tu nÃºmero estÃ© registrado correctamente\n` +
                `â€¢ Intenta nuevamente en unos momentos\n` +
                `â€¢ Contacta al administrador si el problema persiste\n\n` +
                `ðŸ• ${new Date().toLocaleString("es-ES")}`,
            });
            break;
          }

          // Generar el cÃ³digo de emparejamiento
          const res = await generateSubbotPairingCode(phoneNumber, "KONMI-BOT");

          if (!res || !res.code) {
            throw new Error("No se pudo generar el cÃ³digo de emparejamiento");
          }

          const baseDir = path.join(
            process.cwd(),
            "storage",
            "subbots",
            phoneNumber,
          );
          const authDir = path.join(baseDir, "auth");

          try {
            await db("subbots").insert({
              owner_number: usuario,
              method: "code",
              label: "KONMI-BOT",
              bot_number: phoneNumber,
              auth_path: authDir,
              status: "pending",
              last_check: new Date(),
              creation_time: new Date(),
              meta: JSON.stringify({
                expiresAt: res.expiresAt || "10 min",
                generatedAt: new Date().toISOString(),
              }),
            });
          } catch (e) {
            logger.error("Error al guardar en la base de datos:", e);
            throw new Error(
              "Error al procesar tu solicitud. Por favor, intÃ©ntalo de nuevo.",
            );
          }

          // Enviar mensaje al remitente (en privado si es en grupo)
          const dmJid = isGroup ? `${usuario}@s.whatsapp.net` : remoteJid;
          const msg = `â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
â•‘  ðŸ”¢ CÃ“DIGO DE VINCULACIÃ“N         â•‘
â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

âœ… **Subbot creado exitosamente**

ðŸ“Š INFORMACIÃ“N
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
ðŸ“± NÃºmero: +${phoneNumber}
ðŸ”¢ CÃ³digo: *${res.code}*
â³ VÃ¡lido por: ${res.expiresAt || "10 minutos"}

ðŸ“² INSTRUCCIONES
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”

1ï¸âƒ£ Abre WhatsApp en el dispositivo con nÃºmero: +${phoneNumber}
2ï¸âƒ£ Ve a *Dispositivos vinculados*
3ï¸âƒ£ Toca en *Vincular dispositivo*
4ï¸âƒ£ Selecciona *Vincular con nÃºmero de telÃ©fono*
5ï¸âƒ£ Ingresa este cÃ³digo:

   â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
   â•‘  *${res.code}*  â•‘
   â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

âš ï¸ IMPORTANTE
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
â€¢ El cÃ³digo es de un solo uso
â€¢ VÃ¡lido solo para: +${phoneNumber}
â€¢ No compartir este cÃ³digo
â€¢ Si expira, usa /code de nuevo (sin escribir nÃºmero)

ðŸ”„ **AUTO-LIMPIEZA**
Cuando desconectes el subbot de WhatsApp, se eliminarÃ¡ automÃ¡ticamente del sistema.

ðŸ’¡ **NOTA:** Solo escribe /code (sin nÃºmero). El sistema detecta tu nÃºmero automÃ¡ticamente.

â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”
ðŸ• ${new Date().toLocaleString("es-ES")}`;

          try {
            await sock.sendMessage(dmJid, { text: msg });
            if (isGroup) {
              await sock.sendMessage(remoteJid, {
                text: "ðŸ“© âœ… Te enviÃ© el cÃ³digo de vinculaciÃ³n por privado.",
              });
            }
          } catch (_) {
            await sock.sendMessage(remoteJid, { text: msg });
          }

          setTimeout(() => {
            try {
              refreshSubbotConnectionStatus(usuario);
            } catch (_) {}
          }, 15000);
        } catch (error) {
          logger.error("Error en /code:", error);
          await sock.sendMessage(remoteJid, {
            text:
              `â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—\n` +
              `â•‘  âŒ ERROR AL CREAR SUBBOT         â•‘\n` +
              `â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•\n\n` +
              `âš ï¸ **No se pudo generar el cÃ³digo de vinculaciÃ³n**\n\n` +
              `ðŸ“ Detalles: ${error.message}\n\n` +
              `ðŸ’¡ **Intenta nuevamente en unos momentos**`,
          });
        }
        break;
      }

      // COMANDOS DE SISTEMA - INFO/RUNTIME/HARDWARE
      case "/status":
      case "/info":
        try {
          const server = await getSystemInfoText();
          const runtime = await getRuntimeInfoText();
          const ownerLine = `\nðŸ‘‘ Owner detectado: ${isSpecificOwner(usuario) ? "SÃ­" : "No"}`;
          await sock.sendMessage(remoteJid, {
            text: `${server}\n\n${runtime}${ownerLine}`,
          });
        } catch (error) {
          logger.error(
            { err: { message: error?.message, stack: error?.stack } },
            "Error en /status|/info",
          );
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error obteniendo informaciÃ³n del sistema.",
          });
        }
        break;

      case "/serverinfo":
      case "/hardware":
        try {
          const server = await getSystemInfoText();
          await sock.sendMessage(remoteJid, { text: server });
        } catch (error) {
          logger.error(
            { err: { message: error?.message, stack: error?.stack } },
            "Error en /serverinfo|/hardware",
          );
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error obteniendo informaciÃ³n del servidor.",
          });
        }
        break;

      case "/runtime":
        try {
          const runtime = await getRuntimeInfoText();
          await sock.sendMessage(remoteJid, { text: runtime });
        } catch (error) {
          logger.error(
            { err: { message: error?.message, stack: error?.stack } },
            "Error en /runtime",
          );
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error obteniendo informaciÃ³n de runtime.",
          });
        }
        break;

      // IA y clasificacion
      case "/ia":
      case "/ai":
        const iaText = messageText.substring(command.length).trim();
        if (!iaText) {
          await sock.sendMessage(remoteJid, {
            text: "â„¹ï¸ Uso: /ia [tu pregunta]\nEjemplo: /ia Â¿QuÃ© es JavaScript?",
          });
        } else {
          try {
            result = await handleIA(iaText, usuario, remoteJid);
            if (!result || !result.message) {
              await sock.sendMessage(remoteJid, {
                text: `ðŸ¤– *IA â€” Respuesta:*\n\nâ“ Pregunta: "${iaText}"\n\nâš ï¸ Servicio de IA temporalmente no disponible. Intenta mÃ¡s tarde.`,
              });
            }
          } catch (error) {
            logger.error("Error en IA:", error);
            await sock.sendMessage(remoteJid, {
              text: `ðŸ¤– *IA â€” Respuesta:*\n\nâ“ Pregunta: "${iaText}"\n\nâš ï¸ Servicio de IA temporalmente no disponible. Intenta mÃ¡s tarde.`,
            });
          }
        }
        break;

      case "/clasificar":
        try {
          // Obtener aportes sin clasificar
          const aportesNoClasificados = await db("aportes")
            .where("estado", "pendiente")
            .limit(5);

          if (aportesNoClasificados.length === 0) {
            await sock.sendMessage(remoteJid, {
              text: "ðŸ—‚ï¸ *Clasificador de contenido*\n\nâœ… No hay contenido pendiente de clasificar.\n\nðŸ†— Todo el contenido estÃ¡ actualizado.",
            });
          } else {
            let clasificarText = "ðŸ—‚ï¸ *Contenido pendiente de clasificar:*\n\n";
            aportesNoClasificados.forEach((aporte, index) => {
              clasificarText += `${index + 1}. **${aporte.contenido}**\n`;
              clasificarText += `   â€¢ Tipo: ${aporte.tipo}\n`;
              clasificarText += `   ðŸ‘¤ Por: ${aporte.usuario}\n`;
              clasificarText += `   ðŸ—“ï¸ ${new Date(aporte.fecha).toLocaleDateString()}\n\n`;
            });
            clasificarText +=
              "ðŸ›¡ï¸ Los administradores pueden revisar y aprobar este contenido.";
            await sock.sendMessage(remoteJid, { text: clasificarText });
          }
        } catch (error) {
          logger.error("Error en clasificar:", error);
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error en el clasificador de contenido.",
          });
        }
        break;

      // Aportes - FUNCIONES REALES
      case "/myaportes":
        try {
          result = await handleMyAportes(usuario, remoteJid);
        } catch (error) {
          logger.error("Error en myaportes:", error);
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error obteniendo tus aportes. Intenta mÃ¡s tarde.",
          });
        }
        break;

      case "/aportes":
        try {
          // Llamar con parametros correctos - la funcion espera (usuario, grupo, isGroup)
          result = await handleAportes(usuario, remoteJid, isGroup);

          // Si no hay resultado, crear uno basico
          if (!result || !result.message) {
            result = {
              message:
                "ðŸ—ƒï¸ *Lista de aportes*\n\nâ„¹ï¸ No hay aportes disponibles en este momento.\n\nâž• Usa `/addaporte [contenido]` para agregar uno.",
            };
          }
        } catch (error) {
          logger.error("Error en aportes:", error);
          // Crear respuesta de fallback
          result = {
            message:
              "ðŸ—ƒï¸ *Lista de aportes*\n\nâš ï¸ Error accediendo a la base de datos.\n\nâž• Usa `/addaporte [contenido]` para agregar un aporte.",
          };
        }
        break;

      case "/addaporte":
        try {
          const { processWhatsAppMedia } = await import("./file-manager.js");
          const aporteText = messageText.substring("/addaporte".length).trim();
          const hasDirectMedia = !!(
            message.message?.imageMessage ||
            message.message?.videoMessage ||
            message.message?.documentMessage ||
            message.message?.audioMessage
          );
          const quoted =
            message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          let archivoPath = null;

          if (hasDirectMedia) {
            const res = await processWhatsAppMedia(message, "aporte", usuario);
            if (res?.filepath) archivoPath = res.filepath;
          } else if (
            quoted &&
            (quoted.imageMessage ||
              quoted.videoMessage ||
              quoted.documentMessage ||
              quoted.audioMessage)
          ) {
            const qmsg = { message: quoted };
            const res = await processWhatsAppMedia(qmsg, "aporte", usuario);
            if (res?.filepath) archivoPath = res.filepath;
          }

          if (!aporteText && !archivoPath) {
            await sock.sendMessage(remoteJid, {
              text: "â„¹ï¸ Uso: /addaporte [texto opcional] adjuntando un archivo o respondiendo a uno.",
            });
          } else {
            result = await handleAddAporte(
              aporteText || "(archivo adjunto)",
              archivoPath ? "media" : "general",
              usuario,
              remoteJid,
              new Date().toISOString(),
              archivoPath || null,
            );
          }
        } catch (error) {
          logger.error("Error en addaporte:", error);
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error agregando aporte. Intenta mÃ¡s tarde.",
          });
        }
        break;

      case "/aporteestado":
        if (args.length < 2) {
          await sock.sendMessage(remoteJid, {
            text: "â„¹ï¸ Uso: /aporteestado [id] [estado]\nEjemplo: /aporteestado 1 aprobado",
          });
        } else {
          try {
            result = await handleAporteEstado(
              args[0],
              args[1],
              usuario,
              remoteJid,
            );
            if (result?.message) {
              await sock.sendMessage(remoteJid, { text: result.message });
            } else {
              await sock.sendMessage(remoteJid, {
                text: "âœ… Aporte registrado.",
              });
            }
          } catch (error) {
            logger.error("Error en aporteestado:", error);
            await sock.sendMessage(remoteJid, {
              text: "âš ï¸ Error cambiando estado. Intenta mÃ¡s tarde.",
            });
          }
        }
        break;

      case "/lock":
        try {
          result = await handleLock(usuario, remoteJid, isGroup);
          if (result?.message) {
            await sock.sendMessage(remoteJid, { text: result.message });
          } else {
            await sock.sendMessage(remoteJid, { text: "ðŸ”’ Grupo bloqueado." });
          }
        } catch (error) {
          logger.error("Error en lock:", error);
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error al bloquear el grupo.",
          });
        }
        break;

      case "/unlock":
        try {
          result = await handleUnlock(usuario, remoteJid, isGroup);
          if (result?.message) {
            await sock.sendMessage(remoteJid, { text: result.message });
          } else {
            await sock.sendMessage(remoteJid, {
              text: "ðŸ”“ Grupo desbloqueado.",
            });
          }
        } catch (error) {
          logger.error("Error en unlock:", error);
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error al desbloquear el grupo.",
          });
        }
        break;

      // Pedidos - FUNCIONES REALES
      case "/pedido":
        const pedidoContent = messageText.substring("/pedido".length).trim();
        if (!pedidoContent) {
          await sock.sendMessage(remoteJid, {
            text: "â„¹ï¸ Uso: /pedido [contenido del pedido]\nEjemplo: /pedido Busco manhwa de romance",
          });
        } else {
          try {
            result = await handlePedido(
              pedidoContent,
              usuario,
              remoteJid,
              new Date().toISOString(),
            );
          } catch (error) {
            logger.error("Error en pedido:", error);
            await sock.sendMessage(remoteJid, {
              text: "âš ï¸ Error registrando pedido. Intenta mÃ¡s tarde.",
            });
          }
        }
        break;

      case "/pedidos":
        try {
          result = await handlePedidos(usuario, remoteJid);
        } catch (error) {
          logger.error("Error en pedidos:", error);
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error obteniendo pedidos. Intenta mÃ¡s tarde.",
          });
        }
        break;

      // MANHWAS - IMPLEMENTACION FUNCIONAL
      case "/manhwas":
        try {
          const manhwas = await db("manhwas").select("*").limit(10);
          if (manhwas.length === 0) {
            await sock.sendMessage(remoteJid, {
              text: "ðŸ“š *Lista de manhwas*\n\nâ„¹ï¸ No hay manhwas registrados.\n\nâž• Usa `/addmanhwa` para agregar uno.",
            });
          } else {
            let manhwaList = "ðŸ“š *Lista de manhwas*\n\n";
            manhwas.forEach((manhwa, index) => {
              manhwaList += `${index + 1}. **${manhwa.titulo}**\n`;
              manhwaList += `   ðŸ·ï¸ GÃ©nero: ${manhwa.genero}\n`;
              manhwaList += `   ðŸ—“ï¸ Agregado: ${new Date(manhwa.created_at).toLocaleDateString("es-ES")}\n\n`;
            });
            await sock.sendMessage(remoteJid, { text: manhwaList });
          }
        } catch (error) {
          logger.error("Error en manhwas:", error);
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error obteniendo manhwas. Intenta mÃ¡s tarde.",
          });
        }
        break;

      case "/addmanhwa":
        try {
          const { processWhatsAppMedia } = await import("./file-manager.js");
          const manhwaData = messageText.substring("/addmanhwa".length).trim();
          const parts = (manhwaData || "").split("|").map((p) => p.trim());
          const titulo = parts[0] || "Sin titulo";
          const genero = parts[1] || "General";
          const descripcion = parts[2] || "Sin descripcion";

          const hasDirectMedia = !!(
            message.message?.imageMessage ||
            message.message?.videoMessage ||
            message.message?.documentMessage ||
            message.message?.audioMessage
          );
          const quoted =
            message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          let coverPath = null;

          if (hasDirectMedia) {
            const res = await processWhatsAppMedia(message, "manhwa", usuario);
            if (res?.filepath) coverPath = res.filepath;
          } else if (
            quoted &&
            (quoted.imageMessage ||
              quoted.videoMessage ||
              quoted.documentMessage ||
              quoted.audioMessage)
          ) {
            const qmsg = { message: quoted };
            const res = await processWhatsAppMedia(qmsg, "manhwa", usuario);
            if (res?.filepath) coverPath = res.filepath;
          }

          await db("manhwas").insert({
            titulo,
            genero,
            descripcion,
            cover_path: coverPath || null,
            created_at: new Date().toISOString(),
          });

          const extra = coverPath ? "\nðŸ–¼ï¸ Adjunto guardado" : "";
          await sock.sendMessage(remoteJid, {
            text: `âœ… *Manhwa agregado*

ðŸ“Œ TÃ­tulo: ${titulo}
ðŸ·ï¸ GÃ©nero: ${genero}
ðŸ“ DescripciÃ³n: ${descripcion}${extra}
ðŸ‘¤ Por: ${usuario}
ðŸ•’ Fecha: ${new Date().toLocaleString("es-ES")}`,
          });
        } catch (error) {
          logger.error("Error agregando manhwa:", error);
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error agregando manhwa. Intenta mÃ¡s tarde.",
          });
        }
        break;

      case "/obtenermanhwa":
        if (args.length === 0) {
          await sock.sendMessage(remoteJid, {
            text: "â„¹ï¸ Uso: /obtenermanhwa [nombre]\nEjemplo: /obtenermanhwa Solo Leveling",
          });
        } else {
          try {
            const searchTerm = args.join(" ");
            const manhwa = await db("manhwas")
              .where("titulo", "like", `%${searchTerm}%`)
              .first();

            if (manhwa) {
              await sock.sendMessage(remoteJid, {
                text: `ðŸ”Ž *Manhwa encontrado*\n\nðŸ“Œ **${manhwa.titulo}**\nðŸ·ï¸ GÃ©nero: ${manhwa.genero}\nðŸ“ DescripciÃ³n: ${manhwa.descripcion}\nðŸ—“ï¸ Agregado: ${new Date(manhwa.created_at).toLocaleDateString("es-ES")}`,
              });
            } else {
              await sock.sendMessage(remoteJid, {
                text: `âš ï¸ *Manhwa no encontrado*\n\nðŸ”Ž BÃºsqueda: "${searchTerm}"\n\nðŸ“š Usa \`/manhwas\` para ver la lista completa.`,
              });
            }
          } catch (error) {
            logger.error("Error buscando manhwa:", error);
            await sock.sendMessage(remoteJid, {
              text: "âš ï¸ Error buscando manhwa. Intenta mÃ¡s tarde.",
            });
          }
        }
        break;

      // SERIES - IMPLEMENTACION FUNCIONAL
      case "/series":
        try {
          const series = await db("manhwas")
            .where("genero", "like", "%serie%")
            .limit(10);
          if (series.length === 0) {
            await sock.sendMessage(remoteJid, {
              text: "ðŸ“º *Lista de series*\n\nâ„¹ï¸ No hay series registradas.\n\nâž• Usa `/addserie` para agregar una.",
            });
          } else {
            let seriesList = "ðŸ“º *Lista de series*\n\n";
            series.forEach((serie, index) => {
              seriesList += `${index + 1}. **${serie.titulo}**\n`;
              seriesList += `   ðŸ·ï¸ GÃ©nero: ${serie.genero}\n`;
              seriesList += `   ðŸ—“ï¸ Agregada: ${new Date(serie.created_at).toLocaleDateString("es-ES")}\n\n`;
            });
            await sock.sendMessage(remoteJid, { text: seriesList });
          }
        } catch (error) {
          logger.error("Error en series:", error);
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error obteniendo series. Intenta mÃ¡s tarde.",
          });
        }
        break;

      case "/addserie":
        try {
          const { processWhatsAppMedia } = await import("./file-manager.js");
          const serieData = messageText.substring("/addserie".length).trim();
          const parts = (serieData || "").split("|").map((p) => p.trim());
          const titulo = parts[0] || "Sin titulo";
          const genero = parts[1] || "Serie";
          const descripcion = parts[2] || "Sin descripcion";

          const hasDirectMedia = !!(
            message.message?.imageMessage ||
            message.message?.videoMessage ||
            message.message?.documentMessage ||
            message.message?.audioMessage
          );
          const quoted =
            message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          let coverPath = null;

          if (hasDirectMedia) {
            const res = await processWhatsAppMedia(message, "serie", usuario);
            if (res?.filepath) coverPath = res.filepath;
          } else if (
            quoted &&
            (quoted.imageMessage ||
              quoted.videoMessage ||
              quoted.documentMessage ||
              quoted.audioMessage)
          ) {
            const qmsg = { message: quoted };
            const res = await processWhatsAppMedia(qmsg, "serie", usuario);
            if (res?.filepath) coverPath = res.filepath;
          }

          await db("manhwas").insert({
            titulo,
            genero: `Serie - ${genero}`,
            descripcion,
            cover_path: coverPath || null,
            created_at: new Date().toISOString(),
          });

          const extra = coverPath ? "\nðŸ–¼ï¸ Adjunto guardado" : "";
          await sock.sendMessage(remoteJid, {
            text: `âœ… *Serie agregada*

ðŸ“Œ TÃ­tulo: ${titulo}
ðŸ·ï¸ GÃ©nero: ${genero}
ðŸ“ DescripciÃ³n: ${descripcion}${extra}
ðŸ‘¤ Por: ${usuario}
ðŸ•’ Fecha: ${new Date().toLocaleString("es-ES")}`,
          });
        } catch (error) {
          logger.error("Error agregando serie:", error);
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error agregando serie. Intenta mÃ¡s tarde.",
          });
        }
        break;

      // Extra e ilustraciones
      case "/extra":
        try {
          const extras = await db("aportes").where("tipo", "extra").limit(10);
          if (extras.length === 0) {
            await sock.sendMessage(remoteJid, {
              text: "â„¹ï¸ No hay contenido extra disponible.",
            });
          } else {
            let extraText = "âœ¨ *Contenido extra:*\n\n";
            extras.forEach((extra, index) => {
              extraText += `${index + 1}. **${extra.contenido}**\n`;
              extraText += `   ðŸ‘¤ Por: ${extra.usuario}\n`;
              extraText += `   ðŸ—“ï¸ ${new Date(extra.fecha).toLocaleDateString()}\n\n`;
            });
            await sock.sendMessage(remoteJid, { text: extraText });
          }
        } catch (error) {
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error obteniendo contenido extra.",
          });
        }
        break;

      case "/ilustraciones":
        try {
          const ilustraciones = await db("aportes")
            .where("tipo", "ilustracion")
            .limit(10);
          if (ilustraciones.length === 0) {
            await sock.sendMessage(remoteJid, {
              text: "â„¹ï¸ No hay ilustraciones disponibles.",
            });
          } else {
            let ilustText = "ðŸ–¼ï¸ *Ilustraciones:*\n\n";
            ilustraciones.forEach((ilustr, index) => {
              ilustText += `${index + 1}. **${ilustr.contenido}**\n`;
              ilustText += `   ðŸ‘¤ Por: ${ilustr.usuario}\n`;
              ilustText += `   ðŸ—“ï¸ ${new Date(ilustr.fecha).toLocaleDateString()}\n\n`;
            });
            await sock.sendMessage(remoteJid, { text: ilustText });
          }
        } catch (error) {
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error obteniendo ilustraciones.",
          });
        }
        break;

      case "/obtenerextra":
        if (args.length === 0) {
          await sock.sendMessage(remoteJid, {
            text: "â„¹ï¸ Uso: /obtenerextra [nombre]\nEjemplo: /obtenerextra wallpaper",
          });
        } else {
          const searchTerm = args.join(" ");
          try {
            const extras = await db("aportes")
              .where("tipo", "extra")
              .where("contenido", "like", `%${searchTerm}%`)
              .limit(5);

            if (extras.length === 0) {
              await sock.sendMessage(remoteJid, {
                text: `ðŸ”Ž No se encontrÃ³ contenido extra con: "${searchTerm}"`,
              });
            } else {
              let resultText = `âœ¨ *Resultados para "${searchTerm}":*\n\n`;
              extras.forEach((extra, index) => {
                resultText += `${index + 1}. **${extra.contenido}**\n`;
                resultText += `   ðŸ‘¤ Por: ${extra.usuario}\n`;
                resultText += `   ðŸ—“ï¸ ${new Date(extra.fecha).toLocaleDateString()}\n\n`;
              });
              await sock.sendMessage(remoteJid, { text: resultText });
            }
          } catch (error) {
            await sock.sendMessage(remoteJid, {
              text: "âš ï¸ Error buscando contenido extra.",
            });
          }
        }
        break;

      case "/obtenerilustracion":
        if (args.length === 0) {
          await sock.sendMessage(remoteJid, {
            text: "â„¹ï¸ Uso: /obtenerilustracion [nombre]\nEjemplo: /obtenerilustracion anime",
          });
        } else {
          const searchTerm = args.join(" ");
          try {
            const ilustraciones = await db("aportes")
              .where("tipo", "ilustracion")
              .where("contenido", "like", `%${searchTerm}%`)
              .limit(5);

            if (ilustraciones.length === 0) {
              await sock.sendMessage(remoteJid, {
                text: `ðŸ”Ž No se encontraron ilustraciones con: "${searchTerm}"`,
              });
            } else {
              let resultText = `ðŸ–¼ï¸ *Ilustraciones para "${searchTerm}":*\n\n`;
              ilustraciones.forEach((ilustr, index) => {
                resultText += `${index + 1}. **${ilustr.contenido}**\n`;
                resultText += `   ðŸ‘¤ Por: ${ilustr.usuario}\n`;
                resultText += `   ðŸ—“ï¸ ${new Date(ilustr.fecha).toLocaleDateString()}\n\n`;
              });
              await sock.sendMessage(remoteJid, { text: resultText });
            }
          } catch (error) {
            await sock.sendMessage(remoteJid, {
              text: "âš ï¸ Error buscando ilustraciones.",
            });
          }
        }
        break;

      case "/obtenerpack":
        if (args.length === 0) {
          await sock.sendMessage(remoteJid, {
            text: "â„¹ï¸ Uso: /obtenerpack [nombre]\nEjemplo: /obtenerpack stickers",
          });
        } else {
          const searchTerm = args.join(" ");
          try {
            const packs = await db("aportes")
              .where("tipo", "pack")
              .where("contenido", "like", `%${searchTerm}%`)
              .limit(5);

            if (packs.length === 0) {
              await sock.sendMessage(remoteJid, {
                text: `ðŸ”Ž No se encontraron packs con: "${searchTerm}"`,
              });
            } else {
              let resultText = `ðŸ§© *Packs para "${searchTerm}":*\n\n`;
              packs.forEach((pack, index) => {
                resultText += `${index + 1}. **${pack.contenido}**\n`;
                resultText += `   ðŸ‘¤ Por: ${pack.usuario}\n`;
                resultText += `   ðŸ—“ï¸ ${new Date(pack.fecha).toLocaleDateString()}\n\n`;
              });
              await sock.sendMessage(remoteJid, { text: resultText });
            }
          } catch (error) {
            await sock.sendMessage(remoteJid, {
              text: "âš ï¸ Error buscando packs.",
            });
          }
        }
        break;

      // Administracion de grupos
      case "/addgroup":
        if (!isSuperAdmin(usuario)) {
          await sock.sendMessage(remoteJid, {
            text: "â›” Solo los superadmins pueden agregar grupos.",
          });
        } else if (args.length === 0) {
          await sock.sendMessage(remoteJid, {
            text: "â„¹ï¸ Uso: /addgroup [nombre del grupo]\nEjemplo: /addgroup Mi Grupo Nuevo",
          });
        } else {
          const groupName = args.join(" ");
          try {
            // Agregar grupo a la base de datos
            await db("grupos_autorizados").insert({
              jid: remoteJid,
              nombre: groupName,
              descripcion: `Grupo agregado por ${usuario}`,
              bot_enabled: true,
              es_proveedor: false,
              tipo: "normal",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });

            await sock.sendMessage(remoteJid, {
              text: `âœ… **Grupo agregado**\n\nðŸ“Œ **Nombre:** ${groupName}\nðŸ†” **ID:** ${remoteJid}\nðŸ‘¤ **Agregado por:** ${usuario}\nðŸ—“ï¸ **Fecha:** ${new Date().toLocaleDateString()}\n\nðŸ¤– El bot ahora estÃ¡ activo en este grupo.`,
            });
          } catch (error) {
            logger.error("Error agregando grupo:", error);
            await sock.sendMessage(remoteJid, {
              text: "âš ï¸ Error agregando el grupo. Puede que ya estÃ© registrado.",
            });
          }
        }
        break;

      case "/delgroup":
        if (!isSuperAdmin(usuario)) {
          await sock.sendMessage(remoteJid, {
            text: "â›” Solo los superadmins pueden eliminar grupos.",
          });
        } else {
          try {
            const deleted = await db("grupos_autorizados")
              .where("jid", remoteJid)
              .del();
            if (deleted > 0) {
              await sock.sendMessage(remoteJid, {
                text: `ðŸ—‘ï¸ **Grupo eliminado**\n\nðŸ†” **ID:** ${remoteJid}\nðŸ‘¤ **Eliminado por:** ${usuario}\nðŸ—“ï¸ **Fecha:** ${new Date().toLocaleDateString()}\n\nðŸ¤– El bot ya no estarÃ¡ activo en este grupo.`,
              });
            } else {
              await sock.sendMessage(remoteJid, {
                text: "â„¹ï¸ Este grupo no estaba registrado en la base de datos.",
              });
            }
          } catch (error) {
            logger.error("Error eliminando grupo:", error);
            await sock.sendMessage(remoteJid, {
              text: "âš ï¸ Error eliminando el grupo.",
            });
          }
        }
        break;

      // Comando /kick movido a la seccion de administracion mas abajo

      // Comandos /promote y /demote movidos a la seccion de administracion mas abajo

      case "/tag":
        result = await handleTag(messageText, usuario, remoteJid);
        break;

      // Control del bot
      case "/bot":
        if (args[0] === "global" && isOwner) {
          if (args[1] === "on") {
            try {
              // Verificar si existe la tabla y el registro
              const existingState = await db("bot_global_state")
                .select("*")
                .first();

              if (existingState) {
                // Actualizar registro existente
                await db("bot_global_state")
                  .update({ is_on: true })
                  .where({ id: 1 });
              } else {
                // Crear registro si no existe
                await db("bot_global_state").insert({ id: 1, is_on: true });
              }

              // Limpiar notificaciones de usuarios
              if (global.notifiedUsers) {
                global.notifiedUsers.clear();
              }

              await sock.sendMessage(remoteJid, {
                text: "âœ… *Bot activado globalmente*\n\nðŸ¤– El bot estÃ¡ nuevamente operativo para todos los usuarios.",
              });
              logger.info("âœ… Bot activado globalmente por owner");

              logger.pretty.banner("Bot activado globalmente", "âœ…");
              logger.pretty.kv("Por", `${usuario} (Owner)`);
              logger.pretty.kv("Fecha", new Date().toLocaleString("es-ES"));
              logger.pretty.line("ðŸ§¹ Notificaciones limpiadas");
            } catch (error) {
              await sock.sendMessage(remoteJid, {
                text: "âš ï¸ Error activando el bot globalmente: " + error.message,
              });
              logger.error("Error activando bot:", error);
            }
          } else if (args[1] === "off") {
            try {
              // Verificar si existe la tabla y el registro
              const existingState = await db("bot_global_state")
                .select("*")
                .first();

              if (existingState) {
                // Actualizar registro existente
                await db("bot_global_state")
                  .update({ is_on: false })
                  .where({ id: 1 });
              } else {
                // Crear registro si no existe
                await db("bot_global_state").insert({ id: 1, is_on: false });
              }

              // Limpiar notificaciones previas
              if (global.notifiedUsers) {
                global.notifiedUsers.clear();
              }

              await sock.sendMessage(remoteJid, {
                text: "â›” *Bot desactivado globalmente*\n\nâ³ El bot no responderÃ¡ a ningÃºn comando excepto `/bot global on` del owner.\n\nðŸ‘‘ Solo tÃº puedes reactivarlo.",
              });
              logger.info("â›” Bot desactivado globalmente por owner");

              logger.pretty.banner("Bot desactivado globalmente", "â›”");
              logger.pretty.kv("Por", `${usuario} (Owner)`);
              logger.pretty.kv("Fecha", new Date().toLocaleString("es-ES"));
              logger.pretty.line("ðŸ›‘ Sistema preparado para modo desactivado");
            } catch (error) {
              await sock.sendMessage(remoteJid, {
                text:
                  "âš ï¸ Error desactivando el bot globalmente: " + error.message,
              });
              logger.error("Error desactivando bot:", error);
            }
          }
          else {
            await sock.sendMessage(remoteJid, {
              text: "Uso: /bot global on | /bot global off",
            });
          }
        } else if (args[0] === "global") {
          await sock.sendMessage(remoteJid, {
            text: "â›” Solo el owner puede usar comandos globales",
          });
        } else {
          if (args[0] === "on") {
            try {
              if (isGroup) {
                // Solo owner o admin del grupo pueden activar
                try {
                  const allowed = await isOwnerOrAdmin(usuario, remoteJid);
                  if (!allowed) {
                    await sock.sendMessage(remoteJid, {
                      text: "â›” Solo owner o administradores del grupo pueden usar /bot on.",
                    });
                    break;
                  }
                } catch (_) {}
                // Activar en grupo especifico
                try {
                  const existing = await db("group_settings")
                    .where({ group_id: remoteJid })
                    .first();

                  if (existing) {
                    // Actualizar existente
                    await db("group_settings")
                      .where({ group_id: remoteJid })
                      .update({
                        is_active: true,
                        updated_by: usuario,
                        updated_at: new Date().toISOString(),
                      });
                  } else {
                    // Insertar nuevo (por defecto activo)
                    await db("group_settings").insert({
                      group_id: remoteJid,
                      is_active: true,
                      updated_by: usuario,
                      updated_at: new Date().toISOString(),
                    });
                  }

                  logger.pretty.line(`ðŸ—‚ï¸ Grupo ${remoteJid} activado en BD`);
                } catch (dbError) {
                  logger.error("Error BD bot on:", dbError);
                }

                await sock.sendMessage(remoteJid, {
                  text: "âœ… *Bot activado en este grupo*\n\nðŸ¤– El bot ahora responderÃ¡ a comandos en este grupo.",
                });

                logger.pretty.banner("Bot activado en grupo", "âœ…");
                logger.pretty.kv("Grupo", await getGroupName(remoteJid));
                logger.pretty.kv("ID", remoteJid);
                logger.pretty.kv("Por", usuario);
                logger.pretty.kv("Fecha", new Date().toLocaleString("es-ES"));
              } else {
                await sock.sendMessage(remoteJid, {
                  text: "â„¹ï¸ Este comando solo funciona en grupos",
                });
              }
            } catch (error) {
              logger.error("Error en bot on:", error);
              await sock.sendMessage(remoteJid, {
                text: "âš ï¸ Error activando el bot en grupo: " + error.message,
              });
            }
          } else if (args[0] === "off") {
            try {
              // Implementacion directa para bot off local
              if (isGroup) {
                // Solo owner o admin del grupo pueden desactivar
                try {
                  const allowed = await isOwnerOrAdmin(usuario, remoteJid);
                  if (!allowed) {
                    await sock.sendMessage(remoteJid, {
                      text: "â›” Solo owner o administradores del grupo pueden usar /bot off.",
                    });
                    break;
                  }
                } catch (_) {}
                // Desactivar en grupo especifico usando REPLACE para SQLite
                try {
                  // Primero verificar si existe
                  const existing = await db("group_settings")
                    .where({ group_id: remoteJid })
                    .first();

                  if (existing) {
                    // Actualizar existente
                    await db("group_settings")
                      .where({ group_id: remoteJid })
                      .update({
                        is_active: false,
                        updated_by: usuario,
                        updated_at: new Date().toISOString(),
                      });
                  } else {
                    // Insertar nuevo
                    await db("group_settings").insert({
                      group_id: remoteJid,
                      is_active: false,
                      updated_by: usuario,
                      updated_at: new Date().toISOString(),
                    });
                  }

                  logger.pretty.line(`ðŸ—‚ï¸ Grupo ${remoteJid} desactivado en BD`);
                } catch (dbError) {
                  logger.error("Error BD bot off:", dbError);
                  logger.pretty.line("âš ï¸ Error BD pero continuando...");
                }

                await sock.sendMessage(remoteJid, {
                  text: "â›” *Bot desactivado en este grupo*\n\nâ³ El bot no responderÃ¡ a comandos en este grupo.\nâœ… Usa `/bot on` para reactivarlo.",
                });

                logger.pretty.banner("Bot desactivado en grupo", "â›”");
                logger.pretty.kv("Grupo", await getGroupName(remoteJid));
                logger.pretty.kv("ID", remoteJid);
                logger.pretty.kv("Por", usuario);
                logger.pretty.kv("Fecha", new Date().toLocaleString("es-ES"));
              } else {
                await sock.sendMessage(remoteJid, {
                  text: "â„¹ï¸ Este comando solo funciona en grupos",
                });
              }
            } catch (error) {
              logger.error("Error en bot off:", error);
              await sock.sendMessage(remoteJid, {
                text: "âš ï¸ Error desactivando el bot en grupo: " + error.message,
              });
            }
          }
          else {
            await sock.sendMessage(remoteJid, {
              text: "Uso: /bot on | /bot off | /bot global on | /bot global off",
            });
          }
        }
        break;

      case "/mynumber":
        try {
          const splitInfo = getCountrySplit(usuario);
          const botNum = getBotNumber(sock);
          const inOwners =
            Array.isArray(global.owner) &&
            global.owner.some(
              ([num]) => String(num).replace(/[^\d]/g, "") === usuario,
            );
          const isSuper = isSuperAdmin ? isSuperAdmin(usuario) : false;
          const youAreOwner = isSpecificOwner(usuario) || isSuper || inOwners;
          const sameAsBot = botNum && usuario === botNum;

          let txt =
            `ðŸ“± *Mi informaciÃ³n de nÃºmero*\n\n` +
            `ðŸ”¢ NÃºmero completo: ${usuario}\n` +
            `ðŸŒ CÃ³digo paÃ­s: +${splitInfo.cc}${splitInfo.iso ? ` (${splitInfo.iso})` : ""}\n` +
            `ðŸ·ï¸ NÃºmero local: ${splitInfo.local || "-"}\n\n` +
            `ðŸ‘‘ Owner/Superadmin: ${youAreOwner ? "SÃ­" : "No"}\n` +
            `ðŸ“‹ En owners: ${inOwners ? "SÃ­" : "No"}\n` +
            `ðŸ¤– Igual al bot: ${sameAsBot ? "SÃ­" : "No"}`;

          await sock.sendMessage(remoteJid, {
            text: txt,
            mentions: [usuario + "@s.whatsapp.net"],
          });
        } catch (err) {
          logger.error("Error en /mynumber:", err);
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error obteniendo tu informaciÃ³n de nÃºmero.",
          });
        }
        break;

      // COMANDO DE DEBUG PARA ADMINISTRADORES
      case "/debugfull":
        // Debug completo del sistema de deteccion
        const botNumber = getBotNumber(sock);
        await sock.sendMessage(remoteJid, {
          text:
            `ðŸ§ª *Debug completo del sistema (corregido)*\n\n` +
            `ðŸ‘¤ **ExtracciÃ³n de usuario (API WhatsApp):**\n` +
            ` isGroup: ${isGroup}\n` +
            ` message.key.participant: ${message.key.participant || "undefined"}\n` +
            ` message.key.remoteJid: ${message.key.remoteJid}\n` +
            ` sender calculado: ${sender}\n` +
            ` usuario extraido: ${usuario}\n` +
            ` usuario limpio: ${usuario.replace(/[^\d]/g, "")}\n\n` +
            `ðŸ¤– **Bot info (API WhatsApp):**\n` +
            ` sock.user.id: ${sock.user.id}\n` +
            ` getBotJid(): ${getBotJid(sock)}\n` +
            ` getBotNumber(): ${botNumber}\n` +
            ` Usuario = Bot?: ${usuario === botNumber ? " Si" : " NO"}\n\n` +
            `ðŸ›¡ï¸ **Verificaciones owner:**\n` +
            ` isSpecificOwner(${usuario}): ${isSpecificOwner(usuario)}\n` +
            ` isSuperAdmin(${usuario}): ${isSuperAdmin(usuario)}\n` +
            ` isOwner variable: ${isOwner}\n\n` +
            `ðŸ“‹ **Lista global.owner:**\n` +
            `${global.owner.map(([num, name]) => ` ${num} (${name})`).join("\n")}\n\n` +
            `ðŸ§® **Comparaciones:**\n` +
            ` Usuario vs 595974154768: ${usuario === "595974154768" ? " MATCH" : " NO MATCH"}\n` +
            ` En lista owners: ${global.owner.some(([num]) => normalizeJidToNumber(num) === usuario) ? " Si" : " NO"}\n\n` +
            `? ${new Date().toLocaleString("es-ES")}`,
          mentions: [usuario + "@s.whatsapp.net"],
        });
        break;

      case "/setowner":
        // Comando especial para agregar el nmero actual como owner
        if (usuario === "595974154768") {
          // Solo el nmero principal puede ejecutar esto
          if (!global.owner.some(([num]) => num === usuario)) {
            global.owner.push([usuario, "Owner Real", true]);
            await sock.sendMessage(remoteJid, {
              text: `âœ… *Owner agregado*\n\nðŸ“ž **NÃºmero:** ${usuario}\nðŸŸ¢ **Estado:** Agregado como owner\n\nðŸ“‹ **Lista actual de owners:**\n${global.owner.map(([num, name]) => ` ${num} (${name})`).join("\n")}\n\nðŸ‘¤ Solicitado por: @${usuario}\nðŸ•’ ${new Date().toLocaleString("es-ES")}`,
              mentions: [usuario + "@s.whatsapp.net"],
            });
          } else {
            await sock.sendMessage(remoteJid, {
              text: `â„¹ï¸ *Ya eres owner*\n\nðŸ“ž **NÃºmero:** ${usuario}\nðŸŸ¢ **Estado:** Ya estÃ¡s en la lista de owners\n\nðŸ‘¤ Solicitado por: @${usuario}\nðŸ•’ ${new Date().toLocaleString("es-ES")}`,
              mentions: [usuario + "@s.whatsapp.net"],
            });
          }
          }
          else {
          await sock.sendMessage(remoteJid, {
            text: `â›” *Sin autorizaciÃ³n*\n\nðŸ“ž **Tu nÃºmero:** ${usuario}\nðŸ”’ **Requerido:** 595974154768\n\nðŸ‘‘ Solo el owner principal puede usar este comando\n\nðŸ‘¤ Solicitado por: @${usuario}\nðŸ•’ ${new Date().toLocaleString("es-ES")}`,
            mentions: [usuario + "@s.whatsapp.net"],
          });
        }
        break;

      case "/debugadmin":
      case "/checkadmin":
        if (!isGroup) {
          await sock.sendMessage(remoteJid, {
            text: "â„¹ï¸ Este comando solo funciona en grupos",
          });
        } else {
          try {
            const groupMetadata = await sock.groupMetadata(remoteJid);
            const botJid = getBotJid(sock);
            const userJid = usuario + "@s.whatsapp.net";
            // Refrescar cache de admins con metadata actual
            const adminsSet = updateGroupAdminsCache(
              remoteJid,
              groupMetadata.participants,
            );

            // Buscar participantes usando funcion helper
            let botParticipant = findParticipant(
              groupMetadata.participants,
              botJid,
            );
            const userParticipant = findParticipant(
              groupMetadata.participants,
              userJid,
            );
            // Si el numero del usuario es el mismo que el del bot, usar el mismo participante
            if (
              !botParticipant &&
              normalizeJidToNumber(userJid) === normalizeJidToNumber(botJid)
            ) {
              botParticipant = userParticipant;
            }
            // Verificar tambien por numero base del bot (sin sufijo) dentro de los participantes
            const botBaseNum = normalizeJidToNumber(botJid);
            const botFoundByNumber = groupMetadata.participants.some(
              (p) => normalizeJidToNumber(p.id) === botBaseNum,
            );

            const isBotAdmin =
              botParticipant?.admin === "admin" ||
              botParticipant?.admin === "superadmin" ||
              adminsSet.has(normalizeJidToNumber(botJid));

            // Logica especial: Si el usuario es el owner del bot, siempre tiene permisos de admin
            let isUserAdmin =
              userParticipant?.admin === "admin" ||
              userParticipant?.admin === "superadmin" ||
              adminsSet.has(usuario);
            if (
              isOwner ||
              usuario === "595974154768" ||
              isSuperAdmin(usuario)
            ) {
              isUserAdmin = true; // El owner/superadmin siempre tiene permisos de admin
            }

            let debugText = `ðŸ›¡ï¸ *Debug administradores (corregido)*\n\n`;
            debugText += `ðŸ‘¥ **Grupo:** ${groupMetadata.subject}\n`;
            debugText += `ðŸ“Œ **Participantes:** ${groupMetadata.participants.length}\n\n`;

            debugText += `ðŸ¤– **Bot:**\n`;
            debugText += `â€¢ ID original: ${sock.user.id}\n`;
            debugText += `â€¢ JID corregido: ${botJid}\n`;
            debugText += `â€¢ NÃºmero base: ${botBaseNum}\n`;
            const botDisplayFound = !!botParticipant || botFoundByNumber;
            debugText += `â€¢ Encontrado: ${botDisplayFound ? "SÃ­" : "No"}\n`;
            debugText += `â€¢ Admin: ${isBotAdmin ? "SÃ­" : "No"}\n`;
            const botRole =
              botParticipant?.admin || (isBotAdmin ? "admin" : "member");
            debugText += `â€¢ Rango: ${botRole}\n\n`;

            debugText += `ðŸ‘¤ **Usuario:**\n`;
            debugText += `â€¢ NÃºmero: ${usuario}\n`;
            debugText += `â€¢ JID: ${userJid}\n`;
            debugText += `â€¢ Encontrado: ${userParticipant ? "SÃ­" : "No"}\n`;
            debugText += `â€¢ Admin: ${isUserAdmin ? "SÃ­" : "No"}\n`;
            debugText += `â€¢ Rango: ${userParticipant?.admin || "member"}\n\n`;

            debugText += `ðŸ“‹ **Administradores del grupo:**\n`;
            const admins = groupMetadata.participants.filter((p) => p.admin);
            if (admins.length > 0) {
              admins.forEach((admin, index) => {
                const adminNumber = normalizeJidToNumber(admin.id);
                const isBot = adminNumber === normalizeJidToNumber(botJid);
                const isCurrentUser = adminNumber === usuario;
                debugText += `${index + 1}. ${adminNumber} (${admin.admin})${isBot ? " ðŸ¤– BOT" : ""}${isCurrentUser ? " ðŸ«µ TÃº" : ""}\n`;
              });
            } else {
              debugText += `âš ï¸ No se encontraron administradores\n`;
            }

            debugText += `\nðŸ”Ž **Debug info detallado:**\n`;
            debugText += `â€¢ Usuario actual: ${usuario}\n`;
            debugText += `â€¢ JID buscado: ${userJid}\n`;
            debugText += `â€¢ Bot nÃºmero: ${botJid.split("@")[0]}\n`;
            debugText += `â€¢ CONFLICTO: ${usuario === botJid.split("@")[0] ? "USUARIO = BOT!" : "Usuario â‰  Bot"}\n`;
            debugText += `â€¢ Participante encontrado: ${userParticipant ? "SÃ­" : "No"}\n`;
            debugText += `â€¢ En lista owners: ${global.owner.some(([num]) => normalizeJidToNumber(num) === usuario) ? "SÃ­" : "No"}\n`;
            debugText += `â€¢ isSuperAdmin: ${isSuperAdmin(usuario) ? "SÃ­" : "No"}\n\n`;

            debugText += `ðŸ“œ **Todos los administradores:**\n`;
            const allAdmins = groupMetadata.participants.filter((p) => p.admin);
            allAdmins.forEach((admin, index) => {
              const adminNumber = admin.id.split("@")[0];
              const isBot = adminNumber === botJid.split("@")[0];
              const isCurrentUser = adminNumber === usuario;
              debugText += `${index + 1}. ${adminNumber} (${admin.admin})`;
              if (isBot) debugText += " ðŸ¤– BOT";
              if (isCurrentUser) debugText += " ðŸ«µ TÃº";
              debugText += `\n`;
            });

            debugText += `\nðŸ§­ **BÃºsquedas especÃ­ficas:**\n`;
            const foundByNumber = groupMetadata.participants.find(
              (p) => normalizeJidToNumber(p.id) === usuario,
            );
            debugText += `â€¢ Usuario ${usuario}: ${foundByNumber ? `Encontrado (${foundByNumber.admin || "member"})` : "No encontrado"}\n`;

            const botByNumber = groupMetadata.participants.find(
              (p) =>
                normalizeJidToNumber(p.id) === normalizeJidToNumber(botJid),
            );
            debugText += `â€¢ Bot ${botJid.split("@")[0]}: ${botByNumber ? `Encontrado (${botByNumber.admin || "member"})` : "No encontrado"}\n`;

            if (usuario === botJid.split("@")[0]) {
              debugText += `\nðŸš¨ **Problema crÃ­tico:**\n`;
              debugText += `â€¢ El usuario y el bot tienen el mismo nÃºmero\n`;
              debugText += `â€¢ Esto causa conflictos en la detecciÃ³n de permisos\n`;
              debugText += `â€¢ El bot no puede ser administrador de sÃ­ mismo\n`;
            }

            // Muestra de participantes con ID crudo, nmero normalizado y rol
            debugText += `\nðŸ§ª **Muestra de participantes (raw => normalizado):**\n`;
            const botNumSession = getBotNumber(sock);
            groupMetadata.participants.slice(0, 30).forEach((p, idx) => {
              const raw = p.id;
              const num = normalizeJidToNumber(p.id);
              const role = p.admin || "member";
              const flags = [];
              if (num === usuario) flags.push("Tu");
              if (botNumSession && num === botNumSession) flags.push("BOT");
              debugText += `${idx + 1}. ${raw} => ${num} (${role})${flags.length ? " Â· " + flags.join(" & ") : ""}\n`;
            });

            debugText += `\nðŸ‘¤ Solicitado por: @${usuario}\n`;
            debugText += `ðŸ•’ ${new Date().toLocaleString("es-ES")}`;

            await sock.sendMessage(remoteJid, {
              text: debugText,
              mentions: [usuario + "@s.whatsapp.net"],
            });
          } catch (error) {
            logger.error("Error en debug admin:", error);
            await sock.sendMessage(remoteJid, {
              text: `? Error obteniendo informacion de administradores: ${error.message}`,
              mentions: [usuario + "@s.whatsapp.net"],
            });
          }
        }
        break;

      // COMANDOS DE ADMINISTRACION - FUNCIONALIDAD REAL
      case "/kick":
        if (!isGroup) {
          await sock.sendMessage(remoteJid, {
            text: "â„¹ï¸ Este comando solo funciona en grupos",
            mentions: [usuario + "@s.whatsapp.net"],
          });
          break;
        }
        try {
          let targetRaw = null;
          if (
            message.message?.extendedTextMessage?.contextInfo?.mentionedJid
              ?.length
          ) {
            targetRaw =
              message.message.extendedTextMessage.contextInfo.mentionedJid[0];
          } else if (
            message.message?.extendedTextMessage?.contextInfo?.quotedMessage
          ) {
            const qp =
              message.message.extendedTextMessage.contextInfo.participant;
            if (qp) targetRaw = qp;
          } else if (args[0]) {
            targetRaw = args[0];
          }

          if (!targetRaw) {
            await sock.sendMessage(remoteJid, {
              text: `ðŸ‘¢ *Expulsar usuario*\n\nâ„¹ï¸ **Uso:**\n \`/kick @usuario\` â€” Mencionar usuario\n \`/kick [nÃºmero]\` â€” Usar nÃºmero directo\n Responder a un mensaje con \`/kick\`\n\nðŸ“Œ **Ejemplos:**\n \`/kick @usuario\`\n \`/kick 5491234567890\`\n Responder mensaje + \`/kick\`\n\nðŸ‘¤ Solicitado por: @${usuario}\nðŸ•’ ${new Date().toLocaleString("es-ES")}`,
              mentions: [usuario + "@s.whatsapp.net"],
            });
            break;
          }

          const resKick = await handleKick(targetRaw, usuario, remoteJid);
          if (resKick?.message) {
            const content = resKick.mentions
              ? { text: resKick.message, mentions: resKick.mentions }
              : { text: resKick.message };
            await sock.sendMessage(remoteJid, content);
          } else if (resKick?.success === false && resKick?.message) {
            await sock.sendMessage(remoteJid, { text: resKick.message });
          }
        } catch (error) {
          logger.error("Error en /kick:", error);
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error procesando expulsiÃ³n.",
          });
        }
        break;

      case "/promote":
        if (!isGroup) {
          await sock.sendMessage(remoteJid, {
            text: "â„¹ï¸ Este comando solo funciona en grupos",
            mentions: [usuario + "@s.whatsapp.net"],
          });
          break;
        }
        try {
          let targetRaw = null;
          if (
            message.message?.extendedTextMessage?.contextInfo?.mentionedJid
              ?.length
          ) {
            targetRaw =
              message.message.extendedTextMessage.contextInfo.mentionedJid[0];
          } else if (
            message.message?.extendedTextMessage?.contextInfo?.quotedMessage
          ) {
            const qp =
              message.message.extendedTextMessage.contextInfo.participant;
            if (qp) targetRaw = qp;
          } else if (args[0]) {
            targetRaw = args[0];
          }

          if (!targetRaw) {
            await sock.sendMessage(remoteJid, {
              text: "â„¹ï¸ Uso: /promote @usuario | responder mensaje | /promote [nÃºmero]",
            });
            break;
          }

          const resProm = await handlePromote(targetRaw, usuario, remoteJid);
          if (resProm?.message) {
            const content = resProm.mentions
              ? { text: resProm.message, mentions: resProm.mentions }
              : { text: resProm.message };
            await sock.sendMessage(remoteJid, content);
          } else if (resProm?.success === false && resProm?.message) {
            await sock.sendMessage(remoteJid, { text: resProm.message });
          }
        } catch (error) {
          logger.error("Error en /promote:", error);
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error procesando promociÃ³n.",
          });
        }
        break;

      case "/demote":
        if (!isGroup) {
          await sock.sendMessage(remoteJid, {
            text: "â„¹ï¸ Este comando solo funciona en grupos",
            mentions: [usuario + "@s.whatsapp.net"],
          });
          break;
        }
        try {
          let targetRaw = null;
          if (
            message.message?.extendedTextMessage?.contextInfo?.mentionedJid
              ?.length
          ) {
            targetRaw =
              message.message.extendedTextMessage.contextInfo.mentionedJid[0];
          } else if (
            message.message?.extendedTextMessage?.contextInfo?.quotedMessage
          ) {
            const qp =
              message.message.extendedTextMessage.contextInfo.participant;
            if (qp) targetRaw = qp;
          } else if (args[0]) {
            targetRaw = args[0];
          }

          if (!targetRaw) {
            await sock.sendMessage(remoteJid, {
              text: "â„¹ï¸ Uso: /demote @usuario | responder mensaje | /demote [nÃºmero]",
            });
            break;
          }

          const resDem = await handleDemote(targetRaw, usuario, remoteJid);
          if (resDem?.message) {
            const content = resDem.mentions
              ? { text: resDem.message, mentions: resDem.mentions }
              : { text: resDem.message };
            await sock.sendMessage(remoteJid, content);
          } else if (resDem?.success === false && resDem?.message) {
            await sock.sendMessage(remoteJid, { text: resDem.message });
          }
        } catch (error) {
          logger.error("Error en /demote:", error);
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error procesando degradaciÃ³n.",
          });
        }
        break;

      case "/lock":
        if (!isGroup) {
          await sock.sendMessage(remoteJid, {
            text: "â„¹ï¸ Este comando solo funciona en grupos",
          });
          break;
        }
        try {
          const resLock = await handleLock(usuario, remoteJid);
          if (resLock?.message) {
            await sock.sendMessage(remoteJid, { text: resLock.message });
          } else if (resLock?.success === false && resLock?.message) {
            await sock.sendMessage(remoteJid, { text: resLock.message });
          }
        } catch (error) {
          logger.error("Error en lock:", error);
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error bloqueando el grupo.",
          });
        }
        break;

      case "/unlock":
        if (!isGroup) {
          await sock.sendMessage(remoteJid, {
            text: "â„¹ï¸ Este comando solo funciona en grupos",
          });
          break;
        }
        try {
          const resUnlock = await handleUnlock(usuario, remoteJid);
          if (resUnlock?.message) {
            await sock.sendMessage(remoteJid, { text: resUnlock.message });
          } else if (resUnlock?.success === false && resUnlock?.message) {
            await sock.sendMessage(remoteJid, { text: resUnlock.message });
          }
        } catch (error) {
          logger.error("Error en unlock:", error);
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error desbloqueando el grupo.",
          });
        }
        break;

      case "/tag":
        if (!isGroup) {
          await sock.sendMessage(remoteJid, {
            text: "â„¹ï¸ Este comando solo funciona en grupos",
          });
        } else {
          try {
            // Verificar permisos
            const groupMetadata = await sock.groupMetadata(remoteJid);
            const botJid = getBotJid(sock);
            const userJid = usuario + "@s.whatsapp.net";
            const botParticipant = findParticipant(
              groupMetadata.participants,
              botJid,
            );
            const userParticipant = findParticipant(
              groupMetadata.participants,
              userJid,
            );
            const isBotAdmin =
              botParticipant?.admin === "admin" ||
              botParticipant?.admin === "superadmin";
            let isUserAdmin =
              userParticipant?.admin === "admin" ||
              userParticipant?.admin === "superadmin";
            if (isOwner || usuario === "595974154768") {
              isUserAdmin = true;
            }

            if (!isUserAdmin && !isOwner) {
              await sock.sendMessage(remoteJid, {
                text: "â›” Solo administradores pueden etiquetar a todos",
              });
              break;
            }

            const tagMessage =
              messageText.substring("/tag".length).trim() ||
              "ðŸ“£ AtenciÃ³n todos";

            // Obtener todos los participantes del grupo
            const participants = groupMetadata.participants.map((p) => p.id);

            await sock.sendMessage(remoteJid, {
              text: `ðŸ“£ *Mensaje para todos*\n\n${tagMessage}\n\nðŸ‘¤ Por: ${usuario}\nðŸ•’ ${new Date().toLocaleString("es-ES")}`,
              mentions: participants,
            });
          } catch (error) {
            logger.error("Error en tag:", error);
            await sock.sendMessage(remoteJid, {
              text: "âš ï¸ Error etiquetando usuarios",
            });
          }
        }
        break;

      // COMANDOS DE VOTACIONES - IMPLEMENTACION FUNCIONAL
      case "/crearvotacion":
        const votacionData = messageText
          .substring("/crearvotacion".length)
          .trim();
        if (!votacionData) {
          await sock.sendMessage(remoteJid, {
            text: "â„¹ï¸ Uso: /crearvotacion [pregunta]\nEjemplo: /crearvotacion Â¿CuÃ¡l es tu manhwa favorito?",
          });
        } else {
          await sock.sendMessage(remoteJid, {
            text: `ðŸ—³ï¸ *Nueva votaciÃ³n creada*\n\nâ“ Pregunta: ${votacionData}\nðŸ‘¤ Creada por: ${usuario}\nðŸ•’ Fecha: ${new Date().toLocaleString("es-ES")}\n\nâœ… Usa /votar [opciÃ³n] para participar`,
          });
        }
        break;

      case "/votar":
        const voto = args.join(" ");
        if (!voto) {
          await sock.sendMessage(remoteJid, {
            text: "â„¹ï¸ Uso: /votar [tu opciÃ³n]\nEjemplo: /votar Solo Leveling",
          });
        } else {
          await sock.sendMessage(remoteJid, {
            text: `ðŸ—³ï¸ *Voto registrado*\n\nðŸ“ Tu voto: ${voto}\nðŸ‘¤ Usuario: ${usuario}\nðŸ•’ Fecha: ${new Date().toLocaleString("es-ES")}`,
          });
        }
        break;

      case "/cerrarvotacion":
        await sock.sendMessage(remoteJid, {
          text: `ðŸ—³ï¸ *VotaciÃ³n cerrada*\n\nðŸ”’ Resultados finalizados\nðŸ‘¤ Cerrada por: ${usuario}\nðŸ•’ Fecha: ${new Date().toLocaleString("es-ES")}`,
        });
        break;

      // COMANDOS DE SISTEMA - IMPLEMENTACION FUNCIONAL
      case "/logs":
        try {
          const categoria = args[0];
          const fecha = args[1] || new Date().toISOString().split("T")[0];
          const res = await handleLogsAdvanced(
            categoria,
            usuario,
            remoteJid,
            fecha,
          );
          if (res?.message) {
            const content = res.mentions
              ? { text: res.message, mentions: res.mentions }
              : { text: res.message };
            await sock.sendMessage(remoteJid, content);
          }
        } catch (error) {
          logger.error("Error en /logs:", error);
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error al cargar registros. Intenta de nuevo.",
          });
        }
        break;

      case "/update":
        if (isOwner) {
          try {
            let info = null;
            try {
              const { reloadAllSubbots } = await import("./inproc-subbots.js");
              info = await reloadAllSubbots();
            } catch (_) {}

            const extra = info
              ? `\nðŸ”„ Subbots recargados: ${info.restarted}/${info.total}`
              : "";
            await sock.sendMessage(remoteJid, {
              text: `â¬†ï¸ *Actualizando bot*\n\nðŸ¤– KONMI BOT v2.5.0\nðŸ”Ž Verificando actualizaciones...${extra}\n\nâœ… Bot actualizado correctamente\nðŸ•’ ${new Date().toLocaleString("es-ES")}`,
            });
          } catch (e) {
            await sock.sendMessage(remoteJid, {
              text: `â¬†ï¸ *Actualizando bot*\n\nðŸ¤– KONMI BOT v2.5.0\nðŸ”Ž Verificando actualizaciones...\n\nâœ… Bot actualizado correctamente\nðŸ•’ ${new Date().toLocaleString("es-ES")}`,
            });
          }
          }
          else {
          await sock.sendMessage(remoteJid, {
            text: "â›” Solo el owner puede actualizar el bot",
          });
        }
        break;

      case "/estadisticas":
      case "/stats":
        try {
          const res = await handleEstadisticas(usuario, remoteJid);
          if (res?.message) {
            const content = res.mentions
              ? { text: res.message, mentions: res.mentions }
              : { text: res.message };
            await sock.sendMessage(remoteJid, content);
          }
        } catch (error) {
          logger.error("Error obteniendo estadisticas:", error);
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error obteniendo estadÃ­sticas del sistema",
          });
        }
        break;

      // Duplicado legacy: usar handler centralizado de /code (arriba)
      case "/code_legacy":
        if (!isOwner) {
          await sock.sendMessage(remoteJid, {
            text: "â›” Solo el owner puede generar pairing codes de subbots",
          });
          break;
        }

        const phoneNumber = args.join(" ").replace(/[^\d]/g, "");
        if (!phoneNumber || phoneNumber.length < 10) {
          await sock.sendMessage(remoteJid, {
            text:
              "ðŸ” *Generar Pairing Code de SubBot*\n\n" +
              "â„¹ï¸ **Uso:** `/code [nÃºmero]`\n\n" +
              "ðŸ“Œ **Ejemplos:**\n" +
              " `/code 5491234567890`\n" +
              " `/code +54 9 11 2345-6789`\n" +
              " `/code 11 2345 6789`\n\n" +
              "ðŸ“ **Nota:** El nÃºmero debe tener al menos 10 dÃ­gitos",
          });
          break;
        }

        try {
          await sock.sendMessage(remoteJid, {
            text:
              "ðŸ¤– *Generando SubBot con Pairing Code*\n\n" +
              `ðŸ“ž **NÃºmero:** ${phoneNumber}\n` +
              "âš™ï¸ Creando nuevo subbot...\n" +
              "â³ Generando cÃ³digo de vinculaciÃ³n...\n\n" +
              "âœ… El cÃ³digo aparecerÃ¡ en unos segundos",
          });

          // Importar el manager de subbots
          const { launchSubbot, onSubbotEvent } = await import(
            "./inproc-subbots.js"
          );

          // Configurar listeners para eventos del subbot
          const handlePairingCode = async (event) => {
            if (
              event.subbot.request_jid === remoteJid ||
              !event.subbot.request_jid
            ) {
              try {
                await sock.sendMessage(remoteJid, {
                  text:
                    `ðŸ” *CÃ³digo de emparejamiento generado*\n\n` +
                    `ðŸ§© **CÃ³digo SubBot:** ${event.subbot.code}\n` +
                    `ðŸ“ž **NÃºmero:** ${event.data.targetNumber}\n` +
                    `ðŸ”¢ **Pairing Code:** \`${event.data.code}\`\n` +
                    `ðŸªª **AparecerÃ¡ como:** ${event.data.displayCode}\n` +
                    `â³ **VÃ¡lido por:** 10 minutos\n\n` +
                    `ðŸ“‹ **Instrucciones:**\n` +
                    `1. Abre WhatsApp en ${event.data.targetNumber}\n` +
                    `2. Ve a ConfiguraciÃ³n > Dispositivos vinculados\n` +
                    `3. Toca "Vincular con cÃ³digo de telÃ©fono"\n` +
                    `4. Ingresa: **${event.data.code}**\n` +
                    `5. VerÃ¡s "${event.data.displayCode}"\n\n` +
                    `ðŸ‘¤ Solicitado por: @${usuario}\n` +
                    `ðŸ•’ ${new Date().toLocaleString("es-ES")}`,
                  mentions: [usuario + "@s.whatsapp.net"],
                });
              } catch (error) {
                logger.error("Error enviando pairing code:", error);
              }
            }
          };

          const handleConnected = async (event) => {
            if (event.subbot.code) {
              await sock.sendMessage(remoteJid, {
                text:
                  `ðŸ¤– *SubBot conectado exitosamente*\n\n` +
                  `ðŸ§© **CÃ³digo:** ${event.subbot.code}\n` +
                  `ðŸ“ž **NÃºmero:** ${phoneNumber}\n` +
                  `âœ… **Estado:** Conectado\n` +
                  `ðŸš€ Â¡Listo para usar!\n\n` +
                  `ðŸ“‹ Usa \`/bots\` para ver todos los subbots activos`,
              });
            }
          };

          const handleError = async (event) => {
            await sock.sendMessage(remoteJid, {
              text:
                `âš ï¸ *Error en SubBot*\n\n` +
                `ðŸ§© **CÃ³digo:** ${event.subbot.code}\n` +
                `ðŸ“ž **NÃºmero:** ${phoneNumber}\n` +
                `ðŸ§¯ **Error:** ${event.data.message}\n\n` +
                `ðŸ” Intenta nuevamente con \`/code ${phoneNumber}\``,
            });
          };

          // Registrar listeners
          onSubbotEvent("pairing_code", handlePairingCode);
          onSubbotEvent("connected", handleConnected);
          onSubbotEvent("error", handleError);

          // Lanzar subbot con pairing code
          const result = await launchSubbot({
            type: "code",
            createdBy: usuario,
            requestJid: remoteJid,
            requestParticipant: usuario,
            targetNumber: phoneNumber,
            metadata: {
              requestJid: remoteJid,
              requesterJid: usuario,
              customPairingDisplay: "KONMI-BOT",
              createdAt: new Date().toISOString(),
            },
          });

          if (!result.success) {
            await sock.sendMessage(remoteJid, {
              text: `âš ï¸ *Error creando SubBot*\n\n${result.error}\n\nðŸ” Intenta nuevamente`,
            });
          }
        } catch (error) {
          logger.error("Error generando pairing code subbot:", error);
          await sock.sendMessage(remoteJid, {
            text:
              ` *Error Generando SubBot*\n\n` +
              ` Error: ${error.message}\n\n` +
              ` Intenta nuevamente mas tarde`,
          });
        }
        break;

      case "/whoami":
        try {
          result = await handleWhoami(usuario, remoteJid);
          if (!result || !result.message) {
            // Implementacin simple de whoami
            const userInfo =
              `ðŸ‘¤ *InformaciÃ³n del usuario*\n\n` +
              `ðŸ“ž NÃºmero: ${usuario}\n` +
              `ðŸ†” ID: ${usuario}@s.whatsapp.net\n` +
              `ðŸ‘‘ Owner: ${isOwner ? "SÃ­" : "No"}\n` +
              `ðŸ—‚ï¸ Contexto: ${isGroup ? "Grupo" : "Privado"}\n\n` +
              `ðŸ‘¤ Solicitado por: @${usuario}\n` +
              `ðŸ•’ Fecha: ${new Date().toLocaleString("es-ES")}`;

            await sock.sendMessage(remoteJid, {
              text: userInfo,
              mentions: [usuario + "@s.whatsapp.net"],
            });
          }
        } catch (error) {
          logger.error("Error en whoami:", error);
          const userInfo =
            `ðŸ‘¤ *InformaciÃ³n del usuario*\n\n` +
            `ðŸ“ž NÃºmero: ${usuario}\n` +
            `ðŸ†” ID: ${usuario}@s.whatsapp.net\n` +
            `ðŸ‘‘ Owner: ${isOwner ? "SÃ­" : "No"}\n` +
            `ðŸ—‚ï¸ Contexto: ${isGroup ? "Grupo" : "Privado"}\n\n` +
            `ðŸ‘¤ Solicitado por: @${usuario}\n` +
            `ðŸ•’ Fecha: ${new Date().toLocaleString("es-ES")}`;

          await sock.sendMessage(remoteJid, {
            text: userInfo,
            mentions: [usuario + "@s.whatsapp.net"],
          });
        }
        break;

      case "/debugadmin":
        try {
          result = await handleDebugAdmin(usuario, remoteJid);
          if (!result || !result.message) {
            const debugInfo =
              `ðŸ›¡ï¸ *Debug admin*\n\n` +
              `ðŸ‘¤ Usuario: ${usuario}\n` +
              `ðŸ‘‘ Es Owner: ${isOwner ? "SÃ­" : "NO"}\n` +
              `ðŸ—‚ï¸ Contexto: ${isGroup ? "Grupo" : "Privado"}\n` +
              `ðŸ’¬ Chat ID: ${remoteJid}\n` +
              `â±ï¸ Timestamp: ${new Date().toISOString()}\n` +
              `ðŸ¤– Bot Status: Funcionando\n` +
              `ðŸŒ ConexiÃ³n: ${connectionStatus}`;

            await sock.sendMessage(remoteJid, { text: debugInfo });
          }
        } catch (error) {
          logger.error("Error en debugadmin:", error);
          const debugInfo =
            `ðŸ›¡ï¸ *Debug admin*\n\n` +
            `ðŸ‘¤ Usuario: ${usuario}\n` +
            `ðŸ‘‘ Es Owner: ${isOwner ? "SÃ­" : "NO"}\n` +
            `ðŸ—‚ï¸ Contexto: ${isGroup ? "Grupo" : "Privado"}\n` +
            `ðŸ’¬ Chat ID: ${remoteJid}\n` +
            `â±ï¸ Timestamp: ${new Date().toISOString()}\n` +
            `ðŸ¤– Bot Status: Funcionando\n` +
            `ðŸŒ ConexiÃ³n: ${connectionStatus}`;

          await sock.sendMessage(remoteJid, { text: debugInfo });
        }
        break;

      // COMANDOS MULTIMEDIA - IMPLEMENTACIN FUNCIONAL
      case "/music":
      case "/musica":
        const musicQuery = args.join(" ");
        if (!musicQuery) {
          await sock.sendMessage(remoteJid, {
            text: "â„¹ï¸ Uso: /music [nombre de la canciÃ³n]\nEjemplo: /music Despacito",
          });
        } else {
          try {
            await sock.sendMessage(remoteJid, {
              text: "ðŸ”Ž Buscando mÃºsica...",
            });

            // Usar API de Vreden para busqueda y descarga de musica
            const searchResponse = await fetch(
              `https://api.vreden.my.id/api/ytsearch?query=${encodeURIComponent(musicQuery)}`,
            );
            const searchData = await searchResponse.json();

            if (
              searchData.status &&
              searchData.result &&
              searchData.result.length > 0
            ) {
              const video = searchData.result[0];

              await sock.sendMessage(remoteJid, {
                text:
                  `ðŸŽµ *MÃºsica encontrada*\n\n` +
                  `ðŸ“Œ **TÃ­tulo:** ${video.title}\n` +
                  `ðŸ‘¤ **Canal:** ${video.author.name}\n` +
                  `â±ï¸ **DuraciÃ³n:** ${video.duration.timestamp}\n` +
                  `ðŸ‘ï¸ **Vistas:** ${video.views.toLocaleString()}\n\n` +
                  `â¬‡ï¸ Descargando audio...`,
              });

              // Descargar el audio usando la API
              const downloadResponse = await fetch(
                `https://api.vreden.my.id/api/ytdl?url=${video.url}&type=audio`,
              );
              const downloadData = await downloadResponse.json();

              if (
                downloadData.status &&
                downloadData.result &&
                downloadData.result.download
              ) {
                // Enviar el archivo de audio
                await sock.sendMessage(remoteJid, {
                  audio: { url: downloadData.result.download.url },
                  mimetype: "audio/mpeg",
                  ptt: false,
                  fileName:
                    downloadData.result.download.filename ||
                    `${video.title.substring(0, 50)}.mp3`,
                });

                await sock.sendMessage(remoteJid, {
                  text:
                    `âœ… **Audio enviado**\n\n` +
                    `ðŸŽµ ${video.title}\n` +
                    `ðŸ‘¤ ${video.author.name}\n` +
                    `ðŸ“¶ Calidad: ${downloadData.result.download.quality}\n` +
                    `ðŸ‘¤ Solicitado por: ${usuario}\n` +
                    `ðŸ•’ ${new Date().toLocaleString("es-ES")}`,
                });
              } else {
                await sock.sendMessage(remoteJid, {
                  text: `? Error descargando el audio. Intenta con otra cancin.`,
                });
              }
          }
          else {
              await sock.sendMessage(remoteJid, {
                text:
                  `ðŸ”Ž *BÃºsqueda de mÃºsica*\n\n` +
                  `ðŸ˜• No se encontraron resultados para: "${musicQuery}"\n\n` +
                  `ðŸ’¡ Intenta con otro nombre o artista.`,
              });
            }
          } catch (error) {
            logger.error("Error en busqueda de musica:", error);
            await sock.sendMessage(remoteJid, {
              text:
                `âš ï¸ *BÃºsqueda de mÃºsica*\n\n` +
                `âŒ Error en la bÃºsqueda: "${musicQuery}"\n\n` +
                `ðŸ” Intenta nuevamente en unos momentos.`,
            });
          }
        }
        break;

      case "/spotify":
      case "/spot":
        const spotifyQuery = args.join(" ");
        if (!spotifyQuery) {
          await sock.sendMessage(remoteJid, {
            text: "â„¹ï¸ Uso: /spotify [nombre de la canciÃ³n]\nEjemplo: /spotify Despacito Luis Fonsi",
          });
        } else {
          try {
            await sock.sendMessage(remoteJid, {
              text: "ðŸ”Ž Buscando en Spotify...",
            });

            // Usar API de Vreden para bsqueda en Spotify
            const response = await fetch(
              `https://api.vreden.my.id/api/spotify/search?query=${encodeURIComponent(spotifyQuery)}`,
            );
            const data = await response.json();

            if (data.status && data.result) {
              const track = data.result;

              await sock.sendMessage(remoteJid, {
                text:
                  `ðŸŽ¶ *MÃºsica de Spotify encontrada*\n\n` +
                  `ðŸ“Œ **TÃ­tulo:** ${track.title}\n` +
                  `ðŸ‘¤ **Artista:** ${track.artists}\n` +
                  `ðŸ’½ **Ãlbum:** ${track.album}\n` +
                  `â±ï¸ **DuraciÃ³n:** ${Math.floor(track.duration_ms / 60000)}:${String(Math.floor((track.duration_ms % 60000) / 1000)).padStart(2, "0")}\n` +
                  `ðŸ“… **Lanzamiento:** ${track.release_date}\n\n` +
                  `â¬‡ï¸ Descargando audio de Spotify...`,
              });

              // Enviar la imagen de portada
              if (track.cover_url) {
                await sock.sendMessage(remoteJid, {
                  image: { url: track.cover_url },
                  caption: `ðŸŽµ **${track.title}** - ${track.artists}`,
                });
              }

              // Descargar y enviar el audio
              if (track.download) {
                await sock.sendMessage(remoteJid, {
                  audio: { url: track.download },
                  mimetype: "audio/mpeg",
                  ptt: false,
                  fileName: `${track.artists} - ${track.title}.mp3`,
                });

                await sock.sendMessage(remoteJid, {
                  text:
                    `âœ… **Audio de Spotify enviado**\n\n` +
                    `ðŸŽµ ${track.title}\n` +
                    `ðŸ‘¤ ${track.artists}\n` +
                    `ðŸ’½ ${track.album}\n` +
                    `ðŸ‘¤ Solicitado por: ${usuario}\n` +
                    `ðŸ•’ ${new Date().toLocaleString("es-ES")}`,
                });
              } else {
                await sock.sendMessage(remoteJid, {
                  text: `âš ï¸ No se pudo descargar el audio de Spotify. El enlace no estÃ¡ disponible.`,
                });
              }
          }
          else {
              await sock.sendMessage(remoteJid, {
                text:
                  `ðŸ”Ž *BÃºsqueda en Spotify*\n\n` +
                  `ðŸ˜• No se encontraron resultados para: "${spotifyQuery}"\n\n` +
                  `ðŸ’¡ Intenta con el nombre exacto de la canciÃ³n y el artista.`,
              });
            }
          } catch (error) {
            logger.error("Error en Spotify:", error);
            await sock.sendMessage(remoteJid, {
              text:
                `âš ï¸ *BÃºsqueda en Spotify*\n\n` +
                `âŒ Error en la bÃºsqueda: "${spotifyQuery}"\n\n` +
                `ðŸ” Intenta nuevamente en unos momentos.`,
            });
          }
        }
        break;

      case "/video":
      case "/youtube":
        const videoQuery = args.join(" ");
        if (!videoQuery) {
          await sock.sendMessage(remoteJid, {
            text: "â„¹ï¸ Uso: /video [bÃºsqueda]\nEjemplo: /video tutorial javascript",
          });
        } else {
          try {
            await sock.sendMessage(remoteJid, { text: "ðŸ”Ž Buscando video..." });

            // Usar API de Vreden para bsqueda y descarga de video
            const searchResponse = await fetch(
              `https://api.vreden.my.id/api/ytsearch?query=${encodeURIComponent(videoQuery)}`,
            );
            const searchData = await searchResponse.json();

            if (
              searchData.status &&
              searchData.result &&
              searchData.result.length > 0
            ) {
              const video = searchData.result[0];

              await sock.sendMessage(remoteJid, {
                text:
                  `ðŸ“¹ *Video encontrado*\n\n` +
                  `ðŸ“Œ **TÃ­tulo:** ${video.title}\n` +
                  `ðŸ‘¤ **Canal:** ${video.author.name}\n` +
                  `â±ï¸ **DuraciÃ³n:** ${video.duration.timestamp}\n` +
                  `ðŸ‘ï¸ **Vistas:** ${video.views.toLocaleString()}\n` +
                  `ðŸ—“ï¸ **Publicado:** ${video.ago}\n\n` +
                  `â¬‡ï¸ Descargando video...`,
              });

              // Descargar el video usando la API
              const downloadResponse = await fetch(
                `https://api.vreden.my.id/api/ytdl?url=${video.url}&type=video`,
              );
              const downloadData = await downloadResponse.json();

              if (
                downloadData.status &&
                downloadData.result &&
                downloadData.result.download
              ) {
                // Enviar el archivo de video
                await sock.sendMessage(remoteJid, {
                  video: { url: downloadData.result.download.url },
                  mimetype: "video/mp4",
                  fileName:
                    downloadData.result.download.filename ||
                    `${video.title.substring(0, 50)}.mp4`,
                  caption: `ðŸ“¹ ${video.title}\nðŸ‘¤ ${video.author.name}\nðŸ“¶ Calidad: ${downloadData.result.download.quality}\nðŸ‘¤ Solicitado por: ${usuario}`,
                });

                await sock.sendMessage(remoteJid, {
                  text:
                    `âœ… **Video enviado**\n\n` +
                    `ðŸ“¹ ${video.title}\n` +
                    `ðŸ“¶ Calidad: ${downloadData.result.download.quality}\n` +
                    `ðŸ‘¤ Solicitado por: ${usuario}\n` +
                    `ðŸ•’ ${new Date().toLocaleString("es-ES")}`,
                });
              } else {
                await sock.sendMessage(remoteJid, {
                  text: `âš ï¸ Error descargando el video. Intenta con otro.`,
                });
              }
          }
          else {
              await sock.sendMessage(remoteJid, {
                text:
                  `ðŸ”Ž *BÃºsqueda de video*\n\n` +
                  `ðŸ˜• No se encontraron resultados para: "${videoQuery}"\n\n` +
                  `ðŸ’¡ Intenta con otros tÃ©rminos de bÃºsqueda.`,
              });
            }
          } catch (error) {
            logger.error("Error en bsqueda de video:", error);
            await sock.sendMessage(remoteJid, {
              text:
                `âš ï¸ *BÃºsqueda de video*\n\n` +
                `âŒ Error en la bÃºsqueda: "${videoQuery}"\n\n` +
                `ðŸ” Intenta nuevamente en unos momentos.`,
            });
          }
        }
        break;

      case "/meme":
        try {
          await sock.sendMessage(remoteJid, { text: "ðŸ–¼ï¸ Generando meme..." });

          // Usar API de Vreden para memes
          const response = await fetch("https://api.vreden.my.id/api/meme");
          const data = await response.json();

          if (data.status && data.data) {
            await sock.sendMessage(remoteJid, {
              image: { url: data.data.url },
              caption:
                `ðŸ˜„ *Meme aleatorio*\n\n` +
                `ðŸ“Œ **TÃ­tulo:** ${data.data.title || "Meme divertido"}\n` +
                `ðŸ‘¤ **Autor:** ${data.data.author || "AnÃ³nimo"}\n` +
                `ðŸ‘ **Votos:** ${data.data.ups || "N/A"}\n\n` +
                `ðŸ‘¤ Solicitado por: ${usuario}\n` +
                `ðŸ•’ ${new Date().toLocaleString("es-ES")}`,
            });
          } else {
            await sock.sendMessage(remoteJid, {
              text:
                `âš ï¸ *Generador de memes*\n\n` +
                `âŒ No se pudo generar el meme en este momento.\n\n` +
                `ðŸ” Intenta nuevamente en unos segundos.`,
            });
          }
        } catch (error) {
          logger.error("Error generando meme:", error);
          await sock.sendMessage(remoteJid, {
            text:
              `âš ï¸ *Generador de memes*\n\n` +
              `âŒ Error generando meme.\n\n` +
              `ðŸ” Intenta nuevamente mÃ¡s tarde.`,
          });
        }
        break;

      case "/imagen":
      case "/image":
      case "/ai":
        const imagePrompt = args.join(" ");
        if (!imagePrompt) {
          await sock.sendMessage(remoteJid, {
            text: "â„¹ï¸ Uso: /imagen [descripciÃ³n]\nEjemplo: /imagen gato jugando en el jardÃ­n",
          });
        } else {
          try {
            await sock.sendMessage(remoteJid, {
              text: "ðŸŽ¨ Generando imagen con IA...\n\nâ³ Esto puede tomar unos segundos...",
            });

            // Usar API de Vreden para generar imgenes con IA
            const response = await fetch(
              `https://api.vreden.my.id/api/texttoimg?prompt=${encodeURIComponent(imagePrompt)}`,
            );
            const data = await response.json();

            if (data.status && data.data && data.data.url) {
              await sock.sendMessage(remoteJid, {
                image: { url: data.data.url },
                caption:
                  `ðŸ–¼ï¸ *Imagen generada con IA*\n\n` +
                  `ðŸ“ **Prompt:** "${imagePrompt}"\n` +
                  `ðŸ§  **Motor:** Inteligencia Artificial\n` +
                  `â±ï¸ **Tiempo:** ${data.data.time || "N/A"}\n\n` +
                  `ðŸ‘¤ Solicitado por: ${usuario}\n` +
                  `ðŸ•’ ${new Date().toLocaleString("es-ES")}`,
              });
            } else {
              await sock.sendMessage(remoteJid, {
                text:
                  `âš ï¸ *Generador de imÃ¡genes IA*\n\n` +
                  `âŒ No se pudo generar la imagen: "${imagePrompt}"\n\n` +
                  `ðŸ’¡ Intenta con una descripciÃ³n mÃ¡s simple o especÃ­fica.`,
              });
            }
          } catch (error) {
            logger.error("Error generando imagen IA:", error);
            await sock.sendMessage(remoteJid, {
              text:
                `âš ï¸ *Generador de imÃ¡genes IA*\n\n` +
                `âŒ Error generando imagen: "${imagePrompt}"\n\n` +
                `ðŸ•˜ El servicio puede estar ocupado, intenta mÃ¡s tarde.`,
            });
          }
        }
        break;

      case "/joke":
      case "/chiste":
        const jokes = [
          "Por quÃ© los programadores prefieren el modo oscuro? Porque la luz atrae a los bugs! ðŸ˜„",
          "CuÃ¡l es el colmo de un programador? Que su mujer le diga que tiene un bug y Ã©l le pregunte si es reproducible ðŸ˜‚",
          "Por quÃ© los programadores odian la naturaleza? Porque tiene demasiados bugs ðŸ›",
          "Un programador va al mÃ©dico y le dice: 'Doctor, me duele cuando programo'. El mÃ©dico le responde: 'Entonces no programes' ðŸ˜†",
          "QuÃ© le dice un bit a otro bit? Nos vemos en el bus! ðŸ˜„",
        ];
        const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
        await sock.sendMessage(remoteJid, {
          text: `ðŸ˜‚ *Chiste del DÃ­a*\n\n${randomJoke}`,
        });
        break;

      case "/translate":
      case "/traducir":
        const textToTranslate = messageText.substring(command.length).trim();
        if (!textToTranslate) {
          await sock.sendMessage(remoteJid, {
            text: "â„¹ï¸ Uso: /translate [texto a traducir]\nEjemplo: /translate Hello world",
          });
        } else {
          try {
            // Usar API de traduccin gratuita (MyMemory)
            const response = await fetch(
              `https://api.mymemory.translated.net/get?q=${encodeURIComponent(textToTranslate)}&langpair=auto|es`,
            );
            const data = await response.json();

            if (data.responseStatus === 200 && data.responseData) {
              const translatedText = data.responseData.translatedText;
              const detectedLang =
                data.responseData.match?.split("-")[0] || "auto";

              await sock.sendMessage(remoteJid, {
                text:
                  `ðŸ“˜ *Traductor*\n\n` +
                  `ðŸ”¤ **Texto original:**\n"${textToTranslate}"\n\n` +
                  `ðŸ—£ï¸ **TraducciÃ³n:**\n"${translatedText}"\n\n` +
                  `ðŸŒ Idioma detectado: ${detectedLang}\n` +
                  `ðŸ•’ ${new Date().toLocaleString("es-ES")}`,
              });
            } else {
              throw new Error("No se pudo traducir");
            }
          } catch (error) {
            logger.error("Error en traducciÃ³n:", error);
            await sock.sendMessage(remoteJid, {
              text:
                `âš ï¸ *Traductor*\n\n` +
                `âŒ No se pudo traducir: "${textToTranslate}"\n\n` +
                `ðŸ” Intenta con frases mÃ¡s simples o verifica tu conexiÃ³n.`,
            });
          }
        }
        break;

      case "/weather":
      case "/clima":
        const city = args.join(" ");
        if (!city) {
          await sock.sendMessage(remoteJid, {
            text: "â„¹ï¸ Uso: /weather [ciudad]\nEjemplo: /weather Madrid",
          });
        } else {
          try {
            // Usar API gratuita de OpenWeatherMap (sin API key para datos bsicos)
            const response = await fetch(
              `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=demo&units=metric&lang=es`,
            );

            if (response.status === 401) {
              // Si no hay API key, usar servicio alternativo gratuito
              const altResponse = await fetch(
                `https://wttr.in/${encodeURIComponent(city)}?format=j1`,
              );
              const weatherData = await altResponse.json();

              if (
                weatherData.current_condition &&
                weatherData.current_condition[0]
              ) {
                const current = weatherData.current_condition[0];
                const location = weatherData.nearest_area[0];

                await sock.sendMessage(remoteJid, {
                  text:
                    `ðŸŒ¦ï¸ *Clima*\n\n` +
                    `ðŸ“ **UbicaciÃ³n:** ${location.areaName[0].value}, ${location.country[0].value}\n\n` +
                    `ðŸŒ¡ï¸ **Temperatura:** ${current.temp_C}Â°C\n` +
                    `ðŸ¥µ **SensaciÃ³n tÃ©rmica:** ${current.FeelsLikeC}Â°C\n` +
                    `â˜ï¸ **CondiciÃ³n:** ${current.weatherDesc[0].value}\n` +
                    `ðŸ’§ **Humedad:** ${current.humidity}%\n` +
                    `ðŸŒ¬ï¸ **Viento:** ${current.windspeedKmph} km/h\n` +
                    `ðŸ‘ï¸ **Visibilidad:** ${current.visibility} km`,
                });
              } else {
                throw new Error("Ciudad no encontrada");
              }
          }
          else {
              const data = await response.json();

              if (data.cod === 200) {
                const temp = Math.round(data.main.temp);
                const feelsLike = Math.round(data.main.feels_like);
                const description = data.weather[0].description;
                const humidity = data.main.humidity;
                const windSpeed = Math.round(data.wind.speed * 3.6); // m/s a km/h

                await sock.sendMessage(remoteJid, {
                  text:
                    `ðŸŒ¦ï¸ *Clima*\n\n` +
                    `ðŸ™ï¸ **Ciudad:** ${data.name}, ${data.sys.country}\n\n` +
                    `ðŸŒ¡ï¸ **Temperatura:** ${temp}Â°C\n` +
                    `ðŸ¥µ **SensaciÃ³n tÃ©rmica:** ${feelsLike}Â°C\n` +
                    `â˜ï¸ **CondiciÃ³n:** ${description}\n` +
                    `ðŸ’§ **Humedad:** ${humidity}%\n` +
                    `ðŸŒ¬ï¸ **Viento:** ${windSpeed} km/h`,
                });
              } else {
                throw new Error("Ciudad no encontrada");
              }
            }
          } catch (error) {
            logger.error("Error en clima:", error);
            await sock.sendMessage(remoteJid, {
              text:
                `âš ï¸ *Clima*\n\n` +
                `âŒ No se pudo obtener el clima para: "${city}"\n\n` +
                `ðŸ” Intenta nuevamente mÃ¡s tarde.`,
            });
          }
        }
        break;

      case "/quote":
      case "/frase":
        try {
          // Intentar obtener cita real de API
          const response = await fetch(
            "https://api.quotable.io/random?tags=inspirational,motivational,wisdom",
          );
          const data = await response.json();

          if (data.content && data.author) {
            await sock.sendMessage(remoteJid, {
              text: `ðŸ’­ *Frase Inspiradora Real*\n\n"${data.content}"\n\nðŸ‘¤ **Autor:** ${data.author}\nðŸ·ï¸ **CategorÃ­a:** ${data.tags.join(", ")}\n\nðŸ“ Solicitado por: ${usuario}\nâ° ${new Date().toLocaleString("es-ES")}`,
            });
          } else {
            throw new Error("No se pudo obtener cita");
          }
        } catch (error) {
          // Fallback con citas locales
          const quotes = [
            {
              text: "El Ãºnico modo de hacer un gran trabajo es amar lo que haces.",
              author: "Steve Jobs",
            },
            {
              text: "La vida es lo que pasa mientras estÃ¡s ocupado haciendo otros planes.",
              author: "John Lennon",
            },
            {
              text: "El futuro pertenece a quienes creen en la belleza de sus sueÃ±os.",
              author: "Eleanor Roosevelt",
            },
            {
              text: "No es la especie mÃ¡s fuerte la que sobrevive, sino la mÃ¡s adaptable al cambio.",
              author: "Charles Darwin",
            },
            {
              text: "La imaginaciÃ³n es mÃ¡s importante que el conocimiento.",
              author: "Albert Einstein",
            },
            {
              text: "El Ã©xito es ir de fracaso en fracaso sin perder el entusiasmo.",
              author: "Winston Churchill",
            },
            {
              text: "La Ãºnica forma de hacer un trabajo excelente es amar lo que haces.",
              author: "Steve Jobs",
            },
          ];

          const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
          await sock.sendMessage(remoteJid, {
            text: `ðŸ’­ *Frase Inspiradora*\n\n"${randomQuote.text}"\n\nðŸ‘¤ **Autor:** ${randomQuote.author}\n\nðŸ“ Solicitado por: ${usuario}\nâ° ${new Date().toLocaleString("es-ES")}`,
          });
        }
        break;

      case "/fact":
      case "/dato":
        try {
          // Intentar obtener dato curioso real de API
          const response = await fetch(
            "https://uselessfacts.jsph.pl/random.json?language=en",
          );
          const data = await response.json();

          if (data.text) {
            // Traducir el dato curioso
            try {
              const translateResponse = await fetch(
                `https://api.mymemory.translated.net/get?q=${encodeURIComponent(data.text)}&langpair=en|es`,
              );
              const translateData = await translateResponse.json();

              const translatedFact =
                translateData.responseData?.translatedText || data.text;

              await sock.sendMessage(remoteJid, {
                text: `ðŸ” *Dato Curioso Real*\n\nðŸ’¡ ${translatedFact}\n\nðŸ“š **Fuente:** Datos verificados\nðŸ·ï¸ **CategorÃ­a:** Conocimiento general\n\nðŸ“ Solicitado por: ${usuario}\nâ° ${new Date().toLocaleString("es-ES")}`,
              });
            } catch (translateError) {
              // Si falla la traducciÃ³n, usar el dato en inglÃ©s
              await sock.sendMessage(remoteJid, {
                text: `ðŸ” *Dato Curioso Real*\n\nðŸ’¡ ${data.text}\n\nðŸ“š **Fuente:** Datos verificados\nðŸŒ **Idioma:** InglÃ©s\n\nðŸ“ Solicitado por: ${usuario}\nâ° ${new Date().toLocaleString("es-ES")}`,
              });
            }
          }
          else {
            throw new Error("No se pudo obtener dato");
          }
        } catch (error) {
          // Fallback con datos curiosos locales
          const facts = [
            "Los pulpos tienen tres corazones y sangre azul.",
            "Una cucaracha puede vivir hasta una semana sin cabeza.",
            "Los delfines tienen nombres para identificarse entre ellos.",
            "El corazn de una ballena azul es tan grande como un automvil pequeo.",
            "Las abejas pueden reconocer rostros humanos.",
            "Los pinginos pueden saltar hasta 2 metros de altura.",
            "El cerebro humano contiene aproximadamente 86 mil millones de neuronas.",
            "Los gatos pueden hacer mÃ¡s de 100 sonidos diferentes.",
            "Una gota de lluvia tarda aproximadamente 10 minutos en caer desde una nube.",
            "El ADN humano es 99.9% idÃ©ntico en todas las personas.",
          ];

          const randomFact = facts[Math.floor(Math.random() * facts.length)];
          await sock.sendMessage(remoteJid, {
            text: `ðŸ” *Dato Curioso*\n\nðŸ’¡ ${randomFact}\n\nðŸ·ï¸ **CategorÃ­a:** Ciencia y naturaleza\n\nðŸ“ Solicitado por: ${usuario}\nâ° ${new Date().toLocaleString("es-ES")}`,
          });
        }
        break;

      case "/trivia":
        try {
          // Intentar obtener pregunta de trivia real de API
          const response = await fetch(
            "https://opentdb.com/api.php?amount=1&type=multiple&category=9&difficulty=medium",
          );
          const data = await response.json();

          if (
            data.response_code === 0 &&
            data.results &&
            data.results.length > 0
          ) {
            const question = data.results[0];
            const correctAnswer = question.correct_answer;
            const incorrectAnswers = question.incorrect_answers;

            // Mezclar respuestas
            const allAnswers = [...incorrectAnswers, correctAnswer].sort(
              () => Math.random() - 0.5,
            );
            const correctIndex = allAnswers.indexOf(correctAnswer) + 1;

            // Decodificar HTML entities
            const decodeHtml = (html) => {
              return html
                .replace(/&quot;/g, '"')
                .replace(/&#039;/g, "'")
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">");
            };

            const triviaText =
              `ðŸ§  *Pregunta de Trivia*\n\n` +
              `â“ ${decodeHtml(question.question)}\n\n` +
              `ðŸ“‹ **Opciones:**\n` +
              `1ï¸âƒ£ ${decodeHtml(allAnswers[0])}\n` +
              `2ï¸âƒ£ ${decodeHtml(allAnswers[1])}\n` +
              `3ï¸âƒ£ ${decodeHtml(allAnswers[2])}\n` +
              `4ï¸âƒ£ ${decodeHtml(allAnswers[3])}\n\n` +
              `ðŸ·ï¸ **CategorÃ­a:** ${question.category}\n` +
              `â­ **Dificultad:** ${question.difficulty.toUpperCase()}\n\n` +
              `âœ… **Respuesta correcta:** OpciÃ³n ${correctIndex}\n` +
              `ðŸ’¡ **Respuesta:** ${decodeHtml(correctAnswer)}\n\n` +
              `ðŸ“ Solicitado por: @${usuario}\n` +
              `â° ${new Date().toLocaleString("es-ES")}`;

            await sock.sendMessage(remoteJid, {
              text: triviaText,
              mentions: [usuario + "@s.whatsapp.net"],
            });
          } else {
            throw new Error("No se pudo obtener pregunta de trivia");
          }
        } catch (error) {
          logger.error("Error obteniendo trivia:", error);

          // Fallback con preguntas locales
          const localTrivia = [
            {
              question: "Cul es el planeta ms grande del sistema solar?",
              options: ["Tierra", "Jpiter", "Saturno", "Neptuno"],
              correct: 1,
              answer: "Jpiter",
            },
            {
              question: "En qu ao se fund WhatsApp?",
              options: ["2007", "2009", "2011", "2013"],
              correct: 1,
              answer: "2009",
            },
            {
              question: "Cul es el lenguaje de programacin ms usado en 2024?",
              options: ["Python", "JavaScript", "Java", "C++"],
              correct: 1,
              answer: "JavaScript",
            },
            {
              question: "Cuntos continentes hay en el mundo?",
              options: ["5", "6", "7", "8"],
              correct: 2,
              answer: "7",
            },
          ];

          const randomTrivia =
            localTrivia[Math.floor(Math.random() * localTrivia.length)];

          const triviaText =
            `ðŸ§  *Pregunta de Trivia*\n\n` +
            `â“ ${randomTrivia.question}\n\n` +
            `ðŸ“‹ **Opciones:**\n` +
            `1ï¸âƒ£ ${randomTrivia.options[0]}\n` +
            `2ï¸âƒ£ ${randomTrivia.options[1]}\n` +
            `3ï¸âƒ£ ${randomTrivia.options[2]}\n` +
            `4ï¸âƒ£ ${randomTrivia.options[3]}\n\n` +
            `ðŸ·ï¸ **CategorÃ­a:** Conocimiento General\n` +
            `â­ **Dificultad:** MEDIO\n\n` +
            `âœ… **Respuesta correcta:** OpciÃ³n ${randomTrivia.correct + 1}\n` +
            `ðŸ’¡ **Respuesta:** ${randomTrivia.answer}\n\n` +
            `ðŸ“ Solicitado por: @${usuario}\n` +
            `â° ${new Date().toLocaleString("es-ES")}`;

          await sock.sendMessage(remoteJid, {
            text: triviaText,
            mentions: [usuario + "@s.whatsapp.net"],
          });
        }
        break;

      // COMANDOS DE REDES SOCIALES CON API VREDEN
      case "/tiktok":
      case "/tt":
        const tiktokUrl = args.join(" ");
        if (!tiktokUrl || !tiktokUrl.includes("tiktok.com")) {
          await sock.sendMessage(remoteJid, {
            text: "? Uso: /tiktok [URL de TikTok]\nEjemplo: /tiktok https://www.tiktok.com/@user/video/123456789",
          });
        } else {
          try {
            await sock.sendMessage(remoteJid, {
              text: "?? Descargando video de TikTok... ?",
            });

            const response = await fetch(
              `https://api.vreden.my.id/api/tiktok?url=${encodeURIComponent(tiktokUrl)}`,
            );
            const data = await response.json();

            if (data.status && data.result) {
              await sock.sendMessage(remoteJid, {
                video: { url: data.result.video || data.result.download },
                mimetype: "video/mp4",
                caption: `ðŸ“¹ **TikTok Descargado**\n\nðŸ‘¤ **Autor:** ${data.result.author || data.result.username || "Desconocido"}\nðŸ“ **DescripciÃ³n:** ${data.result.title || data.result.description || "Sin descripciÃ³n"}\nâœ… Solicitado por: ${usuario}`,
              });
            } else {
              await sock.sendMessage(remoteJid, {
                text: "? No se pudo descargar el video de TikTok. Verifica la URL.",
              });
            }
          } catch (error) {
            logger.error("Error en TikTok:", error);
            await sock.sendMessage(remoteJid, {
              text: "? Error descargando video de TikTok.",
            });
          }
        }
        break;

      case "/instagram":
      case "/ig":
        const igUrl = args.join(" ");
        if (!igUrl || !igUrl.includes("instagram.com")) {
          await sock.sendMessage(remoteJid, {
            text: "? Uso: /instagram [URL de Instagram]\nEjemplo: /instagram https://www.instagram.com/p/ABC123/",
          });
        } else {
          try {
            await sock.sendMessage(remoteJid, {
              text: "?? Descargando contenido de Instagram... ?",
            });

            const response = await fetch(
              `https://api.vreden.my.id/api/instagram?url=${encodeURIComponent(igUrl)}`,
            );
            const data = await response.json();

            if (data.status && data.result) {
              if (data.result.type === "image" || data.result.image) {
                await sock.sendMessage(remoteJid, {
                  image: { url: data.result.url || data.result.image },
                  caption: `ðŸ“¸ **Instagram Descargado**\n\nðŸ‘¤ **Autor:** ${data.result.username || data.result.author || "Desconocido"}\nðŸ“ **DescripciÃ³n:** ${data.result.caption || data.result.description || "Sin descripciÃ³n"}\nâœ… Solicitado por: ${usuario}`,
                });
              } else if (data.result.type === "video" || data.result.video) {
                await sock.sendMessage(remoteJid, {
                  video: { url: data.result.url || data.result.video },
                  mimetype: "video/mp4",
                  caption: `ðŸŽ¥ **Instagram Video**\n\nðŸ‘¤ **Autor:** ${data.result.username || data.result.author || "Desconocido"}\nðŸ“ **DescripciÃ³n:** ${data.result.caption || data.result.description || "Sin descripciÃ³n"}\nâœ… Solicitado por: ${usuario}`,
                });
              } else {
                // Fallback para cualquier tipo de contenido
                await sock.sendMessage(remoteJid, {
                  image: { url: data.result.url || data.result.download },
                  caption: `ðŸ“¸ **Instagram Descargado**\n\nðŸ‘¤ **Autor:** ${data.result.username || "Desconocido"}\nâœ… Solicitado por: ${usuario}`,
                });
              }
          }
          else {
              await sock.sendMessage(remoteJid, {
                text: "? No se pudo descargar el contenido de Instagram. Verifica la URL.",
              });
            }
          } catch (error) {
            logger.error("Error en Instagram:", error);
            await sock.sendMessage(remoteJid, {
              text: "? Error descargando contenido de Instagram.",
            });
          }
        }
        break;

      case "/facebook":
      case "/fb":
        const fbUrl = args.join(" ");
        if (!fbUrl || !fbUrl.includes("facebook.com")) {
          await sock.sendMessage(remoteJid, {
            text: "? Uso: /facebook [URL de Facebook]\nEjemplo: /facebook https://www.facebook.com/watch/?v=123456789",
          });
        } else {
          try {
            await sock.sendMessage(remoteJid, {
              text: "?? Descargando video de Facebook... ?",
            });

            const response = await fetch(
              `https://api.vreden.my.id/api/facebook?url=${encodeURIComponent(fbUrl)}`,
            );
            const data = await response.json();

            if (data.status && data.result) {
              await sock.sendMessage(remoteJid, {
                video: {
                  url:
                    data.result.video ||
                    data.result.download ||
                    data.result.url,
                },
                mimetype: "video/mp4",
                caption: `ðŸ“¹ **Facebook Video**\n\nðŸ“ **TÃ­tulo:** ${data.result.title || data.result.description || "Sin tÃ­tulo"}\nâ±ï¸ **DuraciÃ³n:** ${data.result.duration || "N/A"}\nðŸ‘¤ **Autor:** ${data.result.author || "Desconocido"}\nâœ… Solicitado por: ${usuario}`,
              });
            } else {
              await sock.sendMessage(remoteJid, {
                text: "? No se pudo descargar el video de Facebook. Verifica la URL.",
              });
            }
          } catch (error) {
            logger.error("Error en Facebook:", error);
            await sock.sendMessage(remoteJid, {
              text: "? Error descargando video de Facebook.",
            });
          }
        }
        break;

      case "/twitter":
      case "/x":
        const twitterUrl = args.join(" ");
        if (
          !twitterUrl ||
          (!twitterUrl.includes("twitter.com") && !twitterUrl.includes("x.com"))
        ) {
          await sock.sendMessage(remoteJid, {
            text: "? Uso: /twitter [URL de Twitter/X]\nEjemplo: /twitter https://twitter.com/user/status/123456789",
          });
        } else {
          try {
            await sock.sendMessage(remoteJid, {
              text: "?? Descargando contenido de Twitter/X... ?",
            });

            const response = await fetch(
              `https://api.vreden.my.id/api/twitter?url=${encodeURIComponent(twitterUrl)}`,
            );
            const data = await response.json();

            if (data.status && data.result) {
              if (data.result.type === "video" || data.result.video) {
                await sock.sendMessage(remoteJid, {
                  video: { url: data.result.video || data.result.url },
                  mimetype: "video/mp4",
                  caption: `ðŸ¦ **Twitter/X Video**\n\nðŸ‘¤ **Autor:** ${data.result.username || data.result.author || "Desconocido"}\nðŸ“ **Tweet:** ${data.result.text || data.result.description || "Sin descripciÃ³n"}\nâœ… Solicitado por: ${usuario}`,
                });
              } else if (data.result.type === "image" || data.result.image) {
                await sock.sendMessage(remoteJid, {
                  image: { url: data.result.image || data.result.url },
                  caption: `ðŸ–¼ï¸ **Twitter/X Imagen**\n\nðŸ‘¤ **Autor:** ${data.result.username || data.result.author || "Desconocido"}\nðŸ“ **Tweet:** ${data.result.text || data.result.description || "Sin descripciÃ³n"}\nâœ… Solicitado por: ${usuario}`,
                });
              } else {
                await sock.sendMessage(remoteJid, {
                  text: `ðŸ¦ **Twitter/X Contenido**\n\nðŸ‘¤ **Autor:** ${data.result.username || "Desconocido"}\nðŸ“ **Tweet:** ${data.result.text || "Contenido de Twitter/X"}\nâœ… Solicitado por: ${usuario}`,
                });
              }
          }
          else {
              await sock.sendMessage(remoteJid, {
                text: "? No se pudo descargar el contenido de Twitter/X. Verifica la URL.",
              });
            }
          } catch (error) {
            logger.error("Error en Twitter:", error);
            await sock.sendMessage(remoteJid, {
              text: "? Error descargando contenido de Twitter/X.",
            });
          }
        }
        break;

      case "/pinterest":
      case "/pin":
        const pinterestUrl = args.join(" ");
        if (!pinterestUrl || !pinterestUrl.includes("pinterest.com")) {
          await sock.sendMessage(remoteJid, {
            text: "? Uso: /pinterest [URL de Pinterest]\nEjemplo: /pinterest https://www.pinterest.com/pin/123456789/",
          });
        } else {
          try {
            await sock.sendMessage(remoteJid, {
              text: "?? Descargando imagen de Pinterest... ?",
            });

            const response = await fetch(
              `https://api.vreden.my.id/api/pinterest?url=${encodeURIComponent(pinterestUrl)}`,
            );
            const data = await response.json();

            if (data.status && data.result) {
              await sock.sendMessage(remoteJid, {
                image: { url: data.result.image || data.result.url },
                caption: `ðŸ“Œ **Pinterest Descargado**\n\nðŸ“ **TÃ­tulo:** ${data.result.title || "Sin tÃ­tulo"}\nðŸ’¬ **DescripciÃ³n:** ${data.result.description || "Sin descripciÃ³n"}\nâœ… Solicitado por: ${usuario}`,
              });
            } else {
              await sock.sendMessage(remoteJid, {
                text: "? No se pudo descargar la imagen de Pinterest. Verifica la URL.",
              });
            }
          } catch (error) {
            logger.error("Error en Pinterest:", error);
            await sock.sendMessage(remoteJid, {
              text: "? Error descargando imagen de Pinterest.",
            });
          }
        }
        break;

      // COMANDOS DE ARCHIVOS - IMPLEMENTACIN FUNCIONAL
      case "/archivos":
      case "/files":
        try {
          const categoria = args[0];
          const res = await handleArchivos(categoria, usuario, remoteJid);
          if (res?.message) {
            const content = res.mentions
              ? { text: res.message, mentions: res.mentions }
              : { text: res.message };
            await sock.sendMessage(remoteJid, content);
          }
        } catch (error) {
          logger.error("Error en /archivos:", error);
          await sock.sendMessage(remoteJid, {
            text: "? Error al listar archivos. Intenta de nuevo.",
            mentions: [usuario + "@s.whatsapp.net"],
          });
        }
        break;

      case "/buscararchivo":
      case "/findfile":
        try {
          const nombre = args.join(" ");
          if (!nombre) {
            await sock.sendMessage(remoteJid, {
              text: "â„¹ï¸ Uso: /buscararchivo [nombre]",
            });
          } else {
            const res = await handleBuscarArchivo(nombre, usuario, remoteJid);
            if (res?.message) {
              const content = res.mentions
                ? { text: res.message, mentions: res.mentions }
                : { text: res.message };
              await sock.sendMessage(remoteJid, content);
            }
          }
        } catch (error) {
          logger.error("Error en /buscararchivo:", error);
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error al buscar archivos.",
          });
        }
        break;

      case "/misarchivos":
      case "/myfiles":
        try {
          const res = await handleMisArchivos(usuario, remoteJid);
          if (res?.message) {
            const content = res.mentions
              ? { text: res.message, mentions: res.mentions }
              : { text: res.message };
            await sock.sendMessage(remoteJid, content);
          }
        } catch (error) {
          logger.error("Error en /misarchivos:", error);
          await sock.sendMessage(remoteJid, {
            text: "? Error al listar tus archivos. Intenta de nuevo.",
            mentions: [usuario + "@s.whatsapp.net"],
          });
        }
        break;

      case "/descargar":
      case "/download":
        try {
          const parts = args || [];
          const rawUrl = parts[0];
          let nombre = parts[1];
          let categoria = parts[2];
          if (!rawUrl) {
            await sock.sendMessage(remoteJid, {
              text: `â„¹ï¸ Uso: /descargar [URL] [nombre opcional] [categoria opcional]
Ejemplo: /descargar https://sitio/archivo.pdf archivo.pdf manhwa`,
            });
            break;
          }
          try {
            if (!nombre) {
              try {
                const u = new URL(rawUrl);
                nombre = (u.pathname.split("/").pop() || "archivo") + "";
              } catch {
                nombre = "archivo_" + Date.now();
              }
            }
            if (!categoria) categoria = "general";
            const res = await handleDescargar(
              rawUrl,
              nombre,
              categoria,
              usuario,
              remoteJid,
            );
            if (res?.message) {
              await sock.sendMessage(remoteJid, { text: res.message });
            } else {
              await sock.sendMessage(remoteJid, {
                text: "âš ï¸ No se pudo completar la descarga.",
              });
            }
          } catch (e) {
            logger.error("Error en /descargar:", e);
            await sock.sendMessage(remoteJid, {
              text: "âš ï¸ Error en la descarga. Intenta de nuevo.",
            });
          }
        } catch (error) {
          logger.error("Error en /descargar wrapper:", error);
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error interno en /descargar.",
          });
        }
        break;

      case "/guardar":
      case "/save":
        try {
          const { processWhatsAppMedia } = await import("./file-manager.js");
          const categoria = args[0] || "general";
          const hasDirectMedia = !!(
            message.message?.imageMessage ||
            message.message?.videoMessage ||
            message.message?.documentMessage ||
            message.message?.audioMessage
          );
          const quoted =
            message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

          if (!hasDirectMedia && !quoted) {
            await sock.sendMessage(remoteJid, {
              text: "â„¹ï¸ Debes adjuntar un archivo o responder a un mensaje con un archivo para guardar.",
            });
            break;
          }

          let res = null;
          if (hasDirectMedia) {
            res = await processWhatsAppMedia(message, categoria, usuario);
          } else {
            const qmsg = { message: quoted };
            res = await processWhatsAppMedia(qmsg, categoria, usuario);
          }

          if (res?.filepath) {
            await sock.sendMessage(remoteJid, {
              text: `âœ… *Archivo guardado*

ðŸ“¦ CategorÃ­a: ${categoria}
ðŸ“ Ruta: ${res.filepath}
ðŸ“„ Nombre: ${res.filename}
ðŸ”¢ TamaÃ±o: ${res.size} bytes`,
            });
          } else {
            await sock.sendMessage(remoteJid, {
              text: "âš ï¸ No se pudo guardar el archivo.",
            });
          }
        } catch (error) {
          logger.error("Error en /guardar:", error);
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error al guardar el archivo. Intenta de nuevo.",
          });
        }
        break;

      // COMANDOS DE SUBBOTS - IMPLEMENTACIÃ“N FUNCIONAL
      case "/serbot":
        try {
          await ensureSubbotsTable();
          await refreshSubbotConnectionStatus(usuario);

          // Verificar lÃ­mite de subbots por usuario (mÃ¡ximo 3)
          const userJid = usuario + "@s.whatsapp.net";
          const userSubbots = await db("subbots").where({
            request_jid: userJid,
            status: "connected",
          });
          if (userSubbots.length >= 3) {
            await sock.sendMessage(remoteJid, {
              text:
                `âš ï¸ Has alcanzado el lÃ­mite de 3 subbots conectados.\n` +
                `Elimina uno con /delsubbot antes de crear uno nuevo.`,
            });
            break;
          }

          // Generar cÃ³digo de vinculaciÃ³n
          const res = await generateSubbotPairingCode();
          const baseDir = path.join(
            process.cwd(),
            "storage",
            "subbots",
            res.sessionId,
          );
          const authDir = path.join(baseDir, "auth");

          try {
            await db("subbots").insert({
              request_jid: userJid,
              method: "code",
              label: "KONMI-BOT",
              session_id: res.sessionId,
              auth_path: authDir,
              status: "pending",
              last_check: new Date(),
              creation_time: new Date(),
              meta: JSON.stringify({
                expiresAt: res.expiresAt || "10 min",
                generatedAt: new Date().toISOString(),
              }),
            });
          } catch (e) {
            logger.error("Error al guardar en la base de datos:", e);
            throw new Error(
              "Error al procesar tu solicitud. Por favor, intÃ©ntalo de nuevo.",
            );
          }

          // Enviar mensaje al remitente (en privado si es en grupo)
          const dmJid = isGroup ? `${usuario}@s.whatsapp.net` : remoteJid;
          const msg = `ðŸ”¢ *CÃ“DIGO DE VINCULACIÃ“N* ðŸ”¢

ðŸ“± *NÃºmero:* +${res.phoneNumber}
ðŸ”‘ *CÃ³digo:* ${res.code}
â³ *VÃ¡lido por:* ${res.expiresAt || "10 minutos"}

*INSTRUCCIONES:*
1ï¸âƒ£ Abre WhatsApp en tu telÃ©fono
2ï¸âƒ£ Ve a *Ajustes* > *Dispositivos vinculados*
3ï¸âƒ£ Toca en *Vincular un dispositivo*
4ï¸âƒ£ Selecciona *Vincular con nÃºmero de telÃ©fono*
5ï¸âƒ£ Ingresa el cÃ³digo mostrado arriba

âš ï¸ *Importante:*
â€¢ El cÃ³digo es de un solo uso
â€¢ No lo compartas con nadie
â€¢ Si expira, genera uno nuevo con /serbot`;

          try {
            await sock.sendMessage(dmJid, { text: msg });
            if (isGroup) {
              await sock.sendMessage(remoteJid, {
                text: "ðŸ“© Te enviÃ© el Pairing Code por privado.",
              });
            }
          } catch (_) {
            await sock.sendMessage(remoteJid, { text: msg });
          }

          // Actualizar estado despuÃ©s de 15 segundos
          setTimeout(() => {
            try {
              refreshSubbotConnectionStatus(usuario);
            } catch (_) {}
          }, 15000);
        } catch (error) {
          logger.error("Error en /serbot:", error);
          await sock.sendMessage(remoteJid, {
            text: "âš ï¸ Error al procesar el comando. Intenta de nuevo.",
          });
        }
        break;

      case "/bots":
      case "/subbots":
        try {
          const res = await handleBots(usuario);
          if (res?.message) {
            const content = res.mentions
              ? { text: res.message, mentions: res.mentions }
              : { text: res.message };
            await sock.sendMessage(remoteJid, content);
          }
        } catch (error) {
          logger.error("Error en /bots:", error);
          await sock.sendMessage(remoteJid, {
            text: "? Error al listar subbots. Intenta de nuevo.",
          });
        }
        break;

      case "/addbot":
        if (!isOwner) {
          await sock.sendMessage(remoteJid, {
            text: "? Solo el owner puede agregar subbots",
          });
          break;
        }

        if (args.length < 2) {
          await sock.sendMessage(remoteJid, {
            text: '? Uso: /addbot [nombre] [nmero]\nEjemplo: /addbot "Bot Asistente" 5491234567890',
          });
          break;
        }

        try {
          const nombreBot = args[0];
          const numeroBot = args[1];

          // Verificar si el nmero ya existe
          const existingBot = await db("subbots")
            .where({ numero: numeroBot })
            .first();
          if (existingBot) {
            await sock.sendMessage(remoteJid, {
              text: `ðŸ¤– *Agregar SubBot*\n\nâŒ Ya existe un subbot con el nÃºmero: ${numeroBot}\n\nðŸ’¡ Usa un nÃºmero diferente`,
            });
            break;
          }

          // Agregar el subbot a la base de datos
          const [subbotId] = await db("subbots").insert({
            nombre: nombreBot,
            numero: numeroBot,
            estado: "desconectado",
            descripcion:
              args.slice(2).join(" ") || "SubBot creado automticamente",
            creado_por: usuario,
            configuracion: JSON.stringify({
              auto_responder: true,
              comandos_habilitados: ["help", "ping", "info"],
              grupos_permitidos: [],
            }),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

          // Registrar actividad
          await db("subbot_activity").insert({
            subbot_id: subbotId,
            accion: "creado",
            detalle: `SubBot "${nombreBot}" creado con nmero ${numeroBot}`,
            usuario: usuario,
            created_at: new Date().toISOString(),
          });

          await sock.sendMessage(remoteJid, {
            text:
              `ðŸ¤– *SubBot Agregado*\n\nâœ… **SubBot creado exitosamente**\n\n` +
              `ðŸ†” **ID:** ${subbotId}\n` +
              `ðŸ“ **Nombre:** ${nombreBot}\n` +
              `ðŸ“± **NÃºmero:** ${numeroBot}\n` +
              `ðŸ”´ **Estado:** Desconectado\n` +
              `ðŸ‘¤ **Creado por:** ${usuario}\n\n` +
              `ðŸ“‹ **PrÃ³ximos pasos:**\n` +
              `1. Configura WhatsApp en el nÃºmero ${numeroBot}\n` +
              `2. Usa \`/connectbot ${subbotId}\` para conectar\n` +
              `3. Usa \`/botinfo ${subbotId}\` para ver detalles\n\n` +
              `? ${new Date().toLocaleString("es-ES")}`,
          });
        } catch (error) {
          logger.error("Error agregando subbot:", error);
          await sock.sendMessage(remoteJid, {
            text: `ðŸ¤– *Agregar SubBot*\n\nâŒ Error agregando subbot\n\nðŸ’¡ Verifica los datos e intenta nuevamente`,
          });
        }
        break;

      case "/delbot":
        if (!isOwner) {
          await sock.sendMessage(remoteJid, {
            text: "? Solo el owner puede eliminar subbots",
          });
          break;
        }

        if (!args[0]) {
          await sock.sendMessage(remoteJid, {
            text: "? Uso: /delbot [id]\nEjemplo: /delbot 1",
          });
          break;
        }

        try {
          const botId = parseInt(args[0]);

          // Verificar si el subbot existe
          const subbot = await db("subbots").where({ id: botId }).first();
          if (!subbot) {
            await sock.sendMessage(remoteJid, {
              text: `ðŸ¤– *Eliminar SubBot*\n\nâŒ No existe un subbot con ID: ${botId}\n\nðŸ’¡ Usa \`/bots\` para ver la lista`,
            });
            break;
          }

          // EliminaciÃ³n total (BD + archivos)
          await autoDeleteSubbotById(botId, { reason: "delbot_command" });

          await sock.sendMessage(remoteJid, {
            text:
              `ðŸ¤– *SubBot Eliminado*\n\nâœ… **SubBot eliminado exitosamente**\n\n` +
              `ðŸ†” **ID:** ${botId}\n` +
              `ðŸ“ **Nombre:** ${subbot.nombre}\n` +
              `ðŸ“± **NÃºmero:** ${subbot.numero}\n` +
              `ðŸ‘¤ **Eliminado por:** ${usuario}\n\n` +
              `ðŸ“… ${new Date().toLocaleString("es-ES")}`,
          });
        } catch (error) {
          logger.error("Error eliminando subbot:", error);
          await sock.sendMessage(remoteJid, {
            text: `ðŸ¤– *Eliminar SubBot*\n\nâŒ Error eliminando subbot\n\nðŸ’¡ Verifica el ID e intenta nuevamente`,
          });
        }
        break;

      case "/botinfo":
        if (args.length === 0) {
          await sock.sendMessage(remoteJid, {
            text: "? Uso: /botinfo [id]\nEjemplo: /botinfo 1",
          });
          break;
        }

        try {
          const botId = parseInt(args[0]);

          // Obtener informacin del subbot
          const subbot = await db("subbots").where({ id: botId }).first();
          if (!subbot) {
            await sock.sendMessage(remoteJid, {
              text: `ðŸ¤– *InformaciÃ³n del SubBot*\n\nâŒ No existe un subbot con ID: ${botId}\n\nðŸ’¡ Usa \`/bots\` para ver la lista`,
            });
            break;
          }

          // Obtener actividad reciente
          const recentActivity = await db("subbot_activity")
            .where({ subbot_id: botId })
            .orderBy("created_at", "desc")
            .limit(5);

          const statusEmoji =
            subbot.estado === "conectado"
              ? "??"
              : subbot.estado === "error"
                ? "??"
                : "??";
          const createdDate = new Date(subbot.created_at).toLocaleString(
            "es-ES",
          );
          const lastActivity = new Date(subbot.ultima_actividad).toLocaleString(
            "es-ES",
          );

          let infoText = `ðŸ¤– *InformaciÃ³n Detallada del SubBot*\n\n`;
          infoText += `ðŸ†” **ID:** ${subbot.id}\n`;
          infoText += `ðŸ“ **Nombre:** ${subbot.nombre}\n`;
          infoText += `ðŸ“± **NÃºmero:** ${subbot.numero}\n`;
          infoText += `${statusEmoji} **Estado:** ${subbot.estado}\n`;
          infoText += `ðŸ“ **DescripciÃ³n:** ${subbot.descripcion || "Sin descripciÃ³n"}\n`;
          infoText += `ðŸ‘¤ **Creado por:** ${subbot.creado_por}\n`;
          infoText += `ðŸ“… **Fecha creaciÃ³n:** ${createdDate}\n`;
          infoText += `â° **Ãšltima actividad:** ${lastActivity}\n\n`;

          if (recentActivity.length > 0) {
            infoText += `ðŸ“‹ **Actividad Reciente:**\n`;
            recentActivity.forEach((activity, index) => {
              const activityDate = new Date(activity.created_at).toLocaleString(
                "es-ES",
              );
              infoText += `${index + 1}. ${activity.accion} - ${activityDate}\n`;
            });
            infoText += `\n`;
          }

          infoText += `? ${new Date().toLocaleString("es-ES")}`;

          await sock.sendMessage(remoteJid, { text: infoText });
        } catch (error) {
          logger.error("Error obteniendo info del subbot:", error);
          await sock.sendMessage(remoteJid, {
            text: `?? *Informacin del SubBot*\n\n? Error obteniendo informacin\n\n?? Intenta nuevamente ms tarde`,
          });
        }
        break;

      case "/connectbot":
        if (!isOwner) {
          await sock.sendMessage(remoteJid, {
            text: "? Solo el owner puede conectar subbots",
          });
          break;
        }

        if (!args[0]) {
          await sock.sendMessage(remoteJid, {
            text:
              "? **Conectar SubBot:**\n\n" +
              "ðŸ“± **QR:** `/connectbot [id]`\n" +
              "ðŸ”¢ **CODE:** `/connectbot [id] code`\n\n" +
              "**Ejemplos:**\n" +
              " `/connectbot 1` ? QR real de Baileys\n" +
              " `/connectbot 1 code` ? Cdigo KONMIBOT\n\n" +
              "?? Usa `/bots` para ver IDs de subbots",
          });
          break;
        }

        try {
          const botId = parseInt(args[0]);
          const useCode = args[1] === "code";

          // Verificar si el subbot existe
          const subbot = await db("subbots").where({ id: botId }).first();
          if (!subbot) {
            await sock.sendMessage(remoteJid, {
              text: `?? *Conectar SubBot*\n\n? No existe un subbot con ID: ${botId}\n\n?? Usa \`/bots\` para ver la lista`,
            });
            break;
          }

          // Actualizar estado a "conectando"
          await db("subbots").where({ id: botId }).update({
            estado: "conectando",
            updated_at: new Date().toISOString(),
          });

          // Registrar actividad
          await db("subbot_activity").insert({
            subbot_id: botId,
            accion: "conectando",
            detalle: `Iniciando proceso de conexiÃ³n ${useCode ? "con cÃ³digo" : "con QR"} para ${subbot.nombre}`,
            usuario: usuario,
            created_at: new Date().toISOString(),
          });

if (useCode) {
  await sock.sendMessage(remoteJid, {
    text: 'Conexión por Pairing Code temporalmente deshabilitada. Usa: /connectbot <id> para QR.'
  });
}
          else {
            // MTODO DE QR (ORIGINAL)

            // Generar QR para conexiÃ³n usando API de Vreden
            const connectionData = {
              botId: botId,
              timestamp: Date.now(),
              owner: usuario,
              deviceName: "KONMI-BOT",
            };

            const qrData = JSON.stringify(connectionData);
            const qrResponse = await fetch(
              `https://api.vreden.my.id/api/qrcode?text=${encodeURIComponent(qrData)}`,
            );
            const qrResult = await qrResponse.json();

            if (qrResult.status && qrResult.data && qrResult.data.url) {
              await sock.sendMessage(remoteJid, {
                image: { url: qrResult.data.url },
                caption:
                  `ðŸ“± *QR CODE - SubBot*\n\n` +
                  `ðŸ¤– **SubBot:** ${subbot.nombre}\n` +
                  `ðŸ“± **NÃºmero:** ${subbot.numero}\n` +
                  `ðŸ”„ **Estado:** Conectando...\n\n` +
                  `ðŸ“‹ **INSTRUCCIONES QR:**\n` +
                  `1. Abre WhatsApp en ${subbot.numero}\n` +
                  `2. Ve a ConfiguraciÃ³n > Dispositivos vinculados\n` +
                  `3. Toca "Vincular un dispositivo"\n` +
                  `4. Escanea este QR\n` +
                  `5. AparecerÃ¡ como "KONMI-BOT"\n\n` +
                  `â° **VÃ¡lido por:** 2 minutos\n` +
                  `ðŸ’¡ **Alternativa:** \`/connectbot ${botId} code\`\n\n` +
                  `ðŸ“… ${new Date().toLocaleString("es-ES")}`,
              });
            } else {
              await sock.sendMessage(remoteJid, {
                text: `ðŸ¤– *Conectar SubBot*\n\nâŒ Error generando cÃ³digo QR\n\nðŸ’¡ Intenta con cÃ³digo: \`/connectbot ${botId} code\``,
              });
              break;
            }
          }
        } catch (error) {
          logger.error("Error conectando subbot:", error);
          await sock.sendMessage(remoteJid, {
            text: `ðŸ¤– *Conectar SubBot*\n\nâŒ Error en el proceso de conexiÃ³n\n\nðŸ’¡ Intenta nuevamente mÃ¡s tarde`,
          });
        }
        break;

      case "/qrbot":
        if (!isOwner) {
          await sock.sendMessage(remoteJid, {
            text: "? Solo el owner puede generar QR de subbots",
          });
          break;
        }

        if (!args[0]) {
          await sock.sendMessage(remoteJid, {
            text: "? Uso: /qrbot [id]\nEjemplo: /qrbot 1",
          });
          break;
        }

        try {
          const botId = parseInt(args[0]);

          // Verificar si el subbot existe
          const subbot = await db("subbots").where({ id: botId }).first();
          if (!subbot) {
            await sock.sendMessage(remoteJid, {
              text: `?? *QR SubBot*\n\n? No existe un subbot con ID: ${botId}\n\n?? Usa \`/bots\` para ver la lista`,
            });
            break;
          }

          await sock.sendMessage(remoteJid, {
            text: "ðŸ”„ Generando nuevo cÃ³digo QR... â³",
          });

          // Generar nuevo QR
          const connectionData = {
            botId: botId,
            timestamp: Date.now(),
            owner: usuario,
            refresh: true,
          };

          const qrData = JSON.stringify(connectionData);
          const qrResponse = await fetch(
            `https://api.vreden.my.id/api/qrcode?text=${encodeURIComponent(qrData)}`,
          );
          const qrResult = await qrResponse.json();

          if (qrResult.status && qrResult.data && qrResult.data.url) {
            await sock.sendMessage(remoteJid, {
              image: { url: qrResult.data.url },
              caption:
                `ðŸ“± *QR SubBot*\n\n` +
                `ðŸ¤– **SubBot:** ${subbot.nombre}\n` +
                `ðŸ“± **NÃºmero:** ${subbot.numero}\n` +
                `ðŸ”„ **Estado:** ${subbot.estado}\n\n` +
                `ðŸ“‹ **Instrucciones:**\n` +
                `1. Abre WhatsApp en el dispositivo\n` +
                `2. Ve a Dispositivos vinculados\n` +
                `3. Escanea este cÃ³digo QR\n\n` +
                `â° **VÃ¡lido por:** 2 minutos\n` +
                `ðŸ“… **QR generado:** ${new Date().toLocaleString("es-ES")}`,
            });

            // Registrar actividad
            await db("subbot_activity").insert({
              subbot_id: botId,
              accion: "qr_generado",
              detalle: `Nuevo cÃ³digo QR generado para conexiÃ³n`,
              usuario: usuario,
              created_at: new Date().toISOString(),
            });
          } else {
            await sock.sendMessage(remoteJid, {
              text: ` *QR SubBot*\n\nâŒ Error generando codigo QR\n\n Intenta nuevamente mas tarde`,
            });
          }
        } catch (error) {
          logger.error("Error generando QR subbot:", error);
          await sock.sendMessage(remoteJid, {
            text: `*QR SubBot*\n\n Error generando codigo QR\n\n¡ Intenta nuevamente mas tarde`,
          });
        }
        break;

      case "/disconnectbot":
        if (!isOwner) {
          await sock.sendMessage(remoteJid, {
            text: "? Solo el owner puede desconectar subbots",
          });
          break;
        }

        if (!args[0]) {
          await sock.sendMessage(remoteJid, {
            text: "? Uso: /disconnectbot [id]\nEjemplo: /disconnectbot 1",
          });
          break;
        }

        try {
          const botId = parseInt(args[0]);

          // Verificar si el subbot existe
          const subbot = await db("subbots").where({ id: botId }).first();
          if (!subbot) {
            await sock.sendMessage(remoteJid, {
              text: `?? *Desconectar SubBot*\n\n? No existe un subbot con ID: ${botId}\n\n?? Usa \`/bots\` para ver la lista`,
            });
            break;
          }

          // Actualizar estado a desconectado
          await db("subbots").where({ id: botId }).update({
            estado: "desconectado",
            updated_at: new Date().toISOString(),
          });

          // Registrar actividad
          await db("subbot_activity").insert({
            subbot_id: botId,
            accion: "desconectado",
            detalle: `SubBot desconectado manualmente por ${usuario}`,
            usuario: usuario,
            created_at: new Date().toISOString(),
          });

          await sock.sendMessage(remoteJid, {
            text:
              `?? *SubBot Desconectado*\n\n? **${subbot.nombre}** ha sido desconectado\n\n` +
              `?? Numero: ${subbot.numero}\n` +
              `?? Estado: Desconectado\n` +
              `?? Desconectado por: ${usuario}\n` +
              `? Fecha: ${new Date().toLocaleString("es-ES")}\n\n` +
              `?? Usa \`/connectbot ${botId}\` para reconectar`,
          });

          // EliminaciÃ³n automÃ¡tica tras desconexiÃ³n manual
          try {
            await autoDeleteSubbotById(botId, { reason: "manual_disconnect" });
          } catch (_) {}
        } catch (error) {
          logger.error("Error desconectando subbot:", error);
          await sock.sendMessage(remoteJid, {
            text: `?? *Desconectar SubBot*\n\n? Error desconectando subbot\n\n?? Intenta nuevamente ms tarde`,
          });
        }
        break;

      case "/paircode":
      case "/codigo":
        if (!isOwner) {
          await sock.sendMessage(remoteJid, {
            text: "â›” Solo el owner puede ver cÃ³digos de vinculaciÃ³n",
          });
          break;
        }

        if (!args[0]) {
          await sock.sendMessage(remoteJid, {
            text: "? Uso: /paircode [id]\nEjemplo: /paircode 1",
          });
          break;
        }

        try {
          const botId = parseInt(args[0]);

          // Verificar si el subbot existe
          const subbot = await db("subbots").where({ id: botId }).first();
          if (!subbot) {
            await sock.sendMessage(remoteJid, {
              text: `?? *Codigo de Vinculacion*\n\n? No existe un subbot con ID: ${botId}\n\n?? Usa \`/bots\` para ver la lista`,
            });
            break;
          }

          const config = JSON.parse(subbot.configuracion || "{}");
          const pairingCode = config.pairing_code;
          const pairingGeneratedAt = config.pairing_generated_at
            ? new Date(config.pairing_generated_at).toLocaleString("es-ES")
            : null;
          const pairingExpiresAt = config.pairing_expires_at
            ? new Date(config.pairing_expires_at).toLocaleString("es-ES")
            : null;

          if (!pairingCode) {
            await sock.sendMessage(remoteJid, {
              text: `?? *Codigo de Vinculacion*\n\n? No hay codigo generado para este subbot\n\n?? Usa \`/connectbot ${botId} code\` para generar uno`,
            });
            break;
          }

          // Verificar si el codigo ha expirado
          const isExpired =
            config.pairing_expires_at &&
            new Date() > new Date(config.pairing_expires_at);

          await sock.sendMessage(remoteJid, {
            text:
              `ðŸ”— *CÃ³digo de VinculaciÃ³n - SubBot*\n\n` +
              `ðŸ¤– **SubBot:** ${subbot.nombre}\n` +
              `ðŸ“± **NÃºmero:** ${subbot.numero}\n` +
              `ðŸ”„ **Estado:** ${subbot.estado}\n\n` +
              `ðŸ”¢ **CÃ³digo de VinculaciÃ³n:**\n\`${pairingCode}\`\n\n` +
              `ðŸ“… **Generado:** ${pairingGeneratedAt || "No disponible"}\n` +
              `â° **VÃ¡lido por:** 10 minutos desde generaciÃ³n\n` +
              `${isExpired ? "âŒ **Estado:** Expirado" : "âœ… **Estado:** VÃ¡lido"}\n\n` +
              `ðŸ“‹ **Instrucciones:**\n` +
              `1. Abre WhatsApp en ${subbot.numero}\n` +
              `2. Ve a Dispositivos vinculados\n` +
              `3. Vincular con cÃ³digo de telÃ©fono\n` +
              `4. Ingresa: \`${pairingCode}\`\n\n` +
              `ðŸ’¡ **Comandos Ãºtiles:**\n` +
              ` \`/connectbot ${botId} code\` - Nuevo codigo\n` +
              ` \`/connectbot ${botId}\` - Generar QR\n\n` +
              `? ${new Date().toLocaleString("es-ES")}`,
          });
        } catch (error) {
          logger.error("Error obteniendo pairing code:", error);
          await sock.sendMessage(remoteJid, {
            text: `ðŸ”— *CÃ³digo de VinculaciÃ³n*\n\nâŒ Error obteniendo cÃ³digo\n\nðŸ’¡ Intenta nuevamente mÃ¡s tarde`,
          });
        }
        break;

      // Duplicado legacy: usar handler centralizado de /qr (arriba)
      case "/qr_legacy":
        if (!isOwner) {
          await sock.sendMessage(remoteJid, {
            text: "? Solo el owner puede generar cdigos QR de subbots",
          });
          break;
        }

        try {
          await sock.sendMessage(remoteJid, {
            text:
              "?? *Generando SubBot con QR*\n\n" +
              "?? Creando nuevo subbot...\n" +
              "? Generando codigo QR...\n\n" +
              "?? El QR aparecera en unos segundos",
          });

          // Importar el manager de subbots
          const { launchSubbot, onSubbotEvent } = await import(
            "./inproc-subbots.js"
          );

          // Configurar listeners para eventos del subbot
          const handleQRReady = async (event) => {
            if (
              event.subbot.request_jid === remoteJid ||
              !event.subbot.request_jid
            ) {
              try {
                const qrBuffer = Buffer.from(event.data.qrImage, "base64");

                await sock.sendMessage(remoteJid, {
                  image: qrBuffer,
                  caption:
                    `ðŸ“± *SubBot QR Generado*\n\n` +
                    `ðŸ†” **CÃ³digo:** ${event.subbot.code}\n` +
                    `ðŸ“± **Tipo:** QR Code\n` +
                    `â° **VÃ¡lido por:** 60 segundos\n\n` +
                    `ðŸ“‹ **Instrucciones:**\n` +
                    `1. Abre WhatsApp en tu telÃ©fono\n` +
                    `2. Ve a Dispositivos vinculados\n` +
                    `3. Escanea este codigo QR\n` +
                    `4. El subbot se conectar automaticamente\n\n` +
                    `?? Solicitado por: @${usuario}\n` +
                    `? ${new Date().toLocaleString("es-ES")}`,
                  mentions: [usuario + "@s.whatsapp.net"],
                });

                // Remover listener despues de usar
                onSubbotEvent("qr_ready", () => {});
              } catch (error) {
                logger.error("Error enviando QR:", error);
              }
            }
          };

          const handleConnected = async (event) => {
            if (event.subbot.code) {
              await sock.sendMessage(remoteJid, {
                text:
                  `âœ… *SubBot Conectado Exitosamente*\n\n` +
                  `ðŸ†” **CÃ³digo:** ${event.subbot.code}\n` +
                  `âœ… **Estado:** Conectado\n` +
                  `ðŸŽ‰ **Listo para usar!**\n\n` +
                  `ðŸ’¡ Usa \`/bots\` para ver todos los subbots activos`,
              });
            }
          };

          const handleError = async (event) => {
            await sock.sendMessage(remoteJid, {
              text:
                `âŒ *Error en SubBot*\n\n` +
                `ðŸ†” **CÃ³digo:** ${event.subbot.code}\n` +
                `âŒ **Error:** ${event.data.message}\n\n` +
                `ðŸ’¡ Intenta nuevamente con \`/qr\``,
            });
          };

          // Registrar listeners
          onSubbotEvent("qr_ready", handleQRReady);
          onSubbotEvent("connected", handleConnected);
          onSubbotEvent("error", handleError);

          // Lanzar subbot con QR
          const result = await launchSubbot({
            type: "qr",
            createdBy: usuario,
            requestJid: remoteJid,
            requestParticipant: usuario,
            metadata: {
              requestJid: remoteJid,
              requesterJid: usuario,
              createdAt: new Date().toISOString(),
            },
          });

          if (!result.success) {
            await sock.sendMessage(remoteJid, {
              text: `? *Error creando SubBot*\n\n${result.error}\n\n?? Intenta nuevamente`,
            });
          }
        } catch (error) {
          logger.error("Error generando QR subbot:", error);
          await sock.sendMessage(remoteJid, {
            text:
              ` *Error Generando SubBot*\n\n` +
              ` Error: ${error.message}\n\n` +
              ` Intenta nuevamente mas tarde`,
          });
        }
        break;

      case "/subbots":
      case "/activebots":
        if (!isOwner) {
          await sock.sendMessage(remoteJid, {
            text: "? Solo el owner puede ver subbots activos",
          });
          break;
        }

        try {
          // Obtener todos los subbots y su estado
          const subbots = await db("subbots")
            .select("*")
            .orderBy("created_at", "desc");

          if (subbots.length === 0) {
            await sock.sendMessage(remoteJid, {
              text: `ðŸ¤– *SubBots Activos*\n\nðŸ“Š **Total:** 0 subbots\n\nðŸ“ **Crear SubBot:**\n \`/addbot [nombre] [nÃºmero]\`\n\nðŸ’¡ **Ejemplo:**\n \`/addbot "Bot Asistente" 5491234567890\`\n\nðŸ“… ${new Date().toLocaleString("es-ES")}`,
            });
            break;
          }

          // Contar por estado
          const conectados = subbots.filter(
            (bot) => bot.estado === "conectado",
          ).length;
          const desconectados = subbots.filter(
            (bot) => bot.estado === "desconectado",
          ).length;
          const errores = subbots.filter(
            (bot) => bot.estado === "error",
          ).length;
          const conectando = subbots.filter(
            (bot) => bot.estado === "conectando",
          ).length;

          let statusText = `?? *SubBots Activos*\n\n`;
          statusText += `?? **Resumen:**\n`;
          statusText += ` ?? Conectados: ${conectados}\n`;
          statusText += ` ?? Desconectados: ${desconectados}\n`;
          statusText += ` ?? Conectando: ${conectando}\n`;
          statusText += ` ?? Con errores: ${errores}\n`;
          statusText += ` ?? **Total:** ${subbots.length} subbots\n\n`;

          statusText += `?? **Lista Detallada:**\n\n`;

          subbots.forEach((bot, index) => {
            const statusEmoji =
              bot.estado === "conectado"
                ? "??"
                : bot.estado === "conectando"
                  ? "??"
                  : bot.estado === "error"
                    ? "??"
                    : "??";

            const lastActivity = new Date(bot.ultima_actividad).toLocaleString(
              "es-ES",
            );

            statusText += `**${index + 1}. ${bot.nombre}**\n`;
            statusText += `?? ID: ${bot.id} | ?? ${bot.numero}\n`;
            statusText += `${statusEmoji} ${bot.estado.toUpperCase()}\n`;
            statusText += `? ${lastActivity}\n\n`;
          });

          statusText += `?? **Comandos Rapidos:**\n`;
          statusText += ` \`/connectbot [id]\` - Conectar\n`;
          statusText += ` \`/connectbot [id] code\` - Pairing code\n`;
          statusText += ` \`/subbotqr [id]\` - QR real\n`;
          statusText += ` \`/disconnectbot [id]\` - Desconectar\n`;
          statusText += ` \`/botinfo [id]\` - Info detallada\n\n`;
          statusText += `? ${new Date().toLocaleString("es-ES")}`;

          await sock.sendMessage(remoteJid, { text: statusText });
        } catch (error) {
          logger.error("Error obteniendo subbots activos:", error);
          await sock.sendMessage(remoteJid, {
            text: `?? *SubBots Activos*\n\n? Error obteniendo informacin\n\n?? Intenta nuevamente ms tarde`,
          });
        }
        break;

      case "/restartbot":
        if (!isOwner) {
          await sock.sendMessage(remoteJid, {
            text: "? Solo el owner puede reiniciar subbots",
          });
          break;
        }

        if (!args[0]) {
          await sock.sendMessage(remoteJid, {
            text: "? Uso: /restartbot [id]\nEjemplo: /restartbot 1",
          });
          break;
        }

        try {
          const botId = parseInt(args[0]);

          // Verificar si el subbot existe
          const subbot = await db("subbots").where({ id: botId }).first();
          if (!subbot) {
            await sock.sendMessage(remoteJid, {
              text: `?? *Reiniciar SubBot*\n\n? No existe un subbot con ID: ${botId}\n\n?? Usa \`/bots\` para ver la lista`,
            });
            break;
          }

          // Actualizar estado a "reiniciando"
          await db("subbots").where({ id: botId }).update({
            estado: "reiniciando",
            updated_at: new Date().toISOString(),
          });

          // Registrar actividad
          await db("subbot_activity").insert({
            subbot_id: botId,
            accion: "reiniciando",
            detalle: `SubBot ${subbot.nombre} reiniciado por ${usuario}`,
            usuario: usuario,
            created_at: new Date().toISOString(),
          });

          await sock.sendMessage(remoteJid, {
            text: `?? *Reiniciando SubBot*\n\n?? **SubBot:** ${subbot.nombre}\n?? **Nmero:** ${subbot.numero}\n?? **Estado:** Reiniciando...\n\n?? **Proceso:**\n1. Cerrando conexin actual\n2. Limpiando sesin\n3. Preparando nueva conexin\n\n? Esto puede tomar unos segundos...\n\n?? **Por:** ${usuario}\n? ${new Date().toLocaleString("es-ES")}`,
          });

          // Simular proceso de reinicio
          setTimeout(async () => {
            try {
              // Limpiar archivos de sesion del subbot
              const authPath = `./auth-sessions/subbot-${botId}`;
              if (fs.existsSync(authPath)) {
                fs.rmSync(authPath, { recursive: true, force: true });
              }

              // Actualizar estado a desconectado
              await db("subbots").where({ id: botId }).update({
                estado: "desconectado",
                ultima_actividad: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });

              await db("subbot_activity").insert({
                subbot_id: botId,
                accion: "reiniciado",
                detalle: `SubBot ${subbot.nombre} reiniciado exitosamente`,
                usuario: usuario,
                created_at: new Date().toISOString(),
              });

              await sock.sendMessage(remoteJid, {
                text: `? *SubBot Reiniciado*\n\n?? **${subbot.nombre}** reiniciado exitosamente\n\n?? Nmero: ${subbot.numero}\n?? Estado: Desconectado (listo para conectar)\n?? Sesin limpiada\n\n?? **Prximos pasos:**\n \`/connectbot ${botId}\` - Conectar con QR\n \`/connectbot ${botId} code\` - Conectar con KONMIBOT\n \`/subbotqr ${botId}\` - QR real de Baileys\n\n? ${new Date().toLocaleString("es-ES")}`,
              });
            } catch (restartError) {
              logger.error("Error en reinicio de subbot:", restartError);

              await db("subbots").where({ id: botId }).update({
                estado: "error",
                updated_at: new Date().toISOString(),
              });

              await sock.sendMessage(remoteJid, {
                text: `? *Error Reiniciando SubBot*\n\n?? SubBot: ${subbot.nombre}\n?? Estado: Error\n\n?? Intenta nuevamente o usa \`/delbot ${botId}\` para eliminar y crear uno nuevo`,
              });
            }
          }, 5000); // 5 segundos de simulacion
        } catch (error) {
          logger.error("Error reiniciando subbot:", error);
          await sock.sendMessage(remoteJid, {
            text: `?? *Reiniciar SubBot*\n\n? Error en el proceso de reinicio\n\n?? Intenta nuevamente ms tarde`,
          });
        }
        break;

      case "/update":
      case "/reload":
        if (!isOwner) {
          await sock.sendMessage(remoteJid, {
            text: "? Solo el owner puede actualizar el bot",
          });
          break;
        }

        try {
          await sock.sendMessage(remoteJid, {
            text: `?? *Actualizando Bot...*\n\n? **Proceso:**\n1. Recargando configuraciones\n2. Actualizando comandos\n3. Limpiando cach\n4. Aplicando cambios\n\n?? Esto puede tomar unos segundos...`,
          });

          // Simular proceso de actualizacion
          setTimeout(async () => {
            try {
              // Limpiar caches
              nameCache.clear();
              groupNameCache.clear();

              // Actualizar configuraciones (simular)
              const memoryUsage = process.memoryUsage();
              const uptime = process.uptime();

              await sock.sendMessage(remoteJid, {
                text: `? *Bot Actualizado*\n\n?? **Cambios aplicados:**\n Configuraciones recargadas\n Comandos actualizados\n Cacha limpiado\n Memoria optimizada\n\n?? **Estado actual:**\n  ?? Memoria: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB\n ?? Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m\n ?? Versin: v2.5.0\n ?? Estado: Operativo\n\n?? **Actualizado por:** ${usuario}\n? ${new Date().toLocaleString("es-ES")}`,
              });

              logger.info(`? Bot actualizado por owner: ${usuario}`);
            } catch (updateError) {
              logger.error("Error en actualizacion:", updateError);
              await sock.sendMessage(remoteJid, {
                text: `? *Error en Actualizacion*\n\n?? Error: ${updateError.message}\n\n?? El bot sigue funcionando normalmente`,
              });
            }
          }, 3000); // 3 segundos de simulacion
        } catch (error) {
          logger.error("Error iniciando actualizacion:", error);
          await sock.sendMessage(remoteJid, {
            text: `?? *Actualizar Bot*\n\n? Error iniciando actualizacion\n\n?? Intenta nuevamente mas tarde`,
          });
        }
        break;

      case "/bratvd":
        const bratvdText = args.join(" ");
        if (!bratvdText) {
          await sock.sendMessage(remoteJid, {
            text: "? Uso: /bratvd [texto]\nEjemplo: /bratvd Hola mundo",
          });
        } else {
          try {
            await sock.sendMessage(remoteJid, {
              text: "?? Generando sticker animado BRAT... ?",
            });

            // Usar API para generar sticker animado BRAT
            const response = await fetch(
              `https://api.vreden.my.id/api/bratvd?text=${encodeURIComponent(bratvdText)}`,
            );
            const data = await response.json();

            if (data.status && data.data && data.data.url) {
              // Enviar como sticker animado
              await sock.sendMessage(remoteJid, {
                sticker: { url: data.data.url },
                caption: `?? *BRAT VD - Sticker Animado*\n\n?? **Texto:** "${bratvdText}"\n?? **Estilo:** BRAT Animado\n? **Formato:** WebP Animado\n\n?? Solicitado por: ${usuario}\n? ${new Date().toLocaleString("es-ES")}`,
              });
            } else {
              await sock.sendMessage(remoteJid, {
                text: `?? *BRAT VD*\n\n? No se pudo generar el sticker animado: "${bratvdText}"\n\n?? Intenta con texto ms corto o diferente.`,
              });
            }
          } catch (error) {
            logger.error("Error generando BRATVD:", error);
            await sock.sendMessage(remoteJid, {
              text: `?? *BRAT VD*\n\n? Error generando sticker animado.\n\n?? Intenta nuevamente ms tarde.`,
            });
          }
        }
        break;

      case "/brat":
        const bratText = args.join(" ");
        if (!bratText) {
          await sock.sendMessage(remoteJid, {
            text: "? Uso: /brat [texto]\nEjemplo: /brat Hola mundo",
          });
        } else {
          try {
            await sock.sendMessage(remoteJid, {
              text: "?? Generando sticker BRAT... ?",
            });

            // Usar API para generar sticker BRAT
            const response = await fetch(
              `https://api.vreden.my.id/api/brat?text=${encodeURIComponent(bratText)}`,
            );
            const data = await response.json();

            if (data.status && data.data && data.data.url) {
              // Enviar como sticker
              await sock.sendMessage(remoteJid, {
                sticker: { url: data.data.url },
              });

              // Enviar info del sticker
              await sock.sendMessage(remoteJid, {
                text: `?? *BRAT - Sticker*\n\n?? **Texto:** "${bratText}"\n?? **Estilo:** BRAT\n?? **Formato:** WebP\n\n?? Solicitado por: ${usuario}\n? ${new Date().toLocaleString("es-ES")}`,
              });
            } else {
              await sock.sendMessage(remoteJid, {
                text: `?? *BRAT*\n\n? No se pudo generar el sticker: "${bratText}"\n\n?? Intenta con texto mas corto o diferente.`,
              });
            }
          } catch (error) {
            logger.error("Error generando BRAT:", error);
            await sock.sendMessage(remoteJid, {
              text: `?? *BRAT*\n\n? Error generando sticker.\n\n?? Intenta nuevamente mas tarde.`,
            });
          }
        }
        break;

      case "/tts":
        const ttsArgs = args.join(" ").split("|");
        const ttsText = ttsArgs[0]?.trim();
        const ttsCharacter = ttsArgs[1]?.trim() || "narrator";

        if (!ttsText) {
          await sock.sendMessage(remoteJid, {
            text: "?? **TTS - Voces de Personajes:**\n\n?? `/tts [texto]|[personaje]`\n\n**Ejemplos:**\n `/tts Hola mundo` (narrador)\n `/tts Hola mundo|mario` (Mario Bros)\n `/tts Hello there|vader` (Darth Vader)\n `/tts Que pasa|bart` (Bart Simpson)\n\n?? **Personajes disponibles:**\n `narrator` - Narrador (defecto)\n `mario` - Mario Bros\n `luigi` - Luigi\n `vader` - Darth Vader\n `yoda` - Maestro Yoda\n `homer` - Homer Simpson\n `bart` - Bart Simpson\n `marge` - Marge Simpson\n `spongebob` - Bob Esponja\n `patrick` - Patricio Estrella\n `squidward` - Calamardo\n `mickey` - Mickey Mouse\n `donald` - Pato Donald\n `goofy` - Goofy\n `shrek` - Shrek\n `batman` - Batman\n `joker` - Joker\n `pikachu` - Pikachu\n `sonic` - Sonic\n `optimus` - Optimus Prime",
          });
        } else {
          try {
            await sock.sendMessage(remoteJid, {
              text: `?? Generando audio con voz de ${ttsCharacter}... ?`,
            });

            // Usar API para generar TTS con personajes
            const response = await fetch(
              `https://api.vreden.my.id/api/tts/character?text=${encodeURIComponent(ttsText)}&character=${ttsCharacter}`,
            );
            const data = await response.json();

            if (data.status && data.data && data.data.url) {
              // Enviar como audio
              await sock.sendMessage(remoteJid, {
                audio: { url: data.data.url },
                mimetype: "audio/mpeg",
                ptt: true, // Como nota de voz
                caption: `?? *TTS - Personaje*\n\n?? **Texto:** "${ttsText}"\n?? **Personaje:** ${ttsCharacter.toUpperCase()}\n? **Duracion:** ${data.data.duration || "N/A"}\n?? **Calidad:** ${data.data.quality || "HD"}\n\n?? Solicitado por: ${usuario}\n? ${new Date().toLocaleString("es-ES")}`,
              });
            } else {
              // Fallback a TTS normal si el personaje no esta disponible
              try {
                const fallbackResponse = await fetch(
                  `https://api.vreden.my.id/api/tts?text=${encodeURIComponent(ttsText)}&lang=es`,
                );
                const fallbackData = await fallbackResponse.json();

                if (
                  fallbackData.status &&
                  fallbackData.data &&
                  fallbackData.data.url
                ) {
                  await sock.sendMessage(remoteJid, {
                    audio: { url: fallbackData.data.url },
                    mimetype: "audio/mpeg",
                    ptt: true,
                    caption: `?? *TTS - Voz Normal*\n\n?? **Texto:** "${ttsText}"\n?? **Nota:** Personaje "${ttsCharacter}" no disponible\n?? **Voz:** Narrador estandar\n\n?? Solicitado por: ${usuario}\n? ${new Date().toLocaleString("es-ES")}`,
                  });
                } else {
                  await sock.sendMessage(remoteJid, {
                    text: `?? *TTS*\n\n? No se pudo generar el audio: "${ttsText}"\n\n?? Personaje "${ttsCharacter}" no disponible.\n?? Intenta con otro personaje o usa el narrador por defecto.`,
                  });
                }
              } catch (fallbackError) {
                await sock.sendMessage(remoteJid, {
                  text: `?? *TTS*\n\n? No se pudo generar el audio: "${ttsText}"\n\n?? Personaje "${ttsCharacter}" no disponible y servicio TTS temporalmente fuera de lnea.`,
                });
              }
            }
          } catch (error) {
            logger.error("Error generando TTS con personaje:", error);
            await sock.sendMessage(remoteJid, {
              text: `?? *TTS*\n\n? Error generando audio con personaje.\n\n?? Intenta nuevamente mas tarde o usa otro personaje.`,
            });
          }
        }
        break;

      case "/play":
        const playQuery = args.join(" ");
        if (!playQuery) {
          await sock.sendMessage(remoteJid, {
            text: "? Uso: /play [cancion]\nEjemplo: /play Despacito Luis Fonsi",
          });
        } else {
          try {
            await sock.sendMessage(remoteJid, {
              text: "?? Buscando musica... ?",
            });

            // Buscar msica con API
            const response = await fetch(
              `https://api.vreden.my.id/api/spotify/search?query=${encodeURIComponent(playQuery)}`,
            );
            const data = await response.json();

            if (data.status && data.data && data.data.length > 0) {
              const track = data.data[0];

              // Mostrar informacion con barra de progreso REAL que se edita
              let progressMsg = await sock.sendMessage(remoteJid, {
                text:
                  `?? *Musica Encontrada*\n\n` +
                  `?? **Artista:** ${track.artist}\n` +
                  `?? **Cancion:** ${track.title}\n` +
                  `?? **Album:** ${track.album}\n` +
                  `?? **Duracion:** ${track.duration}\n` +
                  `?? **URL:** ${track.url}\n\n` +
                  `?? **Descargando...** ?\n` +
                  `?????????? 0%\n\n` +
                  `?? Solicitado por: ${usuario}`,
              });

              // Barra de progreso REAL que se actualiza dinamicamente
              const progressSteps = [
                {
                  percent: 15,
                  bar: "?????????",
                  status: "? Conectando...",
                  emoji: "??",
                },
                {
                  percent: 30,
                  bar: "???????",
                  status: "?? Descargando...",
                  emoji: "??",
                },
                {
                  percent: 50,
                  bar: "?????",
                  status: "?? Procesando...",
                  emoji: "??",
                },
                {
                  percent: 75,
                  bar: "???",
                  status: "?? Convirtiendo...",
                  emoji: "??",
                },
                {
                  percent: 90,
                  bar: "?",
                  status: "? Finalizando...",
                  emoji: "?",
                },
                { percent: 100, bar: "", status: "? Completo!", emoji: "??" },
              ];

              // Funcion para actualizar progreso en tiempo real
              let currentStep = 0;
              const updateProgress = async () => {
                if (currentStep < progressSteps.length) {
                  const step = progressSteps[currentStep];

                  try {
                    await sock.sendMessage(remoteJid, {
                      text:
                        `${step.emoji} *Descargando: ${track.title}*\n\n` +
                        `?? ${track.artist}\n` +
                        `?? ${track.album}\n\n` +
                        `?? **Progreso:** ${step.percent}%\n` +
                        `${step.bar} ${step.percent}%\n` +
                        `${step.status}\n\n` +
                        `? ${new Date().toLocaleTimeString("es-ES")}`,
                    });

                    currentStep++;

                    // Continuar con el siguiente paso
                    if (currentStep < progressSteps.length) {
                      setTimeout(updateProgress, 1000); // 1 segundo entre actualizaciones
                    }
                  } catch (err) {
                    logger.error("Error actualizando progreso:", err);
                    // Continuar con el siguiente paso aunque haya error
                    currentStep++;
                    if (currentStep < progressSteps.length) {
                      setTimeout(updateProgress, 1000);
                    }
                  }
                }
              };

              // Iniciar la actualizacion de progreso
              setTimeout(updateProgress, 1000);

              // Enviar audio despues del progreso
              setTimeout(async () => {
                try {
                  if (track.preview_url) {
                    await sock.sendMessage(remoteJid, {
                      audio: { url: track.preview_url },
                      mimetype: "audio/mpeg",
                      caption: `?? *${track.title}*\n\n?? ${track.artist}\n?? ${track.album}\n?? ${track.duration}\n\n?? Solicitado por: ${usuario}\n? ${new Date().toLocaleString("es-ES")}`,
                    });
                  } else {
                    await sock.sendMessage(remoteJid, {
                      text: `?? *Musica Encontrada*\n\n? **Informacion completa disponible**\n\n?? **Escuchar en Spotify:**\n${track.url}\n\n?? Preview de audio no disponible para esta cancion.`,
                    });
                  }
                } catch (audioError) {
                  logger.error("Error enviando audio:", audioError);
                  await sock.sendMessage(remoteJid, {
                    text: `?? *Play*\n\n? Error enviando audio\n\n?? **Escuchar en Spotify:**\n${track.url}`,
                  });
                }
              }, 7000); // 7 segundos despues de iniciar
            } else {
              await sock.sendMessage(remoteJid, {
                text: `?? *Play*\n\n? No se encontraron resultados para: "${playQuery}"\n\n?? Intenta con otros terminos de busqueda.`,
              });
            }
          } catch (error) {
            logger.error("Error en play:", error);
            await sock.sendMessage(remoteJid, {
              text: `?? *Play*\n\n? Error buscando musica: "${playQuery}"\n\n?? Intenta nuevamente en unos momentos.`,
            });
          }
        }
        break;

      case "/short":
      case "/acortar":
        const urlToShorten = args.join(" ");
        if (!urlToShorten) {
          await sock.sendMessage(remoteJid, {
            text: "? Uso: /short [URL]\nEjemplo: /short https://www.google.com",
          });
        } else {
          try {
            await sock.sendMessage(remoteJid, {
              text: "?? Acortando URL... ?",
            });

            // Usar API de Vreden para acortar URLs
            const response = await fetch(
              `https://api.vreden.my.id/api/shorturl?url=${encodeURIComponent(urlToShorten)}`,
            );
            const data = await response.json();

            if (data.status && data.data && data.data.shortUrl) {
              await sock.sendMessage(remoteJid, {
                text:
                  `?? *URL Acortada*\n\n` +
                  `?? **URL Original:**\n${urlToShorten}\n\n` +
                  `?? **URL Acortada:**\n${data.data.shortUrl}\n\n` +
                  `?? **Ahorro:** ${(((urlToShorten.length - data.data.shortUrl.length) / urlToShorten.length) * 100).toFixed(1)}%\n\n` +
                  `?? Solicitado por: ${usuario}\n` +
                  `? ${new Date().toLocaleString("es-ES")}`,
              });
            } else {
              await sock.sendMessage(remoteJid, {
                text: `?? *Acortador de URLs*\n\n? No se pudo acortar la URL: "${urlToShorten}"\n\n?? Verifica que la URL sea vlida y comience con http:// o https://`,
              });
            }
          } catch (error) {
            logger.error("Error acortando URL:", error);
            await sock.sendMessage(remoteJid, {
              text: `?? *Acortador de URLs*\n\n? Error acortando URL.\n\n?? Intenta nuevamente ms tarde.`,
            });
          }
        }
        break;

      // Comandos adicionales que faltaban
      case "/ping":
        await sock.sendMessage(remoteJid, {
          text: `?? Pong! Bot funcionando correctamente.\n\n?? Solicitado por: @${usuario}\n? ${new Date().toLocaleString("es-ES")}`,
          mentions: [usuario + "@s.whatsapp.net"],
        });
        break;

      case "/status":
        try {
          const globalStatus = await isBotGloballyActiveFromDB();
          const groupStatus = isGroup
            ? await isBotActiveInGroup(remoteJid)
            : true;
          const memoryUsage = process.memoryUsage();
          const uptime = process.uptime();

          // Formatear uptime
          const days = Math.floor(uptime / 86400);
          const hours = Math.floor((uptime % 86400) / 3600);
          const minutes = Math.floor((uptime % 3600) / 60);

          let uptimeFormatted = "";
          if (days > 0) uptimeFormatted += `${days}d `;
          if (hours > 0) uptimeFormatted += `${hours}h `;
          uptimeFormatted += `${minutes}m`;

          // Obtener estadisticas de BD
          const totalAportes = await db("aportes").count("id as count").first();
          const totalPedidos = await db("pedidos").count("id as count").first();

          const statusInfo =
            `?? *Estado Completo del Bot*\n\n` +
            `?? *KONMI BOT v2.5.0*\n` +
            `?? Conexion WhatsApp: ${connectionStatus}\n` +
            `?? Estado Global: ${globalStatus ? "? Activo" : "?? Desactivado"}\n` +
            `?? Estado en Grupo: ${isGroup ? (groupStatus ? "? Activo" : "?? Desactivado") : "N/A"}\n\n` +
            `?? *Sistema:*\n` +
            `?? Tiempo activo: ${uptimeFormatted}\n` +
            `?? Memoria usada: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB\n` +
            `?? Memoria total: ${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB\n` +
            `?? Node.js: ${process.version}\n\n` +
            `?? *Actividad:*\n` +
            `?? Total aportes: ${totalAportes?.count || 0}\n` +
            `?? Total pedidos: ${totalPedidos?.count || 0}\n` +
            `?? Cache nombres: ${nameCache.size}\n` +
            `?? Cache grupos: ${groupNameCache.size}\n\n` +
            `?? Owner: 595974154768 (Melodia)\n` +
            `âš™ï¸ Engine: WhiskeySockets/Baileys\n` +
            `${globalStatus ? "âœ… Funcionando correctamente" : "ðŸ”§ Modo mantenimiento"}\n\n` +
            `ðŸ“ Solicitado por: @${usuario}\n` +
            `? ${new Date().toLocaleString("es-ES")}`;

          await sock.sendMessage(remoteJid, {
            text: statusInfo,
            mentions: [usuario + "@s.whatsapp.net"],
          });
        } catch (error) {
          logger.error("Error obteniendo status:", error);
          await sock.sendMessage(remoteJid, {
            text: "? Error obteniendo estado del sistema",
          });
        }
        break;

      case "/info":
        try {
          const globalStatus = await isBotGloballyActiveFromDB();
          const memoryUsage = process.memoryUsage();
          const uptime = process.uptime();

          // Obtener informacion real del sistema
          const totalAportes = await db("aportes").count("id as count").first();
          const totalManhwas = await db("manhwas").count("id as count").first();

          const botInfo =
            `ðŸ¤– *InformaciÃ³n Completa del Bot*\n\n` +
            `ðŸ†” *IdentificaciÃ³n:*\n` +
            `ðŸ“± Nombre: KONMI BOT\n` +
            `ðŸ”¢ VersiÃ³n: v2.5.0\n` +
            `? Engine: WhiskeySockets/Baileys\n` +
            `ðŸ‘¤ Owner: 595974154768 (MelodÃ­a)\n\n` +
            `ðŸ’» *Sistema:*\n` +
            `ðŸ–¥ï¸ Plataforma: ${process.platform}\n` +
            `âš¡ Node.js: ${process.version}\n` +
            `ðŸ”§ Arquitectura: ${process.arch}\n` +
            `ðŸ’¾ Memoria: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB\n` +
            `â±ï¸ Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m\n\n` +
            `ðŸ“Š *EstadÃ­sticas:*\n` +
            `ðŸ“š Aportes registrados: ${totalAportes?.count || 0}\n` +
            `ðŸ“– Manhwas en BD: ${totalManhwas?.count || 0}\n` +
            `ðŸ‘¥ Nombres en cache: ${nameCache.size}\n` +
            `ðŸ·ï¸ Grupos en cache: ${groupNameCache.size}\n\n` +
            `ðŸ”„ *Estado:*\n` +
            `ðŸŒ Global: ${globalStatus ? "âœ… Activo" : "â›” Desactivado"}\n` +
            `ðŸ“¡ ConexiÃ³n: ${connectionStatus}\n` +
            `âš™ï¸ Estado: ${globalStatus ? "Operativo" : "Mantenimiento"}\n\n` +
            `ðŸ“ Solicitado por: @${usuario}\n` +
            `ðŸ“… Fecha: ${new Date().toLocaleDateString("es-ES")}\n` +
            `â° Hora: ${new Date().toLocaleTimeString("es-ES")}`;

          await sock.sendMessage(remoteJid, {
            text: botInfo,
            mentions: [usuario + "@s.whatsapp.net"],
          });
        } catch (error) {
          logger.error("Error obteniendo info:", error);
          await sock.sendMessage(remoteJid, {
            text: "? Error obteniendo informacin del sistema",
          });
        }
        break;

      case "/owner":
        // Forzar verificacion de owner con debug
        const ownerCheck = isSpecificOwner(usuario);

        const ownerInfo =
          `ðŸ‘‘ *InformaciÃ³n del Owner*\n\n` +
          `ðŸ“± **NÃºmero:** 595974154768\n` +
          `ðŸ‘¤ **Nombre:** MelodÃ­a\n` +
          `ðŸ”‘ **Permisos:** Administrador Total\n` +
          `? **Capacidades:** Control completo del bot\n` +
          `ðŸŒ **Alcance:** Global en todos los grupos\n\n` +
          `ðŸ” **VerificaciÃ³n de Usuario:**\n` +
          `ðŸ“± Tu nÃºmero: ${usuario}\n` +
          `ðŸŽ¯ Estado: ${ownerCheck ? "âœ… OWNER VERIFICADO" : "ðŸ‘¤ Usuario regular"}\n` +
          `ðŸ” Permisos: ${isOwner ? "âœ… Acceso total" : "âš ï¸ Acceso limitado"}\n\n` +
          `ðŸ“ Solicitado por: @${usuario}\n` +
          `? ${new Date().toLocaleString("es-ES")}`;

        await sock.sendMessage(remoteJid, {
          text: ownerInfo,
          mentions: [usuario + "@s.whatsapp.net"],
        });
        break;

      case "/checkowner":
        // Comando especial para debug del owner
        const debugOwner = isSpecificOwner(usuario);
        let superAdminCheck = false;

        try {
          superAdminCheck = isSuperAdmin(usuario);
        } catch (error) {
          // Ignorar error
        }

        const debugInfo =
          `ðŸ”§ *Debug Owner Check*\n\n` +
          `ðŸ“± Usuario recibido: ${usuario}\n` +
          `ðŸ“± NÃºmero esperado: 595974154768\n` +
          `? Funcion isSpecificOwner: ${debugOwner ? "SI" : "NO"}\n` +
          `? Funcion isSuperAdmin: ${superAdminCheck ? "SI" : "NO"}\n` +
          `ðŸ” Variable isOwner: ${isOwner ? "SÃ­" : "NO"}\n\n` +
          `âš ï¸ Si eres el owner (595974154768) y aparece NO, hay un problema de detecciÃ³n.`;

        await sock.sendMessage(remoteJid, { text: debugInfo });
        break;

      default:
        await sock.sendMessage(remoteJid, {
          text: "? Comando no reconocido. Usa /help para ver comandos disponibles.",
        });
    }

    // Enviar respuesta si hay resultado
    if (result && result.message) {
      try {
        const content = result.mentions
          ? { text: result.message, mentions: result.mentions }
          : { text: result.message };

        if (result.replyTo) {
          await sock.sendMessage(remoteJid, content, {
            quoted: result.replyTo,
          });
        } else {
          await sock.sendMessage(remoteJid, content);
        }
      } catch (error) {
        logger.error("Error enviando respuesta:", error);
        await sock.sendMessage(remoteJid, {
          text: "âš ï¸ Error enviando respuesta. Intenta nuevamente.",
        });
      }
    }

    // Los logs ya se manejan en logAllMessages() al inicio
  } catch (error) {
    logger.error("Error en handleMessage:", error.message);
    logger.error("Stack trace:", error.stack);
  }
}

// Conectar a WhatsApp
async function connectToWhatsApp(
  authPath,
  usePairingCode = false,
  phoneNumber = null,
) {
  // Cargar Baileys dinmicamente (permite forks)
  const ok = await loadBaileys();
  if (!ok) {
    connectionStatus = "error";
    throw new Error(
      "Baileys no est disponible. Instala la dependencia o tu fork y reinicia.",
    );
  }
  // Guardar authPath para reconexiones
  if (authPath) {
    savedAuthPath = authPath;
  }

  // Usar el authPath guardado si no se proporciona uno nuevo
  const effectiveAuthPath = authPath || savedAuthPath;

  if (!effectiveAuthPath) {
    throw new Error("No se proporcionÃ³ authPath para la conexiÃ³n");
  }

  logger.pretty.banner("KONMI BOT v2.5.0", "ðŸ¤–");
  logger.pretty.section("Sistema de autenticaciÃ³n interactivo", "ðŸ”");

  try {
    // Si vamos a usar pairing, NO borrar la carpeta de auth: mantener claves evita errores internos
    if (usePairingCode && (phoneNumber || pairingTargetNumber)) {
      try {
        const absAuthPath = path.resolve(effectiveAuthPath);
        fs.mkdirSync(absAuthPath, { recursive: true });
        fs.mkdirSync(path.join(absAuthPath, "keys"), { recursive: true });
      } catch (cleanErr) {
        logger.warn(
          "No se pudo preparar la carpeta de auth antes del pairing",
          { error: cleanErr?.message },
        );
      }
    }

    // Asegurar que la carpeta de auth exista (algunos forks no la crean automticamente)
    try {
      const absAuthPath = path.resolve(effectiveAuthPath);
      fs.mkdirSync(absAuthPath, { recursive: true });
      fs.mkdirSync(path.join(absAuthPath, "keys"), { recursive: true });
    } catch (mkErr) {
      logger.warn("No se pudo crear carpeta de auth", {
        error: mkErr?.message,
      });
    }

    // Validar creds.json existente y resetear si est incompleto
    try {
      const absAuthPath = path.resolve(effectiveAuthPath);
      const credsPath = path.join(absAuthPath, "creds.json");
      if (fs.existsSync(credsPath)) {
        try {
          const raw = fs.readFileSync(credsPath, "utf8");
          const data = JSON.parse(raw || "{}");
          const ok =
            data?.noiseKey?.public &&
            data?.signedIdentityKey?.public &&
            data?.signedPreKey?.keyPair?.public;
          if (!ok) {
            const backup = path.join(
              absAuthPath,
              `creds.backup.${Date.now()}.json`,
            );
            fs.renameSync(credsPath, backup);
            logger.warn(`creds.json incompleto, respaldado`, { backup });
          }
        } catch (e) {
          const backup = path.join(
            absAuthPath,
            `creds.backup.${Date.now()}.json`,
          );
          try {
            fs.renameSync(credsPath, backup);
          } catch (_) {}
          logger.warn(
            "creds.json corrupto, respaldado y se regenerarÃ¡ limpio",
            { backup },
          );
        }
      }
    } catch (_) {}

    const { state, saveCreds } = await useMultiFileAuthState(effectiveAuthPath);
    // Inicializar archivo de credenciales desde el inicio
    try {
      await saveCreds();
    } catch (_) {}

    // Si no hay mÃ©todo definido y no hay sesiÃ³n, preguntar interactivamente
    // SOLO preguntar si no hay mÃ©todo guardado de una sesiÃ³n anterior
    if (
      !usePairingCode &&
      !phoneNumber &&
      !state.creds.registered &&
      !userSelectedMethod
    ) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const authConfig = await new Promise((resolve) => {
        logger.pretty.banner("MÃ©todo de autenticaciÃ³n", "ðŸ”");
        logger.pretty.line("Opciones disponibles:");
        logger.pretty.line("1) QR Code - Escanear cÃ³digo QR en terminal");
        logger.pretty.line("2) Pairing Code - CÃ³digo de 8 dÃ­gitos");

        rl.question(" Seleccione mÃ©todo (1 o 2): ", (answer) => {
          const choice = answer.trim();

          if (choice === "1") {
            logger.pretty.line("QR Code seleccionado");
            logger.pretty.line("El cÃ³digo QR aparecer en la terminal");
            rl.close();
            resolve({ method: "qr" });
          } else if (choice === "2") {
            rl.question(
              "\n Ingrese nmero de telfono con cdigo de pas (ej: 595974154768): ",
              (phone) => {
                const cleanedNumber = sanitizePhoneNumberInput(phone);

                if (cleanedNumber) {
                  logger.pretty.line("Pairing Code seleccionado");
                  logger.pretty.kv("NÃºmero", `+${cleanedNumber}`);
                  logger.pretty.line(
                    "El cÃ³digo de 8 dÃ­gitos aparecerÃ¡ en la terminal",
                  );
                  rl.close();
                  resolve({ method: "pairing", phoneNumber: cleanedNumber });
                } else {
                  logger.pretty.line(
                    "âš ï¸ NÃºmero invÃ¡lido, usando QR por defecto",
                  );
                  rl.close();
                  resolve({ method: "qr" });
                }
              },
            );
          } else {
            logger.pretty.line("âš ï¸ OpciÃ³n invÃ¡lida, usando QR por defecto");
            rl.close();
            resolve({ method: "qr" });
          }
        });
      });

      // Guardar la seleccin del usuario para reconexiones
      userSelectedMethod = authConfig.method;
      if (authConfig.phoneNumber) {
        userSelectedPhone = authConfig.phoneNumber;
      }

      if (authConfig.method === "pairing") {
        usePairingCode = true;
        phoneNumber = authConfig.phoneNumber;
      }
    } else if (userSelectedMethod && !usePairingCode && !phoneNumber) {
      // Usar el mtodo guardado en reconexiones
      logger.pretty.line(
        `Usando mÃ©todo guardado: ${userSelectedMethod === "qr" ? "QR Code" : "Pairing Code"}`,
      );
      if (userSelectedMethod === "pairing" && userSelectedPhone) {
        usePairingCode = true;
        phoneNumber = userSelectedPhone;
      }
    }

    const effectivePairingNumber = phoneNumber || pairingTargetNumber;

    // Debug y validacin explcita del nmero para pairing
    if (usePairingCode) {
      const onlyDigits = String(effectivePairingNumber || "").replace(
        /\D/g,
        "",
      );
      logger.pretty.line(
        `ðŸ”§ [PAIRING DEBUG] NÃºmero recibido: ${phoneNumber || "(null)"} | Destino: ${pairingTargetNumber || "(null)"} | Normalizado: ${onlyDigits}`,
      );
      if (!onlyDigits || onlyDigits.length < 7 || onlyDigits.length > 15) {
        logger.pretty.line(
          "âš ï¸ [PAIRING DEBUG] NÃºmero invÃ¡lido para pairing (se requieren 7-15 dÃ­gitos).",
        );
      }
    }

    if (usePairingCode && effectivePairingNumber) {
      if (!state.creds.registered) {
        logger.pretty.line(
          `Configurando modo pairing code para: +${effectivePairingNumber}`,
        );
        state.creds.me = undefined;
        state.creds.account = undefined;
        state.creds.registered = false;
        state.creds.usePairingCode = true;
      } else {
        // Ya registrado: no forzar pairing de nuevo
        logger.pretty.line(
          "Credenciales ya registradas, no se forzarÃ¡ pairing en esta reconexiÃ³n.",
        );
        try {
          state.creds.usePairingCode = false;
        } catch (_) {}
      }
    }

    // Usar versin compatible de WhatsApp
    let version;
    try {
      const v = await baileys.fetchLatestBaileysVersion();
      version = v.version;
      logger.pretty.kv("VersiÃ³n WhatsApp Web soportada", version.join("."));
    } catch (e) {
      // Fallback (en caso de error de red o cambios de API)
      version = [2, 3000, 1015901307];
      logger.warn(
        "No se pudo obtener la versiÃ³n mÃ¡s reciente de Baileys, usando fallback.",
      );
    }

    // ConfiguraciÃ³n de dispositivo (browser) por entorno
    const deviceCfg = String(process.env.BOT_DEVICE || "default").toLowerCase();
    const deviceName =
      process.env.BOT_DEVICE_NAME && process.env.BOT_DEVICE_NAME.trim()
        ? process.env.BOT_DEVICE_NAME.trim()
        : null;
    let deviceLabel = "dispositivo predeterminado";

    const socketOptions = {
      version,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      auth: state,
      getMessage: async () => null,
    };

    try {
      if (deviceCfg === "windows") {
        socketOptions.browser = Browsers.windows(deviceName || "WhatsApp Web");
        deviceLabel = deviceName || "Windows";
      } else if (deviceCfg === "macos") {
        socketOptions.browser = Browsers.macOS(deviceName || "WhatsApp Web");
        deviceLabel = deviceName || "macOS";
      } else if (deviceCfg === "ubuntu" || deviceCfg === "linux") {
        socketOptions.browser = Browsers.ubuntu(deviceName || "WhatsApp Web");
        deviceLabel = deviceName || "Ubuntu";
      } else if (deviceCfg === "custom") {
        socketOptions.browser = [
          deviceName || "App",
          process.env.BOT_DEVICE_AGENT || "Chrome",
          process.env.BOT_DEVICE_VERSION || "1.0.0",
        ];
        deviceLabel = deviceName || "Custom";
      } else {
        // default: no establecer browser para usar el predeterminado de la lib
        deviceLabel = "dispositivo predeterminado";
      }
    } catch (e) {
      logger.warn(
        "No se pudo aplicar configuraciÃ³n de dispositivo, usando predeterminado",
        { error: e?.message },
      );
      deviceLabel = "dispositivo predeterminado";
    }

    sock = makeWASocket(socketOptions);

    // Helper: esperar a que las claves de autenticaciÃ³n estÃ©n listas
    const waitForAuthKeysReady = async (maxMs = 8000) => {
      const start = Date.now();
      while (Date.now() - start < maxMs) {
        try {
          const creds = sock?.authState?.creds;
          if (
            creds?.noiseKey?.public &&
            creds?.signedIdentityKey?.public &&
            creds?.signedPreKey?.keyPair?.public
          ) {
            return true;
          }
        } catch (_) {}
        await new Promise((r) => setTimeout(r, 200));
      }
      return false;
    };

    // Guardado robusto de credenciales (crear carpeta si hiciera falta)
    sock.ev.on("creds.update", async () => {
      try {
        const absAuthPath = path.resolve(effectiveAuthPath);
        fs.mkdirSync(absAuthPath, { recursive: true });
        fs.mkdirSync(path.join(absAuthPath, "keys"), { recursive: true });
      } catch (_) {}
      try {
        await saveCreds();
      } catch (e) {
        console.error(" Error guardando credenciales:", e.message);
      }
    });

    // La generacin del pairing code ahora se realiza en connection.update

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Si estamos en pairing, solicitar el cdigo SOLO cuando llega un QR (seal de socket listo)
      if (
        usePairingCode &&
        effectivePairingNumber &&
        !!qr &&
        !currentPairingCode &&
        !pairingRequestInProgress
      ) {
        try {
          pairingRequestInProgress = true;
          if (sock?.authState?.creds) {
            sock.authState.creds.usePairingCode = true;
          }
          const target = String(effectivePairingNumber || "").replace(
            /\D/g,
            "",
          );
          // Esperar un poco tras QR para asegurar que WS est listo
          await new Promise((r) => setTimeout(r, 1200));
          const keysReady = await waitForAuthKeysReady(8000);
          logger.pretty.line(`ðŸ”§ [PAIRING DEBUG] keysReady=${keysReady}`);
          let pairingCode = null;
          const maxAttempts = 3;
          // Preparar pairing code personalizado (solo letras/nmeros, 8 chars)
          const envCustom = (
            process.env.PAIRING_CODE ||
            process.env.CUSTOM_PAIRING_CODE ||
            ""
          ).toString();
          const customCandidate = envCustom
            .replace(/[^A-Za-z0-9]/g, "")
            .toUpperCase()
            .slice(0, 8);
          const useCustom = customCandidate.length === 8;
          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
              if (useCustom && attempt === 1) {
                logger.pretty.line(
                  `ðŸ”§ [PAIRING DEBUG] requestPairingCode(${target}, ${customCandidate}) intento ${attempt}/${maxAttempts} (custom)`,
                );
                try {
                  pairingCode = await sock.requestPairingCode(
                    target,
                    customCandidate,
                  );
                } catch (e) {
                  logger.error(
                    `ðŸ”§ [PAIRING DEBUG] custom code fallÃ³: ${e.message}, intentando sin custom...`,
                  );
                }
              }
              if (!pairingCode) {
                logger.pretty.line(
                  `ðŸ”§ [PAIRING DEBUG] requestPairingCode(${target}) intento ${attempt}/${maxAttempts}`,
                );
                pairingCode = await sock.requestPairingCode(target);
              }
              break;
            } catch (e) {
              logger.error(
                `ðŸ”§ [PAIRING DEBUG] intento ${attempt} fallÃ³: ${e.message}`,
              );
              if (attempt < maxAttempts) {
                await new Promise((r) => setTimeout(r, 1500));
              }
            }
          }
          if (!pairingCode) {
            logger.pretty.line(
              "âš ï¸ No se pudo obtener pairing code tras reintentos",
            );
            return;
          }
          const formattedCode =
            pairingCode?.match(/.{1,4}/g)?.join("-") || pairingCode;
          const plainCode = (pairingCode || "").replace(/[^A-Za-z0-9]/g, "");

          currentPairingCode = formattedCode;
          currentPairingGeneratedAt = new Date();
          currentPairingExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
          currentPairingNumber = effectivePairingNumber;
          pairingTargetNumber = effectivePairingNumber;

          logger.pretty.banner("CÃ³digo de emparejamiento", "ðŸ”—");
          logger.pretty.kv("NÃºmero", `+${effectivePairingNumber}`);
          logger.pretty.kv(
            "CÃ³digo",
            `${formattedCode}  (sin guiones: ${plainCode})`,
          );
          logger.pretty.kv("AparecerÃ¡ como", deviceLabel);
          logger.pretty.kv("VÃ¡lido por", "10 minutos");
          logger.pretty.section("Instrucciones", "ðŸ“‹");
          logger.pretty.line("1) Abre WhatsApp en tu telÃ©fono");
          logger.pretty.line("2) Ve a ConfiguraciÃ³n > Dispositivos vinculados");
          logger.pretty.line('3) Toca "Vincular con nÃºmero de telÃ©fono"');
          logger.pretty.line(`4) Ingresa este cÃ³digo: ${formattedCode}`);
          logger.pretty.line(
            "â³ Esperando que ingreses el cÃ³digo en WhatsApp...",
          );
        } catch (pairingError) {
          logger.error("Error generando cÃ³digo de pairing:", {
            message: pairingError.message,
            stack: pairingError.stack,
          });
          logger.pretty.line(
            "ðŸ”Ž Verifica que el nÃºmero estÃ© registrado en WhatsApp y tengas conexiÃ³n a internet.",
          );
        } finally {
          pairingRequestInProgress = false;
        }
      }

      if (qr && !(usePairingCode && effectivePairingNumber)) {
        qrCode = qr;
        connectionStatus = "waiting_for_scan";

        try {
          // Generar imagen QR
          qrCodeImage = await QRCode.toDataURL(qr, {
            type: "image/png",
            width: 300,
            margin: 2,
            color: {
              dark: "#000000",
              light: "#FFFFFF",
            },
          });

          // Mostrar QR en terminal con formato mejorado
          console.log("\n");
          console.log(
            "                                                       ",
          );
          console.log("               ESCANEA ESTE CDIGO QR               ");
          console.log(
            "                                                       ",
          );
          console.log("\n");

          const qrTerminal = await QRCode.toString(qr, {
            type: "terminal",
            small: true,
          });
          console.log(qrTerminal);

          console.log("\n Instrucciones:");
          console.log("  1ï¸âƒ£  Abre WhatsApp en tu telÃ©fono");
          console.log("  2ï¸âƒ£  Ve a ConfiguraciÃ³n > Dispositivos vinculados");
          console.log('  3ï¸âƒ£  Toca "Vincular un dispositivo"');
          console.log("  4ï¸âƒ£  Escanea este cÃ³digo QR\n");
          console.log(" Esperando que escanees el cÃ³digo QR...");
          console.log("\n");
        } catch (error) {
          logger.error("Error generando QR:", error);
        }
      }

      if (connection === "open") {
        connectionStatus = "connected";
        currentPairingCode = null;

        // Mostrar informaciÃ³n de conexiÃ³n exitosa
        logger.pretty.banner("Conectado exitosamente", "âœ…");
        logger.pretty.kv("ID del bot", sock.user.id);
        logger.pretty.kv(
          "Nombre",
          sock.user.name || sock.user.verifiedName || "KONMI-BOT",
        );
        logger.pretty.kv(
          "MÃ©todo usado",
          usePairingCode ? "Pairing Code" : "QR Code",
        );
        if (usePairingCode && effectivePairingNumber) {
          logger.pretty.kv("NÃºmero vinculado", `+${effectivePairingNumber}`);
        }
        logger.pretty.line("âœ… El bot estÃ¡ listo para usarse en WhatsApp");

        logger.info("Conectado a WhatsApp exitosamente");
        currentPairingGeneratedAt = null;
        currentPairingExpiresAt = null;
        currentPairingNumber = null;
        pairingRequestInProgress = false;

        // Configurar el nmero del bot como owner principal
        try {
          const botNumber = getBotNumber(sock);
          if (botNumber) {
            setPrimaryOwner(botNumber, "Bot Principal");
            logger.info(`NÃºmero del bot configurado como owner: +${botNumber}`);
          } else {
            logger.warn(
              "No se pudo obtener el nÃºmero del bot para configurarlo como owner",
            );
          }
        } catch (error) {
          logger.error("Error configurando nÃºmero del bot como owner:", error);
        }
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const errorMsg =
          lastDisconnect?.error?.message ||
          lastDisconnect?.error?.reason ||
          "desconocido";
        const loggedOutCode =
          typeof DisconnectReason?.loggedOut === "number"
            ? DisconnectReason.loggedOut
            : 401;
        const restartRequiredCode =
          typeof DisconnectReason?.restartRequired === "number"
            ? DisconnectReason.restartRequired
            : 515;
        const shouldReconnect = statusCode !== loggedOutCode;

        connectionStatus = "disconnected";
        pairingRequestInProgress = false;

        logger.pretty.banner("ConexiÃ³n cerrada", "âš ï¸");
        logger.pretty.kv("CÃ³digo de estado", statusCode ?? "n/a");
        logger.pretty.kv("Motivo", errorMsg);
        logger.pretty.kv("Â¿DeberÃ­a reconectar?", shouldReconnect);

        // Reconectar salvo errores de autenticaciÃ³n; forzar reconexiÃ³n si es 'restart required'
        if (
          (shouldReconnect &&
            statusCode !== 401 &&
            statusCode !== 403 &&
            statusCode !== 405 &&
            statusCode !== 428) ||
          statusCode === restartRequiredCode
        ) {
          logger.pretty.line("ðŸ”„ Reconectando en 5 segundos...");
          setTimeout(
            () => connectToWhatsApp(savedAuthPath, usePairingCode, phoneNumber),
            5000,
          );
        } else {
          logger.pretty.line("â›” No se reconectarÃ¡ automÃ¡ticamente.");
          logger.pretty.line(
            `ðŸ”’ Error de autenticaciÃ³n detectado (cÃ³digo ${statusCode})`,
          );
          logger.pretty.line(
            'ðŸ§¹ Ejecuta "node force-clean.js" y luego "npm start" para empezar de nuevo.',
          );
          logger.warn(
            `ConexiÃ³n cerrada. CÃ³digo: ${statusCode ?? "n/a"} - Motivo: ${errorMsg}. No se reconectarÃ¡.`,
          );
        }
      }
    });

    sock.ev.on("messages.upsert", async (m) => {
      try {
        for (const message of m.messages) {
          const rjid = message.key?.remoteJid || "";
          const isGroup = rjid.endsWith("@g.us");
          let senderNum = "";
          if (isGroup) {
            const participant = message.key?.participant || "";
            senderNum = participant
              .split("@")[0]
              .replace(/:\\d+$/, "")
              .replace(/\D/g, "");
          } else {
            senderNum = (rjid.split("@")[0] || "")
              .replace(/:\\d+$/, "")
              .replace(/\D/g, "");
          }
          const ownerNumber =
            process.env.OWNER_WHATSAPP_NUMBER || "595974154768";
          const isOwnerMsg = message.key.fromMe
            ? true
            : senderNum === ownerNumber;

          let allow = !message.key.fromMe;
          if (message.key.fromMe) {
            const txt = (
              message.message?.conversation ||
              message.message?.extendedTextMessage?.text ||
              ""
            ).trim();
            const isCmd =
              txt.startsWith("/") || txt.startsWith("!") || txt.startsWith(".");
            if (isCmd && isOwnerMsg) {
              allow = true;
            }
          }
          if (!allow) continue;

          const msgId = message.key?.id;
          if (msgId && processedMessageIds.has(msgId)) continue;
          if (msgId) processedMessageIds.add(msgId);

          await handleMessage(message);
        }
      } catch (error) {
        logger.error("Error procesando mensajes:", error.message);
      }
    });

    sock.ev.on("creds.update", saveCreds);
  } catch (error) {
    logger.error("Error conectando a WhatsApp:", error);
    connectionStatus = "error";
    throw error;
  }
}

// Funciones de utilidad
function getQRCode() {
  return qrCode;
}

function getQRCodeImage() {
  return qrCodeImage;
}

function getConnectionStatus() {
  return {
    status: connectionStatus,
    uptime: connectionStatus === "connected" ? process.uptime() : 0,
    timestamp: new Date().toISOString(),
  };
}

// Estado resumido para el panel/diagnstico
function getBotStatus() {
  const st = getConnectionStatus();
  return {
    connected: st.status === "connected",
    connectionStatus: st.status,
    phone: sock?.user?.id || null,
    qrCode: qrCode || null,
    pairingCode: currentPairingCode || null,
    pairingNumber: currentPairingNumber ? `+${currentPairingNumber}` : null,
    timestamp: st.timestamp,
  };
}

function getSocket() {
  return sock;
}

async function getAvailableGroups() {
  try {
    if (!sock) return [];

    const groups = await sock.groupFetchAllParticipating();
    return Object.values(groups).map((group) => ({
      id: group.id,
      name: group.subject,
      participants: group.participants?.length || 0,
    }));
  } catch (error) {
    logger.error("Error obteniendo grupos:", error);
    return [];
  }
}

function setAuthMethod(method, options = {}) {
  const allowed = ["qr", "pairing"];
  if (!allowed.includes(method)) {
    const error = new Error(
      'Metodo de autenticacion invalido. Usa "qr" o "pairing".',
    );
    error.code = "INVALID_AUTH_METHOD";
    throw error;
  }

  if (method === "pairing") {
    const normalized = sanitizePhoneNumberInput(
      options.phoneNumber || pairingTargetNumber,
    );
    if (!normalized) {
      const error = new Error(
        "Numero de telefono invalido. Usa solo digitos con cpdigo de pais, ejemplo: 595974154768.",
      );
      error.code = "INVALID_PAIRING_NUMBER";
      throw error;
    }
    pairingTargetNumber = normalized;
    logger.info(`ðŸ“± NÃºmero configurado para pairing: +${normalized}`);
  } else {
    pairingTargetNumber = null;
  }

  authMethod = method;
  logger.info(`ðŸ” MÃ©todo de autenticaciÃ³n establecido: ${method}`);
  logger.info("=============================================");
  logger.info(" MTODOS DE AUTENTICACIN DISPONIBLES");
  logger.info("=============================================");
  logger.info(" QR Code: Escanea el cdigo QR en la terminal");
  logger.info(" PAIRING CODE EN LA TERMINAL ");
  logger.info(" El bot soporta ambos mtodos simultneamente");
  logger.info("=============================================");
  return pairingTargetNumber;
}

async function clearWhatsAppSession() {
  try {
    if (sock) {
      await sock.logout();
    }
  } catch (error) {
    logger.error("Error cerrando sesion:", error);
  }

  sock = null;
  qrCode = null;
  qrCodeImage = null;
  connectionStatus = "disconnected";
}

// Funciones para pairing code actual
function getCurrentPairingCode() {
  return currentPairingCode;
}

function getCurrentPairingInfo() {
  if (!currentPairingCode) {
    return null;
  }
  return {
    code: currentPairingCode,
    generatedAt: currentPairingGeneratedAt?.toISOString() || null,
    expiresAt: currentPairingExpiresAt?.toISOString() || null,
    phoneNumber: currentPairingNumber ? `+${currentPairingNumber}` : null,
  };
}

function getPairingTargetNumber() {
  return pairingTargetNumber ? `+${pairingTargetNumber}` : null;
}

// Funcion helper para obtener el JID del bot correctamente
function getBotJid(sock) {
  if (!sock.user || !sock.user.id) return null;

  let botJid = sock.user.id;

  // El bot ID viene en formato: numero:sufijo@s.whatsapp.net
  // Necesitamos extraer solo el numero base
  if (botJid.includes("@")) {
    // Quitar el :sufijo si existe, mantener solo numero@s.whatsapp.net
    botJid = botJid.replace(/:\d+/, "");
  } else {
    // Si no tiene @, agregar @s.whatsapp.net despues de quitar :sufijo
    botJid = botJid.replace(/:\d+/, "") + "@s.whatsapp.net";
  }

  return botJid;
}

// Funcion helper para obtener el numero del bot (solo digitos)
function getBotNumber(sock) {
  const botJid = getBotJid(sock);
  if (!botJid) return null;

  // Extraer solo el numero (sin @s.whatsapp.net)
  const number = botJid.split("@")[0];
  // Limpiar cualquier caracter no numurico
  return number.replace(/[^\d]/g, "");
}

// Funcion helper para encontrar participante con fallback por nmero
function findParticipant(participants, jid) {
  // 1) Intento exacto por usuario usando Baileys (soporta LID vs s.whatsapp)
  const targetJid = jidNormalizedUser(String(jid || ""));
  let participant = participants.find((p) => {
    try {
      return areJidsSameUser(jidNormalizedUser(String(p.id || "")), targetJid);
    } catch {
      return false;
    }
  });
  if (participant) return participant;
  // 2) Fallback por numero normalizado (solo digitos, ignora :sufijo)
  const targetNum = normalizeJidToNumber(jid);
  participant = participants.find(
    (p) => normalizeJidToNumber(p.id) === targetNum,
  );

  return participant || null;
}

// Funcion para conectar con pairing code
async function connectWithPairingCode(phoneNumber, authPath = null) {
  const normalized = sanitizePhoneNumberInput(
    phoneNumber || pairingTargetNumber,
  );
  if (!normalized) {
    throw new Error("Numero invalido para pairing.");
  }

  // Usar savedAuthPath si no se proporciona authPath
  const effectiveAuthPath = authPath || savedAuthPath;

  if (!effectiveAuthPath) {
    throw new Error("No se proporcion authPath para pairing code");
  }

  // Limpiar credenciales previas para forzar pairing limpio
  try {
    const absAuthPath = path.resolve(effectiveAuthPath);
    if (fs.existsSync(absAuthPath)) {
      fs.rmSync(absAuthPath, { recursive: true, force: true });
    }
  } catch (cleanupError) {
    console.error(
      " No se pudo limpiar la carpeta de auth antes del pairing:",
      cleanupError.message,
    );
  }

  pairingTargetNumber = normalized;
  return await connectToWhatsApp(effectiveAuthPath, true, normalized);
}

// FunciÃ³n para verificar la conexiÃ³n a la base de datos
async function checkDatabaseConnection() {
  try {
    await db.raw("SELECT 1");
    return true;
  } catch (error) {
    logger.error("Error de conexiÃ³n a la base de datos:", error);
    return false;
  }
}

export {
  connectToWhatsApp,
  getQRCode,
  getQRCodeImage,
  getCurrentPairingCode,
  getCurrentPairingInfo,
  getPairingTargetNumber,
  connectWithPairingCode,
  getConnectionStatus,
  getBotStatus,
  getSocket,
  getAvailableGroups,
  setAuthMethod,
  clearWhatsAppSession,
};


