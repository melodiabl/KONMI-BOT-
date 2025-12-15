// commands/utils.js
// Utilidades varias
import fetch from './utils/utils/fetch.js'

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

// =========================
// FUNCIONALIDADES WILEYS - Sistema de Reacciones Automáticas
// =========================

export async function addAutoReaction(sock, message, command) {
  if (!sock || !message?.key) return;

  try {
    const reactionMap = {
      // Descargas
      'play': '🎵', 'music': '🎵', 'video': '🎬', 'youtube': '🎬',
      'tiktok': '📱', 'instagram': '📷', 'ig': '📷',
      'facebook': '📘', 'fb': '📘', 'twitter': '🐦', 'x': '🐦',
      'spotify': '🎧', 'pinterest': '📌',

      // IA
      'ia': '🤖', 'ai': '🤖', 'image': '🎨', 'clasificar': '📊',

      // Media
      'sticker': '✨', 's': '✨', 'meme': '😂', 'quote': '💭',
      'tts': '🗣️', 'wallpaper': '🖼️',

      // Utilidades
      'translate': '🌐', 'tr': '🌐', 'weather': '🌤️', 'clima': '🌤️',
      'ping': '🏓', 'joke': '😄', 'fact': '📰', 'short': '🔗',

      // Subbots
      'qr': '📱', 'code': '🔑', 'mybots': '🤖', 'bots': '🤖',

      // Grupo
      'kick': '👢', 'promote': '⬆️', 'demote': '⬇️',
      'lock': '🔒', 'unlock': '🔓',

      // Encuestas
      'poll': '📊', 'pollmultiple': '📊', 'quickpoll': '📊',
      'rating': '⭐', 'yesno': '❓',

      // Estados
      'typing': '⌨️', 'recording': '🎤', 'online': '🟢', 'offline': '⚫',
      'away': '🌙', 'busy': '🔴', 'readall': '👁️'
    };

    const emoji = reactionMap[command.toLowerCase()];
    if (emoji) {
      await sock.sendMessage(message.key.remoteJid, {
        react: { text: emoji, key: message.key }
      });
    }
  } catch (error) {
    console.error('[AUTO_REACTION] Error:', error);
  }
}

export async function addCompletionReaction(sock, message, result) {
  if (!sock || !message?.key) return;

  try {
    let emoji = '✅'; // Default success

    if (result?.success === false) {
      emoji = '❌'; // Error
    } else if (result?.type === 'audio') {
      emoji = '🎵'; // Audio completado
    } else if (result?.type === 'video') {
      emoji = '🎬'; // Video completado
    } else if (result?.type === 'image') {
      emoji = '🖼️'; // Imagen completada
    }

    // Esperar un poco antes de la reacción final
    setTimeout(async () => {
      try {
        await sock.sendMessage(message.key.remoteJid, {
          react: { text: emoji, key: message.key }
        });
      } catch {}
    }, 1000);
  } catch (error) {
    console.error('[COMPLETION_REACTION] Error:', error);
  }
}

// Funciones adicionales de Wileys para utils
export async function qrcode(ctx) {
  const { args, sock, remoteJid } = ctx;
  const text = args.join(' ').trim();

  if (!text) {
    return { text: '❌ Uso: /qrcode <texto>\nEjemplo: /qrcode https://google.com' };
  }

  try {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(text)}`;
    return {
      type: 'image',
      image: { url: qrUrl },
      caption: `📱 *Código QR generado*\n\n📝 Texto: ${text}`
    };
  } catch (error) {
    return { text: '❌ Error generando código QR' };
  }
}

export async function calc(ctx) {
  const { args } = ctx;
  const expression = args.join(' ').trim();

  if (!expression) {
    return { text: '❌ Uso: /calc <expresión>\nEjemplo: /calc 2 + 2 * 3' };
  }

  try {
    // Sanitizar la expresión para seguridad
    const sanitized = expression.replace(/[^0-9+\-*/.() ]/g, '');
    const result = eval(sanitized);

    return {
      text: `🧮 *Calculadora*\n\n📝 Expresión: ${expression}\n🔢 Resultado: ${result}`
    };
  } catch (error) {
    return { text: '❌ Expresión matemática inválida' };
  }
}

// Mantener también en el export por defecto si algún import usa default
export default { shortUrl, short, tts, addAutoReaction, addCompletionReaction, qrcode, calc }
