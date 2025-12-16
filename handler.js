// handler.js
import './plugins/config/config.js';
// Handler principal para logica de aportes, media, pedidos y proveedores
import db from "./plugins/database/db.js";
import path from "path";
import fs from "fs";
import axios from "axios";
import { fileURLToPath, pathToFileURL } from "url";
import QRCode from "qrcode";
import pino from "pino";
import { EventEmitter } from "events";
import appLogger from "./plugins/config/logger.js";
import logger from "./plugins/utils/bl-logger.js";
import antibanMiddleware from "./plugins/utils/utils/anti-ban-middleware.js";
import antibanSystem from "./plugins/utils/utils/anti-ban.js";
import { getGroupBool } from "./plugins/utils/utils/group-config.js";
import {
  isBotGloballyActive,
  createSubbotWithPairing,
  createSubbotWithQr,
  listUserSubbots,
  listAllSubbots,
  deleteUserSubbot,
  getSubbotByCode as getSubbotByCodeCore,
  cleanOrphanSubbots,
} from "./plugins/services/subbot-manager.js";
import {
  startSubbot,
  stopSubbotRuntime as stopSubbot,
  getSubbotStatus as getRuntimeStatus,
} from "./plugins/lib/subbots.js";
import { processWhatsAppMedia } from "./plugins/services/file-manager.js";
import { isSuperAdmin } from "./plugins/config/global-config.js";
import { getGeminiModel, hasGeminiApiKey } from "./plugins/services/gemini-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const SESSION_DIR = "./sessions/subbots";
const activeSubbots = new Map();
const subbotSessions = new Map();
const pinoLogger = pino({ level: "silent" });
const subbotEmitter = new EventEmitter();
subbotEmitter.setMaxListeners(100);

// -----------------------------
// Subbot management utilities
// -----------------------------

async function ensureSubbotsTable() {
  const hasTable = await db.schema.hasTable("subbots");
  if (!hasTable) {
    await db.schema.createTable("subbots", (table) => {
      table.increments("id").primary();
      table.string("code").unique().notNullable();
      table.string("user_phone").notNullable();
      table.string("user_name").nullable();
      table.string("status").defaultTo("pending");
      table.string("connection_type").defaultTo("qr");
      table.text("qr_code").nullable();
      table.string("pairing_code").nullable();
      table.text("session_data").nullable();
      table.timestamp("created_at").defaultTo(db.fn.now());
      table.timestamp("last_activity").defaultTo(db.fn.now());
      table.timestamp("connected_at").nullable();
      table.boolean("is_active").defaultTo(false);
      table.integer("message_count").defaultTo(0);
      table.json("settings").nullable();
    });
    console.log(" Tabla `subbots` creada");
  }
}

async function ensureSubbotEventsTable() {
  const hasTable = await db.schema.hasTable("subbot_events");
  if (!hasTable) {
    await db.schema.createTable("subbot_events", (table) => {
      table.increments("id").primary();
      table.string("code").notNullable();
      table.string("event").notNullable();
      table.json("payload").nullable();
      table.timestamp("created_at").defaultTo(db.fn.now());
    });
    console.log(" Tabla `subbot_events` creada");
  }
}

async function initDatabase() {
  await ensureSubbotsTable();
  await ensureSubbotEventsTable();
}

function normalizePhone(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/[^0-9]/g, "");
  if (!digits) return null;
  if (digits.startsWith("0") && digits.length > 10) return digits.slice(1);
  return digits;
}

const __chatContext = new Map();

function pushChatEvent(chatId, type, actor) {
  try {
    const now = Date.now();
    const ctx = __chatContext.get(chatId) || { events: [] };
    ctx.events.push({ type, at: now, actor });
    if (ctx.events.length > 20) ctx.events = ctx.events.slice(-20);
    __chatContext.set(chatId, ctx);
  } catch {}
}

function findLastEvent(chatId, type) {
  try {
    const ctx = __chatContext.get(chatId);
    if (!ctx || !Array.isArray(ctx.events)) return null;
    for (let i = ctx.events.length - 1; i >= 0; i--) {
      const ev = ctx.events[i];
      if (ev && ev.type === type) return ev;
    }
  } catch {}
  return null;
}

function msToHuman(ms) {
  try {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
  } catch {
    return `${ms}ms`;
  }
}

function getSessionFilePath(code) {
  if (!code) return null;
  return path.join(SESSION_DIR, `${code}.json`);
}

async function loadSubbotSession(code) {
  try {
    const filePath = getSessionFilePath(code);
    if (!filePath) return null;
    if (!fs.existsSync(filePath)) return null;
    const raw = await fs.promises.readFile(filePath, "utf8");
    const json = JSON.parse(raw);
    return json;
  } catch (err) {
    logger.error("Error cargando session de subbot", err?.message);
    return null;
  }
}

async function saveSubbotSession(code, data) {
  try {
    const filePath = getSessionFilePath(code);
    if (!filePath) return;
    await fs.promises.mkdir(SESSION_DIR, { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    logger.error("Error guardando session de subbot", err?.message);
  }
}

async function deleteSubbotSession(code) {
  try {
    const filePath = getSessionFilePath(code);
    if (!filePath) return;
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch (err) {
    logger.error("Error eliminando session de subbot", err?.message);
  }
}

function markSubbotOnline(code, sessionData) {
  if (!code) return;
  const now = Date.now();
  const s = {
    lastHeartbeat: now,
    lastActivity: now,
    sessionData: sessionData || null,
    online: true,
  };
  subbotSessions.set(code, s);
}

function markSubbotOffline(code) {
  if (!code) return;
  const existing = subbotSessions.get(code);
  if (existing) {
    existing.online = false;
    existing.lastHeartbeat = Date.now();
    subbotSessions.set(code, existing);
  }
}

function isSubbotOnline(code) {
  return activeSubbots.has(code);
}

function formatSubbotRow(row) {
  if (!row) return null;
  const session = subbotSessions.get(row.code);
  const online = isSubbotOnline(row.code);
  const lastHeartbeat = row.last_activity
    ? new Date(row.last_activity).toISOString()
    : session?.lastActivity
      ? new Date(session.lastActivity).toISOString()
      : null;
  return {
    id: row.id,
    code: row.code,
    user_phone: row.user_phone,
    user_name: row.user_name,
    status: row.status,
    connection_type: row.connection_type,
    created_at: row.created_at,
    last_activity: row.last_activity,
    connected_at: row.connected_at,
    is_active: row.is_active,
    message_count: row.message_count,
    settings: row.settings,
    online,
    lastHeartbeat,
  };
}

async function emitSubbotEvent(code, event, payload = null) {
  try {
    if (!code || !event) return;
    await db("subbot_events").insert({
      code,
      event,
      payload: payload ? JSON.stringify(payload) : null,
    });
    subbotEmitter.emit(event, { code, payload, at: new Date().toISOString() });
  } catch (err) {
    logger.error("Error registrando evento de subbot", err?.message);
  }
}

export function onSubbotEvent(event, listener) {
  subbotEmitter.on(event, listener);
}

export function offSubbotEvent(event, listener) {
  subbotEmitter.off(event, listener);
}

export async function cleanupInactiveSubbots() {
  try {
    const THRESHOLD = 1000 * 60 * 60 * 12;
    const now = Date.now();
    const rows = await db("subbots")
      .select("*")
      .whereNot("status", "deleted")
      .andWhere("is_active", false);
    for (const row of rows) {
      const lastAt = row.last_activity
        ? new Date(row.last_activity).getTime()
        : 0;
      if (!lastAt) continue;
      const diff = now - lastAt;
      if (diff > THRESHOLD) {
        console.log(`[CLEANUP] Limpieza: marcando subbot ${row.code} como deleted (inactivo ${msToHuman(diff)})`);
        await db("subbots").where({ id: row.id }).update({
          status: "deleted",
          is_active: false,
        });
        await deleteSubbotSession(row.code);
      }
    }
  } catch (err) {
    console.error("Error en cleanupInactiveSubbots:", err);
  }
}


export async function createSubbot(userPhone, userName, connectionType = "qr") {
  const owner = normalizePhone(userPhone);
  if (!owner) {
    return { success: false, error: "userPhone invalido" };
  }
  const type = String(connectionType || "qr").toLowerCase();
  try {
    let result;
    if (type === "code" || type === "pairing") {
      result = await createSubbotWithPairing({
        ownerNumber: owner,
        targetNumber: owner,
        displayName: userName || "KONMI Subbot",
        creatorPushName: userName || null,
      });
    } else {
      result = await createSubbotWithQr({
        ownerNumber: owner,
        displayName: userName || "KONMI Subbot",
        requestJid: `${owner}@s.whatsapp.net`,
      });
    }
    return {
      success: true,
      subbot: result?.subbot || null,
      code: result?.code || result?.subbot?.code || null,
    };
  } catch (error) {
    console.error("Error en createSubbot:", error);
    return {
      success: false,
      error: error?.message || String(error),
    };
  }
}

export async function getUserSubbots(userPhone) {
  const owner = normalizePhone(userPhone);
  if (!owner) {
    return { success: false, error: "userPhone invalido", subbots: [] };
  }
  try {
    const rows = await listUserSubbots(owner);
    return { success: true, subbots: rows || [] };
  } catch (error) {
    console.error("Error en getUserSubbots:", error);
    return {
      success: false,
      error: error?.message || String(error),
      subbots: [],
    };
  }
}

export async function getSubbotByCode(code) {
  if (!code) {
    return { success: false, error: "code requerido" };
  }
  try {
    const row = await getSubbotByCodeCore(code);
    if (!row) {
      return { success: false, error: "Subbot no encontrado" };
    }
    return { success: true, subbot: row };
  } catch (error) {
    console.error("Error en getSubbotByCode:", error);
    return {
      success: false,
      error: error?.message || String(error),
    };
  }
}

export async function getSubbotRecord(code) {
  return getSubbotByCode(code);
}

export async function getSubbotAccessData(code) {
  const base = await getSubbotByCode(code);
  if (!base?.success || !base.subbot) {
    return base;
  }
  const s = base.subbot;
  const access = {
    code: s.code,
    type: s.type || s.method || "qr",
    status: s.status || "unknown",
    owner: s.owner_number || s.user_phone || null,
    targetNumber: s.target_number || null,
    authPath: s.auth_path || null,
  };
  return { success: true, access };
}

export async function deleteSubbot(code, userPhone) {
  const owner = normalizePhone(userPhone);
  if (!code || !owner) {
    return { success: false, error: "code y userPhone requeridos" };
  }
  try {
    await deleteUserSubbot(code, owner);
    return { success: true };
  } catch (error) {
    console.error("Error en deleteSubbot:", error);
    return {
      success: false,
      error: error?.message || String(error),
    };
  }
}

export async function registerSubbotEvent({ subbotId, token, event, data }) {
  try {
    if (!subbotId || !event) {
      return { success: false, error: "subbotId y event son requeridos" };
    }
    const row = await getSubbotByCodeCore(subbotId);
    if (!row) {
      return { success: false, error: "Subbot no encontrado" };
    }
    await emitSubbotEvent(subbotId, event, data || null);
    return { success: true };
  } catch (error) {
    console.error("Error en registerSubbotEvent:", error);
    return {
      success: false,
      error: error?.message || String(error),
    };
  }
}

export async function getSubbotStats() {
  try {
    await ensureSubbotsTable();
    const totalRow = await db("subbots").count("id as count").first();
    let activos = 0;
    let conectados = 0;
    let porEstado = [];
    try {
      const activosRow = await db("subbots").where({ is_active: true }).count("id as count").first();
      activos = Number(activosRow?.count || 0);
    } catch { }
    try {
      const conectadosRow = await db("subbots").where({ is_online: true }).count("id as count").first();
      conectados = Number(conectadosRow?.count || 0);
    } catch { }
    try {
      const byStatus = await db("subbots").select("status").count("id as count").groupBy("status");
      porEstado = byStatus.map((r) => ({
        status: r.status || "unknown",
        count: Number(r.count || 0),
      }));
    } catch { }
    return {
      success: true,
      total: Number(totalRow?.count || 0),
      activos,
      conectados,
      porEstado,
    };
  } catch (error) {
    console.error("Error en getSubbotStats:", error);
    return {
      success: false,
      error: error?.message || String(error),
    };
  }
}

export async function getSubbotStatusOverview() {
  return getSubbotStats();
}

export { listAllSubbots };


// ---------------------------------------------------
// Comandos de subbot /qr, /code, /bots, /mybots (core)
// ---------------------------------------------------

async function ensureSubbotForUser(phone, name) {
  const userPhone = normalizePhone(phone);
  if (!userPhone) throw new Error("Número de teléfono inválido");
  let row = await db("subbots").where({ user_phone: userPhone }).first();
  if (!row) {
    const code = `SUB-${userPhone}`;
    await db("subbots").insert({
      code,
      user_phone: userPhone,
      user_name: name || null,
      status: "pending",
      connection_type: "qr",
    });
    row = await db("subbots").where({ user_phone: userPhone }).first();
  }
  return formatSubbotRow(row);
}

async function handleStartSubbot(ctx) {
  const { sock, remoteJid, sender, pushName, text } = ctx;
  const usuario = sender || ctx.participant || remoteJid;
  const cleanPhone = normalizePhone(usuario);
  const name = pushName || "Usuario";
  await initDatabase();
  const row = await ensureSubbotForUser(cleanPhone, name);
  if (!row) {
    await sock.sendMessage(remoteJid, {
      text: "[ERROR] No se pudo crear o recuperar tu subbot. Intenta de nuevo.",
    });
    return { success: false };
  }
  if (row.status === "deleted") {
    await db("subbots").where({ id: row.id }).update({
      status: "pending",
      is_active: false,
    });
  }
  const code = row.code;
  const connectionType =
    /pair/i.test(text || "") || /code/i.test(text || "")
      ? "pairing"
      : "qr";
  await db("subbots").where({ id: row.id }).update({
    connection_type: connectionType,
    last_activity: db.fn.now(),
  });
  const sessionData = await loadSubbotSession(code);
  const startResult = await startSubbot({
    code,
    ownerPhone: row.user_phone,
    connectionType,
    sessionData,
  });
  if (!startResult || !startResult.success) {
    await sock.sendMessage(remoteJid, {
      text: "[ERROR] No se pudo iniciar tu subbot. Intenta más tarde o contacta soporte.",
    });
    return { success: false };
  }
  markSubbotOnline(code, startResult.sessionData || null);
  if (startResult.sessionData) {
    await saveSubbotSession(code, startResult.sessionData);
  }
  const messages = [];
  messages.push(
    `[OK] Tu subbot se está iniciando.\n\n` +
    `[CODIGO] *Código:* ${code}\n` +
    `[USUARIO] *Usuario:* ${row.user_name || "Sin nombre"}\n` +
    `[TELEFONO] *Teléfono:* ${row.user_phone}\n`
  );
  if (startResult.qrCode) {
    try {
      const qrImageBuffer = await QRCode.toBuffer(startResult.qrCode, {
        type: "png",
        width: 512,
        margin: 1,
      });
      await sock.sendMessage(remoteJid, {
        image: qrImageBuffer,
        caption:
          "📲 Escanea este QR para vincular tu subbot.\n" +
          "⏳ Tienes 1 minuto antes de que expire.",
      });
    } catch (err) {
      console.error("Error generando QR:", err);
      messages.push("[WARNING] No se pudo generar el código QR. Intenta más tarde o pide un /code.");
    }
  }
  if (startResult.pairingCode) {
    messages.push(
      `[KEY] *Código de vinculación:* \`${startResult.pairingCode}\`\n` +
      `[PIN] Úsalo en tu WhatsApp para conectar el subbot.`
    );
  }
  messages.push("[INFO] Una vez conectado, tu subbot apareceráo *online* en /mybots.");
  await sock.sendMessage(remoteJid, { text: messages.join("\n") });
  await emitSubbotEvent(code, "subbot_started", {
    connectionType,
    owner: row.user_phone,
  });
  return { success: true };
}

async function handleStopSubbot(ctx) {
  const { sock, remoteJid, sender, text } = ctx;
  const usuario = sender || ctx.participant || remoteJid;
  const cleanPhone = normalizePhone(usuario);
  await initDatabase();
  const rows = await db("subbots")
    .select("*")
    .where({ user_phone: cleanPhone })
    .andWhereNot("status", "deleted");
  if (!rows || rows.length === 0) {
    await sock.sendMessage(remoteJid, {
      text: "ℹ️ No tienes subbots activos o registrados.",
    });
    return { success: false };
  }
  let code = null;
  const tokens = String(text || "").split(/\s+/).filter(Boolean);
  const explicitCode = tokens[1];
  if (explicitCode) {
    const found = rows.find((r) => r.code === explicitCode);
    if (!found) {
      await sock.sendMessage(remoteJid, {
        text: `[WARNING] No se encontró el subbot con código: ${explicitCode}.`,
      });
      return { success: false };
    }
    code = explicitCode;
  } else if (rows.length === 1) {
    code = rows[0].code;
  } else {
    await sock.sendMessage(remoteJid, {
      text:
        "Tienes más de un subbot. Especifica cuál detener:\n" +
        rows.map((r) => `• ${r.code} (${r.status})`).join("\n"),
    });
    return { success: false };
  }
  try {
    await stopSubbot(code);
  } catch (err) {
    console.error("Error deteniendo runtime de subbot:", err);
  }
  markSubbotOffline(code);
  await db("subbots").where({ code }).update({
    is_active: false,
    status: "stopped",
    last_activity: db.fn.now(),
  });
  await sock.sendMessage(remoteJid, {
    text: `🛑 Subbot ${code} detenido correctamente.`,
  });
  await emitSubbotEvent(code, "subbot_stopped", { code });
  return { success: true };
}

async function handleListSubbots(ctx) {
  const { sock, remoteJid, sender } = ctx;
  const usuario = sender || ctx.participant || remoteJid;
  const cleanPhone = normalizePhone(usuario);
  await initDatabase();
  const rows = await db("subbots")
    .select("*")
    .where({ user_phone: cleanPhone })
    .andWhereNot("status", "deleted")
    .orderBy("created_at", "desc");
  if (!rows || rows.length === 0) {
    await sock.sendMessage(remoteJid, {
      text:
        "ℹ️ No tienes subbots aún.\n" +
        "Usa /qr para crear y vincular tu primer subbot.",
    });
    return { success: true };
  }
  const lines = [];
  lines.push("🤖 *Tus Subbots*");
  lines.push("");
  for (const row of rows) {
    const fm = formatSubbotRow(row);
    const online = fm.online ? "🟢" : "⚫";
    const status = fm.status || "desconocido";
    lines.push(
      `${online} *${fm.code}* — ${status}\n` +
      `   Tel: ${fm.user_phone}\n` +
      (fm.lastHeartbeat
        ? `   Último: ${new Date(fm.lastHeartbeat).toLocaleString("es-ES")}\n`
        : "")
    );
  }
  await sock.sendMessage(remoteJid, { text: lines.join("\n") });
  return { success: true };
}

async function handleMyBots(ctx) {
  return handleListSubbots(ctx);
}

async function handleSubbotStatus(ctx) {
  const { sock, remoteJid, sender, text } = ctx;
  const usuario = sender || ctx.participant || remoteJid;
  const cleanPhone = normalizePhone(usuario);
  await initDatabase();
  const rows = await db("subbots")
    .select("*")
    .where({ user_phone: cleanPhone })
    .andWhereNot("status", "deleted")
    .orderBy("created_at", "desc");
  if (!rows || rows.length === 0) {
    await sock.sendMessage(remoteJid, {
      text:
        "ℹ️ No tienes subbots aún.\n" +
        "Usa /qr para crear y vincular tu primer subbot.",
    });
    return { success: true };
  }
  const tokens = String(text || "").split(/\s+/).filter(Boolean);
  const explicitCode = tokens[1];
  let row = null;
  if (explicitCode) {
    row = rows.find((r) => r.code === explicitCode);
    if (!row) {
      await sock.sendMessage(remoteJid, {
        text: `⚠️ No se encontró el subbot con código: ${explicitCode}.`,
      });
      return { success: false };
    }
  } else {
    row = rows[0];
  }
  const status = getRuntimeStatus(row.code);
  const fm = formatSubbotRow(row);
  const lines = [];
  lines.push(`🤖 *Estado de ${fm.code}*`);
  lines.push("");
  lines.push(`• Online runtime: ${status.online ? "🟢 Sí" : "⚫ No"}`);
  lines.push(`• Sesiones activas: ${status.sessions}`);
  lines.push(`• Mensajes procesados: ${status.messages}`);
  lines.push("");
  lines.push(`• Estado DB: ${fm.status}`);
  lines.push(`• Teléfono: ${fm.user_phone}`);
  lines.push(
    `• Última actividad: ${fm.last_activity
      ? new Date(fm.last_activity).toLocaleString("es-ES")
      : "N/D"}`
  );
  await sock.sendMessage(remoteJid, { text: lines.join("\n") });
  return { success: true };
}


// ---------------------------------------------------
// Sistema de aportes, pedidos y media
// ---------------------------------------------------

async function ensureAportesTables() {
  const hasUsers = await db.schema.hasTable("usuarios");
  if (!hasUsers) {
    await db.schema.createTable("usuarios", (table) => {
      table.increments("id").primary();
      table.string("phone").notNullable().unique();
      table.string("name").nullable();
      table.timestamp("created_at").defaultTo(db.fn.now());
    });
  }
  const hasAportes = await db.schema.hasTable("aportes");
  if (!hasAportes) {
    await db.schema.createTable("aportes", (table) => {
      table.increments("id").primary();
      table.integer("usuario_id").unsigned().references("id").inTable("usuarios");
      table.string("type").notNullable();
      table.text("content").nullable();
      table.string("media_path").nullable();
      table.string("media_type").nullable();
      table.string("source_chat").nullable();
      table.string("message_id").nullable();
      table.string("status").defaultTo("pending");
      table.json("metadata").nullable();
      table.timestamp("created_at").defaultTo(db.fn.now());
    });
  }
  const hasPedidos = await db.schema.hasTable("pedidos");
  if (!hasPedidos) {
    await db.schema.createTable("pedidos", (table) => {
      table.increments("id").primary();
      table.integer("usuario_id").unsigned().references("id").inTable("usuarios");
      table.string("title").notNullable();
      table.text("description").nullable();
      table.string("status").defaultTo("open");
      table.json("metadata").nullable();
      table.timestamp("created_at").defaultTo(db.fn.now());
    });
  }
}

async function ensureBaseTables() {
  await ensureAportesTables();
}

async function ensureUser(phone, name) {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error("Número inválido");
  let user = await db("usuarios").where({ phone: normalized }).first();
  if (!user) {
    const [id] = await db("usuarios").insert({
      phone: normalized,
      name: name || null,
    }, ["id"]);
    user = await db("usuarios").where({ id: id.id || id }).first();
  } else if (name && !user.name) {
    await db("usuarios").where({ id: user.id }).update({ name });
    user.name = name;
  }
  return user;
}

export async function handleAddAporte(ctx) {
  const { sock, remoteJid, sender, pushName, message } = ctx;
  await ensureBaseTables();
  const phone = sender || ctx.participant || remoteJid;
  const user = await ensureUser(phone, pushName);
  const processed = await processWhatsAppMedia(sock, message, {
    basePath: "./media/aportes",
  });
  if (!processed || (!processed.text && !processed.filePath)) {
    await sock.sendMessage(remoteJid, {
      text: "⚠️ No encontré contenido válido en tu mensaje para registrar como aporte.",
    });
    return { success: false };
  }
  const metadata = {
    mimetype: processed.mimetype || null,
    size: processed.size || null,
    originalName: processed.originalName || null,
  };
  const [id] = await db("aportes").insert({
    usuario_id: user.id,
    type: processed.filePath ? "media" : "text",
    content: processed.text || null,
    media_path: processed.filePath || null,
    media_type: processed.mimetype || null,
    source_chat: remoteJid,
    message_id: message.key?.id || null,
    status: "pending",
    metadata,
  }, ["id"]);
  await sock.sendMessage(remoteJid, {
    text:
      "✅ Gracias por tu aporte!\n" +
      `ID: ${id.id || id}\n` +
      "Será revisado y utilizado para mejorar el contenido del bot.",
  });
  return { success: true, aporteId: id.id || id };
}

export async function handleAportes(ctx) {
  const { sock, remoteJid, sender } = ctx;
  await ensureBaseTables();
  const phone = sender || ctx.participant || remoteJid;
  const user = await ensureUser(phone, ctx.pushName);
  const rows = await db("aportes")
    .select("*")
    .where({ usuario_id: user.id })
    .orderBy("created_at", "desc")
    .limit(10);
  if (!rows || rows.length === 0) {
    await sock.sendMessage(remoteJid, {
      text: "ℹ️ No tienes aportes registrados todavía.",
    });
    return { success: true, aportes: [] };
  }
  let text = "📚 *Tus Aportes Recientes*\n\n";
  for (const r of rows) {
    const createdAt = new Date(r.created_at).toLocaleString("es-ES");
    const typeLabel = r.type === "media" ? "🖼 Media" : "💬 Texto";
    text += `• [${r.id}] ${typeLabel} — ${r.status || "pending"}\n   ${createdAt}\n`;
  }
  await sock.sendMessage(remoteJid, { text });
  return { success: true, aportes: rows };
}

export async function handleMyAportes(ctx) {
  return handleAportes(ctx);
}

export async function handlePedido(ctx) {
  const { sock, remoteJid, sender, pushName, text } = ctx;
  await ensureBaseTables();
  const phone = sender || ctx.participant || remoteJid;
  const user = await ensureUser(phone, pushName);
  const body = (text || "").trim().replace(/^\/pedido\b\s*/i, "");
  if (!body) {
    await sock.sendMessage(remoteJid, {
      text:
        "📝 Para crear un pedido, usa:\n" +
        "/pedido *Título del pedido* - descripción opcional",
    });
    return { success: false };
  }
  let title = body;
  let description = null;
  const dashIndex = body.indexOf("-");
  if (dashIndex > 0) {
    title = body.slice(0, dashIndex).trim();
    description = body.slice(dashIndex + 1).trim() || null;
  }
  const [id] = await db("pedidos").insert({
    usuario_id: user.id,
    title,
    description,
    status: "open",
  }, ["id"]);
  await sock.sendMessage(remoteJid, {
    text:
      "✅ Pedido creado correctamente.\n" +
      `ID: ${id.id || id}\n` +
      `Título: ${title}`,
  });
  return { success: true, pedidoId: id.id || id };
}

export async function handlePedidos(ctx) {
  const { sock, remoteJid, sender } = ctx;
  await ensureBaseTables();
  const phone = sender || ctx.participant || remoteJid;
  const user = await ensureUser(phone, ctx.pushName);
  const rows = await db("pedidos")
    .select("*")
    .where({ usuario_id: user.id })
    .orderBy("created_at", "desc")
    .limit(10);
  if (!rows || rows.length === 0) {
    await sock.sendMessage(remoteJid, {
      text: "ℹ️ No tienes pedidos registrados todavía.",
    });
    return { success: true, pedidos: [] };
  }
  let text = "📌 *Tus Pedidos Recientes*\n\n";
  for (const r of rows) {
    const createdAt = new Date(r.created_at).toLocaleString("es-ES");
    const status = r.status || "open";
    text += `• [${r.id}] ${r.title} — ${status}\n   ${createdAt}\n`;
  }
  await sock.sendMessage(remoteJid, { text });
  return { success: true, pedidos: rows };
}


// ---------------------------------------------------
// Proveedores (proveedores, contenidos, etc.)
// ---------------------------------------------------

async function ensureProveedoresTables() {
  const hasProv = await db.schema.hasTable("proveedores");
  if (!hasProv) {
    await db.schema.createTable("proveedores", (table) => {
      table.increments("id").primary();
      table.string("phone").notNullable().unique();
      table.string("name").nullable();
      table.string("role").defaultTo("provider");
      table.boolean("active").defaultTo(true);
      table.timestamp("created_at").defaultTo(db.fn.now());
    });
  }
  const hasContent = await db.schema.hasTable("proveedor_contenidos");
  if (!hasContent) {
    await db.schema.createTable("proveedor_contenidos", (table) => {
      table.increments("id").primary();
      table.integer("proveedor_id").unsigned().references("id").inTable("proveedores");
      table.string("type").notNullable();
      table.text("content").nullable();
      table.string("media_path").nullable();
      table.string("media_type").nullable();
      table.json("metadata").nullable();
      table.timestamp("created_at").defaultTo(db.fn.now());
    });
  }
}

async function ensureProveedoresBase() {
  await ensureProveedoresTables();
}

async function ensureProveedor(phone, name) {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error("Número inválido");
  let prov = await db("proveedores").where({ phone: normalized }).first();
  if (!prov) {
    const [id] = await db("proveedores").insert({
      phone: normalized,
      name: name || null,
      role: "provider",
      active: true,
    }, ["id"]);
    prov = await db("proveedores").where({ id: id.id || id }).first();
  } else if (name && !prov.name) {
    await db("proveedores").where({ id: prov.id }).update({ name });
    prov.name = name;
  }
  return prov;
}

export async function handleAportar(ctx) {
  const { sock, remoteJid, sender, pushName, message } = ctx;
  await ensureProveedoresBase();
  const phone = sender || ctx.participant || remoteJid;
  const prov = await ensureProveedor(phone, pushName);
  const processed = await processWhatsAppMedia(sock, message, {
    basePath: "./media/proveedores",
  });
  if (!processed || (!processed.text && !processed.filePath)) {
    await sock.sendMessage(remoteJid, {
      text: "⚠️ No encontré contenido válido en tu mensaje para registrar como aporte.",
    });
    return { success: false };
  }
  const metadata = {
    mimetype: processed.mimetype || null,
    size: processed.size || null,
    originalName: processed.originalName || null,
  };
  const [id] = await db("proveedor_contenidos").insert({
    proveedor_id: prov.id,
    type: processed.filePath ? "media" : "text",
    content: processed.text || null,
    media_path: processed.filePath || null,
    media_type: processed.mimetype || null,
    metadata,
  }, ["id"]);
  await sock.sendMessage(remoteJid, {
    text:
      "✅ Gracias por tu contenido como proveedor!\n" +
      `ID: ${id.id || id}\n` +
      "Será revisado y utilizado por el equipo.",
  });
  return { success: true, contenidoId: id.id || id };
}

export async function handleProveedorAportes(ctx) {
  const { sock, remoteJid, sender } = ctx;
  await ensureProveedoresBase();
  const phone = sender || ctx.participant || remoteJid;
  const prov = await ensureProveedor(phone, ctx.pushName);
  const rows = await db("proveedor_contenidos")
    .select("*")
    .where({ proveedor_id: prov.id })
    .orderBy("created_at", "desc")
    .limit(10);
  if (!rows || rows.length === 0) {
    await sock.sendMessage(remoteJid, {
      text: "ℹ️ No tienes aportes registrados todavía como proveedor.",
    });
    return { success: true, contenidos: [] };
  }
  let text = "📦 *Tus Aportes como Proveedor*\n\n";
  for (const r of rows) {
    const createdAt = new Date(r.created_at).toLocaleString("es-ES");
    const typeLabel = r.type === "media" ? "🖼 Media" : "💬 Texto";
    text += `• [${r.id}] ${typeLabel}\n   ${createdAt}\n`;
  }
  await sock.sendMessage(remoteJid, { text });
  return { success: true, contenidos: rows };
}

// =========================
// Proveedores automáticos (API panel)
// =========================

export async function getProviderStats() {
  try {
    const totalRow = await db("aportes").where({ tipo: "proveedor_auto" }).count("id as count").first();
    const pendingRow = await db("aportes").where({ tipo: "proveedor_auto", estado: "pendiente" }).count("id as count").first();
    const approvedRow = await db("aportes").where({ tipo: "proveedor_auto", estado: "aprobado" }).count("id as count").first();
    const rejectedRow = await db("aportes").where({ tipo: "proveedor_auto", estado: "rechazado" }).count("id as count").first();
    const byGroup = await db("aportes")
      .where({ tipo: "proveedor_auto" })
      .select("grupo")
      .count("id as count")
      .groupBy("grupo")
      .orderBy("count", "desc")
      .limit(20);
    return {
      success: true,
      total: Number(totalRow?.count || 0),
      pendientes: Number(pendingRow?.count || 0),
      aprobados: Number(approvedRow?.count || 0),
      rechazados: Number(rejectedRow?.count || 0),
      porProveedor: byGroup.map((r) => ({
        grupo: r.grupo,
        count: Number(r.count || 0),
      })),
    };
  } catch (error) {
    console.error("Error en getProviderStats:", error);
    throw error;
  }
}

export async function getProviderAportes(filtros = {}) {
  try {
    const {
      proveedor = "",
      manhwa = "",
      tipo = "",
      fecha_desde = "",
      fecha_hasta = "",
      limit = 100,
    } = filtros;
    let q = db("aportes")
      .where({ tipo: "proveedor_auto" })
      .select(
        "id",
        "contenido",
        "tipo",
        "usuario",
        "grupo",
        "fecha",
        "archivo_path",
        "estado",
        "manhwa_titulo as titulo",
        "contenido_tipo"
      );
    if (proveedor) {
      q = q.andWhere("grupo", String(proveedor));
    }
    if (manhwa) {
      const pattern = `%${manhwa}%`;
      q = q.andWhere("manhwa_titulo", "like", pattern);
    }
    if (tipo) {
      q = q.andWhere("contenido_tipo", String(tipo));
    }
    if (fecha_desde) {
      q = q.andWhere("fecha", ">=", fecha_desde);
    }
    if (fecha_hasta) {
      q = q.andWhere("fecha", "<=", fecha_hasta);
    }
    const rows = await q.orderBy("fecha", "desc").limit(Number.isFinite(Number(limit)) ? Number(limit) : 100);
    return rows.map((r) => ({
      id: r.id,
      proveedor: r.grupo,
      usuario: r.usuario,
      titulo: r.titulo || r.contenido || "",
      tipo: r.contenido_tipo || r.tipo,
      estado: r.estado || "pendiente",
      fecha: r.fecha,
      archivo_path: r.archivo_path || null,
      contenido: r.contenido,
    }));
  } catch (error) {
    console.error("Error en getProviderAportes:", error);
    throw error;
  }
}


// ---------------------------------------------------
// Funciones de soporte para admins (ej: /debugadmin)
// ---------------------------------------------------

export async function handleDebugAdmin(ctx) {
  const { sock, remoteJid, sender } = ctx;
  const usuario = sender || ctx.participant || remoteJid;
  const normalized = normalizePhone(usuario);
  const superadmin = await isSuperAdmin(normalized);
  if (!superadmin) {
    await sock.sendMessage(remoteJid, {
      text: "❌ No tienes permisos para usar este comando.",
    });
    return { success: false };
  }
  try {
    const stats = {
      aportes: await db("aportes").count("* as count").first(),
      pedidos: await db("pedidos").count("* as count").first(),
      usuarios: await db("usuarios").count("* as count").first(),
      subbots: await db("subbots").count("* as count").first(),
    };
    let message = "[INFO] *Información del Sistema*\n\n";
    message += `[APORTES] **Aportes:** ${stats.aportes?.count || 0}\n`;
    message += `[PEDIDOS] **Pedidos:** ${stats.pedidos?.count || 0}\n`;
    message += `[USUARIOS] **Usuarios:** ${stats.usuarios?.count || 0}\n`;
    message += `[SUBBOTS] **Subbots:** ${stats.subbots?.count || 0}\n`;
    message += `\n[DB] **Base de datos:** Operativa\n`;
    message += `[TIEMPO] **Tiempo:** ${new Date().toLocaleString("es-ES")}`;
    return { success: true, message };
  } catch (error) {
    console.error("[ERROR] Error en /debugadmin:", error);
    return {
      success: false,
      message: "[WARNING] Error obteniendo información del sistema.",
    };
  }
}

// =========================
// Helpers
// =========================

function createButtonMenu(config) {
  const { title, body, footer, buttons = [], mentions = [] } = config || {}
  if (!buttons || buttons.length === 0) {
    return {
      type: 'text',
      text: body || 'Menú sin opciones disponibles'
    }
  }
  const limitedButtons = buttons.slice(0, 3)
  const ensureSlash = (id) => {
    const s = String(id || '').trim()
    if (!s) return '/help'
    return s.startsWith('/') ? s : `/${s}`
  }
  const payload = {
    type: 'buttons',
    text: body || 'Selecciona una opción',
    footer: footer || '',
    buttons: limitedButtons.map((btn, idx) => ({
      buttonId: ensureSlash(btn.id || btn.command || btn.buttonId || btn.rowId || (btn.copy ? `/copy ${btn.copy}` : null) || '/help'),
      buttonText: { displayText: btn.text || btn.displayText || btn.title || `Opción ${idx + 1}` },
      type: 1
    })),
    headerType: 1
  }
  if (title) payload.title = title
  if (mentions.length > 0) payload.mentions = mentions
  return payload
}

async function sendInteractiveButtons(...args) {
  const normalizeButtonsArgs = (args = []) => {
    if (args.length === 1 && typeof args[0] === "object" && !Array.isArray(args[0])) return args[0] || {};
    if (args.length === 2 && typeof args[0] === "string" && Array.isArray(args[1])) return { body: args[0], buttons: args[1] };
    if (args.length === 3 && typeof args[2] === "object") return args[2] || {};
    if (args.length >= 1) return { body: String(args[0] || ""), buttons: Array.isArray(args[1]) ? args[1] : [] };
    return {};
  }
  const cfg = normalizeButtonsArgs(args);
  const { title, body, footer, buttons = [], mentions } = cfg || {};
  return createButtonMenu({
    title,
    body: body || cfg.text || cfg.message || title,
    footer,
    mentions,
    buttons: (buttons || []).map(btn => ({
      text: btn.text || btn.buttonText || btn.title || btn.displayText,
      id: btn.id || btn.command || btn.buttonId || btn.rowId || btn.url
    }))
  });
}

function humanBytes(n) {
  const u = ['B','KB','MB','GB','TB'];
  let i = 0; let v = Math.max(0, Number(n)||0);
  while (v >= 1024 && i < u.length-1) { v/=1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
}

function onlyDigits(v){ return String(v||'').replace(/\D/g,'') }

function normalizeDigits(userOrJid){
  try {
    let s = String(userOrJid || '')
    const at = s.indexOf('@'); if (at > 0) s = s.slice(0, at)
    const colon = s.indexOf(':'); if (colon > 0) s = s.slice(0, colon)
    return s.replace(/\D/g, '')
  } catch { return onlyDigits(userOrJid) }
}


// ===== SISTEMA DE COMANDOS CENTRALIZADO =====

const commandModules = new Map();
const commandMap = new Map();

// =========================
// SISTEMA DE AUTO-DISCOVERY DE PLUGINS
// =========================

import { readdir } from 'fs/promises';
import { join } from 'path';

// Cache para plugins cargados
const pluginCache = new Map();
const pluginCommands = new Map();

// Función para escanear y cargar todos los plugins automáticamente
async function loadAllPlugins() {
  try {
    const pluginsDir = './plugins';
    const files = await readdir(pluginsDir);

    // Filtrar solo archivos .js (excluyendo directorios y otros archivos)
    const pluginFiles = files.filter(file =>
      file.endsWith('.js') &&
      !file.startsWith('.') &&
      file !== 'index.js'
    );

    // Ordenar plugins por prioridad (plugins importantes primero)
    const priorityPlugins = [
      'download-commands.js',
      'ai.js',
      'games.js',
      'music.js',
      'groups.js',
      'subbots.js'
    ];

    const sortedPlugins = [
      ...pluginFiles.filter(file => priorityPlugins.includes(file)),
      ...pluginFiles.filter(file => !priorityPlugins.includes(file))
    ];

    console.log(`🔍 Encontrados ${pluginFiles.length} archivos de plugins`);

    // Limitar a los primeros 30 plugins para evitar problemas
    const limitedPlugins = sortedPlugins.slice(0, 30);
    console.log(`📋 Cargando los primeros ${limitedPlugins.length} plugins por seguridad`);

    // Cargar plugins en lotes de 3 para evitar sobrecarga
    const batchSize = 3;
    let loadedCount = 0;

    for (let i = 0; i < limitedPlugins.length; i += batchSize) {
      const batch = limitedPlugins.slice(i, i + batchSize);

      // Cargar lote actual
      const promises = batch.map(file => {
        const pluginName = file.replace('.js', '');
        return loadPlugin(pluginName);
      });

      await Promise.allSettled(promises);
      loadedCount += batch.length;

      console.log(`📦 Progreso: ${loadedCount}/${limitedPlugins.length} plugins procesados`);

      // Pausa entre lotes para evitar sobrecarga
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`✅ Cargados ${pluginCache.size} plugins exitosamente`);
    console.log(`📋 Total de comandos registrados: ${commandMap.size}`);

  } catch (error) {
    console.error('❌ Error cargando plugins:', error);
  }
}

// Función para cargar un plugin individual
async function loadPlugin(pluginName) {
  try {
    console.log(`🔄 Cargando plugin: ${pluginName}`);

    // Timeout para evitar cuelgues
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout loading plugin')), 3000);
    });

    const loadPromise = import(`./plugins/${pluginName}.js`);
    const module = await Promise.race([loadPromise, timeoutPromise]);

    // Guardar el módulo en cache
    pluginCache.set(pluginName, module);

    // Auto-registrar comandos si el plugin los define (con timeout)
    const registerPromise = autoRegisterCommands(pluginName, module);
    const registerTimeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout registering commands')), 2000);
    });

    await Promise.race([registerPromise, registerTimeoutPromise]);

    console.log(`✅ Plugin cargado: ${pluginName}`);
    return module;

  } catch (error) {
    console.log(`⚠️ No se pudo cargar plugin ${pluginName}: ${error.message}`);
    return null;
  }
}

// Función para auto-registrar comandos de un plugin
async function autoRegisterCommands(pluginName, module) {
  try {
    // 1. Buscar configuración de comandos en el módulo
    if (module.commands && Array.isArray(module.commands)) {
      for (const cmdConfig of module.commands) {
        registerCommand(cmdConfig.name, {
          handler: module[cmdConfig.handler] || module.default,
          category: cmdConfig.category || 'General',
          description: cmdConfig.description || 'Sin descripción',
          admin: cmdConfig.admin || false,
          isLocal: true,
          plugin: pluginName
        });
      }
      return;
    }

    // 2. Buscar objeto de configuración COMMANDS
    if (module.COMMANDS && typeof module.COMMANDS === 'object') {
      for (const [cmdName, config] of Object.entries(module.COMMANDS)) {
        registerCommand(cmdName, {
          handler: module[config.handler] || module[cmdName] || module.default,
          category: config.category || 'General',
          description: config.description || 'Sin descripción',
          admin: config.admin || false,
          isLocal: true,
          plugin: pluginName
        });
      }
      return;
    }

    // 3. Auto-detectar funciones exportadas (SIMPLIFICADO)
    const exportedFunctions = Object.keys(module).filter(key =>
      typeof module[key] === 'function' &&
      !key.startsWith('_') &&
      key !== 'default' &&
      key.length < 15 // Solo nombres cortos
    ).slice(0, 5); // Máximo 5 funciones por plugin

    // Solo registrar si hay pocas funciones para evitar spam
    if (exportedFunctions.length > 0 && exportedFunctions.length <= 5) {
      console.log(`🔍 Auto-detectando ${exportedFunctions.length} funciones en ${pluginName}: ${exportedFunctions.join(', ')}`);

      for (const funcName of exportedFunctions) {
        registerCommand(funcName, {
          handler: module[funcName],
          category: `🔧 ${pluginName}`,
          description: `Comando ${funcName}`,
          admin: false,
          isLocal: true,
          plugin: pluginName,
          moduleName: pluginName
        });
      }
    }

    // Registrar el plugin para carga dinámica
    pluginCommands.set(pluginName, {
      moduleName: pluginName,
      functions: exportedFunctions,
      module: module
    });

  } catch (error) {
    console.log(`⚠️ Error registrando comandos de ${pluginName}: ${error.message}`);
  }
}

// Función para registrar un comando
function registerCommand(name, config) {
  if (commandMap.has(name)) {
    console.log(`⚠️ Comando '${name}' ya existe, sobrescribiendo...`);
  }

  commandMap.set(name, config);
  console.log(`📝 Comando registrado: /${name} (${config.category})`);
}

// Función mejorada para cargar módulos de comandos
async function loadCommandModule(moduleName, commandName = null) {
  const cacheKey = commandName ? `${moduleName}:${commandName}` : moduleName;

  // Verificar cache primero
  if (commandModules.has(cacheKey)) {
    return commandModules.get(cacheKey);
  }

  // Verificar si ya está en el cache de plugins
  if (pluginCache.has(moduleName)) {
    const module = pluginCache.get(moduleName);
    return createModuleWrapper(module, moduleName, commandName);
  }

  // Cargar dinámicamente si no está en cache
  try {
    const module = await import(`./plugins/${moduleName}.js`);
    pluginCache.set(moduleName, module);
    return createModuleWrapper(module, moduleName, commandName);
  } catch (error) {
    logger.warning(`No se pudo cargar el módulo: ${moduleName}`, error.message);
    return null;
  }
}

// Función para crear wrapper de módulo
function createModuleWrapper(module, moduleName, commandName = null) {
  let handler = null;

  // Estrategias para encontrar el handler correcto
  const strategies = [
    // 1. Handler específico por nombre de comando
    () => commandName && module[commandName],
    // 2. Handler genérico
    () => module.handler,
    // 3. Handler por defecto
    () => module.default?.handler || module.default,
    // 4. Handler por nombre de módulo
    () => module[moduleName],
    // 5. Variaciones del nombre del módulo
    () => {
      const variations = [
        moduleName.replace(/-/g, ''),
        moduleName.split('-').pop(),
        moduleName.split('-')[0],
        moduleName.replace(/-/g, '_'),
      ];
      for (const variant of variations) {
        if (typeof module[variant] === 'function') {
          return module[variant];
        }
      }
      return null;
    },
    // 6. Primera función disponible
    () => {
      const functions = Object.keys(module).filter(k =>
        typeof module[k] === 'function' &&
        !k.startsWith('_') &&
        k !== 'default'
      );
      return functions.length > 0 ? module[functions[0]] : null;
    }
  ];

  // Ejecutar estrategias hasta encontrar un handler
  for (const strategy of strategies) {
    const result = strategy();
    if (typeof result === 'function') {
      handler = result;
      break;
    }
  }

  if (!handler) {
    logger.warning(`No se encontró handler en el módulo: ${moduleName}`);
    return null;
  }

  // Crear wrapper del módulo
  const wrappedModule = {
    ...module,
    handler: async (ctx) => {
      try {
        return await handler(ctx);
      } catch (error) {
        logger.error(`Error en comando ${commandName || moduleName}:`, error);
        return {
          success: false,
          message: `❌ Error ejecutando comando: ${error.message}`
        };
      }
    }
  };

  // Guardar en cache
  const cacheKey = commandName ? `${moduleName}:${commandName}` : moduleName;
  commandModules.set(cacheKey, wrappedModule);

  return wrappedModule;
}

// =========================
// INICIALIZACIÓN DEL SISTEMA DE PLUGINS
// =========================

async function initializePluginSystem() {
  console.log('🚀 Inicializando sistema de plugins...');

  // 1. Registrar comandos básicos (funciones locales)
  registerBasicCommands();

  // 2. Cargar todos los plugins automáticamente
  await loadAllPlugins();

  // 3. Registrar comandos manuales importantes
  registerManualCommands();

  // 4. Mostrar resumen
  showSystemSummary();
}

function registerBasicCommands() {
  // Comandos de ayuda
  registerCommand('help', { handler: handleHelpCommand, category: 'Básicos', description: 'Mostrar ayuda', isLocal: true });
  registerCommand('ayuda', { handler: handleHelpCommand, category: 'Básicos', description: 'Mostrar ayuda', isLocal: true });
  registerCommand('menu', { handler: handleHelpCommand, category: 'Básicos', description: 'Mostrar menú', isLocal: true });
  registerCommand('comandos', { handler: handleHelpCommand, category: 'Básicos', description: 'Mostrar ayuda', isLocal: true });

  // Comandos básicos (funciones locales en handler)
  registerCommand('ping', { handler: ping, category: 'Básicos', description: 'Verificar latencia', isLocal: true });
  registerCommand('status', { handler: status, category: 'Básicos', description: 'Estado del sistema', isLocal: true });
  registerCommand('whoami', { handler: whoami, category: 'Básicos', description: 'Mi información', isLocal: true });
  registerCommand('profile', { handler: profile, category: 'Básicos', description: 'Mi perfil', isLocal: true });

  // Comandos de utilidades (funciones locales)
  registerCommand('calc', { handler: calc, category: 'Utilidades', description: 'Calculadora', isLocal: true });
  registerCommand('password', { handler: password, category: 'Utilidades', description: 'Generar contraseña', isLocal: true });
  registerCommand('qrcode', { handler: qrcode, category: 'Utilidades', description: 'Generar código QR', isLocal: true });
  registerCommand('short', { handler: short, category: 'Utilidades', description: 'Acortar URL', isLocal: true });
  registerCommand('email', { handler: email, category: 'Utilidades', description: 'Validar email', isLocal: true });
  registerCommand('color', { handler: color, category: 'Utilidades', description: 'Información de color', isLocal: true });
  registerCommand('timezone', { handler: timezone, category: 'Utilidades', description: 'Zona horaria', isLocal: true });

  // Comandos de entretenimiento (funciones locales)
  registerCommand('joke', { handler: joke, category: 'Entretenimiento', description: 'Chiste aleatorio', isLocal: true });
  registerCommand('horoscope', { handler: horoscope, category: 'Entretenimiento', description: 'Horóscopo', isLocal: true });
  registerCommand('horoscopo', { handler: horoscope, category: 'Entretenimiento', description: 'Horóscopo', isLocal: true });
  registerCommand('fact', { handler: fact, category: 'Entretenimiento', description: 'Dato curioso', isLocal: true });
  registerCommand('quote', { handler: quote, category: 'Entretenimiento', description: 'Frase inspiradora', isLocal: true });

  // Comando de debug
  registerCommand('debugcommands', { handler: debugCommands, category: 'Admin', description: 'Debug de comandos', admin: true, isLocal: true });

  // Comando de estadísticas del sistema
  registerCommand('systemstats', { handler: systemStats, category: 'Admin', description: '📊 Estadísticas del sistema de plugins', admin: true, isLocal: true });
}

function registerManualCommands() {
  // ===== COMANDOS DE DESCARGAS 📥 =====
  const downloadCommands = [
    { cmd: 'play', desc: '🎵 Reproducir música de YouTube', emoji: '🎵' },
    { cmd: 'music', desc: '🎶 Descargar música', emoji: '🎶' },
    { cmd: 'video', desc: '🎬 Descargar video de YouTube', emoji: '🎬' },
    { cmd: 'youtube', desc: '📺 Descargar de YouTube', emoji: '📺' },
    { cmd: 'tiktok', desc: '🎵 Descargar de TikTok', emoji: '🎵' },
    { cmd: 'instagram', desc: '📸 Descargar de Instagram', emoji: '📸' },
    { cmd: 'ig', desc: '📸 Descargar de Instagram', emoji: '📸' },
    { cmd: 'facebook', desc: '📘 Descargar de Facebook', emoji: '📘' },
    { cmd: 'fb', desc: '📘 Descargar de Facebook', emoji: '📘' },
    { cmd: 'twitter', desc: '🐦 Descargar de Twitter/X', emoji: '🐦' },
    { cmd: 'x', desc: '🐦 Descargar de Twitter/X', emoji: '🐦' },
    { cmd: 'pinterest', desc: '📌 Descargar de Pinterest', emoji: '📌' },
    { cmd: 'spotify', desc: '🎧 Buscar en Spotify y descargar', emoji: '🎧' }
  ];

  downloadCommands.forEach(({ cmd, desc, emoji }) => {
    registerCommand(cmd, {
      moduleName: 'download-commands',
      category: '📥 Descargas',
      description: desc,
      emoji: emoji,
      plugin: 'download-commands'
    });
  });

  // ===== COMANDOS DE UTILIDADES 🛠️ =====
  registerCommand('translate', { moduleName: 'download-commands', category: '🛠️ Utilidades', description: '🔤 Traducir texto a cualquier idioma', emoji: '🔤' });
  registerCommand('tr', { moduleName: 'download-commands', category: '🛠️ Utilidades', description: '🔤 Traducir texto (abreviado)', emoji: '🔤' });
  registerCommand('weather', { moduleName: 'download-commands', category: '🛠️ Utilidades', description: '🌦️ Consultar clima de cualquier ciudad', emoji: '🌦️' });
  registerCommand('clima', { moduleName: 'download-commands', category: '🛠️ Utilidades', description: '🌦️ Consultar clima', emoji: '🌦️' });

  // ===== COMANDOS DE IA 🤖 =====
  const aiCommands = [
    { cmd: 'ai', desc: '🤖 Chat con inteligencia artificial', emoji: '🤖' },
    { cmd: 'chat', desc: '💬 Conversar con IA', emoji: '💬' },
    { cmd: 'gpt', desc: '🧠 Consultar GPT', emoji: '🧠' },
    { cmd: 'gemini', desc: '✨ Consultar Gemini AI', emoji: '✨' },
    { cmd: 'classify', desc: '📊 Clasificar contenido con IA', emoji: '📊' },
    { cmd: 'analyze', desc: '🔍 Analizar texto con IA', emoji: '🔍' }
  ];

  aiCommands.forEach(({ cmd, desc, emoji }) => {
    registerCommand(cmd, {
      moduleName: 'ai',
      category: '🤖 Inteligencia Artificial',
      description: desc,
      emoji: emoji,
      plugin: 'ai'
    });
  });

  // ===== COMANDOS DE JUEGOS 🎮 =====
  const gameCommands = [
    { cmd: 'game', desc: '🎮 Menú de juegos', emoji: '🎮' },
    { cmd: 'dice', desc: '🎲 Lanzar dados', emoji: '🎲' },
    { cmd: 'dado', desc: '🎲 Lanzar dados', emoji: '🎲' },
    { cmd: 'coin', desc: '🪙 Lanzar moneda', emoji: '🪙' },
    { cmd: 'moneda', desc: '🪙 Lanzar moneda', emoji: '🪙' },
    { cmd: 'rps', desc: '✂️ Piedra, papel o tijera', emoji: '✂️' },
    { cmd: 'ppt', desc: '✂️ Piedra, papel o tijera', emoji: '✂️' },
    { cmd: 'trivia', desc: '❓ Preguntas de trivia', emoji: '❓' },
    { cmd: 'quiz', desc: '🧩 Quiz interactivo', emoji: '🧩' },
    { cmd: 'riddle', desc: '🧠 Adivinanzas', emoji: '🧠' },
    { cmd: 'adivinanza', desc: '🧠 Adivinanzas', emoji: '🧠' }
  ];

  gameCommands.forEach(({ cmd, desc, emoji }) => {
    registerCommand(cmd, {
      moduleName: 'games',
      category: '🎮 Juegos',
      description: desc,
      emoji: emoji,
      plugin: 'games'
    });
  });

  // ===== COMANDOS DE GRUPOS 👥 =====
  const groupCommands = [
    { cmd: 'group', desc: '👥 Información del grupo', emoji: '👥' },
    { cmd: 'grupo', desc: '👥 Información del grupo', emoji: '👥' },
    { cmd: 'kick', desc: '👢 Expulsar miembro', emoji: '👢', admin: true },
    { cmd: 'ban', desc: '🚫 Banear usuario', emoji: '🚫', admin: true },
    { cmd: 'unban', desc: '✅ Desbanear usuario', emoji: '✅', admin: true },
    { cmd: 'promote', desc: '⬆️ Promover a admin', emoji: '⬆️', admin: true },
    { cmd: 'demote', desc: '⬇️ Quitar admin', emoji: '⬇️', admin: true },
    { cmd: 'add', desc: '➕ Agregar miembro', emoji: '➕', admin: true },
    { cmd: 'invite', desc: '🔗 Obtener enlace de invitación', emoji: '🔗', admin: true },
    { cmd: 'link', desc: '🔗 Enlace del grupo', emoji: '🔗' },
    { cmd: 'tagall', desc: '📢 Mencionar a todos', emoji: '📢', admin: true },
    { cmd: 'hidetag', desc: '👻 Mensaje oculto a todos', emoji: '👻', admin: true }
  ];

  groupCommands.forEach(({ cmd, desc, emoji, admin = false }) => {
    registerCommand(cmd, {
      moduleName: 'groups',
      category: '👥 Administración de Grupos',
      description: desc,
      emoji: emoji,
      admin: admin,
      plugin: 'groups'
    });
  });

  // ===== COMANDOS DE MÚSICA 🎵 =====
  const musicCommands = [
    { cmd: 'song', desc: '🎵 Buscar y descargar canción', emoji: '🎵' },
    { cmd: 'cancion', desc: '🎵 Buscar canción', emoji: '🎵' },
    { cmd: 'lyrics', desc: '📝 Obtener letra de canción', emoji: '📝' },
    { cmd: 'letra', desc: '📝 Letra de canción', emoji: '📝' },
    { cmd: 'playlist', desc: '📝 Crear playlist', emoji: '📝' },
    { cmd: 'identify', desc: '🎧 Identificar canción', emoji: '🎧' },
    { cmd: 'shazam', desc: '🎧 Identificar música (Shazam)', emoji: '🎧' }
  ];

  musicCommands.forEach(({ cmd, desc, emoji }) => {
    registerCommand(cmd, {
      moduleName: 'music',
      category: '🎵 Música',
      description: desc,
      emoji: emoji,
      plugin: 'music'
    });
  });

  // ===== COMANDOS DE SUBBOTS 🤖 =====
  const subbotCommands = [
    { cmd: 'qr', desc: '📱 Crear subbot con QR', emoji: '📱' },
    { cmd: 'code', desc: '🔑 Crear subbot con código', emoji: '🔑' },
    { cmd: 'pairing', desc: '🔗 Vincular subbot', emoji: '🔗' },
    { cmd: 'mybots', desc: '🤖 Mis subbots', emoji: '🤖' },
    { cmd: 'bots', desc: '🤖 Lista de subbots', emoji: '🤖' },
    { cmd: 'stopbot', desc: '🛑 Detener subbot', emoji: '🛑' },
    { cmd: 'botinfo', desc: 'ℹ️ Información del subbot', emoji: 'ℹ️' }
  ];

  subbotCommands.forEach(({ cmd, desc, emoji }) => {
    registerCommand(cmd, {
      moduleName: 'subbots',
      category: '🤖 Subbots',
      description: desc,
      emoji: emoji,
      plugin: 'subbots'
    });
  });

  // ===== COMANDOS DE ADMINISTRACIÓN 👑 =====
  const adminCommands = [
    { cmd: 'admin', desc: '👑 Panel de administración', emoji: '👑', admin: true },
    { cmd: 'broadcast', desc: '📢 Difundir mensaje', emoji: '📢', admin: true },
    { cmd: 'bc', desc: '📢 Difundir mensaje', emoji: '📢', admin: true },
    { cmd: 'ban', desc: '🚫 Banear usuario globalmente', emoji: '🚫', admin: true },
    { cmd: 'unban', desc: '✅ Desbanear usuario', emoji: '✅', admin: true },
    { cmd: 'restart', desc: '🔄 Reiniciar bot', emoji: '🔄', admin: true },
    { cmd: 'update', desc: '⬆️ Actualizar bot', emoji: '⬆️', admin: true },
    { cmd: 'logs', desc: '📋 Ver logs del sistema', emoji: '📋', admin: true },
    { cmd: 'stats', desc: '📊 Estadísticas del bot', emoji: '📊', admin: true }
  ];

  adminCommands.forEach(({ cmd, desc, emoji }) => {
    registerCommand(cmd, {
      moduleName: 'admin',
      category: '👑 Administración',
      description: desc,
      emoji: emoji,
      admin: true,
      plugin: 'admin'
    });
  });

  // ===== COMANDOS DE MEDIOS 📷 =====
  const mediaCommands = [
    { cmd: 'sticker', desc: '🏷️ Crear sticker', emoji: '🏷️' },
    { cmd: 's', desc: '🏷️ Crear sticker', emoji: '🏷️' },
    { cmd: 'toimg', desc: '🖼️ Sticker a imagen', emoji: '🖼️' },
    { cmd: 'tovideo', desc: '🎬 Sticker a video', emoji: '🎬' },
    { cmd: 'toaudio', desc: '🎵 Video a audio', emoji: '🎵' },
    { cmd: 'tomp3', desc: '🎵 Convertir a MP3', emoji: '🎵' },
    { cmd: 'compress', desc: '📦 Comprimir archivo', emoji: '📦' },
    { cmd: 'resize', desc: '📏 Redimensionar imagen', emoji: '📏' }
  ];

  mediaCommands.forEach(({ cmd, desc, emoji }) => {
    registerCommand(cmd, {
      moduleName: 'media-advanced',
      category: '📷 Medios',
      description: desc,
      emoji: emoji,
      plugin: 'media-advanced'
    });
  });

  // ===== COMANDOS DE ENTRETENIMIENTO 🎭 =====
  const entertainmentCommands = [
    { cmd: 'meme', desc: '😂 Meme aleatorio', emoji: '😂' },
    { cmd: 'joke', desc: '😄 Chiste aleatorio', emoji: '😄' },
    { cmd: 'chiste', desc: '😄 Chiste en español', emoji: '😄' },
    { cmd: 'fact', desc: '🧠 Dato curioso', emoji: '🧠' },
    { cmd: 'dato', desc: '🧠 Dato interesante', emoji: '🧠' },
    { cmd: 'quote', desc: '💭 Frase inspiradora', emoji: '💭' },
    { cmd: 'frase', desc: '💭 Frase motivacional', emoji: '💭' },
    { cmd: 'horoscope', desc: '🔮 Horóscopo', emoji: '🔮' },
    { cmd: 'horoscopo', desc: '🔮 Horóscopo del día', emoji: '🔮' }
  ];

  entertainmentCommands.forEach(({ cmd, desc, emoji }) => {
    registerCommand(cmd, {
      moduleName: 'download-commands',
      category: '🎭 Entretenimiento',
      description: desc,
      emoji: emoji,
      plugin: 'download-commands'
    });
  });

  // ===== COMANDOS DE SISTEMA 🔧 =====
  const systemCommands = [
    { cmd: 'system', desc: '💻 Información del sistema', emoji: '💻', admin: true },
    { cmd: 'uptime', desc: '⏱️ Tiempo de actividad', emoji: '⏱️' },
    { cmd: 'speed', desc: '⚡ Velocidad del bot', emoji: '⚡' },
    { cmd: 'runtime', desc: '🕐 Tiempo de ejecución', emoji: '🕐' },
    { cmd: 'memory', desc: '💾 Uso de memoria', emoji: '💾', admin: true },
    { cmd: 'cpu', desc: '🖥️ Uso de CPU', emoji: '🖥️', admin: true }
  ];

  systemCommands.forEach(({ cmd, desc, emoji, admin = false }) => {
    registerCommand(cmd, {
      moduleName: 'system-info',
      category: '🔧 Sistema',
      description: desc,
      emoji: emoji,
      admin: admin,
      plugin: 'system-info'
    });
  });

  // ===== COMANDOS DE PRIVACIDAD 🔒 =====
  const privacyCommands = [
    { cmd: 'privacy', desc: '🔒 Configuración de privacidad', emoji: '🔒' },
    { cmd: 'block', desc: '🚫 Bloquear usuario', emoji: '🚫', admin: true },
    { cmd: 'unblock', desc: '✅ Desbloquear usuario', emoji: '✅', admin: true },
    { cmd: 'antilink', desc: '🔗 Anti-enlaces', emoji: '🔗', admin: true },
    { cmd: 'antispam', desc: '🛡️ Anti-spam', emoji: '🛡️', admin: true }
  ];

  privacyCommands.forEach(({ cmd, desc, emoji, admin = false }) => {
    registerCommand(cmd, {
      moduleName: 'privacy',
      category: '🔒 Privacidad',
      description: desc,
      emoji: emoji,
      admin: admin,
      plugin: 'privacy'
    });
  });

  // ===== COMANDOS DE ARCHIVOS 📁 =====
  const fileCommands = [
    { cmd: 'file', desc: '📁 Información de archivo', emoji: '📁' },
    { cmd: 'zip', desc: '🗜️ Comprimir archivos', emoji: '🗜️' },
    { cmd: 'unzip', desc: '📦 Descomprimir archivo', emoji: '📦' },
    { cmd: 'pdf', desc: '📄 Crear PDF', emoji: '📄' },
    { cmd: 'doc', desc: '📝 Crear documento', emoji: '📝' }
  ];

  fileCommands.forEach(({ cmd, desc, emoji }) => {
    registerCommand(cmd, {
      moduleName: 'files',
      category: '📁 Archivos',
      description: desc,
      emoji: emoji,
      plugin: 'files'
    });
  });

  // ===== COMANDOS DE ENCUESTAS 📊 =====
  const pollCommands = [
    { cmd: 'poll', desc: '📊 Crear encuesta', emoji: '📊' },
    { cmd: 'encuesta', desc: '📊 Crear encuesta', emoji: '📊' },
    { cmd: 'vote', desc: '🗳️ Votar en encuesta', emoji: '🗳️' },
    { cmd: 'votar', desc: '🗳️ Emitir voto', emoji: '🗳️' },
    { cmd: 'results', desc: '📈 Resultados de encuesta', emoji: '📈' },
    { cmd: 'resultados', desc: '📈 Ver resultados', emoji: '📈' }
  ];

  pollCommands.forEach(({ cmd, desc, emoji }) => {
    registerCommand(cmd, {
      moduleName: 'polls',
      category: '📊 Encuestas',
      description: desc,
      emoji: emoji,
      plugin: 'polls'
    });
  });

  // ===== COMANDOS DE STICKERS Y MEDIA 🏷️ =====
  const stickerCommands = [
    { cmd: 'sticker', desc: '🏷️ Crear sticker desde imagen/video', emoji: '🏷️' },
    { cmd: 's', desc: '🏷️ Crear sticker (abreviado)', emoji: '🏷️' },
    { cmd: 'toimg', desc: '🖼️ Convertir sticker a imagen', emoji: '🖼️' },
    { cmd: 'tovideo', desc: '🎬 Convertir sticker a video', emoji: '🎬' },
    { cmd: 'toaudio', desc: '🎵 Extraer audio de video', emoji: '🎵' },
    { cmd: 'tomp3', desc: '🎵 Convertir a MP3', emoji: '🎵' }
  ];

  stickerCommands.forEach(({ cmd, desc, emoji }) => {
    registerCommand(cmd, {
      moduleName: 'stickers',
      category: '🏷️ Stickers',
      description: desc,
      emoji: emoji,
      plugin: 'stickers'
    });
  });

  // ===== COMANDOS DE SISTEMA Y ADMINISTRACIÓN 🔧 =====
  const systemCommands2 = [
    { cmd: 'cleansession', desc: '🧹 Limpiar sesiones', emoji: '🧹', admin: true },
    { cmd: 'logs', desc: '📋 Ver logs del sistema', emoji: '📋', admin: true },
    { cmd: 'config', desc: '⚙️ Configuración del bot', emoji: '⚙️', admin: true },
    { cmd: 'registrar', desc: '📝 Registrar usuario', emoji: '📝', admin: true },
    { cmd: 'resetpass', desc: '🔑 Resetear contraseña', emoji: '🔑', admin: true },
    { cmd: 'miinfo', desc: 'ℹ️ Mi información de usuario', emoji: 'ℹ️' }
  ];

  systemCommands2.forEach(({ cmd, desc, emoji, admin = false }) => {
    registerCommand(cmd, {
      moduleName: 'system',
      category: '🔧 Sistema',
      description: desc,
      emoji: emoji,
      admin: admin,
      plugin: 'system'
    });
  });

  // ===== COMANDOS DE MEDIA AVANZADOS 📷 =====
  const mediaAdvancedCommands = [
    { cmd: 'image', desc: '🖼️ Enviar imagen por URL', emoji: '🖼️' },
    { cmd: 'video', desc: '🎬 Enviar video por URL', emoji: '🎬' },
    { cmd: 'audio', desc: '🎵 Enviar audio por URL', emoji: '🎵' },
    { cmd: 'document', desc: '📄 Enviar documento', emoji: '📄' },
    { cmd: 'compress', desc: '📦 Comprimir archivo', emoji: '📦' },
    { cmd: 'resize', desc: '📏 Redimensionar imagen', emoji: '📏' },
    { cmd: 'convert', desc: '🔄 Convertir formato', emoji: '🔄' },
    { cmd: 'removebg', desc: '🎭 Remover fondo de imagen', emoji: '🎭' }
  ];

  mediaAdvancedCommands.forEach(({ cmd, desc, emoji }) => {
    registerCommand(cmd, {
      moduleName: 'media-advanced',
      category: '📷 Media Avanzado',
      description: desc,
      emoji: emoji,
      plugin: 'media-advanced'
    });
  });

  // ===== COMANDOS DE APORTES Y PEDIDOS 📂 =====
  const aportesCommands = [
    { cmd: 'addaporte', desc: '📤 Agregar aporte con media', emoji: '📤' },
    { cmd: 'aportes', desc: '📂 Ver mis aportes', emoji: '📂' },
    { cmd: 'myaportes', desc: '📂 Mis aportes (alias)', emoji: '📂' },
    { cmd: 'pedido', desc: '📝 Hacer pedido especial', emoji: '📝' },
    { cmd: 'pedidos', desc: '📋 Ver mis pedidos', emoji: '📋' },
    { cmd: 'mypedidos', desc: '📋 Mis pedidos (alias)', emoji: '📋' }
  ];

  aportesCommands.forEach(({ cmd, desc, emoji }) => {
    registerCommand(cmd, {
      moduleName: 'aportes',
      category: '📂 Aportes y Pedidos',
      description: desc,
      emoji: emoji,
      plugin: 'aportes'
    });
  });

  // ===== COMANDOS DE MODERACIÓN 🛡️ =====
  const moderationCommands = [
    { cmd: 'warn', desc: '⚠️ Advertir usuario', emoji: '⚠️', admin: true },
    { cmd: 'unwarn', desc: '✅ Quitar advertencia', emoji: '✅', admin: true },
    { cmd: 'warnings', desc: '📊 Ver advertencias', emoji: '📊', admin: true },
    { cmd: 'mute', desc: '🔇 Silenciar usuario', emoji: '🔇', admin: true },
    { cmd: 'unmute', desc: '🔊 Quitar silencio', emoji: '🔊', admin: true },
    { cmd: 'antilink', desc: '🔗 Configurar anti-enlaces', emoji: '🔗', admin: true },
    { cmd: 'antispam', desc: '🛡️ Configurar anti-spam', emoji: '🛡️', admin: true },
    { cmd: 'automod', desc: '🤖 Moderación automática', emoji: '🤖', admin: true }
  ];

  moderationCommands.forEach(({ cmd, desc, emoji }) => {
    registerCommand(cmd, {
      moduleName: 'moderation',
      category: '🛡️ Moderación',
      description: desc,
      emoji: emoji,
      admin: true,
      plugin: 'moderation'
    });
  });

  // ===== COMANDOS DE CHAT Y MENSAJES 💬 =====
  const chatCommands = [
    { cmd: 'delete', desc: '🗑️ Eliminar mensaje', emoji: '🗑️', admin: true },
    { cmd: 'del', desc: '🗑️ Eliminar mensaje (alias)', emoji: '🗑️', admin: true },
    { cmd: 'purge', desc: '🧹 Limpiar mensajes', emoji: '🧹', admin: true },
    { cmd: 'pin', desc: '📌 Fijar mensaje', emoji: '📌', admin: true },
    { cmd: 'unpin', desc: '📌 Desfijar mensaje', emoji: '📌', admin: true },
    { cmd: 'announce', desc: '📢 Anuncio importante', emoji: '📢', admin: true },
    { cmd: 'broadcast', desc: '📡 Difundir mensaje', emoji: '📡', admin: true },
    { cmd: 'bc', desc: '📡 Difundir (alias)', emoji: '📡', admin: true }
  ];

  chatCommands.forEach(({ cmd, desc, emoji, admin = false }) => {
    registerCommand(cmd, {
      moduleName: 'chat-management',
      category: '💬 Gestión de Chat',
      description: desc,
      emoji: emoji,
      admin: admin,
      plugin: 'chat-management'
    });
  });

  // ===== COMANDOS DE PRESENCIA Y ESTADO 👻 =====
  const presenceCommands = [
    { cmd: 'online', desc: '🟢 Marcar como en línea', emoji: '🟢' },
    { cmd: 'offline', desc: '⚫ Marcar como desconectado', emoji: '⚫' },
    { cmd: 'typing', desc: '⌨️ Simular escribiendo', emoji: '⌨️' },
    { cmd: 'recording', desc: '🎤 Simular grabando', emoji: '🎤' },
    { cmd: 'paused', desc: '⏸️ Pausar presencia', emoji: '⏸️' }
  ];

  presenceCommands.forEach(({ cmd, desc, emoji }) => {
    registerCommand(cmd, {
      moduleName: 'presence',
      category: '👻 Presencia',
      description: desc,
      emoji: emoji,
      plugin: 'presence'
    });
  });

  // ===== COMANDOS DE CONFIGURACIÓN DE GRUPOS 👥 =====
  const groupSettingsCommands = [
    { cmd: 'welcome', desc: '👋 Configurar mensaje de bienvenida', emoji: '👋', admin: true },
    { cmd: 'goodbye', desc: '👋 Configurar mensaje de despedida', emoji: '👋', admin: true },
    { cmd: 'rules', desc: '📜 Establecer reglas del grupo', emoji: '📜', admin: true },
    { cmd: 'description', desc: '📝 Cambiar descripción', emoji: '📝', admin: true },
    { cmd: 'subject', desc: '🏷️ Cambiar nombre del grupo', emoji: '🏷️', admin: true },
    { cmd: 'icon', desc: '🖼️ Cambiar foto del grupo', emoji: '🖼️', admin: true },
    { cmd: 'lock', desc: '🔒 Bloquear grupo', emoji: '🔒', admin: true },
    { cmd: 'unlock', desc: '🔓 Desbloquear grupo', emoji: '🔓', admin: true }
  ];

  groupSettingsCommands.forEach(({ cmd, desc, emoji }) => {
    registerCommand(cmd, {
      moduleName: 'group-settings',
      category: '👥 Configuración de Grupos',
      description: desc,
      emoji: emoji,
      admin: true,
      plugin: 'group-settings'
    });
  });

  // ===== COMANDOS DE UTILIDADES MATEMÁTICAS 🧮 =====
  const mathCommands = [
    { cmd: 'math', desc: '🧮 Resolver expresión matemática', emoji: '🧮' },
    { cmd: 'calculate', desc: '🧮 Calculadora avanzada', emoji: '🧮' },
    { cmd: 'convert', desc: '🔄 Convertir unidades', emoji: '🔄' },
    { cmd: 'random', desc: '🎲 Número aleatorio', emoji: '🎲' },
    { cmd: 'percentage', desc: '📊 Calcular porcentaje', emoji: '📊' }
  ];

  mathCommands.forEach(({ cmd, desc, emoji }) => {
    registerCommand(cmd, {
      moduleName: 'util-math',
      category: '🧮 Matemáticas',
      description: desc,
      emoji: emoji,
      plugin: 'util-math'
    });
  });

  // ===== COMANDOS DE CARACTERÍSTICAS AVANZADAS 🚀 =====
  const advancedCommands = [
    { cmd: 'advanced', desc: '🚀 Menú de funciones avanzadas', emoji: '🚀' },
    { cmd: 'features', desc: '✨ Lista de características', emoji: '✨' },
    { cmd: 'experimental', desc: '🧪 Funciones experimentales', emoji: '🧪', admin: true },
    { cmd: 'beta', desc: '🔬 Funciones beta', emoji: '🔬', admin: true }
  ];

  advancedCommands.forEach(({ cmd, desc, emoji, admin = false }) => {
    registerCommand(cmd, {
      moduleName: 'advanced-features',
      category: '🚀 Funciones Avanzadas',
      description: desc,
      emoji: emoji,
      admin: admin,
      plugin: 'advanced-features'
    });
  });

  // ===== COMANDOS DE RENDIMIENTO ⚡ =====
  const performanceCommands = [
    { cmd: 'performance', desc: '⚡ Análisis de rendimiento', emoji: '⚡', admin: true },
    { cmd: 'benchmark', desc: '📊 Prueba de rendimiento', emoji: '📊', admin: true },
    { cmd: 'optimize', desc: '🔧 Optimizar sistema', emoji: '🔧', admin: true },
    { cmd: 'cache', desc: '💾 Gestionar caché', emoji: '💾', admin: true },
    { cmd: 'cleanup', desc: '🧹 Limpiar archivos temporales', emoji: '🧹', admin: true }
  ];

  performanceCommands.forEach(({ cmd, desc, emoji }) => {
    registerCommand(cmd, {
      moduleName: 'performance-features',
      category: '⚡ Rendimiento',
      description: desc,
      emoji: emoji,
      admin: true,
      plugin: 'performance-features'
    });
  });

  // ===== COMANDOS DE COMUNIDAD 👥 =====
  const communityCommands = [
    { cmd: 'community', desc: '👥 Panel de comunidad', emoji: '👥' },
    { cmd: 'leaderboard', desc: '🏆 Tabla de líderes', emoji: '🏆' },
    { cmd: 'rank', desc: '📊 Mi ranking', emoji: '📊' },
    { cmd: 'level', desc: '⭐ Mi nivel', emoji: '⭐' },
    { cmd: 'exp', desc: '💎 Mi experiencia', emoji: '💎' },
    { cmd: 'daily', desc: '🎁 Recompensa diaria', emoji: '🎁' },
    { cmd: 'weekly', desc: '🎁 Recompensa semanal', emoji: '🎁' }
  ];

  communityCommands.forEach(({ cmd, desc, emoji }) => {
    registerCommand(cmd, {
      moduleName: 'community-features',
      category: '👥 Comunidad',
      description: desc,
      emoji: emoji,
      plugin: 'community-features'
    });
  });

  // ===== COMANDOS DE SEGURIDAD 🔐 =====
  const securityCommands = [
    { cmd: 'security', desc: '🔐 Panel de seguridad', emoji: '🔐', admin: true },
    { cmd: 'whitelist', desc: '✅ Lista blanca', emoji: '✅', admin: true },
    { cmd: 'blacklist', desc: '❌ Lista negra', emoji: '❌', admin: true },
    { cmd: 'permissions', desc: '🔑 Gestionar permisos', emoji: '🔑', admin: true },
    { cmd: 'audit', desc: '📋 Auditoría de seguridad', emoji: '📋', admin: true }
  ];

  securityCommands.forEach(({ cmd, desc, emoji }) => {
    registerCommand(cmd, {
      moduleName: 'security',
      category: '🔐 Seguridad',
      description: desc,
      emoji: emoji,
      admin: true,
      plugin: 'security'
    });
  });

  // ===== COMANDOS DE MANTENIMIENTO 🔧 =====
  const maintenanceCommands = [
    { cmd: 'maintenance', desc: '🔧 Modo mantenimiento', emoji: '🔧', admin: true },
    { cmd: 'backup', desc: '💾 Crear respaldo', emoji: '💾', admin: true },
    { cmd: 'restore', desc: '♻️ Restaurar respaldo', emoji: '♻️', admin: true },
    { cmd: 'database', desc: '🗄️ Gestionar base de datos', emoji: '🗄️', admin: true },
    { cmd: 'repair', desc: '🔨 Reparar sistema', emoji: '🔨', admin: true }
  ];

  maintenanceCommands.forEach(({ cmd, desc, emoji }) => {
    registerCommand(cmd, {
      moduleName: 'maintenance',
      category: '🔧 Mantenimiento',
      description: desc,
      emoji: emoji,
      admin: true,
      plugin: 'maintenance'
    });
  });

  // ===== COMANDOS DE INTERFAZ INTERACTIVA 🎛️ =====
  const interactiveCommands = [
    { cmd: 'menu', desc: '🎛️ Menú interactivo', emoji: '🎛️' },
    { cmd: 'buttons', desc: '🔘 Botones interactivos', emoji: '🔘' },
    { cmd: 'list', desc: '📋 Lista interactiva', emoji: '📋' },
    { cmd: 'carousel', desc: '🎠 Carrusel de opciones', emoji: '🎠' }
  ];

  interactiveCommands.forEach(({ cmd, desc, emoji }) => {
    registerCommand(cmd, {
      moduleName: 'ui-interactive',
      category: '🎛️ Interfaz Interactiva',
      description: desc,
      emoji: emoji,
      plugin: 'ui-interactive'
    });
  });

  // ===== COMANDOS DE CONTENIDO 📝 =====
  const contentCommands = [
    { cmd: 'content', desc: '📝 Gestionar contenido', emoji: '📝', admin: true },
    { cmd: 'post', desc: '📄 Crear publicación', emoji: '📄', admin: true },
    { cmd: 'news', desc: '📰 Noticias', emoji: '📰' },
    { cmd: 'tips', desc: '💡 Consejos útiles', emoji: '💡' },
    { cmd: 'tutorial', desc: '📚 Tutoriales', emoji: '📚' }
  ];

  contentCommands.forEach(({ cmd, desc, emoji, admin = false }) => {
    registerCommand(cmd, {
      moduleName: 'content',
      category: '📝 Contenido',
      description: desc,
      emoji: emoji,
      admin: admin,
      plugin: 'content'
    });
  });

  // ===== COMANDOS DE PROMOCIONES 🎉 =====
  const promoCommands = [
    { cmd: 'promo', desc: '🎉 Ver promociones activas', emoji: '🎉' },
    { cmd: 'discount', desc: '💰 Descuentos disponibles', emoji: '💰' },
    { cmd: 'offer', desc: '🎁 Ofertas especiales', emoji: '🎁' },
    { cmd: 'coupon', desc: '🎫 Cupones de descuento', emoji: '🎫' }
  ];

  promoCommands.forEach(({ cmd, desc, emoji }) => {
    registerCommand(cmd, {
      moduleName: 'promo',
      category: '🎉 Promociones',
      description: desc,
      emoji: emoji,
      plugin: 'promo'
    });
  });

  console.log('✅ TODOS los comandos manuales registrados con emojis y categorías contextuales');
  console.log(`📊 Total de comandos registrados manualmente: ${commandMap.size}`);
}

function showSystemSummary() {
  const totalCommands = commandMap.size;
  const localCommands = Array.from(commandMap.values()).filter(cmd => cmd.isLocal).length;
  const moduleCommands = Array.from(commandMap.values()).filter(cmd => cmd.moduleName).length;
  const pluginCount = pluginCache.size;

  console.log('\n🎉 SISTEMA DE PLUGINS INICIALIZADO');
  console.log('=====================================');
  console.log(`📦 Plugins cargados: ${pluginCount}`);
  console.log(`📋 Total comandos: ${totalCommands}`);
  console.log(`🏠 Comandos locales: ${localCommands}`);
  console.log(`🔗 Comandos de módulos: ${moduleCommands}`);
  console.log('=====================================\n');

  logger.bot(`Sistema de comandos inicializado con ${totalCommands} comandos (${pluginCount} plugins)`);
}

// Inicializar sistema de plugins automáticamente
await initializePluginSystem();

// Exponer commandMap globalmente para pruebas y debugging
global.commandMap = commandMap;
global.pluginCache = pluginCache;

function cleanText(text) {
  try {
    if (text == null) return '';
    let s = String(text);
    s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '');
    s = s.replace(/\n/g, '\n');
    s = s.replace(/ {2,}/g, ' ');
    return s.trim();
  } catch {
    return String(text || '').trim();
  }
}

function extractText(message) {
  try {
    const pick = (obj) => {
      if (!obj || typeof obj !== 'object') return ''
      const base = (
        obj.conversation ||
        obj.extendedTextMessage?.text ||
        obj.imageMessage?.caption ||
        obj.videoMessage?.caption ||
        ''
      )
      if (base) return cleanText(base)
      const btnId =
        obj.buttonsResponseMessage?.selectedButtonId ||
        obj.templateButtonReplyMessage?.selectedId ||
        obj.buttonReplyMessage?.selectedButtonId
      if (btnId) return cleanText(btnId)
      const listResp = obj.listResponseMessage
      if (listResp) {
        const rowId =
          listResp.singleSelectReply?.selectedRowId ||
          listResp.singleSelectReply?.selectedId ||
          listResp.title
        if (rowId) return cleanText(rowId)
      }
      return ''
    }
    const m = message?.message || {}
    let out = pick(m)
    if (out) return out
    const inner = m.viewOnceMessage?.message || m.ephemeralMessage?.message || m.documentWithCaptionMessage?.message || null
    if (inner) {
      out = pick(inner)
      if (out) return out
    }
    return ''
  } catch (e) {
    return ''
  }
}

function parseCommand(text) {
  const raw = cleanText(text)
  if (!raw) return { command: '', args: [] }
  const prefixes = Array.from(new Set(
    (process.env.CMD_PREFIXES || '/!.#?$~').split('').concat(['/', '!', '.'])
  ))
  const s = raw.trim()
  let prefixUsed = null
  for (const p of prefixes) {
    if (s.startsWith(p)) {
      prefixUsed = p
      break
    }
  }
  if (prefixUsed !== null) {
    const parts = s.slice(prefixUsed.length).trim().split(/\s+/)
    const command = parts.shift() || ''
    return { command: command, args: parts }
  }
  const specialCommands = [
    'cat_descargas', 'cat_ia', 'cat_interactivo', 'cat_media', 'cat_utilidades', 'cat_grupo', 'cat_admin',
    'cat_entretenimiento', 'cat_archivos', 'cat_aportes',
    'help_play', 'help_video', 'help_tiktok', 'help_instagram', 'help_spotify',
    'help_ia', 'help_image', 'help_clasificar', 'help_sticker', 'help_meme',
    'help_quote', 'help_translate', 'help_weather', 'help_ping', 'help_bot',
    'help_groupinfo', 'help_qr', 'help_code', 'help_mybots', 'help_menu'
  ];
  if (specialCommands.includes(s)) {
    return { command: s, args: [] }
  }
  return { command: '', args: [] }
}


// =========================
// SISTEMA DE HELP MEJORADO CON TEMÁTICA BL + WILEYS
// =========================

// Funcionalidades Wileys completas + Temática BL integrada para Help
const BL_HELP_REACTIONS = ['💖', '✨', '🌸', '💕', '💝', '🌟', '🥰', '😍', '💫', '🎀'];
const BL_HELP_MESSAGES = {
  welcome: ['💖 ¡Hola! Te ayudo con mucho amor', '✨ ¡Bienvenido! Aquí tienes todo', '🌸 ¡Hola cariño! ¿En qué te ayudo?'],
  categories: ['💕 Explora las categorías con amor', '🌟 Encuentra lo que necesitas', '💖 Todo organizado para ti'],
  commands: ['✨ Aquí están todos los comandos', '💝 Lista completa con amor', '🌸 Todos los comandos disponibles']
};

// Wileys: Reacciones automáticas BL mejoradas para help
const addBLHelpReaction = async (sock, message, type = 'help') => {
  try {
    if (!sock || !message?.key) return;

    const reactionSequences = {
      help: ['💖', '✨', '🌸'],
      categories: ['📋', '💕', '🌟'],
      commands: ['📝', '💖', '💫'],
      search: ['🔍', '✨', '💝']
    };

    const sequence = reactionSequences[type] || reactionSequences.help;

    // Aplicar secuencia de reacciones con timing BL
    for (let i = 0; i < sequence.length; i++) {
      setTimeout(async () => {
        await sock.sendMessage(message.key.remoteJid, {
          react: { text: sequence[i], key: message.key }
        });
      }, i * 1000);
    }
  } catch (error) {
    console.error('[BL_HELP_REACTION] Error:', error);
  }
};

// Wileys: Decoración BL para mensajes de help
const decorateBLHelpMessage = (title, content, style = 'love') => {
  const styles = {
    love: {
      header: '╔💖═══════════════════════════════════════💖╗',
      footer: '╚💖═══════════════════════════════════════💖╝',
      bullet: '💖',
      separator: '💕'
    },
    categories: {
      header: '╔🌸═══════════════════════════════════════🌸╗',
      footer: '╚🌸═══════════════════════════════════════🌸╝',
      bullet: '🌸',
      separator: '✨'
    },
    commands: {
      header: '╔💝═══════════════════════════════════════💝╗',
      footer: '╚💝═══════════════════════════════════════💝╝',
      bullet: '💝',
      separator: '🌟'
    }
  };

  const currentStyle = styles[style] || styles.love;
  let message = currentStyle.header + '\n';
  message += `║           ${title.padEnd(37)}║\n`;
  message += `║${' '.repeat(39)}║\n`;

  if (Array.isArray(content)) {
    content.forEach(item => {
      const lines = item.split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          message += `║ ${line.padEnd(37)}║\n`;
        }
      });
    });
  } else {
    const lines = content.split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        message += `║ ${line.padEnd(37)}║\n`;
      }
    });
  }

  message += currentStyle.footer;
  return message;
};

// Comando de ayuda integrado con temática BL completa - TODOS LOS COMANDOS
async function handleHelpCommand(ctx) {
  const { sock, remoteJid, sender, isGroup, message, args, text } = ctx;

  // Funcionalidad Wileys: Reacción automática BL
  await addBLHelpReaction(sock, message, 'help');

  const userPhone = normalizePhone(sender || ctx.participant || remoteJid);
  const isAdmin = await isSuperAdmin(userPhone);

  // Si hay argumentos, mostrar ayuda específica
  if (args && args.length > 0) {
    const command = args[0].toLowerCase();
    return await handleSpecificCommandHelp(ctx, command);
  }

  // GENERAR LISTA DINÁMICA DE COMANDOS DESDE commandMap
  const commandsByCategory = new Map();

  // Organizar comandos registrados por categoría
  for (const [cmdName, cmdConfig] of commandMap.entries()) {
    // Filtrar comandos de admin si no es admin
    if (cmdConfig.admin && !isAdmin) continue;

    const category = cmdConfig.category || 'General';
    if (!commandsByCategory.has(category)) {
      commandsByCategory.set(category, []);
    }

    commandsByCategory.get(category).push({
      cmd: cmdName,
      desc: cmdConfig.description || 'Sin descripción',
      emoji: cmdConfig.emoji || '•',
      admin: cmdConfig.admin || false
    });
  }

  // Definir orden y estilos de categorías
  const categoryStyles = {
    '📥 Descargas': { icon: '📥', color: '💖' },
    '🤖 Inteligencia Artificial': { icon: '🤖', color: '✨' },
    '🎵 Música': { icon: '🎵', color: '🌸' },
    '🎮 Juegos': { icon: '🎮', color: '🎮' },
    '👥 Administración de Grupos': { icon: '👥', color: '💝' },
    '🤖 Subbots': { icon: '🤖', color: '🌟' },
    '🛠️ Utilidades': { icon: '🛠️', color: '🥰' },
    '📷 Medios': { icon: '📷', color: '😍' },
    '🎭 Entretenimiento': { icon: '🎭', color: '🎭' },
    '📊 Encuestas': { icon: '📊', color: '📊' },
    '🔧 Sistema': { icon: '🔧', color: '🔧' },
    '🔒 Privacidad': { icon: '🔒', color: '🔒' },
    '📁 Archivos': { icon: '📁', color: '📁' },
    '👑 Administración': { icon: '👑', color: '👑' },
    'Básicos': { icon: '📋', color: '💫' },
    'General': { icon: '⚡', color: '⚡' }
  };

  // Crear mensaje hermoso con TODOS los comandos organizados
  const welcomeMessages = [
    '¡Hola! Aquí tienes todos mis comandos 💖',
    '✨ ¡Bienvenido! Estos son mis poderes ✨',
    '🌸 ¡Lista completa de comandos! 🌸',
    '💕 ¡Todo lo que puedo hacer por ti! 💕'
  ];
  const welcomeMessage = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];

  // Contar total de comandos
  let totalCommands = 0;
  commandsByCategory.forEach(commands => {
    totalCommands += commands.length;
  });

  let helpText = `╔💖═══════════════════════════════════════💖╗\n`;
  helpText += `║              KONMI BOT                  ║\n`;
  helpText += `║         💖 TODOS LOS COMANDOS 💖        ║\n`;
  helpText += `║                                         ║\n`;
  helpText += `║    ${welcomeMessage.padEnd(35)} ║\n`;
  helpText += `║    Total: ${totalCommands} comandos disponibles${' '.repeat(35 - `Total: ${totalCommands} comandos disponibles`.length)} ║\n`;
  helpText += `╚💖═══════════════════════════════════════💖╝\n\n`;

  // Agregar todas las categorías con sus comandos
  for (const [categoryName, commands] of commandsByCategory.entries()) {
    const style = categoryStyles[categoryName] || { icon: '•', color: '💫' };

    helpText += `${style.color} ═══ ${style.icon} ${categoryName} ═══ ${style.color}\n`;

    // Organizar comandos en filas de 2 con emojis
    for (let i = 0; i < commands.length; i += 2) {
      const cmd1 = commands[i];
      const cmd2 = commands[i + 1];

      const cmd1Text = `${cmd1.emoji} /${cmd1.cmd}`;
      if (cmd2) {
        const cmd2Text = `${cmd2.emoji} /${cmd2.cmd}`;
        helpText += `${cmd1Text.padEnd(20)} ${cmd2Text}\n`;
      } else {
        helpText += `${cmd1Text}\n`;
      }
    }
    helpText += `\n`;
  }

  // Footer con información útil
  helpText += `💡 ═══ INFORMACIÓN ÚTIL ═══ 💡\n`;
  helpText += `• /help <comando> - Ayuda específica\n`;
  helpText += `• /ping - Estado del bot\n`;
  helpText += `• Responde a mensajes para usar comandos\n`;
  helpText += `• Algunos comandos requieren permisos\n\n`;

  helpText += `✨ ═══ EJEMPLOS RÁPIDOS ═══ ✨\n`;
  helpText += `• /play despacito\n`;
  helpText += `• /ai ¿Cómo estás?\n`;
  helpText += `• /tiktok <url>\n`;
  helpText += `• /weather Madrid\n\n`;

  helpText += `💖 ¡Disfruta usando KONMI BOT! 💖`;

  await sock.sendMessage(remoteJid, { text: helpText });
  return { success: true };
}

// Función para ayuda específica de comandos
async function handleSpecificCommandHelp(ctx, command) {
  const { sock, remoteJid, message } = ctx;

  await addBLHelpReaction(sock, message, 'search');

  // Base de datos de ayuda específica para comandos
  const commandHelp = {
    'play': {
      title: 'Comando Play 🎵',
      description: 'Descarga audio de YouTube con alta calidad',
      usage: '/play <nombre de la canción>',
      examples: [
        '/play despacito',
        '/play bad bunny tití me preguntó',
        '/play https://youtube.com/watch?v=...'
      ],
      tips: [
        '💡 Puedes usar nombres o URLs',
        '🎵 Descarga en formato MP3',
        '⚡ Proceso rápido y automático'
      ]
    },
    'ai': {
      title: 'Inteligencia Artificial 🤖',
      description: 'Chatea con IA avanzada (Gemini)',
      usage: '/ai <tu pregunta>',
      examples: [
        '/ai ¿Cómo funciona JavaScript?',
        '/ai Explícame la fotosíntesis',
        '/ai Ayúdame con mi tarea de matemáticas'
      ],
      tips: [
        '🧠 IA muy inteligente',
        '💬 Respuestas detalladas',
        '🌟 Múltiples idiomas'
      ]
    },
    'tiktok': {
      title: 'Descarga TikTok 📱',
      description: 'Descarga videos de TikTok sin marca de agua',
      usage: '/tiktok <URL del video>',
      examples: [
        '/tiktok https://vm.tiktok.com/ZMh...',
        '/tiktok https://tiktok.com/@user/video/...'
      ],
      tips: [
        '📱 Sin marca de agua',
        '🎬 Calidad original',
        '⚡ Descarga rápida'
      ]
    },
    'rps': {
      title: 'Piedra, Papel o Tijera 🪨',
      description: 'Juega piedra, papel o tijera con el bot',
      usage: '/rps <tu elección>',
      examples: [
        '/rps piedra',
        '/rps papel',
        '/rps tijera'
      ],
      tips: [
        '🎮 Juego clásico',
        '🏆 Resultados instantáneos',
        '💖 Diversión garantizada'
      ]
    }
  };

  const helpData = commandHelp[command];

  if (!helpData) {
    const errorContent = [
      `Comando "${command}" no encontrado 🥺`,
      '',
      '💡 Comandos disponibles:',
      '• /help - Menú principal',
      '• /comandos - Lista completa',
      '• /help play - Ayuda de música',
      '• /help ai - Ayuda de IA',
      '',
      '💖 ¡Intenta con otro comando!'
    ];

    const errorMessage = decorateBLHelpMessage('Comando No Encontrado', errorContent, 'love');
    await sock.sendMessage(remoteJid, { text: errorMessage });
    return { success: false };
  }

  let helpContent = [
    helpData.description,
    '',
    '📋 USO:',
    helpData.usage,
    '',
    '💡 EJEMPLOS:'
  ];

  helpData.examples.forEach(example => {
    helpContent.push(`• ${example}`);
  });

  helpContent.push('');
  helpContent.push('✨ CONSEJOS:');

  helpData.tips.forEach(tip => {
    helpContent.push(`• ${tip}`);
  });

  helpContent.push('');
  helpContent.push('💖 ¡Pruébalo ahora!');

  const specificHelpMessage = decorateBLHelpMessage(helpData.title, helpContent, 'commands');

  await sock.sendMessage(remoteJid, { text: specificHelpMessage });
  return { success: true };
}

// Manejador para respuestas del menú help
async function handleHelpResponse(ctx) {
  const { sock, remoteJid, args, text } = ctx;
  const category = args[0] || text || '';
  // Processing help category

  if (category === 'cat_descargas') {
    return {
      text: `[DESCARGAS] *COMANDOS DE DESCARGAS*

♪ */play* <nombre o URL>
Descarga audio de YouTube
Ejemplo: /play despacito

♦ */video* <nombre o URL>
Descarga video de YouTube
Ejemplo: /video tutorial javascript

♠ */tiktok* <URL>
Descarga videos de TikTok
Ejemplo: /tiktok https://vm.tiktok.com/...

♣ */instagram* <URL>
Descarga contenido de Instagram
Ejemplo: /instagram https://instagram.com/p/...

♫ */spotify* <búsqueda>
Busca música en Spotify
Ejemplo: /spotify bad bunny

• */downloads*
Ver todas las plataformas de descarga
Ejemplo: /downloads

♪ */soundcloud* <URL>
Música de SoundCloud
Ejemplo: /soundcloud https://soundcloud.com/...

• */reddit* <URL>
Videos/imágenes de Reddit
Ejemplo: /reddit https://reddit.com/r/...

• */twitch* <URL>
Clips y videos de Twitch
Ejemplo: /twitch https://clips.twitch.tv/...

• */dailymotion* <URL>
Videos de Dailymotion
Ejemplo: /dailymotion https://dailymotion.com/...

• */vimeo* <URL>
Videos de Vimeo
Ejemplo: /vimeo https://vimeo.com/...

💡 *Tip:* Usa /help para volver al menú principal`
    };
  }

  if (category === 'cat_ia') {
    return {
      text: `[IA] *COMANDOS DE INTELIGENCIA ARTIFICIAL*

🧠 */ia* <pregunta>
Pregunta a Gemini AI
Ejemplo: /ia explícame qué es javascript

🎨 */image* <descripción>
Generar imagen con IA
Ejemplo: /image un gato astronauta

📊 */clasificar* <texto>
Clasificar texto (positivo/negativo)
Ejemplo: /clasificar este producto es excelente

 */resume* <texto largo>
Resumir texto en puntos principales
Ejemplo: /resume Este es un texto muy largo...

🌐 */translate* <idioma> <texto>
Traducir texto a cualquier idioma
Ejemplo: /translate english Hola mundo

🧠 */explain* <concepto>
Explicar conceptos de forma simple
Ejemplo: /explain inteligencia artificial

💡 *Tip:* Usa /help para volver al menú principal`
    };
  }

  if (category === 'cat_media') {
    return {
      text: `[MEDIA] *COMANDOS DE MEDIA & STICKERS*

✨ */sticker* (también */s*)
Crear sticker de imagen o video
Uso: Envía imagen/video con /sticker
O responde a una imagen con /sticker

🖼 */wallpaper* <búsqueda>
Buscar wallpapers
Ejemplo: /wallpaper naturaleza

🗣 */tts* <texto>
Convertir texto a voz
Ejemplo: /tts Hola mundo

😂 */meme*
Meme aleatorio
Ejemplo: /meme

💭 */quote*
Frase motivacional aleatoria
Ejemplo: /quote

💡 *Tip:* Usa /help para volver al menú principal`
    };
  }

  if (category === 'cat_utilidades') {
    return {
      text: `🧰 *COMANDOS DE UTILIDADES*

🌐 */translate* <idioma> <texto>
Traducir texto a cualquier idioma
Ejemplo: /translate en hola mundo

🌤️ */weather* <ciudad>
Consultar el clima actual
Ejemplo: /weather Madrid

🏓 */ping*
Verificar latencia del bot
Ejemplo: /ping

*/qrcode* <texto>
Generar código QR
Ejemplo: /qrcode https://google.com

🧮 */calc* <expresión>
Calculadora matemática
Ejemplo: /calc 2 + 2 * 3

🔐 */password* [longitud]
Generar contraseña segura
Ejemplo: /password 16

🔄 */convert* <cantidad> <de> <a>
Convertir unidades
Ejemplo: /convert 100 cm m

📧 */email* <dirección>
Validar email
Ejemplo: /email test@ejemplo.com

🎨 */color* <código>
Información de colores
Ejemplo: /color #FF0000

🌍 */timezone* <zona>
Conversor de zonas horarias
Ejemplo: /timezone UTC

🔗 */short* <URL>
Acortar URLs
Ejemplo: /short https://google.com

💡 *Tip:* Usa /help para volver al menú principal`
    };
  }

  if (category === 'cat_grupo') {
    return {
      text: `[GRUPO] *COMANDOS DE GRUPO*

🤖 */bot* <on/off/status>
Controlar el bot en este grupo
⚠️ Solo admins pueden usarlo

ℹ️ */groupinfo*
Mostrar información del grupo

📊 */groupstats*
Estadísticas detalladas del grupo

👢 */kick* @usuario
Expulsar usuario del grupo
⚠️ Solo admins pueden usarlo

⬆️ */promote* @usuario
Promover usuario a admin
⚠️ Solo admins pueden usarlo

⬇️ */demote* @usuario
Quitar admin a usuario
⚠️ Solo admins pueden usarlo

🔒 */lock* / 🔓 */unlock*
Cerrar/abrir grupo
⚠️ Solo admins pueden usarlo

👋 */welcome* <mensaje>
Configurar mensaje de bienvenida
⚠️ Solo admins pueden usarlo

🛡️ */automod* <on/off/status>
Auto-moderación del grupo
⚠️ Solo admins pueden usarlo

📋 */rules* [texto]
Ver o configurar reglas del grupo

🧹 */clean* [cantidad]
Limpiar mensajes del grupo
⚠️ Solo admins pueden usarlo

💡 *Tip:* Usa /help para volver al menú principal`
    };
  }

  if (category === 'cat_admin') {
    return {
      text: `⚙️ *COMANDOS DE ADMINISTRACIÓN*

🤖 *SUBBOTS:*
📱 */qr* - Crear subbot con QR
🔑 */code* <número> - Crear con código
📋 */bots* - Ver todos los subbots del sistema
📊 */subbotstats* - Estadísticas de subbots
⚙️ */subbotmanage* - Gestión avanzada
📈 */subbotmonitor* - Monitor de actividad

📊 *SISTEMA:*
📊 */stats* - Estadísticas del sistema
📋 */logs* - Ver logs del sistema
📤 */export* - Exportar datos
🔄 */update* - Actualizar sistema

 **COMUNICACIÓN:*
📢 */broadcast* <mensaje> - Mensaje a todos los grupos

⚠️ *Nota:* Comandos marcados solo para administradores

 *Tip:* Usa /help para volver al menú principal`
    };
  }

  if (category === 'cat_entretenimiento') {
    return {
      text: `🎮 *COMANDOS DE ENTRETENIMIENTO*

🎲 */game* (también */juego*)
Juegos interactivos
Ejemplo: /game

🧠 */trivia*
Preguntas de trivia
Ejemplo: /trivia

😂 */joke*
Chiste aleatorio
Ejemplo: /joke

🔮 */horoscope* <signo> (también */horoscopo*)
Horóscopo del día
Ejemplo: /horoscope aries

📊 */poll* <pregunta> | op1 | op2
Crear encuesta (una opción)
Ejemplo: /poll ¿Te gusta? | Sí | No

📊 */pollmultiple* <pregunta> | op1 | op2
Crear encuesta (múltiples opciones)
Ejemplo: /pollmultiple ¿Qué te gusta? | Pizza | Tacos

📰 */fact*
Dato curioso aleatorio
Ejemplo: /fact

💡 *Tip:* Usa /help para volver al menú principal`
    };
  }

  if (category === 'cat_interactivo') {
    return {
      text: `✨ *COMANDOS INTERACTIVOS*

❤️ *REACCIONES AUTOMÁTICAS*
El bot reacciona automáticamente a tus comandos:
📥 Descargas → Reacciona mientras procesa
✅ Completado → Reacciona cuando termina
🤖 IA → Reacciona mientras piensa
✨ Media → Reacciona mientras crea
No necesitas hacer nada, es automático!

📊 *ENCUESTAS*
*/poll* <pregunta> | op1 | op2 - Encuesta normal
*/pollmultiple* <pregunta> | op1 | op2 - Múltiples opciones
*/quickpoll* <pregunta> - Encuesta rápida Sí/No
*/rating* <pregunta> - Rating de 1 a 5 estrellas
*/yesno* <pregunta> - Sí/No/No sé

⌨️ *ESTADOS DE PRESENCIA*
*/typing* [segundos] - Simular escribiendo
*/recording* [segundos] - Simular grabando
*/online* - Estado disponible
*/offline* - Estado no disponible
*/away* - Estado ausente
*/busy* - Estado ocupado
*/readall* - Marcar todo como leído (grupos)

  *Tip:* Usa /help para volver al menú principal`
    };
  }

  if (category === 'cat_archivos') {
    return {
      text: `📁 *COMANDOS DE ARCHIVOS*

💾 */guardar* <nombre>
Guardar archivo (responde a un archivo)
Ejemplo: /guardar mi_documento

📥 */descargar* <nombre>
Descargar archivo guardado
Ejemplo: /descargar mi_documento

📋 */archivos*
Ver todos los archivos disponibles
Ejemplo: /archivos

📂 */misarchivos*
Ver mis archivos guardados
Ejemplo: /misarchivos

💡 *Tip:* Usa /help para volver al menú principal`
    };
  }

  if (category === 'cat_aportes') {
    return {
      text: `📊 *COMANDOS DE APORTES & PEDIDOS*

➕ */addaporte* <descripción>
Agregar un nuevo aporte
Ejemplo: /addaporte Nueva función de descarga

📋 */aportes*
Ver todos los aportes
Ejemplo: /aportes

📝 */myaportes* (también */misaportes*)
Ver mis aportes
Ejemplo: /myaportes

🔍 */aporteestado* <ID>
Ver estado de un aporte
Ejemplo: /aporteestado 123

🙏 */pedido* <descripción>
Hacer un pedido o solicitud
Ejemplo: /pedido Necesito ayuda con...

📜 */pedidos* (también */mispedidos*)
Ver pedidos
Ejemplo: /pedidos

💡 *Tip:* Usa /help para volver al menú principal`
    };
  }

  if (category === 'cat_subbots') {
    return {
      text: `🤖 *COMANDOS DE SUBBOTS*

📱 */qr*
Crear subbot con código QR
Ejemplo: /qr

🔑 */code* <número>
Crear subbot con código de emparejamiento
Ejemplo: /code 34612345678

📋 */mybots*
Ver tus subbots activos
Ejemplo: /mybots

🛑 */stopbot* <código>
Detener un subbot
Ejemplo: /stopbot SUB-123456

📊 */subbotstats*
Estadísticas de tus subbots
Ejemplo: /subbotstats

⚙️ */subbotmanage* <acción> <código>
Gestionar subbots avanzado
Acciones: start, stop, restart, delete, info
Ejemplo: /subbotmanage info SUB-123

📈 */subbotmonitor*
Monitor de actividad de subbots
Ejemplo: /subbotmonitor

💡 *Tip:* Usa /help para volver al menú principal`
    };
  }

  const helpTexts = {
    help_play: '🎵 *Comando: /play*\n\nDescarga audio de YouTube.\n\n*Uso:*\n/play <nombre o URL>\n\n*Ejemplo:*\n/play despacito\n/play https://youtube.com/watch?v=...\n\n💡 *Tip:* También puedes usar solo el nombre de la canción.',
    help_video: '🎬 *Comando: /video*\n\nDescarga video de YouTube.\n\n*Uso:*\n/video <nombre o URL>\n\n*Ejemplo:*\n/video tutorial javascript\n/video https://youtube.com/watch?v=...',
    help_tiktok: '📱 *Comando: /tiktok*\n\nDescarga videos de TikTok.\n\n*Uso:*\n/tiktok <URL>\n\n*Ejemplo:*\n/tiktok https://vm.tiktok.com/...\n/tiktok https://tiktok.com/@user/video/...',
    help_instagram: '📷 *Comando: /instagram*\n\nDescarga contenido de Instagram.\n\n*Uso:*\n/instagram <URL>\n\n*Ejemplo:*\n/instagram https://instagram.com/p/...\n/instagram https://instagram.com/reel/...',
    help_spotify: '🎧 *Comando: /spotify*\n\nBusca música en Spotify.\n\n*Uso:*\n/spotify <búsqueda>\n\n*Ejemplo:*\n/spotify bad bunny\n/spotify reggaeton 2024',
    help_ia: '🤖 *Comando: /ia*\n\nPregunta a Gemini AI.\n\n*Uso:*\n/ia <pregunta>\n\n*Ejemplo:*\n/ia explícame qué es javascript\n/ia cómo hacer una pizza\n/ia traduce esto al inglés',
    help_image: '🎨 *Comando: /image*\n\nGenera imagen con IA.\n\n*Uso:*\n/image <descripción>\n\n*Ejemplo:*\n/image un gato astronauta\n/image paisaje de montañas al atardecer',
    help_clasificar: '📊 *Comando: /clasificar*\n\nClasifica texto (positivo/negativo).\n\n*Uso:*\n/clasificar <texto>\n\n*Ejemplo:*\n/clasificar este producto es excelente\n/clasificar no me gustó nada',
    help_sticker: '✨ *Comando: /sticker*\n\nCrea sticker de imagen o video.\n\n*Uso:*\n• Envía una imagen/video con caption /sticker\n• O responde a una imagen/video con /sticker\n\n*Ejemplo:*\n[Imagen] /sticker',
    help_meme: '😂 *Comando: /meme*\n\nMeme aleatorio.\n\n*Uso:*\n/meme\n\n💡 *Tip:* Cada vez que uses el comando obtendrás un meme diferente.',
    help_quote: '💭 *Comando: /quote*\n\nFrase motivacional aleatoria.\n\n*Uso:*\n/quote\n\n💡 *Tip:* Perfecto para inspirarte cada día.',
    help_translate: '🌐 *Comando: /translate*\n\nTraduce texto a cualquier idioma.\n\n*Uso:*\n/translate <idioma> <texto>\n\n*Ejemplo:*\n/translate en hola mundo\n/translate fr buenos días\n/translate es hello world',
    help_weather: '🌤️ *Comando: /weather*\n\nConsulta el clima actual.\n\n*Uso:*\n/weather <ciudad>\n\n*Ejemplo:*\n/weather Madrid\n/weather Buenos Aires\n/weather New York',
    help_ping: '🏓 *Comando: /ping*\n\nVerifica la latencia del bot.\n\n*Uso:*\n/ping\n\n💡 *Tip:* Útil para verificar si el bot está funcionando correctamente.',
    help_bot: '🤖 *Comando: /bot*\n\nControla el bot en este grupo.\n\n*Uso:*\n/bot on - Activar bot\n/bot off - Desactivar bot\n/bot status - Ver estado\n\n💡 *Tip:* Solo admins pueden usar este comando.',
    help_groupinfo: 'ℹ️ *Comando: /groupinfo*\n\nMuestra información del grupo.\n\n*Uso:*\n/groupinfo\n\n*Información mostrada:*\n• Nombre del grupo\n• Descripción\n• Cantidad de miembros\n• Admins',
    help_qr: '📱 *Comando: /qr*\n\nCrea un subbot con código QR.\n\n*Uso:*\n/qr\n\n*Proceso:*\n1. El bot genera un QR\n2. Escaneas con WhatsApp\n3. Se crea tu subbot personal\n\n⚠️ *Solo para administradores*',
    help_code: '🔑 *Comando: /code*\n\nCrea subbot con código de emparejamiento.\n\n*Uso:*\n/code <número>\n\n*Ejemplo:*\n/code 34612345678\n\n*Proceso:*\n1. Envías tu número\n2. Recibes código en WhatsApp\n3. Introduces el código\n\n⚠️ *Solo para administradores*',
    help_mybots: '🤖 *Comando: /mybots*\n\nVer tus subbots activos.\n\n*Uso:*\n/mybots\n\n*Información mostrada:*\n• Lista de tus subbots\n• Estado (activo/inactivo)\n• Tiempo de actividad'
  };

  const helpText = helpTexts[category];
  if (helpText) {
    return { text: helpText };
  }

  return { text: '❌ No se encontró información para esa opción. Usa /help para ver el menú.' };
}


// Función eliminada - Todo centralizado en handleHelpCommand

// ===== COMANDOS REGISTRADOS AUTOMÁTICAMENTE =====
// Los comandos se registran automáticamente en initializePluginSystem()


// =========================
// Funciones de envío de resultados
// =========================

async function sendResult(sock, jid, result, ctx) {
  if (!sock || !jid) return;
  try {
    const showPresence = process.env.SHOW_TYPING === 'true';
    if (showPresence) {
      await sock.sendPresenceUpdate('composing', jid).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!result) {
      if (showPresence) await sock.sendPresenceUpdate('paused', jid).catch(() => {});
      return;
    }
    if (result.success === true && !result.text && !result.message) {
      if (showPresence) await sock.sendPresenceUpdate('paused', jid).catch(() => {});
      return;
    }
    if (typeof result === 'string') {
      await sock.sendMessage(jid, { text: result });
      if (showPresence) await sock.sendPresenceUpdate('paused', jid).catch(() => {});
      return;
    }
    if (result.type === 'audio' && result.audio) {
      await sock.sendMessage(jid, {
        audio: result.audio,
        mimetype: result.mimetype || 'audio/mpeg',
        caption: result.caption,
        contextInfo: result.mentions ? { mentionedJid: result.mentions } : undefined
      });
      return;
    }
    if (result.type === 'video' && result.video) {
      await sock.sendMessage(jid, {
        video: result.video,
        mimetype: result.mimetype || 'video/mp4',
        caption: result.caption,
        contextInfo: result.mentions ? { mentionedJid: result.mentions } : undefined
      });
      return;
    }
    if (result.type === 'image' && result.image) {
      await sock.sendMessage(jid, {
        image: result.image,
        caption: result.caption,
        contextInfo: result.mentions ? { mentionedJid: result.mentions } : undefined
      });
      return;
    }
    if (result.type === 'buttons') {
      const payload = createButtonMenu(result);
      await sock.sendMessage(jid, payload);
      return;
    }
    if (result.type === 'list') {
      await sendListFixedV2(sock, jid, result, ctx);
      return;
    }
    const message = result.message || result.text || '✅ Listo';
    await sock.sendMessage(jid, { text: message });
  } catch (error) {
    logger.error("Error enviando resultado", error?.message);
  }
}

function buildSendOptions(result, ctx) {
  const opts = {};
  if (result.quoted && ctx?.message) {
    opts.quoted = ctx.message;
  }
  if (result.mentions && Array.isArray(result.mentions)) {
    opts.contextInfo = opts.contextInfo || {};
    opts.contextInfo.mentionedJid = result.mentions;
  }
  return opts;
}

async function sendListFixedV2(sock, jid, result, ctx) {
  const opts = buildSendOptions(result, ctx);

  // Extraer todas las opciones de las secciones
  const allRows = [];
  for (const sec of result.sections || []) {
    for (const r of sec.rows || []) {
      allRows.push({
        title: r.title || 'Opción',
        description: r.description || '',
        rowId: r.rowId || r.id || 'noop'
      });
    }
  }

  // SOLO TEXTO PLANO - Sin interactivos
  let txt = `${result.text || 'Menú'}\n\n`;
  txt += `*📋 OPCIONES DISPONIBLES*\n\n`;

  let num = 1;
  for (const sec of result.sections || []) {
    if (sec.title) {
      txt += `*${sec.title}*\n`;
    }
    for (const r of sec.rows || []) {
      txt += `${num}️⃣ ${r.title}\n`;
      if (r.description) txt += `   ${r.description}\n`;
      txt += `   Comando: *${r.rowId || r.id}*\n\n`;
      num++;
    }
  }

  txt += `\n💡 *Cómo usar:*\n`;
  txt += `Escribe el comando directamente.\n`;
  txt += `Ejemplo: *cat_descargas*\n\n`;
  txt += `${result.footer || 'KONMI BOT © 2025'}`;

  try {
    await sock.sendMessage(jid, { text: txt }, opts);
    return true;
  } catch (err) {
    logger.error('Error enviando mensaje', err?.message);
    return false;
  }
}


// =========================
// Sistema de Reacciones Automáticas (Wileys)
// =========================



// =========================
// Dispatch principal
// =========================

export async function dispatch(ctx = {}, runtimeContext = {}) {
  const { sock, remoteJid, isGroup, sender } = ctx;
  if (!sock || !remoteJid) return false;
  const effectiveCtx = { ...ctx, ...runtimeContext };

  try {
    const text = (ctx.text != null ? String(ctx.text) : extractText(ctx.message));
    const { command, args } = parseCommand(text);
    // Command parsed

    if (!command) return false;

    const alwaysAllowedCommands = [
      'bot', 'status', 'ping', 'help', 'ayuda', 'menu', 'comandos',
      'cat_descargas', 'cat_ia', 'cat_interactivo', 'cat_media', 'cat_utilidades', 'cat_grupo', 'cat_admin',
      'cat_entretenimiento', 'cat_archivos', 'cat_aportes', 'cat_subbots',
      'help_play', 'help_video', 'help_tiktok', 'help_instagram', 'help_spotify',
      'help_ia', 'help_image', 'help_clasificar', 'help_sticker', 'help_meme',
      'help_quote', 'help_translate', 'help_weather', 'help_ping', 'help_bot',
      'help_groupinfo', 'help_qr', 'help_code', 'help_mybots', 'help_menu'
    ];

    if (!alwaysAllowedCommands.includes(command.toLowerCase())) {
      if (isGroup) {
        const groupActive = await getGroupBool(remoteJid, 'active', true);
        if (groupActive === false) {
          return false;
        }
      } else {
        const botActive = await isBotGloballyActive();
        if (!botActive) {
          return false;
        }
      }
    } else {
      // Command always allowed
    }

    const commandConfig = commandMap.get(command.toLowerCase());
    // Command config loaded

    if (!commandConfig) {
      return false;
    }

    if (commandConfig.admin) {
      const userPhone = normalizePhone(sender || ctx.participant || remoteJid);
      const isAdmin = await isSuperAdmin(userPhone);
      if (!isAdmin) {
        await sock.sendMessage(remoteJid, {
          text: '❌ No tienes permisos para usar este comando.'
        });
        return true;
      }
    }

    let handler = null;

    if (commandConfig.isLocal && typeof commandConfig.handler === 'function') {
      handler = commandConfig.handler;
    } else {
      const module = await loadCommandModule(commandConfig.moduleName || commandConfig.handler, command);

      if (!module || !module.handler) {
        await sock.sendMessage(remoteJid, {
          text: `⚠️ Comando "${command}" no disponible temporalmente.`
        });
        return true;
      }
      handler = module.handler;
    }

    if (!handler) {
      await sock.sendMessage(remoteJid, {
        text: `⚠️ Comando "${command}" no disponible.`
      });
      return true;
    }

    const params = {
      ...effectiveCtx,
      text,
      command: commandConfig.name || command,
      args,
      commandConfig
    };

    const startTime = Date.now();
    const result = await handler(params, commandMap);
    await sendResult(sock, remoteJid, result, ctx);
    const endTime = Date.now();

    // Log de comando ejecutado con recuadro detallado
    let chatName = 'Chat';
    if (isGroup && remoteJid) {
      try {
        const groupMetadata = await sock.groupMetadata(remoteJid).catch(() => null);
        chatName = groupMetadata?.subject || 'Grupo';
      } catch (e) {
        chatName = 'Grupo';
      }
    } else {
      chatName = ctx.pushName || 'Usuario';
    }

    const commandData = {
      comando: command,
      usuario: ctx.pushName || 'Usuario',
      chat: chatName,
      chatIcon: isGroup ? '[GROUP]' : '[PRIVATE]',
      resultado: result?.success !== false ? 'EXITOSO' : 'ERROR',
      exitoso: result?.success !== false,
      tiempo: `${endTime - startTime}ms`
    };

    logger.commandBox(commandData);
    return true;

  } catch (error) {
    console.error("Error in dispatch:", error);
    try {
      await sock.sendMessage(remoteJid, {
        text: `[ERROR] Error ejecutando el comando: ${error?.message || error}`
      });
    } catch (e) {
      // ignore
    }
    return true;
  }
}


// =========================
// IA (Gemini) y adaptador de compatibilidad
// =========================

export async function chatWithAI(message, context = "panel") {
  const prompt = String(message || "").trim()
  if (!prompt) {
    return { success: false, error: "Texto vacio" }
  }
  if (!hasGeminiApiKey()) {
    return { success: false, error: "GEMINI_API_KEY no configurada" }
  }
  try {
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash"
    const model = getGeminiModel(modelName)
    const systemPrefix =
      "Eres el asistente del panel de administracion de KONMI BOT. Responde en español, claro y directo.\n\n"
    const fullPrompt = `${systemPrefix}Contexto: ${context}\n\nUsuario: ${prompt}`
    const result = await model.generateContent(fullPrompt)
    const text = (await result.response).text()
    return {
      success: true,
      response: text || "",
      model: modelName,
    }
  } catch (err) {
    const msg =
      err?.response?.data?.error?.message ||
      err?.message ||
      String(err)
    return { success: false, error: msg }
  }
}

export async function analyzeManhwaContent(text) {
  const prompt = String(text || "").trim()
  if (!prompt) {
    return { success: false, error: "Texto vacio" }
  }
  if (!hasGeminiApiKey()) {
    return { success: false, error: "GEMINI_API_KEY no configurada" }
  }
  try {
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash"
    const model = getGeminiModel(modelName)
    const instruction = [
      "Analiza este texto relacionado con contenido tipo manhwa/manga.",
      "Devuelve SOLO un JSON con las claves:",
      "{",
      '  "titulo": string,',
      '  "tipo": string,',
      '  "capitulo": string | null,',
      '  "confianza": number (0-100)',
      "}",
      "Sin explicaciones adicionales.",
    ].join("\n")
    const fullPrompt = `${instruction}\n\nTexto:\n${prompt}`
    const result = await model.generateContent(fullPrompt)
    const raw = (await result.response).text()
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = {}
    }
    const analysis = {
      titulo: parsed.titulo || "",
      tipo: parsed.tipo || "extra",
      capitulo: parsed.capitulo || null,
      confianza: Number(parsed.confianza || 50),
    }
    return { success: true, analysis, raw }
  } catch (err) {
    const msg =
      err?.response?.data?.error?.message ||
      err?.message ||
      String(err)
    return { success: false, error: msg }
  }
}

export async function analyzeContentWithAI(text, context = "") {
  const prompt = String(text || "").trim()
  if (!prompt) {
    return { success: false, error: "Texto vacio" }
  }
  if (!hasGeminiApiKey()) {
    return { success: false, error: "GEMINI_API_KEY no configurada" }
  }
  try {
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash"
    const model = getGeminiModel(modelName)
    const instruction = [
      "Analiza el siguiente contenido y clasificalo.",
      "Devuelve SOLO un JSON con las claves:",
      "{",
      '  "titulo": string,',
      '  "tipo": string,',
      '  "capitulo": string | null,',
      '  "confianza": number (0-100)',
      "}",
      "Sin explicaciones adicionales.",
    ].join("\n")
    const fullPrompt = `${instruction}\n\nContexto: ${context}\n\nTexto:\n${prompt}`
    const result = await model.generateContent(fullPrompt)
    const raw = (await result.response).text()
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = {}
    }
    const analysis = {
      titulo: parsed.titulo || "",
      tipo: parsed.tipo || "extra",
      capitulo: parsed.capitulo || null,
      confianza: Number(parsed.confianza || 50),
    }
    return { success: true, analysis, raw }
  } catch (err) {
    const msg =
      err?.response?.data?.error?.message ||
      err?.message ||
      String(err)
    return { success: false, error: msg }
  }
}

// =========================
// COMANDOS DE UTILIDADES
// =========================

// Funcionalidades Wileys completas + Temática BL integrada
const addBLUtilsReaction = async (sock, message, type = 'utils') => {
  try {
    if (!sock || !message?.key) return;

    const reactionSequences = {
      utils: ['🛠️', '💖', '✨'],
      calc: ['🧮', '💕', '🌸'],
      password: ['🔐', '✨', '💝'],
      qrcode: ['📱', '🌟', '💖'],
      short: ['🔗', '💫', '🌸']
    };

    const sequence = reactionSequences[type] || reactionSequences.utils;

    for (let i = 0; i < sequence.length; i++) {
      setTimeout(async () => {
        await sock.sendMessage(message.key.remoteJid, {
          react: { text: sequence[i], key: message.key }
        });
      }, i * 1000);
    }
  } catch (error) {
    console.error('[BL_UTILS_REACTION] Error:', error);
  }
};

// Decoración BL para mensajes de utilidades
const decorateBLUtilsMessage = (title, content, style = 'love') => {
  const styles = {
    love: {
      header: '╔💖═══════════════════════════════════════💖╗',
      footer: '╚💖═══════════════════════════════════════💖╝',
      bullet: '💖'
    },
    utils: {
      header: '╔🛠️═══════════════════════════════════════🛠️╗',
      footer: '╚🛠️═══════════════════════════════════════🛠️╝',
      bullet: '🛠️'
    },
    success: {
      header: '╔✅═══════════════════════════════════════✅╗',
      footer: '╚✅═══════════════════════════════════════✅╝',
      bullet: '✅'
    }
  };

  const currentStyle = styles[style] || styles.love;
  let message = currentStyle.header + '\n';
  message += `║           ${title.padEnd(37)}║\n`;
  message += '║                                     ║\n';

  if (Array.isArray(content)) {
    content.forEach(item => {
      message += `║ ${currentStyle.bullet} ${item.padEnd(35)}║\n`;
    });
  } else {
    const lines = content.split('\n');
    lines.forEach(line => {
      message += `║ ${line.padEnd(37)}║\n`;
    });
  }

  message += currentStyle.footer;
  return message;
};

// Calculadora con evaluación segura
export async function calc(ctx) {
  const { args, sock, message } = ctx;
  const expression = args.join(' ').trim();

  if (!expression) {
    return {
      success: false,
      message: decorateBLUtilsMessage('Calculadora', 'Uso: /calc <operación>\nEjemplo: /calc 2 + 2 * 3', 'utils')
    };
  }

  await addBLUtilsReaction(sock, message, 'calc');

  try {
    const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');

    if (!sanitized || sanitized.length === 0) {
      return {
        success: false,
        message: decorateBLUtilsMessage('Error', 'Operación inválida\n🥺 Solo números y operadores básicos', 'love')
      };
    }

    if (/[a-zA-Z]/.test(sanitized)) {
      return {
        success: false,
        message: decorateBLUtilsMessage('Error', 'Solo números y operadores\n🥺 No se permiten letras', 'love')
      };
    }

    const result = Function(`"use strict"; return (${sanitized})`)();

    if (!isFinite(result)) {
      return {
        success: false,
        message: decorateBLUtilsMessage('Error', 'Resultado inválido\n🥺 División por cero o overflow', 'love')
      };
    }

    const calcContent = [
      `Operación: ${expression}`,
      `Resultado: ${result}`,
      '',
      '💡 Operadores disponibles:',
      '+ (suma) - (resta) * (multiplicación)',
      '/ (división) () (paréntesis)'
    ];

    return {
      success: true,
      message: decorateBLUtilsMessage('Calculadora', calcContent, 'success')
    };
  } catch (error) {
    return {
      success: false,
      message: decorateBLUtilsMessage('Error', 'Operación inválida\n🥺 Verifica la sintaxis', 'love')
    };
  }
}

// Generador de contraseñas
export async function password(ctx) {
  const { args, sock, message } = ctx;
  const length = parseInt(args[0]) || 12;

  if (length < 4 || length > 50) {
    return {
      success: false,
      message: decorateBLUtilsMessage('Generador de Contraseñas', 'Uso: /password <longitud>\nLongitud: 4-50 caracteres\nEjemplo: /password 16', 'utils')
    };
  }

  await addBLUtilsReaction(sock, message, 'password');

  try {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';

    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const strength = length >= 16 ? 'Muy fuerte' : length >= 12 ? 'Fuerte' : length >= 8 ? 'Media' : 'Débil';

    const passwordContent = [
      `Contraseña generada:`,
      `${password}`,
      '',
      `Longitud: ${length} caracteres`,
      `Fortaleza: ${strength}`,
      '🔐 Incluye mayúsculas, minúsculas,',
      'números y símbolos especiales',
      '',
      '💡 Guárdala en un lugar seguro'
    ];

    return {
      success: true,
      message: decorateBLUtilsMessage('Contraseña Generada', passwordContent, 'success'),
      data: { password, strength }
    };
  } catch (error) {
    return {
      success: false,
      message: decorateBLUtilsMessage('Error', 'No se pudo generar la contraseña\n🥺 Intenta de nuevo', 'love')
    };
  }
}

// Generador de código QR real
export async function qrcode(ctx) {
  const { args, sock, message, remoteJid } = ctx;
  const text = args.join(' ').trim();

  if (!text) {
    return {
      success: false,
      message: decorateBLUtilsMessage('Generador QR', 'Uso: /qrcode <texto>\nEjemplo: /qrcode https://google.com', 'utils')
    };
  }

  await addBLUtilsReaction(sock, message, 'qrcode');

  try {
    const qrImageBuffer = await QRCode.toBuffer(text, {
      type: 'png',
      width: 512,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'M'
    });

    await sock.sendMessage(remoteJid, {
      image: qrImageBuffer,
      caption: decorateBLUtilsMessage('Código QR Generado', [
        `Texto codificado:`,
        `${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`,
        '',
        '📱 Escanea con tu cámara',
        '✨ Funciona con cualquier lector QR',
        '',
        `Tamaño: ${Math.round(qrImageBuffer.length / 1024)}KB`,
        '💖 Generado con amor'
      ], 'success')
    });

    return {
      success: true,
      message: null,
      data: { qrGenerated: true, size: qrImageBuffer.length }
    };
  } catch (error) {
    return {
      success: false,
      message: decorateBLUtilsMessage('Error', `No se pudo generar el QR\n🥺 Error: ${error.message}`, 'love')
    };
  }
}

// Acortador de URLs
export async function short(ctx) {
  const { args, sock, message } = ctx;
  const url = args[0];

  if (!url || !/^https?:\/\/.+/.test(url)) {
    return {
      success: false,
      message: decorateBLUtilsMessage('Acortador de URLs', 'Uso: /short <url>\nEjemplo: /short https://google.com\n🥺 Debe ser una URL válida', 'utils')
    };
  }

  await addBLUtilsReaction(sock, message, 'short');

  try {
    const response = await axios.post('https://is.gd/create.php', null, {
      params: {
        format: 'simple',
        url: url
      },
      timeout: 10000
    });

    const shortUrl = response.data.trim();

    if (!/^https?:\/\/.+/.test(shortUrl)) {
      throw new Error('Respuesta inválida del servicio');
    }

    const shortContent = [
      `URL original:`,
      `${url.substring(0, 40)}${url.length > 40 ? '...' : ''}`,
      '',
      `URL acortada:`,
      `${shortUrl}`,
      '',
      '🔗 Más fácil de compartir',
      '📊 Servicio: is.gd',
      '✨ Permanente y confiable'
    ];

    return {
      success: true,
      message: decorateBLUtilsMessage('URL Acortada', shortContent, 'success'),
      data: { originalUrl: url, shortUrl }
    };
  } catch (error) {
    const shortCode = Math.random().toString(36).substring(2, 8);
    const fallbackUrl = `https://short.ly/${shortCode}`;

    const shortContent = [
      `URL original:`,
      `${url.substring(0, 40)}${url.length > 40 ? '...' : ''}`,
      '',
      `URL simulada:`,
      `${fallbackUrl}`,
      '',
      '⚠️ Servicio no disponible',
      '🔗 URL simulada generada'
    ];

    return {
      success: true,
      message: decorateBLUtilsMessage('URL Simulada', shortContent, 'love'),
      data: { originalUrl: url, shortUrl: fallbackUrl, simulated: true }
    };
  }
}

// Validador de email
export async function email(ctx) {
  const { args, sock, message } = ctx;
  const emailAddress = args[0];

  if (!emailAddress) {
    return {
      success: false,
      message: decorateBLUtilsMessage('Validador de Email', 'Uso: /email <correo>\nEjemplo: /email usuario@gmail.com', 'utils')
    };
  }

  await addBLUtilsReaction(sock, message, 'utils');

  try {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(emailAddress);
    const domain = emailAddress.split('@')[1];

    const checks = {
      format: isValid,
      domain: domain ? /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain) : false,
      length: emailAddress.length <= 254,
      localPart: emailAddress.split('@')[0]?.length <= 64
    };

    const allValid = Object.values(checks).every(check => check);

    const emailContent = [
      `Email: ${emailAddress}`,
      '',
      `Estado: ${allValid ? '✅ Válido' : '❌ Inválido'}`,
      `Formato: ${checks.format ? '✅' : '❌'}`,
      `Dominio: ${checks.domain ? '✅' : '❌'}`,
      `Longitud: ${checks.length ? '✅' : '❌'}`,
      '',
      allValid ? '💖 Email completamente válido' : '🥺 Revisa los errores marcados',
      allValid ? '📧 Puede recibir correos' : '💡 Corrige el formato'
    ];

    return {
      success: true,
      message: decorateBLUtilsMessage('Validación de Email', emailContent, allValid ? 'success' : 'love'),
      data: { email: emailAddress, valid: allValid, checks }
    };
  } catch (error) {
    return {
      success: false,
      message: decorateBLUtilsMessage('Error', `Error validando email\n🥺 ${error.message}`, 'love')
    };
  }
}

// Información de color
export async function color(ctx) {
  const { args, sock, message } = ctx;
  const colorInput = args.join(' ').trim();

  if (!colorInput) {
    return {
      success: false,
      message: decorateBLUtilsMessage('Información de Color', 'Uso: /color <código>\nEjemplo: /color #FF0000\n/color red', 'utils')
    };
  }

  await addBLUtilsReaction(sock, message, 'utils');

  try {
    const colors = {
      'red': { hex: '#FF0000', rgb: '255, 0, 0', name: 'Rojo' },
      'blue': { hex: '#0000FF', rgb: '0, 0, 255', name: 'Azul' },
      'green': { hex: '#00FF00', rgb: '0, 255, 0', name: 'Verde' },
      'yellow': { hex: '#FFFF00', rgb: '255, 255, 0', name: 'Amarillo' },
      'purple': { hex: '#800080', rgb: '128, 0, 128', name: 'Púrpura' },
      'orange': { hex: '#FFA500', rgb: '255, 165, 0', name: 'Naranja' },
      'pink': { hex: '#FFC0CB', rgb: '255, 192, 203', name: 'Rosa' },
      'black': { hex: '#000000', rgb: '0, 0, 0', name: 'Negro' },
      'white': { hex: '#FFFFFF', rgb: '255, 255, 255', name: 'Blanco' }
    };

    let colorInfo;
    if (colorInput.startsWith('#')) {
      colorInfo = { hex: colorInput, name: 'Color personalizado' };
    } else {
      colorInfo = colors[colorInput.toLowerCase()];
    }

    if (!colorInfo) {
      return {
        success: false,
        message: decorateBLUtilsMessage('Error', 'Color no reconocido\n🥺 Usa nombres básicos o códigos hex', 'love')
      };
    }

    const colorContent = [
      `Color: ${colorInfo.name}`,
      `Hex: ${colorInfo.hex}`,
      colorInfo.rgb ? `RGB: ${colorInfo.rgb}` : '',
      '',
      '🎨 Información del color',
      '💖 Perfecto para diseño'
    ].filter(Boolean);

    return {
      success: true,
      message: decorateBLUtilsMessage('Información de Color', colorContent, 'success'),
      data: colorInfo
    };
  } catch (error) {
    return {
      success: false,
      message: decorateBLUtilsMessage('Error', `Color no reconocido\n🥺 ${error.message}`, 'love')
    };
  }
}

// Zona horaria
export async function timezone(ctx) {
  const { args, sock, message } = ctx;
  const zone = args.join(' ').trim();

  if (!zone) {
    return {
      success: false,
      message: decorateBLUtilsMessage('Zona Horaria', 'Uso: /timezone <zona>\nEjemplo: /timezone Madrid\n/timezone list (para ver zonas)', 'utils')
    };
  }

  await addBLUtilsReaction(sock, message, 'utils');

  try {
    if (zone.toLowerCase() === 'list') {
      const popularZones = [
        'Madrid (+1)', 'Londres (+0)', 'Nueva York (-5)',
        'Los Ángeles (-8)', 'Tokio (+9)', 'Sídney (+10)',
        'México (-6)', 'Buenos Aires (-3)', 'París (+1)'
      ];

      return {
        success: true,
        message: decorateBLUtilsMessage('Zonas Horarias Populares', popularZones, 'utils')
      };
    }

    const timezones = {
      'madrid': { offset: '+1', name: 'Madrid, España' },
      'london': { offset: '+0', name: 'Londres, Reino Unido' },
      'new york': { offset: '-5', name: 'Nueva York, EE.UU.' },
      'tokyo': { offset: '+9', name: 'Tokio, Japón' },
      'sydney': { offset: '+10', name: 'Sídney, Australia' },
      'mexico': { offset: '-6', name: 'Ciudad de México' },
      'buenos aires': { offset: '-3', name: 'Buenos Aires, Argentina' }
    };

    const timezoneInfo = timezones[zone.toLowerCase()];

    if (!timezoneInfo) {
      return {
        success: false,
        message: decorateBLUtilsMessage('Error', 'Zona horaria no encontrada\n🥺 Usa /timezone list para ver opciones', 'love')
      };
    }

    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    const targetTime = new Date(utcTime + (parseInt(timezoneInfo.offset) * 3600000));

    const timezoneContent = [
      `Zona: ${timezoneInfo.name}`,
      `Hora actual: ${targetTime.toLocaleString('es-ES')}`,
      `Offset UTC: ${timezoneInfo.offset}`,
      `Día: ${targetTime.toLocaleDateString('es-ES', { weekday: 'long' })}`,
      '',
      '🌍 Información de zona horaria',
      '⏰ Hora calculada'
    ];

    return {
      success: true,
      message: decorateBLUtilsMessage('Información de Zona Horaria', timezoneContent, 'success'),
      data: {
        zone: timezoneInfo.name,
        time: targetTime.toISOString(),
        offset: timezoneInfo.offset
      }
    };
  } catch (error) {
    return {
      success: false,
      message: decorateBLUtilsMessage('Error', `Error procesando zona horaria\n🥺 ${error.message}`, 'love')
    };
  }
}

// =========================
// COMANDOS DE ENTRETENIMIENTO
// =========================

const addBLEntertainmentReaction = async (sock, message, type = 'fun') => {
  try {
    if (!sock || !message?.key) return;

    const reactionSequences = {
      fun: ['😂', '💖', '✨'],
      joke: ['🤣', '💕', '🌸'],
      horoscope: ['🔮', '✨', '💝'],
      meme: ['😂', '🌟', '💖']
    };

    const sequence = reactionSequences[type] || reactionSequences.fun;

    for (let i = 0; i < sequence.length; i++) {
      setTimeout(async () => {
        await sock.sendMessage(message.key.remoteJid, {
          react: { text: sequence[i], key: message.key }
        });
      }, i * 1000);
    }
  } catch (error) {
    console.error('[BL_ENTERTAINMENT_REACTION] Error:', error);
  }
};

const decorateBLEntertainmentMessage = (title, content, style = 'love') => {
  const styles = {
    love: {
      header: '╔💖═══════════════════════════════════════💖╗',
      footer: '╚💖═══════════════════════════════════════💖╝',
      bullet: '💖'
    },
    fun: {
      header: '╔😂═══════════════════════════════════════😂╗',
      footer: '╚😂═══════════════════════════════════════😂╝',
      bullet: '😂'
    },
    magic: {
      header: '╔🔮═══════════════════════════════════════🔮╗',
      footer: '╚🔮═══════════════════════════════════════🔮╝',
      bullet: '🔮'
    }
  };

  const currentStyle = styles[style] || styles.love;
  let message = currentStyle.header + '\n';
  message += `║           ${title.padEnd(37)}║\n`;
  message += '║                                     ║\n';

  if (Array.isArray(content)) {
    content.forEach(item => {
      message += `║ ${currentStyle.bullet} ${item.padEnd(35)}║\n`;
    });
  } else {
    const lines = content.split('\n');
    lines.forEach(line => {
      message += `║ ${line.padEnd(37)}║\n`;
    });
  }

  message += currentStyle.footer;
  return message;
};

// Chistes aleatorios
export async function joke(ctx) {
  const { sock, message } = ctx;

  await addBLEntertainmentReaction(sock, message, 'joke');

  try {
    let jokeData = null;
    let source = 'Local';

    try {
      const response = await axios.get('https://v2.jokeapi.dev/joke/Programming,Miscellaneous', {
        params: {
          blacklistFlags: 'nsfw,religious,political,racist,sexist,explicit',
          type: 'twopart',
          lang: 'en'
        },
        timeout: 5000
      });

      if (response.data && response.data.setup && response.data.delivery) {
        jokeData = {
          setup: response.data.setup,
          punchline: response.data.delivery,
          source: 'JokesAPI'
        };
      }
    } catch (apiError) {
      // Fallback a chistes locales
    }

    const localJokes = [
      {
        setup: '¿Por qué los programadores prefieren el modo oscuro?',
        punchline: 'Porque la luz atrae a los bugs! 🐛',
        source: 'Local'
      },
      {
        setup: '¿Qué le dice un bit a otro bit?',
        punchline: 'Nos vemos en el byte! 💻',
        source: 'Local'
      },
      {
        setup: '¿Por qué HTML y CSS rompieron?',
        punchline: 'Porque no tenían química! ⚗️',
        source: 'Local'
      },
      {
        setup: '¿Cómo se llama un perro programador?',
        punchline: 'Labrador! 🐕‍🦺',
        source: 'Local'
      }
    ];

    const selectedJoke = jokeData || localJokes[Math.floor(Math.random() * localJokes.length)];

    const jokeContent = [
      selectedJoke.setup,
      '',
      selectedJoke.punchline,
      '',
      '😂 ¡Espero que te haya gustado!',
      `📡 Fuente: ${selectedJoke.source}`,
      '💖 Usa /joke para otro chiste'
    ];

    return {
      success: true,
      message: decorateBLEntertainmentMessage('Chiste del Día', jokeContent, 'fun'),
      data: { joke: selectedJoke, source: selectedJoke.source }
    };
  } catch (error) {
    return {
      success: false,
      message: decorateBLEntertainmentMessage('Error', `No se pudo obtener un chiste\n🥺 ${error.message}`, 'love')
    };
  }
}

// Horóscopo
export async function horoscope(ctx) {
  const { args, sock, message } = ctx;
  const sign = args[0]?.toLowerCase();

  if (!sign) {
    return {
      success: false,
      message: decorateBLEntertainmentMessage('Horóscopo', 'Uso: /horoscope <signo>\nEjemplo: /horoscope aries\n\nSignos disponibles:\naries, tauro, geminis, cancer,\nleo, virgo, libra, escorpio,\nsagitario, capricornio,\nacuario, piscis', 'magic')
    };
  }

  await addBLEntertainmentReaction(sock, message, 'horoscope');

  const signMap = {
    'aries': { emoji: '♈', dates: 'Mar 21 - Apr 19' },
    'tauro': { emoji: '♉', dates: 'Apr 20 - May 20' },
    'geminis': { emoji: '♊', dates: 'May 21 - Jun 20' },
    'cancer': { emoji: '♋', dates: 'Jun 21 - Jul 22' },
    'leo': { emoji: '♌', dates: 'Jul 23 - Aug 22' },
    'virgo': { emoji: '♍', dates: 'Aug 23 - Sep 22' },
    'libra': { emoji: '♎', dates: 'Sep 23 - Oct 22' },
    'escorpio': { emoji: '♏', dates: 'Oct 23 - Nov 21' },
    'sagitario': { emoji: '♐', dates: 'Nov 22 - Dec 21' },
    'capricornio': { emoji: '♑', dates: 'Dec 22 - Jan 19' },
    'acuario': { emoji: '♒', dates: 'Jan 20 - Feb 18' },
    'piscis': { emoji: '♓', dates: 'Feb 19 - Mar 20' }
  };

  const signData = signMap[sign];

  if (!signData) {
    return {
      success: false,
      message: decorateBLEntertainmentMessage('Error', 'Signo no reconocido 🥺\nVerifica la ortografía\nEjemplo: aries, leo, piscis', 'love')
    };
  }

  try {
    const today = new Date();
    const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));

    const predictions = [
      'Hoy es un día perfecto para nuevos comienzos. Tu energía está en su punto máximo.',
      'La paciencia será tu mejor aliada hoy. Las cosas buenas llegan a quienes esperan.',
      'Tu curiosidad te llevará a descubrir algo interesante. Mantén la mente abierta.',
      'Las emociones están a flor de piel. Confía en tu intuición para tomar decisiones.',
      'Tu carisma natural brillará hoy. Es un buen momento para liderar proyectos.',
      'La organización y el detalle serán clave para el éxito de hoy.',
      'Busca el equilibrio en todas las áreas de tu vida. La armonía es posible.',
      'Tu intensidad emocional te dará la fuerza para superar cualquier obstáculo.'
    ];

    const horoscopeText = predictions[dayOfYear % predictions.length];
    const luckyNumber = ((dayOfYear + sign.length) % 99) + 1;

    const aspects = {
      love: ['Conexiones profundas', 'Pasión renovada', 'Comunicación fluida', 'Estabilidad emocional'][dayOfYear % 4],
      work: ['Oportunidades nuevas', 'Reconocimiento merecido', 'Proyectos exitosos', 'Colaboración efectiva'][dayOfYear % 4]
    };

    const horoscopeContent = [
      `${signData.emoji} ${sign.toUpperCase()}`,
      `Fechas: ${signData.dates}`,
      `Fecha: ${today.toLocaleDateString('es-ES')}`,
      '',
      horoscopeText,
      '',
      `💕 Amor: ${aspects.love}`,
      `💼 Trabajo: ${aspects.work}`,
      `🍀 Número de la suerte: ${luckyNumber}`,
      '',
      '✨ Que tengas un día mágico'
    ];

    return {
      success: true,
      message: decorateBLEntertainmentMessage('Tu Horóscopo', horoscopeContent, 'magic'),
      data: {
        sign: sign,
        date: today.toISOString().split('T')[0],
        prediction: horoscopeText,
        luckyNumber,
        aspects
      }
    };
  } catch (error) {
    return {
      success: false,
      message: decorateBLEntertainmentMessage('Error', `Error obteniendo horóscopo\n🥺 ${error.message}`, 'love')
    };
  }
}

// Datos curiosos
export async function fact(ctx) {
  const { sock, message } = ctx;

  await addBLEntertainmentReaction(sock, message, 'fun');

  const localFacts = [
    'Los pulpos tienen tres corazones y sangre azul.',
    'Una cucaracha puede vivir hasta una semana sin cabeza.',
    'Los delfines tienen nombres para identificarse entre ellos.',
    'El corazón de un camarón está en su cabeza.',
    'Los koalas duermen hasta 22 horas al día.',
    'Las abejas pueden reconocer rostros humanos.',
    'Los pingüinos pueden saltar hasta 2 metros de altura.',
    'El cerebro humano usa aproximadamente 20% de la energía del cuerpo.'
  ];

  const selectedFact = localFacts[Math.floor(Math.random() * localFacts.length)];

  const factContent = [
    '🤓 ¿Sabías que...?',
    '',
    selectedFact,
    '',
    '📚 Dato curioso del día',
    '💖 Usa /fact para más datos'
  ];

  return {
    success: true,
    message: decorateBLEntertainmentMessage('Dato Curioso', factContent, 'fun'),
    data: { fact: selectedFact }
  };
}

// Frases motivacionales
export async function quote(ctx) {
  const { sock, message } = ctx;

  await addBLEntertainmentReaction(sock, message, 'magic');

  const localQuotes = [
    {
      text: 'El éxito no es la clave de la felicidad. La felicidad es la clave del éxito.',
      author: 'Albert Schweitzer'
    },
    {
      text: 'La única forma de hacer un gran trabajo es amar lo que haces.',
      author: 'Steve Jobs'
    },
    {
      text: 'No cuentes los días, haz que los días cuenten.',
      author: 'Muhammad Ali'
    },
    {
      text: 'El futuro pertenece a quienes creen en la belleza de sus sueños.',
      author: 'Eleanor Roosevelt'
    }
  ];

  const selectedQuote = localQuotes[Math.floor(Math.random() * localQuotes.length)];

  const quoteContent = [
    '💭 Frase del día:',
    '',
    `"${selectedQuote.text}"`,
    '',
    `— ${selectedQuote.author}`,
    '',
    '✨ Que te inspire hoy'
  ];

  return {
    success: true,
    message: decorateBLEntertainmentMessage('Frase Inspiradora', quoteContent, 'magic'),
    data: { quote: selectedQuote }
  };
}

// =========================
// COMANDOS BÁSICOS
// =========================

const addBLBasicReaction = async (sock, message, type = 'basic') => {
  try {
    if (!sock || !message?.key) return;

    const reactionSequences = {
      basic: ['🤖', '💖', '✨'],
      ping: ['🏓', '💕', '🌸'],
      status: ['📊', '✨', '💝']
    };

    const sequence = reactionSequences[type] || reactionSequences.basic;

    for (let i = 0; i < sequence.length; i++) {
      setTimeout(async () => {
        await sock.sendMessage(message.key.remoteJid, {
          react: { text: sequence[i], key: message.key }
        });
      }, i * 1000);
    }
  } catch (error) {
    console.error('[BL_BASIC_REACTION] Error:', error);
  }
};

const decorateBLBasicMessage = (title, content, style = 'love') => {
  const styles = {
    love: {
      header: '╔💖═══════════════════════════════════════💖╗',
      footer: '╚💖═══════════════════════════════════════💖╝',
      bullet: '💖'
    },
    info: {
      header: '╔ℹ️═══════════════════════════════════════ℹ️╗',
      footer: '╚ℹ️═══════════════════════════════════════ℹ️╝',
      bullet: 'ℹ️'
    },
    success: {
      header: '╔✅═══════════════════════════════════════✅╗',
      footer: '╚✅═══════════════════════════════════════✅╝',
      bullet: '✅'
    }
  };

  const currentStyle = styles[style] || styles.love;
  let message = currentStyle.header + '\n';
  message += `║           ${title.padEnd(37)}║\n`;
  message += '║                                     ║\n';

  if (Array.isArray(content)) {
    content.forEach(item => {
      message += `║ ${currentStyle.bullet} ${item.padEnd(35)}║\n`;
    });
  } else {
    const lines = content.split('\n');
    lines.forEach(line => {
      message += `║ ${line.padEnd(37)}║\n`;
    });
  }

  message += currentStyle.footer;
  return message;
};

// Comando ping
export async function ping(ctx) {
  const { sock, message } = ctx;
  const startTime = Date.now();

  await addBLBasicReaction(sock, message, 'ping');

  const endTime = Date.now();
  const responseTime = endTime - startTime;

  const pingContent = [
    '🏓 Pong!',
    '',
    `⚡ Latencia: ${responseTime}ms`,
    `🕐 Hora: ${new Date().toLocaleTimeString('es-ES')}`,
    `📅 Fecha: ${new Date().toLocaleDateString('es-ES')}`,
    '',
    '💖 Bot funcionando correctamente',
    '✨ Sistema BL activo'
  ];

  return {
    success: true,
    message: decorateBLBasicMessage('Estado del Bot', pingContent, 'success'),
    data: { responseTime, timestamp: new Date().toISOString() }
  };
}

// Estado del sistema
export async function status(ctx) {
  const { sock, message } = ctx;

  await addBLBasicReaction(sock, message, 'status');

  try {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();

    const formatBytes = (bytes) => {
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      if (bytes === 0) return '0 Bytes';
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    };

    const formatUptime = (seconds) => {
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${days}d ${hours}h ${minutes}m`;
    };

    const statusContent = [
      `⏱️ Uptime: ${formatUptime(uptime)}`,
      `🖥️ Plataforma: ${process.platform}`,
      `🟢 Node.js: ${process.version}`,
      '',
      '💾 Memoria:',
      `  Usada: ${formatBytes(memoryUsage.heapUsed)}`,
      `  Total: ${formatBytes(memoryUsage.heapTotal)}`,
      '',
      '🤖 Bot BL funcionando perfectamente',
      '💖 Todos los sistemas operativos'
    ];

    return {
      success: true,
      message: decorateBLBasicMessage('Estado del Sistema', statusContent, 'info'),
      data: {
        uptime,
        memory: memoryUsage,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      success: false,
      message: decorateBLBasicMessage('Error', `No se pudo obtener el estado\n🥺 ${error.message}`, 'love')
    };
  }
}

// Información del usuario
export async function whoami(ctx) {
  const { sock, message, sender, pushName, remoteJid } = ctx;

  await addBLBasicReaction(sock, message, 'basic');

  try {
    const userInfo = {
      phone: sender || 'Desconocido',
      name: pushName || 'Sin nombre',
      chat: remoteJid,
      isGroup: remoteJid.endsWith('@g.us'),
      timestamp: new Date().toLocaleString('es-ES')
    };

    const whoamiContent = [
      `👤 Usuario: ${userInfo.name}`,
      `📱 Teléfono: ${userInfo.phone}`,
      `💬 Chat: ${userInfo.isGroup ? 'Grupo' : 'Privado'}`,
      `🆔 ID: ${userInfo.chat.substring(0, 20)}...`,
      `🕐 Consulta: ${userInfo.timestamp}`,
      '',
      '💖 Información de tu perfil',
      '✨ Datos actuales del sistema'
    ];

    return {
      success: true,
      message: decorateBLBasicMessage('Tu Información', whoamiContent, 'info'),
      data: userInfo
    };
  } catch (error) {
    return {
      success: false,
      message: decorateBLBasicMessage('Error', `No se pudo obtener tu información\n🥺 ${error.message}`, 'love')
    };
  }
}

// Perfil del usuario (alias de whoami)
export async function profile(ctx) {
  return whoami(ctx);
}

// Función de diagnóstico para comandos
export async function debugCommands(ctx) {
  const { sock, remoteJid } = ctx;

  const registeredCommands = Array.from(commandMap.keys()).sort();
  const localCommands = Array.from(commandMap.entries())
    .filter(([_, config]) => config.isLocal)
    .map(([cmd, _]) => cmd)
    .sort();

  const moduleCommands = Array.from(commandMap.entries())
    .filter(([_, config]) => config.moduleName)
    .map(([cmd, config]) => `${cmd} → ${config.moduleName}`)
    .sort();

  const debugInfo = [
    '🔍 DIAGNÓSTICO DE COMANDOS',
    '',
    `📊 Total registrados: ${registeredCommands.length}`,
    `🏠 Funciones locales: ${localCommands.length}`,
    `📦 Módulos externos: ${moduleCommands.length}`,
    '',
    '🏠 COMANDOS LOCALES (en handler.js):',
    localCommands.map(cmd => `• /${cmd}`).join('\n'),
    '',
    '📦 COMANDOS DE MÓDULOS:',
    moduleCommands.slice(0, 20).map(cmd => `• /${cmd}`).join('\n'),
    moduleCommands.length > 20 ? `... y ${moduleCommands.length - 20} más` : '',
    '',
    '🎯 TODOS LOS COMANDOS DISPONIBLES:',
    registeredCommands.slice(0, 30).map(cmd => `/${cmd}`).join(', '),
    registeredCommands.length > 30 ? `... y ${registeredCommands.length - 30} más` : ''
  ].filter(Boolean).join('\n');

  await sock.sendMessage(remoteJid, { text: debugInfo });

  return { success: true };
}

// Función de estadísticas del sistema
export async function systemStats(ctx) {
  const { sock, remoteJid } = ctx;

  // Estadísticas del sistema
  const totalCommands = commandMap.size;
  const totalPlugins = pluginCache.size;

  // Agrupar por categorías
  const categories = new Map();
  const pluginStats = new Map();

  for (const [cmd, config] of commandMap.entries()) {
    // Estadísticas por categoría
    const category = config.category || 'Sin categoría';
    if (!categories.has(category)) {
      categories.set(category, { count: 0, commands: [] });
    }
    categories.get(category).count++;
    categories.get(category).commands.push(cmd);

    // Estadísticas por plugin
    const plugin = config.plugin || config.moduleName || 'local';
    if (!pluginStats.has(plugin)) {
      pluginStats.set(plugin, 0);
    }
    pluginStats.get(plugin)++;
  }

  let statsText = `╔💖═══════════════════════════════════════💖╗\n`;
  statsText += `║           ESTADÍSTICAS DEL SISTEMA      ║\n`;
  statsText += `╚💖═══════════════════════════════════════💖╝\n\n`;

  statsText += `📊 **RESUMEN GENERAL**\n`;
  statsText += `🔧 Plugins cargados: ${totalPlugins}\n`;
  statsText += `⚡ Comandos registrados: ${totalCommands}\n`;
  statsText += `🏷️ Categorías: ${categories.size}\n\n`;

  statsText += `📂 **TOP CATEGORÍAS**\n`;
  const sortedCategories = Array.from(categories.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);

  sortedCategories.forEach(([category, data]) => {
    statsText += `• ${category}: ${data.count} comandos\n`;
  });

  statsText += `\n🔌 **TOP PLUGINS**\n`;
  const sortedPlugins = Array.from(pluginStats.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  sortedPlugins.forEach(([plugin, count]) => {
    statsText += `• ${plugin}: ${count} comandos\n`;
  });

  statsText += `\n✨ **ESTADO DEL SISTEMA**\n`;
  statsText += `🟢 Sistema: Operativo\n`;
  statsText += `🟢 Auto-discovery: Activo\n`;
  statsText += `🟢 BL Theme: Integrado\n`;
  statsText += `🟢 Wileys: Funcional\n\n`;

  statsText += `💖 Sistema completamente funcional 💖`;

  await sock.sendMessage(remoteJid, { text: statsText });
  return { success: true };
}

// Adaptador para mantener compatibilidad con la API anterior
export async function routeCommand(ctx = {}) {
  const handled = await dispatch(ctx);
  return { handled: !!handled };
}
