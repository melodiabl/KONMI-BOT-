// commands/images.js
// Generación de imágenes a partir de texto (AI) y QR

import fetch from '../utils/utils/fetch.js';
import Jimp from 'jimp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  try { return await res.json(); } catch { return null }
}

export async function imageFromPrompt({ args }) {
  const prompt = (args || []).join(' ').trim();
  if (!prompt) return { success: true, message: 'ℹ️ Uso: /image [prompt]\nEjemplo: /image gato astronauta estilo sticker', quoted: true };
  // Proveedores sencillos (sin claves): Pollinations
  const providers = [
    async () => ({ type: 'image', image: { url: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + ' digital sticker illustration')}` }, caption: `🖼️ ${prompt}` }),
  ];
  const errors = [];
  for (const exec of providers) {
    try { return await exec(); } catch (e) { errors.push(e?.message || String(e)) }
  }
  return { success: false, message: `⚠️ No se pudo generar imagen (${errors.join(' | ')})`, quoted: true };
}

async function generateBratStyleImage(text, fontColor = Jimp.FONT_SANS_64_BLACK) {
    const image = new Jimp(512, 512, '#00FF00');
    const font = await Jimp.loadFont(fontColor);
    image.print(
        font,
        0,
        0,
        {
            text,
            alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
            alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE,
        },
        image.getWidth(),
        image.getHeight()
    );
    return await image.getBufferAsync(Jimp.MIME_PNG);
}


export async function brat({ args }) {
  const text = (args || []).join(' ').trim();
  if (!text) return { success: true, message: 'ℹ️ Uso: /brat [texto]\nEjemplo: /brat Hola mundo', quoted: true };
  try {
    const imageBuffer = await generateBratStyleImage(text);
    return {
        success: true,
        type: 'sticker',
        sticker: imageBuffer,
        caption: `🎨 BRAT\n📝 ${text}`,
        message: `🎨 *BRAT - Sticker*\n\n📝 **Texto:** "${text}"\n🎭 **Estilo:** BRAT`,
        quoted: true
    };
  } catch(e) {
    console.error(e)
    return { success: false, message: '⚠️ Error generando sticker BRAT.', quoted: true };
  }
}

export async function bratvd({ args }) {
    const text = (args || []).join(' ').trim();
    if (!text) return { success: true, message: 'ℹ️ Uso: /bratvd [texto]\nEjemplo: /bratvd Hola mundo', quoted: true };
    try {
        const imageBuffer = await generateBratStyleImage(text, Jimp.FONT_SANS_64_WHITE);
        return {
            success: true,
            type: 'sticker',
            sticker: imageBuffer,
            caption: `🎨 BRAT\n📝 ${text}`,
            message: `🎨 *BRAT - Sticker*\n\n📝 **Texto:** "${text}"\n🎭 **Estilo:** BRAT`,
            quoted: true
        };
    } catch(e) {
        console.error(e)
        return { success: false, message: '⚠️ Error generando sticker BRAT.', quoted: true };
    }
}