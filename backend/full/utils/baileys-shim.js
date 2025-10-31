// Unified Baileys loader that respects BAILEYS_MODULE and falls back to known forks
// Allows the rest of the codebase to import Baileys symbols from a single place.
// Usage examples:
//   import * as baileys from './utils/baileys-shim.js'
//   import { downloadContentFromMessage } from './utils/baileys-shim.js'

const candidates = [];
try {
  if (process?.env?.BAILEYS_MODULE) candidates.push(process.env.BAILEYS_MODULE);
} catch {}
// Common forks and upstreams (order matters)
candidates.push('@rexxhayanasi/elaina-bail');
candidates.push('baileys-mod');
candidates.push('@whiskeysockets/baileys');
candidates.push('baileys');

/**
 * Dynamically import the first available Baileys implementation.
 */
async function load() {
  let lastErr = null;
  for (const name of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const mod = await import(name);
      return { mod, name };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('No se pudo cargar ningún módulo de Baileys');
}

const { mod, name: loadedName } = await load();
// Prefer the module itself, but support default export shape just in case
const M = (mod && Object.keys(mod).length ? mod : (mod?.default || mod));

// Helper to safely access a symbol regardless of export style
const pick = (k) => (M?.[k] ?? mod?.default?.[k] ?? mod?.[k]);

// Named exports commonly used in the codebase
export const makeWASocket = pick('makeWASocket') ?? pick('default');
export const DisconnectReason = pick('DisconnectReason');
export const useMultiFileAuthState = pick('useMultiFileAuthState');
export const fetchLatestBaileysVersion = pick('fetchLatestBaileysVersion');
export const Browsers = pick('Browsers');
export const jidDecode = pick('jidDecode');
export const jidNormalizedUser = pick('jidNormalizedUser');
export const areJidsSameUser = pick('areJidsSameUser');
export const downloadContentFromMessage = pick('downloadContentFromMessage');

// Also expose the loaded module as default and its name for debugging
export default M;
export const __loadedBaileysName = loadedName;

