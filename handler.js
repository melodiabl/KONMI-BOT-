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

const COMMAND_FUNCTION_MAP = {
  // Descargas
  'play': 'handleMusicDownload',
  'music': 'handleMusicDownload',
  'video': 'handleVideoDownload',
  'youtube': 'handleVideoDownload',
  'tiktok': 'handleTikTokDownload',
  'instagram': 'handleInstagramDownload',
  'ig': 'handleInstagramDownload',
  'facebook': 'handleFacebookDownload',
  'fb': 'handleFacebookDownload',
  'twitter': 'handleTwitterDownload',
  'x': 'handleTwitterDownload',
  'pinterest': 'handlePinterestDownload',
  'spotify': 'handleSpotifySearch',
  // Descargas avanzadas (Wileys)
  'soundcloud': 'soundcloud',
  'reddit': 'reddit',
  'twitch': 'twitch',
  'dailymotion': 'dailymotion',
  'vimeo': 'vimeo',
  'kwai': 'kwai',
  'bilibili': 'bilibili',
  'downloads': 'downloads',
  'translate': 'handleTranslate',
  'tr': 'handleTranslate',
  'weather': 'handleWeather',
  'clima': 'handleWeather',
  'quote': 'handleQuote',
  'fact': 'handleFact',
  'trivia': 'handleTriviaCommand',
  'meme': 'handleMemeCommand',
  // IA
  'ia': 'ai',
  'ai': 'ai',
  'clasificar': 'clasificar',
  // Básicos
  'ping': 'ping',
  'status': 'status',
  'comandos': 'help',
  // Subbots - IMPORTANTE: qr y code están en pairing.js
  'qr': 'qr',
  'code': 'code',
  'mybots': 'mybots',
  'mibots': 'mybots',
  'bots': 'bots',
  'stopbot': 'stopbot',
  'requestcode': 'requestMainBotPairingCode',
  'maincode': 'mainCode',
  // Aportes
  'addaporte': 'addaporte',
  'aportes': 'aportes',
  'myaportes': 'myaportes',
  'misaportes': 'myaportes',
  'aporteestado': 'aporteestado',
  'pedido': 'pedido',
  'pedidos': 'pedidos',
  'mispedidos': 'pedidos',
  // Media
  'sticker': 'sticker',
  's': 'sticker',
  'image': 'image',
  'wallpaper': 'wallpaper',
  'tts': 'tts',
  // Entretenimiento
  'joke': 'joke',
  'horoscope': 'horoscope',
  'horoscopo': 'horoscope',
  // Archivos
  'descargar': 'descargar',
  'guardar': 'guardar',
  'archivos': 'archivos',
  'misarchivos': 'misarchivos',
  // Juegos
  'game': 'game',
  'juego': 'game',
  'rps': 'rps',
  'guess': 'guess',
  'dice': 'dice',
  'sorteo': 'sorteo',
  'coin': 'coin',
  // Encuestas
  'poll': 'poll',
  'encuesta': 'poll',
  'pollmultiple': 'pollMultiple',
  'quickpoll': 'quickpoll',
  'rating': 'rating',
  'yesno': 'yesno',
  // Grupo
  'kick': 'kick',
  'promote': 'promote',
  'demote': 'demote',
  'lock': 'lock',
  'unlock': 'unlock',
  'settings': 'settings',
  'config': 'settings',
  'groupinfo': 'groupinfo',
  // Admin
  'bot': 'bot',
  'logs': 'logs',
  'stats': 'stats',
  'estadisticas': 'stats',
  'export': 'export',
  'update': 'update',
  'broadcast': 'broadcast',
  'bc': 'broadcast',
  // Perfil
  'whoami': 'whoami',
  'profile': 'profile',
  // Presencia
  'typing': 'typing',
  'recording': 'recording',
  'online': 'online',
  'offline': 'offline',
  'away': 'away',
  'busy': 'busy',
  'readall': 'readall',
  // Ban
  'ban': 'ban',
  'unban': 'unban',
  // Privacidad
  'privacy': 'privacy',
  // Votos
  'vote': 'vote',
  'votes': 'votes',
  // Utils adicionales
  'qrcode': 'qrcode',
  'calc': 'calc',
  'short': 'short',
  // Nuevos comandos de utilidades (Wileys)
  'password': 'password',
  'convert': 'convert',
  'email': 'email',
  'color': 'color',
  'timezone': 'timezone',
  // Nuevos comandos de IA (Wileys)
  'resume': 'resume',
  'translate': 'translate',
  'explain': 'explain',
  'sentiment': 'sentiment',
  'grammar': 'grammar',
  'code': 'code',
  'analyze': 'analyze',
  'brainstorm': 'brainstorm',
  // Nuevos comandos de juegos (Wileys)
  'hangman': 'hangman',
  'memory': 'memory',
  'blackjack': 'blackjack',
  'lottery': 'lottery',
  // Nuevos comandos de grupos (Wileys)
  'welcome': 'welcome',
  'automod': 'automod',
  'rules': 'rules',
  'groupstats': 'groupstats',
  'clean': 'clean',
  // Nuevos comandos de subbots (Wileys)
  'subbotstats': 'subbotstats',
  'subbotmanage': 'subbotmanage',
  'subbotmonitor': 'subbotmonitor',
  // Nuevos comandos de música (Wileys)
  'identify': 'identify',
  'lyrics': 'lyrics',
  'playlist': 'playlist',
  'radio': 'radio',
  'nowplaying': 'nowplaying',
  'musichelp': 'musichelp',
  // Nuevos comandos de media avanzado (Wileys)
  'compress': 'compress',
  'convert': 'convert',
  'removebg': 'removeBackground',
  'addtext': 'addText',
  'gif': 'createGif',
  'collage': 'collage',
  'filter': 'filter',
  'resize': 'resize',
  'mediahelp': 'mediahelp',
  // Nuevos comandos de seguridad (Wileys)
  'whitelist': 'whitelist',
  'blacklist': 'blacklist',
  'enable2fa': 'enable2fa',
  'verify2fa': 'verify2fa',
  'disable2fa': 'disable2fa',
  'spamcheck': 'spamcheck',
  'securitylogs': 'securitylogs',
  'securitystatus': 'securitystatus',

  // Sistema simplificado - sin categorías interactivas
};

async function loadCommandModule(moduleName, commandName = null) {
  const cacheKey = commandName ? `${moduleName}:${commandName}` : moduleName;
  if (commandModules.has(cacheKey)) {
    return commandModules.get(cacheKey);
  }
  try {
    const module = await import(`./plugins/${moduleName}.js`);
    let handler = null;
    if (commandName && COMMAND_FUNCTION_MAP[commandName]) {
      const functionName = COMMAND_FUNCTION_MAP[commandName];
      if (typeof module[functionName] === 'function') {
        handler = module[functionName];
      } else if (typeof module.default?.[functionName] === 'function') {
        handler = module.default[functionName];
      }
    }
    if (!handler && typeof module.handler === 'function') {
      handler = module.handler;
    } else if (typeof module.default?.handler === 'function') {
      handler = module.default.handler;
    } else if (typeof module.default === 'function') {
      handler = module.default;
    } else if (typeof module[moduleName] === 'function') {
      handler = module[moduleName];
    } else {
      const variations = [
        moduleName.replace(/-/g, ''),
        moduleName.split('-').pop(),
        moduleName.split('-')[0],
        moduleName.replace(/-/g, '_'),
      ];
      for (const variant of variations) {
        if (typeof module[variant] === 'function') {
          handler = module[variant];
          // Handler encontrado
          break;
        }
      }
      if (!handler) {
        const functions = Object.keys(module).filter(k => typeof module[k] === 'function');
        if (functions.length > 0) {
          handler = module[functions[0]];
          // Usando primera función disponible
        }
      }
    }
    if (typeof handler === 'function') {
      const wrappedModule = {
        ...module,
        handler: async (ctx) => {
          return await handler(ctx);
        }
      };
      commandModules.set(cacheKey, wrappedModule);
      return wrappedModule;
    } else {
      logger.warning(`No se encontró handler en el módulo: ${moduleName}`);
    }
  } catch (error) {
    logger.warning(`No se pudo cargar el módulo: ${moduleName}`, error.message);
  }
  return null;
}

logger.bot(`Sistema de comandos inicializado con ${Object.keys(COMMAND_FUNCTION_MAP).length} comandos mapeados`);

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


// Comando de ayuda integrado con listas interactivas
async function handleHelpCommand(ctx) {
  const { sock, remoteJid, sender, isGroup } = ctx;

  const userPhone = normalizePhone(sender || ctx.participant || remoteJid);
  const isAdmin = await isSuperAdmin(userPhone);

  // Organizar comandos por categorías desde COMMAND_FUNCTION_MAP
  const commandCategories = {
    'DESCARGAS': [
      { cmd: 'play', desc: 'Descargar audio de YouTube', usage: '/play <nombre>' },
      { cmd: 'music', desc: 'Descargar música', usage: '/music <nombre>' },
      { cmd: 'video', desc: 'Descargar video de YouTube', usage: '/video <nombre>' },
      { cmd: 'youtube', desc: 'Descargar de YouTube', usage: '/youtube <url>' },
      { cmd: 'tiktok', desc: 'Descargar de TikTok', usage: '/tiktok <url>' },
      { cmd: 'instagram', desc: 'Descargar de Instagram', usage: '/instagram <url>' },
      { cmd: 'ig', desc: 'Descargar de Instagram', usage: '/ig <url>' },
      { cmd: 'facebook', desc: 'Descargar de Facebook', usage: '/facebook <url>' },
      { cmd: 'fb', desc: 'Descargar de Facebook', usage: '/fb <url>' },
      { cmd: 'twitter', desc: 'Descargar de Twitter/X', usage: '/twitter <url>' },
      { cmd: 'x', desc: 'Descargar de X', usage: '/x <url>' },
      { cmd: 'pinterest', desc: 'Descargar de Pinterest', usage: '/pinterest <url>' },
      { cmd: 'spotify', desc: 'Buscar en Spotify', usage: '/spotify <búsqueda>' },
      { cmd: 'soundcloud', desc: 'Descargar de SoundCloud', usage: '/soundcloud <url>' },
      { cmd: 'reddit', desc: 'Descargar de Reddit', usage: '/reddit <url>' },
      { cmd: 'twitch', desc: 'Descargar de Twitch', usage: '/twitch <url>' },
      { cmd: 'dailymotion', desc: 'Descargar de Dailymotion', usage: '/dailymotion <url>' },
      { cmd: 'vimeo', desc: 'Descargar de Vimeo', usage: '/vimeo <url>' },
      { cmd: 'kwai', desc: 'Descargar de Kwai', usage: '/kwai <url>' },
      { cmd: 'bilibili', desc: 'Descargar de Bilibili', usage: '/bilibili <url>' },
      { cmd: 'downloads', desc: 'Ver historial de descargas', usage: '/downloads' }
    ],
    'INTELIGENCIA ARTIFICIAL': [
      { cmd: 'ia', desc: 'Chatear con IA', usage: '/ia <texto>' },
      { cmd: 'ai', desc: 'Chatear con IA', usage: '/ai <texto>' },
      { cmd: 'clasificar', desc: 'Clasificar texto', usage: '/clasificar <texto>' },
      { cmd: 'translate', desc: 'Traducir texto', usage: '/translate <texto>' },
      { cmd: 'tr', desc: 'Traducir texto', usage: '/tr <texto>' },
      { cmd: 'resume', desc: 'Resumir texto', usage: '/resume <texto>' },
      { cmd: 'explain', desc: 'Explicar concepto', usage: '/explain <concepto>' },
      { cmd: 'sentiment', desc: 'Análisis de sentimientos', usage: '/sentiment <texto>' },
      { cmd: 'grammar', desc: 'Corrección gramatical', usage: '/grammar <texto>' },
      { cmd: 'analyze', desc: 'Analizar texto', usage: '/analyze <texto>' },
      { cmd: 'brainstorm', desc: 'Lluvia de ideas', usage: '/brainstorm <tema>' }
    ],
    'MEDIA Y MULTIMEDIA': [
      { cmd: 'sticker', desc: 'Crear sticker', usage: '/sticker (responder a imagen)' },
      { cmd: 's', desc: 'Crear sticker', usage: '/s (responder a imagen)' },
      { cmd: 'image', desc: 'Buscar imagen', usage: '/image <búsqueda>' },
      { cmd: 'wallpaper', desc: 'Buscar wallpaper', usage: '/wallpaper <búsqueda>' },
      { cmd: 'tts', desc: 'Texto a voz', usage: '/tts <texto>' },
      { cmd: 'compress', desc: 'Comprimir imagen', usage: '/compress (responder a imagen)' },
      { cmd: 'convert', desc: 'Convertir formato', usage: '/convert <formato>' },
      { cmd: 'removebg', desc: 'Remover fondo', usage: '/removebg (responder a imagen)' },
      { cmd: 'addtext', desc: 'Agregar texto a imagen', usage: '/addtext <texto>' },
      { cmd: 'gif', desc: 'Crear GIF', usage: '/gif (responder a video)' },
      { cmd: 'collage', desc: 'Crear collage', usage: '/collage (múltiples imágenes)' },
      { cmd: 'filter', desc: 'Aplicar filtro', usage: '/filter <tipo>' },
      { cmd: 'resize', desc: 'Redimensionar imagen', usage: '/resize <tamaño>' },
      { cmd: 'mediahelp', desc: 'Ayuda de media', usage: '/mediahelp' }
    ],
    'MUSICA': [
      { cmd: 'identify', desc: 'Identificar canción', usage: '/identify (responder a audio)' },
      { cmd: 'lyrics', desc: 'Buscar letra', usage: '/lyrics <canción>' },
      { cmd: 'playlist', desc: 'Crear playlist', usage: '/playlist <nombre>' },
      { cmd: 'radio', desc: 'Escuchar radio', usage: '/radio <estación>' },
      { cmd: 'nowplaying', desc: 'Canción actual', usage: '/nowplaying' },
      { cmd: 'musichelp', desc: 'Ayuda de música', usage: '/musichelp' }
    ],
    'UTILIDADES': [
      { cmd: 'weather', desc: 'Ver clima', usage: '/weather <ciudad>' },
      { cmd: 'clima', desc: 'Ver clima', usage: '/clima <ciudad>' },
      { cmd: 'quote', desc: 'Cita inspiradora', usage: '/quote' },
      { cmd: 'fact', desc: 'Dato curioso', usage: '/fact' },
      { cmd: 'trivia', desc: 'Pregunta de trivia', usage: '/trivia' },
      { cmd: 'meme', desc: 'Generar meme', usage: '/meme' },
      { cmd: 'qrcode', desc: 'Generar código QR', usage: '/qrcode <texto>' },
      { cmd: 'calc', desc: 'Calculadora', usage: '/calc <operación>' },
      { cmd: 'short', desc: 'Acortar URL', usage: '/short <url>' },
      { cmd: 'password', desc: 'Generar contraseña', usage: '/password <longitud>' },
      { cmd: 'email', desc: 'Validar email', usage: '/email <correo>' },
      { cmd: 'color', desc: 'Información de color', usage: '/color <código>' },
      { cmd: 'timezone', desc: 'Zona horaria', usage: '/timezone <zona>' }
    ],
    'JUEGOS': [
      { cmd: 'game', desc: 'Menú de juegos', usage: '/game' },
      { cmd: 'juego', desc: 'Menú de juegos', usage: '/juego' },
      { cmd: 'rps', desc: 'Piedra, papel o tijera', usage: '/rps <opción>' },
      { cmd: 'guess', desc: 'Adivinar número', usage: '/guess <número>' },
      { cmd: 'dice', desc: 'Lanzar dado', usage: '/dice' },
      { cmd: 'sorteo', desc: 'Hacer sorteo', usage: '/sorteo <opciones>' },
      { cmd: 'coin', desc: 'Lanzar moneda', usage: '/coin' },
      { cmd: 'hangman', desc: 'Juego del ahorcado', usage: '/hangman' },
      { cmd: 'memory', desc: 'Juego de memoria', usage: '/memory' },
      { cmd: 'blackjack', desc: 'Juego de blackjack', usage: '/blackjack' },
      { cmd: 'lottery', desc: 'Lotería', usage: '/lottery' }
    ],
    'ENCUESTAS': [
      { cmd: 'poll', desc: 'Crear encuesta', usage: '/poll <pregunta>' },
      { cmd: 'encuesta', desc: 'Crear encuesta', usage: '/encuesta <pregunta>' },
      { cmd: 'pollmultiple', desc: 'Encuesta múltiple', usage: '/pollmultiple <opciones>' },
      { cmd: 'quickpoll', desc: 'Encuesta rápida', usage: '/quickpoll <pregunta>' },
      { cmd: 'rating', desc: 'Sistema de calificación', usage: '/rating <tema>' },
      { cmd: 'yesno', desc: 'Encuesta sí/no', usage: '/yesno <pregunta>' },
      { cmd: 'vote', desc: 'Votar', usage: '/vote <opción>' },
      { cmd: 'votes', desc: 'Ver votos', usage: '/votes' }
    ],
    'GRUPOS': [
      { cmd: 'kick', desc: 'Expulsar usuario', usage: '/kick @usuario' },
      { cmd: 'promote', desc: 'Promover a admin', usage: '/promote @usuario' },
      { cmd: 'demote', desc: 'Quitar admin', usage: '/demote @usuario' },
      { cmd: 'lock', desc: 'Bloquear grupo', usage: '/lock' },
      { cmd: 'unlock', desc: 'Desbloquear grupo', usage: '/unlock' },
      { cmd: 'settings', desc: 'Configuración del grupo', usage: '/settings' },
      { cmd: 'config', desc: 'Configuración del grupo', usage: '/config' },
      { cmd: 'groupinfo', desc: 'Información del grupo', usage: '/groupinfo' },
      { cmd: 'welcome', desc: 'Mensaje de bienvenida', usage: '/welcome <mensaje>' },
      { cmd: 'automod', desc: 'Moderación automática', usage: '/automod on/off' },
      { cmd: 'rules', desc: 'Reglas del grupo', usage: '/rules' },
      { cmd: 'groupstats', desc: 'Estadísticas del grupo', usage: '/groupstats' },
      { cmd: 'clean', desc: 'Limpiar mensajes', usage: '/clean <cantidad>' }
    ],
    'SUBBOTS': [
      { cmd: 'qr', desc: 'Crear subbot con QR', usage: '/qr' },
      { cmd: 'code', desc: 'Crear subbot con código', usage: '/code' },
      { cmd: 'mybots', desc: 'Mis subbots', usage: '/mybots' },
      { cmd: 'mibots', desc: 'Mis subbots', usage: '/mibots' },
      { cmd: 'bots', desc: 'Lista de subbots', usage: '/bots' },
      { cmd: 'stopbot', desc: 'Detener subbot', usage: '/stopbot <código>' },
      { cmd: 'requestcode', desc: 'Solicitar código', usage: '/requestcode' },
      { cmd: 'maincode', desc: 'Código del bot principal', usage: '/maincode' },
      { cmd: 'subbotstats', desc: 'Estadísticas de subbots', usage: '/subbotstats' },
      { cmd: 'subbotmanage', desc: 'Gestionar subbots', usage: '/subbotmanage' },
      { cmd: 'subbotmonitor', desc: 'Monitor de subbots', usage: '/subbotmonitor' }
    ],
    'SEGURIDAD': [
      { cmd: 'whitelist', desc: 'Lista blanca', usage: '/whitelist <usuario>' },
      { cmd: 'blacklist', desc: 'Lista negra', usage: '/blacklist <usuario>' },
      { cmd: 'enable2fa', desc: 'Activar 2FA', usage: '/enable2fa' },
      { cmd: 'verify2fa', desc: 'Verificar 2FA', usage: '/verify2fa <código>' },
      { cmd: 'disable2fa', desc: 'Desactivar 2FA', usage: '/disable2fa' },
      { cmd: 'spamcheck', desc: 'Verificar spam', usage: '/spamcheck' },
      { cmd: 'securitylogs', desc: 'Logs de seguridad', usage: '/securitylogs' },
      { cmd: 'securitystatus', desc: 'Estado de seguridad', usage: '/securitystatus' },
      { cmd: 'ban', desc: 'Banear usuario', usage: '/ban @usuario' },
      { cmd: 'unban', desc: 'Desbanear usuario', usage: '/unban @usuario' },
      { cmd: 'privacy', desc: 'Configurar privacidad', usage: '/privacy' }
    ],
    'ARCHIVOS': [
      { cmd: 'descargar', desc: 'Descargar archivo', usage: '/descargar <url>' },
      { cmd: 'guardar', desc: 'Guardar archivo', usage: '/guardar (responder a archivo)' },
      { cmd: 'archivos', desc: 'Lista de archivos', usage: '/archivos' },
      { cmd: 'misarchivos', desc: 'Mis archivos', usage: '/misarchivos' }
    ],
    'APORTES': [
      { cmd: 'addaporte', desc: 'Agregar aporte', usage: '/addaporte (con media)' },
      { cmd: 'aportes', desc: 'Ver aportes', usage: '/aportes' },
      { cmd: 'myaportes', desc: 'Mis aportes', usage: '/myaportes' },
      { cmd: 'misaportes', desc: 'Mis aportes', usage: '/misaportes' },
      { cmd: 'aporteestado', desc: 'Estado del aporte', usage: '/aporteestado <id>' },
      { cmd: 'pedido', desc: 'Hacer pedido', usage: '/pedido <descripción>' },
      { cmd: 'pedidos', desc: 'Ver pedidos', usage: '/pedidos' },
      { cmd: 'mispedidos', desc: 'Mis pedidos', usage: '/mispedidos' }
    ],
    'ENTRETENIMIENTO': [
      { cmd: 'joke', desc: 'Chiste aleatorio', usage: '/joke' },
      { cmd: 'horoscope', desc: 'Horóscopo', usage: '/horoscope <signo>' },
      { cmd: 'horoscopo', desc: 'Horóscopo', usage: '/horoscopo <signo>' }
    ],
    'PERFIL': [
      { cmd: 'whoami', desc: 'Mi información', usage: '/whoami' },
      { cmd: 'profile', desc: 'Ver perfil', usage: '/profile' }
    ],
    'PRESENCIA': [
      { cmd: 'typing', desc: 'Simular escribiendo', usage: '/typing' },
      { cmd: 'recording', desc: 'Simular grabando', usage: '/recording' },
      { cmd: 'online', desc: 'Aparecer en línea', usage: '/online' },
      { cmd: 'offline', desc: 'Aparecer desconectado', usage: '/offline' },
      { cmd: 'away', desc: 'Aparecer ausente', usage: '/away' },
      { cmd: 'busy', desc: 'Aparecer ocupado', usage: '/busy' },
      { cmd: 'readall', desc: 'Marcar todo como leído', usage: '/readall' }
    ],
    'BASICOS': [
      { cmd: 'ping', desc: 'Ver latencia del bot', usage: '/ping' },
      { cmd: 'status', desc: 'Estado del sistema', usage: '/status' },
      { cmd: 'comandos', desc: 'Lista de comandos', usage: '/comandos' }
    ]
  };

  // Agregar comandos de admin solo si es admin
  if (isAdmin) {
    commandCategories['ADMINISTRACION'] = [
      { cmd: 'bot', desc: 'Controlar bot', usage: '/bot on/off' },
      { cmd: 'logs', desc: 'Ver logs del sistema', usage: '/logs' },
      { cmd: 'stats', desc: 'Estadísticas del bot', usage: '/stats' },
      { cmd: 'estadisticas', desc: 'Estadísticas del bot', usage: '/estadisticas' },
      { cmd: 'export', desc: 'Exportar datos', usage: '/export' },
      { cmd: 'update', desc: 'Actualizar bot', usage: '/update' },
      { cmd: 'broadcast', desc: 'Mensaje masivo', usage: '/broadcast <mensaje>' },
      { cmd: 'bc', desc: 'Mensaje masivo', usage: '/bc <mensaje>' }
    ];
  }

  // Crear texto de ayuda con estilo BL
  let helpText = `╔═══════════════════════════════════════╗\n`;
  helpText += `║           [KONMI BOT]                 ║\n`;
  helpText += `║        Menu de Comandos               ║\n`;
  helpText += `╚═══════════════════════════════════════╝`;

  await sock.sendMessage(remoteJid, { text: helpText });
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


// Registrar comandos en el mapa
commandMap.set('help', { handler: handleHelpCommand, category: 'Básicos', description: 'Mostrar ayuda', isLocal: true });
commandMap.set('ayuda', { handler: handleHelpCommand, category: 'Básicos', description: 'Mostrar ayuda', isLocal: true });
commandMap.set('menu', { handler: handleHelpCommand, category: 'Básicos', description: 'Mostrar menú', isLocal: true });
commandMap.set('comandos', { handler: handleHelpCommand, category: 'Básicos', description: 'Mostrar comandos', isLocal: true });

// Sistema simplificado - sin categorías interactivas

// ===== REGISTRO COMPLETO DE COMANDOS =====
commandMap.set('bot', { moduleName: 'bot-control', category: 'Admin', description: 'Activar/desactivar bot', admin: false });
commandMap.set('ping', { moduleName: 'ping', category: 'Básicos', description: 'Verificar latencia' });
commandMap.set('status', { moduleName: 'status', category: 'Básicos', description: 'Ver estado del bot' });

// Comandos de descargas
commandMap.set('play', { moduleName: 'download-commands', category: 'Descargas', description: 'Audio de YouTube' });
commandMap.set('music', { moduleName: 'download-commands', category: 'Descargas', description: 'Audio de YouTube' });
commandMap.set('video', { moduleName: 'download-commands', category: 'Descargas', description: 'Video de YouTube' });
commandMap.set('youtube', { moduleName: 'download-commands', category: 'Descargas', description: 'Video de YouTube' });
commandMap.set('tiktok', { moduleName: 'download-commands', category: 'Descargas', description: 'Videos de TikTok' });
commandMap.set('instagram', { moduleName: 'download-commands', category: 'Descargas', description: 'Contenido de Instagram' });
commandMap.set('ig', { moduleName: 'download-commands', category: 'Descargas', description: 'Contenido de Instagram' });
commandMap.set('facebook', { moduleName: 'download-commands', category: 'Descargas', description: 'Videos de Facebook' });
commandMap.set('fb', { moduleName: 'download-commands', category: 'Descargas', description: 'Videos de Facebook' });
commandMap.set('twitter', { moduleName: 'download-commands', category: 'Descargas', description: 'Videos de Twitter' });
commandMap.set('x', { moduleName: 'download-commands', category: 'Descargas', description: 'Videos de Twitter/X' });
commandMap.set('pinterest', { moduleName: 'download-commands', category: 'Descargas', description: 'Imágenes de Pinterest' });
commandMap.set('spotify', { moduleName: 'download-commands', category: 'Descargas', description: 'Buscar en Spotify' });

// Comandos de IA
commandMap.set('ia', { moduleName: 'ai', category: 'IA', description: 'Pregunta a Gemini AI' });
commandMap.set('ai', { moduleName: 'ai', category: 'IA', description: 'Pregunta a Gemini AI' });
commandMap.set('image', { moduleName: 'images', category: 'IA', description: 'Generar imagen con IA' });
commandMap.set('clasificar', { moduleName: 'ai', category: 'IA', description: 'Clasificar texto' });
commandMap.set('wallpaper', { moduleName: 'images', category: 'Media', description: 'Buscar wallpapers' });

// Comandos de media
commandMap.set('sticker', { moduleName: 'stickers', category: 'Media', description: 'Crear sticker' });
commandMap.set('s', { moduleName: 'stickers', category: 'Media', description: 'Crear sticker' });
commandMap.set('meme', { moduleName: 'download-commands', category: 'Media', description: 'Meme aleatorio' });
commandMap.set('quote', { moduleName: 'download-commands', category: 'Media', description: 'Frase motivacional' });
commandMap.set('tts', { moduleName: 'media', category: 'Media', description: 'Texto a voz' });

// Comandos de utilidades
commandMap.set('translate', { moduleName: 'download-commands', category: 'Utilidades', description: 'Traducir texto' });
commandMap.set('tr', { moduleName: 'download-commands', category: 'Utilidades', description: 'Traducir texto' });
commandMap.set('weather', { moduleName: 'download-commands', category: 'Utilidades', description: 'Consultar clima' });
commandMap.set('clima', { moduleName: 'download-commands', category: 'Utilidades', description: 'Consultar clima' });
commandMap.set('joke', { moduleName: 'utils', category: 'Entretenimiento', description: 'Chiste aleatorio' });
commandMap.set('horoscope', { moduleName: 'utils', category: 'Entretenimiento', description: 'Horóscopo' });
commandMap.set('horoscopo', { moduleName: 'utils', category: 'Entretenimiento', description: 'Horóscopo' });
commandMap.set('fact', { moduleName: 'download-commands', category: 'Entretenimiento', description: 'Dato curioso' });
commandMap.set('trivia', { moduleName: 'download-commands', category: 'Entretenimiento', description: 'Preguntas de trivia' });

// Comandos de archivos
commandMap.set('descargar', { moduleName: 'files', category: 'Archivos', description: 'Descargar archivo' });
commandMap.set('guardar', { moduleName: 'files', category: 'Archivos', description: 'Guardar archivo' });
commandMap.set('archivos', { moduleName: 'files', category: 'Archivos', description: 'Ver archivos' });
commandMap.set('misarchivos', { moduleName: 'files', category: 'Archivos', description: 'Mis archivos' });

// Comandos de juegos
commandMap.set('game', { moduleName: 'games', category: 'Entretenimiento', description: 'Menú de juegos' });
commandMap.set('juego', { moduleName: 'games', category: 'Entretenimiento', description: 'Menú de juegos' });
commandMap.set('rps', { moduleName: 'games', category: 'Entretenimiento', description: 'Piedra, papel o tijera' });
commandMap.set('guess', { moduleName: 'games', category: 'Entretenimiento', description: 'Adivinar número' });
commandMap.set('dice', { moduleName: 'games', category: 'Entretenimiento', description: 'Lanzar dados' });
commandMap.set('sorteo', { moduleName: 'games', category: 'Entretenimiento', description: 'Sorteo/ruleta' });
commandMap.set('coin', { moduleName: 'games', category: 'Entretenimiento', description: 'Lanzar moneda' });

// Comandos de encuestas
commandMap.set('poll', { moduleName: 'polls', category: 'Entretenimiento', description: 'Crear encuesta' });
commandMap.set('encuesta', { moduleName: 'polls', category: 'Entretenimiento', description: 'Crear encuesta' });

// Comandos de grupo
commandMap.set('groupinfo', { moduleName: 'groups', category: 'Grupo', description: 'Info del grupo' });
commandMap.set('kick', { moduleName: 'groups', category: 'Grupo', description: 'Expulsar usuario', admin: true });
commandMap.set('promote', { moduleName: 'groups', category: 'Grupo', description: 'Promover a admin', admin: true });
commandMap.set('demote', { moduleName: 'groups', category: 'Grupo', description: 'Quitar admin', admin: true });
commandMap.set('lock', { moduleName: 'groups', category: 'Grupo', description: 'Cerrar grupo', admin: true });
commandMap.set('unlock', { moduleName: 'groups', category: 'Grupo', description: 'Abrir grupo', admin: true });
commandMap.set('settings', { moduleName: 'group-settings', category: 'Grupo', description: 'Configuración', admin: true });
commandMap.set('config', { moduleName: 'group-settings', category: 'Grupo', description: 'Configuración', admin: true });

// Comandos de aportes y pedidos
commandMap.set('addaporte', { moduleName: 'aportes', category: 'Aportes', description: 'Agregar aporte' });
commandMap.set('aportes', { moduleName: 'aportes', category: 'Aportes', description: 'Ver aportes' });
commandMap.set('myaportes', { moduleName: 'aportes', category: 'Aportes', description: 'Mis aportes' });
commandMap.set('misaportes', { moduleName: 'aportes', category: 'Aportes', description: 'Mis aportes' });
commandMap.set('aporteestado', { moduleName: 'aportes', category: 'Aportes', description: 'Estado de aporte' });
commandMap.set('pedido', { moduleName: 'pedidos', category: 'Aportes', description: 'Hacer pedido' });
commandMap.set('pedidos', { moduleName: 'pedidos', category: 'Aportes', description: 'Ver pedidos' });
commandMap.set('mispedidos', { moduleName: 'pedidos', category: 'Aportes', description: 'Mis pedidos' });

// Comandos de Subbots (disponibles para TODOS los usuarios)
commandMap.set('qr', { moduleName: 'pairing', category: 'Subbots', description: 'Crear subbot con QR', admin: false });
commandMap.set('code', { moduleName: 'pairing', category: 'Subbots', description: 'Crear subbot con código', admin: false });
commandMap.set('mybots', { moduleName: 'subbots', category: 'Subbots', description: 'Ver mis subbots', admin: false });
commandMap.set('mibots', { moduleName: 'subbots', category: 'Subbots', description: 'Ver mis subbots', admin: false });
commandMap.set('bots', { moduleName: 'subbots', category: 'Admin', description: 'Ver todos los bots', admin: false }); // Verificación interna en subbots.js
commandMap.set('stopbot', { moduleName: 'subbots', category: 'Subbots', description: 'Detener subbot', admin: false });
commandMap.set('requestcode', { moduleName: 'pairing', category: 'Admin', description: 'Solicitar código bot principal', admin: true });
commandMap.set('maincode', { moduleName: 'pairing', category: 'Admin', description: 'Ver código bot principal', admin: true });

// Comandos de admin - Sistema
commandMap.set('logs', { moduleName: 'logs', category: 'Admin', description: 'Ver logs', admin: true });
commandMap.set('stats', { moduleName: 'system-info', category: 'Admin', description: 'Estadísticas', admin: true });
commandMap.set('estadisticas', { moduleName: 'system-info', category: 'Admin', description: 'Estadísticas', admin: true });
commandMap.set('export', { moduleName: 'system', category: 'Admin', description: 'Exportar datos', admin: true });
commandMap.set('update', { moduleName: 'maintenance', category: 'Admin', description: 'Actualizar sistema', admin: true });
commandMap.set('broadcast', { moduleName: 'broadcast', category: 'Admin', description: 'Enviar a todos', admin: true });
commandMap.set('bc', { moduleName: 'broadcast', category: 'Admin', description: 'Enviar a todos', admin: true });

// Comandos de perfil
commandMap.set('whoami', { moduleName: 'profile', category: 'Utilidades', description: 'Mi perfil' });
commandMap.set('profile', { moduleName: 'profile', category: 'Utilidades', description: 'Ver perfil' });

// Comandos interactivos y presencia
commandMap.set('pollmultiple', { moduleName: 'poll', category: 'Interactivo', description: 'Encuesta múltiple' });
commandMap.set('quickpoll', { moduleName: 'poll', category: 'Interactivo', description: 'Encuesta rápida sí/no' });
commandMap.set('rating', { moduleName: 'poll', category: 'Interactivo', description: 'Encuesta de rating 1-5' });
commandMap.set('yesno', { moduleName: 'poll', category: 'Interactivo', description: 'Encuesta sí/no/no sé' });
commandMap.set('typing', { moduleName: 'presence', category: 'Utilidades', description: 'Simular escribiendo' });
commandMap.set('recording', { moduleName: 'presence', category: 'Utilidades', description: 'Simular grabando' });
commandMap.set('online', { moduleName: 'presence', category: 'Utilidades', description: 'Estado disponible' });
commandMap.set('offline', { moduleName: 'presence', category: 'Utilidades', description: 'Estado no disponible' });
commandMap.set('away', { moduleName: 'presence', category: 'Utilidades', description: 'Estado ausente' });
commandMap.set('busy', { moduleName: 'presence', category: 'Utilidades', description: 'Estado ocupado' });
commandMap.set('readall', { moduleName: 'presence', category: 'Grupo', description: 'Marcar todo como leído' });

// Comandos de ban y moderación
commandMap.set('ban', { moduleName: 'ban', category: 'Grupo', description: 'Banear usuario', admin: true });
commandMap.set('unban', { moduleName: 'ban', category: 'Grupo', description: 'Desbanear usuario', admin: true });

// Comandos de privacidad
commandMap.set('privacy', { moduleName: 'privacy', category: 'Utilidades', description: 'Configurar privacidad' });

// Comandos de votos
commandMap.set('vote', { moduleName: 'votes', category: 'Interactivo', description: 'Votar' });
commandMap.set('votes', { moduleName: 'votes', category: 'Interactivo', description: 'Ver votos' });

// Comandos de contenido
commandMap.set('content', { moduleName: 'content', category: 'Media', description: 'Gestionar contenido' });

// Comandos de llamadas
commandMap.set('call', { moduleName: 'calls', category: 'Utilidades', description: 'Gestionar llamadas' });

// Comandos de mensajes
commandMap.set('delete', { moduleName: 'message-control', category: 'Grupo', description: 'Eliminar mensaje', admin: true });
commandMap.set('clear', { moduleName: 'message-control', category: 'Grupo', description: 'Limpiar chat', admin: true });

// Comandos de demo
commandMap.set('demo', { moduleName: 'demo', category: 'Utilidades', description: 'Demo del bot' });

// Comandos de diagnóstico
commandMap.set('diag', { moduleName: 'diag', category: 'Admin', description: 'Diagnóstico del sistema', admin: true });

// Comandos de promo
commandMap.set('promo', { moduleName: 'promo', category: 'Utilidades', description: 'Promociones' });

// Comandos adicionales de utils (Wileys)
commandMap.set('qrcode', { moduleName: 'utils', category: 'Utilidades', description: 'Generar código QR' });
commandMap.set('calc', { moduleName: 'utils', category: 'Utilidades', description: 'Calculadora' });
commandMap.set('short', { moduleName: 'utils', category: 'Utilidades', description: 'Acortar URL' });


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

// Adaptador para mantener compatibilidad con la API anterior
export async function routeCommand(ctx = {}) {
  const handled = await dispatch(ctx);
  return { handled: !!handled };
}
