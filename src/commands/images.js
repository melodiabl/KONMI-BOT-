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
    try {
        // Crear imagen con fondo verde lima estilo BRAT
        const width = 800;
        const height = 800;
        const image = new Jimp(width, height, '#8ACE00'); // Verde lima característico de BRAT

        // Cargar fuente más grande
        const font = await Jimp.loadFont(Jimp.FONT_SANS_128_BLACK);

        // Calcular dimensiones del texto
        const maxWidth = width - 100; // Margen
        const maxHeight = height - 100;

        // Imprimir texto centrado
        image.print(
            font,
            50, // x offset
            0, // y offset
            {
                text: text.toUpperCase(), // BRAT usa mayúsculas
                alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
                alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE,
            },
            maxWidth,
            height
        );

        return await image.getBufferAsync(Jimp.MIME_PNG);
    } catch (error) {
        console.error('Error en generateBratStyleImage:', error);
        throw error;
    }
}

async function generateAnimatedBratStyleImage(text) {
    const frames = [];
    let tempDir;

    try {
        tempDir = await fs.mkdtemp(path.join(tmpdir(), 'brat-'));
        const width = 512;
        const height = 512;
        const totalFrames = 20;

        // Generar frames con efecto de pulsación
        for (let i = 0; i < totalFrames; i++) {
            // Calcular escala con efecto de pulsación
            const scale = 1 + Math.sin((i / totalFrames) * Math.PI * 2) * 0.1;
            const currentWidth = Math.floor(width * scale);
            const currentHeight = Math.floor(height * scale);

            // Crear imagen base
            const baseImage = new Jimp(width, height, '#8ACE00');
            const textImage = new Jimp(currentWidth, currentHeight, '#8ACE00');

            const font = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);

            // Imprimir texto en la imagen temporal
            textImage.print(
                font,
                0,
                0,
                {
                    text: text.toUpperCase(),
                    alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
                    alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE,
                },
                currentWidth,
                currentHeight
            );

            // Centrar la imagen escalada en el canvas base
            const x = Math.floor((width - currentWidth) / 2);
            const y = Math.floor((height - currentHeight) / 2);

            baseImage.composite(textImage, x, y);

            const framePath = path.join(tempDir, `frame-${String(i).padStart(3, '0')}.png`);
            await baseImage.writeAsync(framePath);
            frames.push(framePath);
        }

        const outputPath = path.join(tempDir, 'output.webp');

        // Crear sticker animado con ffmpeg
        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(path.join(tempDir, 'frame-%03d.png'))
                .inputOptions(['-framerate', '15'])
                .outputOptions([
                    '-vcodec', 'libwebp',
                    '-loop', '0',
                    '-preset', 'default',
                    '-an',
                    '-vsync', '0',
                    '-s', '512:512'
                ])
                .toFormat('webp')
                .save(outputPath)
                .on('end', () => {
                    console.log('✅ Sticker animado generado exitosamente');
                    resolve();
                })
                .on('error', (err) => {
                    console.error('❌ Error en ffmpeg:', err);
                    reject(err);
                });
        });

        const stickerBuffer = await fs.readFile(outputPath);

        // Limpiar archivos temporales
        await fs.rm(tempDir, { recursive: true, force: true });

        return stickerBuffer;
    } catch (error) {
        console.error('Error en generateAnimatedBratStyleImage:', error);
        // Intentar limpiar en caso de error
        if (tempDir) {
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
            } catch (cleanupError) {
                console.error('Error limpiando archivos temporales:', cleanupError);
            }
        }
        throw error;
    }
}


export async function brat(ctx) {
  const text = (ctx.args || []).join(' ').trim();
  if (!text) {
    return {
      success: true,
      message: 'ℹ️ Uso: /brat [texto]\nEjemplo: /brat Hola mundo',
      quoted: true
    };
  }

  try {
    console.log('🎨 Generando sticker BRAT con texto:', text);
    const imageBuffer = await generateBratStyleImage(text);

    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error('Buffer de imagen vacío');
    }

    console.log('✅ Sticker BRAT generado, tamaño:', imageBuffer.length, 'bytes');

    // CRÍTICO: Enviar directamente usando sock si está disponible
    if (ctx.sock && ctx.remoteJid) {
      try {
        await ctx.sock.sendMessage(ctx.remoteJid, {
          sticker: imageBuffer
        });
        console.log('✅ Sticker enviado directamente via sock');
        return { success: true, sent: true };
      } catch (sendError) {
        console.error('❌ Error enviando con sock:', sendError);
        // Continuar al fallback
      }
    }

    // Fallback: retornar buffer directo (sin toMediaInput)
    return {
        success: true,
        type: 'sticker',
        sticker: imageBuffer, // Buffer directo
        // NO incluir 'message' para evitar que se envíe solo texto
        quoted: true
    };
  } catch(e) {
    console.error('❌ Error generando sticker BRAT:', e);
    return {
      success: false,
      message: `⚠️ Error generando sticker BRAT: ${e.message}`,
      quoted: true
    };
  }
}

export async function bratvd(ctx) {
    const text = (ctx.args || []).join(' ').trim();
    if (!text) {
      return {
        success: true,
        message: 'ℹ️ Uso: /bratvd [texto]\nEjemplo: /bratvd Hola mundo',
        quoted: true
      };
    }

    try {
        console.log('🎨 Generando sticker BRAT VD animado con texto:', text);
        const imageBuffer = await generateAnimatedBratStyleImage(text);

        if (!imageBuffer || imageBuffer.length === 0) {
          throw new Error('Buffer de sticker animado vacío');
        }

        console.log('✅ Sticker BRAT VD generado, tamaño:', imageBuffer.length, 'bytes');

        // CRÍTICO: Enviar directamente usando sock si está disponible
        if (ctx.sock && ctx.remoteJid) {
          try {
            await ctx.sock.sendMessage(ctx.remoteJid, {
              sticker: imageBuffer
            });
            console.log('✅ Sticker animado enviado directamente via sock');
            return { success: true, sent: true };
          } catch (sendError) {
            console.error('❌ Error enviando con sock:', sendError);
            // Continuar al fallback
          }
        }

        // Fallback: retornar buffer directo (sin toMediaInput)
        return {
            success: true,
            type: 'sticker',
            sticker: imageBuffer, // Buffer directo
            // NO incluir 'message' para evitar que se envíe solo texto
            quoted: true
        };
    } catch(e) {
        console.error('❌ Error generando sticker BRAT animado:', e);
        return {
          success: false,
          message: `⚠️ Error generando sticker BRAT animado: ${e.message}`,
          quoted: true
        };
    }
}
