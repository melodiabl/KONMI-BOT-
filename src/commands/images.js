// commands/images.js (versión corregida BRAT y BRATVD)
// Aviso: Solo modifiqué la parte necesaria para arreglar el fondo inconsistente.
// Todo el resto del archivo lo dejo intacto.

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
  const providers = [
    async () => ({ type: 'image', image: { url: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + ' digital sticker illustration')}` }, caption: `🖼️ ${prompt}` }),
  ];
  const errors = [];
  for (const exec of providers) {
    try { return await exec(); } catch (e) { errors.push(e?.message || String(e)) }
  }
  return { success: false, message: `⚠️ No se pudo generar imagen (${errors.join(' | ')})`, quoted: true };
}

// =============================
//   FIX: BRAT BACKGROUND CLEAN
// =============================
async function generateBratStyleImage(text) {
    try {
        const width = 512;
        const height = 512;
        const padding = 40;

        const image = await new Jimp(width, height, 0x8ACE00);
        const textUpper = text.toUpperCase();

        const fontSizes = [
            { name: 'FONT_SANS_128_BLACK', size: 128 },
            { name: 'FONT_SANS_64_BLACK', size: 64 },
            { name: 'FONT_SANS_32_BLACK', size: 32 },
            { name: 'FONT_SANS_16_BLACK', size: 16 }
        ];

        let selectedFont = null;

        for (const fontInfo of fontSizes) {
            try {
                const font = await Jimp.loadFont(Jimp[fontInfo.name]);
                const textWidth = Jimp.measureText(font, textUpper);
                const textHeight = Jimp.measureTextHeight(font, textUpper, width - (padding * 2));

                if (textWidth <= (width - padding * 2) && textHeight <= (height - padding * 2)) {
                    selectedFont = font;
                    break;
                }
            } catch {_}{}
        }

        if (!selectedFont) selectedFont = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

        const textWidth = Jimp.measureText(selectedFont, textUpper);
        const textHeight = Jimp.measureTextHeight(selectedFont, textUpper, width - (padding * 2));

        const x = Math.floor((width - textWidth) / 2);
        const y = Math.floor((height - textHeight) / 2);

        image.print(selectedFont, x, y, textUpper);

        image.opaque();

        return await image.getBufferAsync(Jimp.MIME_PNG);

    } catch (error) {
        throw error;
    }
}

// =============================
//     FIX PARA BRAT ANIMADO
//  (sin fondo negro, 100% verde)
// =============================
async function generateAnimatedBratStyleImage(text) {
    const frames = [];
    let tempDir;

    try {
        tempDir = await fs.mkdtemp(path.join(tmpdir(), 'brat-'));
        const width = 512;
        const height = 512;
        const padding = 40;
        const totalFrames = 15;
        const bgColor = 0x8ACE00;

        const textUpper = text.toUpperCase();

        const fontSizes = [
            { name: 'FONT_SANS_128_BLACK', size: 128 },
            { name: 'FONT_SANS_64_BLACK', size: 64 },
            { name: 'FONT_SANS_32_BLACK', size: 32 },
            { name: 'FONT_SANS_16_BLACK', size: 16 }
        ];

        let selectedFont = null;
        for (const fontInfo of fontSizes) {
            try {
                const font = await Jimp.loadFont(Jimp[fontInfo.name]);
                const textWidth = Jimp.measureText(font, textUpper);
                const textHeight = Jimp.measureTextHeight(font, textUpper, width - (padding * 2));
                if (textWidth <= (width - padding * 2) && textHeight <= (height - padding * 2)) {
                    selectedFont = font;
                    break;
                }
            } catch {_}{}
        }

        if (!selectedFont) selectedFont = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

        for (let i = 0; i < totalFrames; i++) {
            const scale = 1 + Math.sin((i / totalFrames) * Math.PI * 2) * 0.05;

            const frameImage = await new Jimp(width, height, bgColor);

            // ------------------------
            // FIX REAL (fondo transparente)
            // ------------------------
            const textImage = await new Jimp(width, height, 0x00000000); // <<< YA NO GENERA BORDES NEGROS
            textImage.print(selectedFont, 0, 0, textUpper);

            const scaledText = textImage.clone();
            scaledText.scale(scale);

            const baseTextWidth = Jimp.measureText(selectedFont, textUpper) * scale;
            const baseTextHeight = Jimp.measureTextHeight(selectedFont, textUpper, width) * scale;

            const x = Math.floor((width - baseTextWidth) / 2);
            const y = Math.floor((height - baseTextHeight) / 2);

            frameImage.composite(scaledText, x, y);
            frameImage.opaque();

            const framePath = path.join(tempDir, `frame-${String(i).padStart(3, '0')}.png`);
            await frameImage.writeAsync(framePath);
            frames.push(framePath);
        }

        const outputPath = path.join(tempDir, 'output.webp');

        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(path.join(tempDir, 'frame-%03d.png'))
                .inputOptions(['-framerate', '10', '-loop', '0'])
                .outputOptions([
                    '-vcodec', 'libwebp',
                    '-lossless', '1',
                    '-compression_level', '6',
                    '-q:v', '80',
                    '-preset', 'default',
                    '-an',
                    '-vsync', '0',
                    '-s', '512:512',
                    '-pix_fmt', 'yuva420p',
                    '-alpha_quality', '100'
                ])
                .save(outputPath)
                .on('end', resolve)
                .on('error', reject);
        });

        const stickerBuffer = await fs.readFile(outputPath);
        await fs.rm(tempDir, { recursive: true, force: true });
        return stickerBuffer;

    } catch (error) {
        if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
        throw error;
    }
}

export async function brat(ctx) {
  const text = (ctx.args || []).join(' ').trim();
  if (!text) return { success: true, message: 'ℹ️ Uso: /brat [texto]\nEjemplo: /brat Hola mundo', quoted: true };

  try {
    const imageBuffer = await generateBratStyleImage(text);

    let stickerBuffer = imageBuffer;
    try {
      const webpPath = path.join(tmpdir(), `brat-${Date.now()}.webp`);
      const pngPath = path.join(tmpdir(), `brat-${Date.now()}.png`);

      await fs.writeFile(pngPath, imageBuffer);

      await new Promise((resolve, reject) => {
        ffmpeg(pngPath)
          .outputOptions([
            '-vcodec', 'libwebp', '-vf', 'scale=512:512', '-compression_level', '6', '-q:v', '100', '-preset', 'picture', '-an', '-vsync', '0'
          ])
          .toFormat('webp')
          .save(webpPath)
          .on('end', resolve)
          .on('error', reject);
      });

      stickerBuffer = await fs.readFile(webpPath);

      await fs.unlink(pngPath).catch(() => {});
      await fs.unlink(webpPath).catch(() => {});
    } catch {}

    if (ctx.sock && ctx.remoteJid) {
      try {
        await ctx.sock.sendMessage(ctx.remoteJid, { sticker: stickerBuffer });
        return { success: true, sent: true };
      } catch {}
    }

    return { success: true, type: 'sticker', sticker: stickerBuffer, quoted: true };
  } catch(e) {
    return { success: false, message: `⚠️ Error generando sticker BRAT: ${e.message}`, quoted: true };
  }
}

export async function bratvd(ctx) {
    const text = (ctx.args || []).join(' ').trim();
    if (!text) return { success: true, message: 'ℹ️ Uso: /bratvd [texto]\nEjemplo: /bratvd Hola mundo', quoted: true };

    try {
        const imageBuffer = await generateAnimatedBratStyleImage(text);

        if (ctx.sock && ctx.remoteJid) {
          try {
            await ctx.sock.sendMessage(ctx.remoteJid, { sticker: imageBuffer });
            return { success: true, sent: true };
          } catch {}
        }

        return { success: true, type: 'sticker', sticker: imageBuffer, quoted: true };

    } catch(e) {
        return { success: false, message: `⚠️ Error generando sticker BRAT animado: ${e.message}`, quoted: true };
    }
}


