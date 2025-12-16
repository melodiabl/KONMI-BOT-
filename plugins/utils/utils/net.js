// utils/net.js
// Utilidades de red con timeout y parseo seguro

export const DEFAULT_EXTERNAL_TIMEOUT_MS = Number(process.env.EXTERNAL_API_TIMEOUT_MS || '8000')

export function withTimeoutController(timeoutMs = DEFAULT_EXTERNAL_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return { controller, timer }
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_EXTERNAL_TIMEOUT_MS) {
  const { controller, timer } = withTimeoutController(timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    return response
  } finally {
    clearTimeout(timer)
  }
}

export async function parseJsonSafe(response) {
  const text = await response.text()
  if (!text) return null
  try { return JSON.parse(text) } catch { throw new Error('Respuesta JSON invalida') }
}

export default { DEFAULT_EXTERNAL_TIMEOUT_MS, withTimeoutController, fetchWithTimeout, parseJsonSafe }

