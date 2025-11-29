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
        console.log('📝 Generando imagen BRAT con texto:', text);

        const width = 512;
        const height = 512;
        const padding = 40; // Margen desde los bordes

        // Crear imagen con fondo verde BRAT
        const image = await new Jimp(width, height, 0x8ACE00);
        console.log('✅ Imagen base creada:', width, 'x', height);

        // Texto en mayúsculas estilo BRAT
        const textUpper = text.toUpperCase();
        console.log('📝 Texto a renderizar:', textUpper);

        // Intentar diferentes tamaños de fuente hasta encontrar el que mejor se ajuste
        const fontSizes = [
            { name: 'FONT_SANS_128_BLACK', size: 128 },
            { name: 'FONT_SANS_64_BLACK', size: 64 },
            { name: 'FONT_SANS_32_BLACK', size: 32 },
            { name: 'FONT_SANS_16_BLACK', size: 16 }
        ];

        let selectedFont = null;
        let selectedFontSize = 0;

        for (const fontInfo of fontSizes) {
            try {
                const font = await Jimp.loadFont(Jimp[fontInfo.name]);
                const textWidth = Jimp.measureText(font, textUpper);
                const textHeight = Jimp.measureTextHeight(font, textUpper, width - (padding * 2));

                // Verificar si el texto cabe con este tamaño de fuente
                if (textWidth <= (width - padding * 2) && textHeight <= (height - padding * 2)) {
                    selectedFont = font;
                    selectedFontSize = fontInfo.size;
                    console.log(`✅ Fuente seleccionada: ${fontInfo.name} (${fontInfo.size}px)`);
                    console.log(`📏 Dimensiones del texto: ${textWidth}x${textHeight}`);
                    break;
                }
            } catch (fontError) {
                console.warn(`⚠️ No se pudo cargar ${fontInfo.name}, probando siguiente...`);
                continue;
            }
        }

        // Si no se encontró fuente que ajuste, usar la más pequeña disponible
        if (!selectedFont) {
            selectedFont = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
            selectedFontSize = 16;
            console.log('⚠️ Texto muy largo, usando fuente mínima: 16px');
        }

        // Calcular el ancho real del texto con la fuente seleccionada
        const textWidth = Jimp.measureText(selectedFont, textUpper);
        const textHeight = Jimp.measureTextHeight(selectedFont, textUpper, width - (padding * 2));

        // Calcular posición centrada
        const x = Math.floor((width - textWidth) / 2);
        const y = Math.floor((height - textHeight) / 2);

        console.log(`📍 Posición centrada: x=${x}, y=${y}`);

        // Imprimir texto centrado
        image.print(
            selectedFont,
            x,
            y,
            textUpper
        );

        console.log('✅ Texto impreso en la imagen');

        // Asegurar que la imagen sea opaca
        image.opaque();
        console.log('✅ Imagen hecha opaca');

        // Convertir a buffer PNG
        const buffer = await image.getBufferAsync(Jimp.MIME_PNG);
        console.log('✅ Buffer PNG generado, tamaño:', buffer.length, 'bytes');

        if (!buffer || buffer.length === 0) {
            throw new Error('Buffer PNG está vacío');
        }

        return buffer;
    } catch (error) {
        console.error('❌ Error en generateBratStyleImage:', error);
        console.error('Stack:', error.stack);
        throw error;
    }
}

async function generateAnimatedBratStyleImage(text) {
    const frames = [];
    let tempDir;

    try {
        console.log('🎬 Iniciando generación de sticker animado BRAT');
        tempDir = await fs.mkdtemp(path.join(tmpdir(), 'brat-'));
        console.log('📁 Directorio temporal creado:', tempDir);

        const width = 512;
        const height = 512;
        const padding = 40;
        const totalFrames = 15;
        const bgColor = 0x8ACE00;

        const textUpper = text.toUpperCase();

        // Seleccionar tamaño de fuente óptimo
        const fontSizes = [
            { name: 'FONT_SANS_128_BLACK', size: 128 },
            { name: 'FONT_SANS_64_BLACK', size: 64 },
            { name: 'FONT_SANS_32_BLACK', size: 32 },
            { name: 'FONT_SANS_16_BLACK', size: 16 }
        ];

        let selectedFont = null;
        let selectedFontSize = 0;

        for (const fontInfo of fontSizes) {
            try {
                const font = await Jimp.loadFont(Jimp[fontInfo.name]);
                const textWidth = Jimp.measureText(font, textUpper);
                const textHeight = Jimp.measureTextHeight(font, textUpper, width - (padding * 2));

                if (textWidth <= (width - padding * 2) && textHeight <= (height - padding * 2)) {
                    selectedFont = font;
                    selectedFontSize = fontInfo.size;
                    console.log(`✅ Fuente seleccionada para animación: ${fontInfo.name} (${fontInfo.size}px)`);
                    break;
                }
            } catch (fontError) {
                continue;
            }
        }

        if (!selectedFont) {
            selectedFont = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
            selectedFontSize = 16;
            console.log('⚠️ Texto muy largo, usando fuente mínima: 16px');
        }

        // Generar frames con efecto de pulsación
        for (let i = 0; i < totalFrames; i++) {
            // Efecto de escala pulsante (0.95 a 1.05)
            const scale = 1 + Math.sin((i / totalFrames) * Math.PI * 2) * 0.05;

            // Crear frame base
            const frameImage = await new Jimp(width, height, bgColor);

            // Calcular dimensiones del texto base
            const baseTextWidth = Jimp.measureText(selectedFont, textUpper);
            const baseTextHeight = Jimp.measureTextHeight(selectedFont, textUpper, width - (padding * 2));

            // Aplicar escala
            const scaledWidth = baseTextWidth * scale;
            const scaledHeight = baseTextHeight * scale;

            // Calcular posición centrada con escala
            const x = Math.floor((width - scaledWidth) / 2);
            const y = Math.floor((height - scaledHeight) / 2);

            // Crear imagen temporal para el texto
            const textImage = await new Jimp(width, height, bgColor);
            textImage.print(selectedFont, 0, 0, textUpper);

            // Escalar el texto si es necesario
            if (scale !== 1) {
                const scaledTextImage = textImage.clone();
                scaledTextImage.scale(scale);

                // Componer en el frame centrado
                frameImage.composite(scaledTextImage, x, y);
            } else {
                frameImage.print(selectedFont, x, y, textUpper);
            }

            // Hacer opaca
            frameImage.opaque();

            const framePath = path.join(tempDir, `frame-${String(i).padStart(3, '0')}.png`);
            await frameImage.writeAsync(framePath);
            frames.push(framePath);

            if (i % 5 === 0) {
                console.log(`📸 Frame ${i + 1}/${totalFrames} generado`);
            }
        }

        console.log(`✅ ${totalFrames} frames generados, creando WebP...`);
        const outputPath = path.join(tempDir, 'output.webp');

        // Crear sticker animado con ffmpeg
        await new Promise((resolve, reject) => {
            const ffmpegCmd = ffmpeg()
                .input(path.join(tempDir, 'frame-%03d.png'))
                .inputOptions([
                    '-framerate', '10',
                    '-loop', '0'
                ])
                .outputOptions([
                    '-vcodec', 'libwebp',
                    '-lossless', '0',
                    '-compression_level', '6',
                    '-q:v', '80',
                    '-preset', 'default',
                    '-an',
                    '-vsync', '0',
                    '-s', '512:512'
                ])
                .toFormat('webp')
                .save(outputPath);

            ffmpegCmd.on('start', (cmd) => {
                console.log('🎥 Comando ffmpeg iniciado');
            });

            ffmpegCmd.on('progress', (progress) => {
                if (progress.percent) {
                    console.log(`⏳ Progreso: ${Math.round(progress.percent)}%`);
                }
            });

            ffmpegCmd.on('end', () => {
                console.log('✅ Sticker animado generado exitosamente');
                resolve();
            });

            ffmpegCmd.on('error', (err) => {
                console.error('❌ Error en ffmpeg:', err);
                reject(err);
            });
        });

        const stickerBuffer = await fs.readFile(outputPath);
        console.log('✅ Buffer WebP leído, tamaño:', stickerBuffer.length, 'bytes');

        // Limpiar archivos temporales
        await fs.rm(tempDir, { recursive: true, force: true });
        console.log('🧹 Archivos temporales eliminados');

        return stickerBuffer;
    } catch (error) {
        console.error('❌ Error en generateAnimatedBratStyleImage:', error);
        console.error('Stack:', error.stack);

        if (tempDir) {
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
                console.log('🧹 Limpieza de emergencia completada');
            } catch (cleanupError) {
                console.error('❌ Error limpiando archivos temporales:', cleanupError);
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

    // Convertir PNG a WebP para mejor compatibilidad con WhatsApp
    let stickerBuffer = imageBuffer;
    try {
      console.log('🔄 Convirtiendo PNG a WebP...');
      const webpPath = path.join(tmpdir(), `brat-${Date.now()}.webp`);
      const pngPath = path.join(tmpdir(), `brat-${Date.now()}.png`);

      // Guardar PNG temporal
      await fs.writeFile(pngPath, imageBuffer);

      // Convertir a WebP usando ffmpeg
      await new Promise((resolve, reject) => {
        ffmpeg(pngPath)
          .outputOptions([
            '-vcodec', 'libwebp',
            '-vf', 'scale=512:512',
            '-compression_level', '6',
            '-q:v', '100',
            '-preset', 'picture',
            '-an',
            '-vsync', '0'
          ])
          .toFormat('webp')
          .save(webpPath)
          .on('end', async () => {
            console.log('✅ Conversión a WebP completada');
            resolve();
          })
          .on('error', (err) => {
            console.error('❌ Error en conversión WebP:', err);
            reject(err);
          });
      });

      // Leer WebP
      stickerBuffer = await fs.readFile(webpPath);
      console.log('✅ WebP leído, tamaño:', stickerBuffer.length, 'bytes');

      // Limpiar archivos temporales
      try {
        await fs.unlink(pngPath);
        await fs.unlink(webpPath);
      } catch (cleanupError) {
        console.warn('⚠️ No se pudieron eliminar archivos temporales:', cleanupError);
      }
    } catch (conversionError) {
      console.warn('⚠️ No se pudo convertir a WebP, usando PNG:', conversionError.message);
      // Continuar con PNG si la conversión falla
    }

    // CRÍTICO: Enviar directamente usando sock si está disponible
    if (ctx.sock && ctx.remoteJid) {
      try {
        await ctx.sock.sendMessage(ctx.remoteJid, {
          sticker: stickerBuffer
        });
        console.log('✅ Sticker enviado directamente via sock');
        return { success: true, sent: true };
      } catch (sendError) {
        console.error('❌ Error enviando con sock:', sendError);
        // Continuar al fallback
      }
    }

    // Fallback: retornar buffer directo
    return {
        success: true,
        type: 'sticker',
        sticker: stickerBuffer,
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
