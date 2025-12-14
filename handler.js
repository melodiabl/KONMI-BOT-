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






const commandMap = new Map()

function registerCommand(command, module) {
  if (!commandMap.has(command)) {
    commandMap.set(command, module)
  }
}

// Imports explícitos de comandos
import * as adminMenuCmd from './src/commands/admin-menu.js';
import * as adminCmd from './src/commands/admin.js';
import * as advancedFeaturesCmd from './src/commands/advanced-features.js';
import * as aiCmd from './src/commands/ai.js';
import * as aportesCmd from './src/commands/aportes.js';
import * as banCmd from './src/commands/ban.js';
import * as botControlCmd from './src/commands/bot-control.js';
import * as botsCmd from './src/commands/bots.js';
import * as broadcastCmd from './src/commands/broadcast.js';
import * as callsCmd from './src/commands/calls.js';
import * as chatManagementCmd from './src/commands/chat-management.js';
import * as communityFeaturesCmd from './src/commands/community-features.js';
import * as contentCmd from './src/commands/content.js';
import * as demoCmd from './src/commands/demo.js';
import * as diagCmd from './src/commands/diag.js';
import * as downloadCommandsCmd from './src/commands/download-commands.js';
import * as filesCmd from './src/commands/files.js';
import * as gamesCmd from './src/commands/games.js';
import * as groupAdminExtraCmd from './src/commands/group-admin-extra.js';
import * as groupAdvancedCmd from './src/commands/group-advanced.js';
import * as groupExtraCmd from './src/commands/group-extra.js';
import * as groupSettingsCmd from './src/commands/group-settings.js';
import * as groupsCmd from './src/commands/groups.js';
import * as helpCmd from './src/commands/help.js';
import * as imagesCmd from './src/commands/images.js';
import * as interactiveCmd from './src/commands/interactive.js';
import * as logsCmd from './src/commands/logs.js';
import * as maintenanceCmd from './src/commands/maintenance.js';
import * as mediaCmd from './src/commands/media.js';
import * as menuCmd from './src/commands/menu.js';
import * as messageControlCmd from './src/commands/message-control.js';
import * as moderationCmd from './src/commands/moderation.js';
import * as mybotsCmd from './src/commands/mybots.js';
import * as pairingCmd from './src/commands/pairing.js';
import * as pedidosCmd from './src/commands/pedidos.js';
import * as performanceFeaturesCmd from './src/commands/performance-features.js';
import * as pingCmd from './src/commands/ping.js';
import * as pollsCmd from './src/commands/polls.js';
import * as presenceCmd from './src/commands/presence.js';
import * as privacyFeaturesCmd from './src/commands/privacy-features.js';
import * as privacyCmd from './src/commands/privacy.js';
import * as profileCmd from './src/commands/profile.js';
import * as promoCmd from './src/commands/promo.js';
import * as statusCmd from './src/commands/status.js';
import * as stickersCmd from './src/commands/stickers.js';
import * as subbotsCmd from './src/commands/subbots.js';
import * as systemInfoCmd from './src/commands/system-info.js';
import * as systemCmd from './src/commands/system.js';
import * as uiInteractiveCmd from './src/commands/ui-interactive.js';
import * as utilMathCmd from './src/commands/util-math.js';
import * as utilsCmd from './src/commands/utils.js';
import * as votesCmd from './src/commands/votes.js';

function registerAllCommands() {
  const cmds = [
    ['admin-menu', adminMenuCmd],
    ['admin', adminCmd],
    ['advanced-features', advancedFeaturesCmd],
    ['ai', aiCmd],
    ['aportes', aportesCmd],
    ['ban', banCmd],
    ['bot-control', botControlCmd],
    ['bots', botsCmd],
    ['broadcast', broadcastCmd],
    ['calls', callsCmd],
    ['chat-management', chatManagementCmd],
    ['community-features', communityFeaturesCmd],
    ['content', contentCmd],
    ['demo', demoCmd],
    ['diag', diagCmd],
    ['download-commands', downloadCommandsCmd],
    ['files', filesCmd],
    ['games', gamesCmd],
    ['group-admin-extra', groupAdminExtraCmd],
    ['group-advanced', groupAdvancedCmd],
    ['group-extra', groupExtraCmd],
    ['group-settings', groupSettingsCmd],
    ['groups', groupsCmd],
    ['help', helpCmd],
    ['images', imagesCmd],
    ['interactive', interactiveCmd],
    ['logs', logsCmd],
    ['maintenance', maintenanceCmd],
    ['media', mediaCmd],
    ['menu', menuCmd],
    ['message-control', messageControlCmd],
    ['moderation', moderationCmd],
    ['mybots', mybotsCmd],
    ['pairing', pairingCmd],
    ['pedidos', pedidosCmd],
    ['performance-features', performanceFeaturesCmd],
    ['ping', pingCmd],
    ['polls', pollsCmd],
    ['presence', presenceCmd],
    ['privacy-features', privacyFeaturesCmd],
    ['privacy', privacyCmd],
    ['profile', profileCmd],
    ['promo', promoCmd],
    ['status', statusCmd],
    ['stickers', stickersCmd],
    ['subbots', subbotsCmd],
    ['system-info', systemInfoCmd],
    ['system', systemCmd],
    ['ui-interactive', uiInteractiveCmd],
    ['util-math', utilMathCmd],
    ['utils', utilsCmd],
    ['votes', votesCmd]
  ];

  for (const [name, mod] of cmds) {
    const exportsObj = mod.default || mod;
    const handler = exportsObj.handler || exportsObj.default || exportsObj[Object.keys(exportsObj).find(k => typeof exportsObj[k] === 'function')];

    if (typeof handler === 'function') {
      registerCommand(name, { ...exportsObj, handler, command: name });
    }
  }

  // Registrar comandos locales
  registerCommand('qr', { handler: handleStartSubbot });
  registerCommand('code', { handler: handleStartSubbot });
  registerCommand('pair', { handler: handleStartSubbot });
  registerCommand('stop', { handler: handleStopSubbot });
  registerCommand('bots', { handler: handleListSubbots });
  registerCommand('mybots', { handler: handleListSubbots });
  registerCommand('status', { handler: handleSubbotStatus });

  registerCommand('aporte', { handler: handleAddAporte });
  registerCommand('aportes', { handler: handleAportes });
  registerCommand('misaportes', { handler: handleMyAportes });

  registerCommand('pedido', { handler: handlePedido });
  registerCommand('pedidos', { handler: handlePedidos });

  registerCommand('aportar', { handler: handleAportar });
  registerCommand('provaportes', { handler: handleProveedorAportes });

  console.log('✅ Todos los comandos registrados explícitamente.');
}

registerAllCommands();





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

  for (const p of prefixes) {
    if (s.startsWith(p)) {
      prefixUsed = p
      break
    }
  }

  if (prefixUsed === null) {
    return { command: '', args: [] }
  }

  const parts = s.slice(prefixUsed.length).trim().split(/\s+/)
  const command = parts.shift() || ''

  return { command: command, args: parts }
}



async function sendResult(sock, jid, result, ctx) {

  if (!sock || !jid) return;



  try {

    if (!result) {

      await sock.sendMessage(jid, { text: '✅ Listo.' });

      return;

    }



    if (typeof result === 'string') {

      await sock.sendMessage(jid, { text: result });

      return;

    }



    if (result.type === 'buttons') {

        const payload = createButtonMenu(result);

        await sock.sendMessage(jid, payload);

        return;

    }



    const message = result.message || result.text || '✅ Listo';

    await sock.sendMessage(jid, { text: message });



  } catch (error) {

    console.error("Error in sendResult:", error);

  }

}



export async function dispatch(ctx = {}, runtimeContext = {}) {

  const { sock, remoteJid, isGroup } = ctx;

  if (!sock || !remoteJid) return false;



  const effectiveCtx = { ...ctx, ...runtimeContext };



  try {

    const text = (ctx.text != null ? String(ctx.text) : extractText(ctx.message));

    const { command, args } = parseCommand(text);



    if (!command) return false;



    const commandModule = commandMap.get(command)

    if (commandModule && typeof commandModule.handler === 'function') {
      const params = { ...effectiveCtx, text, command, args }

      const result = await commandModule.handler(params, commandMap)
      await sendResult(sock, remoteJid, result, ctx)


        return true;

    }



    return false; // Command not found

  } catch (error) {

    console.error("Error in dispatch:", error);

    try {

        await sock.sendMessage(remoteJid, { text: `⚠️ Error ejecutando el comando: ${error?.message || error}` });

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
