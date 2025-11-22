// WhatsApp Bot Panel - Unified Configuration
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables (prioriza backend/full/.env)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Cargar EXCLUSIVAMENTE backend/full/.env con prioridad (override)
try { dotenv.config({ path: join(__dirname, '.env'), override: true }); } catch {}
// Unificar alias de clave para Gemini por compatibilidad
if (!process.env.GEMINI_API_KEY) {
  const alt = process.env.GOOGLE_API_KEY || process.env.GENAI_API_KEY;
  if (alt) process.env.GEMINI_API_KEY = alt;
}

// Log de depuración opcional (no imprime secretos)
try {
  const lvl = (process.env.LOG_LEVEL || '').toLowerCase();
  if (lvl === 'debug') {
    const present = Boolean(process.env.GEMINI_API_KEY);
    const masked = process.env.GEMINI_API_KEY ? (process.env.GEMINI_API_KEY.slice(0,6) + '...') : '(empty)';
    console.log(`[env] backend/full/.env cargado. GEMINI_API_KEY presente=${present}. Valor=${masked}`);
  }
} catch {}

const config = {
  // Server Configuration
  server: {
    port: Number(process.env.PORT || process.env.SERVER_PORT || 3001),
    host: process.env.HOST || '0.0.0.0',
    environment: process.env.NODE_ENV || 'development',
  },

  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'whatsapp-bot-panel-secret-key-2025-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },

  // Security Configuration
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 10,
  },

  // Frontend Configuration
  frontend: {
    url: process.env.NODE_ENV === 'production'
      ? process.env.FRONTEND_URL || process.env.RAILWAY_STATIC_URL || 'http://localhost:5173'
      : 'http://localhost:5173',
  },

  // CORS Configuration
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? [
          process.env.FRONTEND_URL,
          process.env.RAILWAY_STATIC_URL,
          'http://178.156.179.129',
          'http://178.156.179.129:80',
          'http://178.156.179.129:3000',
          'http://178.156.179.129:5173'
        ].filter(Boolean)
      : [
          'http://localhost:5173',
          'http://localhost:3000',
          'http://178.156.179.129',
          'http://178.156.179.129:80',
          'http://178.156.179.129:3000',
          'http://178.156.179.129:5173'
        ],
    credentials: true,
  },

  // Bot Configuration
  bot: {
    name: 'KONMI BOT',
    version: '2.5.0',
  },

  // Owner configuration (fallback for role detection from WhatsApp number)
  owner: {
    whatsapp: (process.env.OWNER_WHATSAPP_NUMBER || '').replace(/[^0-9]/g, '')
  }
};

export default config;
