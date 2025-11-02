import './config.js';
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
import { downloadWithSpotdl, isSpotdlAvailable } from "./utils/spotdl-wrapper.js";
import { downloadWithYtDlp } from "./utils/ytdlp-wrapper.js";
import { DEFAULT_EXTERNAL_TIMEOUT_MS, fetchWithTimeout, parseJsonSafe } from "./utils/net.js";
import { SPINNER_FRAMES, SPINNER_INTERVAL_MS, EDIT_COOLDOWN_MS, PROGRESS_LOW_OVERHEAD, buildProgressBar, sleep, describePlayProgress, downloadBufferWithProgress } from "./utils/progress.js";
import { renderPlayProgressMessage, safeFileNameFromTitle, createProgressMessenger, sendMediaWithProgress, fetchPreviewThumbnail } from "./utils/media-send.js";
import { join } from "path";
import { promises as fsp } from "fs";
import os from "os";
import { acquireMediaPermit } from "./utils/concurrency.js";
import {
  generateSubbotPairingCode,
  generateSubbotQR,
  getSubbotStatus as getRuntimeStatus,
  getAllSubbots as getAllSubbotsFromLib,
} from "./lib/subbots.js";
// Importaciones de handler.js movidas a importación dinámica para evitar ciclos
// Las funciones se importarán cuando se necesiten

// Comandos de sistema y configuración


// Comandos de descarga con fallback automático

// utilidades de red movidas a utils/net.js

// Generadores de imagen/QR movidos a comandos/images.js

// Progreso y descarga movidos a utils/progress.js

// renderPlayProgressMessage movida a utils/media-send.js

// safeFileNameFromTitle movida a utils/media-send.js

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

// Computa portada (thumbnail) a partir de URL de YouTube
function computeYouTubeCover(u) {
  try {
    const urlObj = new URL(u);
    let vid = urlObj.searchParams.get('v');
    if (!vid && /youtu\.be$/i.test(urlObj.hostname)) {
      const p = urlObj.pathname.split('/').filter(Boolean);
      if (p[0]) vid = p[0];
    }
    if (!vid) {
      const m = u.match(/(?:v=|\/)([0-9A-Za-z_-]{11})(?:[?&]|$)/);
      vid = m ? m[1] : null;
    }
    return vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : null;
  } catch (_) { return null; }
}

function renderGenericProgressMessage({ title, percent, statusText, details = [], spinner }) {
  const safePercent = Number.isFinite(percent)
    ? Math.max(0, Math.min(100, Math.round(percent)))
    : null;
  const progressLine = safePercent !== null
    ? `📊 ${(spinner || '').trim()} ${buildProgressBar(safePercent)} ${safePercent}%`.replace(/^📊\s\s/, '📊 ')
    : "⏳ Calculando progreso...";
  const statusLine = statusText ? `\n${statusText}` : "";
  const info = details.filter(Boolean);
  const infoBlock = info.length ? `\n\n${info.join("\n")}` : "";
  return `${title}\n\n${progressLine}${statusLine}${infoBlock}`;
}

function ensureMentionJid(usuario) {
  if (!usuario) return null;
  const id = String(usuario).includes('@') ? String(usuario).split('@')[0] : String(usuario);
  return `${id}@s.whatsapp.net`;
}

// createProgressMessenger movida a utils/media-send.js

// Unificador local: descarga con spotdl o yt-dlp y envía (audio/video) con barra
async function downloadAndSendLocal({
  sock,
  remoteJid,
  input,
  kind = 'audio', // 'audio' | 'video'
  usuario,
  context = '/media',
  preferSpotdl = false,
  quoted,
}) {
  const isUrl = /^(https?:\/\/)/i.test(input);
  // Blindaje: no aceptar playlist/álbum/canales cuando se espera un único video
  try {
    if (isUrl) {
      const lower = String(input).toLowerCase();
      const isYtPlaylistOnly = (/youtube\.com\/(playlist|channel|@|user)\//.test(lower) || (/\blist=/.test(lower) && !/\bv=/.test(lower))) && !/\/watch\?/.test(lower);
      if (kind === 'video' && isYtPlaylistOnly) {
        await sock.sendMessage(remoteJid, { text: '⚠️ Sólo se aceptan videos individuales. No se admiten playlist/canales. Envía un enlace de video o escribe el nombre.' }, { quoted });
        return false;
      }
    }
  } catch {}
   /(youtube\.com|youtu\.be)/i.test(input);
  const isAudio = String(kind) === 'audio';
  // ===== Metadatos estáticos (no se editan) =====
  let metaTitle = null;
  let metaArtist = null;
  let metaDuration = null;
  let metaViews = null; // YouTube views
  let metaPopularity = null; // Spotify popularity (0-100)
  let coverUrl = null;

  try {
    const apis = await import('./utils/api-providers.js');
    if (isAudio && (preferSpotdl)) {
      // Intentar metadatos desde Spotify si hay texto
      if (!isUrl && typeof apis.searchSpotify === 'function') {
        try {
          const sp = await apis.searchSpotify(input);
          if (sp?.success) {
            metaTitle = sp.title || metaTitle;
            metaArtist = sp.artists || metaArtist;
            coverUrl = sp.cover_url || coverUrl;
            if (sp.duration_ms) {
              const m = Math.floor(sp.duration_ms / 60000);
              const s = String(Math.floor((sp.duration_ms % 60000) / 1000)).padStart(2, '0');
              metaDuration = `${m}:${s}`;
            }
            if (typeof sp.popularity === 'number') metaPopularity = sp.popularity;
          }
        } catch {}
      }
    }
    // Metadatos YouTube para texto o URL
    if (!metaTitle) {
      try {
        const yt = await apis.searchYouTubeMusic(isUrl ? input : input);
        if (yt?.success && yt.results?.length) {
          const top = yt.results[0];
          metaTitle = top.title || metaTitle;
          metaArtist = top.author || metaArtist;
          metaDuration = top.duration || metaDuration;
          metaViews = top.views || metaViews;
          if (!isUrl) {
            // Usar el URL resuelto para descarga
            input = top.url || input;
          }
          coverUrl = top.thumbnail || coverUrl || computeYouTubeCover(top.url || '');
        }
      } catch {}
    }
  } catch {}

  if (!coverUrl && isYouTube) coverUrl = computeYouTubeCover(input);

  const metricsLine = isSpotify
    ? (typeof metaPopularity === 'number'
        ? `🎧 Reproducciones (Spotify): ~${metaPopularity}%`
        : `🎧 Reproducciones (Spotify): N/A`)
    : (metaViews != null
        ? `👁️ Vistas: ${Number(metaViews).toLocaleString('es-ES')}`
        : null);

  const staticLines = [
    isAudio ? '🎧 Música' : '🎬 Video',
    '',
    `📌 Título: ${metaTitle || 'N/A'}`,
    `👤 Artista/Canal: ${metaArtist || 'N/A'}`,
    `⏱️ Duración: ${metaDuration || 'N/A'}`,
    metricsLine,
    `📡 Fuente: ${isUrl ? (isSpotify ? 'Spotify 🎧' : isYouTube ? 'YouTube ▶️' : 'Enlace') : 'Búsqueda'}`,
    isUrl ? `🔗 URL: ${input}` : null,
    `🙋 Solicitado por: @${String(usuario).split('@')[0]}`,
  ].filter(Boolean);

  // Intentar obtener bytes de la portada para mayor persistencia en ediciones
  let coverThumb = null;
  if (coverUrl) {
    try {
      const resp = await fetchWithTimeout(coverUrl, {}, 8000);
      const ab = await resp.arrayBuffer();
      if (ab && ab.byteLength && ab.byteLength <= 800_000) {
        coverThumb = Buffer.from(ab);
      }
    } catch {}
  }

  const initialPayload = {
    contextLabel: context,
    // Sin portada al inicio para evitar glitches al editar
    initialMessageExtra: undefined,
  };

  let spinnerIndex = 0;
  let currentPercent = 0;
  let targetPercent = 0;
  const smoothStep = () => {
    if (!Number.isFinite(targetPercent)) return;
    if (currentPercent < targetPercent) {
      const delta = targetPercent - currentPercent;
      currentPercent += delta >= 10 ? 3 : 1; // acelera cuando falta mucho, suaviza al final
      if (currentPercent > targetPercent) currentPercent = targetPercent;
    }
  }
  const render = (p) => {
    const percent = Number.isFinite(p) ? Math.max(0, Math.min(100, Math.round(p))) : 0;
    const spinner = SPINNER_FRAMES[spinnerIndex];
    return [...staticLines, '', `📊 ${spinner} ${buildProgressBar(percent)} ${percent}%`].join('\n');
  };

  const progress = createProgressMessenger(
    sock,
    remoteJid,
    render(0),
    initialPayload,
  );

  let filePath = null;
  let spinnerTimer = null;
  let finished = false;
  // Concurrency control: allow multiple downloads but cap total active
  let releaseLimiter = null;
  try {
    releaseLimiter = await acquireMediaPermit(remoteJid);
    // Throttle de progreso (más suave, cada ~3% o 10% si PROGRESS_LOW_OVERHEAD)
    let last = 0;
    const onProgress = ({ percent }) => {
      if (finished) return;
      const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
      targetPercent = p;
      const step = PROGRESS_LOW_OVERHEAD ? 10 : 3;
      if (p - last >= step || p >= 99) { last = p; progress.queueUpdate(render(p)); }
    };
    if (!PROGRESS_LOW_OVERHEAD) {
      spinnerTimer = setInterval(() => {
        try {
          if (finished) return;
          spinnerIndex = (spinnerIndex + 1) % SPINNER_FRAMES.length;
          smoothStep();
          progress.queueUpdate(render(currentPercent));
        } catch {}
      }, SPINNER_INTERVAL_MS);
    }

    // Configurar almacenamiento temporal para no llenar disco
    const TMP_ROOT = path.join(os.tmpdir(), 'konmi-bot-media');
    const useTemp = String(process.env.MEDIA_TEMP_MODE || 'true').toLowerCase() !== 'false';
    const tempDirs = [];
    const makeTempOutDir = (tag) => {
      const dir = path.join(TMP_ROOT, `${tag}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`);
      try { fs.mkdirSync(dir, { recursive: true }); } catch {}
      tempDirs.push(dir);
      return dir;
    };
    const isUnderTmp = (p) => {
      try { const rp = path.resolve(p); const rr = path.resolve(TMP_ROOT); return rp === rr || rp.startsWith(rr + path.sep); } catch { return false }
    };

    if (isAudio && (preferSpotdl || isSpotify)) {
      const outDir = useTemp ? makeTempOutDir('spotdl') : join(__dirname, 'storage', 'downloads', 'spotdl');
      try {
        const dl = await downloadWithSpotdl({ queryOrUrl: input, outDir, onProgress });
        filePath = dl.filePath;
        // Validar tamaño > 20KB
        try {
          const st = fs.statSync(filePath);
          if (!st.isFile() || st.size < 20 * 1024) throw new Error('spotdl small file');
        } catch (_) {
          throw new Error('spotdl invalid output');
        }
      } catch (e) {
        // Fallback a YouTube si SpotDL falla (salvo que se fuerce solo SpotDL)
        const spotdlOnly = String(process.env.MEDIA_SPOTDL_ONLY || '').toLowerCase() === 'true';
        if (spotdlOnly) throw e;
        const yOut = useTemp ? makeTempOutDir('ytdlp') : join(__dirname, 'storage', 'downloads', 'ytdlp');
        const urlOrSearch = isUrl ? input : `ytsearch1:${input}`;
        const dl2 = await downloadWithYtDlp({ url: urlOrSearch, outDir: yOut, audioOnly: true, onProgress });
        filePath = dl2.filePath;
      }
    } else {
      const outDir = useTemp ? makeTempOutDir('ytdlp') : join(__dirname, 'storage', 'downloads', 'ytdlp');
      // Usar URL resuelta (target) si la búsqueda devolvió un enlace válido; si no, fallback a ytsearch1:input
      const urlOrSearch = isUrl
        ? input
        : ((target && target !== input && /^https?:\/\//i.test(target)) ? target : `ytsearch1:${input}`);
      const dl = await downloadWithYtDlp({ url: urlOrSearch, outDir, audioOnly: isAudio, onProgress });
      filePath = dl.filePath;
    }
  } catch (e) {
    logger.error('Descarga local falló:', e);
    progress.queueUpdate(render(null, '❌ No se pudo descargar.'));
    await progress.flush();
    try { finished = true; if (spinnerTimer) clearInterval(spinnerTimer); } catch {}
    try { progress.close?.(); } catch {}
    // Intentar limpiar directorios temporales creados
    try {
      const base = path.join(os.tmpdir(), 'konmi-bot-media');
      if (fs.existsSync(base)) {
        // Best-effort; no eliminar si no existe
      }
    } catch {}
    return false;
  } finally {
    try { if (releaseLimiter) releaseLimiter() } catch {}
  }

  // Enviar por ruta local
  try {
    const base = path.basename(filePath);
    const ext = (base.split('.').pop() || '').toLowerCase();
    // Suavizar transición hasta 100% antes de enviar
    try {
      targetPercent = 100;
      while (currentPercent < 100) {
        smoothStep();
        progress.queueUpdate(render(currentPercent));
        await sleep(Math.max(SPINNER_INTERVAL_MS, EDIT_COOLDOWN_MS));
      }
    } catch {}
    // Adjuntar la portada justo al final (mensaje ya estático)
    if (coverUrl) {
      const finalCtx = {
        externalAdReply: {
          title: metaTitle || (isAudio ? 'Música' : 'Video'),
          body: metaArtist || (isYouTube ? 'YouTube' : isSpotify ? 'Spotify' : ''),
          thumbnailUrl: coverUrl,
          thumbnail: coverThumb || undefined,
          mediaType: 1,
          previewType: 0,
          sourceUrl: (/^https?:\/\//i.test(input) ? input : undefined),
          showAdAttribution: false,
          renderLargerThumbnail: true,
        }
      };
      progress.queueUpdateWithContext(render(100), finalCtx);
    } else {
      progress.queueUpdate(render(100));
    }
    await progress.flush();

    const mentions = [ ensureMentionJid(usuario) ].filter(Boolean);
    // Leer a Buffer para evitar fallos de envío con rutas locales
    if (isAudio) {
      const mime = ext === 'mp3' ? 'audio/mpeg'
        : ext === 'm4a' ? 'audio/mp4'
        : (ext === 'ogg' || ext === 'opus') ? 'audio/ogg'
        : ext === 'wav' ? 'audio/wav'
        : ext === 'webm' ? 'audio/webm'
        : 'audio/mpeg';
      await sock.sendMessage(
        remoteJid,
        { audio: { url: filePath }, mimetype: mime, ptt: false, fileName: base, mentions },
        { quoted }
      );
    } else {
      const mime = ext === 'mp4' ? 'video/mp4'
        : ext === 'webm' ? 'video/webm'
        : 'video/mp4';
      await sock.sendMessage(
        remoteJid,
        { video: { url: filePath }, mimetype: mime, fileName: base, mentions },
        { quoted }
      );
    }
    try { finished = true; clearInterval(spinnerTimer); } catch {}
    // Limpiar archivo y carpeta temporal si corresponde
    try {
      const tmpRoot = path.join(os.tmpdir(), 'konmi-bot-media');
      const under = (() => { try { const rp = path.resolve(filePath); const rr = path.resolve(tmpRoot); return rp === rr || rp.startsWith(rr + path.sep); } catch { return false }})();
      if (under) {
        try { fs.unlinkSync(filePath); } catch {}
        try { const dir = path.dirname(filePath); fs.rmSync(dir, { recursive: true, force: true }); } catch {}
      }
    } catch {}
    try { progress.close?.(); } catch {}
    return true;
  } catch (sendErr) {
    logger.error('Envío de media falló:', sendErr);
    try {
      // Fallback documento
      const base = path.basename(filePath);
      await sock.sendMessage(remoteJid, { document: { url: filePath }, fileName: base, mimetype: isAudio ? 'audio/mpeg' : 'application/octet-stream' });
      // Cleanup temporal
      try {
        const tmpRoot = path.join(os.tmpdir(), 'konmi-bot-media');
        const under = (() => { try { const rp = path.resolve(filePath); const rr = path.resolve(tmpRoot); return rp === rr || rp.startsWith(rr + path.sep); } catch { return false }})();
        if (under) {
          try { fs.unlinkSync(filePath); } catch {}
          try { const dir = path.dirname(filePath); fs.rmSync(dir, { recursive: true, force: true }); } catch {}
        }
      } catch {}
      try { finished = true; if (spinnerTimer) clearInterval(spinnerTimer); } catch {}
      try { progress.close?.(); } catch {}
      return true;
    } catch (e2) {
      progress.queueUpdate(render(null, '❌ Error al enviar.'));
      await progress.flush();
      try { finished = true; if (spinnerTimer) clearInterval(spinnerTimer); } catch {}
      // Cleanup temporal si existe
      try {
        const tmpRoot = path.join(os.tmpdir(), 'konmi-bot-media');
        const under = (() => { try { const rp = path.resolve(filePath); const rr = path.resolve(tmpRoot); return rp === rr || rp.startsWith(rr + path.sep); } catch { return false }})();
        if (under) {
          try { fs.unlinkSync(filePath); } catch {}
          try { const dir = path.dirname(filePath); fs.rmSync(dir, { recursive: true, force: true }); } catch {}
        }
      } catch {}
      try { progress.close?.(); } catch {}
      return false;
    }
  }
}
// Flujo unificado para audio (/music y /play) con progreso editado y envío final
async function handleUnifiedAudioDownload({ sock, remoteJid, message, args, usuario, contextLabel = "/music" }) {
  const input = (args || []).join(" ").trim();
  if (!input) {
    await sock.sendMessage(remoteJid, { text: "ℹ️ Uso: /music [URL o nombre]\nEjemplos:\n/music https://youtu.be/dQw4w9WgXcQ\n/music despacito luis fonsi" });
    return;
  }

  const isUrl = /^(https?:\/\/)/i.test(input);
  let target = input;
  let metaTitle = null;
  let metaArtist = null;
  let metaDuration = null;
  let cover = null;

  let isSpotify = isUrl && /spotify\.com/i.test(target);
  let isYouTube = isUrl && /(youtube\.com|youtu\.be)/i.test(target);
  let source = isSpotify ? 'Spotify 🎧' : isYouTube ? 'YouTube ▶️' : (isUrl ? 'Genérico' : 'Búsqueda');

  // Rechazar playlists/álbumes/canales: sólo una pista o video
  if (isUrl) {
    const lower = target.toLowerCase();
    const isYtPlaylistOnly = (/youtube\.com\/(playlist|channel|@|user)\//.test(lower) || (/\blist=/.test(lower) && !/\bv=/.test(lower))) && !/\/watch\?/.test(lower);
    const isSpList = /open\.spotify\.com\/(playlist|album|show|episode)\//.test(lower);
    if (isYtPlaylistOnly || isSpList) {
      await sock.sendMessage(remoteJid, { text: '⚠️ Sólo se aceptan canciones/videos individuales.\nNo se admiten playlist/álbum/canales.\n\nSugerencia: envía un enlace de video o escribe el nombre.' }, { quoted: message });
      return;
    }
  }

  // Resolver búsqueda cuando es texto
  const localOnly = String(process.env.MEDIA_LOCAL_ONLY || 'false').toLowerCase() === 'true';

  if (!isUrl) {
    try {
      const { searchSpotify, searchYouTubeMusic } = await import('./utils/api-providers.js');
      const hasSpotdl = isSpotdlAvailable();
      if (hasSpotdl && !localOnly) {
        let sp = null; try { sp = await searchSpotify(input); } catch {}
        // Aceptar sólo tracks (no playlist/álbum)
        if (sp?.success && sp.url && /open\.spotify\.com\/track\//i.test(String(sp.url))) {
          target = sp.url; isSpotify = true; isYouTube = false; source = 'Spotify 🎧';
          metaTitle = sp.title || null; metaArtist = sp.artists || null; cover = sp.cover_url || null;
          if (sp.duration_ms) { const m = Math.floor(sp.duration_ms/60000); const s = String(Math.floor((sp.duration_ms%60000)/1000)).padStart(2,'0'); metaDuration = `${m}:${s}`; }
        }
      }
      if (!isSpotify) {
        const yt = await searchYouTubeMusic(input);
        if (yt?.success && yt.results?.length) {
          // Filtrar cualquier entrada que no sea video (por seguridad)
          const onlyVideos = yt.results.filter(r => r?.url && (/youtube\.com\/watch\?/.test(r.url) || /youtu\.be\//.test(r.url)));
          const top = onlyVideos[0] || yt.results[0];
          target = top.url; isYouTube = true; source = 'YouTube ▶️';
          metaTitle = metaTitle || top.title || null; metaArtist = metaArtist || top.author || null; metaDuration = top.duration || null;
          cover = top.thumbnail || computeYouTubeCover(top.url || '') || cover;
        }
      }
    } catch (e) {
      logger.warn('Fallo búsqueda /music', { error: e?.message });
    }
    if (!target || target === input) {
      const pm = createProgressMessenger(sock, remoteJid, '🎧 *Música*\n\n⏳ Preparando...', { contextLabel: `${contextLabel}:nores` });
      pm.queueUpdate('❌ No se encontraron resultados.');
      await pm.flush();
      return;
    }
  }

  // Completar cover si es URL directa
  if (!cover) {
    if (isYouTube) cover = computeYouTubeCover(target);
    // Si es Spotify y no hay cover, intentar obtener metadata rápida
    if (isSpotify && !cover && !localOnly) {
      try {
        const { searchSpotify } = await import('./utils/api-providers.js');
        const sp = await searchSpotify(target);
        cover = sp?.cover_url || null;
        metaTitle = metaTitle || sp?.title || null; metaArtist = metaArtist || sp?.artists || null;
        if (!metaDuration && sp?.duration_ms) { const m = Math.floor(sp.duration_ms/60000); const s = String(Math.floor((sp.duration_ms%60000)/1000)).padStart(2,'0'); metaDuration = `${m}:${s}`; }
      } catch {}
    }
  }

  const baseDetails = [
    `📡 Fuente: ${source}`,
    isUrl ? `🔗 URL: ${target}` : null,
    metaTitle ? `🎵 Título: ${metaTitle}` : null,
    metaArtist ? `👤 Artista: ${metaArtist}` : null,
    metaDuration ? `⏱️ Duración: ${metaDuration}` : null,
    `🙋 Solicitado por: @${usuario}`,
  ].filter(Boolean);

  const render = (p, statusText) =>
    renderGenericProgressMessage({
      title: '🎧 Música',
      percent: Number.isFinite(p) ? p : null,
      statusText: statusText || (Number.isFinite(p) ? 'Descargando audio...' : 'Preparando...'),
      details: baseDetails,
    });

  // Iniciar sin portada; la adjuntamos al final
  const initExtra = undefined;

  const progress = createProgressMessenger(
    sock,
    remoteJid,
    render(0, isUrl ? 'Inicializando...' : 'Buscando...'),
    { contextLabel: `${contextLabel}:flow`, initialMessageExtra: initExtra },
  );

  // Descarga local con spotdl / yt-dlp
  let filePath = null;
  try {
    if (isSpotify) {
      const outDir = join(__dirname, 'storage', 'downloads', 'spotdl');
      let lastP = 0;
      const onProgress = ({ percent }) => {
        const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
        if (p - lastP >= 3 || p >= 99) { lastP = p; progress.queueUpdate(render(p)); }
      };
      const dl = await downloadWithSpotdl({ queryOrUrl: target, outDir, onProgress });
      filePath = dl.filePath; progress.queueUpdate(render(100, 'Convirtiendo/etiquetando...'));
    } else if (/^https?:\/\//i.test(target)) {
      const outDir = join(__dirname, 'storage', 'downloads', 'ytdlp');
      let lastP = 0;
      const onProgress = ({ percent, speed, total }) => {
        const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
        if (p - lastP >= 3 || p >= 99) {
          lastP = p;
          const status = speed || total ? `Descargando...${speed ? ` (${speed}/s)` : ''}` : 'Descargando...';
          progress.queueUpdate(render(p, status));
        }
      };
      const dl = await downloadWithYtDlp({ url: target, outDir, audioOnly: true, onProgress });
      filePath = dl.filePath; progress.queueUpdate(render(100, 'Convirtiendo/etiquetando...'));
    } else {
      progress.queueUpdate(render(null, '❌ No se pudo resolver el destino de la descarga.'));
      await progress.flush();
      return;
    }
  } catch (e) {
    logger.error('Error descargando audio:', e);
    progress.queueUpdate(render(0, '❌ No se pudo descargar.')); await progress.flush();
    return;
  }

  try {
    const buf = await fsp.readFile(filePath);
    const base = path.basename(filePath);
    const ext = (base.split('.').pop() || '').toLowerCase();
    const fileName = safeFileNameFromTitle(metaTitle || base.replace(/\.[^.]+$/, ''), `.${ext}`);
    // Adjuntar portada al final y dejar estático
    try {
      if (cover) {
        const finalCtx = {
          externalAdReply: {
            title: metaTitle || 'Música',
            body: metaArtist || source,
            thumbnailUrl: cover,
            mediaType: 1,
            previewType: 0,
            sourceUrl: (isUrl ? target : undefined),
            showAdAttribution: false,
            renderLargerThumbnail: true,
          }
        };
        progress.queueUpdateWithContext(render(100), finalCtx);
      } else {
        progress.queueUpdate(render(100));
      }
    } catch {}
    await progress.flush();
    await sock.sendMessage(
      remoteJid,
      { audio: buf, mimetype: ext === 'mp3' ? 'audio/mpeg' : 'audio/mpeg', ptt: false, fileName, caption: `✅ Descarga completada\n\n🎵 ${metaTitle || base}\n👤 ${metaArtist || ''}` },
      { quoted: message },
    );
  } catch (sendErr) {
    logger.error('Error enviando audio:', sendErr);
    progress.queueUpdate(render(100, '❌ Error al enviar el archivo.'));
    await progress.flush();
  }
}

// sendMediaWithProgress movida a utils/media-send.js

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

import {
  emitAportesEvent,
  emitGruposEvent,
  emitPedidosEvent,
  emitNotificacionesEvent,
} from "./realtime.js";
// Import legacy handlers removidos: ahora se usa el registro modular de commands/*
// Compat: funciones de descarga usadas en trayectorias legacy
import {
  handleTikTokDownload,
  handleInstagramDownload,
  handleFacebookDownload,
  handleTwitterDownload,
} from "./commands/download-commands.js";

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

    // Mapear respuestas de botones/flows a comandos
    try {
      // Respuestas modernas (interactiveMessage / native flow)
      const nfr = message.message?.interactiveResponseMessage?.nativeFlowResponseMessage;
      if (nfr && (nfr.paramsJson || nfr.name)) {
        try {
          const params = nfr.paramsJson ? JSON.parse(nfr.paramsJson) : {};
          const n = (nfr.name || '').toLowerCase();
          if (n === 'quick_reply' && params.id) {
            const id = String(params.id);
            messageText = id.startsWith('/') ? id : `/${id}`;
          } else if (n === 'single_select' && (params.selectedId || params.id)) {
            const id = String(params.selectedId || params.id);
            messageText = id.startsWith('/') ? id : `/${id}`;
          } else if (n === 'cta_copy' && (params.copy_code || params.id)) {
            const code = params.copy_code || params.id;
            messageText = `/copy ${code}`;
          }
        } catch (_) {}
      }

      // Legacy buttons/list/template replies
      const selectedId =
        message.message?.templateButtonReplyMessage?.selectedId ||
        message.message?.buttonsResponseMessage?.selectedButtonId ||
        message.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        null;

      if (selectedId && selectedId.startsWith('help_category_')) {
        const category = selectedId.replace('help_category_', '');
        const { getCommandRegistry } = await import('./commands/registry/index.js');
        const registry = getCommandRegistry();
        const commands = [...registry.entries()]
          .filter(([_, meta]) => meta.category === category)
          .map(([cmd]) => cmd)
          .join('\n');

        await sock.sendMessage(remoteJid, {
          text: `*Comandos en la categoría: ${category}*\n\n${commands}`,
        });
        return;
      }

      if (selectedId) {
        if (String(selectedId).startsWith('copy:')) {
          const code = String(selectedId).slice(5);
          messageText = `/copy ${code}`;
        } else {
          const id = String(selectedId);
          messageText = id.startsWith('/') ? id : `/${id}`;
        }
      } else {
        const display =
          message.message?.templateButtonReplyMessage?.selectedDisplayText ||
          message.message?.buttonsResponseMessage?.selectedDisplayText ||
          null;
        if (display) {
          const d = String(display).toLowerCase();
          if (/ayuda|help/.test(d)) messageText = '/help';
          else if (/(generar|nuevo|new).*\bqr\b|\bqr\b/.test(d)) messageText = '/qr';
          else if (/(generar|nuevo|new).*\bcode\b|\bcódigo\b|\bcodigo\b|\bcode\b/.test(d)) messageText = '/code';
          else if (/mis\s+subbots|my\s+subbots|mis\s+bots|my\s+bots/.test(d)) messageText = '/mybots';
          else if (/subbots|bots/.test(d)) messageText = '/bots';
        }
      }
    } catch (_) {}

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

    // Normalizar y sanear comando
    const INVISIBLES = /[\u200B-\u200D\uFEFF\u2060\u00AD\u200E\u200F\u202A-\u202E\u061C\u180E\uFE0E\uFE0F]/g;
    const toAsciiSlash = (s) => String(s||'').replace(/[\uFF0F\u2044\u2215]/g, '/');
    let normalizedText = toAsciiSlash(messageText).replace(INVISIBLES, '').trim();
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
    let command = (parts[0] || '').toLowerCase();
    command = toAsciiSlash(command).replace(INVISIBLES, '');
    const baseCmd = command.replace(/^([\/!.])\s*/, '');
    if (baseCmd) command = '/' + baseCmd;
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

    // Router central de comandos (handler.js)
    try {
      const { routeCommand } = await import('./handler.js');
      const routed = await routeCommand({ sock, message, remoteJid, isGroup, usuario, command, args });
      if (routed && routed.handled === true) {
        return;
      }
    } catch (e) {
      try { logger.warn('Router de comandos falló', { error: e?.message }); } catch {}
      // Continuar con el procesamiento normal de comandos
    }

    // A partir de aquí, el registro modular gestiona los comandos.
    // Para evitar duplicidad y errores, salimos del manejo de comandos.
    return;

    // (Legacy) Procesar comandos específicos — eliminado; gestionado por registry
    switch (command) {
      // casos legacy removidos

      // Comandos de subbots
      // Comandos basicos
      // SUBBOTS (solo /qr y /code) - CASOS DUPLICADOS COMENTADOS
      // NOTA: Los casos /qr y /code ya están manejados arriba con verificación de owner
      /* case ".code":

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
// IA y clasificacion - CON FALLBACK
// Aportes - FUNCIONES REALES
// Pedidos - FUNCIONES REALES
// MANHWAS - IMPLEMENTACION FUNCIONAL
// SERIES - IMPLEMENTACION FUNCIONAL
// Extra e ilustraciones
// Administracion de grupos
// Comando /kick movido a la seccion de administracion mas abajo

      // Comandos /promote y /demote movidos a la seccion de administracion mas abajo

      case "/bot":
        break;
        if (args[0] === "on") {
          try {
            // Implementacion directa para bot on local
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

              // Activar en grupo específico
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
              } catch (error) {
                logger.error("Error al activar bot en grupo:", error);
                await sock.sendMessage(remoteJid, {
                  text: "❌ Ocurrió un error al activar el bot en el grupo. Por favor, inténtalo de nuevo."
                });
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
        break;

      // COMANDO DE DEBUG PARA ADMINISTRADORES
      // COMANDOS DE ADMINISTRACION - FUNCIONALIDAD REAL
      case "/kick":
        break;
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
        break;
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
            return;
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
        break;
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
            return;
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
        break;
        try {
          const resLock = await handleLock(usuario, remoteJid, isGroup);
          if (resLock?.message) {
            await sock.sendMessage(remoteJid, { text: resLock.message });
          } else if (resLock?.success === false && resLock?.message) {
            await sock.sendMessage(remoteJid, { text: resLock.message });
          }
        } catch (error) {
          logger.error("Error en /lock:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error bloqueando el grupo.",
          });
        }
        break;

      case "/unlock":
        break;
        try {
          const resUnlock = await handleUnlock(usuario, remoteJid, isGroup);
          if (resUnlock?.message) {
            await sock.sendMessage(remoteJid, { text: resUnlock.message });
          } else if (resUnlock?.success === false && resUnlock?.message) {
            await sock.sendMessage(remoteJid, { text: resUnlock.message });
          }
        } catch (error) {
          logger.error("Error en /unlock:", error);
          await sock.sendMessage(remoteJid, {
            text: "⚠️ Error desbloqueando el grupo.",
          });
        }
        break;

      case "/tag":
        break;
        if (!isGroup) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Este comando solo está disponible en grupos",
          });
          return;
        }

        try {
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
        break;

      // COMANDOS DE VOTACIONES - IMPLEMENTACION FUNCIONAL
      // COMANDOS DE SISTEMA - IMPLEMENTACION FUNCIONAL
      // Duplicado legacy: usar handler centralizado de /code (arriba)

      case "/code":
        break;
        try {
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

      // COMANDOS MULTIMEDIA CON FALLBACK AUTOMÁTICO
      case '/dl':
        break;
        try {
          // Unificar con helper que asegura 1 solo mensaje (ediciones), portada y barra
          await downloadAndSendLocal({ sock, remoteJid, input, kind: 'audio', usuario, context: '/dl', preferSpotdl: true, quoted: message });
        } catch (error) {
          logger.error('Error en /dl:', error);
          const pm = createProgressMessenger(sock, remoteJid, '🎶 Descarga\n\n⏳ Preparando...', { contextLabel: '/dl:error' });
          pm.queueUpdate('❌ Error durante la descarga.');
          await pm.flush();
        }
        break;

      case '/music':
        break;
        try {
          await downloadAndSendLocal({ sock, remoteJid, input, kind: 'audio', usuario, context: '/music', quoted: message });
        } catch (e) {
          logger.error("Error en /music:", e);
          const pm = createProgressMessenger(sock, remoteJid, '🎧 *Música*\\n\\n⏳ Preparando...', { contextLabel: '/music:error' });
          pm.queueUpdate('❌ Error en /music. Intenta nuevamente.');
          await pm.flush();
        }
        break;

      case '/musica':
        break;
        try {
          await downloadAndSendLocal({ sock, remoteJid, input: args.join(" ").trim(), kind: 'audio', usuario, context: '/musica', quoted: message });
        } catch (e) {
          logger.error("Error en /musica:", e);
          const pm = createProgressMessenger(sock, remoteJid, '🎧 *Música*\n\n⏳ Preparando...', { contextLabel: '/musica:error' });
          pm.queueUpdate('❌ Error en /musica. Intenta nuevamente.');
          await pm.flush();
        }
        break;
        /* LEGACY /music BLOCK
          const input = args.join(" ").trim();
          if (!input) {
            await sock.sendMessage(remoteJid, { text: "ℹ️ Uso: /music [URL o nombre]\nEjemplos:\n/music https://youtu.be/dQw4w9WgXcQ\n/music despacito luis fonsi" });
            break;
          }

          const isUrl = /^(https?:\/\/)/i.test(input);
          let target = input;
          let metaTitle = null;
          let metaArtist = null;
          let metaDuration = null;

          let isSpotify = isUrl && /spotify\.com/i.test(target);
          let isYouTube = isUrl && /(youtube\.com|youtu\.be)/i.test(target);
          let isSoundCloud = isUrl && /soundcloud\.com/i.test(target);
          let source = isSpotify ? 'Spotify 🎧' : isYouTube ? 'YouTube ▶️' : (isSoundCloud ? 'SoundCloud ☁️' : (isUrl ? 'Genérico' : 'Búsqueda'));

          const baseDetails = [
            `📡 Fuente: ${source}`,
            isUrl ? `🔗 URL: ${target}` : null,
            `🙋 Solicitado por: @${usuario}`,
          ].filter(Boolean);

          const render = (p, statusText) => {
            const lines = [...baseDetails];
            if (metaTitle) lines.splice(1, 0, `🎵 Título: ${metaTitle}`);
            if (metaArtist) lines.splice(2, 0, `👤 Artista: ${metaArtist}`);
            if (metaDuration) lines.push(`⏱️ Duración: ${metaDuration}`);
            return `🎧 *Música*\n\n${Number.isFinite(p) ? `📊 ${buildProgressBar(p)} ${Math.round(p)}%` : '⏳ Preparando...'}\n\n${lines.join("\n")}`;
          };

          const progress = createProgressMessenger(
            sock,
            remoteJid,
            render(0, isUrl ? 'Inicializando...' : 'Buscando...'),
            { contextLabel: "/music:flow" },
          );

          if (!isUrl) {
            try {
              const { searchSpotify, searchYouTubeMusic } = await import('./utils/api-providers.js');
              const hasSpotdl = isSpotdlAvailable();
              if (hasSpotdl) {
                let sp = null;
                try { sp = await searchSpotify(input); } catch {}
                if (sp?.success && sp.url) {
                  target = sp.url; isSpotify = true; isYouTube = false; isSoundCloud = false; source = 'Spotify 🎧';
                  metaTitle = sp.title || null; metaArtist = sp.artists || null;
                  if (sp.duration_ms) { const m = Math.floor(sp.duration_ms/60000); const s = String(Math.floor((sp.duration_ms%60000)/1000)).padStart(2,'0'); metaDuration = `${m}:${s}`; }
                }
              }
              if (!isSpotify) {
                const yt = await searchYouTubeMusic(input);
                if (yt?.success && yt.results?.length) {
                  const top = yt.results[0];
                  target = top.url; isYouTube = true; source = 'YouTube ▶️';
                  metaTitle = top.title || null; metaArtist = top.author || null; metaDuration = top.duration || null;
                }
              }
            } catch (e) { logger.warn('Fallo búsqueda /music', { error: e?.message }); }
            if (!target || target === input) {
              progress.queueUpdate(render(null, '❌ No se encontraron resultados.'));
              await progress.flush();
              break;
            }
          }

          let filePath = null;
          if (isSpotify) {
            const outDir = join(__dirname, 'storage', 'downloads', 'spotdl');
            let lastP = 0;
            const onProgress = ({ percent }) => {
              const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
              if (p - lastP >= 3 || p >= 99) { lastP = p; progress.queueUpdate(render(p, 'Descargando (spotdl)...')); }
            };
            try {
              const dl = await downloadWithSpotdl({ queryOrUrl: target, outDir, onProgress });
              filePath = dl.filePath; progress.queueUpdate(render(100, 'Etiquetando...'));
            } catch (e) {
              // Fallback a YouTube (yt-dlp) buscando por título/artista
              try {
                const { searchSpotify, searchYouTubeMusic } = await import('./utils/api-providers.js');
                let q = [metaTitle, metaArtist].filter(Boolean).join(' ');
                if (!q) {
                  try { const sp = await searchSpotify(target); if (sp?.success) { metaTitle = sp.title || metaTitle; metaArtist = sp.artists || metaArtist; if (sp.duration_ms){ const m=Math.floor(sp.duration_ms/60000); const s=String(Math.floor((sp.duration_ms%60000)/1000)).padStart(2,'0'); metaDuration=`${m}:${s}`; } q = [sp.title, sp.artists].filter(Boolean).join(' ');} } catch {}
                }
                if (!q) q = 'spotify track';
                progress.queueUpdate(render(10, 'Cambiando a YouTube (yt-dlp)...'));
                const yt = await searchYouTubeMusic(q);
                if (!yt?.success || !yt.results?.length) throw new Error('No hay resultados en YouTube');
                const top = yt.results[0];
                const out2 = join(__dirname, 'storage', 'downloads', 'ytdlp');
                let lastY=10; const onY = ({ percent }) => { const p=Math.max(0,Math.min(100,Math.round(percent||0))); if(p-lastY>=3||p>=99){ lastY=p; progress.queueUpdate(render(p, 'Descargando (yt-dlp)...')); } };
                const dl2 = await downloadWithYtDlp({ url: top.url, outDir: out2, audioOnly: true, onProgress: onY });
                filePath = dl2.filePath; source = 'YouTube ▶️';
                if (!metaTitle) { metaTitle = top.title || null; }
                if (!metaArtist) { metaArtist = top.author || null; }
                progress.queueUpdate(render(100, 'Convirtiendo/etiquetando...'));
              } catch {
                progress.queueUpdate(render(0, '❌ No se pudo descargar.'));
                await progress.flush();
                break;
              }
            }
          } else {
            const outDir = join(__dirname, 'storage', 'downloads', 'ytdlp');
            let lastP = 0;
            const onProgress = ({ percent, speed, total }) => {
              const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
              if (p - lastP >= 3 || p >= 99) { lastP = p; const status = speed || total ? `Descargando...${speed ? ` (${speed}/s)` : ''}` : 'Descargando...'; progress.queueUpdate(render(p, status)); }
            };
            try {
              const dl = await downloadWithYtDlp({ url: target, outDir, audioOnly: true, onProgress });
              filePath = dl.filePath; progress.queueUpdate(render(100, 'Convirtiendo/etiquetando...'));
            } catch (e) {
              progress.queueUpdate(render(0, '❌ No se pudo descargar.'));
              await progress.flush();
              break;
            }
          }

          try {
            const buf = await fsp.readFile(filePath);
            const base = path.basename(filePath);
            const ext = (base.split('.').pop() || '').toLowerCase();
            const fileName = safeFileNameFromTitle(metaTitle || base.replace(/\.[^.]+$/, ''), `.${ext}`);
            progress.queueUpdate(render(100, 'Listo. Enviando archivo...'));
            await progress.flush();
            await sock.sendMessage(
              remoteJid,
              { audio: buf, mimetype: ext === 'mp3' ? 'audio/mpeg' : 'audio/mpeg', ptt: false, fileName, caption: `✅ Descarga completada\n\n📡 ${source}\n🎵 ${metaTitle || base}\n👤 ${metaArtist || ''}` },
              { quoted: message },
            );
          } catch (sendErr) {
            logger.error('Error enviando audio en /music:', sendErr);
            progress.queueUpdate(render(100, '❌ Error al enviar el audio.'));
            await progress.flush();
          }
        } catch (error) {
          logger.error("Error en /music:", error);
          const pm = createProgressMessenger(sock, remoteJid, '🎧 *Música*\n\n⏳ Preparando...', { contextLabel: '/music:error' });
          pm.queueUpdate('❌ Error en /music. Intenta nuevamente.');
          await pm.flush();
        }
      */
}
          await downloadAndSendLocal({ sock, remoteJid, input, kind: 'audio', usuario, context: '/spotify', preferSpotdl: true, quoted: message });
          break;
        } catch (error) {
          logger.error("Error en /spotify:", error);
          const pm = createProgressMessenger(sock, remoteJid, '🎶 *Spotify*\\n\\n⏳ Preparando...', { contextLabel: '/spotify:error' });
          pm.queueUpdate('❌ Error en /spotify. Intenta nuevamente.');
          await pm.flush();
          break;
        }

        /* LEGACY SPOTIFY BLOCK
        try {
          const spotifyQuery = args.join(" ").trim();
          if (!spotifyQuery) {
            await sock.sendMessage(remoteJid, {
              text: "ℹ️ Uso: /spotify [canción]\nEjemplo: /spotify Shape of You",
            });
            break;
          }

          // Nuevo flujo unificado (acepta URL o texto) usando spotdl/yt-dlp
          try {
            let target = spotifyQuery;
            const isUrl = /^(https?:\/\/)/i.test(target);
            let metaTitle = null, metaArtist = null, metaDuration = null;
            let source = isUrl ? (/(spotify\.com)/i.test(target) ? 'Spotify 🎧' : 'Genérico') : 'Búsqueda';

            const render = (p) => {
              const details = [
                `📡 Fuente: ${source}`,
                isUrl ? `🔗 URL: ${target}` : null,
                metaTitle ? `🎵 Título: ${metaTitle}` : null,
                metaArtist ? `👤 Artista: ${metaArtist}` : null,
                metaDuration ? `⏱️ Duración: ${metaDuration}` : null,
                `🙋 Solicitado por: @${usuario}`,
              ].filter(Boolean);
              const line = Number.isFinite(p) ? `📊 ${buildProgressBar(p)} ${Math.round(p)}%` : '⏳ Preparando...';
              return `🎶 *Spotify*\n\n${line}\n\n${details.join("\n")}`;
            };

            const progress = createProgressMessenger(
              sock,
              remoteJid,
              render(0),
              { contextLabel: "/spotify:new" },
            );

            if (!isUrl) {
              try {
                const { searchSpotify, searchYouTubeMusic } = await import('./utils/api-providers.js');
                let sp = null; try { sp = await searchSpotify(spotifyQuery); } catch {}
                if (sp?.success) {
                  metaTitle = sp.title || null; metaArtist = sp.artists || null;
                  if (sp.duration_ms) { const m=Math.floor(sp.duration_ms/60000); const s=String(Math.floor((sp.duration_ms%60000)/1000)).padStart(2,'0'); metaDuration = `${m}:${s}`; }
                  if (sp.url) { target = sp.url; source = 'Spotify 🎧'; }
                }
                if (!/^https?:\/\//i.test(target)) {
                  const yt = await searchYouTubeMusic(spotifyQuery);
                  if (yt?.success && yt.results?.length) {
                    const top = yt.results[0]; target = top.url; source='YouTube ▶️'; metaTitle = metaTitle || top.title; metaArtist = metaArtist || top.author; metaDuration = metaDuration || top.duration;
                  }
                }
              } catch (e) { logger.warn('Fallo búsqueda /spotify (nuevo)', { error: e?.message }); }
              if (!/^https?:\/\//i.test(target)) { progress.queueUpdate(render(null, '❌ No se encontraron resultados.')); await progress.flush(); break; }
            }

            let filePath = null;
            if (/spotify\.com/i.test(target)) {
              const outDir = join(__dirname, 'storage', 'downloads', 'spotdl');
              let lastP = 0; const onProgress = ({ percent }) => { const p=Math.max(0,Math.min(100,Math.round(percent||0))); if(p-lastP>=10||p>=99){ lastP=p; progress.queueUpdate(render(p,'Descargando (spotdl)...')); } };
              try {
                const dl = await downloadWithSpotdl({ queryOrUrl: target, outDir, onProgress });
                filePath = dl.filePath; progress.queueUpdate(render(100,'Etiquetando...'));
              } catch (e) {
                // Fallback: buscar en YouTube y descargar con yt-dlp
                try {
                  const { searchSpotify, searchYouTubeMusic } = await import('./utils/api-providers.js');
                  let q = [metaTitle, metaArtist].filter(Boolean).join(' ');
                  if (!q) {
                    try { const sp = await searchSpotify(target); if (sp?.success) { metaTitle = sp.title || metaTitle; metaArtist = sp.artists || metaArtist; if (sp.duration_ms){ const m=Math.floor(sp.duration_ms/60000); const s=String(Math.floor((sp.duration_ms%60000)/1000)).padStart(2,'0'); metaDuration=`${m}:${s}`; } q = [sp.title, sp.artists].filter(Boolean).join(' ');} } catch {}
                  }
                  if (!q) q = 'spotify track';
                  progress.queueUpdate(render(10, 'Cambiando a YouTube (yt-dlp)...'));
                  const yt = await searchYouTubeMusic(q);
                  if (!yt?.success || !yt.results?.length) throw new Error('Sin resultados en YouTube');
                  const top = yt.results[0];
                  const out2 = join(__dirname, 'storage', 'downloads', 'ytdlp');
                  let lastY=10; const onY = ({ percent }) => { const p=Math.max(0,Math.min(100,Math.round(percent||0))); if(p-lastY>=3||p>=99){ lastY=p; progress.queueUpdate(render(p,'Descargando (yt-dlp)...')); } };
                  const dl2 = await downloadWithYtDlp({ url: top.url, outDir: out2, audioOnly: true, onProgress: onY });
                  filePath = dl2.filePath; source = 'YouTube ▶️';
                  if (!metaTitle) metaTitle = top.title || null;
                  if (!metaArtist) metaArtist = top.author || null;
                  progress.queueUpdate(render(100,'Convirtiendo/etiquetando...'));
                } catch (fallbackErr) {
                  progress.queueUpdate(render(0, '❌ No se pudo descargar.'));
                  await progress.flush();
                  break;
                }
              }
            } else {
              const outDir = join(__dirname, 'storage', 'downloads', 'ytdlp');
              let lastP = 0; const onProgress = ({ percent }) => { const p=Math.max(0,Math.min(100,Math.round(percent||0))); if(p-lastP>=3||p>=99){ lastP=p; progress.queueUpdate(render(p,'Descargando (yt-dlp)...')); } };
              const dl = await downloadWithYtDlp({ url: target, outDir, audioOnly: true, onProgress }); filePath = dl.filePath; progress.queueUpdate(render(100,'Convirtiendo/etiquetando...'));
            }

            const buf = await fsp.readFile(filePath);
            const base = path.basename(filePath); const ext=(base.split('.').pop()||'').toLowerCase();
            const fileName = safeFileNameFromTitle(metaTitle||base.replace(/\.[^.]+$/, ''), `.${ext}`);
            await progress.flush();
            await sock.sendMessage(remoteJid, { audio: buf, mimetype: ext==='mp3'?'audio/mpeg':'audio/mpeg', ptt:false, fileName, caption: `✅ Descarga completada\n\n📡 ${source}\n🎵 ${metaTitle||base}\n👤 ${metaArtist||''}` }, { quoted: message });
            break;
          } catch (e) {
            logger.error('Error en /spotify (nuevo flujo):', e);
            const pm = createProgressMessenger(sock, remoteJid, '🎶 *Spotify*\n\n⏳ Preparando...', { contextLabel: '/spotify:error' });
            pm.queueUpdate('❌ Error en /spotify. Intenta nuevamente.');
            await pm.flush();
          }
        } catch (error) {
          logger.error("Error en /spotify:", error);
          const pm = createProgressMessenger(sock, remoteJid, '🎶 *Spotify*\n\n⏳ Preparando...', { contextLabel: '/spotify:error2' });
          pm.queueUpdate('❌ Error en /spotify. Intenta nuevamente.');
          await pm.flush();
        }
        break;
      */
}
          // Unificar envío con helper (barra + envío por ruta local, mergeado a MP4)
          await downloadAndSendLocal({ sock, remoteJid, input, kind: 'video', usuario, context: '/video', quoted: message });
        } catch (error) {
          logger.error("Error en /video:", error);
          await sock.sendMessage(remoteJid, { text: "⚠️  Error al buscar/enviar video." });
        }
        break;
// COMANDOS DE REDES SOCIALES CON FALLBACK AUTOMÁTICO
}

          // Barra de progreso gestionará el avance; no enviar mensajes adicionales

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
            // Obtener portada si es posible (thumbnail)
            let tkThumb = undefined;
            try {
              const apis = await import('./utils/api-providers.js');
              const probe = await apis.downloadTikTok(tiktokUrl);
              if (probe?.success) tkThumb = probe.thumbnail || undefined;
            } catch {}
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
              preview: { title: result.info?.title || 'TikTok', body: result.info?.author || 'TikTok', thumbnailUrl: tkThumb },
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
}

          // Evitar mensajes extra: solo usar progreso

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
                preview: { title: result.info?.title || 'Instagram', body: result.info?.author || 'Instagram', thumbnailUrl: result.image || result.url },
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
                preview: { title: result.info?.title || 'Instagram', body: result.info?.author || 'Instagram', thumbnailUrl: result.image || undefined },
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
}

          // Evitar mensajes extra: solo usar progreso

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

            // Obtener portada si es posible (thumbnail)
            let fbThumb = undefined;
            try {
              const apis = await import('./utils/api-providers.js');
              const probe = await apis.downloadFacebook(fbUrl);
              if (probe?.success) fbThumb = probe.thumbnail || undefined;
            } catch {}
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
              preview: { title: result.info?.title || 'Facebook', body: result.info?.author || 'Facebook', thumbnailUrl: fbThumb },
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
}

          // Evitar mensajes extra: solo usar progreso

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
                preview: { title: result.info?.title || 'Twitter', body: result.info?.author ? '@'+result.info.author : 'Twitter', thumbnailUrl: result.image || undefined },
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
                preview: { title: result.info?.title || 'Twitter', body: result.info?.author ? '@'+result.info.author : 'Twitter', thumbnailUrl: result.image },
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
// COMANDOS DE ARCHIVOS - IMPLEMENTACIN FUNCIONAL
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
}
          await downloadAndSendLocal({ sock, remoteJid, input, kind: 'audio', usuario, context: '/play', quoted: message });
        } catch (e) {
          logger.error("Error en /play:", e);
        }
        break;
        /* LEGACY /play BLOCK REMOVED
        const playQuery = args.join(" ");
        if (!playQuery) {
          await sock.sendMessage(remoteJid, {
            text: "ℹ️ Uso: /play [canción]\nEjemplo: /play Despacito Luis Fonsi",
          });
        } else {
          // Aceptar tanto texto (nombre + artista) como URL directa
          const isUrl = /^(https?:\/\/)/i.test(playQuery);
          if (isUrl) {
            try {
              let target = playQuery;
              let metaTitle = null, metaArtist = null; let source = /(spotify\.com)/i.test(target) ? 'Spotify 🎧' : 'Enlace';
              const render = (p) => `🎧 *Música*\n\n${Number.isFinite(p)?`📊 ${buildProgressBar(p)} ${Math.round(p)}%`:'⏳ Preparando...'}\n\n📡 Fuente: ${source}\n🔗 URL: ${target}\n🙋 Solicitado por: @${usuario}`;
              const progress = createProgressMessenger(sock, remoteJid, render(0), { contextLabel: '/play:new' });
              let filePath = null;
              if (/spotify\.com/i.test(target)) {
                const outDir = join(__dirname, 'storage', 'downloads', 'spotdl');
                let lastP=0; const onProgress=({percent})=>{const p=Math.max(0,Math.min(100,Math.round(percent||0))); if(p-lastP>=3||p>=99){ lastP=p; progress.queueUpdate(render(p)); }};
                const dl = await downloadWithSpotdl({ queryOrUrl: target, outDir, onProgress }); filePath = dl.filePath; progress.queueUpdate(render(100));
              } else {
                const outDir = join(__dirname, 'storage', 'downloads', 'ytdlp');
                let lastP=0; const onProgress=({percent})=>{const p=Math.max(0,Math.min(100,Math.round(percent||0))); if(p-lastP>=3||p>=99){ lastP=p; progress.queueUpdate(render(p)); }};
                const dl = await downloadWithYtDlp({ url: target, outDir, audioOnly: true, onProgress }); filePath = dl.filePath; progress.queueUpdate(render(100));
              }
              const buf = await fsp.readFile(filePath); const base=path.basename(filePath); const ext=(base.split('.').pop()||'').toLowerCase();
              await progress.flush();
              await sock.sendMessage(remoteJid, { audio: buf, mimetype: ext==='mp3'?'audio/mpeg':'audio/mpeg', ptt:false, fileName: safeFileNameFromTitle(metaTitle||base.replace(/\.[^.]+$/, ''), `.${ext}`) }, { quoted: message });
              break;
            } catch (e) {
              logger.error('Error procesando URL en /play (nuevo):', e);
              // Si falla, sigue con flujo de búsqueda abajo
            }
          }
          try {
            await sock.sendMessage(remoteJid, {
              text: "🎵 Buscando música... ⏳",
            });

            // Búsqueda local con wrappers
            try {
              const { searchSpotify, searchYouTubeMusic } = await import('./utils/api-providers.js');
              let target = null; let metaTitle=null, metaArtist=null;
              let sp = null; try { sp = await searchSpotify(playQuery); } catch {}
              if (sp?.success && sp.url) { target = sp.url; metaTitle = sp.title || null; metaArtist = sp.artists || null; }
              if (!target) {
                const yt = await searchYouTubeMusic(playQuery);
                if (yt?.success && yt.results?.length) { const top = yt.results[0]; target = top.url; metaTitle = metaTitle||top.title; metaArtist = metaArtist||top.author; }
              }
              if (!target) { const pm = createProgressMessenger(sock, remoteJid, '🎧 *Música*\n\n⏳ Preparando...', { contextLabel: '/play:new:nores' }); pm.queueUpdate('❌ No se encontraron resultados.'); await pm.flush(); break; }

              const isSp = /spotify\.com/i.test(target);
              const render = (p) => `🎧 *Música*\n\n${Number.isFinite(p)?`📊 ${buildProgressBar(p)} ${Math.round(p)}%`:'⏳ Preparando...'}\n\n🎵 ${metaTitle||''}\n👤 ${metaArtist||''}\n🙋 Solicitado por: @${usuario}`;
              const progress = createProgressMessenger(sock, remoteJid, render(0), { contextLabel: '/play:new:search' });
              let filePath = null;
              if (isSp) {
                const outDir = join(__dirname, 'storage', 'downloads', 'spotdl');
                let lastP=0; const onProgress=({percent})=>{ const p=Math.max(0,Math.min(100,Math.round(percent||0))); if(p-lastP>=3||p>=99){ lastP=p; progress.queueUpdate(render(p)); } };
                const dl = await downloadWithSpotdl({ queryOrUrl: target, outDir, onProgress }); filePath = dl.filePath; progress.queueUpdate(render(100));
              } else {
                const outDir = join(__dirname, 'storage', 'downloads', 'ytdlp');
                let lastP=0; const onProgress=({percent})=>{ const p=Math.max(0,Math.min(100,Math.round(percent||0))); if(p-lastP>=3||p>=99){ lastP=p; progress.queueUpdate(render(p)); } };
                const dl = await downloadWithYtDlp({ url: target, outDir, audioOnly: true, onProgress }); filePath = dl.filePath; progress.queueUpdate(render(100));
              }
              const buf = await fsp.readFile(filePath); const base=path.basename(filePath); const ext=(base.split('.').pop()||'').toLowerCase();
              await progress.flush();
              await sock.sendMessage(remoteJid, { audio: buf, mimetype: ext==='mp3'?'audio/mpeg':'audio/mpeg', ptt:false, fileName: safeFileNameFromTitle(metaTitle||base.replace(/\.[^.]+$/, ''), `.${ext}`) }, { quoted: message });
              break;
            } catch (e) {
              logger.error("Error en play (nuevo flujo):", e);
              const pm = createProgressMessenger(sock, remoteJid, '🎧 *Música*\n\n⏳ Preparando...', { contextLabel: '/play:error' });
              pm.queueUpdate('❌ Error buscando música.');
              await pm.flush();
              break;
            }
          } catch (error) {
            logger.error("Error en play:", error);
            await sock.sendMessage(remoteJid, {
              text: `⚠️ *Play*\n\n❌ Error buscando música: "${playQuery}"\n\n🔁 Intenta nuevamente en unos momentos.`,
            });
          }
        }
        break;

*/
// Comandos adicionales que faltaban
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









