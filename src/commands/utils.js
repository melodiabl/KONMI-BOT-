// commands/utils.js
// Utilidades varias
import fetch from '../utils/fetch.js'

export async function shortUrl(raw, usuario) {
  try {
    const url = String(raw || '').trim()
    if (!url) {
      return { success: true, message: 'ℹ️ Uso: /short [URL]\nEjemplo: /short https://www.google.com', quoted: true }
    }
    const res = await fetch(`https://api.vreden.my.id/api/shorturl?url=${encodeURIComponent(url)}`)
    const data = await res.json().catch(()=>null)
    if (data?.status && data?.data?.shortUrl) {
      const short = data.data.shortUrl
      const saving = url.length > 0 ? Math.max(0, ((url.length - short.length) / url.length) * 100).toFixed(1) : '0.0'
      return {
        success: true,
        message: `🔗 URL acortada\n\n🔍 Original:\n${url}\n\n✂️ Acortada:\n${short}\n\n📉 Ahorro: ${saving}%\n\n🙋 ${usuario}\n📅 ${new Date().toLocaleString('es-ES')}`,
        quoted: true,
      }
    }
    return { success: true, message: `⚠️ No se pudo acortar la URL: "${url}"\n\nℹ️ Verifica que sea válida (http/https).`, quoted: true }
  } catch (e) {
    return { success: false, message: '⚠️ Error acortando URL. Intenta más tarde.', quoted: true }
  }
}


export async function tts({ args }) {
  const text = (args || []).join(' ').trim();
  if (!text) return { success: true, message: 'ℹ️ Uso: /tts [texto]\nEjemplo: /tts Hola mundo', quoted: true };
  try {
    const url = `https://api.vreden.my.id/api/tts?text=${encodeURIComponent(text)}&lang=es`;
    // No validamos JSON; devolvemos audio por URL directa
    return { success: true, type: 'audio', audio: { url }, caption: `🔊 TTS: ${text}`, quoted: true };
  } catch {
    return { success: false, message: '⚠️ Error generando TTS.', quoted: true };
  }
}

// Alias esperado por el registry: utils.short(ctx)
export async function short(ctx = {}) {
  try {
    const usuario = ctx.sender || ctx.usuario || ''
    const raw = (ctx.args && ctx.args.length)
      ? ctx.args[0]
      : String(ctx.text || '').trim().split(/\s+/).slice(1).join(' ')
    return await shortUrl(raw, usuario)
  } catch {
    return { success: false, message: '⚠️ Error acortando URL.', quoted: true }
  }
}

// Mantener también en el export por defecto si algún import usa default
export default { shortUrl, short, tts }
