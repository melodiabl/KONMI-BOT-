// src/commands/subbot-management.js
// Comandos para gestión completa de subbots (qr, code, stop, status)

import db from '../database/db.js';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { startSubbot, stopSubbotRuntime as stopSubbot, getSubbotStatus as getRuntimeStatus } from '../lib/subbots.js';

// Importar funciones auxiliares del handler
function normalizePhone(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/[^0-9]/g, "");
  if (!digits) return null;
  if (digits.startsWith("0") && digits.length > 10) return digits.slice(1);
  return digits;
}

// Funciones auxiliares de sesión
const SESSION_DIR = "./sessions/subbots";
const subbotSessions = new Map();
const activeSubbots = new Map();

function getSessionFilePath(code) {
  if (!code) return null;
  return path.join(SESSION_DIR, `${code}.json`);
}

async function loadSubbotSession(code) {
  try {
    const filePath = getSessionFilePath(code);
    if (!filePath || !fs.existsSync(filePath)) return null;
    const raw = await fs.promises.readFile(filePath, "utf8");
    return JSON.parse(raw);
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

function markSubbotOnline(code, sessionData) {
  if (!code) return;
  const now = Date.now();
  subbotSessions.set(code, {
    lastHeartbeat: now,
    lastActivity: now,
    sessionData: sessionData || null,
    online: true,
  });
}

function markSubbotOffline(code) {
  if (!code) return;
  const existing = subbotSessions.get(code);
  if (existing) {
    existing.online = false;
    existing.lastHeartbeat = Date.now();
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
  } catch (err) {
    console.error("Error registrando evento de subbot:", err);
  }
}

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
  }
}

async function initDatabase() {
  await ensureSubbotsTable();
  await ensureSubbotEventsTable();
}

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

// ===== HANDLERS DE COMANDOS =====

export async function handler(ctx) {
  const { command, args } = ctx;

  // Determinar qué subcomando ejecutar
  if (command === 'qr' || command === 'code' || command === 'pair') {
    return handleStartSubbot(ctx);
  } else if (command === 'stopbot' || command === 'stop') {
    return handleStopSubbot(ctx);
  } else if (command === 'mybots' || command === 'mibots') {
    return handleListSubbots(ctx);
  } else if (command === 'subbotStatus' || command === 'statusbot') {
    return handleSubbotStatus(ctx);
  }

  return { success: false, message: '❌ Comando de subbot no reconocido' };
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
      text: "⚠️ No se pudo iniciar tu subbot. Intenta más tarde o contacta soporte.",
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
          ? `   Último: ${new Date(fm.lastHeartbeat).toLocaleString("es-ES")}\n`
          : ""),
    );
  }

  await sock.sendMessage(remoteJid, { text: lines.join("\n") });
  return { success: true };
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

export default { handler };
