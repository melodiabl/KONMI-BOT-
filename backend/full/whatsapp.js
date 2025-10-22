// Baileys se cargará dinámicamente para permitir forks modificados
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
// Importaciones de handler.js movidas a importación dinámica para evitar ciclos
// Las funciones se importarán cuando se necesiten

// Comandos de sistema y configuración
import {
  handleAI,
  handleClasificar,
  handleListClasificados,
  handleLogs,
  handleConfig,
  handleRegistrarUsuario,
  handleResetPassword,
  handleMiInfo,
  handleCleanSession,
} from "./commands.js";

// Comandos de descarga con fallback automático
import {
  handleTikTokDownload,
  handleInstagramDownload,
  handleFacebookDownload,
  handleTwitterDownload,
  handlePinterestDownload,
  handleMusicDownload,
  handleVideoDownload,
  handleSpotifySearch,
  handleTranslate,
  handleWeather,
  handleQuote,
  handleFact,
  handleTriviaCommand,
  handleMemeCommand,
} from "./commands/download-commands.js";

const DEFAULT_EXTERNAL_TIMEOUT_MS = Number(process.env.EXTERNAL_API_TIMEOUT_MS || "8000");

function withTimeoutController(timeoutMs = DEFAULT_EXTERNAL_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timer };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_EXTERNAL_TIMEOUT_MS) {
  const { controller, timer } = withTimeoutController(timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function parseJsonSafe(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("Respuesta JSON invalida");
  }
}

async function generateAiImage(prompt) {
  const encodedPrompt = encodeURIComponent(prompt);
  const providers = [
    {
      name: "Vreden",
      exec: async () => {
        const response = await fetchWithTimeout(
          `https://api.vreden.my.id/api/texttoimg?prompt=${encodedPrompt}`,
          {},
          7000,
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await parseJsonSafe(response);
        if (data?.status && data?.data?.url) {
          return {
            imageUrl: data.data.url,
            provider: "Vreden",
            meta: data.data,
          };
        }
        throw new Error("Respuesta invalida");
      },
    },
    {
      name: "Pollinations",
      exec: async () => {
        // Pollinations genera la imagen directamente a partir de la URL
        const stylizedPrompt = encodeURIComponent(`${prompt} digital sticker illustration`);
        return {
          imageUrl: `https://image.pollinations.ai/prompt/${stylizedPrompt}`,
          provider: "Pollinations",
        };
      },
    },
  ];

  const errors = [];
  for (const provider of providers) {
    try {
      return await provider.exec();
    } catch (error) {
      errors.push(`${provider.name}: ${error?.message || error}`);
      logger.warn?.(`[image] ${provider.name} fallaron: ${error?.message || error}`);
    }
  }
  throw new Error(errors.join(" | ") || "No se pudieron obtener imagenes");
}

async function generateQrImage(dataString) {
  const encoded = encodeURIComponent(dataString);
  const providers = [
    {
      name: "Vreden",
      exec: async () => {
        const response = await fetchWithTimeout(
          `https://api.vreden.my.id/api/qrcode?text=${encoded}`,
          {},
          6000,
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await parseJsonSafe(response);
        if (data?.status && data?.data?.url) {
          return { imageUrl: data.data.url, provider: "Vreden" };
        }
        throw new Error("Respuesta invalida");
      },
    },
    {
      name: "QRServer",
      exec: async () => ({
        imageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encoded}`,
        provider: "QRServer",
      }),
    },
  ];

  const errors = [];
  for (const provider of providers) {
    try {
      return await provider.exec();
    } catch (error) {
      errors.push(`${provider.name}: ${error?.message || error}`);
      logger.warn?.(`[qr] ${provider.name} fallaron: ${error?.message || error}`);
    }
  }
  throw new Error(errors.join(" | ") || "No se pudo generar un codigo QR");
}

function buildProgressBar(percent, segments = 10) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  const filled = Math.round((safePercent / 100) * segments);
  const bar = `${"▓".repeat(filled)}${"░".repeat(Math.max(0, segments - filled))}`;
  return `${bar}`;
}

function describePlayProgress(percent) {
  if (!Number.isFinite(percent)) {
    return "Calculando tamaño de la descarga...";
  }
  if (percent < 10) return "Conectando con el servidor de audio...";
  if (percent < 45) return "Descargando la vista previa...";
  if (percent < 80) return "Procesando y normalizando el audio...";
  if (percent < 100) return "Preparando el archivo para enviarlo...";
  return "¡Descarga finalizada!";
}

async function downloadBufferWithProgress(url, { timeoutMs = 20000, onProgress } = {}) {
  const response = await fetchWithTimeout(url, {}, timeoutMs);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const totalHeader = response.headers?.get?.("content-length") || response.headers?.get?.("Content-Length");
  const totalBytes = totalHeader ? parseInt(totalHeader, 10) : null;

  if (!response.body || typeof response.body.on !== "function") {
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (typeof onProgress === "function") {
      onProgress({
        received: buffer.length,
        total: totalBytes,
        percent: totalBytes ? 100 : null,
        done: true,
      });
    }
    return buffer;
  }

  return await new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;

    const notify = (done = false) => {
      if (typeof onProgress !== "function") return;
      const percent = totalBytes ? (received / totalBytes) * 100 : null;
      onProgress({
        received,
        total: totalBytes,
        percent,
        done,
      });
    };

    response.body.on("data", (chunk) => {
      chunks.push(chunk);
      received += chunk.length;
      notify(false);
    });

    response.body.once("end", () => {
      notify(true);
      resolve(Buffer.concat(chunks));
    });

    response.body.once("error", (error) => {
      reject(error);
    });
  });
}

function renderPlayProgressMessage(track, requester, percent, statusText) {
  const safePercent = Number.isFinite(percent)
    ? Math.max(0, Math.min(100, Math.round(percent)))
    : null;
  const description = statusText || describePlayProgress(safePercent ?? 0);
  const progressLine = safePercent !== null
    ? `📊 ${buildProgressBar(safePercent)} ${safePercent}%`
    : "⏳ Calculando progreso...";

  const artist = track.artist || "Artista desconocido";
  const title = track.title || "Canción";
  const album = track.album || "Álbum no disponible";
  const duration = track.duration || "--:--";
  const url = track.url || "Sin enlace";

  return [
    "🎵 *Música encontrada*",
    "",
    `🎤 *Artista:* ${artist}`,
    `🎶 *Canción:* ${title}`,
    `💿 *Álbum:* ${album}`,
    `⏱️ *Duración:* ${duration}`,
    `🔗 *URL:* ${url}`,
    "",
    `⏬ *Estado:* ${description}`,
    progressLine,
    "",
    `🙋 Solicitado por: ${requester}`,
  ].join("\n");
}

function safeFileNameFromTitle(title, extension = "") {
  const normalizedTitle = (title || "media")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_\- ]+/g, " ")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60);
  const base = normalizedTitle || "media";
  const ext = extension ? (extension.startsWith(".") ? extension : `.${extension}`) : "";
  return `${base}${ext}`;
}

function formatCount(value) {
  if (value === null || typeof value === "undefined") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric.toLocaleString("es-ES");
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

function describeMediaDownloadProgress(kind, percent) {
  const normalizedKind = kind === "audio" ? "audio" : kind === "image" || kind === "imagen" ? "imagen" : "video";
  if (!Number.isFinite(percent)) {
    return `Descargando ${normalizedKind}...`;
  }
  if (percent < 10) {
    return `Conectando con el servidor de ${normalizedKind}...`;
  }
  if (percent < 45) {
    return `Descargando ${normalizedKind}...`;
  }
  if (percent < 80) {
    if (normalizedKind === "imagen") return "Procesando la imagen...";
    if (normalizedKind === "audio") return "Procesando el audio...";
    return "Procesando el video...";
  }
  if (percent < 100) {
    if (normalizedKind === "imagen") return "Preparando la imagen para enviarla...";
    if (normalizedKind === "audio") return "Preparando el audio para enviarlo...";
    return "Preparando el video para enviarlo...";
  }
  if (normalizedKind === "imagen") return "¡Imagen lista!";
  if (normalizedKind === "audio") return "¡Audio listo!";
  return "¡Video listo!";
}

function renderGenericProgressMessage({ title, percent, statusText, details = [] }) {
  const safePercent = Number.isFinite(percent)
    ? Math.max(0, Math.min(100, Math.round(percent)))
    : null;
  const progressLine = safePercent !== null
    ? `📊 ${buildProgressBar(safePercent)} ${safePercent}%`
    : "⏳ Calculando progreso...";
  const statusLine = statusText ? `\n${statusText}` : "";
  const info = details.filter(Boolean);
  const infoBlock = info.length ? `\n\n${info.join("\n")}` : "";
  return `${title}\n\n${progressLine}${statusLine}${infoBlock}`;
}

function createProgressMessenger(sock, remoteJid, initialText, { contextLabel } = {}) {
  let progressKey = null;
  let queue = Promise.resolve();
  const logContext = contextLabel ? ` ${contextLabel}` : "";

  const sendText = async (text, initial = false) => {
    try {
      if (progressKey && !initial) {
        await sock.sendMessage(remoteJid, { text }, { edit: progressKey });
      } else {
        const sent = await sock.sendMessage(remoteJid, { text });
        if (initial || !progressKey) {
          progressKey = sent?.key || null;
        }
      }
    } catch (error) {
      logger.warn(
        `No se pudo ${initial ? "enviar" : "actualizar"} mensaje de progreso${logContext}`,
        { error: error?.message },
      );
      if (!initial) {
        progressKey = null;
      }
    }
  };

  if (initialText) {
    queue = queue.then(() => sendText(initialText, true));
  }

  const queueUpdate = (text) => {
    queue = queue
      .then(() => sendText(text))
      .catch((error) => {
        logger.warn(`Fallo al procesar actualización de progreso${logContext}`, {
          error: error?.message,
        });
      });
    return queue;
  };

  const flush = async () => {
    try {
      await queue;
    } catch (error) {
      logger.warn(`Cola de progreso rechazada${logContext}`, { error: error?.message });
    }
  };

  return { queueUpdate, flush };
}

async function sendMediaWithProgress({
  sock,
  remoteJid,
  url,
  type,
  header,
  detailLines = [],
  mimetype,
  caption,
  mentions,
  fileName,
  extraMessageFields = {},
  contextLabel,
  timeoutMs = 60000,
  getFailureMessage,
}) {
  if (!url) {
    throw new Error("URL de descarga no válida");
  }

  const normalizedType = type === "audio" ? "audio" : type === "image" ? "imagen" : "video";
  const details = detailLines.filter(Boolean);
  const render = (percent, statusText) =>
    renderGenericProgressMessage({
      title: header,
      percent,
      statusText: statusText ?? describeMediaDownloadProgress(normalizedType, percent),
      details,
    });

  const progress = createProgressMessenger(
    sock,
    remoteJid,
    render(0, "Preparando descarga..."),
    { contextLabel },
  );

  progress.queueUpdate(render(5, `Conectando con el servidor de ${normalizedType}...`));

  let buffer;
  let lastPercent = 5;
  let notifiedUnknown = false;

  try {
    buffer = await downloadBufferWithProgress(url, {
      timeoutMs,
      onProgress: ({ percent }) => {
        if (Number.isFinite(percent)) {
          const rounded = Math.max(0, Math.min(100, Math.round(percent)));
          if (rounded - lastPercent >= 4 || rounded >= 99) {
            lastPercent = rounded;
            progress.queueUpdate(
              render(rounded, describeMediaDownloadProgress(normalizedType, rounded)),
            );
          }
        } else if (!notifiedUnknown) {
          notifiedUnknown = true;
          progress.queueUpdate(render(null, `Descargando ${normalizedType}...`));
        }
      },
    });
  } catch (error) {
    logger.error(`Error descargando ${normalizedType} (${contextLabel || "media"}):`, error);
    progress.queueUpdate(render(lastPercent, "No se pudo completar la descarga."));
    await progress.flush();
    if (typeof getFailureMessage === "function") {
      try {
        const message = getFailureMessage(error, { stage: "download" });
        if (message) {
          await sock.sendMessage(remoteJid, message);
        }
      } catch (notifyError) {
        logger.warn("No se pudo enviar mensaje de fallo de descarga", {
          error: notifyError?.message,
        });
      }
    }
    return false;
  }

  progress.queueUpdate(render(100, "¡Descarga finalizada! Enviando archivo..."));
  await progress.flush();

  const messagePayload = {
    caption,
    mimetype,
    mentions,
    ...extraMessageFields,
  };

  if (fileName) {
    messagePayload.fileName = fileName;
  }

  if (normalizedType === "audio") {
    messagePayload.audio = buffer;
    if (typeof messagePayload.ptt === "undefined") {
      messagePayload.ptt = false;
    }
  } else if (normalizedType === "imagen") {
    messagePayload.image = buffer;
  } else {
    messagePayload.video = buffer;
  }

  try {
    await sock.sendMessage(remoteJid, messagePayload);
    return true;
  } catch (error) {
    logger.error(`Error enviando ${normalizedType} (${contextLabel || "media"}):`, error);
    if (typeof getFailureMessage === "function") {
      try {
        const message = getFailureMessage(error, { stage: "send" });
        if (message) {
          await sock.sendMessage(remoteJid, message);
        }
      } catch (notifyError) {
        logger.warn("No se pudo enviar mensaje de fallo de envío", {
          error: notifyError?.message,
        });
      }
    }
    return false;
  }
}

const SHORT_URL_PROVIDERS = [
  {
    name: "Vreden",
    exec: async (targetUrl) => {
      const response = await fetchWithTimeout(
        `https://api.vreden.my.id/api/shorturl?url=${encodeURIComponent(targetUrl)}`,
        {},
        6000,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await parseJsonSafe(response);
      if (data?.status && data?.data?.shortUrl) {
        return { shortUrl: data.data.shortUrl, provider: "Vreden" };
      }
      throw new Error("Respuesta invalida");
    },
  },
  {
    name: "is.gd",
    exec: async (targetUrl) => {
      const response = await fetchWithTimeout(
        `https://is.gd/create.php?format=json&url=${encodeURIComponent(targetUrl)}`,
        {},
        6000,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await parseJsonSafe(response);
      if (data?.shorturl) {
        return { shortUrl: data.shorturl, provider: "is.gd" };
      }
      throw new Error(data?.errormessage || "Respuesta invalida");
    },
  },
  {
    name: "TinyURL",
    exec: async (targetUrl) => {
      const response = await fetchWithTimeout(
        `https://tinyurl.com/api-create.php?url=${encodeURIComponent(targetUrl)}`,
        {},
        6000,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const shortUrl = (await response.text()).trim();
      if (shortUrl.startsWith("http")) {
        return { shortUrl, provider: "TinyURL" };
      }
      throw new Error("Respuesta invalida");
    },
  },
];

async function shortenUrl(targetUrl) {
  const errors = [];
  for (const provider of SHORT_URL_PROVIDERS) {
    try {
      return await provider.exec(targetUrl);
    } catch (error) {
      errors.push(`${provider.name}: ${error?.message || error}`);
      logger.warn?.(`[shorturl] ${provider.name} fallaron: ${error?.message || error}`);
    }
  }
  throw new Error(errors.join(" | ") || "No se pudo acortar la URL");
}

const TTS_CHARACTER_VOICE_MAP = {
  narrator: "es-ES_Standard_A",
  mario: "it-IT_Standard_A",
  luigi: "it-IT_Standard_B",
  vader: "en-US_Standard_C",
  yoda: "en-US_Standard_D",
  homer: "en-US_Standard_B",
  bart: "en-US_Standard_C",
  marge: "en-US_Standard_F",
  spongebob: "en-US_Standard_G",
  patrick: "en-US_Standard_H",
  squidward: "en-US_Standard_I",
  mickey: "en-US_Standard_J",
  donald: "en-US_Standard_K",
  goofy: "en-US_Standard_L",
  shrek: "en-GB_Standard_A",
  batman: "en-US_Standard_D",
  joker: "en-US_Standard_E",
  pikachu: "en-US_Standard_H",
  sonic: "en-US_Standard_G",
  optimus: "en-US_Standard_B",
};

async function synthesizeVoice(text, character) {
  const normalized = String(character || "").toLowerCase().trim();
  const preferredVoices = [
    TTS_CHARACTER_VOICE_MAP[normalized],
    TTS_CHARACTER_VOICE_MAP.narrator,
    "es-ES_Standard_A",
  ].filter(Boolean);

  const errors = [];
  for (const voice of preferredVoices) {
    try {
      const response = await fetchWithTimeout(
        `https://api.streamelements.com/kappa/v2/speech?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text)}`,
        {},
        Math.max(DEFAULT_EXTERNAL_TIMEOUT_MS, 15000),
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const audioBuffer = Buffer.from(await response.arrayBuffer());
      if (!audioBuffer.length) {
        throw new Error("Audio vacio");
      }
      return { buffer: audioBuffer, voice };
    } catch (error) {
      errors.push(`${voice}: ${error?.message || error}`);
      logger.warn?.(`[tts] ${voice} fallaron: ${error?.message || error}`);
    }
  }
  throw new Error(errors.join(" | ") || "No se pudo generar audio TTS");
}

// Handlers para QR y código de vinculación
async function handleQROrCodeRequest(method, ownerNumber) {
  try {
    // Crear el subbot y esperar el evento QR
    const result = await generateSubbotQR(ownerNumber);
    
    if (!result || !result.code) {
      return { message: "❌ Error al crear el subbot" };
    }

    const subbotCode = result.code;

    // Esperar el evento qr_ready con timeout usando registerSubbotListeners
    return new Promise((resolve) => {
      let detach = null;
      const timeout = setTimeout(() => {
        if (detach) detach();
        resolve({ message: "⏱️ Timeout esperando el código QR. Intenta nuevamente." });
      }, 30000); // 30 segundos

      import('./inproc-subbots.js').then(({ registerSubbotListeners }) => {
      
        detach = registerSubbotListeners(subbotCode, [
          {
            event: 'qr_ready',
            handler: (payload) => {
              const data = payload?.data || payload;
              if (data?.qrImage) {
                clearTimeout(timeout);
                if (detach) detach();
                resolve({
                  image: data.qrImage,
                  message: `✅ Código QR generado\n\n📱 Escanea este código para vincular tu subbot\n\n🆔 Código: ${subbotCode}`,
                  code: subbotCode
                });
              }
            }
          }
        ]);
      }).catch(err => {
        clearTimeout(timeout);
        resolve({ message: `❌ Error cargando listeners: ${err.message}` });
      });
    });
  } catch (error) {
    logger.error("Error al generar QR:", error);
    return { message: `❌ Error: ${error.message}` };
  }
}

async function handlePairingCode(phoneNumber) {
  try {
    // Limpiar el número
    const cleanNumber = String(phoneNumber).replace(/\D/g, '');
    
    if (!cleanNumber || cleanNumber.length < 10) {
      return { message: "❌ Número inválido. Debe tener al menos 10 dígitos." };
    }

    // Crear el subbot con pairing code
    const result = await generateSubbotPairingCode(cleanNumber, cleanNumber, {
      displayName: "KONMI-BOT"
    });
    
    if (!result || !result.code) {
      return { message: "❌ Error al crear el subbot" };
    }

    const subbotCode = result.code;

    // Esperar el evento pairing_code con timeout usando registerSubbotListeners
    return new Promise((resolve) => {
      let detach = null;
      const timeout = setTimeout(() => {
        if (detach) detach();
        resolve({ message: "⏱️ Timeout esperando el código. Intenta nuevamente." });
      }, 30000); // 30 segundos

      import('./inproc-subbots.js').then(({ registerSubbotListeners }) => {
        detach = registerSubbotListeners(subbotCode, [
          {
            event: 'pairing_code',
            handler: (payload) => {
              const data = payload?.data || payload;
              if (data?.pairingCode || data?.code) {
                const code = data.pairingCode || data.code;
                clearTimeout(timeout);
                if (detach) detach();
                resolve({
                  message: `✅ Código de vinculación generado\n\n🔢 Código: *${code}*\n📱 Número: +${cleanNumber}\n\n📲 Instrucciones:\n1. Abre WhatsApp en el dispositivo con número +${cleanNumber}\n2. Ve a Dispositivos vinculados\n3. Toca "Vincular dispositivo"\n4. Selecciona "Vincular con número de teléfono"\n5. Ingresa el código: *${code}*\n\n⏱️ Válido por 10 minutos\n🆔 Código subbot: ${subbotCode}`,
                  code: subbotCode
                });
              }
            }
          }
        ]);
      }).catch(err => {
        clearTimeout(timeout);
        resolve({ message: `❌ Error cargando listeners: ${err.message}` });
      });
    });
  } catch (error) {
    logger.error("Error al generar código:", error);
    return { message: `❌ Error: ${error.message}` };
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
      logger.pretty.line("🗄️ Tabla bot_global_state creada");
    }
    // Asegurar una fila
    const row = await db("bot_global_state").first("id");
    if (!row) {
      await db("bot_global_state").insert({ is_on: true });
      logger.pretty.line("✅ Estado global inicializado (is_on=true)");
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

// Función para reiniciar la tabla subbots
async function resetSubbotsTable() {
  try {
    logger.warn("Reiniciando tabla subbots...");
    await db.schema.dropTableIfExists("subbots");
    await db.schema.dropTableIfExists("subbots_temp");
    subbotsTableReady = false;
    await ensureSubbotsTable();
    logger.info("✅ Tabla subbots reiniciada exitosamente");
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
        logger.info("La tabla subbots no existe, creándola...");

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

        logger.info("✅ Tabla subbots creada exitosamente");
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
                logger.info(`✅ Columna ${col} agregada`);
              } catch (alterError) {
                logger.warn(`No se pudo agregar ${col}:`, alterError.message);
                throw alterError; // Forzar recreación de tabla
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

      // Si es el último intento, crear tabla temporal
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
          logger.warn("✅ Tabla temporal subbots_temp creada");
          return true;
        } catch (tempError) {
          logger.error("Error crítico al crear tabla temporal:", tempError);
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

// Helper FS: detectar si un subbot ya se vinculó leyendo archivos de sesión
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

    // Determinar qué tabla usar (temp o normal)
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

          // Verificar si el directorio de autenticación existe
          if (fs.existsSync(path.join(baseDir, "auth", "creds.json"))) {
            // Actualizar estado a conectado si no lo está
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
                `🔗 Subbot conectado (owner ${ownerNumber}) -> ${r.bot_number || "N/A"}`,
              );
            }
          } else {
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
                `❌ Subbot desconectado (owner ${ownerNumber}) -> ${r.bot_number || "N/A"}`,
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

      // Verificar si hay subbots en el sistema de archivos que no están en la base de datos
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
                  logger.pretty.line(`➕ Subbot detectado en FS: ${dir}`);
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
// Inicialización de la base de datos
async function initializeDatabase() {
  try {
    // Verificar conexión a la base de datos
    const isConnected = await checkDatabaseConnection();
    if (!isConnected) {
      throw new Error("No se pudo conectar a la base de datos");
    }

    // Asegurar que las tablas existan
    await ensureBotGlobalStateTable();
    await ensureSubbotsTable();

    logger.info("✅ Base de datos inicializada correctamente");
    return true;
  } catch (error) {
    logger.error("❌ Error al inicializar la base de datos:", error);
    process.exit(1); // Salir con error si no se puede inicializar la base de datos
  }
}

// Inicializar la base de datos al cargar el módulo
initializeDatabase().catch((error) => {
  logger.error(
    "Error fatal durante la inicialización de la base de datos:",
    error,
  );
  process.exit(1);
});

import { isSuperAdmin, setPrimaryOwner } from "./global-config.js";
import { logConfigurationChange } from "./commands.js";
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
  handleBots,
  // Archivos
  handleDescargar,
  handleGuardar,
  handleArchivos,
  handleMisArchivos,
  handleEstadisticas,
  handleBuscarArchivo,
  handleYouTubeDownload,
  handleSticker,
  handleImage,
  handleHoroscope,
  handleKick,
  handlePromote,
  handleDemote,
  handleLock,
  handleUnlock,
 // Permisos centralizados
  isOwnerOrAdmin,
  isRealGroupAdmin,
} from "./commands-complete.js";

// Gestor multi-cuenta (subbots reales)
import {
  startSubbot,
  stopSubbotRuntime as stopSubbot,
  getAllSubbots,
} from "./lib/subbots.js";

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
let userSelectedMethod = null; // Guardar método seleccionado por el usuario
let userSelectedPhone = null; // Guardar número seleccionado por el usuario

// Caches necesarios para logs y permisos (evitan ReferenceError en logAllMessages)
const nameCache = new Map();
const groupNameCache = new Map();
const groupAdminsCache = new Map();

// Evitar reprocesar mensajes y permitir logs/owner con mensajes propios
const processedMessageIds = new Set();

// Sanitizar input de número de teléfono
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
    // Directorio por número (multiaccount)
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

// Asegurar tabla de configuración de grupos
let groupSettingsTableReady = false;

// ==============================
// Auto-gestión de RAM y DISCO
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
    logger.pretty.section("Mantenimiento de memoria", "🧼");
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

        // Regla 1: sesiones QR efímeras "qr-<timestamp>" antiguas
        if (/^qr-\d+/.test(ent.name) && age > twoHours) {
          try {
            fs.rmSync(full, { recursive: true, force: true });
            logger.info?.(`🗑️ Limpieza: QR efímero ${full}`);
          } catch (_) {}
          continue;
        }

        // Regla 2: auth-sessions/subbot-<id> huérfanos (ID no existe ya)
        if (root.endsWith("auth-sessions") && /^subbot-\d+/.test(ent.name)) {
          const botId = Number(ent.name.split("-")[1]);
          try {
            const row = await db("subbots").where({ id: botId }).first();
            if (!row) {
              fs.rmSync(full, { recursive: true, force: true });
              logger.info?.(`🗑️ Limpieza: auth huérfano ${full}`);
            }
          } catch (_) {}
          continue;
        }

        // Regla 3: directorios por número (multiaccount) sin vínculo o antiguos
        if (/^\d{7,15}$/.test(ent.name) && age > oneDay) {
          try {
            const row = await db("subbots")
              .where({ bot_number: ent.name })
              .first();
            if (!row || (row.state && row.state !== "connected")) {
              fs.rmSync(full, { recursive: true, force: true });
              logger.info?.(`🗑️ Limpieza: subbot antiguo/no vinculado ${full}`);
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
            `🧠 RAM alta: RSS=${bytesToMB(rss)} MB. Limpiando caches...`,
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
      logger.pretty.line("🗄️ Tabla group_settings creada");
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

// Función para verificar si el usuario es el owner específico (595974154768)
function isSpecificOwner(usuario) {
  try {
    // Normalizar el número de usuario
    let normalizedUser = normalizeJidToNumber(usuario);
    if (!normalizedUser) {
      normalizedUser = String(usuario || "").replace(/[^\d]/g, "");
    }

    // Definir el número de owner (fijo)
    const ownerNumber = "595974154768";

    // PRIORIDAD 1: Comparar número completo primero
    const isExactMatch = normalizedUser === ownerNumber;

    // PRIORIDAD 2: Comparar últimos 9 dígitos (fallback)
    const userTail = normalizedUser.slice(-9);
    const ownerTail = ownerNumber.slice(-9);
    const isTailMatch = userTail === ownerTail && userTail.length === 9;

    // Verificar coincidencia
    const isSpecific = isExactMatch || isTailMatch;

    // Verificar si es super admin
    let isSuper = false;
    try {
      isSuper = isSuperAdmin(usuario);
    } catch (error) {
      logger.error("Error verificando isSuperAdmin:", error);
    }

    // El resultado es true si es el owner o super admin
    const result = isSuper || isSpecific;

    // Log detallado para depuración
    logger.pretty.banner("🛡️ Verificación de owner", "🔍");
    logger.pretty.kv("Usuario original", usuario || "N/A");
    logger.pretty.kv("Usuario normalizado", normalizedUser || "N/A");
    logger.pretty.kv("Número owner", ownerNumber);
    logger.pretty.kv("Match exacto", isExactMatch ? "✅ SI" : "❌ NO");
    logger.pretty.kv("Match últimos 9", isTailMatch ? "✅ SI" : "❌ NO");
    logger.pretty.kv("Es super admin", isSuper ? "✅ SI" : "❌ NO");
    logger.pretty.kv(
      "Resultado",
      result ? "✅ ACCESO PERMITIDO" : "❌ ACCESO DENEGADO",
    );

    // Log adicional para depuración
    logger.debug("Detalles de verificación:", {
      usuario,
      normalizedUser,
      ownerNumber,
      isExactMatch,
      userTail,
      ownerTail,
      isTailMatch,
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
    // asegurar estructura de BD mínima para lectura
    await ensureGroupSettingsTable();
    if (!groupId.endsWith("@g.us")) return true; // Si no es grupo, siempre activo

    const groupState = await db("group_settings")
      .select("is_active")
      .where({ group_id: groupId })
      .first();

    logger.pretty.section("Estado de grupo", "👥");
    logger.pretty.kv("Grupo", groupId);
    logger.pretty.kv("Registro", JSON.stringify(groupState));

    if (!groupState) {
      logger.pretty.line("ℹ️ No hay registro para el grupo, asumiendo activo");
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

    logger.pretty.section("Estado global del bot (BD)", "🌐");
    logger.pretty.kv("Registro", JSON.stringify(globalState));

    if (!globalState) {
      logger.pretty.line("ℹ️ No hay registro en BD, asumiendo activo");
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

// Obtener separación simple de código de país y número local para logs
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
    // Heurística
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

// Helpers: información del sistema y del runtime para comandos /status, /info, /serverinfo, /hardware, /runtime
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
    `🖥️ *Información del servidor*\n\n` +
    `💻 CPU: ${cpuModel} · ${cpuCores} núcleos @ ${cpuSpeed}\n` +
    `🧠 RAM: ${fmt(usedMem)} usadas / ${fmt(totalMem)} totales\n` +
    `🎮 GPU: ${gpuModel}\n` +
    `🧾 SO: ${osLine}\n` +
    `⏱️ Uptime: ${uptime}`
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
    `⚙️ *Runtime Node.js*\n\n` +
    `🟢 Node: ${process.version}\n` +
    `📦 Plataforma: ${process.platform}/${process.arch}\n` +
    `🧪 V8: ${process.versions?.v8 || "N/A"} · OpenSSL: ${process.versions?.openssl || "N/A"}\n` +
    `📈 Memoria: RSS ${fmt(rss)} · Heap ${fmt(heap)}\n` +
    `⏱️ Uptime proceso: ${h}h ${m}m ${s}s · CPU usado: ${cpuMs} ms`
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

    // Debug: Ver qué información tenemos del mensaje
    logger.pretty.section("Debug mensaje", "🔎");
    logger.pretty.kv("pushName", message.pushName || "-");
    logger.pretty.kv("usuario", usuario);
    logger.pretty.kv("key.participant", message.key?.participant || "-");
    logger.pretty.kv("key.remoteJid", message.key?.remoteJid || "-");

    // Metodo 1: Obtener pushName directamente del mensaje
    if (message.pushName && message.pushName.trim()) {
      contactName = message.pushName.trim();
      logger.pretty.line(`🧾 Usando pushName: ${contactName}`);
    }
    // Metodo 2: Si es el owner, usar nombre conocido
    else if (isSpecificOwner(usuario)) {
      contactName = "Melodia (Owner)";
      logger.pretty.line(`👑 Detectado como owner: ${contactName}`);
    }
    // Metodo 3: Intentar desde messageInfo si existe
    else if (message.key && message.key.participant) {
      const participant = message.key.participant.split("@")[0];
      if (isSpecificOwner(participant)) {
        contactName = "Melodia (Owner)";
      } else {
        contactName = `Usuario ${participant.slice(-4)}`;
      }
      logger.pretty.line(`👥 Usando participant: ${contactName}`);
    }
    // Metodo 4: Fallback con cache
    else {
      contactName = await getContactName(usuario);
      logger.pretty.line(`🗂️ Usando cache/fallback: ${contactName}`);
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
    let contentType = "📝 Texto";
    if (message.message?.imageMessage) contentType = "🖼️ Imagen";
    else if (message.message?.videoMessage) contentType = "🎞️ Video";
    else if (message.message?.audioMessage) contentType = "🎵 Audio";
    else if (message.message?.documentMessage) contentType = "📄 Documento";
    else if (message.message?.stickerMessage) contentType = "🔖 Sticker";
    else if (message.message?.locationMessage) contentType = "📍 Ubicación";
    else if (message.message?.contactMessage) contentType = "👤 Contacto";

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
      logger.pretty.banner(`${messageTypeTitle} en grupo`, "💬");
      logger.pretty.section("Grupo", "🧩");
      logger.pretty.kv("Nombre", groupName || "Grupo sin nombre");
      logger.pretty.kv("ID", remoteJid);
      logger.pretty.section("Usuario", "👤");
      logger.pretty.kv("Nombre", contactName || usuario);
      logger.pretty.kv("Número", usuario);
      logger.pretty.kv(
        "Código país",
        `+${split.cc}${split.iso ? ` (${split.iso})` : ""}`,
      );
      logger.pretty.kv("Número local", split.local);
      logger.pretty.kv("Owner", isSpecificOwner(usuario) ? "SI" : "NO");
      logger.pretty.section("Contenido", "🗂️");
      logger.pretty.kv("Tipo", isCommand ? "Comando" : "Mensaje");
      logger.pretty.kv("Contenido", contentType);
      logger.pretty.kv("Texto", displayText);
      logger.pretty.kv("Tiene letras", hasLetters ? "SI" : "NO");
      logger.pretty.kv("Fecha", fechaHora);
    } else {
      logger.pretty.banner(`${messageTypeTitle} privado`, "💬");
      logger.pretty.section("Usuario", "👤");
      logger.pretty.kv("Nombre", contactName || usuario);
      logger.pretty.kv("Número", usuario);
      logger.pretty.kv(
        "Código país",
        `+${split.cc}${split.iso ? ` (${split.iso})` : ""}`,
      );
      logger.pretty.kv("Número local", split.local);
      logger.pretty.kv("Owner", isSpecificOwner(usuario) ? "SI" : "NO");
      logger.pretty.section("Contenido", "🗂️");
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
// Función principal para manejar todos los mensajes entrantes
export async function handleMessage(message, customSock = null, prefix = "") {
  try {
    // Obtener el socket de manera segura
    const sock = customSock || global.sock;
    
    // Verificar que el socket esté disponible
    if (!sock || !sock.ev || typeof sock.ev.on !== 'function') {
      console.error("❌ ERROR: Intento de procesar mensaje sin conexión activa");
      return; // Salir silenciosamente si no hay conexión
    }
    
    // Verificar que el mensaje tenga la estructura esperada
    if (!message || !message.key || !message.key.remoteJid) {
      console.error("❌ Mensaje recibido sin estructura válida:", message);
      return;
    }

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

    // CASO ESPECIAL: Si fromMe = true, el mensaje lo envió el bot
    // Necesitamos obtener el número del bot, no del destinatario
    if (message.key.fromMe) {
      // El mensaje lo envió el bot (owner)
      // SIEMPRE obtener el número del bot del socket primero
      const botNum = getBotNumber(sock);
      usuario = botNum || "595974154768"; // Fallback al owner conocido
      
      if (isGroup) {
        // En grupos: participant puede estar presente o no
        sender = message.key.participant;
        if (!sender) {
          // Si no hay participant, construir el JID del bot
          sender = `${usuario}@s.whatsapp.net`;
        } else {
          // Si hay participant, verificar que sea consistente
          const participantNum = normalizeJidToNumber(sender);
          if (participantNum && participantNum !== usuario) {
            // Si el participant es diferente al bot, usar el del bot
            logger.pretty.line(`⚠️ Participant inconsistente en fromMe: ${participantNum} vs ${usuario}`);
            sender = `${usuario}@s.whatsapp.net`;
          }
        }
      } else {
        // En privado: construir el JID del bot
        sender = `${usuario}@s.whatsapp.net`;
      }
    } else {
      // Mensaje de otro usuario
      if (isGroup) {
        // En grupos: usar participant (quien envio el mensaje)
        sender = message.key.participant;
        if (!sender) {
          logger.pretty.line("⚠️ No se pudo obtener participant en grupo");
          return;
        }
        // Extraer numero normalizado del participant (soporta LID)
        usuario = normalizeJidToNumber(sender);
      } else {
        // En privado: usar remoteJid (el chat directo)
        sender = remoteJid;
        usuario = normalizeJidToNumber(remoteJid);
      }
    }
    // usuario ya viene normalizado a solo digitos

    // LOGS DECORADOS PARA TODOS LOS MENSAJES
    await logAllMessages(message, messageText, remoteJid, usuario, isGroup);

    // Verificar que el mensaje no este vacio
    if (!messageText || messageText === "") {
      logger.pretty.line("⚠️ Mensaje vacío - no procesando");
      return;
    }

    // Solo procesar comandos que empiecen con /, !, o .
    if (
      !messageText.startsWith("/") &&
      !messageText.startsWith("!") &&
      !messageText.startsWith(".")
    ) {
      logger.pretty.line("ℹ️ Mensaje normal - no es comando");
      return;
    }

    // Verificar que el comando tenga al menos una letra despues del prefijo
    const commandPart = messageText.substring(1);
    if (!commandPart || !/[a-zA-Z]/.test(commandPart)) {
      logger.pretty.line(`⚠️ Comando inválido - sin letras: "${messageText}"`);
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

    logger.pretty.section("Verificación de estado", "🔍");
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
        logger.pretty.line("✅ Excepción global: /bot global on permitido");
        // Continuar al switch
      } else {
        logger.pretty.line("⛔ Bloqueado por estado global");

        const userKey = `global_notified_${usuario}`;
        if (!global.notifiedUsers) {
          global.notifiedUsers = new Set();
        }

        if (!global.notifiedUsers.has(userKey)) {
          global.notifiedUsers.add(userKey);

          if (isOwner) {
            await sock.sendMessage(remoteJid, {
              text: "⛔ *Bot desactivado globalmente*\n\nℹ️ Puedes usar: `/bot global on` para reactivarlo",
            });
          } else {
            await sock.sendMessage(remoteJid, {
              text: "🚫 *Bot desactivado*\n\n⏳ El bot está temporalmente fuera de servicio.\n👑 Solo el owner puede reactivarlo.",
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
            "✅ Excepción grupo: Comando de control permitido",
          );
          // Continuar al switch
        } else {
          logger.pretty.line("⛔ Bloqueado por estado de grupo");

          const userKey = `group_notified_${usuario}_${remoteJid}`;
          if (!global.notifiedUsers) {
            global.notifiedUsers = new Set();
          }

          if (!global.notifiedUsers.has(userKey)) {
            global.notifiedUsers.add(userKey);

            await sock.sendMessage(remoteJid, {
              text: "🚫 *Bot desactivado en este grupo*\n\nℹ️ El bot no está activo en este grupo.\n✅ Usa `/bot on` para reactivarlo",
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
        // REDIRIGIR A PRIVADO SI ES EN GRUPO
        if (isGroup) {
          await sock.sendMessage(
            remoteJid,
            { 
              text: "🔒 *Comando de Subbot*\n\n" +
                    "⚠️ Por seguridad, este comando solo funciona en chat privado.\n\n" +
                    "📱 *Instrucciones:*\n" +
                    "1. Abre un chat privado conmigo\n" +
                    "2. Envía el comando `/qr`\n" +
                    "3. Escanea el código QR que te enviaré\n\n" +
                    "💡 Esto evita que otros vean tu código de vinculación."
            },
            { quoted: message },
          );
          return;
        }
        
        if (!isOwner) {
          await sock.sendMessage(
            remoteJid,
            { text: "❌ Solo el owner puede usar este comando" },
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
        // Listener de conexión para QR
        if (qrResponse?.code) {
          try {
            const { registerSubbotListeners } = await import('./inproc-subbots.js');
            const detach = registerSubbotListeners(qrResponse.code, [
              {
                event: 'connected',
                handler: async () => {
                  try {
                    await sock.sendMessage(remoteJid, {
                      text:
                        `🤖 *SubBot conectado exitosamente*\n\n` +
                        `🧩 **Código:** ${qrResponse.code}\n` +
                        `✅ **Estado:** Conectado\n` +
                        `🚀 ¡Listo para usar!\n\n` +
                        `📋 Usa \`/bots\` para ver todos los subbots activos`,
                    });
                  } finally {
                    try { detach?.(); } catch (_) {}
                  }
                },
              },
            ]);
          } catch (_) {}
        }
        break;

      case "/code":
      case "/subcode":
        // REDIRIGIR A PRIVADO SI ES EN GRUPO
        if (isGroup) {
          await sock.sendMessage(
            remoteJid,
            { 
              text: "🔒 *Comando de Subbot*\n\n" +
                    "⚠️ Por seguridad, este comando solo funciona en chat privado.\n\n" +
                    "📱 *Instrucciones:*\n" +
                    "1. Abre un chat privado conmigo\n" +
                    "2. Envía el comando `/code`\n" +
                    "3. Te enviaré un código de 8 dígitos\n" +
                    "4. Ingrésalo en WhatsApp > Dispositivos vinculados\n\n" +
                    "💡 Esto evita que otros vean tu código de vinculación."
            },
            { quoted: message },
          );
          return;
        }
        
        // Comando disponible para todos los usuarios
        // Usar el número del usuario automáticamente
        const codeResponse = await handlePairingCode(usuario);
        await sock.sendMessage(
          remoteJid,
          { text: codeResponse.message },
          { quoted: message },
        );
        // Si obtuvimos el código del subbot, adjuntar listeners para avisar al conectar
        if (codeResponse?.code) {
          try {
            const { registerSubbotListeners } = await import('./inproc-subbots.js');
            const detach = registerSubbotListeners(codeResponse.code, [
              {
                event: 'connected',
                handler: async () => {
                  try {
                    await sock.sendMessage(remoteJid, {
                      text:
                        `🤖 *SubBot conectado exitosamente*\n\n` +
                        `🧩 **Código:** ${codeResponse.code}\n` +
                        `✅ **Estado:** Conectado\n` +
                        `🚀 ¡Listo para usar!\n\n` +
                        `📋 Usa \`/bots\` para ver todos los subbots activos`,
                    });
                  } finally {
                    try { detach?.(); } catch (_) {}
                  }
                },
              },
              {
                event: 'error',
                handler: async (evt) => {
                  try {
                    await sock.sendMessage(remoteJid, {
                      text:
                        `⚠️ *Error en SubBot*\n\n` +
                        `🧩 **Código:** ${codeResponse.code}\n` +
                        `🧯 **Error:** ${evt?.data?.message || 'desconocido'}`,
                    });
                  } finally {
                    try { detach?.(); } catch (_) {}
                  }
                },
              }
            ]);
          } catch (_) {}
        }
        break;

      case "/status":
      case "/substatus":
        if (!isOwner) {
          await sock.sendMessage(
            remoteJid,
            { text: "❌ Solo el owner puede usar este comando" },
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
                return `ID: ${bot.code}\nEstado: ${bot.status}\nConectado: ${bot.isOnline ? "Sí" : "No"}\n`;
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
            text: `Status del SubBot ${botId}:\nEstado: ${status.status}\nConectado: ${status.isOnline ? "Sí" : "No"}`,
          },
          { quoted: message },
        );
        break;

      case "/subbots":
        if (!isOwner) {
          await sock.sendMessage(
            remoteJid,
            { text: "❌ Solo el owner puede usar este comando" },
            { quoted: message },
          );
          return;
        }
        const bots = await getAllSubbotsFromLib();
        const botsText =
          bots
            .map((bot) => {
              return `ID: ${bot.code}\nEstado: ${bot.status}\nConectado: ${bot.isOnline ? "Sí" : "No"}\n`;
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
            { text: "❌ Solo el owner puede usar este comando" },
            { quoted: message },
          );
          return;
        }
        const stopBotId = args[0];
        if (!stopBotId) {
          await sock.sendMessage(
            remoteJid,
            { text: "ℹ️ Uso: /stopbot <bot-id>" },
            { quoted: message },
          );
          return;
        }
        const stopResult = await stopSubbot(stopBotId);
        await sock.sendMessage(
          remoteJid,
          {
            text: stopResult.success
              ? `✅ Bot ${stopBotId} detenido`
              : `❌ Error: ${stopResult.error}`,
          },
          { quoted: message },
        );
        break;

      // Comandos basicos
      case "/test":
        await sock.sendMessage(remoteJid, {
          text: `✅ Bot funcionando correctamente\n\n👤 Solicitado por: @${usuario}\n🕒 ${new Date().toLocaleString("es-ES")}`,
          mentions: [usuario + "@s.whatsapp.net"],
        });
        break;

      case "/help":
      case "/ayuda":
      case "/menu":
      case "/comandos":
        // Funcion de ayuda simplificada que funciona directamente
        const helpText = `
┌────────────────────────────┐
│ 🤖  KONMI BOT v2.5.0       │
└────────────────────────────┘

• 🧪 Básicos
  /test · /help · /ping · /status · /info · /whoami · /owner

• 🤖 IA
  /ia [pregunta] · /ai [pregunta] · /clasificar

• 🗂️ Aportes
  /aportes · /myaportes · /addaporte [texto] · /aporteestado [id] [estado]

• 📝 Pedidos
  /pedidos · /pedido [texto]

• 📚 Manhwas
  /manhwas · /addmanhwa [título|género|desc] · /obtenermanhwa [nombre]

• 📺 Series/TV
  /series · /addserie [título|género|desc]

• 🎵 Multimedia
  /music [canción] · /spotify [canción] · /video [búsqueda]
  /play [canción] · /tts [texto]|[personaje] · /meme · /joke · /quote

• 🌐 Redes
  /tiktok · /instagram · /facebook · /twitter · /pinterest · /youtube

• 🧰 Utilidades
  /translate [texto] · /weather [ciudad] · /fact · /trivia

• 📁 Archivos
  /archivos · /misarchivos · /descargar [url] · /guardar

• 🛡️ Administración
  /kick @usuario · /promote @usuario · /demote @usuario
  /lock · /unlock · /tag [mensaje]

• ⚙️ Bot
  /bot on · /bot off · /bot global on · /bot global off

• 🤝 Subbots
  /bots · /subbots · /addbot [nombre] [número]
  /delbot [id] · /botinfo [id] · /restartbot [id]
  /connectbot [id] · /connectbot [id] code · /paircode [id] · /disconnectbot [id]

• 🧾 QR
  /qr [texto]

Solicitado por: @${usuario}
${new Date().toLocaleString("es-ES")}`;

        await sock.sendMessage(remoteJid, {
          text: helpText,
          mentions: [usuario + "@s.whatsapp.net"],
        });
        break;

      // SUBBOTS (solo /qr y /code) - CASOS DUPLICADOS COMENTADOS
      // NOTA: Los casos /qr y /code ya están manejados arriba con verificación de owner
      /* case "/qr": {
        try {
          await ensureSubbotsTable();
          await updateOwnerSubbotStatus(usuario);

          // Verificar límite de subbots por usuario (máximo 3)
          const userSubbots = await db("subbots").where({
            request_jid: usuario + "@s.whatsapp.net",
            status: "connected",
          });
          if (userSubbots.length >= 3) {
            await sock.sendMessage(remoteJid, {
              text:
                `╔═══════════════════════════════════╗\n` +
                `║  ⚠️ LÍMITE DE SUBBOTS ALCANZADO   ║\n` +
                `╚═══════════════════════════════════╝\n\n` +
                `❌ **Has alcanzado el límite máximo**\n\n` +
                `📊 ESTADO ACTUAL\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `📱 Subbots activos: ${userSubbots.length}/3\n` +
                `🔴 Límite alcanzado\n\n` +
                `💡 **SOLUCIÓN**\n` +
                `Los subbots se eliminan automáticamente cuando se desconectan de WhatsApp.\n\n` +
                `✨ Desconecta un subbot para crear uno nuevo\n\n` +
                `🕐 ${new Date().toLocaleString("es-ES")}`,
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
            logger.warn("Persistencia subbot (qr) falló", {
              message: e?.message,
            });
          }

          const dmJid = isGroup ? usuario + "@s.whatsapp.net" : remoteJid;
          const caption = `╔═══════════════════════════════════╗
║  📱 CÓDIGO QR GENERADO            ║
╚═══════════════════════════════════╝

✅ **Escanea este código QR**

📲 INSTRUCCIONES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ Abre WhatsApp en tu celular
2️⃣ Ve a *Dispositivos vinculados*
3️⃣ Toca en *Vincular dispositivo*
4️⃣ Escanea el código QR de arriba

⏱️ Válido por ${res.expiresInSec || 60} segundos

🔄 **AUTO-LIMPIEZA ACTIVADA**
Cuando desconectes este subbot de WhatsApp, se eliminará automáticamente del sistema.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🆔 Etiqueta: ${label}
🕐 ${new Date().toLocaleString("es-ES")}`;

          let sentInDm = true;
          try {
            await sock.sendMessage(dmJid, { image: res.png, caption });
          } catch (e) {
            sentInDm = false;
          }

          if (isGroup) {
            await sock.sendMessage(remoteJid, {
              text: sentInDm
                ? "📩 ✅ Te envié el código QR por privado."
                : "⚠️ No pude enviarte por privado. Enviando el QR en el grupo.",
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
              `╔═══════════════════════════════════╗\n` +
              `║  ❌ ERROR AL CREAR SUBBOT         ║\n` +
              `╚═══════════════════════════════════╝\n\n` +
              `⚠️ **No se pudo generar el código QR**\n\n` +
              `📝 Detalles: ${error.message}\n\n` +
              `💡 **Intenta nuevamente en unos momentos**`,
          });
        }
        break;
      } */

      /* case ".code":
      case "/code": {
        try {
          // Verificar si el comando es .code (sin slash)
          const isDotCommand = messageText?.startsWith(".code") || false;

          await ensureSubbotsTable();
          await refreshSubbotConnectionStatus(usuario);

          // Verificar límite de subbots por usuario (máximo 3)
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
                `╔═══════════════════════════════════╗\n` +
                `║  ⚠️ LÍMITE DE SUBBOTS ALCANZADO   ║\n` +
                `╚═══════════════════════════════════╝\n\n` +
                `❌ **Has alcanzado el límite máximo**\n\n` +
                `📊 ESTADO ACTUAL\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `📱 Subbots activos: ${userSubbots.length}/3\n` +
                `📞 Números: ${existingNumbers}\n` +
                `🔴 Límite alcanzado\n\n` +
                `💡 **SOLUCIÓN**\n` +
                `Los subbots se eliminan automáticamente cuando se desconectan.\n\n` +
                `✨ Desconecta un subbot para crear uno nuevo`,
            });
            break;
          }

          // Obtener el número del remitente
          let phoneNumber = sanitizePhoneNumberInput(usuario);

          // Si no se pudo obtener el número del remitente, mostrar error
          if (!phoneNumber || phoneNumber.length < 10) {
            await sock.sendMessage(remoteJid, {
              text:
                `╔═══════════════════════════════════╗\n` +
                `║  ❌ ERROR AL OBTENER NÚMERO       ║\n` +
                `╚═══════════════════════════════════╝\n\n` +
                `⚠️ **No se pudo detectar tu número automáticamente**\n\n` +
                `📝 Tu número detectado: ${usuario}\n` +
                `❌ El número debe tener al menos 10 dígitos\n\n` +
                `💡 **SOLUCIÓN**\n` +
                `• Verifica que tu número esté registrado correctamente\n` +
                `• Intenta nuevamente en unos momentos\n` +
                `• Contacta al administrador si el problema persiste\n\n` +
                `🕐 ${new Date().toLocaleString("es-ES")}`,
            });
            break;
          }

          // Generar el código de emparejamiento
          const res = await generateSubbotPairingCode(phoneNumber, "KONMI-BOT");

          if (!res || !res.code) {
            throw new Error("No se pudo generar el código de emparejamiento");
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
              "Error al procesar tu solicitud. Por favor, inténtalo de nuevo.",
            );
          }

          // Enviar mensaje al remitente (en privado si es en grupo)
          const dmJid = isGroup ? `${usuario}@s.whatsapp.net` : remoteJid;
          const msg = `╔═══════════════════════════════════╗
║  🔢 CÓDIGO DE VINCULACIÓN         ║
╚═══════════════════════════════════╝

✅ **Subbot creado exitosamente**

📊 INFORMACIÓN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 Número: +${phoneNumber}
🔢 Código: *${res.code}*
⏳ Válido por: ${res.expiresAt || "10 minutos"}

📲 INSTRUCCIONES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ Abre WhatsApp en el dispositivo con número: +${phoneNumber}
2️⃣ Ve a *Dispositivos vinculados*
3️⃣ Toca en *Vincular dispositivo*
4️⃣ Selecciona *Vincular con número de teléfono*
5️⃣ Ingresa este código:

   ╔═══════════════════╗
   ║  *${res.code}*  ║
   ╚═══════════════════╝

⚠️ IMPORTANTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• El código es de un solo uso
• Válido solo para: +${phoneNumber}
• No compartir este código
• Si expira, usa /code de nuevo (sin escribir número)

🔄 **AUTO-LIMPIEZA**
Cuando desconectes el subbot de WhatsApp, se eliminará automáticamente del sistema.

💡 **NOTA:** Solo escribe /code (sin número). El sistema detecta tu número automáticamente.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🕐 ${new Date().toLocaleString("es-ES")}`;

          try {
            await sock.sendMessage(dmJid, { text: msg });
            if (isGroup) {
              await sock.sendMessage(remoteJid, {
                text: "📩 ✅ Te envié el código de vinculación por privado.",
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
              `╔═══════════════════════════════════╗\n` +
              `║  ❌ ERROR AL CREAR SUBBOT         ║\n` +
              `╚═══════════════════════════════════╝\n\n` +
              `⚠️ **No se pudo generar el código de vinculación**\n\n` +
              `📝 Detalles: ${error.message}\n\n` +
              `💡 **Intenta nuevamente en unos momentos**`,
          });
        }
        break;
      } */

      // COMANDOS DE SISTEMA - INFO/RUNTIME/HARDWARE
      case "/status":
      case "/info":
        try {
          const server = await getSystemInfoText();
          const runtime = await getRuntimeInfoText();
          const ownerLine = `\n👑 Owner detectado: ${isSpecificOwner(usuario) ? "Sí" : "No"}`;
          await sock.sendMessage(remoteJid, {
            text: `${server}\n\n${runtime}${ownerLine}`,
          });
        } catch (error) {
          logger.error(
            { err: { message: error?.message, stack: error?.stack } },
            "Error en /status|/info",
          );
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error obteniendo información del sistema.",
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
            text: "⚠️ Error obteniendo información del servidor.",
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
            text: "⚠️ Error obteniendo información de runtime.",
          });
        }
        break;

      // IA y clasificacion - CON FALLBACK
      case "/ia":
      case "/ai":
        try {
          const iaText = messageText.substring(command.length).trim();
          if (!iaText) {
            await sock.sendMessage(remoteJid, {
              text: "ℹ️ Uso: /ia [tu pregunta]\nEjemplo: /ia ¿Qué es JavaScript?",
            });
          } else {
            const res = await handleAI(
              iaText,
              usuario,
              remoteJid,
              new Date().toISOString(),
            );
            if (res?.message) {
              await sock.sendMessage(remoteJid, { text: res.message });
            } else {
              await sock.sendMessage(remoteJid, {
                text: `🤖 *IA — Respuesta:*\n\n❓ Pregunta: "${iaText}"\n\n⚠️ Servicio de IA temporalmente no disponible. Intenta más tarde.`,
              });
            }
          }
        } catch (error) {
          logger.error("Error en /ia:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error en IA. Intenta nuevamente.",
          });
        }
        break;

      case "/clasificar":
        try {
          const textoClasificar = messageText
            .substring("/clasificar".length)
            .trim();
          const res = await handleClasificar(
            textoClasificar,
            usuario,
            remoteJid,
            new Date().toISOString(),
          );
          if (res?.message) {
            await sock.sendMessage(remoteJid, { text: res.message });
          }
        } catch (error) {
          logger.error("Error en /clasificar:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error en el clasificador de contenido.",
          });
        }
        break;

      case "/listclasificados":
        try {
          const res = await handleListClasificados(
            usuario,
            remoteJid,
            new Date().toISOString(),
          );
          if (res?.message) {
            await sock.sendMessage(remoteJid, { text: res.message });
          }
        } catch (error) {
          logger.error("Error en /listclasificados:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error al listar clasificados.",
          });
        }
        break;

      // Aportes - FUNCIONES REALES
      case "/myaportes":
        try {
          const { handleMyAportes } = await import("./handler.js");
          result = await handleMyAportes(usuario, remoteJid);
        } catch (error) {
          logger.error("Error en myaportes:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error obteniendo tus aportes. Intenta más tarde.",
          });
        }
        break;

      case "/aportes":
        try {
          // Llamar con parametros correctos - la funcion espera (usuario, grupo, isGroup)
          const { handleAportes } = await import("./handler.js");
          result = await handleAportes(usuario, remoteJid, isGroup);

          // Si no hay resultado, crear uno basico
          if (!result || !result.message) {
            result = {
              message:
                "🗃️ *Lista de aportes*\n\nℹ️ No hay aportes disponibles en este momento.\n\n➕ Usa `/addaporte [contenido]` para agregar uno.",
            };
          }
        } catch (error) {
          logger.error("Error en aportes:", error);
          // Crear respuesta de fallback
          result = {
            message:
              "🗃️ *Lista de aportes*\n\n⚠️ Error accediendo a la base de datos.\n\n➕ Usa `/addaporte [contenido]` para agregar un aporte.",
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
              text: "ℹ️ Uso: /addaporte [texto opcional] adjuntando un archivo o respondiendo a uno.",
            });
          } else {
            const { handleAddAporte } = await import("./handler.js");
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
            text: "⚠️ Error agregando aporte. Intenta más tarde.",
          });
        }
        break;

      case "/aporteestado":
        if (args.length < 2) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Uso: /aporteestado [id] [estado]\nEjemplo: /aporteestado 1 aprobado",
          });
        } else {
          try {
            const { handleAporteEstado } = await import("./handler.js");
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
                text: "✅ Aporte registrado.",
              });
            }
          } catch (error) {
            logger.error("Error en aporteestado:", error);
            await sock.sendMessage(remoteJid, {
              text: "⚠️ Error cambiando estado. Intenta más tarde.",
            });
          }
        }
        break;

      // Pedidos - FUNCIONES REALES
      case "/pedido":
        const pedidoContent = messageText.substring("/pedido".length).trim();
        if (!pedidoContent) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Uso: /pedido [contenido del pedido]\nEjemplo: /pedido Busco manhwa de romance",
          });
        } else {
          try {
            const { handlePedido } = await import("./handler.js");
            result = await handlePedido(
              pedidoContent,
              usuario,
              remoteJid,
              new Date().toISOString(),
            );
          } catch (error) {
            logger.error("Error en pedido:", error);
            await sock.sendMessage(remoteJid, {
              text: "⚠️ Error registrando pedido. Intenta más tarde.",
            });
          }
        }
        break;

      case "/pedidos":
        try {
          const { handlePedidos } = await import("./handler.js");
          result = await handlePedidos(usuario, remoteJid);
        } catch (error) {
          logger.error("Error en pedidos:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error obteniendo pedidos. Intenta más tarde.",
          });
        }
        break;

      // MANHWAS - IMPLEMENTACION FUNCIONAL
      case "/manhwas":
        try {
          const manhwas = await db("manhwas").select("*").limit(10);
          if (manhwas.length === 0) {
            await sock.sendMessage(remoteJid, {
              text: "📚 *Lista de manhwas*\n\nℹ️ No hay manhwas registrados.\n\n➕ Usa `/addmanhwa` para agregar uno.",
            });
          } else {
            let manhwaList = "📚 *Lista de manhwas*\n\n";
            manhwas.forEach((manhwa, index) => {
              manhwaList += `${index + 1}. **${manhwa.titulo}**\n`;
              manhwaList += `   🏷️ Género: ${manhwa.genero}\n`;
              manhwaList += `   🗓️ Agregado: ${new Date(manhwa.created_at).toLocaleDateString("es-ES")}\n\n`;
            });
            await sock.sendMessage(remoteJid, { text: manhwaList });
          }
        } catch (error) {
          logger.error("Error en manhwas:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error obteniendo manhwas. Intenta más tarde.",
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

          const extra = coverPath ? "\n🖼️ Adjunto guardado" : "";
          await sock.sendMessage(remoteJid, {
            text: `✅ *Manhwa agregado*

📌 Título: ${titulo}
🏷️ Género: ${genero}
📝 Descripción: ${descripcion}${extra}
👤 Por: ${usuario}
🕒 Fecha: ${new Date().toLocaleString("es-ES")}`,
          });
        } catch (error) {
          logger.error("Error agregando manhwa:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error agregando manhwa. Intenta más tarde.",
          });
        }
        break;

      case "/obtenermanhwa":
        if (args.length === 0) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Uso: /obtenermanhwa [nombre]\nEjemplo: /obtenermanhwa Solo Leveling",
          });
        } else {
          try {
            const searchTerm = args.join(" ");
            const manhwa = await db("manhwas")
              .where("titulo", "like", `%${searchTerm}%`)
              .first();

            if (manhwa) {
              await sock.sendMessage(remoteJid, {
                text: `🔎 *Manhwa encontrado*\n\n📌 **${manhwa.titulo}**\n🏷️ Género: ${manhwa.genero}\n📝 Descripción: ${manhwa.descripcion}\n🗓️ Agregado: ${new Date(manhwa.created_at).toLocaleDateString("es-ES")}`,
              });
            } else {
              await sock.sendMessage(remoteJid, {
                text: `⚠️ *Manhwa no encontrado*\n\n🔎 Búsqueda: "${searchTerm}"\n\n📚 Usa \`/manhwas\` para ver la lista completa.`,
              });
            }
          } catch (error) {
            logger.error("Error buscando manhwa:", error);
            await sock.sendMessage(remoteJid, {
              text: "⚠️ Error buscando manhwa. Intenta más tarde.",
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
              text: "📺 *Lista de series*\n\nℹ️ No hay series registradas.\n\n➕ Usa `/addserie` para agregar una.",
            });
          } else {
            let seriesList = "📺 *Lista de series*\n\n";
            series.forEach((serie, index) => {
              seriesList += `${index + 1}. **${serie.titulo}**\n`;
              seriesList += `   🏷️ Género: ${serie.genero}\n`;
              seriesList += `   🗓️ Agregada: ${new Date(serie.created_at).toLocaleDateString("es-ES")}\n\n`;
            });
            await sock.sendMessage(remoteJid, { text: seriesList });
          }
        } catch (error) {
          logger.error("Error en series:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error obteniendo series. Intenta más tarde.",
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

          const extra = coverPath ? "\n🖼️ Adjunto guardado" : "";
          await sock.sendMessage(remoteJid, {
            text: `✅ *Serie agregada*

📌 Título: ${titulo}
🏷️ Género: ${genero}
📝 Descripción: ${descripcion}${extra}
👤 Por: ${usuario}
🕒 Fecha: ${new Date().toLocaleString("es-ES")}`,
          });
        } catch (error) {
          logger.error("Error agregando serie:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error agregando serie. Intenta más tarde.",
          });
        }
        break;

      // Extra e ilustraciones
      case "/extra":
        try {
          const extras = await db("aportes").where("tipo", "extra").limit(10);
          if (extras.length === 0) {
            await sock.sendMessage(remoteJid, {
              text: "ℹ️ No hay contenido extra disponible.",
            });
          } else {
            let extraText = "✨ *Contenido extra:*\n\n";
            extras.forEach((extra, index) => {
              extraText += `${index + 1}. **${extra.contenido}**\n`;
              extraText += `   👤 Por: ${extra.usuario}\n`;
              extraText += `   🗓️ ${new Date(extra.fecha).toLocaleDateString()}\n\n`;
            });
            await sock.sendMessage(remoteJid, { text: extraText });
          }
        } catch (error) {
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error obteniendo contenido extra.",
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
              text: "ℹ️ No hay ilustraciones disponibles.",
            });
          } else {
            let ilustText = "🖼️ *Ilustraciones:*\n\n";
            ilustraciones.forEach((ilustr, index) => {
              ilustText += `${index + 1}. **${ilustr.contenido}**\n`;
              ilustText += `   👤 Por: ${ilustr.usuario}\n`;
              ilustText += `   🗓️ ${new Date(ilustr.fecha).toLocaleDateString()}\n\n`;
            });
            await sock.sendMessage(remoteJid, { text: ilustText });
          }
        } catch (error) {
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error obteniendo ilustraciones.",
          });
        }
        break;

      case "/obtenerextra":
        if (args.length === 0) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Uso: /obtenerextra [nombre]\nEjemplo: /obtenerextra wallpaper",
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
                text: `🔎 No se encontró contenido extra con: "${searchTerm}"`,
              });
            } else {
              let resultText = `✨ *Resultados para "${searchTerm}":*\n\n`;
              extras.forEach((extra, index) => {
                resultText += `${index + 1}. **${extra.contenido}**\n`;
                resultText += `   👤 Por: ${extra.usuario}\n`;
                resultText += `   🗓️ ${new Date(extra.fecha).toLocaleDateString()}\n\n`;
              });
              await sock.sendMessage(remoteJid, { text: resultText });
            }
          } catch (error) {
            await sock.sendMessage(remoteJid, {
              text: "⚠️ Error buscando contenido extra.",
            });
          }
        }
        break;

      case "/obtenerilustracion":
        if (args.length === 0) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Uso: /obtenerilustracion [nombre]\nEjemplo: /obtenerilustracion anime",
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
                text: `🔎 No se encontraron ilustraciones con: "${searchTerm}"`,
              });
            } else {
              let resultText = `🖼️ *Ilustraciones para "${searchTerm}":*\n\n`;
              ilustraciones.forEach((ilustr, index) => {
                resultText += `${index + 1}. **${ilustr.contenido}**\n`;
                resultText += `   👤 Por: ${ilustr.usuario}\n`;
                resultText += `   🗓️ ${new Date(ilustr.fecha).toLocaleDateString()}\n\n`;
              });
              await sock.sendMessage(remoteJid, { text: resultText });
            }
          } catch (error) {
            await sock.sendMessage(remoteJid, {
              text: "⚠️ Error buscando ilustraciones.",
            });
          }
        }
        break;

      case "/obtenerpack":
        if (args.length === 0) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Uso: /obtenerpack [nombre]\nEjemplo: /obtenerpack stickers",
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
                text: `🔎 No se encontraron packs con: "${searchTerm}"`,
              });
            } else {
              let resultText = `🧩 *Packs para "${searchTerm}":*\n\n`;
              packs.forEach((pack, index) => {
                resultText += `${index + 1}. **${pack.contenido}**\n`;
                resultText += `   👤 Por: ${pack.usuario}\n`;
                resultText += `   🗓️ ${new Date(pack.fecha).toLocaleDateString()}\n\n`;
              });
              await sock.sendMessage(remoteJid, { text: resultText });
            }
          } catch (error) {
            await sock.sendMessage(remoteJid, {
              text: "⚠️ Error buscando packs.",
            });
          }
        }
        break;

      // Administracion de grupos
      case "/addgroup":
        if (!isSuperAdmin(usuario)) {
          await sock.sendMessage(remoteJid, {
            text: "⛔ Solo los superadmins pueden agregar grupos.",
          });
        } else if (args.length === 0) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Uso: /addgroup [nombre del grupo]\nEjemplo: /addgroup Mi Grupo Nuevo",
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
              text: `✅ **Grupo agregado**\n\n📌 **Nombre:** ${groupName}\n🆔 **ID:** ${remoteJid}\n👤 **Agregado por:** ${usuario}\n🗓️ **Fecha:** ${new Date().toLocaleDateString()}\n\n🤖 El bot ahora está activo en este grupo.`,
            });
          } catch (error) {
            logger.error("Error agregando grupo:", error);
            await sock.sendMessage(remoteJid, {
              text: "⚠️ Error agregando el grupo. Puede que ya esté registrado.",
            });
          }
        }
        break;

      case "/delgroup":
        if (!isSuperAdmin(usuario)) {
          await sock.sendMessage(remoteJid, {
            text: "⛔ Solo los superadmins pueden eliminar grupos.",
          });
        } else {
          try {
            const deleted = await db("grupos_autorizados")
              .where("jid", remoteJid)
              .del();
            if (deleted > 0) {
              await sock.sendMessage(remoteJid, {
                text: `🗑️ **Grupo eliminado**\n\n🆔 **ID:** ${remoteJid}\n👤 **Eliminado por:** ${usuario}\n🗓️ **Fecha:** ${new Date().toLocaleDateString()}\n\n🤖 El bot ya no estará activo en este grupo.`,
              });
            } else {
              await sock.sendMessage(remoteJid, {
                text: "ℹ️ Este grupo no estaba registrado en la base de datos.",
              });
            }
          } catch (error) {
            logger.error("Error eliminando grupo:", error);
            await sock.sendMessage(remoteJid, {
              text: "⚠️ Error eliminando el grupo.",
            });
          }
        }
        break;

      // Comando /kick movido a la seccion de administracion mas abajo

      // Comandos /promote y /demote movidos a la seccion de administracion mas abajo

      case "/tag":
        const { handleTag } = await import("./handler.js");
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
                text: "✅ *Bot activado globalmente*\n\n🤖 El bot está nuevamente operativo para todos los usuarios.",
              });
              logger.info("✅ Bot activado globalmente por owner");

              logger.pretty.banner("Bot activado globalmente", "✅");
              logger.pretty.kv("Por", `${usuario} (Owner)`);
              logger.pretty.kv("Fecha", new Date().toLocaleString("es-ES"));
              logger.pretty.line("🧹 Notificaciones limpiadas");
            } catch (error) {
              await sock.sendMessage(remoteJid, {
                text: "⚠️ Error activando el bot globalmente: " + error.message,
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
                text: "⛔ *Bot desactivado globalmente*\n\n⏳ El bot no responderá a ningún comando excepto `/bot global on` del owner.\n\n👑 Solo tú puedes reactivarlo.",
              });
              logger.info("⛔ Bot desactivado globalmente por owner");

              logger.pretty.banner("Bot desactivado globalmente", "⛔");
              logger.pretty.kv("Por", `${usuario} (Owner)`);
              logger.pretty.kv("Fecha", new Date().toLocaleString("es-ES"));
              logger.pretty.line("🛑 Sistema preparado para modo desactivado");
            } catch (error) {
              await sock.sendMessage(remoteJid, {
                text:
                  "⚠️ Error desactivando el bot globalmente: " + error.message,
              });
              logger.error("Error desactivando bot:", error);
            }
          } else {
            await sock.sendMessage(remoteJid, {
              text: "Uso: /bot global on | /bot global off",
            });
          }
        } else if (args[0] === "global") {
          await sock.sendMessage(remoteJid, {
            text: "⛔ Solo el owner puede usar comandos globales",
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
                      text: "⛔ Solo owner o administradores del grupo pueden usar /bot on.",
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

                  logger.pretty.line(`🗂️ Grupo ${remoteJid} activado en BD`);
                } catch (dbError) {
                  logger.error("Error BD bot on:", dbError);
                }

                await sock.sendMessage(remoteJid, {
                  text: "✅ *Bot activado en este grupo*\n\n🤖 El bot ahora responderá a comandos en este grupo.",
                });

                logger.pretty.banner("Bot activado en grupo", "✅");
                logger.pretty.kv("Grupo", await getGroupName(remoteJid));
                logger.pretty.kv("ID", remoteJid);
                logger.pretty.kv("Por", usuario);
                logger.pretty.kv("Fecha", new Date().toLocaleString("es-ES"));
              } else {
                await sock.sendMessage(remoteJid, {
                  text: "ℹ️ Este comando solo funciona en grupos",
                });
              }
            } catch (error) {
              logger.error("Error en bot on:", error);
              await sock.sendMessage(remoteJid, {
                text: "⚠️ Error activando el bot en grupo: " + error.message,
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
                      text: "⛔ Solo owner o administradores del grupo pueden usar /bot off.",
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

                  logger.pretty.line(`🗂️ Grupo ${remoteJid} desactivado en BD`);
                } catch (dbError) {
                  logger.error("Error BD bot off:", dbError);
                  logger.pretty.line("⚠️ Error BD pero continuando...");
                }

                await sock.sendMessage(remoteJid, {
                  text: "⛔ *Bot desactivado en este grupo*\n\n⏳ El bot no responderá a comandos en este grupo.\n✅ Usa `/bot on` para reactivarlo.",
                });

                logger.pretty.banner("Bot desactivado en grupo", "⛔");
                logger.pretty.kv("Grupo", await getGroupName(remoteJid));
                logger.pretty.kv("ID", remoteJid);
                logger.pretty.kv("Por", usuario);
                logger.pretty.kv("Fecha", new Date().toLocaleString("es-ES"));
              } else {
                await sock.sendMessage(remoteJid, {
                  text: "ℹ️ Este comando solo funciona en grupos",
                });
              }
            } catch (error) {
              logger.error("Error en bot off:", error);
              await sock.sendMessage(remoteJid, {
                text: "⚠️ Error desactivando el bot en grupo: " + error.message,
              });
            }
          } else {
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
            `📱 *Mi información de número*\n\n` +
            `🔢 Número completo: ${usuario}\n` +
            `🌍 Código país: +${splitInfo.cc}${splitInfo.iso ? ` (${splitInfo.iso})` : ""}\n` +
            `🏷️ Número local: ${splitInfo.local || "-"}\n\n` +
            `👑 Owner/Superadmin: ${youAreOwner ? "Sí" : "No"}\n` +
            `📋 En owners: ${inOwners ? "Sí" : "No"}\n` +
            `🤖 Igual al bot: ${sameAsBot ? "Sí" : "No"}`;

          await sock.sendMessage(remoteJid, {
            text: txt,
            mentions: [usuario + "@s.whatsapp.net"],
          });
        } catch (err) {
          logger.error("Error en /mynumber:", err);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error obteniendo tu información de número.",
          });
        }
        break;

      // COMANDO DE DEBUG PARA ADMINISTRADORES
      case "/debugfull":
        // Debug completo del sistema de deteccion
        const botNumber = getBotNumber(sock);
        await sock.sendMessage(remoteJid, {
          text:
            `🧪 *Debug completo del sistema (corregido)*\n\n` +
            `👤 **Extracción de usuario (API WhatsApp):**\n` +
            ` isGroup: ${isGroup}\n` +
            ` message.key.participant: ${message.key.participant || "undefined"}\n` +
            ` message.key.remoteJid: ${message.key.remoteJid}\n` +
            ` sender calculado: ${sender}\n` +
            ` usuario extraido: ${usuario}\n` +
            ` usuario limpio: ${usuario.replace(/[^\d]/g, "")}\n\n` +
            `🤖 **Bot info (API WhatsApp):**\n` +
            ` sock.user.id: ${sock.user.id}\n` +
            ` getBotJid(): ${getBotJid(sock)}\n` +
            ` getBotNumber(): ${botNumber}\n` +
            ` Usuario = Bot?: ${usuario === botNumber ? " Si" : " NO"}\n\n` +
            `🛡️ **Verificaciones owner:**\n` +
            ` isSpecificOwner(${usuario}): ${isSpecificOwner(usuario)}\n` +
            ` isSuperAdmin(${usuario}): ${isSuperAdmin(usuario)}\n` +
            ` isOwner variable: ${isOwner}\n\n` +
            `📋 **Lista global.owner:**\n` +
            `${global.owner.map(([num, name]) => ` ${num} (${name})`).join("\n")}\n\n` +
            `🧮 **Comparaciones:**\n` +
            ` Usuario vs 595974154768: ${usuario === "595974154768" ? " MATCH" : " NO MATCH"}\n` +
            ` En lista owners: ${global.owner.some(([num]) => normalizeJidToNumber(num) === usuario) ? " Si" : " NO"}\n\n` +
            `📅 ${new Date().toLocaleString("es-ES")}`,
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
              text: `✅ *Owner agregado*\n\n📞 **Número:** ${usuario}\n🟢 **Estado:** Agregado como owner\n\n📋 **Lista actual de owners:**\n${global.owner.map(([num, name]) => ` ${num} (${name})`).join("\n")}\n\n👤 Solicitado por: @${usuario}\n🕒 ${new Date().toLocaleString("es-ES")}`,
              mentions: [usuario + "@s.whatsapp.net"],
            });
          } else {
            await sock.sendMessage(remoteJid, {
              text: `ℹ️ *Ya eres owner*\n\n📞 **Número:** ${usuario}\n🟢 **Estado:** Ya estás en la lista de owners\n\n👤 Solicitado por: @${usuario}\n🕒 ${new Date().toLocaleString("es-ES")}`,
              mentions: [usuario + "@s.whatsapp.net"],
            });
          }
        } else {
          await sock.sendMessage(remoteJid, {
            text: `⛔ *Sin autorización*\n\n📞 **Tu número:** ${usuario}\n🔒 **Requerido:** 595974154768\n\n👑 Solo el owner principal puede usar este comando\n\n👤 Solicitado por: @${usuario}\n🕒 ${new Date().toLocaleString("es-ES")}`,
            mentions: [usuario + "@s.whatsapp.net"],
          });
        }
        break;

      case "/debugadmin":
      case "/checkadmin":
        if (!isGroup) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Este comando solo funciona en grupos",
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

            let debugText = `🛡️ *Debug administradores (corregido)*\n\n`;
            debugText += `👥 **Grupo:** ${groupMetadata.subject}\n`;
            debugText += `📌 **Participantes:** ${groupMetadata.participants.length}\n\n`;

            debugText += `🤖 **Bot:**\n`;
            debugText += `• ID original: ${sock.user.id}\n`;
            debugText += `• JID corregido: ${botJid}\n`;
            debugText += `• Número base: ${botBaseNum}\n`;
            const botDisplayFound = !!botParticipant || botFoundByNumber;
            debugText += `• Encontrado: ${botDisplayFound ? "Sí" : "No"}\n`;
            debugText += `• Admin: ${isBotAdmin ? "Sí" : "No"}\n`;
            const botRole =
              botParticipant?.admin || (isBotAdmin ? "admin" : "member");
            debugText += `• Rango: ${botRole}\n\n`;

            debugText += `👤 **Usuario:**\n`;
            debugText += `• Número: ${usuario}\n`;
            debugText += `• JID: ${userJid}\n`;
            debugText += `• Encontrado: ${userParticipant ? "Sí" : "No"}\n`;
            debugText += `• Admin: ${isUserAdmin ? "Sí" : "No"}\n`;
            debugText += `• Rango: ${userParticipant?.admin || "member"}\n\n`;

            debugText += `📋 **Administradores del grupo:**\n`;
            const admins = groupMetadata.participants.filter((p) => p.admin);
            if (admins.length > 0) {
              admins.forEach((admin, index) => {
                const adminNumber = normalizeJidToNumber(admin.id);
                const isBot = adminNumber === normalizeJidToNumber(botJid);
                const isCurrentUser = adminNumber === usuario;
                debugText += `${index + 1}. ${adminNumber} (${admin.admin})${isBot ? " 🤖 BOT" : ""}${isCurrentUser ? " 🫵 Tú" : ""}\n`;
              });
            } else {
              debugText += `⚠️ No se encontraron administradores\n`;
            }

            debugText += `\n🔎 **Debug info detallado:**\n`;
            debugText += `• Usuario actual: ${usuario}\n`;
            debugText += `• JID buscado: ${userJid}\n`;
            debugText += `• Bot número: ${botJid.split("@")[0]}\n`;
            debugText += `• CONFLICTO: ${usuario === botJid.split("@")[0] ? "USUARIO = BOT!" : "Usuario ≠ Bot"}\n`;
            debugText += `• Participante encontrado: ${userParticipant ? "Sí" : "No"}\n`;
            debugText += `• En lista owners: ${global.owner.some(([num]) => normalizeJidToNumber(num) === usuario) ? "Sí" : "No"}\n`;
            debugText += `• isSuperAdmin: ${isSuperAdmin(usuario) ? "Sí" : "No"}\n\n`;

            debugText += `📜 **Todos los administradores:**\n`;
            const allAdmins = groupMetadata.participants.filter((p) => p.admin);
            allAdmins.forEach((admin, index) => {
              const adminNumber = admin.id.split("@")[0];
              const isBot = adminNumber === botJid.split("@")[0];
              const isCurrentUser = adminNumber === usuario;
              debugText += `${index + 1}. ${adminNumber} (${admin.admin})`;
              if (isBot) debugText += " 🤖 BOT";
              if (isCurrentUser) debugText += " 🫵 Tú";
              debugText += `\n`;
            });

            debugText += `\n🧭 **Búsquedas específicas:**\n`;
            const foundByNumber = groupMetadata.participants.find(
              (p) => normalizeJidToNumber(p.id) === usuario,
            );
            debugText += `• Usuario ${usuario}: ${foundByNumber ? `Encontrado (${foundByNumber.admin || "member"})` : "No encontrado"}\n`;

            const botByNumber = groupMetadata.participants.find(
              (p) =>
                normalizeJidToNumber(p.id) === normalizeJidToNumber(botJid),
            );
            debugText += `• Bot ${botJid.split("@")[0]}: ${botByNumber ? `Encontrado (${botByNumber.admin || "member"})` : "No encontrado"}\n`;

            if (usuario === botJid.split("@")[0]) {
              debugText += `\n🚨 **Problema crítico:**\n`;
              debugText += `• El usuario y el bot tienen el mismo número\n`;
              debugText += `• Esto causa conflictos en la detección de permisos\n`;
              debugText += `• El bot no puede ser administrador de sí mismo\n`;
            }

            // Muestra de participantes con ID crudo, nmero normalizado y rol
            debugText += `\n🧪 **Muestra de participantes (raw => normalizado):**\n`;
            const botNumSession = getBotNumber(sock);
            groupMetadata.participants.slice(0, 30).forEach((p, idx) => {
              const raw = p.id;
              const num = normalizeJidToNumber(p.id);
              const role = p.admin || "member";
              const flags = [];
              if (num === usuario) flags.push("Tu");
              if (botNumSession && num === botNumSession) flags.push("BOT");
              debugText += `${idx + 1}. ${raw} => ${num} (${role})${flags.length ? " · " + flags.join(" & ") : ""}\n`;
            });

            debugText += `\n👤 Solicitado por: @${usuario}\n`;
            debugText += `🕒 ${new Date().toLocaleString("es-ES")}`;

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

      case "/debugme":
        // Comando para ver exactamente qué número se está extrayendo
        try {
          const botNum = getBotNumber(sock);
          const botJid = getBotJid(sock);
          const fromMe = message.key.fromMe;
          const participant = message.key.participant;
          
          let debugText = `🔍 *Debug extracción de usuario*\n\n`;
          debugText += `📱 **Información del mensaje:**\n`;
          debugText += `• fromMe: ${fromMe ? "✅ SÍ (mismo WhatsApp del bot)" : "❌ NO"}\n`;
          debugText += `• remoteJid: ${remoteJid}\n`;
          debugText += `• participant: ${participant || "N/A"}\n`;
          debugText += `• isGroup: ${isGroup ? "✅ SÍ" : "❌ NO"}\n\n`;
          
          debugText += `🤖 **Información del bot:**\n`;
          debugText += `• sock.user.id: ${sock.user.id}\n`;
          debugText += `• getBotJid(): ${botJid}\n`;
          debugText += `• getBotNumber(): ${botNum}\n\n`;
          
          debugText += `👤 **Usuario extraído:**\n`;
          debugText += `• usuario: ${usuario}\n`;
          debugText += `• sender: ${sender}\n\n`;
          
          debugText += `🔐 **Verificaciones:**\n`;
          debugText += `• isSpecificOwner(${usuario}): ${isSpecificOwner(usuario) ? "✅ SÍ" : "❌ NO"}\n`;
          debugText += `• isSuperAdmin(${usuario}): ${isSuperAdmin(usuario) ? "✅ SÍ" : "❌ NO"}\n`;
          
          if (isGroup) {
            const isRealAdmin = await isRealGroupAdmin(usuario, remoteJid);
            const hasAdminPerms = await isOwnerOrAdmin(usuario, remoteJid);
            debugText += `• Admin REAL del grupo: ${isRealAdmin ? "✅ SÍ" : "❌ NO"}\n`;
            debugText += `• isOwnerOrAdmin (permisos efectivos): ${hasAdminPerms ? "✅ SÍ" : "❌ NO"}\n`;
          }
          
          debugText += `\n🕒 ${new Date().toLocaleString("es-ES")}`;
          
          await sock.sendMessage(remoteJid, {
            text: debugText,
            mentions: [usuario + "@s.whatsapp.net"],
          });
        } catch (error) {
          logger.error("Error en /debugme:", error);
          await sock.sendMessage(remoteJid, {
            text: `⚠️ Error en debug: ${error.message}`,
          });
        }
        break;

      case "/testadmin":
        // Comando simple para verificar si el usuario tiene permisos de admin
        if (!isGroup) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Este comando solo funciona en grupos",
          });
        } else {
          try {
            const isRealAdmin = await isRealGroupAdmin(usuario, remoteJid);
            const hasAdminPerms = await isOwnerOrAdmin(usuario, remoteJid);
            const isOwnerCheck = isSpecificOwner(usuario);
            const isSuperCheck = isSuperAdmin(usuario);
            
            let resultText = `🧪 *Test de permisos de administrador*\n\n`;
            resultText += `👤 **Usuario:** ${usuario}\n`;
            resultText += `📱 **JID:** ${usuario}@s.whatsapp.net\n\n`;
            
            resultText += `🏆 **Estado en el grupo:**\n`;
            resultText += `• Admin REAL del grupo: ${isRealAdmin ? "✅ SÍ" : "❌ NO"}\n\n`;
            
            resultText += `🔐 **Verificaciones de permisos:**\n`;
            resultText += `• isSpecificOwner: ${isOwnerCheck ? "✅ SÍ" : "❌ NO"}\n`;
            resultText += `• isSuperAdmin: ${isSuperCheck ? "✅ SÍ" : "❌ NO"}\n`;
            resultText += `• isOwnerOrAdmin: ${hasAdminPerms ? "✅ SÍ" : "❌ NO"}\n\n`;
            
            resultText += `📊 **Permisos efectivos:**\n`;
            if (hasAdminPerms) {
              if (isRealAdmin) {
                resultText += `✅ Tienes permisos porque ERES admin del grupo\n`;
              } else if (isOwnerCheck || isSuperCheck) {
                resultText += `✅ Tienes permisos porque eres OWNER/SUPERADMIN\n`;
                resultText += `⚠️  Pero NO eres admin real del grupo de WhatsApp\n`;
              }
              resultText += `\n🎯 Puedes usar: /kick, /promote, /demote\n`;
              resultText += `⚠️  Para /lock y /unlock, el BOT debe ser admin del grupo\n`;
            } else {
              resultText += `❌ NO tienes permisos de administrador\n`;
              resultText += `⚠️  No puedes usar comandos de moderación\n`;
            }
            
            resultText += `\n👤 Solicitado por: @${usuario}\n`;
            resultText += `🕒 ${new Date().toLocaleString("es-ES")}`;
            
            await sock.sendMessage(remoteJid, {
              text: resultText,
              mentions: [usuario + "@s.whatsapp.net"],
            });
          } catch (error) {
            logger.error("Error en /testadmin:", error);
            await sock.sendMessage(remoteJid, {
              text: `⚠️ Error verificando permisos: ${error.message}`,
            });
          }
        }
        break;

      // COMANDOS DE ADMINISTRACION - FUNCIONALIDAD REAL
      case "/kick":
        if (!isGroup) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Este comando solo funciona en grupos",
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
              text: `👢 *Expulsar usuario*\n\nℹ️ **Uso:**\n \`/kick @usuario\` — Mencionar usuario\n \`/kick [número]\` — Usar número directo\n Responder a un mensaje con \`/kick\`\n\n📌 **Ejemplos:**\n \`/kick @usuario\`\n \`/kick 5491234567890\`\n Responder mensaje + \`/kick\`\n\n👤 Solicitado por: @${usuario}\n🕒 ${new Date().toLocaleString("es-ES")}`,
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
            text: "⚠️ Error procesando expulsión.",
          });
        }
        break;

      case "/promote":
        if (!isGroup) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Este comando solo funciona en grupos",
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
              text: "ℹ️ Uso: /promote @usuario | responder mensaje | /promote [número]",
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
            text: "⚠️ Error procesando promoción.",
          });
        }
        break;

      case "/demote":
        if (!isGroup) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Este comando solo funciona en grupos",
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
              text: "ℹ️ Uso: /demote @usuario | responder mensaje | /demote [número]",
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
            text: "⚠️ Error procesando degradación.",
          });
        }
        break;

      case "/lock":
        if (!isGroup) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Este comando solo funciona en grupos",
          });
          break;
        }
        try {
          const resLock = await handleLock(usuario, remoteJid, isGroup);
          if (resLock?.message) {
            await sock.sendMessage(remoteJid, { text: resLock.message });
          } else if (resLock?.success === false && resLock?.message) {
            await sock.sendMessage(remoteJid, { text: resLock.message });
          }
        } catch (error) {
          logger.error("Error en lock:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error bloqueando el grupo.",
          });
        }
        break;

      case "/unlock":
        if (!isGroup) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Este comando solo funciona en grupos",
          });
          break;
        }
        try {
          const resUnlock = await handleUnlock(usuario, remoteJid, isGroup);
          if (resUnlock?.message) {
            await sock.sendMessage(remoteJid, { text: resUnlock.message });
          } else if (resUnlock?.success === false && resUnlock?.message) {
            await sock.sendMessage(remoteJid, { text: resUnlock.message });
          }
        } catch (error) {
          logger.error("Error en unlock:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error desbloqueando el grupo.",
          });
        }
        break;

      case "/tag":
        if (!isGroup) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Este comando solo funciona en grupos",
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
                text: "⛔ Solo administradores pueden etiquetar a todos",
              });
              break;
            }

            const tagMessage =
              messageText.substring("/tag".length).trim() ||
              "📣 Atención todos";

            // Obtener todos los participantes del grupo
            const participants = groupMetadata.participants.map((p) => p.id);

            await sock.sendMessage(remoteJid, {
              text: `📣 *Mensaje para todos*\n\n${tagMessage}\n\n👤 Por: ${usuario}\n🕒 ${new Date().toLocaleString("es-ES")}`,
              mentions: participants,
            });
          } catch (error) {
            logger.error("Error en tag:", error);
            await sock.sendMessage(remoteJid, {
              text: "⚠️ Error etiquetando usuarios",
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
            text: "ℹ️ Uso: /crearvotacion [pregunta]\nEjemplo: /crearvotacion ¿Cuál es tu manhwa favorito?",
          });
        } else {
          await sock.sendMessage(remoteJid, {
            text: `🗳️ *Nueva votación creada*\n\n❓ Pregunta: ${votacionData}\n👤 Creada por: ${usuario}\n🕒 Fecha: ${new Date().toLocaleString("es-ES")}\n\n✅ Usa /votar [opción] para participar`,
          });
        }
        break;

      case "/votar":
        const voto = args.join(" ");
        if (!voto) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Uso: /votar [tu opción]\nEjemplo: /votar Solo Leveling",
          });
        } else {
          await sock.sendMessage(remoteJid, {
            text: `🗳️ *Voto registrado*\n\n📝 Tu voto: ${voto}\n👤 Usuario: ${usuario}\n🕒 Fecha: ${new Date().toLocaleString("es-ES")}`,
          });
        }
        break;

      case "/cerrarvotacion":
        await sock.sendMessage(remoteJid, {
          text: `🗳️ *Votación cerrada*\n\n🔒 Resultados finalizados\n👤 Cerrada por: ${usuario}\n🕒 Fecha: ${new Date().toLocaleString("es-ES")}`,
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
            text: "⚠️ Error al cargar registros. Intenta de nuevo.",
          });
        }
        break;

      case "/config":
        try {
          const parametro = args[0];
          const valor = args.slice(1).join(" ");
          const res = await handleConfig(
            parametro,
            valor,
            usuario,
            remoteJid,
            new Date().toISOString(),
          );
          if (res?.message) {
            await sock.sendMessage(remoteJid, { text: res.message });
          }
        } catch (error) {
          logger.error("Error en /config:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error al procesar configuración.",
          });
        }
        break;

      case "/registrar":
        try {
          const username = args[0];
          const res = await handleRegistrarUsuario(
            username,
            usuario,
            remoteJid,
            new Date().toISOString(),
          );
          if (res?.message) {
            await sock.sendMessage(remoteJid, { text: res.message });
          }
        } catch (error) {
          logger.error("Error en /registrar:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error al registrar usuario.",
          });
        }
        break;

      case "/resetpass":
        try {
          const username = args[0];
          const res = await handleResetPassword(
            username,
            usuario,
            remoteJid,
            new Date().toISOString(),
          );
          if (res?.message) {
            await sock.sendMessage(remoteJid, { text: res.message });
          }
        } catch (error) {
          logger.error("Error en /resetpass:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error al resetear contraseña.",
          });
        }
        break;

      case "/miinfo":
        try {
          const res = await handleMiInfo(
            usuario,
            remoteJid,
            new Date().toISOString(),
          );
          if (res?.message) {
            await sock.sendMessage(remoteJid, { text: res.message });
          }
        } catch (error) {
          logger.error("Error en /miinfo:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error al obtener información.",
          });
        }
        break;

      case "/cleansession":
        try {
          const res = await handleCleanSession(
            usuario,
            remoteJid,
            new Date().toISOString(),
          );
          if (res?.message) {
            await sock.sendMessage(remoteJid, { text: res.message });
          }
        } catch (error) {
          logger.error("Error en /cleansession:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error al limpiar sesión.",
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
              ? `\n🔄 Subbots recargados: ${info.restarted}/${info.total}`
              : "";
            await sock.sendMessage(remoteJid, {
              text: `⬆️ *Actualizando bot*\n\n🤖 KONMI BOT v2.5.0\n🔎 Verificando actualizaciones...${extra}\n\n✅ Bot actualizado correctamente\n🕒 ${new Date().toLocaleString("es-ES")}`,
            });
          } catch (e) {
            await sock.sendMessage(remoteJid, {
              text: `⬆️ *Actualizando bot*\n\n🤖 KONMI BOT v2.5.0\n🔎 Verificando actualizaciones...\n\n✅ Bot actualizado correctamente\n🕒 ${new Date().toLocaleString("es-ES")}`,
            });
          }
        } else {
          await sock.sendMessage(remoteJid, {
            text: "⛔ Solo el owner puede actualizar el bot",
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
            text: "⚠️ Error obteniendo estadísticas del sistema",
          });
        }
        break;

      // Duplicado legacy: usar handler centralizado de /code (arriba)
      case "/code_legacy":
        if (!isOwner) {
          await sock.sendMessage(remoteJid, {
            text: "⛔ Solo el owner puede generar pairing codes de subbots",
          });
          break;
        }

        const phoneNumber = args.join(" ").replace(/[^\d]/g, "");
        if (!phoneNumber || phoneNumber.length < 10) {
          await sock.sendMessage(remoteJid, {
            text:
              "🔐 *Generar Pairing Code de SubBot*\n\n" +
              "ℹ️ **Uso:** `/code [número]`\n\n" +
              "📌 **Ejemplos:**\n" +
              " `/code 5491234567890`\n" +
              " `/code +54 9 11 2345-6789`\n" +
              " `/code 11 2345 6789`\n\n" +
              "📝 **Nota:** El número debe tener al menos 10 dígitos",
          });
          break;
        }

        try {
          await sock.sendMessage(remoteJid, {
            text:
              "🤖 *Generando SubBot con Pairing Code*\n\n" +
              `📞 **Número:** ${phoneNumber}\n` +
              "⚙️ Creando nuevo subbot...\n" +
              "⏳ Generando código de vinculación...\n\n" +
              "✅ El código aparecerá en unos segundos",
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
                    `🔐 *Código de emparejamiento generado*\n\n` +
                    `🧩 **Código SubBot:** ${event.subbot.code}\n` +
                    `📞 **Número:** ${event.data.targetNumber}\n` +
                    `🔢 **Pairing Code:** \`${event.data.code}\`\n` +
                    `🪪 **Aparecerá como:** ${event.data.displayCode}\n` +
                    `⏳ **Válido por:** 10 minutos\n\n` +
                    `📋 **Instrucciones:**\n` +
                    `1. Abre WhatsApp en ${event.data.targetNumber}\n` +
                    `2. Ve a Configuración > Dispositivos vinculados\n` +
                    `3. Toca "Vincular con código de teléfono"\n` +
                    `4. Ingresa: **${event.data.code}**\n` +
                    `5. Verás "${event.data.displayCode}"\n\n` +
                    `👤 Solicitado por: @${usuario}\n` +
                    `🕒 ${new Date().toLocaleString("es-ES")}`,
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
                  `🤖 *SubBot conectado exitosamente*\n\n` +
                  `🧩 **Código:** ${event.subbot.code}\n` +
                  `📞 **Número:** ${phoneNumber}\n` +
                  `✅ **Estado:** Conectado\n` +
                  `🚀 ¡Listo para usar!\n\n` +
                  `📋 Usa \`/bots\` para ver todos los subbots activos`,
              });
            }
          };

          const handleError = async (event) => {
            await sock.sendMessage(remoteJid, {
              text:
                `⚠️ *Error en SubBot*\n\n` +
                `🧩 **Código:** ${event.subbot.code}\n` +
                `📞 **Número:** ${phoneNumber}\n` +
                `🧯 **Error:** ${event.data.message}\n\n` +
                `🔁 Intenta nuevamente con \`/code ${phoneNumber}\``,
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
              text: `⚠️ *Error creando SubBot*\n\n${result.error}\n\n🔁 Intenta nuevamente`,
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
          const { handleWhoami } = await import("./handler.js");
          result = await handleWhoami(usuario, remoteJid);
          if (!result || !result.message) {
            // Implementacin simple de whoami
            const userInfo =
              `👤 *Información del usuario*\n\n` +
              `📞 Número: ${usuario}\n` +
              `🆔 ID: ${usuario}@s.whatsapp.net\n` +
              `👑 Owner: ${isOwner ? "Sí" : "No"}\n` +
              `🗂️ Contexto: ${isGroup ? "Grupo" : "Privado"}\n\n` +
              `👤 Solicitado por: @${usuario}\n` +
              `🕒 Fecha: ${new Date().toLocaleString("es-ES")}`;

            await sock.sendMessage(remoteJid, {
              text: userInfo,
              mentions: [usuario + "@s.whatsapp.net"],
            });
          }
        } catch (error) {
          logger.error("Error en whoami:", error);
          const userInfo =
            `👤 *Información del usuario*\n\n` +
            `📞 Número: ${usuario}\n` +
            `🆔 ID: ${usuario}@s.whatsapp.net\n` +
            `👑 Owner: ${isOwner ? "Sí" : "No"}\n` +
            `🗂️ Contexto: ${isGroup ? "Grupo" : "Privado"}\n\n` +
            `👤 Solicitado por: @${usuario}\n` +
            `🕒 Fecha: ${new Date().toLocaleString("es-ES")}`;

          await sock.sendMessage(remoteJid, {
            text: userInfo,
            mentions: [usuario + "@s.whatsapp.net"],
          });
        }
        break;

      case "/debugadmin":
        try {
          const { handleDebugAdmin } = await import("./handler.js");
          result = await handleDebugAdmin(usuario, remoteJid);
          if (!result || !result.message) {
            const debugInfo =
              `🛡️ *Debug admin*\n\n` +
              `👤 Usuario: ${usuario}\n` +
              `👑 Es Owner: ${isOwner ? "Sí" : "NO"}\n` +
              `🗂️ Contexto: ${isGroup ? "Grupo" : "Privado"}\n` +
              `💬 Chat ID: ${remoteJid}\n` +
              `⏱️ Timestamp: ${new Date().toISOString()}\n` +
              `🤖 Bot Status: Funcionando\n` +
              `🌐 Conexión: ${connectionStatus}`;

            await sock.sendMessage(remoteJid, { text: debugInfo });
          }
        } catch (error) {
          logger.error("Error en debugadmin:", error);
          const debugInfo =
            `🛡️ *Debug admin*\n\n` +
            `👤 Usuario: ${usuario}\n` +
            `👑 Es Owner: ${isOwner ? "Sí" : "NO"}\n` +
            `🗂️ Contexto: ${isGroup ? "Grupo" : "Privado"}\n` +
            `💬 Chat ID: ${remoteJid}\n` +
            `⏱️ Timestamp: ${new Date().toISOString()}\n` +
            `🤖 Bot Status: Funcionando\n` +
            `🌐 Conexión: ${connectionStatus}`;

          await sock.sendMessage(remoteJid, { text: debugInfo });
        }
        break;

      // COMANDOS MULTIMEDIA CON FALLBACK AUTOMÁTICO
      case "/music":
      case "/musica":
        try {
          const musicQuery = args.join(" ").trim();
          if (!musicQuery) {
            await sock.sendMessage(remoteJid, {
              text: "ℹ️ Uso: /music [canción]\nEjemplo: /music Despacito Luis Fonsi",
            });
            break;
          }

          await sock.sendMessage(remoteJid, {
            text: "🔍 Consultando APIs de música...",
          });

          const result = await handleMusicDownload(musicQuery, usuario);

          if (result.success && result.audio) {
            const viewsDetail = (() => {
              if (!result.info?.views) return null;
              const numericViews = Number(result.info.views);
              const formatted = Number.isFinite(numericViews)
                ? numericViews.toLocaleString("es-ES")
                : result.info.views;
              return `👁️ Vistas: ${formatted}`;
            })();

            const detailLines = [
              result.info?.title ? `🎵 Título: ${result.info.title}` : null,
              result.info?.author ? `👤 Canal: ${result.info.author}` : null,
              result.info?.duration ? `⏱️ Duración: ${result.info.duration}` : null,
              result.info?.quality ? `📶 Calidad: ${result.info.quality}` : null,
              viewsDetail,
              result.info?.provider ? `🔧 Proveedor: ${result.info.provider}` : null,
              `🙋 Solicitado por: @${usuario}`,
            ];

            const audioSent = await sendMediaWithProgress({
              sock,
              remoteJid,
              url: result.audio,
              type: "audio",
              header: "🎧 *Música - Descarga en progreso*",
              detailLines,
              mimetype: "audio/mpeg",
              mentions: result.mentions,
              fileName: safeFileNameFromTitle(result.info?.title, ".mp3"),
              contextLabel: "/music",
              timeoutMs: 90000,
              getFailureMessage: (_error, { stage }) => ({
                text:
                  `⚠️ *Música*\n\n❌ No se pudo ${stage === "send" ? "enviar" : "descargar"} el audio automáticamente.` +
                  (result.audio ? `\n🔗 Enlace directo:\n${result.audio}` : "") +
                  "\n\n🔁 Intenta nuevamente más tarde.",
              }),
            });

            if (audioSent && result.caption) {
              await sock.sendMessage(remoteJid, {
                text: result.caption,
                mentions: result.mentions,
              });
            }
          } else {
            await sock.sendMessage(remoteJid, {
              text: result.message || "⚠️  Error al buscar música.",
            });
          }
        } catch (error) {
          logger.error("Error en /music:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️  Error al buscar música. Intenta nuevamente.",
          });
        }
        break;
      case "/spotify":
      case "/spot":
        try {
          const spotifyQuery = args.join(" ").trim();
          if (!spotifyQuery) {
            await sock.sendMessage(remoteJid, {
              text: "ℹ️ Uso: /spotify [canción]\nEjemplo: /spotify Shape of You",
            });
            break;
          }

          await sock.sendMessage(remoteJid, {
            text: "🔍 Buscando en Spotify...",
          });

          const result = await handleSpotifySearch(spotifyQuery, usuario);

          if (result.success) {
            const baseDetailLines = [
              result.info?.title ? `🎵 Título: ${result.info.title}` : null,
              result.info?.artists ? `👤 Artistas: ${result.info.artists}` : null,
              result.info?.album ? `💽 Álbum: ${result.info.album}` : null,
              result.info?.duration ? `⏱️ Duración: ${result.info.duration}` : null,
              result.info?.release_date ? `📅 Lanzamiento: ${result.info.release_date}` : null,
              result.info?.provider ? `🔧 Proveedor: ${result.info.provider}` : null,
              `🙋 Solicitado por: @${usuario}`,
            ];

            if (result.image) {
              await sendMediaWithProgress({
                sock,
                remoteJid,
                url: result.image,
                type: "image",
                header: "🖼️ *Spotify - Portada del álbum*",
                detailLines: baseDetailLines,
                mimetype: "image/jpeg",
                mentions: result.mentions,
                fileName: safeFileNameFromTitle(result.info?.title, ".jpg"),
                contextLabel: "/spotify:image",
                timeoutMs: 45000,
                getFailureMessage: (_error, { stage }) => ({
                  text:
                    `⚠️ *Spotify*\n\n❌ No se pudo ${stage === "send" ? "enviar" : "descargar"} la portada automáticamente.` +
                    (result.image ? `\n🔗 Enlace directo:\n${result.image}` : "") +
                    "\n\n🔁 Intenta nuevamente más tarde.",
                }),
              });
            }

            if (result.audio) {
              await sendMediaWithProgress({
                sock,
                remoteJid,
                url: result.audio,
                type: "audio",
                header: "🎧 *Spotify - Vista previa en progreso*",
                detailLines: baseDetailLines,
                mimetype: "audio/mpeg",
                mentions: result.mentions,
                fileName: safeFileNameFromTitle(result.info?.title, ".mp3"),
                contextLabel: "/spotify:audio",
                timeoutMs: 70000,
                getFailureMessage: (_error, { stage }) => ({
                  text:
                    `⚠️ *Spotify*\n\n❌ No se pudo ${stage === "send" ? "enviar" : "descargar"} el audio automáticamente.` +
                    (result.audio ? `\n🔗 Enlace directo:\n${result.audio}` : "") +
                    "\n\n🔁 Intenta nuevamente más tarde.",
                }),
              });
            }

            await sock.sendMessage(remoteJid, {
              text: result.caption,
              mentions: result.mentions,
            });
          } else {
            await sock.sendMessage(remoteJid, {
              text: result.message || "⚠️  Error al buscar en Spotify.",
            });
          }
        } catch (error) {
          logger.error("Error en /spotify:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️  Error al buscar en Spotify. Intenta nuevamente.",
          });
        }
        break;
      case "/video":
      case "/youtube":
        try {
          const videoQuery = args.join(" ").trim();
          if (!videoQuery) {
            await sock.sendMessage(remoteJid, {
              text: "ℹ️ Uso: /video [búsqueda]\nEjemplo: /video tutorial javascript",
            });
            break;
          }

          await sock.sendMessage(remoteJid, {
            text: "🎬 Buscando video en YouTube...",
          });

          const result = await handleVideoDownload(videoQuery, usuario);

          if (result.success && result.video) {
            const viewsDetail = (() => {
              if (!result.info?.views) return null;
              const numericViews = Number(result.info.views);
              const formatted = Number.isFinite(numericViews)
                ? numericViews.toLocaleString("es-ES")
                : result.info.views;
              return `👁️ Vistas: ${formatted}`;
            })();

            const detailLines = [
              result.info?.title ? `🎬 Título: ${result.info.title}` : null,
              result.info?.author ? `👤 Canal: ${result.info.author}` : null,
              result.info?.duration ? `⏱️ Duración: ${result.info.duration}` : null,
              result.info?.quality ? `📶 Calidad: ${result.info.quality}` : null,
              viewsDetail,
              result.info?.provider ? `🔧 Proveedor: ${result.info.provider}` : null,
              `🙋 Solicitado por: @${usuario}`,
            ];

            await sendMediaWithProgress({
              sock,
              remoteJid,
              url: result.video,
              type: "video",
              header: "🎬 *Video - Descarga en progreso*",
              detailLines,
              mimetype: "video/mp4",
              caption: result.caption,
              mentions: result.mentions,
              fileName: safeFileNameFromTitle(result.info?.title, ".mp4"),
              contextLabel: "/video",
              timeoutMs: 120000,
              getFailureMessage: (_error, { stage }) => ({
                text:
                  `⚠️ *Video*\n\n❌ No se pudo ${stage === "send" ? "enviar" : "descargar"} el video automáticamente.` +
                  (result.video ? `\n🔗 Enlace directo:\n${result.video}` : "") +
                  "\n\n🔁 Intenta nuevamente más tarde.",
              }),
            });
          } else {
            await sock.sendMessage(remoteJid, {
              text: result.message || "⚠️  Error al buscar video.",
            });
          }
        } catch (error) {
          logger.error("Error en /video:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️  Error al buscar video. Intenta nuevamente.",
          });
        }
        break;
      case "/meme":
        try {
          await sock.sendMessage(remoteJid, { text: "🖼️ Generando meme..." });

          // Usar API de Vreden para memes
          const response = await fetch("https://api.vreden.my.id/api/meme");
          const data = await response.json();

          if (data.status && data.data) {
            await sock.sendMessage(remoteJid, {
              image: { url: data.data.url },
              caption:
                `😄 *Meme aleatorio*\n\n` +
                `📌 **Título:** ${data.data.title || "Meme divertido"}\n` +
                `👤 **Autor:** ${data.data.author || "Anónimo"}\n` +
                `👍 **Votos:** ${data.data.ups || "N/A"}\n\n` +
                `👤 Solicitado por: ${usuario}\n` +
                `🕒 ${new Date().toLocaleString("es-ES")}`,
            });
          } else {
            await sock.sendMessage(remoteJid, {
              text:
                `⚠️ *Generador de memes*\n\n` +
                `❌ No se pudo generar el meme en este momento.\n\n` +
                `🔁 Intenta nuevamente en unos segundos.`,
            });
          }
        } catch (error) {
          logger.error("Error generando meme:", error);
          await sock.sendMessage(remoteJid, {
            text:
              `⚠️ *Generador de memes*\n\n` +
              `❌ Error generando meme.\n\n` +
              `🔁 Intenta nuevamente más tarde.`,
          });
        }
        break;

      case "/imagen":
      case "/image":
      case "/ai":
        const imagePrompt = args.join(" ");
        if (!imagePrompt) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Uso: /imagen [descripción]\nEjemplo: /imagen gato jugando en el jardín",
          });
        } else {
          try {
            await sock.sendMessage(remoteJid, {
              text: "🎨 Generando imagen con IA...\n\n⏳ Esto puede tomar unos segundos...",
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
                  `🖼️ *Imagen generada con IA*\n\n` +
                  `📝 **Prompt:** "${imagePrompt}"\n` +
                  `🧠 **Motor:** Inteligencia Artificial\n` +
                  `⏱️ **Tiempo:** ${data.data.time || "N/A"}\n\n` +
                  `👤 Solicitado por: ${usuario}\n` +
                  `🕒 ${new Date().toLocaleString("es-ES")}`,
              });
            } else {
              await sock.sendMessage(remoteJid, {
                text:
                  `⚠️ *Generador de imágenes IA*\n\n` +
                  `❌ No se pudo generar la imagen: "${imagePrompt}"\n\n` +
                  `💡 Intenta con una descripción más simple o específica.`,
              });
            }
          } catch (error) {
            logger.error("Error generando imagen IA:", error);
            await sock.sendMessage(remoteJid, {
              text:
                `⚠️ *Generador de imágenes IA*\n\n` +
                `❌ Error generando imagen: "${imagePrompt}"\n\n` +
                `🕘 El servicio puede estar ocupado, intenta más tarde.`,
            });
          }
        }
        break;

      case "/joke":
      case "/chiste":
        const jokes = [
          "Por qué los programadores prefieren el modo oscuro? Porque la luz atrae a los bugs! 😄",
          "Cuál es el colmo de un programador? Que su mujer le diga que tiene un bug y él le pregunte si es reproducible 😂",
          "Por qué los programadores odian la naturaleza? Porque tiene demasiados bugs 🐛",
          "Un programador va al médico y le dice: 'Doctor, me duele cuando programo'. El médico le responde: 'Entonces no programes' 😆",
          "Qué le dice un bit a otro bit? Nos vemos en el bus! 😄",
        ];
        const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
        await sock.sendMessage(remoteJid, {
          text: `😂 *Chiste del Día*\n\n${randomJoke}`,
        });
        break;

      case "/translate":
      case "/traducir":
        try {
          const translateArgs = messageText
            .substring(command.length)
            .trim()
            .split("|");
          const textToTranslate = translateArgs[0]?.trim();
          const targetLang = translateArgs[1]?.trim() || "es";

          if (!textToTranslate) {
            await sock.sendMessage(remoteJid, {
              text: "ℹ️ Uso: /translate [texto] | [idioma]\nEjemplo: /translate Hello world\n/translate Hola | en",
            });
          } else {
            const result = await handleTranslate(
              textToTranslate,
              targetLang,
              usuario.split("@")[0],
            );
            await sock.sendMessage(remoteJid, {
              text: result.message,
              mentions: result.mentions,
            });
          }
        } catch (error) {
          logger.error("Error en /translate:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error al traducir. Intenta nuevamente.",
          });
        }
        break;

      case "/weather":
      case "/clima":
        const city = args.join(" ");
        if (!city) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Uso: /weather [ciudad]\nEjemplo: /weather Madrid",
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
                    `🌦️ *Clima*\n\n` +
                    `📍 **Ubicación:** ${location.areaName[0].value}, ${location.country[0].value}\n\n` +
                    `🌡️ **Temperatura:** ${current.temp_C}°C\n` +
                    `🥵 **Sensación térmica:** ${current.FeelsLikeC}°C\n` +
                    `☁️ **Condición:** ${current.weatherDesc[0].value}\n` +
                    `💧 **Humedad:** ${current.humidity}%\n` +
                    `🌬️ **Viento:** ${current.windspeedKmph} km/h\n` +
                    `👁️ **Visibilidad:** ${current.visibility} km`,
                });
              } else {
                throw new Error("Ciudad no encontrada");
              }
            } else {
              const data = await response.json();

              if (data.cod === 200) {
                const temp = Math.round(data.main.temp);
                const feelsLike = Math.round(data.main.feels_like);
                const description = data.weather[0].description;
                const humidity = data.main.humidity;
                const windSpeed = Math.round(data.wind.speed * 3.6); // m/s a km/h

                await sock.sendMessage(remoteJid, {
                  text:
                    `🌦️ *Clima*\n\n` +
                    `🏙️ **Ciudad:** ${data.name}, ${data.sys.country}\n\n` +
                    `🌡️ **Temperatura:** ${temp}°C\n` +
                    `🥵 **Sensación térmica:** ${feelsLike}°C\n` +
                    `☁️ **Condición:** ${description}\n` +
                    `💧 **Humedad:** ${humidity}%\n` +
                    `🌬️ **Viento:** ${windSpeed} km/h`,
                });
              } else {
                throw new Error("Ciudad no encontrada");
              }
            }
          } catch (error) {
            logger.error("Error en clima:", error);
            await sock.sendMessage(remoteJid, {
              text:
                `⚠️ *Clima*\n\n` +
                `❌ No se pudo obtener el clima para: "${city}"\n\n` +
                `🔁 Intenta nuevamente más tarde.`,
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
              text: `💭 *Frase Inspiradora Real*\n\n"${data.content}"\n\n👤 **Autor:** ${data.author}\n🏷️ **Categoría:** ${data.tags.join(", ")}\n\n📝 Solicitado por: ${usuario}\n⏰ ${new Date().toLocaleString("es-ES")}`,
            });
          } else {
            throw new Error("No se pudo obtener cita");
          }
        } catch (error) {
          // Fallback con citas locales
          const quotes = [
            {
              text: "El único modo de hacer un gran trabajo es amar lo que haces.",
              author: "Steve Jobs",
            },
            {
              text: "La vida es lo que pasa mientras estás ocupado haciendo otros planes.",
              author: "John Lennon",
            },
            {
              text: "El futuro pertenece a quienes creen en la belleza de sus sueños.",
              author: "Eleanor Roosevelt",
            },
            {
              text: "No es la especie más fuerte la que sobrevive, sino la más adaptable al cambio.",
              author: "Charles Darwin",
            },
            {
              text: "La imaginación es más importante que el conocimiento.",
              author: "Albert Einstein",
            },
            {
              text: "El éxito es ir de fracaso en fracaso sin perder el entusiasmo.",
              author: "Winston Churchill",
            },
            {
              text: "La única forma de hacer un trabajo excelente es amar lo que haces.",
              author: "Steve Jobs",
            },
          ];

          const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
          await sock.sendMessage(remoteJid, {
            text: `💭 *Frase Inspiradora*\n\n"${randomQuote.text}"\n\n👤 **Autor:** ${randomQuote.author}\n\n📝 Solicitado por: ${usuario}\n⏰ ${new Date().toLocaleString("es-ES")}`,
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
                text: `🔍 *Dato Curioso Real*\n\n💡 ${translatedFact}\n\n📚 **Fuente:** Datos verificados\n🏷️ **Categoría:** Conocimiento general\n\n📝 Solicitado por: ${usuario}\n⏰ ${new Date().toLocaleString("es-ES")}`,
              });
            } catch (translateError) {
              // Si falla la traducción, usar el dato en inglés
              await sock.sendMessage(remoteJid, {
                text: `🔍 *Dato Curioso Real*\n\n💡 ${data.text}\n\n📚 **Fuente:** Datos verificados\n🌐 **Idioma:** Inglés\n\n📝 Solicitado por: ${usuario}\n⏰ ${new Date().toLocaleString("es-ES")}`,
              });
            }
          } else {
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
            "Los gatos pueden hacer más de 100 sonidos diferentes.",
            "Una gota de lluvia tarda aproximadamente 10 minutos en caer desde una nube.",
            "El ADN humano es 99.9% idéntico en todas las personas.",
          ];

          const randomFact = facts[Math.floor(Math.random() * facts.length)];
          await sock.sendMessage(remoteJid, {
            text: `🔍 *Dato Curioso*\n\n💡 ${randomFact}\n\n🏷️ **Categoría:** Ciencia y naturaleza\n\n📝 Solicitado por: ${usuario}\n⏰ ${new Date().toLocaleString("es-ES")}`,
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
              `🧠 *Pregunta de Trivia*\n\n` +
              `❓ ${decodeHtml(question.question)}\n\n` +
              `📋 **Opciones:**\n` +
              `1️⃣ ${decodeHtml(allAnswers[0])}\n` +
              `2️⃣ ${decodeHtml(allAnswers[1])}\n` +
              `3️⃣ ${decodeHtml(allAnswers[2])}\n` +
              `4️⃣ ${decodeHtml(allAnswers[3])}\n\n` +
              `🏷️ **Categoría:** ${question.category}\n` +
              `⭐ **Dificultad:** ${question.difficulty.toUpperCase()}\n\n` +
              `✅ **Respuesta correcta:** Opción ${correctIndex}\n` +
              `💡 **Respuesta:** ${decodeHtml(correctAnswer)}\n\n` +
              `📝 Solicitado por: @${usuario}\n` +
              `⏰ ${new Date().toLocaleString("es-ES")}`;

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
            `🧠 *Pregunta de Trivia*\n\n` +
            `❓ ${randomTrivia.question}\n\n` +
            `📋 **Opciones:**\n` +
            `1️⃣ ${randomTrivia.options[0]}\n` +
            `2️⃣ ${randomTrivia.options[1]}\n` +
            `3️⃣ ${randomTrivia.options[2]}\n` +
            `4️⃣ ${randomTrivia.options[3]}\n\n` +
            `🏷️ **Categoría:** Conocimiento General\n` +
            `⭐ **Dificultad:** MEDIO\n\n` +
            `✅ **Respuesta correcta:** Opción ${randomTrivia.correct + 1}\n` +
            `💡 **Respuesta:** ${randomTrivia.answer}\n\n` +
            `📝 Solicitado por: @${usuario}\n` +
            `⏰ ${new Date().toLocaleString("es-ES")}`;

          await sock.sendMessage(remoteJid, {
            text: triviaText,
            mentions: [usuario + "@s.whatsapp.net"],
          });
        }
        break;

      // COMANDOS DE REDES SOCIALES CON FALLBACK AUTOMÁTICO
      case "/tiktok":
      case "/tt":
        try {
          const tiktokUrl = args.join(" ").trim();
          if (!tiktokUrl) {
            await sock.sendMessage(remoteJid, {
              text: "ℹ️ Uso: /tiktok [URL]\nEjemplo: /tiktok https://www.tiktok.com/@user/video/123",
            });
            break;
          }

          await sock.sendMessage(remoteJid, {
            text: "🔍 Consultando APIs de TikTok...",
          });

          const result = await handleTikTokDownload(
            tiktokUrl,
            usuario,
          );

          if (result.success && result.video) {
            const detailLines = [
              result.info?.title ? `🎬 Título: ${result.info.title}` : null,
              result.info?.author ? `👤 Autor: ${result.info.author}` : null,
              result.info?.description ? `📝 Descripción: ${result.info.description}` : null,
              result.info?.provider ? `🔧 Proveedor: ${result.info.provider}` : null,
              `🙋 Solicitado por: @${usuario}`,
            ];

            await sendMediaWithProgress({
              sock,
              remoteJid,
              url: result.video,
              type: "video",
              header: "📹 *TikTok - Descarga en progreso*",
              detailLines,
              mimetype: "video/mp4",
              caption: result.caption,
              mentions: result.mentions,
              fileName: safeFileNameFromTitle(result.info?.title, ".mp4"),
              contextLabel: "/tiktok",
              timeoutMs: 90000,
              getFailureMessage: (_error, { stage }) => ({
                text:
                  `⚠️ *TikTok*\n\n❌ No se pudo ${stage === "send" ? "enviar" : "descargar"} el video automáticamente.` +
                  (result.video ? `\n🔗 Enlace directo:\n${result.video}` : "") +
                  "\n\n🔁 Intenta nuevamente más tarde.",
              }),
            });
          } else {
            await sock.sendMessage(remoteJid, {
              text:
                result.message || "⚠️ Error al descargar el video de TikTok.",
            });
          }
        } catch (error) {
          logger.error("Error en /tiktok:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error al descargar el video de TikTok. Intenta nuevamente.",
          });
        }
        break;
      case "/instagram":
      case "/ig":
        try {
          const igUrl = args.join(" ").trim();
          if (!igUrl) {
            await sock.sendMessage(remoteJid, {
              text: "ℹ️ Uso: /instagram [URL]\nEjemplo: /instagram https://www.instagram.com/p/ABC123/",
            });
            break;
          }

          await sock.sendMessage(remoteJid, {
            text: "🔍 Consultando APIs de Instagram...",
          });

          const result = await handleInstagramDownload(
            igUrl,
            usuario,
          );

          if (result.success) {
            const baseDetailLines = [
              result.info?.author ? `👤 Autor: ${result.info.author}` : null,
              result.info?.type ? `📄 Tipo: ${result.info.type}` : null,
              result.info?.provider ? `🔧 Proveedor: ${result.info.provider}` : null,
              `🙋 Solicitado por: @${usuario}`,
            ];

            if (result.type === "image" && (result.image || result.url)) {
              await sendMediaWithProgress({
                sock,
                remoteJid,
                url: result.image || result.url,
                type: "image",
                header: "📸 *Instagram - Imagen en descarga*",
                detailLines: baseDetailLines,
                mimetype: "image/jpeg",
                caption: result.caption,
                mentions: result.mentions,
                fileName: safeFileNameFromTitle(result.info?.title || result.info?.type, ".jpg"),
                contextLabel: "/instagram:image",
                timeoutMs: 60000,
                getFailureMessage: (_error, { stage }) => ({
                  text:
                    `⚠️ *Instagram*\n\n❌ No se pudo ${stage === "send" ? "enviar" : "descargar"} la imagen automáticamente.` +
                    ((result.image || result.url) ? `\n🔗 Enlace directo:\n${result.image || result.url}` : "") +
                    "\n\n🔁 Intenta nuevamente más tarde.",
                }),
              });
            } else if (result.type === "video" && (result.video || result.url)) {
              await sendMediaWithProgress({
                sock,
                remoteJid,
                url: result.video || result.url,
                type: "video",
                header: "🎞️ *Instagram - Video en descarga*",
                detailLines: baseDetailLines,
                mimetype: "video/mp4",
                caption: result.caption,
                mentions: result.mentions,
                fileName: safeFileNameFromTitle(result.info?.title || result.info?.type, ".mp4"),
                contextLabel: "/instagram:video",
                timeoutMs: 90000,
                getFailureMessage: (_error, { stage }) => ({
                  text:
                    `⚠️ *Instagram*\n\n❌ No se pudo ${stage === "send" ? "enviar" : "descargar"} el video automáticamente.` +
                    ((result.video || result.url) ? `\n🔗 Enlace directo:\n${result.video || result.url}` : "") +
                    "\n\n🔁 Intenta nuevamente más tarde.",
                }),
              });
            } else {
              await sock.sendMessage(remoteJid, {
                text: result.caption || "⚠️  No se encontró contenido descargable.",
                mentions: result.mentions,
              });
            }
          } else {
            await sock.sendMessage(remoteJid, {
              text:
                result.message ||
                "⚠️  Error al descargar el contenido de Instagram.",
            });
          }
        } catch (error) {
          logger.error("Error en /instagram:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️  Error al descargar el contenido de Instagram. Intenta nuevamente.",
          });
        }
        break;
      case "/facebook":
      case "/fb":
        try {
          const fbUrl = args.join(" ").trim();
          if (!fbUrl) {
            await sock.sendMessage(remoteJid, {
              text: "ℹ️ Uso: /facebook [URL]\nEjemplo: /facebook https://www.facebook.com/watch/?v=123456",
            });
            break;
          }

          await sock.sendMessage(remoteJid, {
            text: "🔍 Consultando APIs de Facebook...",
          });

          const result = await handleFacebookDownload(
            fbUrl,
            usuario,
          );

          if (result.success && result.video) {
            const viewsDetail = formatCount(result.info?.views);
            const detailLines = [
              result.info?.title ? `🎬 Título: ${result.info.title}` : null,
              result.info?.author ? `👤 Autor: ${result.info.author}` : null,
              result.info?.duration ? `⏱️ Duración: ${result.info.duration}` : null,
              viewsDetail ? `👁️ Vistas: ${viewsDetail}` : null,
              result.info?.provider ? `🔧 Proveedor: ${result.info.provider}` : null,
              `🙋 Solicitado por: @${usuario}`,
            ];

            await sendMediaWithProgress({
              sock,
              remoteJid,
              url: result.video,
              type: "video",
              header: "📺 *Facebook - Descarga en progreso*",
              detailLines,
              mimetype: "video/mp4",
              caption: result.caption,
              mentions: result.mentions,
              fileName: safeFileNameFromTitle(result.info?.title, ".mp4"),
              contextLabel: "/facebook",
              timeoutMs: 90000,
              getFailureMessage: (_error, { stage }) => ({
                text:
                  `⚠️ *Facebook*\n\n❌ No se pudo ${stage === "send" ? "enviar" : "descargar"} el video automáticamente.` +
                  (result.video ? `\n🔗 Enlace directo:\n${result.video}` : "") +
                  "\n\n🔁 Intenta nuevamente más tarde.",
              }),
            });
          } else {
            await sock.sendMessage(remoteJid, {
              text:
                result.message || "⚠️  Error al descargar el video de Facebook.",
            });
          }
        } catch (error) {
          logger.error("Error en /facebook:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️  Error al descargar el video de Facebook. Intenta nuevamente.",
          });
        }
        break;
      case "/twitter":
      case "/x":
        try {
          const twitterUrl = args.join(" ").trim();
          if (!twitterUrl) {
            await sock.sendMessage(remoteJid, {
              text: "ℹ️ Uso: /twitter [URL]\nEjemplo: /twitter https://twitter.com/user/status/123456",
            });
            break;
          }

          await sock.sendMessage(remoteJid, {
            text: "🔍 Consultando APIs de Twitter/X...",
          });

          const result = await handleTwitterDownload(
            twitterUrl,
            usuario,
          );

          if (result.success) {
            const baseDetailLines = [
              result.info?.author ? `👤 Autor: @${result.info.author}` : null,
              result.info?.text ? `📝 Texto: ${result.info.text}` : null,
              result.info?.provider ? `🔧 Proveedor: ${result.info.provider}` : null,
              result.info?.type ? `📄 Tipo: ${result.info.type}` : null,
              `🙋 Solicitado por: @${usuario}`,
            ];

            if (result.type === "video" && result.video) {
              await sendMediaWithProgress({
                sock,
                remoteJid,
                url: result.video,
                type: "video",
                header: "🐦 *Twitter/X - Video en descarga*",
                detailLines: baseDetailLines,
                mimetype: "video/mp4",
                caption: result.caption,
                mentions: result.mentions,
                fileName: safeFileNameFromTitle(result.info?.title || result.info?.type, ".mp4"),
                contextLabel: "/twitter:video",
                timeoutMs: 90000,
                getFailureMessage: (_error, { stage }) => ({
                  text:
                    `⚠️ *Twitter/X*\n\n❌ No se pudo ${stage === "send" ? "enviar" : "descargar"} el video automáticamente.` +
                    (result.video ? `\n🔗 Enlace directo:\n${result.video}` : "") +
                    "\n\n🔁 Intenta nuevamente más tarde.",
                }),
              });
            } else if (result.type === "image" && result.image) {
              await sendMediaWithProgress({
                sock,
                remoteJid,
                url: result.image,
                type: "image",
                header: "🐦 *Twitter/X - Imagen en descarga*",
                detailLines: baseDetailLines,
                mimetype: "image/jpeg",
                caption: result.caption,
                mentions: result.mentions,
                fileName: safeFileNameFromTitle(result.info?.title || result.info?.type, ".jpg"),
                contextLabel: "/twitter:image",
                timeoutMs: 60000,
                getFailureMessage: (_error, { stage }) => ({
                  text:
                    `⚠️ *Twitter/X*\n\n❌ No se pudo ${stage === "send" ? "enviar" : "descargar"} la imagen automáticamente.` +
                    (result.image ? `\n🔗 Enlace directo:\n${result.image}` : "") +
                    "\n\n🔁 Intenta nuevamente más tarde.",
                }),
              });
            } else {
              await sock.sendMessage(remoteJid, {
                text: result.caption || "Contenido de Twitter/X",
                mentions: result.mentions,
              });
            }
          } else {
            await sock.sendMessage(remoteJid, {
              text:
                result.message || "⚠️  Error al descargar el contenido de Twitter/X.",
            });
          }
        } catch (error) {
          logger.error("Error en /twitter:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️  Error al descargar el contenido de Twitter/X. Intenta nuevamente.",
          });
        }
        break;
      case "/pinterest":
      case "/pin":
        try {
          const pinterestUrl = args.join(" ").trim();
          if (!pinterestUrl) {
            await sock.sendMessage(remoteJid, {
              text: "ℹ️ Uso: /pinterest [URL]\nEjemplo: /pinterest https://www.pinterest.com/pin/123456789/",
            });
            break;
          }

          await sock.sendMessage(remoteJid, {
            text: "🔍 Consultando APIs de Pinterest...",
          });

          const result = await handlePinterestDownload(
            pinterestUrl,
            usuario,
          );

          if (result.success && result.image) {
            const detailLines = [
              result.info?.title ? `📌 Título: ${result.info.title}` : null,
              result.info?.description ? `📝 Descripción: ${result.info.description}` : null,
              result.info?.provider ? `🔧 Proveedor: ${result.info.provider}` : null,
              `🙋 Solicitado por: @${usuario}`,
            ];

            await sendMediaWithProgress({
              sock,
              remoteJid,
              url: result.image,
              type: "image",
              header: "📌 *Pinterest - Imagen en descarga*",
              detailLines,
              mimetype: "image/jpeg",
              caption: result.caption,
              mentions: result.mentions,
              fileName: safeFileNameFromTitle(result.info?.title, ".jpg"),
              contextLabel: "/pinterest",
              timeoutMs: 60000,
              getFailureMessage: (_error, { stage }) => ({
                text:
                  `⚠️ *Pinterest*\n\n❌ No se pudo ${stage === "send" ? "enviar" : "descargar"} la imagen automáticamente.` +
                  (result.image ? `\n🔗 Enlace directo:\n${result.image}` : "") +
                  "\n\n🔁 Intenta nuevamente más tarde.",
              }),
            });
          } else {
            await sock.sendMessage(remoteJid, {
              text:
                result.message || "⚠️  Error al descargar la imagen de Pinterest.",
            });
          }
        } catch (error) {
          logger.error("Error en /pinterest:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️  Error al descargar la imagen de Pinterest. Intenta nuevamente.",
          });
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
            text: "⚠️ Error al listar archivos. Intenta de nuevo.",
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
              text: "ℹ️ Uso: /buscararchivo [nombre]",
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
            text: "⚠️ Error al buscar archivos.",
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
            text: "⚠️ Error al listar tus archivos. Intenta de nuevo.",
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
              text: `ℹ️ Uso: /descargar [URL] [nombre opcional] [categoria opcional]
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
                text: "⚠️ No se pudo completar la descarga.",
              });
            }
          } catch (e) {
            logger.error("Error en /descargar:", e);
            await sock.sendMessage(remoteJid, {
              text: "⚠️ Error en la descarga. Intenta de nuevo.",
            });
          }
        } catch (error) {
          logger.error("Error en /descargar wrapper:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error interno en /descargar.",
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
              text: "ℹ️ Debes adjuntar un archivo o responder a un mensaje con un archivo para guardar.",
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
              text: `✅ *Archivo guardado*

📦 Categoría: ${categoria}
📁 Ruta: ${res.filepath}
📄 Nombre: ${res.filename}
🔢 Tamaño: ${res.size} bytes`,
            });
          } else {
            await sock.sendMessage(remoteJid, {
              text: "⚠️ No se pudo guardar el archivo.",
            });
          }
        } catch (error) {
          logger.error("Error en /guardar:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error al guardar el archivo. Intenta de nuevo.",
          });
        }
        break;

      // COMANDOS DE SUBBOTS - IMPLEMENTACIÓN FUNCIONAL
      case "/serbot":
        try {
          await ensureSubbotsTable();
          await refreshSubbotConnectionStatus(usuario);

          // Verificar límite de subbots por usuario (máximo 3)
          const userJid = usuario + "@s.whatsapp.net";
          const userSubbots = await db("subbots").where({
            request_jid: userJid,
            status: "connected",
          });
          if (userSubbots.length >= 3) {
            await sock.sendMessage(remoteJid, {
              text:
                `⚠️ Has alcanzado el límite de 3 subbots conectados.\n` +
                `Elimina uno con /delsubbot antes de crear uno nuevo.`,
            });
            break;
          }

          // Generar código de vinculación
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
              "Error al procesar tu solicitud. Por favor, inténtalo de nuevo.",
            );
          }

          // Enviar mensaje al remitente (en privado si es en grupo)
          const dmJid = isGroup ? `${usuario}@s.whatsapp.net` : remoteJid;
          const msg = `🔢 *CÓDIGO DE VINCULACIÓN* 🔢

📱 *Número:* +${res.phoneNumber}
🔑 *Código:* ${res.code}
⏳ *Válido por:* ${res.expiresAt || "10 minutos"}

*INSTRUCCIONES:*
1️⃣ Abre WhatsApp en tu teléfono
2️⃣ Ve a *Ajustes* > *Dispositivos vinculados*
3️⃣ Toca en *Vincular un dispositivo*
4️⃣ Selecciona *Vincular con número de teléfono*
5️⃣ Ingresa el código mostrado arriba

⚠️ *Importante:*
• El código es de un solo uso
• No lo compartas con nadie
• Si expira, genera uno nuevo con /serbot`;

          try {
            await sock.sendMessage(dmJid, { text: msg });
            if (isGroup) {
              await sock.sendMessage(remoteJid, {
                text: "📩 Te envié el Pairing Code por privado.",
              });
            }
          } catch (_) {
            await sock.sendMessage(remoteJid, { text: msg });
          }

          // Actualizar estado después de 15 segundos
          setTimeout(() => {
            try {
              refreshSubbotConnectionStatus(usuario);
            } catch (_) {}
          }, 15000);
        } catch (error) {
          logger.error("Error en /serbot:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error al procesar el comando. Intenta de nuevo.",
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
            text: "⚠️ Error al listar subbots. Intenta de nuevo.",
          });
        }
        break;

      case "/addbot":
        if (!isOwner) {
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Solo el owner puede agregar subbots",
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
              text: `🤖 *Agregar SubBot*\n\n❌ Ya existe un subbot con el número: ${numeroBot}\n\n💡 Usa un número diferente`,
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
              `🤖 *SubBot Agregado*\n\n✅ **SubBot creado exitosamente**\n\n` +
              `🆔 **ID:** ${subbotId}\n` +
              `📝 **Nombre:** ${nombreBot}\n` +
              `📱 **Número:** ${numeroBot}\n` +
              `🔴 **Estado:** Desconectado\n` +
              `👤 **Creado por:** ${usuario}\n\n` +
              `📋 **Próximos pasos:**\n` +
              `1. Configura WhatsApp en el número ${numeroBot}\n` +
              `2. Usa \`/connectbot ${subbotId}\` para conectar\n` +
              `3. Usa \`/botinfo ${subbotId}\` para ver detalles\n\n` +
              `📅 ${new Date().toLocaleString("es-ES")}`,
          });
        } catch (error) {
          logger.error("Error agregando subbot:", error);
          await sock.sendMessage(remoteJid, {
            text: `🤖 *Agregar SubBot*\n\n❌ Error agregando subbot\n\n💡 Verifica los datos e intenta nuevamente`,
          });
        }
        break;

      case "/delbot":
        if (!isOwner) {
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Solo el owner puede eliminar subbots",
          });
          break;
        }

        if (!args[0]) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Uso: /delbot [id]\nEjemplo: /delbot 1",
          });
          break;
        }

        try {
          const botId = parseInt(args[0]);

          // Verificar si el subbot existe
          const subbot = await db("subbots").where({ id: botId }).first();
          if (!subbot) {
            await sock.sendMessage(remoteJid, {
              text: `🤖 *Eliminar SubBot*\n\n❌ No existe un subbot con ID: ${botId}\n\n💡 Usa \`/bots\` para ver la lista`,
            });
            break;
          }

          // Eliminación total (BD + archivos)
          await autoDeleteSubbotById(botId, { reason: "delbot_command" });

          await sock.sendMessage(remoteJid, {
            text:
              `🤖 *SubBot Eliminado*\n\n✅ **SubBot eliminado exitosamente**\n\n` +
              `🆔 **ID:** ${botId}\n` +
              `📝 **Nombre:** ${subbot.nombre}\n` +
              `📱 **Número:** ${subbot.numero}\n` +
              `👤 **Eliminado por:** ${usuario}\n\n` +
              `📅 ${new Date().toLocaleString("es-ES")}`,
          });
        } catch (error) {
          logger.error("Error eliminando subbot:", error);
          await sock.sendMessage(remoteJid, {
            text: `🤖 *Eliminar SubBot*\n\n❌ Error eliminando subbot\n\n💡 Verifica el ID e intenta nuevamente`,
          });
        }
        break;

      case "/botinfo":
        if (args.length === 0) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Uso: /botinfo [id]\nEjemplo: /botinfo 1",
          });
          break;
        }

        try {
          const botId = parseInt(args[0]);

          // Obtener informacin del subbot
          const subbot = await db("subbots").where({ id: botId }).first();
          if (!subbot) {
            await sock.sendMessage(remoteJid, {
              text: `🤖 *Información del SubBot*\n\n❌ No existe un subbot con ID: ${botId}\n\n💡 Usa \`/bots\` para ver la lista`,
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
              ? "🟢"
              : subbot.estado === "error"
                ? "🔴"
                : "⚪";
          const createdDate = new Date(subbot.created_at).toLocaleString(
            "es-ES",
          );
          const lastActivity = new Date(subbot.ultima_actividad).toLocaleString(
            "es-ES",
          );

          let infoText = `🤖 *Información Detallada del SubBot*\n\n`;
          infoText += `🆔 **ID:** ${subbot.id}\n`;
          infoText += `📝 **Nombre:** ${subbot.nombre}\n`;
          infoText += `📱 **Número:** ${subbot.numero}\n`;
          infoText += `${statusEmoji} **Estado:** ${subbot.estado}\n`;
          infoText += `📝 **Descripción:** ${subbot.descripcion || "Sin descripción"}\n`;
          infoText += `👤 **Creado por:** ${subbot.creado_por}\n`;
          infoText += `📅 **Fecha creación:** ${createdDate}\n`;
          infoText += `⏰ **Última actividad:** ${lastActivity}\n\n`;

          if (recentActivity.length > 0) {
            infoText += `📋 **Actividad Reciente:**\n`;
            recentActivity.forEach((activity, index) => {
              const activityDate = new Date(activity.created_at).toLocaleString(
                "es-ES",
              );
              infoText += `${index + 1}. ${activity.accion} - ${activityDate}\n`;
            });
            infoText += `\n`;
          }

          infoText += `📅 ${new Date().toLocaleString("es-ES")}`;

          await sock.sendMessage(remoteJid, { text: infoText });
        } catch (error) {
          logger.error("Error obteniendo info del subbot:", error);
          await sock.sendMessage(remoteJid, {
            text: `ℹ️ *Información del SubBot*\n\n⚠️ Error obteniendo información\n\n🔁 Intenta nuevamente más tarde`,
          });
        }
        break;

      case "/connectbot":
        if (!isOwner) {
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Solo el owner puede conectar subbots",
          });
          break;
        }

        if (!args[0]) {
          await sock.sendMessage(remoteJid, {
            text:
              "🤖 **Conectar SubBot:**\n\n" +
              "📱 **QR:** `/connectbot [id]`\n" +
              "🔢 **CODE:** `/connectbot [id] code`\n\n" +
              "**Ejemplos:**\n" +
              " `/connectbot 1` ? QR real de Baileys\n" +
              " `/connectbot 1 code` ? Código KONMIBOT\n\n" +
              "📋 Usa `/bots` para ver IDs de subbots",
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
              text: `⚠️ *Conectar SubBot*\n\n❌ No existe un subbot con ID: ${botId}\n\n📋 Usa \`/bots\` para ver la lista`,
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
            detalle: `Iniciando proceso de conexión ${useCode ? "con código" : "con QR"} para ${subbot.nombre}`,
            usuario: usuario,
            created_at: new Date().toISOString(),
          });

          if (useCode) {
            await sock.sendMessage(remoteJid, {
              text:
                `🔗 *Iniciando Conexión con Pairing Code...*\n\n` +
                `🤖 **SubBot:** ${subbot.nombre}\n` +
                `📱 **Número:** ${subbot.numero}\n` +
                `🔄 **Estado:** Generando código real...\n\n` +
                `⏳ Creando sesión de WhatsApp...`,
            });

            try {
              // Crear sesión de autenticación para el subbot
              const authPath = `./auth-sessions/subbot-${botId}`;

              // Crear directorio si no existe
              if (!fs.existsSync("./auth-sessions")) {
                fs.mkdirSync("./auth-sessions", { recursive: true });
              }

              const { state, saveCreds } =
                await useMultiFileAuthState(authPath);
              const { version } = await fetchLatestBaileysVersion();

              // Crear socket temporal para el subbot con configuracin KONMI-BOT
              const subbotSocket = makeWASocket({
                ...KONMI_BOT_CONFIG,
                version,
                logger: pino({ level: "silent" }),
                printQRInTerminal: false,
                browser: Browsers.ubuntu("Chrome"),
                auth: state,
                browser: Browsers.ubuntu("Chrome"),
              });

              // Solicitar pairing code REAL de Baileys con código personalizado KONMIBOT
              const realPairingCode = await subbotSocket.requestPairingCode(
                subbot.numero,
                "KONMIBOT",
              );

              // Actualizar configuración con el código REAL
              const currentConfig = JSON.parse(subbot.configuracion || "{}");
              currentConfig.pairing_code = realPairingCode;
              currentConfig.pairing_generated_at = new Date().toISOString();
              currentConfig.pairing_expires_at = new Date(
                Date.now() + 10 * 60 * 1000,
              ).toISOString();
              currentConfig.device_name = "KONMI-BOT";
              currentConfig.auth_path = authPath;

              await db("subbots")
                .where({ id: botId })
                .update({
                  configuracion: JSON.stringify(currentConfig),
                  updated_at: new Date().toISOString(),
                });

              await sock.sendMessage(remoteJid, {
                text:
                  `🔗 *CODE - SubBot*\n\n` +
                  `🤖 **SubBot:** ${subbot.nombre}\n` +
                  `📱 **Número:** ${subbot.numero}\n` +
                  `⏳ **Estado:** Esperando vinculación...\n\n` +
                  `🔢 **CÓDIGO:**\n\`${realPairingCode}\`\n\n` +
                  `📋 **INSTRUCCIONES CODE:**\n` +
                  `1. Abre WhatsApp en ${subbot.numero}\n` +
                  `2. Ve a Configuración > Dispositivos vinculados\n` +
                  `3. Toca "Vincular con código de teléfono"\n` +
                  `4. Ingresa: **${realPairingCode}**\n` +
                  `5. Aparecerá como "KONMI-BOT"\n\n` +
                  `⏰ **Válido por:** 10 minutos\n` +
                  `💡 **Alternativa:** \`/connectbot ${botId}\` (QR)\n\n` +
                  `📅 ${new Date().toLocaleString("es-ES")}`,
              });

              // Manejar eventos de conexión del subbot
              subbotSocket.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === "open") {
                  // SubBot conectado exitosamente
                  await db("subbots").where({ id: botId }).update({
                    estado: "conectado",
                    ultima_actividad: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  });

                  await db("subbot_activity").insert({
                    subbot_id: botId,
                    accion: "conectado_pairing",
                    detalle: `SubBot conectado exitosamente usando pairing code: ${realPairingCode}`,
                    usuario: usuario,
                    created_at: new Date().toISOString(),
                  });

                  await sock.sendMessage(remoteJid, {
                    text:
                      `✅ *SubBot conectado con Pairing Code*\n\n` +
                      `🤖 **${subbot.nombre}** se conectó exitosamente\n\n` +
                      `📱 Número: ${subbot.numero}\n` +
                      `📡 Estado: Conectado\n` +
                      `🔐 Código usado: ${realPairingCode}\n` +
                      `🆔 Aparece como: KONMI-BOT\n` +
                      `🕒 Conectado: ${new Date().toLocaleString("es-ES")}\n\n` +
                      `🎉 El SubBot ya está operativo y aparece como "KONMI-BOT" en WhatsApp`,
                  });

                  // Cerrar el socket temporal después de la conexión exitosa
                  setTimeout(() => {
                    subbotSocket.end();
                  }, 5000);
                } else if (connection === "close") {
                  const shouldReconnect =
                    lastDisconnect?.error?.output?.statusCode !==
                    DisconnectReason.loggedOut;

                  if (!shouldReconnect) {
                    await db("subbots").where({ id: botId }).update({
                      estado: "error",
                      updated_at: new Date().toISOString(),
                    });

                    await sock.sendMessage(remoteJid, {
                      text:
                        `❌ *Conexión SubBot Fallida*\n\n` +
                        `🤖 Nombre: ${subbot.nombre}\n` +
                        `📱 Número: ${subbot.numero}\n` +
                        `⚠️ Estado: Error\n\n` +
                        `📋 **Posibles causas:**\n` +
                        `❌ Código expirado (10 minutos)\n` +
                        `❌ Código ingresado incorrectamente\n` +
                        `❌ Número ya vinculado a otro dispositivo\n\n` +
                        `💡 Usa \`/connectbot ${botId} code\` para generar nuevo código`,
                    });

                    // Borrado automático si hay cierre con error/no reconexión
                    try {
                      await autoDeleteSubbotById(botId, {
                        reason: "connection_close_or_error",
                      });
                    } catch (_) {}
                  }
                }
              });

              // Manejar actualizacin de credenciales
              subbotSocket.ev.on("creds.update", saveCreds);
            } catch (pairingError) {
              logger.error("Error generando pairing code real:", pairingError);
              await sock.sendMessage(remoteJid, {
                text:
                  `⚠️ *Error generando Pairing Code*\n\n` +
                  `🤖 SubBot: ${subbot.nombre}\n` +
                  `📱 Número: ${subbot.numero}\n\n` +
                  `❌ Error: ${pairingError.message}\n\n` +
                  `🔁 Intenta nuevamente con \`/connectbot ${botId} code\``,
              });
            }
          } else {
            // MTODO DE QR (ORIGINAL)

            // Generar QR para conexión usando API de Vreden
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
                  `📱 *QR CODE - SubBot*\n\n` +
                  `🤖 **SubBot:** ${subbot.nombre}\n` +
                  `📱 **Número:** ${subbot.numero}\n` +
                  `🔄 **Estado:** Conectando...\n\n` +
                  `📋 **INSTRUCCIONES QR:**\n` +
                  `1. Abre WhatsApp en ${subbot.numero}\n` +
                  `2. Ve a Configuración > Dispositivos vinculados\n` +
                  `3. Toca "Vincular un dispositivo"\n` +
                  `4. Escanea este QR\n` +
                  `5. Aparecerá como "KONMI-BOT"\n\n` +
                  `⏰ **Válido por:** 2 minutos\n` +
                  `💡 **Alternativa:** \`/connectbot ${botId} code\`\n\n` +
                  `📅 ${new Date().toLocaleString("es-ES")}`,
              });
            } else {
              await sock.sendMessage(remoteJid, {
                text: `🤖 *Conectar SubBot*\n\n❌ Error generando código QR\n\n💡 Intenta con código: \`/connectbot ${botId} code\``,
              });
              break;
            }
          }
        } catch (error) {
          logger.error("Error conectando subbot:", error);
          await sock.sendMessage(remoteJid, {
            text: `🤖 *Conectar SubBot*\n\n❌ Error en el proceso de conexión\n\n💡 Intenta nuevamente más tarde`,
          });
        }
        break;

      case "/qrbot":
        if (!isOwner) {
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Solo el owner puede generar QR de subbots",
          });
          break;
        }

        if (!args[0]) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Uso: /qrbot [id]\nEjemplo: /qrbot 1",
          });
          break;
        }

        try {
          const botId = parseInt(args[0]);

          // Verificar si el subbot existe
          const subbot = await db("subbots").where({ id: botId }).first();
          if (!subbot) {
            await sock.sendMessage(remoteJid, {
              text: `⚠️ *QR SubBot*\n\n❌ No existe un subbot con ID: ${botId}\n\n📋 Usa \`/bots\` para ver la lista`,
            });
            break;
          }

          await sock.sendMessage(remoteJid, {
            text: "🔄 Generando nuevo código QR... ⏳",
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
                `📱 *QR SubBot*\n\n` +
                `🤖 **SubBot:** ${subbot.nombre}\n` +
                `📱 **Número:** ${subbot.numero}\n` +
                `🔄 **Estado:** ${subbot.estado}\n\n` +
                `📋 **Instrucciones:**\n` +
                `1. Abre WhatsApp en el dispositivo\n` +
                `2. Ve a Dispositivos vinculados\n` +
                `3. Escanea este código QR\n\n` +
                `⏰ **Válido por:** 2 minutos\n` +
                `📅 **QR generado:** ${new Date().toLocaleString("es-ES")}`,
            });

            // Registrar actividad
            await db("subbot_activity").insert({
              subbot_id: botId,
              accion: "qr_generado",
              detalle: `Nuevo código QR generado para conexión`,
              usuario: usuario,
              created_at: new Date().toISOString(),
            });
          } else {
            await sock.sendMessage(remoteJid, {
              text: `📱 *QR SubBot*\n\n❌ Error generando código QR\n\n💡 Intenta nuevamente más tarde`,
            });
          }
        } catch (error) {
          logger.error("Error generando QR subbot:", error);
          await sock.sendMessage(remoteJid, {
            text: `📱 *QR SubBot*\n\n❌ Error generando código QR\n\n💡 Intenta nuevamente más tarde`,
          });
        }
        break;

      case "/disconnectbot":
        if (!isOwner) {
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Solo el owner puede desconectar subbots",
          });
          break;
        }

        if (!args[0]) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Uso: /disconnectbot [id]\nEjemplo: /disconnectbot 1",
          });
          break;
        }

        try {
          const botId = parseInt(args[0]);

          // Verificar si el subbot existe
          const subbot = await db("subbots").where({ id: botId }).first();
          if (!subbot) {
            await sock.sendMessage(remoteJid, {
              text: `⚠️ *Desconectar SubBot*\n\n❌ No existe un subbot con ID: ${botId}\n\n📋 Usa \`/bots\` para ver la lista`,
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
              `✅ *SubBot desconectado*\n\n🤖 **${subbot.nombre}** ha sido desconectado\n\n` +
              `📱 Número: ${subbot.numero}\n` +
              `📡 Estado: Desconectado\n` +
              `👤 Desconectado por: ${usuario}\n` +
              `📅 Fecha: ${new Date().toLocaleString("es-ES")}\n\n` +
              `🔁 Usa \`/connectbot ${botId}\` para reconectar`,
          });

          // Eliminación automática tras desconexión manual
          try {
            await autoDeleteSubbotById(botId, { reason: "manual_disconnect" });
          } catch (_) {}
        } catch (error) {
          logger.error("Error desconectando subbot:", error);
          await sock.sendMessage(remoteJid, {
            text: `⚠️ *Desconectar SubBot*\n\n❌ Error desconectando subbot\n\n🔁 Intenta nuevamente más tarde`,
          });
        }
        break;

      case "/paircode":
      case "/codigo":
        if (!isOwner) {
          await sock.sendMessage(remoteJid, {
            text: "⛔ Solo el owner puede ver códigos de vinculación",
          });
          break;
        }

        if (!args[0]) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Uso: /paircode [id]\nEjemplo: /paircode 1",
          });
          break;
        }

        try {
          const botId = parseInt(args[0]);

          // Verificar si el subbot existe
          const subbot = await db("subbots").where({ id: botId }).first();
          if (!subbot) {
            await sock.sendMessage(remoteJid, {
              text: `🔗 *Código de vinculación*\n\n❌ No existe un subbot con ID: ${botId}\n\n📋 Usa \`/bots\` para ver la lista`,
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
              text: `🔗 *Código de vinculación*\n\n⚠️ No hay código generado para este subbot\n\n🛠️ Usa \`/connectbot ${botId} code\` para generar uno`,
            });
            break;
          }

          // Verificar si el codigo ha expirado
          const isExpired =
            config.pairing_expires_at &&
            new Date() > new Date(config.pairing_expires_at);

          await sock.sendMessage(remoteJid, {
            text:
              `🔗 *Código de Vinculación - SubBot*\n\n` +
              `🤖 **SubBot:** ${subbot.nombre}\n` +
              `📱 **Número:** ${subbot.numero}\n` +
              `🔄 **Estado:** ${subbot.estado}\n\n` +
              `🔢 **Código de Vinculación:**\n\`${pairingCode}\`\n\n` +
              `📅 **Generado:** ${pairingGeneratedAt || "No disponible"}\n` +
              `${isExpired ? "❌ **Estado:** Expirado" : "✅ **Estado:** Válido"}\n\n` +
              `📋 **Instrucciones:**\n` +
              `1. Abre WhatsApp en ${subbot.numero}\n` +
              `2. Ve a Dispositivos vinculados\n` +
              `3. Vincular con código de teléfono\n` +
              `4. Ingresa: \`${pairingCode}\`\n\n` +
              `💡 **Comandos útiles:**\n` +
              ` \`/connectbot ${botId} code\` - Nuevo codigo\n` +
              ` \`/connectbot ${botId}\` - Generar QR\n\n` +
              `📅 ${new Date().toLocaleString("es-ES")}`,
          });
        } catch (error) {
          logger.error("Error obteniendo pairing code:", error);
          await sock.sendMessage(remoteJid, {
            text: `🔗 *Código de Vinculación*\n\n❌ Error obteniendo código\n\n💡 Intenta nuevamente más tarde`,
          });
        }
        break;

      // Duplicado legacy: usar handler centralizado de /qr (arriba)
      case "/qr_legacy":
        if (!isOwner) {
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Solo el owner puede generar códigos QR de subbots",
          });
          break;
        }

        try {
          await sock.sendMessage(remoteJid, {
            text:
              "⏳ *Generando SubBot con QR*\n\n" +
              "🤖 Creando nuevo SubBot...\n" +
              "? Generando codigo QR...\n\n" +
              "📸 El QR aparecerá en unos segundos",
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
                    `📱 *SubBot QR Generado*\n\n` +
                    `🆔 **Código:** ${event.subbot.code}\n` +
                    `📱 **Tipo:** QR Code\n` +
                    `⏰ **Válido por:** 60 segundos\n\n` +
                    `📋 **Instrucciones:**\n` +
                    `1. Abre WhatsApp en tu teléfono\n` +
                    `2. Ve a Dispositivos vinculados\n` +
                    `3. Escanea este codigo QR\n` +
                    `4. El subbot se conectar automaticamente\n\n` +
                    `🙋 Solicitado por: @${usuario}\n` +
                    `📅 ${new Date().toLocaleString("es-ES")}`,
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
                  `✅ *SubBot Conectado Exitosamente*\n\n` +
                  `🆔 **Código:** ${event.subbot.code}\n` +
                  `✅ **Estado:** Conectado\n` +
                  `🎉 **Listo para usar!**\n\n` +
                  `💡 Usa \`/bots\` para ver todos los subbots activos`,
              });
            }
          };

          const handleError = async (event) => {
            await sock.sendMessage(remoteJid, {
              text:
                `❌ *Error en SubBot*\n\n` +
                `🆔 **Código:** ${event.subbot.code}\n` +
                `❌ **Error:** ${event.data.message}\n\n` +
                `💡 Intenta nuevamente con \`/qr\``,
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
              text: `⚠️ *Error creando SubBot*\n\n${result.error}\n\n🔁 Intenta nuevamente`,
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
            text: "⚠️ Solo el owner puede ver subbots activos",
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
              text: `🤖 *SubBots Activos*\n\n📊 **Total:** 0 subbots\n\n📝 **Crear SubBot:**\n \`/addbot [nombre] [número]\`\n\n💡 **Ejemplo:**\n \`/addbot "Bot Asistente" 5491234567890\`\n\n📅 ${new Date().toLocaleString("es-ES")}`,
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

          let statusText = `🤖 *SubBots Activos*\n\n`;
          statusText += `📊 **Resumen:**\n`;
          statusText += ` 🟢 Conectados: ${conectados}\n`;
          statusText += ` 🔴 Desconectados: ${desconectados}\n`;
          statusText += ` 🟡 Conectando: ${conectando}\n`;
          statusText += ` ⚠️ Con errores: ${errores}\n`;
          statusText += ` 📦 **Total:** ${subbots.length} subbots\n\n`;

          statusText += `📋 **Lista detallada:**\n\n`;

          subbots.forEach((bot, index) => {
            const statusEmoji =
              bot.estado === "conectado"
                ? "🟢"
                : bot.estado === "conectando"
                  ? "🟡"
                  : bot.estado === "error"
                    ? "🔴"
                    : "⚪";

            const lastActivity = new Date(bot.ultima_actividad).toLocaleString(
              "es-ES",
            );

            statusText += `**${index + 1}. ${bot.nombre}**\n`;
            statusText += `🆔 ID: ${bot.id} | 📱 ${bot.numero}\n`;
            statusText += `${statusEmoji} ${bot.estado.toUpperCase()}\n`;
            statusText += `🕒 ${lastActivity}\n\n`;
          });

          statusText += `⚙️ **Comandos rápidos:**\n`;
          statusText += ` \`/connectbot [id]\` - Conectar\n`;
          statusText += ` \`/connectbot [id] code\` - Pairing code\n`;
          statusText += ` \`/subbotqr [id]\` - QR real\n`;
          statusText += ` \`/disconnectbot [id]\` - Desconectar\n`;
          statusText += ` \`/botinfo [id]\` - Info detallada\n\n`;
          statusText += `📅 ${new Date().toLocaleString("es-ES")}`;

          await sock.sendMessage(remoteJid, { text: statusText });
        } catch (error) {
          logger.error("Error obteniendo subbots activos:", error);
          await sock.sendMessage(remoteJid, {
            text: `⚠️ *SubBots Activos*\n\n❌ Error obteniendo información\n\n🔁 Intenta nuevamente más tarde`,
          });
        }
        break;

      case "/restartbot":
        if (!isOwner) {
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Solo el owner puede reiniciar subbots",
          });
          break;
        }

        if (!args[0]) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Uso: /restartbot [id]\nEjemplo: /restartbot 1",
          });
          break;
        }

        try {
          const botId = parseInt(args[0]);

          // Verificar si el subbot existe
          const subbot = await db("subbots").where({ id: botId }).first();
          if (!subbot) {
            await sock.sendMessage(remoteJid, {
              text: `⚠️ *Reiniciar SubBot*\n\n❌ No existe un subbot con ID: ${botId}\n\n📋 Usa \`/bots\` para ver la lista`,
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
            text: `🔄 *Reiniciando SubBot*\n\n🤖 **SubBot:** ${subbot.nombre}\n📱 **Número:** ${subbot.numero}\n📡 **Estado:** Reiniciando...\n\n⚙️ **Proceso:**\n1. Cerrando conexión actual\n2. Limpiando sesión\n3. Preparando nueva conexión\n\n⌛ Esto puede tomar unos segundos...\n\n👤 **Por:** ${usuario}\n📅 ${new Date().toLocaleString("es-ES")}`,
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
                text: `✅ *SubBot reiniciado*\n\n🤖 **${subbot.nombre}** reiniciado exitosamente\n📱 Número: ${subbot.numero}\n📡 Estado: Desconectado (listo para conectar)\n🧹 Sesión limpiada\n\n🧭 **Próximos pasos:**\n \`/connectbot ${botId}\` - Conectar con QR\n \`/connectbot ${botId} code\` - Conectar con KONMIBOT\n \`/subbotqr ${botId}\` - QR real de Baileys\n\n📅 ${new Date().toLocaleString("es-ES")}`,
              });
            } catch (restartError) {
              logger.error("Error en reinicio de subbot:", restartError);

              await db("subbots").where({ id: botId }).update({
                estado: "error",
                updated_at: new Date().toISOString(),
              });

              await sock.sendMessage(remoteJid, {
                text: `⚠️ *Error reiniciando SubBot*\n\n🤖 SubBot: ${subbot.nombre}\n⚠️ Estado: Error\n\n🔁 Intenta nuevamente o usa \`/delbot ${botId}\` para eliminarlo y crear uno nuevo`,
              });
            }
          }, 5000); // 5 segundos de simulacion
        } catch (error) {
          logger.error("Error reiniciando subbot:", error);
          await sock.sendMessage(remoteJid, {
            text: `⚠️ *Reiniciar SubBot*\n\n❌ Error en el proceso de reinicio\n\n🔁 Intenta nuevamente más tarde`,
          });
        }
        break;

      case "/update":
      case "/reload":
        if (!isOwner) {
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Solo el owner puede actualizar el bot",
          });
          break;
        }

        try {
          await sock.sendMessage(remoteJid, {
            text: `🔄 *Actualizando bot...*\n\n⚙️ **Proceso:**\n1. Recargando configuraciones\n2. Actualizando comandos\n3. Limpiando caché\n4. Aplicando cambios\n\n⌛ Esto puede tomar unos segundos...`,
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
                text: `✅ *Bot actualizado*\n\n🛠️ **Cambios aplicados:**\n Configuraciones recargadas\n Comandos actualizados\n Caché limpiada\n Memoria optimizada\n\n📊 **Estado actual:**\n  🧠 Memoria: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB\n  ⏱️ Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m\n  🧩 Versión: v2.5.0\n  📶 Estado: Operativo\n\n🙋 **Actualizado por:** ${usuario}\n📅 ${new Date().toLocaleString("es-ES")}`,
              });

              logger.info(`? Bot actualizado por owner: ${usuario}`);
            } catch (updateError) {
              logger.error("Error en actualizacion:", updateError);
              await sock.sendMessage(remoteJid, {
                text: `⚠️ *Error en actualización*\n\n❌ Error: ${updateError.message}\n\n✅ El bot sigue funcionando normalmente`,
              });
            }
          }, 3000); // 3 segundos de simulacion
        } catch (error) {
          logger.error("Error iniciando actualizacion:", error);
          await sock.sendMessage(remoteJid, {
            text: `⚠️ *Actualizar bot*\n\n❌ Error iniciando actualización\n\n🔁 Intenta nuevamente más tarde`,
          });
        }
        break;

      case "/bratvd":
        const bratvdText = args.join(" ");
        if (!bratvdText) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Uso: /bratvd [texto]\nEjemplo: /bratvd Hola mundo",
          });
        } else {
          try {
            await sock.sendMessage(remoteJid, {
              text: "🎨 Generando sticker animado BRAT... ⏳",
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
                caption: `🎨 *BRAT VD - Sticker Animado*\n\n📝 **Texto:** "${bratvdText}"\n🎭 **Estilo:** BRAT Animado\n🖼️ **Formato:** WebP Animado\n\n🙋 Solicitado por: ${usuario}\n📅 ${new Date().toLocaleString("es-ES")}`,
              });
            } else {
              await sock.sendMessage(remoteJid, {
                text: `⚠️ *BRAT VD*\n\n❌ No se pudo generar el sticker animado: "${bratvdText}"\n\n🔁 Intenta con texto más corto o diferente.`,
              });
            }
          } catch (error) {
            logger.error("Error generando BRATVD:", error);
            await sock.sendMessage(remoteJid, {
              text: `⚠️ *BRAT VD*\n\n❌ Error generando sticker animado.\n\n🔁 Intenta nuevamente más tarde.`,
            });
          }
        }
        break;

      case "/brat":
        const bratText = args.join(" ");
        if (!bratText) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Uso: /brat [texto]\nEjemplo: /brat Hola mundo",
          });
        } else {
          try {
            await sock.sendMessage(remoteJid, {
              text: "🎨 Generando sticker BRAT... ⏳",
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
                text: `🎨 *BRAT - Sticker*\n\n📝 **Texto:** "${bratText}"\n🎭 **Estilo:** BRAT\n🖼️ **Formato:** WebP\n\n🙋 Solicitado por: ${usuario}\n📅 ${new Date().toLocaleString("es-ES")}`,
              });
            } else {
              await sock.sendMessage(remoteJid, {
                text: `⚠️ *BRAT*\n\n❌ No se pudo generar el sticker: "${bratText}"\n\n🔁 Intenta con texto más corto o diferente.`,
              });
            }
          } catch (error) {
            logger.error("Error generando BRAT:", error);
            await sock.sendMessage(remoteJid, {
              text: `⚠️ *BRAT*\n\n❌ Error generando sticker.\n\n🔁 Intenta nuevamente más tarde.`,
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
            text: "🎤 **TTS - Voces de Personajes:**\n\n📌 `/tts [texto]|[personaje]`\n\n**Ejemplos:**\n `/tts Hola mundo` (narrador)\n `/tts Hola mundo|mario` (Mario Bros)\n `/tts Hello there|vader` (Darth Vader)\n `/tts Qué paísa|bart` (Bart Simpson)\n\n🎭 **Personajes disponibles:**\n `narrator` - Narrador (defecto)\n `mario` - Mario Bros\n `luigi` - Luigi\n `vader` - Darth Vader\n `yoda` - Maestro Yoda\n `homer` - Homer Simpson\n `bart` - Bart Simpson\n `marge` - Marge Simpson\n `spongebob` - Bob Esponja\n `patrick` - Patricio Estrella\n `squidward` - Calamardo\n `mickey` - Mickey Mouse\n `donald` - Pato Donald\n `goofy` - Goofy\n `shrek` - Shrek\n `batman` - Batman\n `joker` - Joker\n `pikachu` - Pikachu\n `sonic` - Sonic\n `optimus` - Optimus Prime",
          });
        } else {
          try {
            await sock.sendMessage(remoteJid, {
              text: `🎤 Generando audio con voz de ${ttsCharacter}... ⏳`,
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
                caption: `🎤 *TTS - Personaje*\n\n📝 **Texto:** "${ttsText}"\n🎭 **Personaje:** ${ttsCharacter.toUpperCase()}\n⏱️ **Duración:** ${data.data.duration || "N/A"}\n🎚️ **Calidad:** ${data.data.quality || "HD"}\n\n🙋 Solicitado por: ${usuario}\n📅 ${new Date().toLocaleString("es-ES")}`,
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
                    caption: `🎤 *TTS - Voz Normal*\n\n📝 **Texto:** "${ttsText}"\nℹ️ **Nota:** Personaje "${ttsCharacter}" no disponible\n🎙️ **Voz:** Narrador estándar\n\n🙋 Solicitado por: ${usuario}\n📅 ${new Date().toLocaleString("es-ES")}`,
                  });
                } else {
                  await sock.sendMessage(remoteJid, {
                    text: `⚠️ *TTS*\n\n❌ No se pudo generar el audio: "${ttsText}"\n\nℹ️ Personaje "${ttsCharacter}" no disponible.\n🔁 Intenta con otro personaje o usa el narrador por defecto.`,
                  });
                }
              } catch (fallbackError) {
                await sock.sendMessage(remoteJid, {
                  text: `⚠️ *TTS*\n\n❌ No se pudo generar el audio: "${ttsText}"\n\nℹ️ Personaje "${ttsCharacter}" no disponible y el servicio TTS está temporalmente fuera de línea.`,
                });
              }
            }
          } catch (error) {
            logger.error("Error generando TTS con personaje:", error);
            await sock.sendMessage(remoteJid, {
              text: `⚠️ *TTS*\n\n❌ Error generando audio con personaje.\n\n🔁 Intenta nuevamente más tarde o usa otro personaje.`,
            });
          }
        }
        break;

      case "/play":
        const playQuery = args.join(" ");
        if (!playQuery) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Uso: /play [canción]\nEjemplo: /play Despacito Luis Fonsi",
          });
        } else {
          try {
            await sock.sendMessage(remoteJid, {
              text: "🎵 Buscando música... ⏳",
            });

            // Buscar msica con API
            const response = await fetchWithTimeout(
              `https://api.vreden.my.id/api/spotify/search?query=${encodeURIComponent(playQuery)}`,
              {},
              12000,
            );
            const data = await parseJsonSafe(response);

            if (data.status && data.data && data.data.length > 0) {
              const track = data.data[0];
              const requesterLabel = usuario || "Usuario";

              const initialText = renderPlayProgressMessage(
                track,
                requesterLabel,
                0,
                "Preparando descarga...",
              );

              let progressKey = null;
              try {
                const sent = await sock.sendMessage(remoteJid, { text: initialText });
                progressKey = sent?.key || null;
              } catch (progressError) {
                logger.warn("No se pudo enviar mensaje inicial de progreso en /play", {
                  error: progressError?.message,
                });
              }

              let updateQueue = Promise.resolve();
              const queueUpdate = (percent, status) => {
                const text = renderPlayProgressMessage(
                  track,
                  requesterLabel,
                  percent,
                  status,
                );
              const send = () =>
                  progressKey
                    ? sock.sendMessage(remoteJid, { text }, { edit: progressKey })
                    : sock.sendMessage(remoteJid, { text });
                updateQueue = updateQueue.then(() =>
                  send().catch((err) => {
                    logger.warn("No se pudo actualizar progreso de /play", {
                      error: err?.message,
                    });
                    progressKey = null;
                  }),
                );
              };

              queueUpdate(5, "Conectando con el servidor de audio...");

              let audioBuffer = null;
              if (track.preview_url) {
                let lastPercent = 0;
                let notifiedUnknown = false;
                try {
                  audioBuffer = await downloadBufferWithProgress(track.preview_url, {
                    timeoutMs: 20000,
                    onProgress: ({ percent }) => {
                      if (Number.isFinite(percent)) {
                        const rounded = Math.max(0, Math.min(100, Math.round(percent)));
                        if (rounded - lastPercent >= 4 || rounded >= 99) {
                          lastPercent = rounded;
                          queueUpdate(rounded, describePlayProgress(rounded));
                        }
                      } else if (!notifiedUnknown) {
                        notifiedUnknown = true;
                        queueUpdate(null, "Descargando la vista previa...");
                      }
                    },
                  });
                } catch (downloadError) {
                  logger.error("Error descargando vista previa de /play:", downloadError);
                  queueUpdate(lastPercent, "No se pudo completar la descarga.");
                  await updateQueue;
                  throw downloadError;
                }

                queueUpdate(100, "¡Descarga finalizada!");
                await updateQueue;

                try {
                  const fileName = `${(track.title || "preview")
                    .replace(/[^A-Za-z0-9_\- ]/g, "_")
                    .slice(0, 40)}.mp3`;
                  await sock.sendMessage(remoteJid, {
                    audio: audioBuffer,
                    mimetype: "audio/mpeg",
                    ptt: false,
                    fileName,
                    caption: `🎵 *${track.title || "Vista previa"}*\n\n🎤 ${
                      track.artist || "Artista desconocido"
                    }\n💿 ${track.album || "Álbum no disponible"}\n⏱️ ${
                      track.duration || "--:--"
                    }\n\n🙋 Solicitado por: ${requesterLabel}\n📅 ${new Date().toLocaleString(
                      "es-ES",
                    )}`,
                  });
                } catch (audioError) {
                  logger.error("Error enviando audio en /play:", audioError);
                  await sock.sendMessage(remoteJid, {
                    text: `⚠️ *Play*\n\n❌ Error enviando el audio.\n\n🎧 Escucha en Spotify:\n${
                      track.url
                    }`,
                  });
                }
              } else {
                queueUpdate(null, "No hay vista previa disponible, compartiendo enlace.");
                await updateQueue;
                await sock.sendMessage(remoteJid, {
                  text: `🎵 *Música encontrada*\n\nℹ️ Información disponible\n\n🎶 ${
                    track.title || "Sin título"
                  }\n🎤 ${track.artist || "Artista desconocido"}\n💿 ${
                    track.album || "Álbum no disponible"
                  }\n⏱️ ${track.duration || "--:--"}\n🔗 ${track.url}\n\n⚠️ La canción no ofrece vista previa de audio.`,
                });
              }
            } else {
              await sock.sendMessage(remoteJid, {
                text: `⚠️ *Play*\n\n❌ No se encontraron resultados para: "${playQuery}"\n\n🔁 Intenta con otros términos de búsqueda.`,
              });
            }
          } catch (error) {
            logger.error("Error en play:", error);
            await sock.sendMessage(remoteJid, {
              text: `⚠️ *Play*\n\n❌ Error buscando música: "${playQuery}"\n\n🔁 Intenta nuevamente en unos momentos.`,
            });
          }
        }
        break;

      case "/short":
      case "/acortar":
        const urlToShorten = args.join(" ");
        if (!urlToShorten) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Uso: /short [URL]\nEjemplo: /short https://www.google.com",
          });
        } else {
          try {
            await sock.sendMessage(remoteJid, {
              text: "🔗 Acortando URL... ⏳",
            });

            // Usar API de Vreden para acortar URLs
            const response = await fetch(
              `https://api.vreden.my.id/api/shorturl?url=${encodeURIComponent(urlToShorten)}`,
            );
            const data = await response.json();

            if (data.status && data.data && data.data.shortUrl) {
              await sock.sendMessage(remoteJid, {
                text:
                  `🔗 *URL acortada*\n\n` +
                  `🔍 **URL original:**\n${urlToShorten}\n\n` +
                  `✂️ **URL acortada:**\n${data.data.shortUrl}\n\n` +
                  `📉 **Ahorro:** ${(((urlToShorten.length - data.data.shortUrl.length) / urlToShorten.length) * 100).toFixed(1)}%\n\n` +
                  `🙋 Solicitado por: ${usuario}\n` +
                  `📅 ${new Date().toLocaleString("es-ES")}`,
              });
            } else {
              await sock.sendMessage(remoteJid, {
                text: `⚠️ *Acortador de URLs*\n\n❌ No se pudo acortar la URL: "${urlToShorten}"\n\nℹ️ Verifica que la URL sea válida y comience con http:// o https://`,
              });
            }
          } catch (error) {
            logger.error("Error acortando URL:", error);
            await sock.sendMessage(remoteJid, {
              text: `⚠️ *Acortador de URLs*\n\n❌ Error acortando URL.\n\n🔁 Intenta nuevamente más tarde.`,
            });
          }
        }
        break;

      // Comandos adicionales que faltaban
      case "/ping":
        await sock.sendMessage(remoteJid, {
          text: `🏓 Pong! Bot funcionando correctamente.\n\n🙋 Solicitado por: @${usuario}\n📅 ${new Date().toLocaleString("es-ES")}`,
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
            `📊 *Estado completo del bot*\n\n` +
            `🤖 *KONMI BOT v2.5.0*\n` +
            `📱 Conexión WhatsApp: ${connectionStatus}\n` +
            `🌐 Estado global: ${globalStatus ? "✅ Activo" : "⛔ Desactivado"}\n` +
            `👥 Estado en grupo: ${isGroup ? (groupStatus ? "✅ Activo" : "⛔ Desactivado") : "N/A"}\n\n` +
            `🛠️ *Sistema:*\n` +
            `⏱️ Tiempo activo: ${uptimeFormatted}\n` +
            `🧠 Memoria usada: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB\n` +
            `🧠 Memoria total: ${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB\n` +
            `🟢 Node.js: ${process.version}\n\n` +
            `📈 *Actividad:*\n` +
            `📥 Total aportes: ${totalAportes?.count || 0}\n` +
            `📦 Total pedidos: ${totalPedidos?.count || 0}\n` +
            `🗃️ Caché nombres: ${nameCache.size}\n` +
            `🗃️ Caché grupos: ${groupNameCache.size}\n\n` +
            `👑 Owner: 595974154768 (Melodia)\n` +
            `⚙️ Engine: WhiskeySockets/Baileys\n` +
            `${globalStatus ? "✅ Funcionando correctamente" : "🔧 Modo mantenimiento"}\n\n` +
            `📝 Solicitado por: @${usuario}\n` +
            `📅 ${new Date().toLocaleString("es-ES")}`;

          await sock.sendMessage(remoteJid, {
            text: statusInfo,
            mentions: [usuario + "@s.whatsapp.net"],
          });
        } catch (error) {
          logger.error("Error obteniendo status:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error obteniendo estado del sistema",
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
            `🤖 *Información Completa del Bot*\n\n` +
            `🆔 *Identificación:*\n` +
            `📱 Nombre: KONMI BOT\n` +
            `🔢 Versión: v2.5.0\n` +
            `⚙️ Engine: WhiskeySockets/Baileys\n` +
            `👤 Owner: 595974154768 (Melodía)\n\n` +
            `💻 *Sistema:*\n` +
            `🖥️ Plataforma: ${process.platform}\n` +
            `⚡ Node.js: ${process.version}\n` +
            `🔧 Arquitectura: ${process.arch}\n` +
            `💾 Memoria: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB\n` +
            `⏱️ Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m\n\n` +
            `📊 *Estadísticas:*\n` +
            `📚 Aportes registrados: ${totalAportes?.count || 0}\n` +
            `📖 Manhwas en BD: ${totalManhwas?.count || 0}\n` +
            `👥 Nombres en cache: ${nameCache.size}\n` +
            `🏷️ Grupos en cache: ${groupNameCache.size}\n\n` +
            `🔄 *Estado:*\n` +
            `🌐 Global: ${globalStatus ? "✅ Activo" : "⛔ Desactivado"}\n` +
            `📡 Conexión: ${connectionStatus}\n` +
            `⚙️ Estado: ${globalStatus ? "Operativo" : "Mantenimiento"}\n\n` +
            `📝 Solicitado por: @${usuario}\n` +
            `📅 Fecha: ${new Date().toLocaleDateString("es-ES")}\n` +
            `⏰ Hora: ${new Date().toLocaleTimeString("es-ES")}`;

          await sock.sendMessage(remoteJid, {
            text: botInfo,
            mentions: [usuario + "@s.whatsapp.net"],
          });
        } catch (error) {
          logger.error("Error obteniendo info:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error obteniendo información del sistema",
          });
        }
        break;

      case "/owner":
        // Forzar verificacion de owner con debug
        const ownerCheck = isSpecificOwner(usuario);

        const ownerInfo =
          `👑 *Información del Owner*\n\n` +
          `📱 **Número:** 595974154768\n` +
          `👤 **Nombre:** Melodía\n` +
          `🔑 **Permisos:** Administrador Total\n` +
          `? **Capacidades:** Control completo del bot\n` +
          `🌐 **Alcance:** Global en todos los grupos\n\n` +
          `🔍 **Verificación de Usuario:**\n` +
          `📱 Tu número: ${usuario}\n` +
          `🎯 Estado: ${ownerCheck ? "✅ OWNER VERIFICADO" : "👤 Usuario regular"}\n` +
          `🔐 Permisos: ${isOwner ? "✅ Acceso total" : "⚠️ Acceso limitado"}\n\n` +
          `📝 Solicitado por: @${usuario}\n` +
          `📅 ${new Date().toLocaleString("es-ES")}`;

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
          `🔧 *Debug Owner Check*\n\n` +
          `📱 Usuario recibido: ${usuario}\n` +
          `📱 Número esperado: 595974154768\n` +
          `? Funcion isSpecificOwner: ${debugOwner ? "SI" : "NO"}\n` +
          `? Funcion isSuperAdmin: ${superAdminCheck ? "SI" : "NO"}\n` +
          `🔍 Variable isOwner: ${isOwner ? "Sí" : "NO"}\n\n` +
          `⚠️ Si eres el owner (595974154768) y aparece NO, hay un problema de detección.`;

        await sock.sendMessage(remoteJid, { text: debugInfo });
        break;

      default:
        await sock.sendMessage(remoteJid, {
          text: "ℹ️ Comando no reconocido. Usa /help para ver comandos disponibles.",
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
          text: "⚠️ Error enviando respuesta. Intenta nuevamente.",
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
  // Cargar Baileys dinámicamente (permite forks)
  const ok = await loadBaileys();
  if (!ok) {
    connectionStatus = "error";
    throw new Error(
      "Baileys no está disponible. Instala la dependencia o tu fork y reinicia.",
    );
  }
  
  // Guardar authPath para reconexiones
  if (authPath) {
    savedAuthPath = authPath;
  }

  // Usar el authPath guardado si no se proporciona uno nuevo
  const effectiveAuthPath = authPath || savedAuthPath;

  if (!effectiveAuthPath) {
    throw new Error("No se proporcionó authPath para la conexión");
  }

  logger.pretty.banner("KONMI BOT v2.5.0", "🤖");
  logger.pretty.section("Sistema de autenticación interactivo", "🔐");

  try {
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
            "creds.json corrupto, respaldado y se regenerará limpio",
            { backup },
          );
        }
      }
    } catch (_) {}

    const { state, saveCreds } = await useMultiFileAuthState(effectiveAuthPath);
    // Cargar preferencia de método persistida (si existe)
    try {
      const cfgPath = path.join(path.resolve(effectiveAuthPath), 'auth-method.json');
      if (fs.existsSync(cfgPath)) {
        try {
          const raw = fs.readFileSync(cfgPath, 'utf8');
          const cfg = JSON.parse(raw || '{}');
          if (!userSelectedMethod && (cfg.method === 'qr' || cfg.method === 'pairing')) {
            userSelectedMethod = cfg.method;
          }
          if (!userSelectedPhone && typeof cfg.phoneNumber === 'string' && cfg.phoneNumber.replace(/\D/g, '')) {
            userSelectedPhone = cfg.phoneNumber.replace(/\D/g, '');
          }
        } catch (_) {}
      }
    } catch (_) {}
    // Inicializar archivo de credenciales desde el inicio
    try {
      await saveCreds();
    } catch (_) {}

    // Si no hay método definido y no hay sesión, preguntar interactivamente
    // SOLO preguntar si no hay método guardado de una sesión anterior
    if (
      !usePairingCode &&
      !phoneNumber &&
      !(state?.creds?.registered || state?.creds?.me?.id) &&
      !userSelectedMethod
    ) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const authConfig = await new Promise((resolve) => {
        logger.pretty.banner("Método de autenticación", "🔐");
        logger.pretty.line("Opciones disponibles:");
        logger.pretty.line("1) QR Code - Escanear código QR en terminal");
        logger.pretty.line("2) Pairing Code - Código de 8 dígitos");

        rl.question(" Seleccione método (1 o 2): ", (answer) => {
          const choice = answer.trim();

          if (choice === "1") {
            logger.pretty.line("QR Code seleccionado");
            logger.pretty.line("El código QR aparecer en la terminal");
            rl.close();
            resolve({ method: "qr" });
          } else if (choice === "2") {
            rl.question(
              "\n Ingrese nmero de telfono con cdigo de pas (ej: 595974154768): ",
              (phone) => {
                const cleanedNumber = sanitizePhoneNumberInput(phone);

                if (cleanedNumber) {
                  logger.pretty.line("Pairing Code seleccionado");
                  logger.pretty.kv("Número", `+${cleanedNumber}`);
                  logger.pretty.line(
                    "El código de 8 dígitos aparecerá en la terminal",
                  );
                  rl.close();
                  resolve({ method: "pairing", phoneNumber: cleanedNumber });
                } else {
                  logger.pretty.line(
                    "⚠️ Número inválido, usando QR por defecto",
                  );
                  rl.close();
                  resolve({ method: "qr" });
                }
              },
            );
          } else {
            logger.pretty.line("⚠️ Opción inválida, usando QR por defecto");
            rl.close();
            resolve({ method: "qr" });
          }
        });
      });

      // Guardar la selección del usuario para reconexiones
      userSelectedMethod = authConfig.method;
      if (authConfig.phoneNumber) {
        userSelectedPhone = authConfig.phoneNumber;
      }
      // Persistir preferencia a disco para evitar prompts tras reinicios
      try {
        const cfgPath = path.join(path.resolve(effectiveAuthPath), 'auth-method.json');
        const data = JSON.stringify({ method: userSelectedMethod, phoneNumber: userSelectedPhone || null }, null, 2);
        fs.writeFileSync(cfgPath, data, 'utf8');
      } catch (_) {}

      if (authConfig.method === "pairing") {
        usePairingCode = true;
        phoneNumber = authConfig.phoneNumber;
      }
    } else if (userSelectedMethod && !usePairingCode && !phoneNumber) {
      // Usar el mtodo guardado en reconexiones
      logger.pretty.line(
        `Usando método guardado: ${userSelectedMethod === "qr" ? "QR Code" : "Pairing Code"}`,
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
        `🔧 [PAIRING DEBUG] Número recibido: ${phoneNumber || "(null)"} | Destino: ${pairingTargetNumber || "(null)"} | Normalizado: ${onlyDigits}`,
      );
      if (!onlyDigits || onlyDigits.length < 7 || onlyDigits.length > 15) {
        logger.pretty.line(
          "⚠️ [PAIRING DEBUG] Número inválido para pairing (se requieren 7-15 dígitos).",
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
          "Credenciales ya registradas, no se forzará pairing en esta reconexión.",
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
      logger.pretty.kv("Versión WhatsApp Web soportada", version.join("."));
    } catch (e) {
      // Fallback (en caso de error de red o cambios de API)
      version = [2, 3000, 1015901307];
      logger.warn(
        "No se pudo obtener la versión más reciente de Baileys, usando fallback.",
      );
    }

    // Configuración de dispositivo (browser) por entorno
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
        "No se pudo aplicar configuración de dispositivo, usando predeterminado",
        { error: e?.message },
      );
      deviceLabel = "dispositivo predeterminado";
    }

    sock = makeWASocket(socketOptions);
    global.sock = sock; // Asignar socket a global para que handleMessage pueda accederlo

    // Helper: esperar a que las claves de autenticación estén listas
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
        // Si el socket registra sesión por primera vez, persistir método si no existía
        try {
          const cfgPath = path.join(path.resolve(effectiveAuthPath), 'auth-method.json');
          if (userSelectedMethod && !fs.existsSync(cfgPath)) {
            const data = JSON.stringify({ method: userSelectedMethod, phoneNumber: userSelectedPhone || null }, null, 2);
            fs.writeFileSync(cfgPath, data, 'utf8');
          }
        } catch (_) {}
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
          logger.pretty.line(`🔧 [PAIRING DEBUG] keysReady=${keysReady}`);
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
                  `🔧 [PAIRING DEBUG] requestPairingCode(${target}, ${customCandidate}) intento ${attempt}/${maxAttempts} (custom)`,
                );
                try {
                  pairingCode = await sock.requestPairingCode(
                    target,
                    customCandidate,
                  );
                } catch (e) {
                  logger.error(
                    `🔧 [PAIRING DEBUG] custom code falló: ${e.message}, intentando sin custom...`,
                  );
                }
              }
              if (!pairingCode) {
                logger.pretty.line(
                  `🔧 [PAIRING DEBUG] requestPairingCode(${target}) intento ${attempt}/${maxAttempts}`,
                );
                pairingCode = await sock.requestPairingCode(target);
              }
              break;
            } catch (e) {
              logger.error(
                `🔧 [PAIRING DEBUG] intento ${attempt} falló: ${e.message}`,
              );
              if (attempt < maxAttempts) {
                await new Promise((r) => setTimeout(r, 1500));
              }
            }
          }
          if (!pairingCode) {
            logger.pretty.line(
              "⚠️ No se pudo obtener pairing code tras reintentos",
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

          logger.pretty.banner("Código de emparejamiento", "🔗");
          logger.pretty.kv("Número", `+${effectivePairingNumber}`);
          logger.pretty.kv(
            "Código",
            `${formattedCode}  (sin guiones: ${plainCode})`,
          );
          logger.pretty.kv("Aparecerá como", deviceLabel);
          logger.pretty.kv("Válido por", "10 minutos");
          logger.pretty.section("Instrucciones", "📋");
          logger.pretty.line("1) Abre WhatsApp en tu teléfono");
          logger.pretty.line("2) Ve a Configuración > Dispositivos vinculados");
          logger.pretty.line('3) Toca "Vincular con número de teléfono"');
          logger.pretty.line(`4) Ingresa este código: ${formattedCode}`);
          logger.pretty.line(
            "⏳ Esperando que ingreses el código en WhatsApp...",
          );
        } catch (pairingError) {
          logger.error("Error generando código de pairing:", {
            message: pairingError.message,
            stack: pairingError.stack,
          });
          logger.pretty.line(
            "🔎 Verifica que el número esté registrado en WhatsApp y tengas conexión a internet.",
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
          console.log("  1️⃣  Abre WhatsApp en tu teléfono");
          console.log("  2️⃣  Ve a Configuración > Dispositivos vinculados");
          console.log('  3️⃣  Toca "Vincular un dispositivo"');
          console.log("  4️⃣  Escanea este código QR\n");
          console.log(" Esperando que escanees el código QR...");
          console.log("\n");
        } catch (error) {
          logger.error("Error generando QR:", error);
        }
      }

      if (connection === "open") {
        connectionStatus = "connected";
        currentPairingCode = null;

        // Mostrar información de conexión exitosa
        logger.pretty.banner("Conectado exitosamente", "✅");
        logger.pretty.kv("ID del bot", sock.user.id);
        logger.pretty.kv(
          "Nombre",
          sock.user.name || sock.user.verifiedName || "KONMI-BOT",
        );
        logger.pretty.kv(
          "Método usado",
          usePairingCode ? "Pairing Code" : "QR Code",
        );
        if (usePairingCode && effectivePairingNumber) {
          logger.pretty.kv("Número vinculado", `+${effectivePairingNumber}`);
        }
        logger.pretty.line("✅ El bot está listo para usarse en WhatsApp");

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
            logger.info(`Número del bot configurado como owner: +${botNumber}`);
          } else {
            logger.warn(
              "No se pudo obtener el número del bot para configurarlo como owner",
            );
          }
        } catch (error) {
          logger.error("Error configurando número del bot como owner:", error);
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

        logger.pretty.banner("Conexión cerrada", "⚠️");
        logger.pretty.kv("Código de estado", statusCode ?? "n/a");
        logger.pretty.kv("Motivo", errorMsg);
        logger.pretty.kv("¿Debería reconectar?", shouldReconnect);

        // Reconectar salvo errores de autenticación; forzar reconexión si es 'restart required'
        if (
          (shouldReconnect &&
            statusCode !== 401 &&
            statusCode !== 403 &&
            statusCode !== 405 &&
            statusCode !== 428) ||
          statusCode === restartRequiredCode
        ) {
          logger.pretty.line("🔄 Reconectando en 5 segundos...");
          setTimeout(
            () => connectToWhatsApp(savedAuthPath, usePairingCode, phoneNumber),
            5000,
          );
        } else {
          logger.pretty.line("⛔ No se reconectará automáticamente.");
          logger.pretty.line(
            `🔒 Error de autenticación detectado (código ${statusCode})`,
          );
          logger.pretty.line(
            '🧹 Ejecuta "node force-clean.js" y luego "npm start" para empezar de nuevo.',
          );
          logger.warn(
            `Conexión cerrada. Código: ${statusCode ?? "n/a"} - Motivo: ${errorMsg}. No se reconectará.`,
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

          // FILTRO INTELIGENTE fromMe:
          // - Si fromMe = true, verificar si es un COMANDO del owner
          // - Si es comando del owner, PERMITIR (para que el owner pueda usar el bot)
          // - Si NO es comando, IGNORAR (son respuestas del bot)
          if (message.key.fromMe) {
            const txt = (
              message.message?.conversation ||
              message.message?.extendedTextMessage?.text ||
              ""
            ).trim();
            const isCommand = txt.startsWith("/") || txt.startsWith("!") || txt.startsWith(".");
            
            // Solo permitir si es un comando
            if (!isCommand) {
              continue; // Ignorar respuestas del bot
            }
            // Si es comando, continuar procesando (el owner puede usar comandos)
          }

          // NOTA: El bot principal y los subbots trabajan INDEPENDIENTEMENTE
          // Cada uno tiene su propia configuración de grupos activos
          // NO hay interferencia entre ellos

          const msgId = message.key?.id;
          if (msgId && processedMessageIds.has(msgId)) continue;
          if (msgId) processedMessageIds.add(msgId);

          try {
            // Pasar el socket actual para que handleMessage lo use
            await handleMessage(message, sock);
          } catch (handleError) {
            // Forzar output directo a consola sin filtros
            console.error("\n========================================");
            console.error("❌ ERROR CAPTURADO EN HANDLEMESSAGE:");
            console.error("========================================");
            console.error("Tipo de error:", handleError?.constructor?.name || "Unknown");
            console.error("Mensaje:", handleError?.message || "Sin mensaje");
            console.error("Stack completo:");
            console.error(handleError?.stack || "Sin stack trace");
            console.error("\nError objeto completo:");
            console.error(JSON.stringify(handleError, Object.getOwnPropertyNames(handleError), 2));
            console.error("========================================\n");

            // También intentar con logger
            try {
              logger.error({
                error: "Error en handleMessage (bot principal)",
                message: handleError?.message || "Sin mensaje",
                stack: handleError?.stack || "Sin stack",
                type: handleError?.constructor?.name || "Unknown"
              });
            } catch (logErr) {
              console.error("Error al usar logger:", logErr);
            }
          }
        }
      } catch (error) {
        logger.error("Error procesando mensajes:", error.message);
        logger.error("Stack trace:", error.stack);
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
    logger.info(`📱 Número configurado para pairing: +${normalized}`);
  } else {
    pairingTargetNumber = null;
  }

  authMethod = method;
  logger.info(`🔐 Método de autenticación establecido: ${method}`);
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

// Función para verificar la conexión a la base de datos
async function checkDatabaseConnection() {
  try {
    await db.raw("SELECT 1");
    return true;
  } catch (error) {
    logger.error("Error de conexión a la base de datos:", error);
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
