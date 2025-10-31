// Cargar variables de entorno lo antes posible
import config from "./config.js";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import {
  connectToWhatsApp,
  getAvailableGroups,
  getQRCode,
  getQRCodeImage,
  getConnectionStatus,
  getSocket,
} from "./whatsapp.js";
import { restoreActiveSubbots, syncAllRuntimeStates } from "./subbot-manager.js";
import apiRouter from "./api.js";
import {
  router as authRouter,
  authenticateToken,
  authorizeRoles,
} from "./auth.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import db from "./db.js";
import logger from "./config/logger.js";
import fs from "fs";
import { spawnSync } from "child_process";
import ffmpegStatic from "ffmpeg-static";
import fluentFfmpeg from "fluent-ffmpeg";

// Auto-detect and persist YouTube cookies file into backend/full/.env
function findCookiesFile() {
  try {
    // 1) If already set and exists, respect it
    const envHints = [
      process.env.YOUTUBE_COOKIES_FILE,
      process.env.YT_COOKIES_FILE,
    ].filter(Boolean);
    for (const hint of envHints) {
      try { if (hint && fs.existsSync(hint)) return hint; } catch {}
    }

    // 2) Common candidates
    const candidates = [];
    // Local project paths
    candidates.push(join(__dirname, 'all_cookies.txt'));
    candidates.push(join(__dirname, 'all_cookie.txt'));
    candidates.push(join(process.cwd(), 'backend', 'full', 'all_cookies.txt'));
    candidates.push(join(process.cwd(), 'backend', 'full', 'all_cookie.txt'));
    candidates.push(join(process.cwd(), 'all_cookies.txt'));
    candidates.push(join(process.cwd(), 'cookies.txt'));
    // Windows APPDATA
    try {
      const appData = process.env.APPDATA;
      if (appData) {
        candidates.push(join(appData, 'yt-dlp', 'cookies.txt'));
      }
    } catch {}
    // Linux/Mac typical config dir
    try {
      const home = process.env.HOME || process.env.USERPROFILE;
      if (home) {
        candidates.push(join(home, '.config', 'yt-dlp', 'cookies.txt'));
        candidates.push(join(home, '.config', 'yt-dlp', 'cookies'));
      }
    } catch {}

    for (const p of candidates) {
      try { if (p && fs.existsSync(p)) return p; } catch {}
    }
  } catch {}
  return null;
}

function looksLikeCookies(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const head = (data || '').split(/\r?\n/).slice(0, 5).join('\n');
    if (!head) return false;
    if (head.includes('\t')) return true; // Netscape format (TAB separated)
    if (/^[A-Za-z0-9_\-]+=.+/m.test(head)) return true; // name=value lines
  } catch {}
  return false;
}

function persistEnvVar(key, value) {
  try {
    const envPath = join(__dirname, '.env');
    let content = '';
    try { content = fs.readFileSync(envPath, 'utf8'); } catch {}
    const line = `${key}=${value}`;
    if (!content) {
      fs.writeFileSync(envPath, line + '\n', 'utf8');
      return true;
    }
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(content)) {
      content = content.replace(re, line);
    } else {
      content = content.trimEnd() + '\n' + line + '\n';
    }
    fs.writeFileSync(envPath, content, 'utf8');
    return true;
  } catch {
    return false;
  }
}

function ensureCookiesConfigured() {
  try {
    if (process.env.YOUTUBE_COOKIES_FILE || process.env.YT_COOKIES_FILE || process.env.YOUTUBE_COOKIES) {
      return; // already configured
    }
    const found = findCookiesFile();
    if (found && looksLikeCookies(found)) {
      process.env.YOUTUBE_COOKIES_FILE = found;
      process.env.YT_COOKIES_FILE = found;
      persistEnvVar('YOUTUBE_COOKIES_FILE', found);
      persistEnvVar('YT_COOKIES_FILE', found);
    }
  } catch {}
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = config.server.port;

app.use(cors(config.cors));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve storage media statically (uploads, media, downloads)
app.use("/media", express.static(join(__dirname, "storage")));

// Serve static files from frontend build in production
// Comentado: El frontend se sirve con Caddy
// if (process.env.NODE_ENV === 'production') {
//   const frontendDistPath = join(__dirname, '../../frontend-panel/dist');
//   app.use(express.static(frontendDistPath));
// }

// La autenticacin interactiva ahora est integrada en whatsapp.js
// No es necesario preguntar aqu, se preguntar automticamente al conectar

// Rutas de autenticacin
app.use("/api/auth", authRouter);

// Rutas principales de la API
app.use("/api", apiRouter);

// Endpoints de WhatsApp bajo /api
app.get(
  "/api/whatsapp/qr",
  authenticateToken,
  authorizeRoles("owner"),
  (_req, res) => {
    const qrImage = getQRCodeImage();
    const status = getConnectionStatus();

    if (qrImage) {
      const base64Data = qrImage.replace(/^data:image\/png;base64,/, "");
      return res.json({
        qr: base64Data,
        qrImage,
        status: "waiting_for_scan",
      });
    }

    res.json({ qr: null, qrImage: null, status });
  },
);

// ===== Arranque: diagnóstico de binarios externos (yt-dlp / ffmpeg) =====
function checkCommand(cmd, args = ["--version"], friendly = cmd) {
  try {
    const res = spawnSync(cmd, args, { encoding: "utf8", windowsHide: true });
    if (res.error) return { ok: false, error: res.error.message };
    if (res.status !== 0) return { ok: false, error: (res.stderr || `exit ${res.status}`) };
    return { ok: true, output: (res.stdout || "").trim() };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function diagnosticsExternalBinaries() {
  try {
    const ytdlpPath = process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)
      ? process.env.YTDLP_PATH
      : null;

    let ytdlp = { ok: false, how: "" };
    if (ytdlpPath) {
      const r = checkCommand(ytdlpPath, ["--version"], "yt-dlp");
      ytdlp = r.ok ? { ok: true, how: `bin:${ytdlpPath}`, version: r.output } : { ok: false, how: `bin:${ytdlpPath}`, error: r.error };
    }
    if (!ytdlp.ok) {
      let r = checkCommand("yt-dlp", ["--version"], "yt-dlp");
      if (r.ok) ytdlp = { ok: true, how: "yt-dlp", version: r.output };
      else {
        // Intentar python -m yt_dlp
        const pyCmds = process.platform === "win32" ? ["py", "python"] : ["python3", "python"];
        for (const py of pyCmds) {
          r = checkCommand(py, ["-m", "yt_dlp", "--version"], "python -m yt_dlp");
          if (r.ok) { ytdlp = { ok: true, how: `${py} -m yt_dlp`, version: r.output }; break; }
        }
        if (!ytdlp.ok) ytdlp = { ok: false, how: "not found", error: r.error };
      }
    }

    // ffmpeg detection: PATH -> FFMPEG_PATH -> ffmpeg-static
    let ffmpeg = checkCommand("ffmpeg", ["-version"], "ffmpeg");
    const ffmpegPathEnv = process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)
      ? process.env.FFMPEG_PATH
      : null;
    if (!ffmpeg.ok && ffmpegPathEnv) {
      const r = checkCommand(ffmpegPathEnv, ["-version"], "ffmpeg(env)");
      if (r.ok) {
        ffmpeg = { ok: true, output: r.output, how: `env:${ffmpegPathEnv}` };
        try { fluentFfmpeg.setFfmpegPath(ffmpegPathEnv); } catch {}
      }
    }
    if (!ffmpeg.ok && ffmpegStatic && fs.existsSync(ffmpegStatic)) {
      const r = checkCommand(ffmpegStatic, ["-version"], "ffmpeg(static)");
      if (r.ok) {
        ffmpeg = { ok: true, output: r.output, how: `static:${ffmpegStatic}` };
        try { fluentFfmpeg.setFfmpegPath(ffmpegStatic); } catch {}
      }
    }

    if (ytdlp.ok) {
      logger.info?.(`[diag] yt-dlp OK (${ytdlp.how}) v${ytdlp.version}`);
    } else {
      logger.warn?.(`[diag] yt-dlp NO DISPONIBLE (${ytdlp.how}). Para mejores descargas, instala yt-dlp o define YTDLP_PATH. Error: ${ytdlp.error || ""}`);
    }
    if (ffmpeg.ok) {
      const first = (ffmpeg.output || "").split(/\r?\n/)[0];
      logger.info?.(`[diag] ffmpeg OK ${first}${ffmpeg.how ? ` (${ffmpeg.how})` : ""}`);
    } else {
      logger.warn?.(`[diag] ffmpeg NO DISPONIBLE. Instala ffmpeg para mayor compatibilidad. Error: ${ffmpeg.error || ""}`);
    }

    // spotdl / instaloader / gallery-dl
    const extras = [
      { name: 'spotdl', env: process.env.SPOTDL_PATH },
      { name: 'instaloader', env: process.env.INSTALOADER_PATH },
      { name: 'gallery-dl', env: process.env.GALLERYDL_PATH },
    ];
    for (const x of extras) {
      let ok = false, how = '', msg = '';
      if (x.env && fs.existsSync(x.env)) {
        const r = checkCommand(x.env, ['--version'], x.name);
        ok = r.ok; how = `env:${x.env}`; msg = r.output || r.error || '';
      }
      if (!ok) {
        const r2 = checkCommand(x.name, ['--version'], x.name);
        ok = r2.ok; how = ok ? x.name : 'not found'; msg = r2.output || r2.error || '';
      }
      if (!ok) {
        // Intentar como módulo Python
        const py = process.platform === 'win32' ? ['py', 'python'] : ['python3', 'python'];
        const mod = x.name === 'gallery-dl' ? 'gallery_dl' : x.name;
        for (const p of py) {
          const r3 = checkCommand(p, ['-m', mod, '--version'], `${p} -m ${mod}`);
          if (r3.ok) { ok = true; how = `${p} -m ${mod}`; msg = r3.output || ''; break; }
        }
      }
      if (ok) logger.info?.(`[diag] ${x.name} OK ${msg}${how ? ` (${how})` : ''}`);
      else logger.warn?.(`[diag] ${x.name} NO DISPONIBLE. Error: ${msg}`);
    }
  } catch (e) {
    logger.warn?.(`[diag] Error ejecutando diagnóstico externos: ${e?.message || e}`);
  }
}

// Detect cookies file automatically before diagnostics and startup
ensureCookiesConfigured();
diagnosticsExternalBinaries();

app.get(
  "/api/bot/qr",
  authenticateToken,
  authorizeRoles("owner"),
  (_req, res) => {
    const qrImage = getQRCodeImage();
    const qrCode = getQRCode();
    const status = getConnectionStatus();

    if (qrImage) {
      const base64Data = qrImage.replace(/^data:image\/png;base64,/, "");
      return res.json({
        available: true,
        qr: base64Data,
        qrCode,
        qrCodeImage: qrImage,
        status: "waiting_for_scan",
      });
    }

    if (qrCode) {
      return res.json({
        available: true,
        qr: qrCode,
        qrCode,
        qrCodeImage: null,
        status: "waiting_for_scan",
      });
    }

    res.json({
      available: false,
      qr: null,
      qrCode: null,
      qrCodeImage: null,
      status: status.status,
      message: "No hay cdigo QR disponible",
    });
  },
);

app.get(
  "/api/whatsapp/status",
  authenticateToken,
  authorizeRoles("admin", "owner"),
  (_req, res) => {
    const status = getConnectionStatus();
    res.json({ status });
  },
);

app.post(
  "/api/whatsapp/logout",
  authenticateToken,
  authorizeRoles("owner"),
  async (_req, res) => {
    try {
      const sock = getSocket();
      if (sock) {
        await sock.logout();
        return res.json({
          success: true,
          message: "Desconectado exitosamente",
        });
      }
      return res.json({ success: false, message: "No hay conexin activa" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

// Compatibilidad con versiones anteriores del panel
app.post(
  "/api/bot/disconnect",
  authenticateToken,
  authorizeRoles("owner"),
  async (_req, res) => {
    try {
      const sock = getSocket();
      if (sock) {
        await sock.logout();
        return res.json({ success: true });
      }
      return res.json({ success: false, message: "No hay conexin activa" });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  },
);

app.post(
  "/api/bot/restart",
  authenticateToken,
  authorizeRoles("owner"),
  async (_req, res) => {
    try {
      const sock = getSocket();
      if (sock) {
        try {
          await sock.logout();
        } catch (_) {}
      }
      await connectToWhatsApp(join(__dirname, "storage", "baileys_full"));
      try {
        const restored = await restoreActiveSubbots();
        if (restored > 0) {
          console.log(` ♻️  Subbots reactivados tras reinicio: ${restored}`);
        }
      } catch (error) {
        console.warn(
          " No se pudieron reactivar los subbots guardados tras reinicio:",
          error?.message || error,
        );
      }
      try {
        await syncAllRuntimeStates();
        console.log(" Subbots sincronizados tras reiniciar el bot principal");
      } catch (error) {
        console.warn(
          " No se pudo sincronizar el estado de subbots tras reinicio:",
          error?.message || error,
        );
      }
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  },
);

// Endpoint para obtener grupos disponibles del bot
app.get(
  "/api/whatsapp/groups",
  authenticateToken,
  authorizeRoles("admin", "owner"),
  async (req, res) => {
    try {
      const groups = await getAvailableGroups();
      res.json(groups);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

// Health check endpoint for Railway
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Catch-all handler: send back React's index.html file in production
// Comentado: El frontend se sirve con Caddy
// if (process.env.NODE_ENV === 'production') {
//   app.get('*', (req, res) => {
//     const frontendDistPath = join(__dirname, '../../frontend-panel/dist');
//     res.sendFile(join(frontendDistPath, 'index.html'));
//   });
// }

// Start the bot connection and server
async function start() {
  // 0) Migraciones automticas (idempotentes)
  try {
    console.log(" Ejecutando migraciones de base de datos...");
    await db.migrate.latest();
    console.log(" Migraciones aplicadas correctamente.");
  } catch (error) {
    console.warn(
      " No se pudieron aplicar migraciones automticamente:",
      error?.message || error,
    );
  }

  // 1) Iniciar el servidor HTTP
  app.listen(port, config.server.host, () => {
    // Banner de inicio profesional
    console.log(
      "\n╔═══════════════════════════════════════════════════════════╗",
    );
    console.log(
      "║                                                           ║",
    );
    console.log("║  🤖 KONMI BOT - Sistema Multi-Bot Avanzado v2.5.0        ║");
    console.log(
      "║  ✨ Panel de Administración y Control                     ║",
    );
    console.log(
      "║                                                           ║",
    );
    console.log(
      "╚═══════════════════════════════════════════════════════════╝\n",
    );

    logger.info(`🚀 [Servidor] Backend iniciado en puerto ${port}`);
    logger.info(`🌐 [Servidor] Host: ${config.server.host}`);
    logger.info(`📦 [Servidor] Entorno: ${config.server.environment}`);
    logger.info(`🎨 [Frontend] URL: ${config.frontend.url}`);
    logger.info(`🤖 [Bot] ${config.bot.name} v${config.bot.version}`);

    console.log(
      "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n",
    );
    logger.system.startup(config.bot.version);
    console.log("✅ Sistema listo para recibir conexiones\n");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  });

  // 2) Conectar el bot (esto mostrar el men interactivo segn mtodo seleccionado)
  await connectToWhatsApp(join(__dirname, "storage", "baileys_full"));
  try {
    const restored = await restoreActiveSubbots();
    if (restored > 0) {
      console.log(` ♻️  Subbots reactivados automáticamente: ${restored}`);
    }
  } catch (error) {
    console.warn(
      " No se pudieron reactivar los subbots guardados:",
      error?.message || error,
    );
  }
  try {
    await syncAllRuntimeStates();
    console.log(" Subbots sincronizados tras iniciar el bot principal");
  } catch (error) {
    console.warn(
      " No se pudo sincronizar el estado de subbots al iniciar:",
      error?.message || error,
    );
  }
}

start();

export { db, app };
