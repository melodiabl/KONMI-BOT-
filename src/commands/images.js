// commands/images.js
// Generación de imágenes a partir de texto (AI) y QR

import fetch from '../utils/utils/fetch.js';
import Jimp from 'jimp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from 'ffmpeg-static';
import { tmpdir } from 'os';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

ffmpeg.setFfmpegPath(ffmpegInstaller);

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

async function generateBratStyleImage(text) {
    const image = new Jimp(512, 512, '#FFFFFF');
    const font = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
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

async function generateAnimatedBratStyleImage(text) {
    const frames = [];
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'brat-'));

    for (let i = 0; i <= 10; i++) {
        const opacity = Math.sin(Math.PI * i / 10);
        const image = new Jimp(512, 512, '#FFFFFF');
        const font = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
        const textImage = new Jimp(512, 512, 0x0);
        textImage.print(font, 0, 0, {
            text,
            alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
            alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE,
        }, textImage.getWidth(), textImage.getHeight());
        textImage.opacity(opacity);
        image.composite(textImage, 0, 0);
        const framePath = path.join(tempDir, `frame-${i}.png`);
        await image.writeAsync(framePath);
        frames.push(framePath);
    }

    const outputPath = path.join(tempDir, 'output.webp');
    await new Promise((resolve, reject) => {
        ffmpeg()
            .input(path.join(tempDir, 'frame-%d.png'))
            .inputOptions(['-framerate', '10'])
            .outputOptions(['-vcodec', 'libwebp', '-loop', '0', '-s', '512:512'])
            .toFormat('webp')
            .save(outputPath)
            .on('end', resolve)
            .on('error', reject);
    });

    const stickerBuffer = await fs.readFile(outputPath);
    await fs.rm(tempDir, { recursive: true, force: true });
    return stickerBuffer;
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
        const imageBuffer = await generateAnimatedBratStyleImage(text);
        return {
            success: true,
            type: 'sticker',
            sticker: imageBuffer,
            caption: `🎨 BRAT VD\n📝 ${text}`,
            message: `🎨 *BRAT - Sticker Animado*\n\n📝 **Texto:** "${text}"\n🎭 **Estilo:** BRAT VD`,
            quoted: true
        };
    } catch(e) {
        console.error(e)
        return { success: false, message: '⚠️ Error generando sticker BRAT animado.', quoted: true };
    }
}
