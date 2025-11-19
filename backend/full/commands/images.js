// commands/images.js
// Generación de imágenes a partir de texto (AI) y QR

import fetch from '../utils/fetch.js';

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  try { return await res.json(); } catch { return null }
}

export async function imageFromPrompt({ args }) {
  const prompt = (args || []).join(' ').trim();
  if (!prompt) return { success: true, message: 'ℹ️ Uso: /image [prompt]\nEjemplo: /image gato astronauta estilo sticker', quoted: true };
  // Proveedores sencillos (sin claves): Pollinations y Vreden
  const providers = [
    async () => ({ type: 'image', image: { url: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + ' digital sticker illustration')}` }, caption: `🖼️ ${prompt}` }),
    async () => {
      const data = await fetchJson(`https://api.vreden.my.id/api/texttoimg?prompt=${encodeURIComponent(prompt)}`);
      if (data?.status && data?.data?.url) return { type: 'image', image: { url: data.data.url }, caption: `🖼️ ${prompt}`, quoted: true };
      throw new Error('Proveedor inválido');
    },
  ];
  const errors = [];
  for (const exec of providers) {
    try { return await exec(); } catch (e) { errors.push(e?.message || String(e)) }
  }
  return { success: false, message: `⚠️ No se pudo generar imagen (${errors.join(' | ')})`, quoted: true };
}

// Nota: /qrtexto removido a solicitud. Se mantiene solo /qr para subbots.

export async function brat({ args, usuario }) {
  const text = (args || []).join(' ').trim();
  if (!text) return { success: true, message: 'ℹ️ Uso: /brat [texto]\nEjemplo: /brat Hola mundo', quoted: true };
  try {
    const res = await fetch(`https://api.vreden.my.id/api/brat?text=${encodeURIComponent(text)}`);
    const data = await res.json().catch(()=>null);
    if (data?.status && data?.data?.url) {
      return { success: true, type: 'sticker', sticker: { url: data.data.url }, caption: `🎨 BRAT\n📝 ${text}`, message: `🎨 *BRAT - Sticker*\n\n📝 **Texto:** "${text}"\n🎭 **Estilo:** BRAT`, quoted: true };
    }
    return { success: true, message: `⚠️ No se pudo generar el sticker: "${text}"`, quoted: true };
  } catch {
    return { success: false, message: '⚠️ Error generando sticker BRAT.', quoted: true };
  }
}

export async function bratvd({ args, usuario }) {
  const text = (args || []).join(' ').trim();
  if (!text) return { success: true, message: 'ℹ️ Uso: /bratvd [texto]\nEjemplo: /bratvd Hola mundo', quoted: true };
  try {
    const res = await fetch(`https://api.vreden.my.id/api/bratvd?text=${encodeURIComponent(text)}`);
    const data = await res.json().catch(()=>null);
    if (data?.status && data?.data?.url) {
      return { success: true, type: 'sticker', sticker: { url: data.data.url }, caption: `🎨 BRAT VD\n📝 ${text}`, quoted: true };
    }
    return { success: true, message: `⚠️ No se pudo generar el sticker animado: "${text}"`, quoted: true };
  } catch {
    return { success: false, message: '⚠️ Error generando sticker animado BRAT.', quoted: true };
  }
}
