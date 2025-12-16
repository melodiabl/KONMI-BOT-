import path from "path";
import fs from "fs";

import db from "../database/db.js";
import logger from "../config/logger.js";
import {
  launchSubbot,
  stopSubbot,
  listActiveSubbots,
  registerSubbotListeners,
  unregisterSubbotListeners,
  onSubbotEvent,
} from "./inproc-subbots.js";

// Anchor to backend directory to avoid depending on process.cwd()
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SUBBOTS_BASE_DIR = path.resolve(__dirname, "storage", "subbots");
let globalRuntimeSyncReady = false;
let tableReady = false;

async function ensureBotGlobalStateTableExists() {
  const exists = await db.schema.hasTable("bot_global_state");
  if (!exists) {
    await db.schema.createTable("bot_global_state", (table) => {
      table.increments("id").primary();
      table.boolean("is_on").notNullable().defaultTo(true);
      table.string("estado");
      table.string("activado_por");
      table.timestamp("fecha_cambio").defaultTo(db.fn.now());
    });
    await db("bot_global_state")
      .insert({ is_on: true, estado: "on" })
      .catch(() => {});
  }
}

async function ensureColumn(name, builder, defaultValue) {
  const exists = await db.schema.hasColumn("subbots", name);
  if (!exists) {
    await db.schema.alterTable("subbots", (table) => {
      builder(table);
    });
    if (typeof defaultValue !== "undefined") {
      await db("subbots")
        .whereNull(name)
        .update({ [name]: defaultValue })
        .catch(() => {});
    }
  }
}

async function ensureIndex(tableName, name, columns) {
  try {
    if (!Array.isArray(columns) || columns.length === 0) return;
    const missingColumn = await columns.reduce(async (prevPromise, column) => {
      const prev = await prevPromise;
      if (prev) return prev;
      const exists = await db.schema.hasColumn(tableName, column);
      return exists ? null : column;
    }, Promise.resolve(null));
    if (missingColumn) {
      logger.warn(
        `Omitiendo índice ${name}: columna faltante ${missingColumn}`,
      );
      return;
    }
    await db.schema.alterTable(tableName, (table) => {
      table.index(columns, name);
    });
  } catch (error) {
    if (!/exists/i.test(error?.message || "")) {
      throw error;
    }
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getPhoneDigits(number) {
  if (!number) return "";
  return String(number).replace(/[^0-9]/g, "");
}

function buildDefaultMetadata(overrides = {}) {
  return {
    uiLabel: overrides.uiLabel || "KONMI-BOT",
    createdAt: overrides.createdAt || new Date().toISOString(),
    ...overrides,
  };
}

async function ensureTable() {
  if (tableReady) return true;
  try {
    const hasTable = await db.schema.hasTable("subbots");
    if (!hasTable) {
      await db.schema.createTable("subbots", (table) => {
        table.increments("id").primary();
        table.string("code", 120).unique().notNullable();
        table.string("session_id", 120);
        table.string("type", 30).notNullable().defaultTo("qr");
        table.string("status", 30).notNullable().defaultTo("pending");
        table.string("method", 30);
        table.string("owner_number", 40).notNullable();
        table.string("request_jid", 200).notNullable();
        table.string("request_participant", 200);
        table.string("target_number", 40);
        table.string("bot_number", 40);
        table.string("auth_path");
        table.boolean("is_active").defaultTo(false);
        table.boolean("is_online").defaultTo(false);
        table.boolean("auto_detected").defaultTo(false);
        table.integer("message_count").defaultTo(0);
        table.timestamp("created_at").defaultTo(db.fn.now());
        table.timestamp("connected_at");
        table.timestamp("updated_at").defaultTo(db.fn.now());
        table.timestamp("last_check").defaultTo(db.fn.now());
        table.timestamp("last_heartbeat").defaultTo(db.fn.now());
        table.text("metadata");
      });
    } else {
      await ensureColumn("type", (t) => t.string("type", 30).defaultTo("qr"));
      await ensureColumn("status", (t) =>
        t.string("status", 30).defaultTo("pending"),
      );
      await ensureColumn("owner_number", (t) => t.string("owner_number", 40));
      await ensureColumn("request_jid", (t) => t.string("request_jid", 200));
      await ensureColumn("target_number", (t) => t.string("target_number", 40));
      await ensureColumn("bot_number", (t) => t.string("bot_number", 40));
      await ensureColumn("auth_path", (t) => t.string("auth_path"));
      await ensureColumn(
        "is_active",
        (t) => t.boolean("is_active").defaultTo(false),
        false,
      );
      await ensureColumn(
        "is_online",
        (t) => t.boolean("is_online").defaultTo(false),
        false,
      );
      await ensureColumn("session_id", (t) => t.string("session_id", 120));
      await ensureColumn("method", (t) => t.string("method", 30));
      await ensureColumn("request_participant", (t) =>
        t.string("request_participant", 200),
      );
      await ensureColumn(
        "auto_detected",
        (t) => t.boolean("auto_detected").defaultTo(false),
        false,
      );
      await ensureColumn(
        "message_count",
        (t) => t.integer("message_count").defaultTo(0),
        0,
      );
      await ensureColumn("last_check", (t) =>
        t.timestamp("last_check").defaultTo(db.fn.now()),
      );
      await ensureColumn("last_heartbeat", (t) =>
        t.timestamp("last_heartbeat").defaultTo(db.fn.now()),
      );
      await ensureColumn("metadata", (t) => t.text("metadata"), "{}");
      await ensureIndex("subbots", "subbots_owner_status_idx", [
        "owner_number",
        "status",
      ]);
      await ensureIndex("subbots", "subbots_created_idx", ["created_at"]);
    }

    tableReady = true;
    await ensureRuntimeSyncListeners();
    return true;
  } catch (error) {
    logger.database.error("ensureTable subbots", error.message);
    throw error;
  }
}

export async function cleanOrphanSubbots() {
  await ensureTable();
  const rows = await db("subbots").select(
    "id",
    "code",
    "auth_path",
    "is_active",
    "status",
  );
  logger.info("🧹 [Limpieza] Buscando subbots huérfanos...");
  logger.info(`📂 SUBBOTS_BASE_DIR: ${SUBBOTS_BASE_DIR}`);
  let removed = 0;

  for (const row of rows) {
    const authDir =
      row.auth_path || path.join(SUBBOTS_BASE_DIR, row.code, "auth");
    const credsPath = path.join(authDir, "creds.json");

    const isWorking = row.is_active || row.status === "connected";
    const hasCreds = fs.existsSync(credsPath);

    if (!hasCreds && !isWorking) {
      logger.warn(
        `⚠️ Subbot ${row.code} marcado para eliminación (huérfano sin credenciales). AuthDir: ${authDir}`,
      );
      await db("subbots").where({ id: row.id }).del();
      removed += 1;

      const baseDir = path.join(SUBBOTS_BASE_DIR, row.code);
      try {
        if (fs.existsSync(baseDir)) {
          fs.rmSync(baseDir, { recursive: true, force: true });
        }
      } catch (error) {
        logger.warn("No se pudo eliminar carpeta huérfana de subbot", {
          code: row.code,
          error: error?.message,
        });
      }
    }
  }

  const staleMinutes = parseInt(process.env.SUBBOT_STALE_MINUTES ?? "15", 10);
  if (Number.isFinite(staleMinutes) && staleMinutes > 0) {
    const staleThreshold = new Date(
      Date.now() - staleMinutes * 60000,
    ).toISOString();
    const staleRows = await db("subbots")
      .whereIn("status", ["pending", "starting"])
      .whereNull("connected_at")
      .andWhere("created_at", "<", staleThreshold)
      .select("id", "code", "auth_path");

    for (const row of staleRows) {
      await db("subbots").where({ id: row.id }).del();
      removed += 1;

      const baseDir = row.auth_path
        ? path.resolve(row.auth_path, "..")
        : path.join(SUBBOTS_BASE_DIR, row.code);
      try {
        if (fs.existsSync(baseDir)) {
          fs.rmSync(baseDir, { recursive: true, force: true });
        }
      } catch (error) {
        logger.warn("No se pudo eliminar carpeta de subbot pendiente vencido", {
          code: row.code,
          error: error?.message,
        });
      }
    }
  }

  if (removed) {
    logger.info(
      `✅ Limpieza de subbots huérfanos: ${removed} registros eliminados`,
    );
  }

  return removed;
}

async function insertSubbotRecord(record) {
  const metaString =
    typeof record.metadata === "string"
      ? record.metadata
      : JSON.stringify(record.metadata || {});

  let columnInfo = {};
  try {
    columnInfo = await db("subbots").columnInfo();
  } catch (error) {
    logger.warn("No se pudo obtener columnInfo de subbots", {
      error: error?.message,
    });
  }

  const insertData = {
    code: record.code,
    session_id: record.sessionId || record.code,
    type: record.type,
    status: record.status,
    method: record.method || record.type,
    owner_number: record.ownerNumber,
    request_jid: record.requestJid,
    request_participant: record.requestParticipant || null,
    target_number: record.targetNumber,
    bot_number: record.botNumber,
    auth_path: record.authPath,
    is_active: record.isActive || false,
    is_online: record.isOnline || false,
    auto_detected: record.autoDetected || false,
    message_count: record.messageCount || 0,
    created_at: record.createdAt || db.fn.now(),
    connected_at: record.connectedAt || null,
    updated_at: record.updatedAt || db.fn.now(),
    last_check: record.lastCheck || db.fn.now(),
    last_heartbeat: record.lastHeartbeat || db.fn.now(),
    metadata: metaString,
  };

  if (columnInfo.user_phone) {
    insertData.user_phone = record.userPhone || record.ownerNumber || null;
  }
  if (columnInfo.user_name) {
    insertData.user_name =
      record.userName ||
      record.metadata?.displayName ||
      record.ownerNumber ||
      null;
  }
  if (columnInfo.connection_type) {
    insertData.connection_type =
      record.connectionType || record.type || record.method || "qr";
  }
  if (columnInfo.created_by) {
    insertData.created_by = record.createdBy || record.ownerNumber || null;
  }
  if (columnInfo.qr_code && typeof insertData.qr_code === "undefined") {
    insertData.qr_code = record.qrCode || null;
  }
  if (
    columnInfo.pairing_code &&
    typeof insertData.pairing_code === "undefined"
  ) {
    insertData.pairing_code = record.pairingCode || null;
  }
  if (columnInfo.qr_data && typeof insertData.qr_data === "undefined") {
    insertData.qr_data = record.qrData || null;
  }
  if (columnInfo.api_token && typeof insertData.api_token === "undefined") {
    insertData.api_token = record.apiToken || null;
  }

  const [id] = await db("subbots").insert(insertData);

  return await db("subbots").where({ id }).first();
}

export async function createSubbotWithPairing({
  ownerNumber,
  targetNumber,
  displayName = "KONMI-BOT",
  requestJid,
  requestParticipant,
  creatorPushName, // NUEVO: Nombre del creador
}) {
  await ensureTable();
  await ensureRuntimeSyncListeners();

  const cleanedOwner = getPhoneDigits(ownerNumber);
  const cleanedTarget = getPhoneDigits(targetNumber);

  if (!cleanedOwner) {
    throw new Error("ownerNumber requerido");
  }

  if (!cleanedTarget || cleanedTarget.length < 8) {
    throw new Error("targetNumber inválido");
  }

  ensureDir(SUBBOTS_BASE_DIR);

  // CORRECCIÓN: Agregar el push name del creador al display
  const subbotDisplay = creatorPushName
    ? `KONMISUB(${creatorPushName})`
    : displayName;

  const launchResult = await launchSubbot({
    type: "code",
    createdBy: cleanedOwner,
    targetNumber: cleanedTarget,
    metadata: {
      uiLabel: subbotDisplay,
      requestJid,
      requestParticipant,
      creatorPushName, // Guardar el push name original
    },
  });

  if (!launchResult.success) {
    throw new Error(launchResult.error || "No se pudo lanzar el subbot");
  }

  const subbot = launchResult.subbot;
  const authDir = path.join(SUBBOTS_BASE_DIR, subbot.code, "auth");

  const metadata = buildDefaultMetadata({
    displayName: subbotDisplay,
    creatorPushName,
    type: "code",
    targetNumber: cleanedTarget,
    requestJid,
    requestParticipant,
  });

  const stored = await insertSubbotRecord({
    code: subbot.code,
    sessionId: subbot.code,
    type: "code",
    status: "pending",
    method: "code",
    ownerNumber: cleanedOwner,
    requestJid: requestJid || `${cleanedOwner}@s.whatsapp.net`,
    requestParticipant,
    targetNumber: cleanedTarget,
    authPath: authDir,
    metadata,
  });

  return { subbot: stored, code: subbot.code };
}

export async function createSubbotWithQr({
  ownerNumber,
  displayName = "KONMI-BOT",
  requestJid,
}) {
  await ensureTable();
  await ensureRuntimeSyncListeners();

  const cleanedOwner = getPhoneDigits(ownerNumber);
  if (!cleanedOwner) {
    throw new Error("ownerNumber requerido");
  }

  ensureDir(SUBBOTS_BASE_DIR);

  const launchResult = await launchSubbot({
    type: "qr",
    createdBy: cleanedOwner,
    metadata: { uiLabel: displayName, requestJid },
  });

  if (!launchResult.success) {
    throw new Error(launchResult.error || "No se pudo lanzar el subbot QR");
  }

  const subbot = launchResult.subbot;
  const authDir = path.join(SUBBOTS_BASE_DIR, subbot.code, "auth");

  const metadata = buildDefaultMetadata({
    displayName,
    type: "qr",
    requestJid,
  });

  const stored = await insertSubbotRecord({
    code: subbot.code,
    type: "qr",
    status: "pending",
    method: "qr",
    ownerNumber: cleanedOwner,
    requestJid: requestJid || `${cleanedOwner}@s.whatsapp.net`,
    authPath: authDir,
    metadata,
  });

  return { subbot: stored, code: subbot.code };
}

export async function listUserSubbots(ownerNumber) {
  await ensureTable();
  await ensureRuntimeSyncListeners();
  const cleaned = getPhoneDigits(ownerNumber);
  if (!cleaned) return [];

  await syncOwnerRuntimeState(cleaned);

  const rows = await db("subbots")
    .where(function () {
      this.where("owner_number", cleaned).orWhere(
        "request_jid",
        "like",
        `%${cleaned}%`,
      );
    })
    .orderBy("updated_at", "desc");

  return rows.map((row) => ({
    ...row,
    metadata: safeParseJson(row.metadata),
  }));
}

// NUEVO: Función para listar TODOS los subbots del sistema
export async function listAllSubbots() {
  await ensureTable();
  await ensureRuntimeSyncListeners();

  const rows = await db("subbots")
    .orderBy("updated_at", "desc");

  return rows.map((row) => ({
    ...row,
    metadata: safeParseJson(row.metadata),
  }));
}

export async function deleteUserSubbot(code, ownerNumber) {
  await ensureTable();
  const cleaned = getPhoneDigits(ownerNumber);
  if (!cleaned) {
    throw new Error("ownerNumber requerido");
  }

  const row = await db("subbots")
    .where({ code })
    .andWhere(function () {
      this.where("owner_number", cleaned).orWhere(
        "request_jid",
        "like",
        `%${cleaned}%`,
      );
    })
    .first();

  if (!row) {
    throw new Error("Subbot no encontrado");
  }

  await stopSubbot(row.code);

  if (row.auth_path) {
    try {
      const baseDir = path.resolve(row.auth_path, "..");
      if (fs.existsSync(baseDir)) {
        fs.rmSync(baseDir, { recursive: true, force: true });
      }
    } catch (error) {
      logger.warn("No se pudo eliminar el directorio del subbot", {
        code,
        error: error?.message,
      });
    }
  }

  await db("subbots").where({ id: row.id }).del();
  return true;
}

export async function getSubbotByCode(code) {
  await ensureTable();
  const row = await db("subbots").where({ code }).first();
  if (!row) return null;
  return {
    ...row,
    metadata: safeParseJson(row.metadata),
  };
}

export function attachRuntimeListeners(code, listeners = []) {
  if (!code || !Array.isArray(listeners) || listeners.length === 0) {
    return () => {};
  }

  const scopedListeners = listeners
    .map(({ event, handler }) => {
      if (!event || typeof handler !== "function") return null;

      const wrapped = async (payload = {}) => {
        try {
          const payloadCode =
            payload?.subbot?.code || payload?.subbot?.sessionId || null;
          if (payloadCode !== code) return;
          await handler(payload);
        } catch (error) {
          logger.warn("Error en listener de subbot", {
            code,
            event,
            error: error?.message,
          });
        }
      };

      return { event, handler: wrapped };
    })
    .filter(Boolean);

  if (scopedListeners.length === 0) {
    return () => {};
  }

  return registerSubbotListeners(code, scopedListeners);
}

export async function updateSubbotMetadata(code, patch = {}) {
  await ensureTable();
  const current = await db("subbots")
    .where({ code })
    .select("metadata")
    .first();
  const merged = {
    ...safeParseJson(current?.metadata || {}),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await db("subbots")
    .where({ code })
    .update({ metadata: JSON.stringify(merged), updated_at: db.fn.now() });
  return merged;
}

export function safeParseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

export async function markSubbotConnected(code, data = {}) {
  await ensureTable();
  await ensureRuntimeSyncListeners();
  await db("subbots")
    .where({ code })
    .update({
      status: "connected",
      bot_number: data.botNumber || null,
      is_online: true,
      is_active: true,
      connected_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

  logger.subbot.connected(code, data.botNumber || "unknown");
  return true;
}

export async function markSubbotDisconnected(code, reason = null) {
  await ensureTable();
  await ensureRuntimeSyncListeners();

  const normalizedReason = String(reason || "").toLowerCase();
  const isManualLogout = normalizedReason === "logged_out";

  await db("subbots")
    .where({ code })
    .update({
      status: isManualLogout ? "logged_out" : "disconnected",
      is_online: false,
      is_active: isManualLogout ? false : true,
      updated_at: db.fn.now(),
    });

  logger.subbot.disconnected(code, normalizedReason || "unknown");

  if (isManualLogout) {
    setTimeout(async () => {
      try {
        const row = await db("subbots").where({ code }).first();
        const authPath = row?.auth_path || path.join(SUBBOTS_BASE_DIR, code, "auth");
        const baseDir = path.resolve(authPath, "..");
        if (fs.existsSync(baseDir)) {
          fs.rmSync(baseDir, { recursive: true, force: true });
          logger.info(`🗑️ [Auto-clean] Folder removed: ${baseDir}`);
        }

        const deleted = await db("subbots").where({ code }).del();
        if (deleted > 0) {
          logger.database.query("subbots", `Registro eliminado: ${code}`);
        }

        logger.subbot.cleaned(code);
      } catch (error) {
        logger.subbot.error(code, `Error en auto-limpieza: ${error.message}`);
      }
    }, 5000);
  }

  return { success: true, code, reason: normalizedReason };
}

export function getActiveRuntimeSubbots() {
  return listActiveSubbots();
}

async function ensureRuntimeSyncListeners() {
  if (globalRuntimeSyncReady || !tableReady) return;
  const wrap = (eventName, handler) => {
    onSubbotEvent(eventName, async (payload) => {
      try {
        await handler(payload?.subbot, payload?.data || {});
      } catch (error) {
        logger.error(`Error manejando evento de subbot ${eventName}`, {
          error: error?.message,
        });
      }
    });
  };

  wrap("pairing_code", async (subbot, data) => {
    if (!subbot?.code) return;

    // CORRECCIÓN: Guardar el código de pairing real y el identificador por separado
    const metaPatch = {
      pairingCode: data.pairingCode || data.code || null, // Código real de 8 dígitos
      identificationCode: data.identificationCode || subbot.code, // Código interno
      pairingDisplay: data.displayCode || null,
      pairingGeneratedAt: new Date().toISOString(),
      targetNumber: data.targetNumber || subbot?.metadata?.targetNumber || null,
      customPairing: !!data.customCodeUsed,
    };
    await updateSubbotMetadata(subbot.code, metaPatch);

    // Estado intermedio para panel/UI (evita quedar en "pending")
    try {
      await db("subbots")
        .where({ code: subbot.code })
        .update({
          status: "waiting_pairing",
          is_online: false,
          is_active: true,
          updated_at: db.fn.now(),
        });
    } catch {}
  });

  wrap("qr_ready", async (subbot, data) => {
    if (!subbot?.code) return;
    await updateSubbotMetadata(subbot.code, {
      qrCode: data?.qrCode || null,
      qrImage: data?.qrImage || null,
      qrGeneratedAt: new Date().toISOString(),
    });

    // Estado intermedio para panel/UI (evita quedar en "pending")
    try {
      await db("subbots")
        .where({ code: subbot.code })
        .update({
          status: "waiting_scan",
          is_online: false,
          is_active: true,
          updated_at: db.fn.now(),
        });
    } catch {}
  });

  wrap("connected", async (subbot, data) => {
    if (!subbot?.code) return;
    const resolvedDigits =
      data?.digits ||
      (typeof data?.number === "string"
        ? data.number.replace(/[^0-9]/g, "")
        : null) ||
      (typeof data?.jid === "string"
        ? data.jid.replace(/[^0-9]/g, "")
        : null) ||
      subbot?.metadata?.targetNumber ||
      null;

    await markSubbotConnected(subbot.code, {
      botNumber: resolvedDigits,
    });

    await updateSubbotMetadata(subbot.code, {
      connectedNumber: resolvedDigits,
      lastConnectedAt: new Date().toISOString(),
    });
  });

  wrap("disconnected", async (subbot, data) => {
    if (!subbot?.code) return;
    const reason = data?.reason || data?.statusCode || "connection_closed";
    await markSubbotDisconnected(subbot.code, reason);
  });

  wrap("logged_out", async (subbot) => {
    if (!subbot?.code) return;
    await markSubbotDisconnected(subbot.code, "logged_out");
  });

  globalRuntimeSyncReady = true;
}

async function ensureSubbotGroupStateTable() {
  const exists = await db.schema.hasTable("subbot_group_state");
  if (!exists) {
    await db.schema.createTable("subbot_group_state", (table) => {
      table.increments("id").primary();
      table.string("subbot_code", 120).notNullable();
      table.string("group_jid", 200).notNullable();
      table.boolean("is_active").notNullable().defaultTo(true);
      table.timestamp("updated_at").defaultTo(db.fn.now());
      table.unique(["subbot_code", "group_jid"]);
    });
  }
}

export async function isBotGloballyActive() {
  await ensureBotGlobalStateTableExists();
  try {
    const row = await db("bot_global_state")
      .orderBy("fecha_cambio", "desc")
      .first();
    if (!row) return true;
    if (row.estado !== undefined) {
      return String(row.estado).toLowerCase() === "on";
    }
    if (row.is_on !== undefined) {
      return row.is_on !== false;
    }
    return true;
  } catch (error) {
    logger.warn("No se pudo leer bot_global_state", { error: error?.message });
    return true;
  }
}

export async function setBotGlobalState(isOn = true, { actor = null, note = null } = {}) {
  await ensureBotGlobalStateTableExists();
  const payload = {
    is_on: !!isOn,
    estado: isOn ? "on" : "off",
    activado_por: actor || null,
    fecha_cambio: db.fn.now(),
  };
  const existing = await db("bot_global_state").first();
  if (existing) {
    await db("bot_global_state").where({ id: existing.id }).update(payload);
  } else {
    await db("bot_global_state").insert(payload);
  }
  return { success: true, isOn: !!isOn };
}

export async function isBotActiveInGroup(subbotCode, groupJid) {
  if (!groupJid) return true;
  try {
    const globalOff = await db("grupos_desactivados")
      .where({ jid: groupJid })
      .first();
    if (globalOff) return false;
  } catch (_) {}

  try {
    await ensureSubbotGroupStateTable();
    const row = await db("subbot_group_state")
      .where({ subbot_code: subbotCode, group_jid: groupJid })
      .first();
    if (row) return row.is_active !== false;
  } catch (error) {
    logger.warn("No se pudo leer subbot_group_state", {
      error: error?.message,
    });
  }
  return true;
}

export async function setSubbotGroupState(subbotCode, groupJid, isActive) {
  if (!subbotCode || !groupJid) return;
  await ensureSubbotGroupStateTable();
  await db("subbot_group_state")
    .insert({
      subbot_code: subbotCode,
      group_jid: groupJid,
      is_active: !!isActive,
      updated_at: db.fn.now(),
    })
    .onConflict(["subbot_code", "group_jid"])
    .merge({ is_active: !!isActive, updated_at: db.fn.now() });
}

export async function getSubbotGroupState(subbotCode, groupJid) {
  if (!subbotCode || !groupJid) return null;
  await ensureSubbotGroupStateTable();
  return db("subbot_group_state")
    .where({ subbot_code: subbotCode, group_jid: groupJid })
    .first();
}

async function syncOwnerRuntimeState(ownerNumber) {
  if (!ownerNumber) return;
  const active = listActiveSubbots();
  const activeCodes = new Set(
    active
      .filter((entry) => getPhoneDigits(entry.createdBy) === ownerNumber)
      .map((entry) => entry.code),
  );

  const rows = await db("subbots").where("owner_number", ownerNumber);
  for (const row of rows) {
    const isOnline = activeCodes.has(row.code);
    await db("subbots")
      .where({ id: row.id })
      .update({
        is_online: isOnline,
        status: isOnline ? "connected" : row.status,
        updated_at: db.fn.now(),
      });
  }
}

export async function syncAllRuntimeStates() {
  await ensureTable();
  await ensureRuntimeSyncListeners();
  await cleanOrphanSubbots();
  const active = listActiveSubbots();
  const activeCodes = new Set(active.map((entry) => entry.code));

  const rows = await db("subbots").select("id", "code", "status");
  for (const row of rows) {
    const isOnline = activeCodes.has(row.code);
    await db("subbots")
      .where({ id: row.id })
      .update({
        is_online: isOnline,
        status: isOnline ? "connected" : row.status,
        updated_at: db.fn.now(),
      });
  }
}

export async function restoreActiveSubbots() {
  await ensureTable();
  await ensureRuntimeSyncListeners();

  const active = listActiveSubbots();
  const activeCodes = new Set(active.map((entry) => entry.code));

  const candidates = await db("subbots")
    .whereNotIn("status", ["logged_out", "deleted"])
    .where(function () {
      this.where({ is_active: true }).orWhereIn("status", [
        "connected",
        "reconnecting",
        "disconnected", // <-- Incluir desconectados en la restauración
        "waiting_scan",
        "waiting_pairing",
      ]);
    })
    .orderBy("updated_at", "desc");

  let restored = 0;
  for (const row of candidates) {
    if (!row?.code || activeCodes.has(row.code)) continue;

    const authDir = row.auth_path || path.join(SUBBOTS_BASE_DIR, row.code, "auth");
    if (!authDir || !fs.existsSync(authDir)) {
      logger.warn(
        "No se encontraron credenciales para restaurar subbot, omitiendo",
        { code: row.code },
      );
      continue;
    }

    const ownerDigits = getPhoneDigits(row.owner_number);
    const targetDigits = getPhoneDigits(row.target_number);
    const launchResult = await launchSubbot({
      code: row.code,
      type: (row.method || row.type) === "code" ? "code" : "qr",
      ignoreLimits: true,
      createdBy: ownerDigits || targetDigits || "unknown",
      targetNumber: targetDigits || null,
      authDir: authDir,
      metadata: {
        ...buildDefaultMetadata(),
        ...safeParseJson(row.metadata),
        requestJid: row.request_jid || null,
        requestParticipant: row.request_participant || null,
        restoredAt: new Date().toISOString(),
        restoredBy: "runtime_boot",
      },
    });

    if (!launchResult.success) {
      logger.warn("No se pudo restaurar subbot", {
        code: row.code,
        error: launchResult.error,
      });
      continue;
    }

    restored += 1;
    activeCodes.add(row.code);

    await db("subbots")
      .where({ id: row.id })
      .update({
        status: "reconnecting",
        is_active: true,
        updated_at: db.fn.now(),
      });
  }

  if (restored) {
    logger.info(`♻️ Subbots restaurados tras reinicio: ${restored}`);
  }

  return restored;
}

export default {
  createSubbotWithPairing,
  createSubbotWithQr,
  listUserSubbots,
  listAllSubbots, // ⬅️ EXPORTACIÓN AGREGADA
  deleteUserSubbot,
  getSubbotByCode,
  attachRuntimeListeners,
  markSubbotConnected,
  markSubbotDisconnected,
  getActiveRuntimeSubbots,
  updateSubbotMetadata,
  syncAllRuntimeStates,
  restoreActiveSubbots,
  cleanOrphanSubbots,
  isBotGloballyActive,
  setBotGlobalState,
  isBotActiveInGroup,
  setSubbotGroupState,
  getSubbotGroupState,
};
