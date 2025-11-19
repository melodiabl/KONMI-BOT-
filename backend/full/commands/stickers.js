// commands/stickers.js — utilidades de stickers robustecidas con Sharp (lazy) y FFmpeg
import { downloadContentFromMessage } from '@whiskeysockets/baileys'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegInstaller from 'ffmpeg-static' // <--- IMPORTACIÓN AGREGADA
import axios from 'axios'
import { tmpdir } from 'os'
import { promises as fs } from 'fs'
import path from 'path'
import { exec } from 'child_process'

// <--- CONFIGURACIÓN AGREGADA: Vincula el ejecutable al sistema
ffmpeg.setFfmpegPath(ffmpegInstaller) 

// Función para ejecutar comandos de forma asíncrona
const execAsync = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return reject(error);
      }
      resolve(stdout.trim());
    });
  });
};


/**
 * Crea un sticker a partir de una imagen o video, procesándolo para asegurar compatibilidad.
 * @param {object} ctx - El contexto del mensaje, que incluye el socket y el mensaje original.
 */
export async function sticker(ctx) {
  const { sock, message } = ctx;
  const quoted = message?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const mediaMessage = quoted || message?.message;

  const imageMessage = mediaMessage?.imageMessage;
  const videoMessage = mediaMessage?.videoMessage;

  if (!imageMessage && !videoMessage) {
    return {
      success: false,
      message: 'ℹ️ Responde a una imagen o video con el comando /sticker para convertirlo.',
    };
  }

  const mediaType = imageMessage ? 'image' : 'video';
  const media = imageMessage || videoMessage;

  try {
    const stream = await downloadContentFromMessage(media, mediaType);
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const mediaBuffer = Buffer.concat(chunks);

    let stickerBuffer;

    const stickerOptions = {
      pack: 'Konmi Bot',
      author: ctx.pushName || 'Creado por Konmi',
      type: 'full', // 'full', 'crop', 'circle'
    };

    if (mediaType === 'image') {
      // Importar sharp en runtime para evitar fallos de carga del módulo
      let sharp
      try { sharp = (await import('sharp')).default } catch {}
      if (!sharp) {
        return { success: false, message: '⚠️ Falta dependencia "sharp" para crear stickers desde imagen. Instala con: npm i sharp', quoted: true }
      }
      stickerBuffer = await sharp(mediaBuffer)
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp()
        .toBuffer();
    } else { // mediaType === 'video'
      const tempInputPath = path.join(tmpdir(), `sticker_input_${Date.now()}.mp4`);
      const tempOutputPath = path.join(tmpdir(), `sticker_output_${Date.now()}.webp`);
      await fs.writeFile(tempInputPath, mediaBuffer);

      await new Promise((resolve, reject) => {
        ffmpeg(tempInputPath)
          .outputOptions([
            '-vcodec', 'libwebp',
            '-vf', "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease,fps=15, pad=512:512:-1:-1:color=0x00000000",
            '-loop', '0',
            '-ss', '00:00:00.0',
            '-t', '00:00:07.0', // Duración máxima de 7 segundos
            '-preset', 'default',
            '-an',
            '-vsync', '0',
            '-s', '512:512'
          ])
          .toFormat('webp')
          .save(tempOutputPath)
          .on('end', resolve)
          .on('error', reject);
      });

      stickerBuffer = await fs.readFile(tempOutputPath);
      await fs.unlink(tempInputPath);
      await fs.unlink(tempOutputPath);
    }

    return {
      type: 'sticker',
      sticker: stickerBuffer,
    };

  } catch (error) {
    console.error('Error creando sticker:', error);
    return {
      success: false,
      message: `⚠️ Ocurrió un error al procesar el medio. Asegúrate de que no esté corrupto.\n\nError: ${error.message}`,
    };
  }
}


export async function stickerUrl({ args }) {
  const url = (args || [])[0];
  if (!url || !/^https?:\/\//i.test(url)) {
    return { success: false, message: 'ℹ️ Uso: /stickerurl <url de imagen/webp>' };
  }

  try {
    // Descargar la imagen desde la URL
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(response.data, 'binary');

    // Procesar con Sharp para asegurar que sea un sticker válido
    let sharp
    try { sharp = (await import('sharp')).default } catch {}
    if (!sharp) {
      return { success: false, message: '⚠️ Falta dependencia "sharp" para crear stickers desde URL. Instala con: npm i sharp', quoted: true }
    }
    const stickerBuffer = await sharp(imageBuffer)
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp()
      .toBuffer();

    return { type: 'sticker', sticker: stickerBuffer };
  } catch (error) {
    console.error('Error en stickerurl:', error);
    return { success: false, message: '⚠️ No pude crear el sticker desde esa URL. ¿Es una imagen válida?' };
  }
}

/**
 * Convierte un sticker de vuelta a una imagen.
 */
export async function toimg({ sock, message }) {
  const quoted = message?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const stickerMessage = quoted?.stickerMessage || message?.message?.stickerMessage;

  if (!stickerMessage) {
    return { success: false, message: 'ℹ️ Responde a un sticker con /toimg para convertirlo en imagen.' };
  }

  try {
    const stream = await downloadContentFromMessage(stickerMessage, 'sticker');
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const stickerBuffer = Buffer.concat(chunks);

    let imageBuffer;
    // Usamos Sharp (si está disponible) para una conversión más segura a PNG
    if (stickerMessage.isAnimated) {
        // Para stickers animados, necesitamos webp-js o similar para decodificar frames.
        // Por simplicidad, por ahora solo manejaremos la conversión de stickers estáticos.
        // Una alternativa es usar ffmpeg para convertir webp animado a gif o mp4.
        const tempInputPath = path.join(tmpdir(), `sticker_input_${Date.now()}.webp`);
        const tempOutputPath = path.join(tmpdir(), `sticker_output_${Date.now()}.gif`);
        await fs.writeFile(tempInputPath, stickerBuffer);

        // Usamos el path del instalador también aquí para asegurar que funcione el exec
        await execAsync(`"${ffmpegInstaller}" -i ${tempInputPath} ${tempOutputPath}`);

        const gifBuffer = await fs.readFile(tempOutputPath);

        await fs.unlink(tempInputPath);
        await fs.unlink(tempOutputPath);

        // Enviar como video para preservar la animación (los GIFs se envían como video en WhatsApp)
        return {
            type: 'video',
            video: gifBuffer,
            caption: '🖼️ Sticker animado → GIF',
            gifPlayback: true
        };
    } else {
        let sharp
        try { sharp = (await import('sharp')).default } catch {}
        if (!sharp) {
          return { success: false, message: '⚠️ Falta dependencia "sharp" para convertir a imagen. Instala con: npm i sharp', quoted: true }
        }
        imageBuffer = await sharp(stickerBuffer).png().toBuffer();
         return {
            type: 'image',
            image: imageBuffer,
            caption: '🖼️ Sticker → Imagen',
        };
    }

  } catch (error) {
    console.error('Error en toimg:', error);
    return { success: false, message: `⚠️ No pude convertir el sticker. ¿Es un formato válido?\n\nError: ${error.message}` };
  }
}

export default { sticker, stickerUrl, toimg };