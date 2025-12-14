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
  // await cleanupInactiveSubbots();

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

// NEW, SELF-CONTAINED COMMAND DISPATCHER

// =========================



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

    text: body || 'Selecciona una opci?n',

    footer: footer || '',

    buttons: limitedButtons.map((btn, idx) => ({

      buttonId: ensureSlash(btn.id || btn.command || btn.buttonId || btn.rowId || (btn.copy ? `/copy ${btn.copy}` : null) || '/help'),

      buttonText: { displayText: btn.text || btn.displayText || btn.title || `Opci?n ${idx + 1}` },

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

// Maps para gestión de comandos
const commandModules = new Map();
const commandMap = new Map();

// Mapeo completo de comandos a funciones específicas en los módulos
const COMMAND_FUNCTION_MAP = {
  // download-commands.js
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
  'translate': 'handleTranslate',
  'tr': 'handleTranslate',
  'weather': 'handleWeather',
  'clima': 'handleWeather',
  'quote': 'handleQuote',
  'fact': 'handleFact',
  'trivia': 'handleTriviaCommand',
  'meme': 'handleMemeCommand',

  // ai.js
  'ia': 'ai',
  'ai': 'ai',
  'clasificar': 'clasificar',

  // ping.js
  'ping': 'ping',

  // status.js
  'status': 'status',

  // help es local, no necesita mapeo
  // 'help': 'help',
  // 'ayuda': 'help',
  // 'menu': 'help',
  'comandos': 'help',

  // subbots.js
  'mybots': 'mybots',
  'mibots': 'mybots',
  'bots': 'bots',

  // aportes.js
  'addaporte': 'addaporte',
  'aportes': 'aportes',
  'myaportes': 'myaportes',
  'misaportes': 'myaportes',
  'aporteestado': 'aporteestado',

  // pedidos.js
  'pedido': 'pedido',
  'pedidos': 'pedidos',
  'mispedidos': 'pedidos',

  // stickers.js
  'sticker': 'sticker',
  's': 'sticker',

  // images.js
  'image': 'image',
  'wallpaper': 'wallpaper',

  // media.js
  'tts': 'tts',

  // utils.js
  'joke': 'joke',
  'horoscope': 'horoscope',
  'horoscopo': 'horoscope',

  // files.js
  'descargar': 'descargar',
  'guardar': 'guardar',
  'archivos': 'archivos',
  'misarchivos': 'misarchivos',

  // games.js
  'game': 'game',
  'juego': 'game',

  // polls.js
  'poll': 'poll',
  'encuesta': 'poll',

  // groups.js
  'kick': 'kick',
  'promote': 'promote',
  'demote': 'demote',
  'lock': 'lock',
  'unlock': 'unlock',

  // group-settings.js
  'settings': 'settings',
  'config': 'settings',

  // bot-control.js
  'bot': 'bot',

  // logs.js
  'logs': 'logs',

  // system-info.js
  'stats': 'stats',
  'estadisticas': 'stats',

  // system.js
  'export': 'export',

  // maintenance.js
  'update': 'update',

  // broadcast.js
  'broadcast': 'broadcast',
  'bc': 'broadcast',

  // profile.js
  'whoami': 'whoami',
  'profile': 'profile',

  // poll.js (Wileys)
  'poll': 'poll',
  'pollmultiple': 'pollMultiple',

  // presence.js (Wileys)
  'typing': 'typing',
  'recording': 'recording',
  'online': 'online',
  'offline': 'offline',
};

// Función para cargar módulo de comando dinámicamente
async function loadCommandModule(moduleName, commandName = null) {
  const cacheKey = commandName ? `${moduleName}:${commandName}` : moduleName;

  if (commandModules.has(cacheKey)) {
    return commandModules.get(cacheKey);
  }

  try {
    const module = await import(`./src/commands/${moduleName}.js`);

    // Buscar el handler en diferentes formas
    let handler = null;

    // 0. Si hay un mapeo específico para este comando, usarlo PRIMERO
    if (commandName && COMMAND_FUNCTION_MAP[commandName]) {
      const functionName = COMMAND_FUNCTION_MAP[commandName];
      if (typeof module[functionName] === 'function') {
        handler = module[functionName];
      } else if (typeof module.default?.[functionName] === 'function') {
        handler = module.default[functionName];
      }
    }

    // 1. Buscar module.handler o module.default.handler
    if (!handler && typeof module.handler === 'function') {
      handler = module.handler;
    } else if (typeof module.default?.handler === 'function') {
      handler = module.default.handler;
    }
    // 2. Buscar module.default si es función
    else if (typeof module.default === 'function') {
      handler = module.default;
    }
    // 3. Buscar función con el nombre del módulo exacto
    else if (typeof module[moduleName] === 'function') {
      handler = module[moduleName];
    }
    // 4. Buscar función con nombre similar al módulo
    else {
      // Intentar variaciones del nombre
      const variations = [
        moduleName.replace(/-/g, ''),           // 'download-commands' -> 'downloadcommands'
        moduleName.split('-').pop(),            // 'download-commands' -> 'commands'
        moduleName.split('-')[0],               // 'download-commands' -> 'download'
        moduleName.replace(/-/g, '_'),          // 'download-commands' -> 'download_commands'
      ];

      for (const variant of variations) {
        if (typeof module[variant] === 'function') {
          handler = module[variant];
          console.log(`✅ Encontrado handler: ${variant} para módulo ${moduleName}`);
          break;
        }
      }

      // 5. Si aún no encontramos, buscar la primera función exportada
      if (!handler) {
        const functions = Object.keys(module).filter(k => typeof module[k] === 'function');
        if (functions.length > 0) {
          handler = module[functions[0]];
          console.log(`✅ Usando primera función: ${functions[0]} para módulo ${moduleName}`);
        }
      }
    }

    if (typeof handler === 'function') {
      const wrappedModule = {
        ...module,
        handler: async (ctx) => {
          // Llamar al handler con el contexto
          return await handler(ctx);
        }
      };
      commandModules.set(cacheKey, wrappedModule);
      return wrappedModule;
    } else {
      console.warn(`⚠️ No se encontró handler en el módulo: ${moduleName}`);
      console.warn(`   Exports disponibles:`, Object.keys(module));
    }
  } catch (error) {
    console.warn(`⚠️ No se pudo cargar el módulo: ${moduleName}`, error.message);
  }

  return null;
}

// Sistema simplificado: los comandos se mapean directamente en COMMAND_FUNCTION_MAP
console.log(`✅ Sistema de comandos inicializado con ${Object.keys(COMMAND_FUNCTION_MAP).length} comandos mapeados`);





function cleanText(text) {
  try {
    if (text == null) return '';
    let s = String(text);
    s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '');
    s = s.replace(/\r\n/g, '\n');
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

  const prefixes = Array.from(
    new Set(
      (process.env.CMD_PREFIXES || '/!.#?$~')
        .split('')
        .concat(['/', '!', '.']),
    ),
  )

  const s = raw.trim()
  let prefixUsed = null

  // Verificar si tiene prefijo
  for (const p of prefixes) {
    if (s.startsWith(p)) {
      prefixUsed = p
      break
    }
  }

  // Si tiene prefijo, procesarlo normalmente
  if (prefixUsed !== null) {
    const parts = s.slice(prefixUsed.length).trim().split(/\s+/)
    const command = parts.shift() || ''
    return { command: command, args: parts }
  }

  // Si no tiene prefijo, verificar si es un comando especial (botones del menú help)
  const specialCommands = [
    // Categorías
    'cat_descargas', 'cat_ia', 'cat_interactivo', 'cat_media', 'cat_utilidades', 'cat_grupo', 'cat_admin',
    'cat_entretenimiento', 'cat_archivos', 'cat_aportes',
    // Comandos individuales
    'help_play', 'help_video', 'help_tiktok', 'help_instagram', 'help_spotify',
    'help_ia', 'help_image', 'help_clasificar', 'help_sticker', 'help_meme',
    'help_quote', 'help_translate', 'help_weather', 'help_ping', 'help_bot',
    'help_groupinfo', 'help_qr', 'help_code', 'help_mybots', 'help_menu'
  ];

  if (specialCommands.includes(s)) {
    return { command: s, args: [] }
  }

  // No es comando válido
  return { command: '', args: [] }
}



// Comando de ayuda integrado con listas interactivas (funciona en grupos y privado)
async function handleHelpCommand(ctx) {
  const { sock, remoteJid, sender, isGroup } = ctx;

  console.log('[HELP] Comando help ejecutado en:', remoteJid, 'isGroup:', isGroup);

  const userPhone = normalizePhone(sender || ctx.participant || remoteJid);
  const isAdmin = await isSuperAdmin(userPhone);

  // Menú principal con categorías
  const sections = [
    {
      title: '📋 Categorías Disponibles',
      rows: [
        { title: '📥 Descargas', description: 'YouTube, TikTok, Instagram, Facebook, Twitter', rowId: 'cat_descargas', id: 'cat_descargas' },
        { title: '🤖 Inteligencia Artificial', description: 'IA, Generar imágenes, Clasificar', rowId: 'cat_ia', id: 'cat_ia' },
        { title: '✨ Interactivo', description: 'Reacciones, Encuestas, Estados', rowId: 'cat_interactivo', id: 'cat_interactivo' },
        { title: '🎨 Media & Stickers', description: 'Stickers, Memes, TTS, Wallpapers', rowId: 'cat_media', id: 'cat_media' },
        { title: '🧰 Utilidades', description: 'Traducir, Clima, Ping, Horóscopo', rowId: 'cat_utilidades', id: 'cat_utilidades' },
        { title: '🎮 Entretenimiento', description: 'Juegos, Trivia, Chistes', rowId: 'cat_entretenimiento', id: 'cat_entretenimiento' },
        { title: '📁 Archivos', description: 'Guardar, Descargar, Mis archivos', rowId: 'cat_archivos', id: 'cat_archivos' },
        { title: '👥 Grupo', description: 'Administración de grupos, Configuración', rowId: 'cat_grupo', id: 'cat_grupo' },
        { title: '📊 Aportes & Pedidos', description: 'Sistema de aportes y pedidos', rowId: 'cat_aportes', id: 'cat_aportes' }
      ]
    }
  ];

  // Agregar categoría de admin si es admin
  if (isAdmin) {
    sections[0].rows.push({
      title: '⚙️ Administración',
      description: 'Subbots, Sistema, Logs, Broadcast',
      rowId: 'cat_admin',
      id: 'cat_admin'
    });
  }

  console.log('[HELP] Retornando menú principal con', sections[0].rows.length, 'categorías');

  return {
    type: 'list',
    text: '🤖 *KONMI BOT - MENÚ PRINCIPAL*\n\n¡Hola! Soy tu asistente de WhatsApp.\n\nSelecciona una categoría para ver todos los comandos disponibles:',
    title: '📋 Menú de Comandos',
    buttonText: 'Seleccionar Categoría',
    footer: `KONMI BOT © 2025 | ${isAdmin ? '👑 Admin' : '👤 Usuario'}`,
    sections: sections
  };
}

// Manejador para respuestas del menú help (categorías y comandos individuales)
async function handleHelpResponse(ctx) {
  const { sock, remoteJid, args, text } = ctx;
  const category = args[0] || text || '';

  console.log('[HELP_RESPONSE] Procesando:', category);

  // Manejadores de categorías - TEXTO PLANO
  if (category === 'cat_descargas') {
    return {
      text: `📥 *COMANDOS DE DESCARGAS*

🎵 */play* <nombre o URL>
   Descarga audio de YouTube
   Ejemplo: /play despacito

🎬 */video* <nombre o URL>
   Descarga video de YouTube
   Ejemplo: /video tutorial javascript

📱 */tiktok* <URL>
   Descarga videos de TikTok
   Ejemplo: /tiktok https://vm.tiktok.com/...

� */instagram* <URL>
   Descarga contenido de Instagram
   Ejemplo: /instagram https://instagram.com/p/...

🎧 */spotify* <búsqueda>
   Busca música en Spotify
   Ejemplo: /spotify bad bunny

💡 *Tip:* Usa /help para volver al menú principal`
    };
  }

  if (category === 'cat_ia') {
    return {
      text: `🤖 *COMANDOS DE INTELIGENCIA ARTIFICIAL*

🧠 */ia* <pregunta>
   Pregunta a Gemini AI
   Ejemplo: /ia explícame qué es javascript

🎨 */image* <descripción>
   Generar imagen con IA
   Ejemplo: /image un gato astronauta

📊 */clasificar* <texto>
   Clasificar texto (positivo/negativo)
   Ejemplo: /clasificar este producto es excelente

💡 *Tip:* Usa /help para volver al menú principal`
    };
  }

  if (category === 'cat_media') {
    return {
      text: `🎨 *COMANDOS DE MEDIA & STICKERS*

✨ */sticker* (también */s*)
   Crear sticker de imagen o video
   Uso: Envía imagen/video con /sticker
   O responde a una imagen con /sticker

�️* */wallpaper* <búsqueda>
   Buscar wallpapers
   Ejemplo: /wallpaper naturaleza

�️ */tots* <texto>
   Convertir texto a voz
   Ejemplo: /tts Hola mundo

� */meme*U
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

💡 *Tip:* Usa /help para volver al menú principal`
    };
  }

  if (category === 'cat_grupo') {
    return {
      text: `👥 *COMANDOS DE GRUPO*

🤖 */bot* <on/off/status>
   Controlar el bot en este grupo
   /bot on - Activar bot
   /bot off - Desactivar bot
   /bot status - Ver estado
   ⚠️ Solo admins pueden usarlo

ℹ️ */groupinfo*
   Mostrar información del grupo
   Ejemplo: /groupinfo

⚙️ */settings* (también */config*)
   Configuración del grupo
   Ejemplo: /settings
   ⚠️ Solo admins pueden usarlo

👢 */kick* @usuario
   Expulsar usuario del grupo
   Ejemplo: /kick @usuario
   ⚠️ Solo admins pueden usarlo

⬆️ */promote* @usuario
   Promover usuario a admin
   Ejemplo: /promote @usuario
   ⚠️ Solo admins pueden usarlo

⬇️ */demote* @usuario
   Quitar admin a usuario
   Ejemplo: /demote @usuario
   ⚠️ Solo admins pueden usarlo

🔒 */lock*
   Cerrar grupo (solo admins pueden escribir)
   ⚠️ Solo admins pueden usarlo

🔓 */unlock*
   Abrir grupo (todos pueden escribir)
   ⚠️ Solo admins pueden usarlo

💡 *Tip:* Usa /help para volver al menú principal`
    };
  }

  if (category === 'cat_admin') {
    return {
      text: `⚙️ *COMANDOS DE ADMINISTRACIÓN*

📱 */qr*
   Crear un subbot con código QR
   Proceso: Bot genera QR → Escaneas → Subbot creado
   ⚠️ Solo para administradores

🔑 */code* <número>
   Crear subbot con código de emparejamiento
   Ejemplo: /code 34612345678
   ⚠️ Solo para administradores

🤖 */mybots* (también */bots*)
   Ver tus subbots activos
   Ejemplo: /mybots

📊 */stats* (también */estadisticas*)
   Estadísticas del sistema
   Ejemplo: /stats

📋 */logs*
   Ver logs del sistema
   Ejemplo: /logs

📢 */broadcast* <mensaje> (también */bc*)
   Enviar mensaje a todos los grupos
   Ejemplo: /broadcast Hola a todos
   ⚠️ Solo para administradores

🔄 */update*
   Actualizar el sistema
   ⚠️ Solo para administradores

📤 */export*
   Exportar datos del sistema
   ⚠️ Solo para administradores

💡 *Tip:* Usa /help para volver al menú principal`
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

   ¡No necesitas hacer nada, es automático!

📊 */poll* <pregunta> | opción1 | opción2
   Crear encuesta de una sola opción
   Ejemplo: /poll ¿Te gusta? | Sí | No

📊 */pollmultiple* <pregunta> | opción1 | opción2
   Crear encuesta de múltiples opciones
   Ejemplo: /pollmultiple ¿Qué te gusta? | Pizza | Tacos | Sushi

⌨️ */typing* [segundos]
   Simular que estás escribiendo
   Ejemplo: /typing 5

🎤 */recording* [segundos]
   Simular que estás grabando audio
   Ejemplo: /recording 3

🟢 */online*
   Cambiar estado a disponible
   Ejemplo: /online

⚫ */offline*
   Cambiar estado a no disponible
   Ejemplo: /offline

💡 *Tip:* Usa /help para volver al menú principal`
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

  // Volver al menú principal
  if (category === 'help_menu') {
    return await handleHelpCommand(ctx);
  }

  // Ayuda individual de comandos
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

// Registrar comando de ayuda
commandMap.set('help', {
  handler: handleHelpCommand,
  category: 'Básicos',
  description: 'Mostrar ayuda',
  isLocal: true
});
commandMap.set('ayuda', {
  handler: handleHelpCommand,
  category: 'Básicos',
  description: 'Mostrar ayuda',
  isLocal: true
});
commandMap.set('menu', {
  handler: handleHelpCommand,
  category: 'Básicos',
  description: 'Mostrar menú',
  isLocal: true
});

// Registrar manejadores para respuestas del menú
for (const key of Object.keys({
  // Categorías
  cat_descargas: 1, cat_ia: 1, cat_interactivo: 1, cat_media: 1, cat_utilidades: 1, cat_grupo: 1, cat_admin: 1,
  cat_entretenimiento: 1, cat_archivos: 1, cat_aportes: 1,
  // Comandos individuales
  help_play: 1, help_video: 1, help_tiktok: 1, help_instagram: 1, help_spotify: 1,
  help_ia: 1, help_image: 1, help_clasificar: 1, help_sticker: 1, help_meme: 1,
  help_quote: 1, help_translate: 1, help_weather: 1, help_ping: 1, help_bot: 1,
  help_groupinfo: 1, help_qr: 1, help_code: 1, help_mybots: 1, help_menu: 1
})) {
  commandMap.set(key, {
    handler: handleHelpResponse,
    category: 'Sistema',
    description: 'Respuesta de menú',
    isLocal: true
  });
}

commandMap.set('comandos', {
  handler: handleHelpCommand,
  category: 'Básicos',
  description: 'Mostrar comandos',
  isLocal: true
});

// ===== REGISTRO COMPLETO DE COMANDOS =====

// Comandos básicos
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
commandMap.set('game', { moduleName: 'games', category: 'Entretenimiento', description: 'Juegos' });
commandMap.set('juego', { moduleName: 'games', category: 'Entretenimiento', description: 'Juegos' });

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

// Comandos de admin - Subbots
commandMap.set('qr', { moduleName: 'subbots', category: 'Admin', description: 'Crear subbot con QR', admin: true });
commandMap.set('code', { moduleName: 'pairing', category: 'Admin', description: 'Crear subbot con código', admin: true });
commandMap.set('mybots', { moduleName: 'mybots', category: 'Admin', description: 'Ver mis subbots', admin: true });
commandMap.set('mibots', { moduleName: 'mybots', category: 'Admin', description: 'Ver mis subbots', admin: true });
commandMap.set('bots', { moduleName: 'bots', category: 'Admin', description: 'Ver todos los bots', admin: true });

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

// ===== COMANDOS DE WILEYS =====

// Encuestas mejoradas (ya existía poll, ahora agregamos pollmultiple)
commandMap.set('pollmultiple', { moduleName: 'poll', category: 'Interactivo', description: 'Encuesta múltiple' });

// Estados de presencia
commandMap.set('typing', { moduleName: 'presence', category: 'Utilidades', description: 'Simular escribiendo' });
commandMap.set('recording', { moduleName: 'presence', category: 'Utilidades', description: 'Simular grabando' });
commandMap.set('online', { moduleName: 'presence', category: 'Utilidades', description: 'Estado disponible' });
commandMap.set('offline', { moduleName: 'presence', category: 'Utilidades', description: 'Estado no disponible' });

async function sendResult(sock, jid, result, ctx) {
  if (!sock || !jid) return;

  try {
    // Mostrar "escribiendo..." antes de enviar (más natural)
    const showPresence = process.env.SHOW_TYPING === 'true';
    if (showPresence) {
      await sock.sendPresenceUpdate('composing', jid).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 500)); // Pequeño delay
    }

    if (!result) {
      // No enviar mensaje "Listo", solo reaccionar (ya se hace en dispatch)
      if (showPresence) await sock.sendPresenceUpdate('paused', jid).catch(() => {});
      return;
    }

    // Si result.success === true sin mensaje, no enviar nada (solo reacción)
    if (result.success === true && !result.text && !result.message) {
      if (showPresence) await sock.sendPresenceUpdate('paused', jid).catch(() => {});
      return;
    }

    if (typeof result === 'string') {
      await sock.sendMessage(jid, { text: result });
      if (showPresence) await sock.sendPresenceUpdate('paused', jid).catch(() => {});
      return;
    }

    // Manejar tipos de media (audio, video, image)
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
    console.error("Error in sendResult:", error);
  }
}



export async function dispatch(ctx = {}, runtimeContext = {}) {
  const { sock, remoteJid, isGroup, sender } = ctx;
  if (!sock || !remoteJid) return false;

  const effectiveCtx = { ...ctx, ...runtimeContext };

  try {
    const text = (ctx.text != null ? String(ctx.text) : extractText(ctx.message));
    const { command, args } = parseCommand(text);

    console.log('[DISPATCH] Texto:', text, '| Comando:', command, '| Args:', args);

    if (!command) return false;

    // Comandos que siempre funcionan aunque el bot esté off
    const alwaysAllowedCommands = [
      'bot', 'status', 'ping', 'help', 'ayuda', 'menu', 'comandos',
      // Categorías del menú help
      'cat_descargas', 'cat_ia', 'cat_interactivo', 'cat_media', 'cat_utilidades', 'cat_grupo', 'cat_admin',
      'cat_entretenimiento', 'cat_archivos', 'cat_aportes',
      // Respuestas del menú help
      'help_play', 'help_video', 'help_tiktok', 'help_instagram', 'help_spotify',
      'help_ia', 'help_image', 'help_clasificar', 'help_sticker', 'help_meme',
      'help_quote', 'help_translate', 'help_weather', 'help_ping', 'help_bot',
      'help_groupinfo', 'help_qr', 'help_code', 'help_mybots', 'help_menu'
    ];

    if (!alwaysAllowedCommands.includes(command.toLowerCase())) {
      // Si es grupo, verificar si el bot está activo en ese grupo específico
      if (isGroup) {
        // Por defecto el bot está ACTIVO (true), solo se desactiva si explícitamente está en false
        const groupActive = await getGroupBool(remoteJid, 'active', true); // DEFAULT: true (activo)
        console.log('[DISPATCH] 🔍 Estado del bot en grupo:', groupActive ? '✅ ACTIVO' : '❌ INACTIVO');

        if (groupActive === false) {
          // Bot desactivado en este grupo
          console.log('[DISPATCH] ⏭️ Bot desactivado en este grupo, ignorando comando:', command);
          return false;
        }
      } else {
        // Si es privado, verificar estado global
        const botActive = await isBotGloballyActive();
        console.log('[DISPATCH] 🔍 Verificando estado global del bot:', botActive ? '✅ ACTIVO' : '❌ INACTIVO');

        if (!botActive) {
          console.log('[DISPATCH] ⏭️ Bot desactivado globalmente, ignorando comando:', command);
          return false;
        }
      }
    } else {
      console.log('[DISPATCH] ✅ Comando permitido siempre:', command);
    }

    // Buscar comando en el mapa
    const commandConfig = commandMap.get(command.toLowerCase());
    console.log('[DISPATCH] CommandConfig encontrado:', !!commandConfig, '| isLocal:', commandConfig?.isLocal);

    if (!commandConfig) {
      console.log('[DISPATCH] ❌ Comando no encontrado en commandMap:', command);
      return false;
    }

    // Verificar permisos de admin si es necesario
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

    // Si es comando local, usar handler directo
    if (commandConfig.isLocal && typeof commandConfig.handler === 'function') {
      console.log('[DISPATCH] ✅ Usando handler local para:', command);
      handler = commandConfig.handler;
    } else {
      // Cargar módulo dinámicamente, pasando el nombre del comando
      console.log('[DISPATCH] 🔄 Cargando módulo:', commandConfig.moduleName || commandConfig.handler, 'para comando:', command);
      const module = await loadCommandModule(commandConfig.moduleName || commandConfig.handler, command);
      console.log('[DISPATCH] 📦 Módulo cargado:', !!module, '| handler encontrado:', !!module?.handler);

      if (!module || !module.handler) {
        console.log('[DISPATCH] ❌ Error: módulo o handler no encontrado');
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

    // Ejecutar comando
    const params = {
      ...effectiveCtx,
      text,
      command: commandConfig.name || command,
      args,
      commandConfig
    };

    console.log('[DISPATCH] 🚀 Ejecutando handler para:', command);

    // ===== SISTEMA DE REACCIONES AUTOMÁTICAS =====
    // Reaccionar al mensaje del usuario según el tipo de comando
    const reactionEmojis = {
      // Descargas
      'play': '📥',
      'music': '📥',
      'video': '📥',
      'youtube': '📥',
      'tiktok': '📥',
      'instagram': '📥',
      'ig': '📥',
      'facebook': '📥',
      'fb': '📥',
      'twitter': '📥',
      'x': '📥',
      'pinterest': '📥',
      'spotify': '🎵',

      // IA
      'ia': '🤖',
      'ai': '🤖',
      'image': '🎨',
      'clasificar': '📊',

      // Media
      'sticker': '✨',
      's': '✨',
      'meme': '😂',
      'quote': '💭',
      'tts': '🔊',
      'wallpaper': '🖼️',

      // Utilidades
      'translate': '🌐',
      'tr': '🌐',
      'weather': '🌤️',
      'clima': '🌤️',
      'ping': '🏓',

      // Grupo
      'kick': '👢',
      'promote': '⬆️',
      'demote': '⬇️',
      'lock': '🔒',
      'unlock': '🔓',

      // Aportes
      'addaporte': '📝',
      'pedido': '📋',

      // Encuestas
      'poll': '📊',
      'pollmultiple': '📊',
      'encuesta': '📊',

      // Admin
      'qr': '📱',
      'code': '🔑',
      'broadcast': '📢',
      'bc': '📢',

      // Sistema
      'stats': '📊',
      'logs': '📋',
      'bot': '🤖'
    };

    // Reaccionar al mensaje del usuario si hay emoji definido
    const reactionEmoji = reactionEmojis[command.toLowerCase()];
    if (reactionEmoji && ctx.message?.key) {
      try {
        await sock.sendMessage(remoteJid, {
          react: {
            text: reactionEmoji,
            key: ctx.message.key
          }
        });
        console.log('[DISPATCH] ✅ Reacción enviada:', reactionEmoji);
      } catch (err) {
        console.log('[DISPATCH] ⚠️ Error enviando reacción:', err.message);
      }
    }

    const result = await handler(params, commandMap);
    console.log('[DISPATCH] 📤 Resultado tipo:', result?.type || 'text', '| hasText:', !!result?.text);

    await sendResult(sock, remoteJid, result, ctx);

    // Reaccionar con ✅ cuando el comando se completó exitosamente
    if (reactionEmoji && ctx.message?.key) {
      try {
        await sock.sendMessage(remoteJid, {
          react: {
            text: '✅',
            key: ctx.message.key
          }
        });
        console.log('[DISPATCH] ✅ Reacción de completado enviada');
      } catch (err) {
        console.log('[DISPATCH] ⚠️ Error enviando reacción de completado:', err.message);
      }
    }

    console.log('[DISPATCH] ✅ Comando ejecutado exitosamente:', command);

    return true;

  } catch (error) {
    console.error("Error in dispatch:", error);
    try {
      await sock.sendMessage(remoteJid, {
        text: `⚠️ Error ejecutando el comando: ${error?.message || error}`
      });
    } catch (e) {
      // ignore
    }
    return true; // Error was handled
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

// Helper para construir opciones de envío
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

// Función para enviar listas con botón visible
async function sendListFixedV2(sock, jid, result, ctx) {
  const isGroup = typeof jid === 'string' && jid.endsWith('@g.us');
  const opts = buildSendOptions(result, ctx);

  console.log('[sendListV2] 📤 Enviando lista a:', jid.substring(0, 20) + '...', '| Grupo:', isGroup);

  // Preparar payload de lista con formato correcto
  const listMessage = {
    text: result.text || 'Elige una opción',
    footer: result.footer || 'KONMI BOT',
    title: result.title || 'Menú',
    buttonText: result.buttonText || '📋 Ver Opciones',
    sections: (result.sections || []).map(sec => ({
      title: sec.title || '',
      rows: (sec.rows || []).map(r => ({
        title: r.title || 'Opción',
        description: r.description || '',
        rowId: r.rowId || r.id || 'noop'
      }))
    }))
  };

  // Intentar enviar lista
  try {
    const sent = await sock.sendMessage(jid, listMessage, opts);
    console.log('[sendListV2] ✅ Lista enviada:', sent ? 'con éxito' : 'sin confirmación');

    // Verificar si realmente se envió como lista
    if (sent && sent.message) {
      const hasListButton = sent.message.listMessage || sent.message.buttonsMessage;
      console.log('[sendListV2] 📊 Tipo de mensaje enviado:', hasListButton ? 'Lista/Botones' : 'Texto');
    }

    return true;
  } catch (err1) {
    console.log('[sendListV2] ⚠️ Error al enviar lista:', err1?.message);
    console.log('[sendListV2] 📝 Intentando fallback a texto plano...');
  }

  // Fallback: Texto plano con todas las opciones
  let txt = `${result.text || 'Menú'}\n\n`;

  for (const sec of result.sections || []) {
    if (sec.title) txt += `*${sec.title}*\n`;
    for (const r of sec.rows || []) {
      txt += `• ${r.title}`;
      if (r.description) txt += ` - ${r.description}`;
      txt += `\n`;
    }
    txt += '\n';
  }

  txt += `\n💡 *Tip:* Escribe el nombre de la categoría para ver sus comandos.`;

  try {
    await sock.sendMessage(jid, { text: txt }, opts);
    console.log('[sendListV2] ✅ Texto plano enviado como fallback');
    return true;
  } catch (err2) {
    console.error('[sendListV2] ❌ Todo falló:', err2);
    return false;
  }
}

async function sendButtonsFixedV2(sock, jid, result, ctx) {
  const isGroup = typeof jid === 'string' && jid.endsWith('@g.us')
  const opts = buildSendOptions(result, ctx)
  const buttons = Array.isArray(result.buttons) ? result.buttons : []

  if (!buttons.length) {
    return safeSend(sock, jid, { text: result.text || result.message || 'No hay botones disponibles' }, opts)
  }

  const ensureSlash = (id) => {
    const s = String(id || '').trim()
    if (!s) return '/help'
    return s.startsWith('/') ? s : `/${s}`
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
          id: ensureSlash(b.id || b.command || b.buttonId || b.rowId || (b.copy ? `/copy ${b.copy}` : null) || '/help')
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
              const id = ensureSlash(b.id || b.command || b.buttonId || b.rowId || (b.copy ? `/copy ${b.copy}` : null) || '/help')

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
