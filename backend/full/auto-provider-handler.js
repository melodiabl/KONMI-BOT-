import db from './db.js';
import { processWhatsAppMedia } from './file-manager.js';
import { analyzeContentWithAI } from './gemini-ai-handler.js';
import { normalizeAporteTipo } from './commands.js';
import fs from 'fs';
import path from 'path';

export async function processProviderMessage(message, groupJid, groupName) {
  try {
    // Verificar si el grupo es un grupo proveedor autorizado
    const grupo = await db('grupos_autorizados').where('jid', groupJid).first();
    if (!grupo) {
      throw new Error('No es grupo proveedor');
    }

    const usuario = message.key.participant || message.key.remoteJid;
    const fecha = new Date().toISOString();

    // Verificar si hay media en el mensaje
    const hasMedia = message.message.imageMessage ||
                     message.message.videoMessage ||
                     message.message.documentMessage ||
                     message.message.audioMessage;

    if (!hasMedia) {
      // Si no hay media, no procesar como aporte
      return { success: false, message: 'No hay media para procesar' };
    }

    // Obtener texto del mensaje para clasificación
    const messageText = message.message.conversation ||
                        message.message.extendedTextMessage?.text ||
                        message.message.imageMessage?.caption ||
                        message.message.videoMessage?.caption ||
                        message.message.documentMessage?.caption ||
                        'Media sin descripción';

    // Procesar la media
    const categoria = 'auto'; // Categoría por defecto para aportes automáticos
    const result = await processWhatsAppMedia(message, categoria, usuario);

    if (!result.success) {
      return { success: false, message: 'Error procesando media' };
    }

    // Analizar contenido con AI para clasificar
    let tipoClasificado = 'extra'; // Por defecto
    let capituloDetectado = null;
    let tituloDetectado = null;

    try {
      const aiAnalysis = await analyzeContentWithAI(messageText, result.filename);

      if (aiAnalysis.success && aiAnalysis.analysis) {
        tipoClasificado = aiAnalysis.analysis.tipo || tipoClasificado;
        capituloDetectado = aiAnalysis.analysis.capitulo;
        tituloDetectado = aiAnalysis.analysis.titulo;
      }
    } catch (aiError) {
      console.error('Error en análisis AI:', aiError);
      // Continuar sin AI si falla
    }

    // Normalizar tipo
    const tipoNormalizado = normalizeAporteTipo(tipoClasificado);

    // Crear nombre de carpeta basado en clasificación
    let carpetaDestino = tipoNormalizado;
    if (tituloDetectado) {
      carpetaDestino = `${tipoNormalizado}/${sanitizeFilename(tituloDetectado)}`;
    }
    if (capituloDetectado) {
      carpetaDestino = `${carpetaDestino}/Capitulo ${capituloDetectado}`;
    }

    // Crear estructura de carpetas
    const storagePath = path.join(process.cwd(), 'storage', 'media', carpetaDestino);
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }

    // Mover archivo a la carpeta clasificada si es diferente
    const archivoActual = result.filepath;
    const archivoNuevo = path.join(storagePath, path.basename(archivoActual));

    if (archivoActual !== archivoNuevo) {
      fs.renameSync(archivoActual, archivoNuevo);
      result.filepath = archivoNuevo;
    }

    // Registrar en la base de datos
    const aporteData = {
      contenido: tituloDetectado || result.filename,
      tipo: tipoNormalizado,
      usuario,
      grupo: groupJid,
      descripcion: messageText,
      archivo_path: result.filepath,
      estado: 'pendiente',
      fuente: 'auto_proveedor',
      metadata: JSON.stringify({
        proveedor: grupo.proveedor,
        capitulo: capituloDetectado,
        titulo: tituloDetectado,
        carpeta: carpetaDestino,
        mediaType: result.mediaType,
        size: result.size,
        grupoNombre: groupName
      }),
      fecha,
      updated_at: fecha
    };

    const [aporteId] = await db('aportes').insert(aporteData);
    const aporte = await db('aportes').where({ id: aporteId }).first();

    return {
      success: true,
      message: 'Aporte automático procesado correctamente',
      aporte,
      description: `Media clasificada como ${tipoNormalizado}${tituloDetectado ? ` - ${tituloDetectado}` : ''}${capituloDetectado ? ` Cap ${capituloDetectado}` : ''}`
    };

  } catch (error) {
    console.error('Error en processProviderMessage:', error);
    return { success: false, message: error.message };
  }
}

function sanitizeFilename(filename) {
  return filename.replace(/[^a-zA-Z0-9\s\-_]/g, '_').replace(/\s+/g, '_');
}
