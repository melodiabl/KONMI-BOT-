import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import db from '../database/db.js';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../');

// User-Agent para descargas directas (evitar cabecera vacía de Node)
const DEFAULT_WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DOWNLOAD_USER_AGENT = process.env.DOWNLOAD_USER_AGENT || process.env.YTDLP_USER_AGENT || process.env.YOUTUBE_UA || DEFAULT_WEB_UA;

// Directorio base para almacenar archivos descargados
const DOWNLOADS_DIR = path.join(PROJECT_ROOT, 'storage', 'downloads');
const MEDIA_DIR = path.join(PROJECT_ROOT, 'storage', 'media');

// Crear directorios si no existen
function ensureDirectoriesExist() {
  const dirs = [
    DOWNLOADS_DIR,
    MEDIA_DIR,
    path.join(DOWNLOADS_DIR, 'manhwas'),
    path.join(DOWNLOADS_DIR, 'series'),
    path.join(DOWNLOADS_DIR, 'extras'),
    path.join(DOWNLOADS_DIR, 'ilustraciones'),
    path.join(DOWNLOADS_DIR, 'packs'),
    path.join(MEDIA_DIR, 'images'),
    path.join(MEDIA_DIR, 'videos'),
    path.join(MEDIA_DIR, 'documents'),
    path.join(MEDIA_DIR, 'audio')
  ];

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(` Directorio creado: ${dir}`);
    }
  });
}

// Inicializar directorios
ensureDirectoriesExist();

/**
 * Descargar archivo desde URL
 * @param {string} url - URL del archivo a descargar
 * @param {string} filename - Nombre del archivo
 * @param {string} category - Categoria (manhwa, serie, extra, etc.)
 * @param {string} usuario - Usuario que solicita la descarga
 * @returns {Promise<Object>} Resultado de la descarga
 */
async function downloadFile(url, filename, category, usuario) {
  return new Promise((resolve, reject) => {
    try {
      // Validar URL
      if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
        reject(new Error('URL invalida'));
        return;
      }

      // Determinar directorio de destino
      const categoryDir = path.join(DOWNLOADS_DIR, category + 's');
      const filepath = path.join(categoryDir, filename);

      // Verificar si el archivo ya existe
      if (fs.existsSync(filepath)) {
        resolve({
          success: true,
          message: 'Archivo ya existe',
          filepath: filepath,
          size: fs.statSync(filepath).size,
          exists: true
        });
        return;
      }

      const protocol = url.startsWith('https://') ? https : http;

      const u = new URL(url);
      const options = {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + (u.search || ''),
        headers: {
          'User-Agent': DOWNLOAD_USER_AGENT,
          'Accept': '*/*',
          'Accept-Language': process.env.DOWNLOAD_ACCEPT_LANGUAGE || 'es-ES,es;q=0.9,en;q=0.8',
          'Referer': process.env.DOWNLOAD_REFERER || 'https://www.youtube.com/',
          // Evitar compresión rara en algunos proxys
          'Accept-Encoding': 'identity'
        }
      };

      const request = protocol.get(options, (response) => {
        // Verificar cdigo de respuesta
        if (response.statusCode !== 200) {
          reject(new Error(`Error HTTP: ${response.statusCode}`));
          return;
        }

        // Crear stream de escritura
        const fileStream = fs.createWriteStream(filepath);
        let downloadedBytes = 0;
        const totalBytes = parseInt(response.headers['content-length'] || '0');

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          fileStream.write(chunk);
        });

        response.on('end', async () => {
          fileStream.end();

          // Registrar descarga en base de datos
          await registerDownload(filename, filepath, category, usuario, downloadedBytes, url);

          resolve({
            success: true,
            message: 'Descarga completada',
            filepath: filepath,
            size: downloadedBytes,
            totalSize: totalBytes,
            exists: false
          });
        });

        response.on('error', (error) => {
          fileStream.destroy();
          if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
          }
          reject(error);
        });
      });

      request.on('error', (error) => {
        reject(error);
      });

      // Timeout de 30 segundos
      request.setTimeout(30000, () => {
        request.destroy();
        reject(new Error('Timeout de descarga'));
      });

    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Procesar archivo multimedia de WhatsApp
 * @param {Object} message - Mensaje de WhatsApp con media
 * @param {string} category - Categoria del archivo
 * @param {string} usuario - Usuario que envia el archivo
 * @returns {Promise<Object>} Resultado del procesamiento
 */
async function processWhatsAppMedia(message, category, usuario) {
  try {
    let mediaType = null;
    let mediaMessage = null;

    // Detectar tipo de media
    if (message.message.imageMessage) {
      mediaType = 'image';
      mediaMessage = message.message.imageMessage;
    } else if (message.message.videoMessage) {
      mediaType = 'video';
      mediaMessage = message.message.videoMessage;
    } else if (message.message.documentMessage) {
      mediaType = 'document';
      mediaMessage = message.message.documentMessage;
    } else if (message.message.audioMessage) {
      mediaType = 'audio';
      mediaMessage = message.message.audioMessage;
    } else {
      throw new Error('Tipo de media no soportado');
    }

    console.log(` Procesando media tipo: ${mediaType} de usuario: ${usuario}`);

    // Descargar media usando Baileys (stream -> Buffer)
    const stream = await downloadContentFromMessage(mediaMessage, mediaType);
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Generar nombre de archivo
    const timestamp = Date.now();
    const extension = getFileExtension(mediaMessage.mimetype || 'application/octet-stream');
    const filename = `${category}_${timestamp}_${usuario}.${extension}`;

    // Determinar directorio
    const mediaDir = path.join(MEDIA_DIR, mediaType + 's');
    const filepath = path.join(mediaDir, filename);

    // Guardar archivo
    try {
      fs.writeFileSync(filepath, buffer);
    } catch (fsError) {
      console.error('Error guardando archivo:', fsError);
      throw fsError;
    }

    // Registrar en base de datos
    try {
      await registerDownload(filename, filepath, category, usuario, buffer.length, 'whatsapp_media');
    } catch (dbError) {
      console.error('Error registrando descarga en DB:', dbError);
      throw dbError;
    }

    console.log(` Media procesada y guardada en: ${filepath}`);

    return {
      success: true,
      message: 'Media procesada correctamente',
      filepath: filepath,
      size: buffer.length,
      mediaType: mediaType,
      filename: filename
    };

  } catch (error) {
    console.error(' Error en processWhatsAppMedia:', error);
    throw error;
  }
}

/**
 * Registrar descarga en base de datos
 */
async function registerDownload(filename, filepath, category, usuario, size, source) {
  try {
    const fecha = new Date().toISOString();
    await db('descargas').insert({
      filename,
      filepath,
      category,
      usuario,
      size,
      source,
      fecha,
      estado: 'completada'
    });
  } catch (error) {
    console.error('Error registrando descarga:', error);
  }
}

/**
 * Obtener extension de archivo desde mimetype
 */
function getFileExtension(mimetype) {
  const mimeMap = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/avi': 'avi',
    'video/mov': 'mov',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'application/rar': 'rar',
    'text/plain': 'txt'
  };

  return mimeMap[mimetype] || 'bin';
}

/**
 * Listar archivos descargados por categoria
 */
async function listDownloads(category = null, usuario = null) {
  try {
    let query = db('descargas').select('*');
    if (category) query = query.where({ category });
    if (usuario) query = query.where({ usuario });
    const downloads = await query.orderBy('fecha', 'desc').limit(50);
    return downloads;
  } catch (error) {
    console.error('Error listando descargas:', error);
    return [];
  }
}

/**
 * Obtener estadisticas de descargas
 */
async function getDownloadStats() {
  try {
    const stats = await db('descargas')
      .select('category')
      .count({ total: 'id' })
      .sum({ total_size: 'size' })
      .avg({ avg_size: 'size' })
      .groupBy('category');

    const totals = await db('descargas')
      .count({ totalFiles: 'id' })
      .sum({ totalSize: 'size' })
      .first();

    return {
      byCategory: stats,
      totalFiles: Number(totals?.totalFiles || 0),
      totalSize: Number(totals?.totalSize || 0)
    };
  } catch (error) {
    console.error('Error obteniendo estadisticas:', error);
    return { byCategory: [], totalFiles: 0, totalSize: 0 };
  }
}

/**
 * Limpiar archivos antiguos (mas de 30 dias)
 */
async function cleanOldFiles() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const oldFiles = await db('descargas').where('fecha', '<', thirtyDaysAgo).select('*');

    let deletedCount = 0;
    let freedSpace = 0;

    for (const file of oldFiles) {
      try {
        if (fs.existsSync(file.filepath)) {
          const stats = fs.statSync(file.filepath);
          fs.unlinkSync(file.filepath);
          freedSpace += stats.size;
        }
        await db('descargas').where({ id: file.id }).del();
        deletedCount++;
      } catch (error) {
        console.error(`Error eliminando archivo ${file.filename}:`, error);
      }
    }

    return { deletedCount, freedSpace };
  } catch (error) {
    console.error('Error limpiando archivos antiguos:', error);
    return { deletedCount: 0, freedSpace: 0 };
  }
}

/**
 * Verificar espacio disponible
 */
function checkDiskSpace() {
  try {
    const stats = fs.statSync(DOWNLOADS_DIR);
    // Implementacion basica - en produccion usar librerias como 'check-disk-space'
    return {
      available: true,
      message: 'Espacio disponible'
    };
  } catch (error) {
    return {
      available: false,
      message: 'Error verificando espacio'
    };
  }
}

export {
  downloadFile,
  processWhatsAppMedia,
  listDownloads,
  getDownloadStats,
  cleanOldFiles,
  checkDiskSpace,
  DOWNLOADS_DIR,
  MEDIA_DIR
};
