// handler.js
import './src/config/config.js';
// Handler principal para logica de aportes, media, pedidos y proveedores

import db from "./src/database/db.js";
import path from "path";
import fs from "fs";
import axios from "axios";
import { fileURLToPath, pathToFileURL } from "url";
import QRCode from "qrcode";
import pino from "pino";
import { EventEmitter } from "events";
import appLogger from "./src/config/logger.js";
import antibanMiddleware from "./src/utils/utils/anti-ban-middleware.js";
import antibanSystem from "./src/utils/utils/anti-ban.js";
import { getGroupBool } from "./src/utils/utils/group-config.js";
import {
  isBotGloballyActive,
  createSubbotWithPairing,
  createSubbotWithQr,
  listUserSubbots,
  listAllSubbots,
  deleteUserSubbot,
  getSubbotByCode as getSubbotByCodeCore,
  cleanOrphanSubbots,
} from "./src/services/subbot-manager.js";
import {
  startSubbot,
  stopSubbotRuntime as stopSubbot,
  getSubbotStatus as getRuntimeStatus,
} from "./src/lib/subbots.js";
import { processWhatsAppMedia } from "./src/services/file-manager.js";
import { isSuperAdmin } from "./src/config/global-config.js";
import { getGeminiModel, hasGeminiApiKey } from "./src/services/gemini-client.js";
// legacy helpers removidos; toda la lógica está en commands/*

// Nota: handler.js no maneja conexión; no requiere Baileys aquí.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const SESSION_DIR = "./sessions/subbots";
const activeSubbots = new Map();
const subbotSessions = new Map();
const logger = pino({ level: "silent" });
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

// =========================
// Contexto simple por chat para mensajes idempotentes y UX mejorada
// =========================
const __chatContext = new Map(); // key: chatId -> { events: [{ type, at, actor }] }

function pushChatEvent(chatId, type, actor) {
  try {
    const now = Date.now();
    const ctx = __chatContext.get(chatId) || { events: [] };
    ctx.events.push({ type, at: now, actor });
    // Mantener últimos 20 eventos para memoria controlada
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

// -----------------------------
// Session helpers para subbots
// -----------------------------
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
    console.error("Error cargando session de subbot:", err);
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
    console.error("Error guardando session de subbot:", err);
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
    console.error("Error eliminando session de subbot:", err);
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
    console.error("Error registrando evento de subbot:", err);
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
    const THRESHOLD = 1000 * 60 * 60 * 12; // 12 horas
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
        console.log(
          `🧹 Limpieza: marcando subbot ${row.code} como deleted (inactivo ${msToHuman(
            diff,
          )})`,
        );
        await db("subbots")
          .where({ id: row.id })
          .update({
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

    // Token no implementado no; se deja como compatibilidad
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

    const totalRow = await db("subbots")
      .count("id as count")
      .first();

    let activos = 0;
    let conectados = 0;
    let porEstado = [];

    try {
      const activosRow = await db("subbots")
        .where({ is_active: true })
        .count("id as count")
        .first();
      activos = Number(activosRow?.count || 0);
    } catch { }

    try {
      const conectadosRow = await db("subbots")
        .where({ is_online: true })
        .count("id as count")
        .first();
      conectados = Number(conectadosRow?.count || 0);
    } catch { }

    try {
      const byStatus = await db("subbots")
        .select("status")
        .count("id as count")
        .groupBy("status");
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

// Reexportar lista completa para API
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
  await cleanupInactiveSubbots();

  const row = await ensureSubbotForUser(cleanPhone, name);
  if (!row) {
    await sock.sendMessage(remoteJid, {
      text: "⚠️ No se pudo crear o recuperar tu subbot. Intenta de nuevo.",
    });
    return { success: false };
  }

  if (row.status === "deleted") {
    await db("subbots")
      .where({ id: row.id })
      .update({
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
      text:
        "⚠️ No se pudo iniciar tu subbot. Intenta más tarde o contacta soporte.",
    });
    return { success: false };
  }

  markSubbotOnline(code, startResult.sessionData || null);

  if (startResult.sessionData) {
    await saveSubbotSession(code, startResult.sessionData);
  }

  const messages = [];
  messages.push(
    `✅ Tu subbot se está iniciando.\n\n` +
      `📛 *Código:* ${code}\n` +
      `👤 *Usuario:* ${row.user_name || "Sin nombre"}\n` +
      `📱 *Teléfono:* ${row.user_phone}\n`,
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
      messages.push(
        "⚠️ No se pudo generar el código QR. Intenta más tarde o pide un /code.",
      );
    }
  }

  if (startResult.pairingCode) {
    messages.push(
      `🔑 *Código de vinculación:* \`${startResult.pairingCode}\`\n` +
        `📌 Úsalo en tu WhatsApp para conectar el subbot.`,
    );
  }

  messages.push(
    "ℹ️ Una vez conectado, tu subbot aparecerá como *online* en /mybots.",
  );

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
        text: `⚠️ No se encontró el subbot con código: ${explicitCode}.`,
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

  await db("subbots")
    .where({ code })
    .update({
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
          ? `   Último: ${new Date(fm.lastHeartbeat).toLocaleString(
              "es-ES",
            )}\n`
          : ""),
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
    `• Última actividad: ${
      fm.last_activity
        ? new Date(fm.last_activity).toLocaleString("es-ES")
        : "N/D"
    }`,
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

// Usuario helpers
async function ensureUser(phone, name) {
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error("Número inválido");

  let user = await db("usuarios").where({ phone: normalized }).first();
  if (!user) {
    const [id] = await db("usuarios").insert(
      {
        phone: normalized,
        name: name || null,
      },
      ["id"],
    );
    user = await db("usuarios").where({ id: id.id || id }).first();
  } else if (name && !user.name) {
    await db("usuarios").where({ id: user.id }).update({ name });
    user.name = name;
  }
  return user;
}

// Aportes
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

  const [id] = await db("aportes").insert(
    {
      usuario_id: user.id,
      type: processed.filePath ? "media" : "text",
      content: processed.text || null,
      media_path: processed.filePath || null,
      media_type: processed.mimetype || null,
      source_chat: remoteJid,
      message_id: message.key?.id || null,
      status: "pending",
      metadata,
    },
    ["id"],
  );

  await sock.sendMessage(remoteJid, {
    text:
      "✅ ¡Gracias por tu aporte!\n" +
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

// Pedidos
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

  const [id] = await db("pedidos").insert(
    {
      usuario_id: user.id,
      title,
      description,
      status: "open",
    },
    ["id"],
  );

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
    const [id] = await db("proveedores").insert(
      {
        phone: normalized,
        name: name || null,
        role: "provider",
        active: true,
      },
      ["id"],
    );
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

  const [id] = await db("proveedor_contenidos").insert(
    {
      proveedor_id: prov.id,
      type: processed.filePath ? "media" : "text",
      content: processed.text || null,
      media_path: processed.filePath || null,
      media_type: processed.mimetype || null,
      metadata,
    },
    ["id"],
  );

  await sock.sendMessage(remoteJid, {
    text:
      "✅ ¡Gracias por tu contenido como proveedor!\n" +
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
// Proveedores automÇ­ticos (API panel)
// =========================

export async function getProviderStats() {
  try {
    const totalRow = await db("aportes")
      .where({ tipo: "proveedor_auto" })
      .count("id as count")
      .first();

    const pendingRow = await db("aportes")
      .where({ tipo: "proveedor_auto", estado: "pendiente" })
      .count("id as count")
      .first();

    const approvedRow = await db("aportes")
      .where({ tipo: "proveedor_auto", estado: "aprobado" })
      .count("id as count")
      .first();

    const rejectedRow = await db("aportes")
      .where({ tipo: "proveedor_auto", estado: "rechazado" })
      .count("id as count")
      .first();

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

    const rows = await q
      .orderBy("fecha", "desc")
      .limit(Number.isFinite(Number(limit)) ? Number(limit) : 100);

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

    let message = "🔍 *Información del Sistema*\n\n";
    message += `📚 **Aportes:** ${stats.aportes?.count || 0}\n`;
    message += `📝 **Pedidos:** ${stats.pedidos?.count || 0}\n`;
    message += `👥 **Usuarios:** ${stats.usuarios?.count || 0}\n`;
    message += `🤖 **Subbots:** ${stats.subbots?.count || 0}\n`;
    message += `\n💾 **Base de datos:** Operativa\n`;
    message += `⏰ **Tiempo:** ${new Date().toLocaleString("es-ES")}`;

    return { success: true, message };
  } catch (error) {
    console.error("❌ Error en /debugadmin:", error);
    return {
      success: false,
      message: "⚠️ Error obteniendo información del sistema.",
    };
  }
}

// =========================
// Router principal unificado (migrado desde router.js)
// =========================

/* ========================
   Helpers
   ======================== */

function onlyDigits(v) { return String(v || '').replace(/\D/g, '') }

function normalizeDigits(userOrJid) {
  try {
    let s = String(userOrJid || '')
    const at = s.indexOf('@')
    if (at > 0) s = s.slice(0, at)
    const col = s.indexOf(':')
    if (col > 0) s = s.slice(0, col)
    return s.replace(/\D/g, '')
  } catch {
    return onlyDigits(userOrJid)
  }
}

function isAdminFlag(p) {
  try {
    return !!(
      p &&
      (
        p.admin === 'admin' ||
        p.admin === 'superadmin' ||
        p.admin === true ||
        p.isAdmin === true ||
        p.isSuperAdmin === true
      )
    )
  } catch {
    return false
  }
}

async function isBotAdminInGroup(sock, groupJid) {
  try {
    const meta = await antibanSystem.queryGroupMetadata(sock, groupJid)
    const bot = normalizeDigits(sock?.user?.id || '')
    const me = (meta?.participants || []).find(x => normalizeDigits(x?.id || x?.jid) === bot)
    return isAdminFlag(me)
  } catch { return false }
}

async function tryImportModuleWithRetries(modulePath, opts = {}) {
  const retries = Number.isFinite(Number(opts.retries)) ? Number(opts.retries) : 3
  const timeoutMs = Number.isFinite(Number(opts.timeoutMs)) ? Number(opts.timeoutMs) : 20000
  const backoffMs = Number.isFinite(Number(opts.backoffMs)) ? Number(opts.backoffMs) : 1500

  const start = Date.now()
  let resolvedPath = modulePath

  try {
    if (modulePath.startsWith('.') || modulePath.startsWith('/') || /^[A-Za-z]:\\/.test(modulePath)) {
      const abs = path.isAbsolute(modulePath) ? modulePath : path.resolve(process.cwd(), modulePath)
      resolvedPath = pathToFileURL(abs).href
    }
  } catch { }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const now = Date.now()
      if (now - start > timeoutMs) {
        throw new Error(`timeout importing ${modulePath} after ${timeoutMs}ms`)
      }
      const mod = await import(resolvedPath)
      return mod
    } catch (e) {
      if (attempt >= retries) throw e
      await sleep(backoffMs * attempt)
    }
  }

  throw new Error(`Could not import module ${modulePath} after ${retries} attempts`)
}

/* ========================
   extractText y parseCommand
   ======================== */

function extractText(message) {
  try {
    const pick = (obj) => {
      if (!obj || typeof obj !== 'object') return ''

      // 1. Texto normal primero
      const base = (
        obj.conversation ||
        obj.extendedTextMessage?.text ||
        obj.imageMessage?.caption ||
        obj.videoMessage?.caption ||
        ''
      )
      if (base) return String(base).trim()

      // 2. Botones clÃ¡sicos
      const btnId =
        obj.buttonsResponseMessage?.selectedButtonId ||
        obj.templateButtonReplyMessage?.selectedId ||
        obj.buttonReplyMessage?.selectedButtonId
      if (btnId) return String(btnId).trim()

      // 3. LISTA CLÃ?SICA - CRÃ?TICO PARA GRUPOS
      const listResp = obj.listResponseMessage
      if (listResp) {
        const rowId =
          listResp.singleSelectReply?.selectedRowId ||
          listResp.singleSelectReply?.selectedId ||
          listResp.title
        if (rowId) return String(rowId).trim()
      }

      // 4. RESPUESTA INTERACTIVA (nuevo formato WhatsApp)
      const intResp = obj.interactiveResponseMessage
      if (intResp) {
        // 4a. Native Flow Response
        if (intResp.nativeFlowResponseMessage?.paramsJson) {
          try {
            const params = JSON.parse(intResp.nativeFlowResponseMessage.paramsJson)
            const id = params?.id || params?.command || params?.rowId || params?.row_id
            if (id && typeof id === 'string') return String(id).trim()
          } catch { }
        }

        // 4b. List Response dentro de Interactive
        if (intResp.listResponseMessage?.singleSelectReply) {
          const rowId = intResp.listResponseMessage.singleSelectReply.selectedRowId
          if (rowId && typeof rowId === 'string') return String(rowId).trim()
        }

        // 4c. Body text (Ãºltimo recurso)
        if (intResp.body?.text) {
          return String(intResp.body.text).trim()
        }
      }

      // 5. MENSAJE INTERACTIVO (estructura de envÃ­o)
      const intMsg = obj.interactiveMessage
      if (intMsg) {
        // 5a. Reply con selectedRowId
        const selectedRowId =
          intMsg.replyMessage?.selectedRowId ||
          intMsg.selectedRowId ||
          intMsg.nativeFlowResponseMessage?.selectedRowId

        if (selectedRowId && typeof selectedRowId === 'string') {
          return String(selectedRowId).trim()
        }

        // 5b. Display text
        const displayText =
          intMsg.replyMessage?.selectedDisplayText ||
          intMsg.body?.selectedDisplayText ||
          intMsg.body?.text
        if (displayText && typeof displayText === 'string') {
          return String(displayText).trim()
        }

        // 5c. Native Flow Buttons
        const nativeFlowMsg = intMsg.nativeFlowMessage
        if (nativeFlowMsg && Array.isArray(nativeFlowMsg.buttons)) {
          for (const btn of nativeFlowMsg.buttons) {
            if (btn.buttonParamsJson) {
              try {
                const params = JSON.parse(btn.buttonParamsJson)
                const id =
                  params?.selectedButtonId ||
                  params?.response?.selectedRowId ||
                  params?.id ||
                  params?.command
                if (id) return String(id).trim()
              } catch { }
            }
          }
        }

        // 5d. Params JSON directo
        const paramsJson = intMsg.nativeFlowResponseMessage?.paramsJson
        if (paramsJson && typeof paramsJson === 'string') {
          try {
            const params = JSON.parse(paramsJson)
            const id = params?.id || params?.command || params?.rowId || params?.row_id
            if (id) return String(id).trim()
          } catch { }
        }
      }

      return ''
    }

    const m = message?.message || {}
    let out = pick(m)
    if (out) return out

    // Revisar mensajes anidados (viewOnce / ephemeral)
    const inner =
      m.viewOnceMessage?.message ||
      m.ephemeralMessage?.message ||
      m.documentWithCaptionMessage?.message ||
      null

    if (inner) {
      out = pick(inner)
      if (out) return out

      const inner2 =
        inner.viewOnceMessage?.message ||
        inner.ephemeralMessage?.message ||
        null

      if (inner2) {
        out = pick(inner2)
        if (out) return out
      }
    }

    return ''
  } catch (e) {
    console.error('[extractText] error:', e?.message)
    return ''
  }
}

function parseCommand(text) {
  const raw = String(text || '').trim()
  if (!raw) return { command: '', args: [] }

  const prefixes = Array.from(
    new Set(
      ((process.env.CMD_PREFIXES || '/!.#?$~').split('')).concat(['/', '!', '.']),
    ),
  )
  const s = raw.replace(/^\s+/, '')

  if (s.startsWith('/')) {
    const parts = s.slice(1).trim().split(/\s+/)
    return { command: `/${(parts.shift() || '').toLowerCase()}`, args: parts }
  }

  if (prefixes.includes(s[0])) {
    const parts = s.slice(1).trim().split(/\s+/)
    const token = (parts.shift() || '').toLowerCase().replace(/^[\/.!#?$~]+/, '')
    return { command: `/${token}`, args: parts }
  }

  if (s.startsWith('btn_')) return { command: '', args: [] }
  if (s.startsWith('copy_')) return { command: '/handlecopy', args: [s] }

  if (s.startsWith('todo_')) {
    const parts = s.split('_')
    if (parts.length >= 3) {
      const action = parts[1]
      const listId = parts.slice(2).join('_')
      return { command: `/todo-${action}`, args: [listId] }
    }
  }

  return { command: '', args: [] }
}

/* ========================
   traceEnabled & summarizePayload
   ======================== */

function traceEnabled() {
  try {
    return String(process.env.TRACE_ROUTER || '').toLowerCase() === 'true'
  } catch {
    return false
  }
}

function summarizePayload(payload) {
  try {
    if (!payload) return 'null'
    if (typeof payload === 'string') {
      return payload.length > 80 ? payload.slice(0, 77) + '...' : payload
    }
    if (payload.text) {
      const t = String(payload.text)
      return t.length > 80 ? t.slice(0, 77) + '...' : t
    }
    const keys = Object.keys(payload)
    if (payload.image) return '[image] ' + (payload.caption || '')
    if (payload.video) return '[video] ' + (payload.caption || '')
    if (payload.audio) return '[audio]'
    if (payload.sticker) return '[sticker]'
    if (payload.buttons) return '[buttons] ' + (payload.text || '')
    if (payload.sections) return '[list] ' + (payload.title || '')
    if (payload.interactiveMessage) return 'interactiveMessage'
    if (payload.viewOnceMessage?.message?.interactiveMessage) return 'interactiveMessage'
    if (payload.listMessage) return 'listMessage'
    if (payload.templateButtons) return 'templateButtons'
    if (payload.image) return 'image'
    if (payload.video) return 'video'
    if (payload.audio) return 'audio'
    if (payload.sticker) return 'sticker'
    if (payload.text) return 'text'
    return keys.slice(0, 5).join(',')
  } catch { return 'payload' }
}

async function safeSend(sock, jid, payload, opts = {}, silentOnFail = false) {
  let e1 = null, e2 = null
  try { await sock.sendMessage(jid, payload, opts); return true } catch (err) { e1 = err }
  try {
    const txt = (payload && payload.text) ? payload.text : '⚠️ No pude enviar respuesta. Intenta de nuevo.'
    await sock.sendMessage(jid, { text: txt }, opts)
    return true
  } catch (err2) {
    e2 = err2
  }

  try {
    if (traceEnabled()) console.warn('[router.send] failed:', summarizePayload(payload), e1?.message || e1, '|', e2?.message || e2)
  } catch { }

  if (!silentOnFail) {
    try { await sock.sendMessage(jid, { text: '⚠️ No pude enviar respuesta. Usa /help' }) } catch { }
  }
  return false
}

function toMediaInput(value) {
  if (!value) return null
  if (Buffer.isBuffer(value)) return value
  if (typeof value === 'string') {

    if (/^https?:\/\//i.test(value)) {
      return { url: value }
    }

    try {
      if (fs.existsSync(value)) {
        return fs.readFileSync(value)
      }
    } catch { }

    return value
  }

  if (typeof value === 'object') {
    if (value.url || value.path || value.buffer) return value
  }

  return null
}

function buildSendOptions(result, ctx) {
  const opts = {}
  if (!result || typeof result !== 'object') return opts

  if (result.quoted && ctx?.message?.key) {
    opts.quoted = ctx.message
  }
  if (Array.isArray(result.mentions)) {
    opts.mentions = result.mentions
  }
  return opts
}

function buildVCard(result) {
  try {
    const name = result.vcardName || result.name || 'Contacto'
    const number = result.vcardNumber || result.number
    const waid = result.vcardWaid || number?.replace(/\D/g, '')
    if (!number) return null

    const vcardLines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${name}`,
      waid
        ? `item1.TEL;waid=${waid}:${number}`
        : `TEL:${number}`,
      'END:VCARD'
    ]

    return vcardLines.join('\n')
  } catch {
    return null
  }
}

async function sendListFixed(sock, jid, result, ctx) {
  const sections = Array.isArray(result.sections) ? result.sections : []
  if (!sections.length) {
    return safeSend(sock, jid, { text: result.text || result.message || '⚠️ Lista vacía' })
  }

  const rows = []
  for (const s of sections) {
    const r = Array.isArray(s.rows) ? s.rows : []
    for (const row of r) {
      if (!row || !row.rowId) continue
      rows.push({
        title: row.title || row.rowId,
        rowId: row.rowId,
        description: row.description || ''
      })
    }
  }

  if (!rows.length) {
    return safeSend(sock, jid, { text: result.text || result.message || '⚠️ Lista sin elementos' })
  }

  const listSections = [{
    title: result.sectionTitle || 'Opciones',
    rows
  }]

  const listMsg = {
    text: result.text || result.message || 'Selecciona una opción:',
    footer: result.footer || 'Lista',
    title: result.title || '',
    buttonText: result.buttonText || 'Elegir',
    sections: listSections
  }

  return safeSend(sock, jid, listMsg, buildSendOptions(result, ctx))
}

async function sendButtonsFixed(sock, jid, result, ctx) {
  const buttons = Array.isArray(result.buttons) ? result.buttons : []
  if (!buttons.length) {
    return safeSend(sock, jid, { text: result.text || result.message || '⚠️ No hay botones disponibles' })
  }

  const btns = buttons.map((b, idx) => ({
    buttonId: b.id || `btn_${idx + 1}`,
    buttonText: { displayText: b.text || b.label || `Opción ${idx + 1}` },
    type: 1
  }))

  const btnMsg = {
    text: result.text || result.message || 'Elige una opción:',
    footer: result.footer || '',
    buttons: btns,
    headerType: 1
  }

  return safeSend(sock, jid, btnMsg, buildSendOptions(result, ctx))
}

/* ========================
   sendResult - MÁS ROBUSTO Y SILENCIOSO
   ======================== */
async function sendResult(sock, jid, result, ctx) {
  if (!sock || !jid) return;

  try {
    if (!result) {
      await safeSend(sock, jid, { text: '✅ Listo.' }, buildSendOptions(result, ctx), true);
      return;
    }

    const opts = buildSendOptions(result, ctx);
    const targetJid = jid;

    if (typeof result === 'string') {
      await safeSend(sock, targetJid, { text: result }, opts);
      return;
    }

    if (result.message && (!result.type || result.type === 'text')) {
      await safeSend(sock, targetJid, { text: result.message, mentions: result.mentions }, opts);
      return;
    }

    if (result.type === 'reaction' && result.emoji) {
      const key = ctx?.message?.key;
      if (key) await sock.sendMessage(targetJid, { react: { text: result.emoji, key } });
      return;
    }

    if (result.type === 'vcard') {
      const vcard = buildVCard(result);
      if (vcard) {
        const contactMsg = {
          contacts: {
            displayName: result.vcardName || result.name || 'Contacto',
            contacts: [{ displayName: result.vcardName || result.name || 'Contacto', vcard }]
          }
        };
        await safeSend(sock, targetJid, contactMsg, opts);
      } else {
        await safeSend(sock, targetJid, { text: '⚠️ No se pudo construir el contacto.' }, opts);
      }
      return;
    }

    if (result.type === 'list' || result.sections) {
      await sendListFixedV2(sock, targetJid, result, ctx);
      return;
    }

    if (result.type === 'buttons' || result.buttons) {
      await sendButtonsFixedV2(sock, targetJid, result, ctx);
      return;
    }

    const mediaTypes = ['image', 'video', 'audio', 'sticker'];
    const mediaType = mediaTypes.find(t => result.type === t && (result[t] || result.media || result.file));

    if (mediaType) {
      const media = toMediaInput(result[mediaType] || result.media || result.file);
      if (media) {
        const msg = { [mediaType]: media };
        if (result.caption) msg.caption = result.caption;
        if (result.mimetype) msg.mimetype = result.mimetype;
        await safeSend(sock, targetJid, msg, opts);
      } else {
        await safeSend(sock, targetJid, { text: `⚠️ No se pudo cargar el ${mediaType}.` }, opts);
      }
      return;
    }

    if (result.payload && typeof result.payload === 'object') {
      const payload = { ...result.payload };
      if (!payload.text && result.text) payload.text = result.text;
      await safeSend(sock, targetJid, payload, opts);
      return;
    }

    await safeSend(sock, targetJid, { text: result.text || '✅ Listo' }, opts);
  } catch (error) {
    // Silenciar errores para no crashear el subbot
  }
}


/* ========================
   dispatch - REFACTORIZADO Y ESTABLE
   ======================== */
export async function dispatch(ctx = {}, runtimeContext = {}) {
  const { sock, remoteJid, isGroup } = ctx;
  if (!sock || !remoteJid) return false;

  const effectiveCtx = { ...ctx, ...runtimeContext };

  try {
    const textForGlobal = (ctx.text != null ? String(ctx.text) : extractText(ctx.message)) || '';
    const on = await isBotGloballyActive();
    if (!on && !/^\/?bot\s+global\b/i.test(textForGlobal)) return false;

    if (isGroup && !ctx.fromMe) {
      const botEnabled = await getGroupBool(remoteJid, 'bot_enabled', true);
      if (!botEnabled && !/^\/?bot\b/i.test(textForGlobal)) return false;
    }

    const text = (ctx.text != null ? String(ctx.text) : extractText(ctx.message));
    const parsed = parseCommand(text);
    let command = parsed.command;
    const args = parsed.args || [];

    if (!command) return false;

    if (isGroup) {
      const senderJid = ctx.sender || ctx.participant || ctx.remoteJid;
      if (senderJid) {
        const banned = await db('group_bans').where({ group_id: remoteJid, user_jid: onlyDigits(senderJid) }).first();
        if (banned && command !== '/unban') return false;
      }
    }

    let registry = global.__COMMAND_REGISTRY?.registry;
    if (!registry) {
      try {
        const registryModulePath = path.resolve(__dirname, './src/commands/registry/index.js');
        const mod = await tryImportModuleWithRetries(registryModulePath, { retries: 2, timeoutMs: 10000, backoffMs: 500 });
        const get = mod?.getCommandRegistry;
        registry = typeof get === 'function' ? get() : null;
        if (registry) global.__COMMAND_REGISTRY = { registry, loadedFrom: registryModulePath, timestamp: Date.now() };
      } catch (e) {
        // Fallback a lazy-loading si el pre-load falla.
      }
    }

    const entry = registry?.get(command);
    if (!entry || typeof entry.handler !== 'function') {
      return false; // Comando no encontrado, no hacer nada.
    }

    const params = { ...effectiveCtx, text, command, args, fecha: new Date().toISOString() };

    try {
      const result = await antibanMiddleware.wrapCommand(() => entry.handler(params), command);
      const isSuccess = result?.success !== false && !result?.error;

      try {
        await sock.sendMessage(remoteJid, { react: { text: isSuccess ? '✅' : '❌', key: ctx.message.key } });
      } catch { /* ignorar error de reacción */ }

      if (Array.isArray(result)) {
        for (const r of result) await sendResult(sock, remoteJid, r, ctx);
      } else {
        await sendResult(sock, remoteJid, result, ctx);
      }
      return true;
    } catch (e) {
      try {
        await sock.sendMessage(remoteJid, { react: { text: '❌', key: ctx.message.key } });
      } catch { /* ignorar */ }

      await safeSend(sock, remoteJid, { text: `⚠️ Error ejecutando ${command}: ${e?.message || e}` });
      return true; // Se manejó el error, así que cuenta como 'handled'.
    }
  } catch (error) {
    return false; // Error en la lógica de pre-validación.
  }
}

// =========================
// IA (Gemini) y adaptador de compatibilidad
// =========================

export async function chatWithAI(message, context = "panel") {
  const prompt = String(message || "").trim()
  if (!prompt) {
    return { success: false, error: "Texto vacÇðo" }
  }

  if (!hasGeminiApiKey()) {
    return { success: false, error: "GEMINI_API_KEY no configurada" }
  }

  try {
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash"
    const model = getGeminiModel(modelName)
    const systemPrefix =
      "Eres el asistente del panel de administraciÇün de KONMI BOT. Responde en espaÇñol, claro y directo.\n\n"
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
    return { success: false, error: "Texto vacÇðo" }
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
    return { success: false, error: "Texto vacÇðo" }
  }

  if (!hasGeminiApiKey()) {
    return { success: false, error: "GEMINI_API_KEY no configurada" }
  }

  try {
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash"
    const model = getGeminiModel(modelName)
    const instruction = [
      "Analiza el siguiente contenido y clasifÇðcalo.",
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

// Helpers avanzados para listas/botones en grupos (nativeFlow)
async function sendListFixedV2(sock, jid, result, ctx) {
  const isGroup = typeof jid === 'string' && jid.endsWith('@g.us')
  const opts = buildSendOptions(result, ctx)

  const classicPayload = {
    text: result.text || 'Elige una opción de la lista',
    title: result.title || undefined,
    footer: result.footer || undefined,
    buttonText: result.buttonText || 'Ver opciones',
    sections: (result.sections || []).map(sec => ({
      title: sec.title || '',
      rows: (sec.rows || []).map(r => ({
        title: r.title || 'Opción',
        description: r.description || '',
        rowId: r.rowId || r.id || r.command || r.text || 'noop'
      }))
    }))
  }

  const interactivePayload = {
    viewOnceMessage: {
      message: {
        interactiveMessage: {
          header: result.title ? {
            title: result.title,
            hasMediaAttachment: false
          } : undefined,
          body: {
            text: result.text || 'Elige una opción'
          },
          footer: result.footer ? {
            text: result.footer
          } : undefined,
          nativeFlowMessage: {
            buttons: [{
              name: "single_select",
              buttonParamsJson: JSON.stringify({
                title: result.buttonText || "Ver opciones",
                sections: (result.sections || []).map(sec => ({
                  title: sec.title || '',
                  rows: (sec.rows || []).map(r => ({
                    header: r.title || 'Opción',
                    title: r.title || 'Opción',
                    description: r.description || '',
                    id: r.rowId || r.id || r.command || 'noop'
                  }))
                }))
              })
            }]
          },
          contextInfo: {
            mentionedJid: result.mentions || []
          }
        }
      }
    }
  }

  try {
    await sock.sendMessage(jid, classicPayload, opts)
    console.log('[sendListV2] formato clásico enviado')
    return true
  } catch (err1) {
    console.log('[sendListV2] formato clásico falló:', err1?.message || err1)

    if (isGroup) {
      try {
        await sock.sendMessage(jid, interactivePayload, opts)
        console.log('[sendListV2] formato interactivo enviado (grupo)')
        return true
      } catch (err2) {
        console.log('[sendListV2] formato interactivo falló:', err2?.message || err2)
      }
    }
  }

  console.log('[sendListV2] usando fallback texto plano')
  let txt = (result.text || result.title || 'Menú') + '\n\n'
  for (const sec of result.sections || []) {
    if (sec.title) txt += `*${sec.title}*\n`
    for (const r of sec.rows || []) {
      txt += `- ${r.title}${r.description ? ` (${r.description})` : ''}\n`
      txt += `  Usa: ${r.rowId}\n`
    }
    txt += '\n'
  }

  try {
    await sock.sendMessage(jid, { text: txt }, opts)
    return true
  } catch {
    return false
  }
}

async function sendButtonsFixedV2(sock, jid, result, ctx) {
  const isGroup = typeof jid === 'string' && jid.endsWith('@g.us')
  const opts = buildSendOptions(result, ctx)
  const buttons = Array.isArray(result.buttons) ? result.buttons : []

  if (!buttons.length) {
    return safeSend(sock, jid, { text: result.text || result.message || 'No hay botones disponibles' }, opts)
  }

  const classicPayload = {
    text: result.text || '',
    footer: result.footer,
    templateButtons: buttons.map((b, i) => {
      const text = b.text || b.title || b.displayText || 'Acción'
      if (b.url) {
        return { index: i + 1, urlButton: { displayText: text, url: b.url } }
      }
      return {
        index: i + 1,
        quickReplyButton: {
          displayText: text,
          id: b.id || b.command || b.buttonId || `/btn_${i + 1}`
        }
      }
    }),
    mentions: result.mentions
  }

  const interactivePayload = {
    viewOnceMessage: {
      message: {
        interactiveMessage: {
          body: {
            text: result.text || ''
          },
          footer: result.footer ? {
            text: result.footer
          } : undefined,
          nativeFlowMessage: {
            buttons: buttons.map((b, i) => {
              const text = b.text || b.title || b.displayText || 'Acción'
              const id = b.id || b.command || b.buttonId || `/btn_${i + 1}`

              if (b.url) {
                return {
                  name: "cta_url",
                  buttonParamsJson: JSON.stringify({
                    display_text: text,
                    url: b.url,
                    merchant_url: b.url
                  })
                }
              }

              return {
                name: "quick_reply",
                buttonParamsJson: JSON.stringify({
                  display_text: text,
                  id: id
                })
              }
            })
          },
          contextInfo: {
            mentionedJid: result.mentions || []
          }
        }
      }
    }
  }

  try {
    await sock.sendMessage(jid, classicPayload, opts)
    console.log('[sendButtonsV2] formato clásico enviado')
    return true
  } catch (err1) {
    console.log('[sendButtonsV2] formato clásico falló:', err1?.message || err1)

    if (isGroup) {
      try {
        await sock.sendMessage(jid, interactivePayload, opts)
        console.log('[sendButtonsV2] formato interactivo enviado (grupo)')
        return true
      } catch (err2) {
        console.log('[sendButtonsV2] formato interactivo falló:', err2?.message || err2)
      }
    }
  }

  console.log('[sendButtonsV2] usando fallback texto plano')
  let txt = (result.text || 'Opciones:') + '\n\n'
  for (const b of buttons) {
    const text = b.text || b.title || b.displayText || 'Acción'
    const id = b.id || b.command || b.buttonId || ''
    txt += `• ${text}${id ? ` -> ${id}` : ''}\n`
  }

  try {
    await sock.sendMessage(jid, { text: txt }, opts)
    return true
  } catch {
    return false
  }
}

// Adaptador para mantener compatibilidad con la API anterior
export async function routeCommand(ctx = {}) {
  const handled = await dispatch(ctx);
  return { handled: !!handled };
}
