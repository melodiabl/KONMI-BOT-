// handler.js
// Handler principal para logica de aportes, media, pedidos y proveedores

import db from "./db.js";
import path from "path";
import fs from "fs";
import axios from "axios";
import { fileURLToPath } from "url";
import QRCode from "qrcode";
import pino from "pino";
import { EventEmitter } from "events";
import * as baileys from "@whiskeysockets/baileys";
import {
  startSubbot,
  stopSubbot,
  getSubbotStatus as getRuntimeStatus,
} from "./lib/subbots.js";
import { processWhatsAppMedia } from "./file-manager.js";

const { makeWASocket, DisconnectReason, useMultiFileAuthState } = baileys;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  }
}

function emitSubbotEvent(type, payload) {
  try {
    subbotEmitter.emit(type, payload);
    subbotEmitter.emit("*", { type, ...payload });
  } catch (error) {
    console.error("Error emitiendo evento de subbot:", error);
  }
}

export function onSubbotEvent(type, handler) {
  subbotEmitter.on(type, handler);
  return () => subbotEmitter.off(type, handler);
}

function createSubbotSessionDir(subbotCode) {
  const dir = path.join(__dirname, "sessions", "subbots", subbotCode);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/[^0-9]/g, "");
  if (!digits) return null;
  if (digits.startsWith("0") && digits.length > 10) return digits.slice(1);
  return digits;
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
    type: row.connection_type === "pairing" ? "code" : "qr",
    status: row.status || (online ? "connected" : "disconnected"),
    created_by: row.user_name || row.user_phone,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    last_heartbeat: lastHeartbeat,
    qr_data: row.qr_code || null,
    pairing_code: row.pairing_code || null,
    isOnline: online,
    message_count: row.message_count ?? 0,
  };
}

function buildSubbotSummary(rows) {
  const summary = {
    total: rows.length,
    qr: 0,
    code: 0,
    connected: 0,
    pending: 0,
    disconnected: 0,
    errors: 0,
  };

  rows.forEach((row) => {
    const item = formatSubbotRow(row);
    if (!item) return;
    if (item.type === "qr") summary.qr += 1;
    else summary.code += 1;
    if (item.isOnline || item.status === "connected") summary.connected += 1;
    else if (
      ["pending", "waiting_scan", "waiting_pairing"].includes(item.status)
    )
      summary.pending += 1;
    else if (item.status === "error") summary.errors += 1;
    else summary.disconnected += 1;
  });

  return summary;
}

// -----------------------------
// SubbotService class
// -----------------------------
class SubbotService {
  constructor() {
    this.maxActiveSubbots = parseInt(process.env.MAX_SUBBOTS) || 10;
    this.inactiveTimeout =
      parseInt(process.env.SUBBOT_TIMEOUT) || 30 * 60 * 1000;
    this.cleanupInterval =
      parseInt(process.env.CLEANUP_INTERVAL) || 5 * 60 * 1000;
    this.maxMemoryUsage = parseInt(process.env.MAX_MEMORY_MB) || 512;
    this.startCleanupService();
    this.startMemoryMonitoring();
  }

  startCleanupService() {
    const interval = setInterval(
      () => this.intelligentCleanup(),
      this.cleanupInterval,
    );
    if (typeof interval.unref === "function") interval.unref();
  }

  startMemoryMonitoring() {
    const interval = setInterval(() => {
      const mem = process.memoryUsage().heapUsed / 1024 / 1024;
      if (mem > this.maxMemoryUsage * this.maxActiveSubbots * 0.8) {
        console.log(` Uso de memoria elevado: ${Math.round(mem)}MB`);
      }
    }, 60000);
    if (typeof interval.unref === "function") interval.unref();
  }

  async canCreateSubbot(userPhone) {
    try {
      const actives = await db("subbots")
        .where({ is_active: true })
        .count("id as count")
        .first();
      if (Number(actives?.count || 0) >= this.maxActiveSubbots) {
        return {
          canCreate: false,
          reason: `Limite global (${this.maxActiveSubbots}) alcanzado`,
        };
      }
      const userActives = await db("subbots")
        .where({ user_phone: userPhone, is_active: true })
        .count("id as count")
        .first();
      if (Number(userActives?.count || 0) >= 2) {
        return {
          canCreate: false,
          reason: "Maximo de 2 subbots activos por usuario",
        };
      }
      const mem = process.memoryUsage().heapUsed / 1024 / 1024;
      if (mem > this.maxMemoryUsage * this.maxActiveSubbots * 0.8) {
        return {
          canCreate: false,
          reason: "Uso de memoria elevado, intenta mas tarde",
        };
      }
      return { canCreate: true };
    } catch (error) {
      console.error("Error verificando capacidad de subbots:", error);
      return { canCreate: false, reason: "Error interno del sistema" };
    }
  }

  async getResourceStats() {
    try {
      const memoryUsage = process.memoryUsage();
      const totalSubbots = await db("subbots").count("id as count").first();
      const stats = await db("subbots")
        .select("status")
        .count("id as count")
        .groupBy("status");
      return {
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024),
        },
        subbots: {
          active: activeSubbots.size,
          total: Number(totalSubbots?.count || 0),
          maxCapacity: this.maxActiveSubbots,
          byStatus: stats,
        },
        system: {
          uptime: Math.round(process.uptime()),
          nodeVersion: process.version,
          platform: process.platform,
        },
      };
    } catch (error) {
      console.error("Error obteniendo estadisticas de subbots:", error);
      return null;
    }
  }

  async intelligentCleanup() {
    try {
      const now = Date.now();
      const candidates = [];
      for (const [code, session] of subbotSessions.entries()) {
        if (now - session.lastActivity > this.inactiveTimeout) {
          candidates.push(code);
        }
      }
      for (const code of candidates) {
        await cleanupSubbotInternal(code);
      }
      const mem = process.memoryUsage().heapUsed / 1024 / 1024;
      if (mem > this.maxMemoryUsage * this.maxActiveSubbots * 0.9) {
        console.log(" Memoria alta, limpiando sesiones inactivas");
        for (const code of Array.from(subbotSessions.keys())) {
          await cleanupSubbotInternal(code);
        }
      }
    } catch (error) {
      console.error("Error limpiando subbots inactivos:", error);
    }
  }
}

const subbotService = new SubbotService();

// -----------------------------
// Baileys helpers
// -----------------------------
async function setupSubbotMessageHandlers(sock, subbotCode) {
  try {
    const { handleIncomingMessage } = await import("./whatsapp.js");
    sock.ev.on("messages.upsert", async (upsert) => {
      try {
        const messages = upsert.messages || [];
        for (const message of messages) {
          if (message.key.fromMe) continue;
          const session = subbotSessions.get(subbotCode);
          if (session) session.lastActivity = Date.now();
          await handleIncomingMessage(message, sock, `subbot_${subbotCode}`);
          await db("subbots")
            .where({ code: subbotCode })
            .increment("message_count", 1)
            .update({ last_activity: new Date().toISOString() });
        }
      } catch (error) {
        console.error(
          `Error procesando mensaje en subbot ${subbotCode}:`,
          error,
        );
      }
    });
  } catch (error) {
    console.error(
      `Error configurando handlers para subbot ${subbotCode}:`,
      error,
    );
  }
}

// Delegate QR and pairing generation to the multi-account manager (baileys-mod fork)
async function generateQRCode(subbotCode) {
  try {
    const result = await multiAccount.generateSubbotQR(
      `KONMI-QR-${Date.now().toString().slice(-6)}`,
    );
    if (!result || !result.success) {
      throw new Error(result?.error || "Error generando QR");
    }
    // Persist some metadata in our db for compatibility
    await db("subbots")
      .where({ code: subbotCode })
      .update({
        qr_code: result.qr || null,
        status: result.status || "waiting_scan",
        last_activity: new Date().toISOString(),
      });
    emitSubbotEvent("qr_ready", { code: subbotCode, qr: result.qr });
    return { success: true, qr: result.qr, message: result.message };
  } catch (error) {
    console.error("generateQRCode delegated error:", error);
    return { success: false, error: error.message };
  }
}

async function generatePairingCode(subbotCode, phoneNumber) {
  try {
    const result = await multiAccount.generateSubbotPairingCode(
      phoneNumber,
      "KONMI-BOT",
    );
    if (!result || !result.success) {
      throw new Error(result?.error || "Error generando pairing code");
    }
    await db("subbots")
      .where({ code: subbotCode })
      .update({
        pairing_code: result.code || null,
        status: result.status || "waiting_pairing",
        last_activity: new Date().toISOString(),
      });
    emitSubbotEvent("pairing_code", {
      code: subbotCode,
      pairingCode: result.code,
    });
    return { success: true, code: result.code, message: result.message };
  } catch (error) {
    console.error("generatePairingCode delegated error:", error);
    return { success: false, error: error.message };
  }
}

async function cleanupSubbotInternal(subbotCode) {
  try {
    const session = subbotSessions.get(subbotCode);
    if (session?.sock) {
      try {
        session.sock.end();
      } catch (_) {}
    }
    activeSubbots.delete(subbotCode);
    subbotSessions.delete(subbotCode);

    await db("subbots").where({ code: subbotCode }).update({
      status: "disconnected",
      is_active: false,
      last_activity: new Date().toISOString(),
    });

    emitSubbotEvent("disconnected", { code: subbotCode });
  } catch (error) {
    console.error(`Error limpiando subbot ${subbotCode}:`, error);
  }
}

// -----------------------------
// Subbot API functions
// -----------------------------
export async function createSubbot(userPhone, userName, connectionType = "qr") {
  await ensureSubbotsTable();
  const normalizedPhone = normalizePhone(userPhone) || String(userPhone || "");
  const canCreate = await subbotService.canCreateSubbot(normalizedPhone);
  if (!canCreate.canCreate) {
    return { success: false, error: canCreate.reason };
  }

  const subbotCode = `sb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db("subbots").insert({
    code: subbotCode,
    user_phone: normalizedPhone,
    user_name: userName,
    connection_type: connectionType,
    status: "pending",
    settings: JSON.stringify({
      autoReply: false,
      allowGroups: true,
      maxMessages: 1000,
    }),
  });

  let result;
  try {
    if (connectionType === "qr") {
      result = await generateQRCode(subbotCode);
    } else if (connectionType === "pairing" || connectionType === "code") {
      result = await generatePairingCode(subbotCode, normalizedPhone);
    } else {
      throw new Error("Tipo de conexion no valido");
    }
  } catch (error) {
    console.error("Error generando credenciales de subbot:", error);
    await deleteSubbot(subbotCode, normalizedPhone);
    return { success: false, error: error.message };
  }

  const subbot = await db("subbots").where({ code: subbotCode }).first();
  emitSubbotEvent("launch", {
    code: subbotCode,
    subbot: formatSubbotRow(subbot),
  });
  return {
    success: true,
    connectionType,
    subbot: formatSubbotRow(subbot),
    qr: result?.qr || null,
    pairingCode: result?.code || null,
  };
}

export async function getSubbotByCode(code) {
  await ensureSubbotsTable();
  const row = await db("subbots").where({ code }).first();
  return formatSubbotRow(row);
}

export async function getUserSubbots(userPhone) {
  await ensureSubbotsTable();
  const normalized = normalizePhone(userPhone) || String(userPhone || "");
  const rows = await db("subbots")
    .where("user_phone", normalized)
    .orderBy("created_at", "desc");
  return {
    success: true,
    subbots: rows.map((row) => formatSubbotRow(row)).filter(Boolean),
    summary: buildSubbotSummary(rows),
  };
}

export async function getSubbotRecord(subbotCode) {
  const subbot = await db("subbots").where({ code: subbotCode }).first();
  if (!subbot) return { success: false, error: "Subbot no encontrado" };
  return { success: true, subbot: formatSubbotRow(subbot) };
}

export async function getSubbotStatusOverview(userPhone) {
  await ensureSubbotsTable();
  const rows = await db("subbots")
    .where("user_phone", normalizePhone(userPhone) || String(userPhone || ""))
    .orderBy("created_at", "desc");
  const summary = buildSubbotSummary(rows);
  const details = rows
    .map((row) => {
      const formatted = formatSubbotRow(row);
      return {
        subbotId: formatted?.code,
        status: formatted?.status,
        isOnline: formatted?.isOnline || false,
        lastHeartbeat: formatted?.last_heartbeat || null,
      };
    })
    .filter((item) => item.subbotId);
  return { success: true, summary, subbots: details };
}

export async function getSubbotAccessData(subbotCode, userPhone) {
  await ensureSubbotsTable();
  const subbot = await db("subbots").where({ code: subbotCode }).first();
  if (!subbot) return { success: false, error: "Subbot no encontrado" };
  if (userPhone) {
    const normalized = normalizePhone(userPhone) || String(userPhone || "");
    if (subbot.user_phone && normalized && subbot.user_phone !== normalized) {
      return {
        success: false,
        error: "Subbot no autorizado para este usuario",
      };
    }
  }
  const qrData = subbot.qr_code
    ? subbot.qr_code.replace(/^data:image\/png;base64,/, "")
    : null;
  return {
    success: true,
    qr: qrData,
    qrImage: subbot.qr_code || null,
    pairingCode: subbot.pairing_code || null,
    subbot: formatSubbotRow(subbot),
  };
}

export async function deleteSubbot(subbotCode, userPhone = null) {
  await ensureSubbotsTable();
  const subbot = await db("subbots").where({ code: subbotCode }).first();
  if (!subbot) return { success: false, error: "Subbot no encontrado" };

  if (userPhone) {
    const normalized = normalizePhone(userPhone) || String(userPhone || "");
    if (subbot.user_phone && normalized && subbot.user_phone !== normalized) {
      return {
        success: false,
        error: "Subbot no autorizado para este usuario",
      };
    }
  }
  const record = await getSubbotRecord(subbotCode);
  if (!record.success) return record;
  await cleanupSubbotInternal(subbotCode);
  await db("subbots").where({ code: subbotCode }).del();
  emitSubbotEvent("stopped", { code: subbotCode });
  return { success: true };
}

export async function registerSubbotEvent({ subbotId, token, event, data }) {
  await ensureSubbotsTable();
  await ensureSubbotEventsTable();

  if (!subbotId || !event) {
    return { success: false, error: "subbotId y event son requeridos" };
  }
  const subbot = await db("subbots").where({ code: subbotId }).first();
  if (!subbot) {
    return { success: false, error: "Subbot no encontrado" };
  }
  if (subbot.token && token !== subbot.token) {
    return { success: false, error: "Token invalido" };
  }
  await db("subbot_events").insert({
    code: subbotId,
    event,
    payload: data ? JSON.stringify(data) : null,
  });
  emitSubbotEvent(event, { subbot: formatSubbotRow(subbot), data });
  return { success: true };
}

export function listAllSubbots() {
  return Array.from(activeSubbots.keys()).map((code) => ({
    code,
    isOnline: true,
    status: "connected",
    lastHeartbeat: subbotSessions.get(code)?.lastActivity
      ? new Date(subbotSessions.get(code).lastActivity).toISOString()
      : null,
  }));
}

export async function cleanupInactiveSubbots() {
  return subbotService.intelligentCleanup();
}

export async function getSubbotStats() {
  return subbotService.getResourceStats();
}

/**
 * Agrega un aporte al sistema
 * @param {Object} params - { usuario, grupo, tipo, contenido, descripcion, mediaPath, estado, fuente, metadata }
 * @returns {Promise<{success: boolean, message: string, aporte?: any}>}
 */
export async function addAporte({
  usuario,
  grupo,
  tipo,
  contenido,
  descripcion = "",
  mediaPath = null,
  estado = "pendiente",
  fuente = "",
  metadata = {},
}) {
  try {
    const fecha = new Date().toISOString();
    const aporteData = {
      usuario,
      grupo,
      tipo,
      contenido,
      descripcion,
      archivo_path: mediaPath,
      estado,
      fuente,
      metadata: JSON.stringify(metadata),
      fecha,
      updated_at: fecha,
    };
    const [id] = await db("aportes").insert(aporteData);
    const aporte = await db("aportes").where({ id }).first();
    return {
      success: true,
      message: "Aporte registrado correctamente.",
      aporte,
    };
  } catch (error) {
    return {
      success: false,
      message: "Error al registrar aporte: " + error.message,
    };
  }
}

/**
 * Agrega un pedido al sistema
 * @param {Object} params - { usuario, grupo, contenido, fecha }
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function addPedido({ usuario, grupo, contenido, fecha }) {
  try {
    await db("pedidos").insert({
      texto: contenido,
      estado: "pendiente",
      usuario,
      grupo,
      fecha,
    });
    return { success: true, message: "Pedido registrado correctamente." };
  } catch (error) {
    return {
      success: false,
      message: "Error al registrar pedido: " + error.message,
    };
  }
}

/**
 * Agrega un proveedor al sistema
 * @param {Object} params - { grupo, tipo, descripcion, activo }
 * @returns {Promise<{success: boolean, message: string, proveedor?: any}>}
 */
export async function addProveedor({
  grupo,
  tipo,
  descripcion,
  activo = true,
}) {
  try {
    const fecha = new Date().toISOString();
    const proveedorData = {
      grupo_jid: grupo,
      tipo,
      descripcion,
      activo,
      fecha_creacion: fecha,
      updated_at: fecha,
    };
    const [id] = await db("proveedores").insert(proveedorData);
    const proveedor = await db("proveedores").where({ id }).first();
    return {
      success: true,
      message: "Proveedor registrado correctamente.",
      proveedor,
    };
  } catch (error) {
    return {
      success: false,
      message: "Error al registrar proveedor: " + error.message,
    };
  }
}

// Funciones adicionales de comandos que se movieron desde commands.js

/**
 * Normaliza el tipo de aporte
 */
export function normalizeAporteTipo(raw) {
  if (!raw) return "extra";
  const v = String(raw).trim().toLowerCase();
  const map = {
    manhwa: "manhwa",
    manhwas: "manhwa",
    manhwas_bls: "manhwas_bls",
    "manhwa bls": "manhwas_bls",
    bls: "manhwas_bls",
    serie: "series",
    series: "series",
    series_videos: "series_videos",
    "series videos": "series_videos",
    series_bls: "series_bls",
    "series bls": "series_bls",
    anime: "anime",
    anime_bls: "anime_bls",
    "anime bls": "anime_bls",
    extra: "extra",
    extra_imagen: "extra_imagen",
    "extra imagen": "extra_imagen",
    imagen: "extra_imagen",
    ilustracion: "ilustracion",
    ilustracion: "ilustracion",
    ilustraciones: "ilustracion",
    pack: "pack",
  };
  return map[v] || v.replace(/\s+/g, "_");
}

/**
 * Handle the /aportar command to save a new aporte in the database.
 * @param {string} contenido - The content description or title.
 * @param {string} tipo - The type of content (e.g., 'manhwa', 'ilustracion', 'extra').
 * @param {string} usuario - The user who sent the aporte.
 * @param {string} grupo - The group where the aporte was sent.
 * @param {string} fecha - The date/time of the aporte.
 */
export async function handleAportar(contenido, tipo, usuario, grupo, fecha) {
  try {
    const tipoNorm = normalizeAporteTipo(tipo);
    // Usar el handler principal
    return await addAporte({
      contenido,
      tipo: tipoNorm,
      usuario,
      grupo,
      fecha,
    });
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * Handle the /pedido [contenido] - Hace un pedido y busca en la base de datos si existe
 */
export async function handlePedido(contenido, usuario, grupo, fecha) {
  try {
    const { getSocket } = await import("./whatsapp.js");
    const sock = getSocket();
    const remoteJid = grupo || usuario;

    // Buscar en manhwas
    const manhwaEncontrado = await db.get(
      "SELECT * FROM manhwas WHERE titulo LIKE ? OR titulo LIKE ?",
      [`%${contenido}%`, `${contenido}%`],
    );

    // Buscar en aportes
    const aporteEncontrado = await db.get(
      "SELECT * FROM aportes WHERE contenido LIKE ? OR contenido LIKE ?",
      [`%${contenido}%`, `${contenido}%`],
    );

    // Buscar en archivos descargados
    const archivosEncontrados = await db.all(
      "SELECT * FROM descargas WHERE filename LIKE ? OR filename LIKE ?",
      [`%${contenido}%`, `${contenido}%`],
    );

    // Registrar el pedido en la base de datos
    const stmt = await db.prepare(
      "INSERT INTO pedidos (texto, estado, usuario, grupo, fecha) VALUES (?, ?, ?, ?, ?)",
    );
    await stmt.run(contenido, "pendiente", usuario, grupo, fecha);
    await stmt.finalize();

    let response = ` *Pedido registrado:* "${contenido}"\n\n`;

    // Si encontr contenido, mencionarlo
    if (manhwaEncontrado) {
      response += ` *Encontrado en manhwas!*\n`;
      response += ` **${manhwaEncontrado.titulo}**\n`;
      response += ` Autor: ${manhwaEncontrado.autor}\n`;
      response += ` Estado: ${manhwaEncontrado.estado}\n`;
      if (manhwaEncontrado.descripcion) {
        response += ` ${manhwaEncontrado.descripcion}\n`;
      }
      if (manhwaEncontrado.url) {
        response += ` ${manhwaEncontrado.url}\n`;
      }
      response += `\n`;
    }

    if (aporteEncontrado) {
      response += ` *Encontrado en aportes!*\n`;
      response += ` **${aporteEncontrado.contenido}**\n`;
      response += ` Tipo: ${aporteEncontrado.tipo}\n`;
      {
        const num = String(aporteEncontrado.usuario || "")
          .split("@")[0]
          .split(":")[0];
        const u = await db("usuarios")
          .where({ whatsapp_number: num })
          .select("username")
          .first();
        const wa = u?.username
          ? null
          : await db("wa_contacts")
              .where({ wa_number: num })
              .select("display_name")
              .first();
        const mention = `@${u?.username || wa?.display_name || num}`;
        response += ` Aportado por: ${mention}\n`;
      }
      response += ` Fecha: ${new Date(aporteEncontrado.fecha).toLocaleDateString()}\n\n`;
    }

    // Buscar y enviar archivos fsicos si existen
    let archivosEnviados = 0;
    if (archivosEncontrados.length > 0 && sock) {
      response += ` *Archivos encontrados:*\n`;

      for (const archivo of archivosEncontrados.slice(0, 5)) {
        // Mximo 5 archivos
        try {
          const archivoPath = path.join(
            process.cwd(),
            "storage",
            "downloads",
            archivo.category,
            archivo.filename,
          );

          if (fs.existsSync(archivoPath)) {
            const fileBuffer = fs.readFileSync(archivoPath);
            const fileExtension = path.extname(archivo.filename).toLowerCase();

            let mediaType = "document";
            if (
              [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(fileExtension)
            ) {
              mediaType = "image";
            } else if (
              [".mp4", ".avi", ".mkv", ".mov"].includes(fileExtension)
            ) {
              mediaType = "video";
            } else if ([".mp3", ".wav", ".m4a"].includes(fileExtension)) {
              mediaType = "audio";
            }

            // Enviar el archivo
            let sentMessage;
            if (mediaType === "image") {
              sentMessage = await sock.sendMessage(remoteJid, {
                image: fileBuffer,
                caption: ` ${archivo.filename}\n ${archivo.category}\n Subido por: ${archivo.usuario}\n ${new Date(archivo.fecha).toLocaleDateString()}`,
              });
            } else if (mediaType === "video") {
              sentMessage = await sock.sendMessage(remoteJid, {
                video: fileBuffer,
                caption: ` ${archivo.filename}\n ${archivo.category}`,
              });
            } else if (mediaType === "audio") {
              sentMessage = await sock.sendMessage(remoteJid, {
                audio: fileBuffer,
                mimetype: "audio/mpeg",
              });
            } else {
              sentMessage = await sock.sendMessage(remoteJid, {
                document: fileBuffer,
                fileName: archivo.filename,
                caption: ` ${archivo.filename}\n ${archivo.category}`,
              });
            }

            response += ` *Enviado:* ${archivo.filename} (${archivo.category})\n`;
            archivosEnviados++;

            // Marcar el pedido como completado si se envi al menos un archivo
            if (archivosEnviados === 1) {
              await db("pedidos")
                .where({ texto: contenido, usuario: usuario, grupo: grupo })
                .update({
                  estado: "completado",
                  completado_por: "bot",
                  fecha_completado: new Date().toISOString(),
                });
            }
          }
        } catch (fileError) {
          console.error(
            `Error enviando archivo ${archivo.filename}:`,
            fileError,
          );
          response += ` Error enviando: ${archivo.filename}\n`;
        }
      }

      if (archivosEnviados === 0) {
        response += ` Archivos encontrados pero no se pudieron enviar\n`;
      }
    }

    if (!manhwaEncontrado && !aporteEncontrado && archivosEnviados === 0) {
      response += ` *No encontrado en la base de datos*\n`;
      response += `Tu pedido ha sido registrado y ser revisado por los administradores.\n`;
    } else if (archivosEnviados > 0) {
      response += `\n *Pedido completado automticamente!* `;
    }

    return { success: true, message: response };
  } catch (error) {
    console.error("Error en handlePedido:", error);
    return { success: false, message: "Error al procesar pedido." };
  }
}

/**
 * /pedidos - Muestra los pedidos del usuario
 */
export async function handlePedidos(usuario, grupo) {
  try {
    const pedidos = await db.all(
      "SELECT * FROM pedidos WHERE usuario = ? ORDER BY fecha DESC LIMIT 10",
      [usuario],
    );

    if (pedidos.length === 0) {
      return { success: true, message: " No tienes pedidos registrados." };
    }

    let message = ` *Tus pedidos (${pedidos.length}):*\n\n`;
    pedidos.forEach((pedido, index) => {
      const fecha = new Date(pedido.fecha).toLocaleDateString();
      const estado =
        pedido.estado === "pendiente"
          ? ""
          : pedido.estado === "completado"
            ? ""
            : "";
      message += `${index + 1}. ${estado} ${pedido.texto}\n`;
      message += `    ${fecha} - Estado: ${pedido.estado}\n\n`;
    });

    return { success: true, message };
  } catch (error) {
    return { success: false, message: "Error al obtener pedidos." };
  }
}

// =====================
// AI: Gemini helpers and commands (consolidated)
// =====================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

export async function analyzeContentWithAI(content, filename = "") {
  try {
    if (!GEMINI_API_KEY) {
      return { success: false, error: "GEMINI_API_KEY no configurada" };
    }

    const prompt = `
Analiza el siguiente contenido de un mensaje de WhatsApp y clasificalo:

Contenido del mensaje: "${content}"
Nombre del archivo: "${filename}"

Responde en formato JSON con la siguiente estructura:
{
  "tipo": "manhwa|serie|extra|ilustracion|pack|anime|otros",
  "titulo": "Ttulo detectado o null",
  "capitulo": "Nmero de captulo detectado o null",
  "confianza": 0-100,
  "descripcion": "Breve descripcin del contenido"
}

Reglas de clasificacin:
- Si menciona "manhwa", "manga", "comic"  tipo: "manhwa"
- Si menciona "serie", "episodio", "temporada"  tipo: "serie"
- Si menciona "ilustracion", "fanart", "arte"  tipo: "ilustracion"
- Si menciona "pack", "coleccion"  tipo: "pack"
- Si menciona "anime", "animacion"  tipo: "anime"
- Por defecto: "extra"

Busca nmeros que parezcan captulos (ej: "cap 45", "episodio 12", "volumen 3").
Extrae ttulos que parezcan nombres de obras.
`;

    const response = await axios.post(
      `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
      },
      { headers: { "Content-Type": "application/json" } },
    );

    const aiResponse = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!aiResponse)
      return { success: false, error: "No se recibi respuesta de la IA" };

    let analysis;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) analysis = JSON.parse(jsonMatch[0]);
      else throw new Error("No se encontro JSON valido");
    } catch (parseError) {
      console.error("Error parseando respuesta AI:", parseError);
      return { success: false, error: "Error parseando respuesta de la IA" };
    }

    return {
      success: true,
      analysis: {
        tipo: analysis.tipo || "extra",
        titulo: analysis.titulo || null,
        capitulo: analysis.capitulo || null,
        confianza: analysis.confianza || 50,
        descripcion: analysis.descripcion || content,
      },
    };
  } catch (error) {
    console.error("Error en analyzeContentWithAI:", error);
    return { success: false, error: error.message };
  }
}

export async function chatWithAI(message, context = "") {
  try {
    if (!GEMINI_API_KEY) {
      return { success: false, error: "GEMINI_API_KEY no est configurada" };
    }

    const prompt = `
Eres un asistente de IA amigable para un bot de WhatsApp llamado KONMI-BOT.
Contexto: ${context}

Pregunta del usuario: ${message}

Responde de forma clara, concisa y til. Si la pregunta es sobre manhwas, series, o contenido multimedia, s especfico.
Mantn un tono amigable y profesional.
`;

    const response = await axios.post(
      `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
      },
      { headers: { "Content-Type": "application/json" } },
    );

    const aiResponse = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!aiResponse)
      return { success: false, error: "No se recibi respuesta de la IA" };

    return { success: true, response: aiResponse, model: "gemini-1.5-flash" };
  } catch (error) {
    console.error("Error en chatWithAI:", error);
    return { success: false, error: error.message };
  }
}

export async function analyzeManhwaContent(content) {
  try {
    if (!GEMINI_API_KEY) {
      return { success: false, error: "GEMINI_API_KEY no configurada" };
    }

    const prompt = `
Analiza si el siguiente contenido es de un manhwa y extrae informacin:

Contenido: "${content}"

Responde en formato JSON:
{
  "es_manhwa": true/false,
  "titulo": "Ttulo del manhwa o null",
  "capitulo": "Nmero de captulo o null",
  "autor": "Autor si se menciona o null",
  "genero": "Gnero si se detecta o null"
}
`;

    const response = await axios.post(
      `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
      },
      { headers: { "Content-Type": "application/json" } },
    );

    const aiResponse = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    const analysis = JSON.parse(jsonMatch[0]);

    return { success: true, analysis };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// =====================
// Provider handlers (consolidated)
// =====================

export async function processProviderMessage(message, groupJid, groupName) {
  try {
    const grupo = await db("grupos_autorizados").where("jid", groupJid).first();
    if (!grupo) throw new Error("No es grupo proveedor");

    const usuario = message.key.participant || message.key.remoteJid;
    const fecha = new Date().toISOString();

    const hasMedia =
      message.message.imageMessage ||
      message.message.videoMessage ||
      message.message.documentMessage ||
      message.message.audioMessage;

    if (!hasMedia)
      return { success: false, message: "No hay media para procesar" };

    const messageText =
      message.message.conversation ||
      message.message.extendedTextMessage?.text ||
      message.message.imageMessage?.caption ||
      message.message.videoMessage?.caption ||
      message.message.documentMessage?.caption ||
      "Media sin descripcin";

    const categoria = "auto";
    const result = await processWhatsAppMedia(message, categoria, usuario);
    if (!result.success)
      return { success: false, message: "Error procesando media" };

    let tipoClasificado = "extra";
    let capituloDetectado = null;
    let tituloDetectado = null;

    try {
      const aiAnalysis = await analyzeContentWithAI(
        messageText,
        result.filename,
      );
      if (aiAnalysis.success && aiAnalysis.analysis) {
        tipoClasificado = aiAnalysis.analysis.tipo || tipoClasificado;
        capituloDetectado = aiAnalysis.analysis.capitulo;
        tituloDetectado = aiAnalysis.analysis.titulo;
      }
    } catch (aiError) {
      console.error("Error en anlisis AI:", aiError);
    }

    const tipoNormalizado = normalizeAporteTipo(tipoClasificado);
    let carpetaDestino = tipoNormalizado;
    if (tituloDetectado)
      carpetaDestino = `${tipoNormalizado}/${sanitizeFilename(tituloDetectado)}`;
    if (capituloDetectado)
      carpetaDestino = `${carpetaDestino}/Capitulo ${capituloDetectado}`;

    const storagePath = path.join(
      process.cwd(),
      "storage",
      "media",
      carpetaDestino,
    );
    if (!fs.existsSync(storagePath))
      fs.mkdirSync(storagePath, { recursive: true });

    const archivoActual = result.filepath;
    const archivoNuevo = path.join(storagePath, path.basename(archivoActual));
    if (archivoActual !== archivoNuevo) {
      fs.renameSync(archivoActual, archivoNuevo);
      result.filepath = archivoNuevo;
    }

    const aporteData = {
      contenido: tituloDetectado || result.filename,
      tipo: tipoNormalizado,
      usuario,
      grupo: groupJid,
      descripcion: messageText,
      archivo_path: result.filepath,
      estado: "pendiente",
      fuente: "auto_proveedor",
      metadata: JSON.stringify({
        proveedor: grupo.proveedor,
        capitulo: capituloDetectado,
        titulo: tituloDetectado,
        carpeta: carpetaDestino,
        mediaType: result.mediaType,
        size: result.size,
        grupoNombre: groupName,
      }),
      fecha,
      updated_at: fecha,
    };

    const [aporteId] = await db("aportes").insert(aporteData);
    const aporte = await db("aportes").where({ id: aporteId }).first();

    return {
      success: true,
      message: "Aporte automtico procesado correctamente",
      aporte,
      description: `Media clasificada como ${tipoNormalizado}${tituloDetectado ? ` - ${tituloDetectado}` : ""}${capituloDetectado ? ` Cap ${capituloDetectado}` : ""}`,
    };
  } catch (error) {
    console.error("Error en processProviderMessage:", error);
    return { success: false, message: error.message };
  }
}

function sanitizeFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9\s\-_]/g, "_").replace(/\s+/g, "_");
}

export async function getProviderStats() {
  try {
    await ensureGruposTable();
    const total = await db("grupos_autorizados")
      .where({ tipo: "proveedor" })
      .count("jid as count")
      .first();
    return { totalProviders: Number(total?.count || 0) };
  } catch (error) {
    console.error("Error getting provider stats:", error);
    return { totalProviders: 0, error: error.message };
  }
}

export async function getProviderAportes() {
  try {
    const aportes = await db("aportes")
      .where("fuente", "auto_proveedor")
      .select("tipo", "contenido", "fecha", "grupo")
      .orderBy("fecha", "desc")
      .limit(20);
    return { success: true, aportes };
  } catch (error) {
    console.error("Error getting provider aportes:", error);
    return { success: false, error: error.message, aportes: [] };
  }
}

// Helper function to ensure tables exist
async function ensureGruposTable() {
  const has = await db.schema.hasTable("grupos_autorizados");
  if (!has) {
    await db.schema.createTable("grupos_autorizados", (t) => {
      t.increments("id").primary();
      t.string("jid").notNullable().unique();
      t.string("nombre").defaultTo("");
      t.text("descripcion").defaultTo("");
      t.boolean("bot_enabled").defaultTo(true);
      t.boolean("es_proveedor").defaultTo(false);
      t.string("tipo").defaultTo("normal");
      t.integer("usuario_id").nullable();
      t.timestamp("created_at").defaultTo(db.fn.now());
      t.timestamp("updated_at").defaultTo(db.fn.now());
    });
  }
}

// =====================
// COMMAND HANDLERS
// =====================

/**
 * Handler para el comando /ai o /ia
 * Interactúa con Gemini AI para responder preguntas
 */
export async function handleIA(pregunta, usuario, grupo) {
  try {
    console.log(`🤖 Comando /ai recibido de ${usuario}: "${pregunta}"`);

    const aiResult = await chatWithAI(
      pregunta,
      `Usuario: ${usuario}, Grupo: ${grupo}`,
    );

    if (!aiResult.success) {
      const reason = aiResult.error?.includes("no está configurada")
        ? "La función de IA no está configurada. Por favor establece GEMINI_API_KEY en el servidor."
        : aiResult.error || "La IA no pudo procesar tu solicitud.";
      return {
        success: false,
        message: `⚠️ ${reason}`,
      };
    }

    const finalResponse = `🤖 *Respuesta de IA:*\n\n${aiResult.response}\n\n_Procesado por ${aiResult.model || "Gemini AI"}_`;

    // Registrar en logs
    try {
      await db("logs").insert({
        tipo: "ai_command",
        comando: "/ai",
        usuario,
        grupo,
        fecha: new Date().toISOString(),
        detalles: JSON.stringify({
          pregunta,
          respuesta: aiResult.response,
          modelo: aiResult.model || "gemini-1.5-flash",
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (logError) {
      console.warn("Error guardando log de IA:", logError);
    }

    return { success: true, message: finalResponse };
  } catch (error) {
    console.error("❌ Error en comando /ai:", error);
    return {
      success: false,
      message: `⚠️ Error procesando comando /ai: ${error.message}\n\n_Intenta reformular tu pregunta._`,
    };
  }
}

/**
 * Handler para el comando /myaportes
 * Muestra los aportes del usuario
 */
export async function handleMyAportes(usuario, grupo) {
  try {
    console.log(`📋 Comando /myaportes recibido de ${usuario}`);

    const aportes = await db("aportes")
      .where({ usuario })
      .orderBy("fecha", "desc")
      .limit(10);

    if (aportes.length === 0) {
      return {
        success: true,
        message:
          "📭 *Mis Aportes*\n\nℹ️ No tienes aportes registrados aún.\n\n➕ Usa `/addaporte [contenido]` para agregar uno.",
      };
    }

    let message = "📋 *Mis Aportes*\n\n";
    aportes.forEach((aporte, index) => {
      message += `${index + 1}. **${aporte.contenido}**\n`;
      message += `   • Tipo: ${aporte.tipo}\n`;
      message += `   • Estado: ${aporte.estado || "pendiente"}\n`;
      message += `   • Fecha: ${new Date(aporte.fecha).toLocaleDateString("es-ES")}\n\n`;
    });

    message += `_Total: ${aportes.length} aportes_`;

    return { success: true, message };
  } catch (error) {
    console.error("❌ Error en /myaportes:", error);
    return {
      success: false,
      message: "⚠️ Error obteniendo tus aportes. Intenta más tarde.",
    };
  }
}

/**
 * Handler para el comando /aportes
 * Muestra todos los aportes disponibles
 */
export async function handleAportes(usuario, grupo, isGroup = false) {
  try {
    console.log(`📚 Comando /aportes recibido de ${usuario}`);

    let query = db("aportes").orderBy("fecha", "desc").limit(20);

    // Si es un grupo, mostrar solo aportes de ese grupo
    if (isGroup && grupo) {
      query = query.where({ grupo });
    }

    const aportes = await query;

    if (aportes.length === 0) {
      return {
        success: true,
        message:
          "📭 *Lista de Aportes*\n\nℹ️ No hay aportes disponibles en este momento.\n\n➕ Usa `/addaporte [contenido]` para agregar uno.",
      };
    }

    let message = "📚 *Lista de Aportes*\n\n";
    aportes.forEach((aporte, index) => {
      message += `${index + 1}. **${aporte.contenido}**\n`;
      message += `   • Tipo: ${aporte.tipo}\n`;
      message += `   • Estado: ${aporte.estado || "pendiente"}\n`;
      message += `   👤 Por: ${aporte.usuario?.split("@")[0] || "Anónimo"}\n`;
      message += `   🗓️ ${new Date(aporte.fecha).toLocaleDateString("es-ES")}\n\n`;
    });

    message += `_Total: ${aportes.length} aportes_`;

    return { success: true, message };
  } catch (error) {
    console.error("❌ Error en /aportes:", error);
    return {
      success: false,
      message: "⚠️ Error obteniendo aportes. Intenta más tarde.",
    };
  }
}

/**
 * Handler para el comando /addaporte
 * Agrega un nuevo aporte
 */
export async function handleAddAporte(
  contenido,
  tipo,
  usuario,
  grupo,
  fecha,
  archivoPath = null,
) {
  try {
    console.log(`➕ Comando /addaporte recibido de ${usuario}: "${contenido}"`);

    const result = await addAporte({
      contenido,
      tipo,
      usuario,
      grupo,
      fecha,
      mediaPath: archivoPath,
      estado: "pendiente",
    });

    if (result.success) {
      let message = "✅ *Aporte registrado correctamente*\n\n";
      message += `📝 **Contenido:** ${contenido}\n`;
      message += `🏷️ **Tipo:** ${tipo}\n`;
      if (archivoPath) {
        message += `📎 **Archivo:** Adjunto\n`;
      }
      message += `📅 **Fecha:** ${new Date(fecha).toLocaleString("es-ES")}\n\n`;
      message += "✨ Tu aporte será revisado y publicado pronto.";

      return { success: true, message };
    }

    return result;
  } catch (error) {
    console.error("❌ Error en /addaporte:", error);
    return {
      success: false,
      message: "⚠️ Error agregando aporte. Intenta más tarde.",
    };
  }
}

/**
 * Handler para el comando /aporteestado
 * Cambia el estado de un aporte (solo admins)
 */
export async function handleAporteEstado(
  aporteId,
  nuevoEstado,
  usuario,
  grupo,
) {
  try {
    console.log(
      `🔄 Comando /aporteestado recibido de ${usuario}: ID=${aporteId}, Estado=${nuevoEstado}`,
    );

    // Verificar que el usuario sea admin
    const whatsappNumber = usuario.split("@")[0];
    const user = await db("usuarios")
      .where({ whatsapp_number: whatsappNumber })
      .select("rol")
      .first();

    if (!user || (user.rol !== "admin" && user.rol !== "owner")) {
      return {
        success: false,
        message:
          "❌ Solo los administradores pueden cambiar el estado de los aportes.",
      };
    }

    // Validar estado
    const estadosValidos = ["pendiente", "aprobado", "rechazado", "publicado"];
    if (!estadosValidos.includes(nuevoEstado.toLowerCase())) {
      return {
        success: false,
        message: `⚠️ Estado inválido. Estados válidos: ${estadosValidos.join(", ")}`,
      };
    }

    // Actualizar estado
    const updated = await db("aportes")
      .where({ id: parseInt(aporteId) })
      .update({ estado: nuevoEstado.toLowerCase() });

    if (updated === 0) {
      return {
        success: false,
        message: `⚠️ No se encontró el aporte con ID ${aporteId}`,
      };
    }

    return {
      success: true,
      message: `✅ Estado del aporte #${aporteId} actualizado a: **${nuevoEstado}**`,
    };
  } catch (error) {
    console.error("❌ Error en /aporteestado:", error);
    return {
      success: false,
      message: "⚠️ Error actualizando estado del aporte.",
    };
  }
}

/**
 * Handler para el comando /lock
 * Bloquea el grupo (solo admins)
 */
export async function handleLock(usuario, grupo, isGroup) {
  try {
    if (!isGroup) {
      return {
        success: false,
        message: "⚠️ Este comando solo funciona en grupos.",
      };
    }

    // Verificar que el usuario sea admin del grupo
    const whatsappNumber = usuario.split("@")[0];
    const user = await db("usuarios")
      .where({ whatsapp_number: whatsappNumber })
      .select("rol")
      .first();

    if (!user || (user.rol !== "admin" && user.rol !== "owner")) {
      return {
        success: false,
        message: "❌ Solo los administradores pueden bloquear el grupo.",
      };
    }

    return {
      success: true,
      message:
        "🔒 *Grupo bloqueado*\n\nSolo los administradores pueden enviar mensajes.",
    };
  } catch (error) {
    console.error("❌ Error en /lock:", error);
    return {
      success: false,
      message: "⚠️ Error bloqueando el grupo.",
    };
  }
}

/**
 * Handler para el comando /unlock
 * Desbloquea el grupo (solo admins)
 */
export async function handleUnlock(usuario, grupo, isGroup) {
  try {
    if (!isGroup) {
      return {
        success: false,
        message: "⚠️ Este comando solo funciona en grupos.",
      };
    }

    // Verificar que el usuario sea admin del grupo
    const whatsappNumber = usuario.split("@")[0];
    const user = await db("usuarios")
      .where({ whatsapp_number: whatsappNumber })
      .select("rol")
      .first();

    if (!user || (user.rol !== "admin" && user.rol !== "owner")) {
      return {
        success: false,
        message: "❌ Solo los administradores pueden desbloquear el grupo.",
      };
    }

    return {
      success: true,
      message:
        "🔓 *Grupo desbloqueado*\n\nTodos los miembros pueden enviar mensajes.",
    };
  } catch (error) {
    console.error("❌ Error en /unlock:", error);
    return {
      success: false,
      message: "⚠️ Error desbloqueando el grupo.",
    };
  }
}

/**
 * Handler para el comando /tag
 * Menciona a todos en el grupo (solo admins)
 */
export async function handleTag(messageText, usuario, grupo) {
  try {
    console.log(`📢 Comando /tag recibido de ${usuario}`);

    const whatsappNumber = usuario.split("@")[0];
    const user = await db("usuarios")
      .where({ whatsapp_number: whatsappNumber })
      .select("rol")
      .first();

    if (!user || (user.rol !== "admin" && user.rol !== "owner")) {
      return {
        success: false,
        message: "❌ Solo los administradores pueden usar este comando.",
      };
    }

    const mensaje = messageText.substring(4).trim() || "Todos mencionados";

    return {
      success: true,
      message: `📢 *Anuncio:*\n\n${mensaje}`,
      tagAll: true,
    };
  } catch (error) {
    console.error("❌ Error en /tag:", error);
    return {
      success: false,
      message: "⚠️ Error enviando anuncio.",
    };
  }
}

/**
 * Handler para el comando /whoami
 * Muestra información del usuario
 */
export async function handleWhoami(usuario, grupo) {
  try {
    console.log(`👤 Comando /whoami recibido de ${usuario}`);

    const whatsappNumber = usuario.split("@")[0];
    const user = await db("usuarios")
      .where({ whatsapp_number: whatsappNumber })
      .select("username", "rol", "fecha_registro")
      .first();

    let message = "👤 *Tu Información*\n\n";
    message += `📱 **WhatsApp:** ${whatsappNumber}\n`;

    if (user) {
      message += `👨💼 **Usuario:** ${user.username}\n`;
      message += `🎭 **Rol:** ${user.rol}\n`;
      message += `📅 **Registrado:** ${new Date(user.fecha_registro).toLocaleDateString("es-ES")}\n`;
    } else {
      message += "\n⚠️ No estás registrado en el sistema.\n";
      message += "Usa `/registrar [username]` para registrarte.";
    }

    return { success: true, message };
  } catch (error) {
    console.error("❌ Error en /whoami:", error);
    return {
      success: false,
      message: "⚠️ Error obteniendo tu información.",
    };
  }
}

/**
 * Handler para el comando /debugadmin
 * Información de depuración para admins
 */
export async function handleDebugAdmin(usuario, grupo) {
  try {
    console.log(`🔍 Comando /debugadmin recibido de ${usuario}`);

    const whatsappNumber = usuario.split("@")[0];
    const user = await db("usuarios")
      .where({ whatsapp_number: whatsappNumber })
      .select("rol")
      .first();

    if (!user || user.rol !== "owner") {
      return {
        success: false,
        message: "❌ Solo el owner puede usar este comando.",
      };
    }

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
