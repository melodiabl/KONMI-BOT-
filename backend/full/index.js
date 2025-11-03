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
  clearWhatsAppSession,
  setAuthMethod,
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

// ===== utils =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function fileExists(p) { try { return fs.existsSync(p) } catch { return false } }
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ===== cookies helpers (opcional, igual que antes) =====
function findCookiesFile() {
  try {
    const envHints = [process.env.YOUTUBE_COOKIES_FILE, process.env.YT_COOKIES_FILE].filter(Boolean);
    for (const hint of envHints) { try { if (hint && fs.existsSync(hint)) return hint } catch {} }

    const candidates = [];
    candidates.push(join(__dirname, 'all_cookies.txt'));
    candidates.push(join(__dirname, 'all_cookie.txt'));
    candidates.push(join(process.cwd(), 'backend', 'full', 'all_cookies.txt'));
    candidates.push(join(process.cwd(), 'backend', 'full', 'all_cookie.txt'));
    candidates.push(join(process.cwd(), 'all_cookies.txt'));
    candidates.push(join(process.cwd(), 'cookies.txt'));
    try {
      const appData = process.env.APPDATA;
      if (appData) candidates.push(join(appData, 'yt-dlp', 'cookies.txt'));
    } catch {}
    try {
      const home = process.env.HOME || process.env.USERPROFILE;
      if (home) {
        candidates.push(join(home, '.config', 'yt-dlp', 'cookies.txt'));
        candidates.push(join(home, '.config', 'yt-dlp', 'cookies'));
      }
    } catch {}
    for (const p of candidates) { try { if (p && fs.existsSync(p)) return p } catch {} }
  } catch {}
  return null;
}
function looksLikeCookies(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const head = (data || '').split(/\r?\n/).slice(0, 5).join('\n');
    if (!head) return false;
    if (head.includes('\t')) return true;
    if (/^[A-Za-z0-9_\-]+=.+/m.test(head)) return true;
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
    if (re.test(content)) content = content.replace(re, line);
    else content = content.trimEnd() + '\n' + line + '\n';
    fs.writeFileSync(envPath, content, 'utf8');
    return true;
  } catch { return false; }
}
function ensureCookiesConfigured() {
  try {
    if (process.env.YOUTUBE_COOKIES_FILE || process.env.YT_COOKIES_FILE || process.env.YOUTUBE_COOKIES) return;
    const found = findCookiesFile();
    if (found && looksLikeCookies(found)) {
      process.env.YOUTUBE_COOKIES_FILE = found;
      process.env.YT_COOKIES_FILE = found;
      persistEnvVar('YOUTUBE_COOKIES_FILE', found);
      persistEnvVar('YT_COOKIES_FILE', found);
    }
  } catch {}
}

// ===== spotdl helpers (igual que antes) =====
function resolveSpotdlPath() {
  try {
    if (process.env.SPOTDL_PATH) {
      try {
        const r = spawnSync(process.env.SPOTDL_PATH, ['--version'], { encoding: 'utf8', windowsHide: true });
        if (!r.error && (r.status === 0 || typeof r.status === 'undefined')) return process.env.SPOTDL_PATH;
      } catch {}
    }
    try {
      const r2 = spawnSync('spotdl', ['--version'], { encoding: 'utf8', windowsHide: true });
      if (!r2.error && (r2.status === 0 || typeof r2.status === 'undefined')) {
        try {
          const cmd = process.platform === 'win32' ? 'where' : 'which';
          const rpath = spawnSync(cmd, ['spotdl'], { encoding: 'utf8', windowsHide: true });
          const out = (rpath.stdout || '').split(/\r?\n/).filter(Boolean)[0];
          return out || 'spotdl';
        } catch { return 'spotdl' }
      }
    } catch {}
    const py = process.platform === 'win32' ? ['py', 'python'] : ['python3', 'python'];
    for (const p of py) {
      try {
        const r3 = spawnSync(p, ['-m', 'spotdl', '--version'], { encoding: 'utf8', windowsHide: true });
        if (!r3.error && (r3.status === 0 || typeof r3.status === 'undefined')) return `${p} -m spotdl`;
      } catch {}
    }
  } catch {}
  return null;
}
function ensureSpotdlConfigured() {
  try {
    if (process.env.SPOTDL_PATH) return;
    const resolved = resolveSpotdlPath();
    if (resolved) {
      process.env.SPOTDL_PATH = resolved;
      persistEnvVar('SPOTDL_PATH', resolved);
    }
  } catch {}
}

const app = express();
const port = config.server.port;

app.use(cors(config.cors));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Archivos estáticos de media
app.use("/media", express.static(join(__dirname, "storage")));

// Rutas
app.use("/api/auth", authRouter);
app.use("/api", apiRouter);

// Endpoints WhatsApp
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

app.get(
  "/api/whatsapp/status",
  authenticateToken,
  authorizeRoles("admin", "owner"),
  (_req, res) => res.json({ status: getConnectionStatus() }),
);

app.post(
  "/api/whatsapp/logout",
  authenticateToken,
  authorizeRoles("owner"),
  async (_req, res) => {
    try {
      await clearWhatsAppSession();
      return res.json({ success: true, message: "Sesión cerrada" });
    } catch (e) {
      return res.status(500).json({ error: e?.message || String(e) });
    }
  },
);

app.get(
  "/api/whatsapp/groups",
  authenticateToken,
  authorizeRoles("admin", "owner"),
  async (_req, res) => {
    try { res.json(await getAvailableGroups()); }
    catch (e) { res.status(500).json({ error: e?.message || String(e) }); }
  },
);

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  });
});

// ===== Diagnóstico de binarios externos =====
function checkCommand(cmd, args = ["--version"]) {
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
    let ytdlp = checkCommand("yt-dlp");
    if (!ytdlp.ok) {
      const py = process.platform === "win32" ? ["py", "python"] : ["python3", "python"];
      for (const p of py) {
        const r = checkCommand(p, ['-m', 'yt_dlp', '--version']);
        if (r.ok) { ytdlp = r; break; }
      }
    }
    let ffmpeg = checkCommand("ffmpeg", ["-version"]);
    if (ffmpeg.ok === false && ffmpegStatic && fs.existsSync(ffmpegStatic)) {
      const r = checkCommand(ffmpegStatic, ["-version"]);
      if (r.ok) { ffmpeg = r; try { fluentFfmpeg.setFfmpegPath(ffmpegStatic); } catch {} }
    }
    if (ytdlp.ok) logger.info?.(`[diag] yt-dlp OK v${ytdlp.output}`);
    else logger.warn?.(`[diag] yt-dlp NO DISPONIBLE: ${ytdlp.error || ''}`);
    if (ffmpeg.ok) logger.info?.(`[diag] ffmpeg OK ${ffmpeg.output.split(/\r?\n/)[0]}`);
    else logger.warn?.(`[diag] ffmpeg NO DISPONIBLE: ${ffmpeg.error || ''}`);
  } catch (e) {
    logger.warn?.(`[diag] error diag externos: ${e?.message || e}`);
  }
}

ensureCookiesConfigured();
ensureSpotdlConfigured();
diagnosticsExternalBinaries();

// ====== Inicio ======
async function start() {
  // 0) Migraciones
  try { await db.migrate.latest(); } catch (e) { console.warn("Migraciones: ", e?.message || e) }

  // 1) Servidor (robusto con fallback de puerto)
  function bindServer(p, attempt = 1) {
    try {
      const srv = app.listen(p, config.server.host, () => {
        logger.info(`🚀 Backend en ${config.server.host}:${srv.address().port}`);
      });
      srv.on('error', (err) => {
        try { logger.warn?.(`[server] error listen ${err?.code || err?.message}`) } catch {}
        if (err && err.code === 'EADDRINUSE') {
          const next = attempt === 1 ? (Number(process.env.FALLBACK_PORT || 0) || (Number(p) + 1)) : 0;
          try { logger.warn?.(`[server] puerto ${p} ocupado. Reintentando en ${next === 0 ? 'puerto aleatorio' : next}...`) } catch {}
          setTimeout(() => bindServer(next, attempt + 1), 300);
        } else {
          try { logger.error?.(`[server] listen falló: ${err?.message || err}`) } catch {}
        }
      });
      return srv;
    } catch (e) {
      try { logger.error?.(`[server] no se pudo iniciar: ${e?.message || e}`) } catch {}
      return null;
    }
  }

  bindServer(port);

  // 2) Autenticación interactiva real
  const authDir = join(__dirname, "storage", "baileys_full");
  try {
    await ensureAuthInteractive(authDir);
  } catch (e) {
    console.warn("ensureAuthInteractive falló, conectando por defecto:", e?.message || e);
    await connectToWhatsApp(authDir);
  }

  // 3) Subbots
  try { await restoreActiveSubbots(); } catch {}
  try { await syncAllRuntimeStates(); } catch {}
}

start();

// ======== Selección interactiva (ARREGLADA) ========
async function prompt(question) {
  const { createInterface } = await import('readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(String(ans || '').trim()) }));
}

async function ensureAuthInteractive(authPath) {
  const creds = join(authPath, 'creds.json');

  // Si hay sesión válida, conecta directo
  if (fileExists(creds)) {
    await connectToWhatsApp(authPath);
    return;
  }

  // Si no hay TTY (ej. servidor remoto)
  if (!process.stdin.isTTY) {
    if (process.env.AUTH_METHOD === 'pairing' && process.env.PAIR_NUMBER) {
      await clearWhatsAppSession();
      setAuthMethod('pairing', { phoneNumber: process.env.PAIR_NUMBER });
      await connectToWhatsApp(authPath, true, process.env.PAIR_NUMBER);
      return;
    }
    await connectToWhatsApp(authPath);
    return;
  }

  // Interactivo local
  console.log('\n🔐 Selección de autenticación');
  console.log('1) Código QR (recomendado)');
  console.log('2) Pairing Code (código numérico)');

  let choice = await prompt('Elige método (1/2): ');
  if (choice !== '1' && choice !== '2') choice = '1';

  // === Pairing Code ===
  if (choice === '2') {
    const raw = await prompt('Ingresa tu número en formato internacional (ej: 595974154768): ');
    const digits = (raw || '').replace(/\D/g, '');
    if (!digits) {
      console.log('Número inválido. Volviendo a QR…');
      await connectToWhatsApp(authPath, false);
      return;
    }
    await clearWhatsAppSession();
    try { fs.rmSync(authPath, { recursive: true, force: true }); } catch {}
    try { fs.mkdirSync(authPath, { recursive: true }); } catch {}
    setAuthMethod('pairing', { phoneNumber: digits });
    console.log(`\n📱 Esperando pairing code para +${digits}...`);
    await connectToWhatsApp(authPath, true, digits);
    return;
  }

  // === Código QR ===
  await connectToWhatsApp(authPath, false);
}

export { db, app };
