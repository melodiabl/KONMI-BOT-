// Multi-account manager para subbots reales con Baileys
import fs from 'fs';
import path from 'path';
import pino from 'pino';
import QRCode from 'qrcode';

// Carga dinámica de Baileys con fallback a forks
async function loadBaileys() {
  const candidates = [];
  if (process?.env?.BAILEYS_MODULE) candidates.push(process.env.BAILEYS_MODULE);
  candidates.push('baileys-mod');
  candidates.push('baileys');
  candidates.push('@whiskeysockets/baileys');
  for (const mod of candidates) {
    try {
      const m = await import(mod);
      return m;
    } catch (_) {}
  }
  throw new Error('No se pudo cargar Baileys');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sanitizeNumber(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 16) return null;
  return digits;
}

// Genera Pairing Code real para un número (subbot con su propio número)
export async function generateSubbotPairingCode(number, displayName = 'KONMI-BOT') {
  const num = sanitizeNumber(number);
  if (!num) throw new Error('Número inválido');

  const baileys = await loadBaileys();
  const { useMultiFileAuthState, Browsers, makeWASocket, fetchLatestBaileysVersion } = baileys;

  const baseDir = path.join(process.cwd(), 'storage', 'subbots', num);
  const authDir = path.join(baseDir, 'auth');
  ensureDir(authDir);

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  let version;
  try {
    if (typeof fetchLatestBaileysVersion === 'function') {
      const v = await fetchLatestBaileysVersion();
      version = v?.version || v;
    }
  } catch (_) {}

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    ...(version ? { version } : {})
  });

  sock.ev.on('creds.update', saveCreds);

  // Pairing code válido aprox 10 minutos
  const code = await sock.requestPairingCode(num, displayName);

  // Dejamos el socket abierto para permitir la vinculación; se cerrará por timeout en 11min
  setTimeout(() => {
    try { sock.end(); } catch (_) {}
  }, 11 * 60 * 1000);

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  return { number: num, code, displayName, expiresAt };
}

// Genera un QR PNG (buffer) para un subbot por sesión efímera
export async function generateSubbotQR(sessionLabel = 'KONMI-BOT') {
  const baileys = await loadBaileys();
  const { useMultiFileAuthState, Browsers, makeWASocket, fetchLatestBaileysVersion } = baileys;

  const sid = `qr-${Date.now()}`;
  const baseDir = path.join(process.cwd(), 'storage', 'subbots', sid);
  const authDir = path.join(baseDir, 'auth');
  ensureDir(authDir);

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  let version;
  try {
    if (typeof fetchLatestBaileysVersion === 'function') {
      const v = await fetchLatestBaileysVersion();
      version = v?.version || v;
    }
  } catch (_) {}

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    ...(version ? { version } : {})
  });

  sock.ev.on('creds.update', saveCreds);

  const qrPng = await new Promise((resolve, reject) => {
    const onUpdate = async (update) => {
      try {
        if (update.qr) {
          const pngBuffer = await QRCode.toBuffer(update.qr, { type: 'png', errorCorrectionLevel: 'M', margin: 1 });
          sock.ev.off('connection.update', onUpdate);
          resolve(pngBuffer);
        } else if (update.connection === 'open') {
          // Ya conectado antes de capturar QR
          sock.ev.off('connection.update', onUpdate);
          reject(new Error('Sesión conectada antes de generar QR'));
        } else if (update.connection === 'close') {
          // Sesión cerrada sin QR
          sock.ev.off('connection.update', onUpdate);
          reject(new Error('Conexión cerrada antes de generar QR'));
        }
      } catch (e) {
        sock.ev.off('connection.update', onUpdate);
        reject(e);
      }
    };
    sock.ev.on('connection.update', onUpdate);

    // Safety timeout: 90s
    setTimeout(() => {
      try { sock.ev.off('connection.update', onUpdate); } catch (_) {}
      reject(new Error('Timeout generando QR'));
    }, 90 * 1000);
  });

  // Cerrar luego de 2 minutos para no dejar sesiones colgadas si no se escanea
  setTimeout(() => {
    try { sock.end(); } catch (_) {}
  }, 2 * 60 * 1000);

  return { sessionId: sid, png: qrPng, expiresInSec: 60 };
}
