// utils/store.js
// Capa simple para crear y exponer un store en memoria de Baileys

// Carga dinámica local de makeInMemoryStore (sin utils externos)
let makeInMemoryStore = null
try {
  const candidates = []
  try { if (process?.env?.BAILEYS_MODULE) candidates.push(process.env.BAILEYS_MODULE) } catch {}
  candidates.push('@itsukichan/baileys', '@adiwajshing/baileys')
  let loaded = null
  for (const name of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const mod = await import(name)
      const M = (mod && Object.keys(mod).length ? mod : (mod?.default || mod))
      makeInMemoryStore = (M?.makeInMemoryStore ?? mod?.default?.makeInMemoryStore ?? mod?.makeInMemoryStore) || null
      if (makeInMemoryStore) { loaded = name; break }
    } catch {}
  }
} catch {}
import pino from 'pino'

let STORE = null
let SAVE_TIMER = null
let SAVE_FILE = null

export function initStore() {
  try {
    if (!STORE && typeof makeInMemoryStore === 'function') {
      STORE = makeInMemoryStore({ logger: pino({ level: 'silent' }) })
    }
  } catch {}
  return STORE
}

export function getStore() { return STORE }

export function configureStorePersistence({ file, intervalMs } = {}) {
  if (!STORE) return false
  try {
    SAVE_FILE = file || SAVE_FILE
    const ms = Number(intervalMs) || 0
    if (SAVE_TIMER) { clearInterval(SAVE_TIMER); SAVE_TIMER = null }
    if (ms > 0 && SAVE_FILE) {
      try {
        // Carga previa si existe
        if (typeof STORE.readFromFile === 'function' && requireReadable(SAVE_FILE)) {
          try { STORE.readFromFile(SAVE_FILE) } catch {}
        }
      } catch {}
      SAVE_TIMER = setInterval(() => {
        try { if (typeof STORE.writeToFile === 'function') STORE.writeToFile(SAVE_FILE) } catch {}
      }, ms)
    }
    return true
  } catch { return false }
}

function requireReadable(path) { try { return !!(path) } catch { return false } }

export default { initStore, getStore }

