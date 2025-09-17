import { db } from './index.js';
import { processWhatsAppMedia } from './file-manager.js';
import { analyzeProviderMessage } from './gemini-ai-handler.js';
import path from 'path';

/**
 * Sistema automático de procesamiento de aportes desde grupos proveedores
 */

/**
 * Detectar título de manhwa desde texto del mensaje
 */
function detectManhwaTitle(messageText, filename = '') {
  // Lista de títulos conocidos (se puede expandir)
  const knownTitles = [
    'jinx', 'painter of the night', 'killing stalking', 'bj alex',
    'cherry blossoms after winter', 'love is an illusion', 'warehouse',
    'sign', 'pearl boy', 'banana scandal', 'semantic error', 'viewfinder',
    'under the green light', 'define the relationship', 'love shuttle',
    'at the end of the road', 'walk on water', 'royal servant',
    'blood bank', 'ten count', 'given', 'doukyuusei', 'hitorijime my hero'
  ];

  const text = (messageText + ' ' + filename).toLowerCase();
  
  // Buscar títulos conocidos
  for (const title of knownTitles) {
    if (text.includes(title.toLowerCase())) {
      return title.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
    }
  }

  // Intentar extraer título de patrones comunes
  const patterns = [
    /(?:manhwa|manga|webtoon)[\s\-_]*([a-zA-Z\s]+?)[\s\-_]*(?:cap|chapter|ch|episodio|ep)/i,
    /([a-zA-Z\s]+?)[\s\-_]*(?:cap|chapter|ch|episodio|ep)[\s\-_]*\d+/i,
    /([a-zA-Z\s]{3,30})[\s\-_]*(?:extra|special|bonus)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim().split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
    }
  }

  return 'Desconocido';
}

/**
 * Detectar tipo de contenido
 */
function detectContentType(messageText, filename = '') {
  const text = (messageText + ' ' + filename).toLowerCase();
  
  // Patrones para diferentes tipos
  if (text.match(/(?:cap|chapter|ch|episodio|ep)[\s\-_]*\d+/i)) {
    return 'capítulo';
  }
  
  if (text.match(/(?:extra|special|bonus|omake|side)/i)) {
    return 'extra';
  }
  
  if (text.match(/(?:ilustr|art|fanart|cover|portada)/i)) {
    return 'ilustración';
  }
  
  if (text.match(/(?:pack|bundle|collection|vol|volume)/i)) {
    return 'pack';
  }

  // Detectar por extensión de archivo
  const extension = path.extname(filename).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extension)) {
    return 'ilustración';
  }
  
  if (['.pdf', '.cbr', '.cbz'].includes(extension)) {
    return 'capítulo';
  }

  return 'desconocido';
}

/**
 * Obtener información del grupo proveedor
 */
async function getProviderInfo(groupJid) {
  try {
    const provider = await db('grupos_autorizados')
      .where({ jid: groupJid, tipo: 'proveedor' })
      .first();
    return provider;
  } catch (error) {
    console.error('Error obteniendo info del proveedor:', error);
    return null;
  }
}

/**
 * Procesar mensaje automáticamente desde grupo proveedor
 */
async function processProviderMessage(message, groupJid, groupName) {
  try {
    // Verificar si es grupo proveedor
    const providerInfo = await getProviderInfo(groupJid);
    if (!providerInfo) {
      return null; // No es grupo proveedor
    }

    // Verificar si tiene media
    const hasMedia = message.message.imageMessage || 
                    message.message.videoMessage || 
                    message.message.documentMessage || 
                    message.message.audioMessage;

    if (!hasMedia) {
      return null; // No hay archivos para procesar
    }

    // Obtener texto del mensaje
    const messageText = message.message.conversation ||
                       message.message.extendedTextMessage?.text ||
                       message.message.imageMessage?.caption ||
                       message.message.videoMessage?.caption ||
                       message.message.documentMessage?.caption || '';

    // Obtener nombre del archivo si es documento
    const filename = message.message.documentMessage?.fileName || 
                    message.message.documentMessage?.title || '';

    // Usar IA de Gemini para análisis inteligente del contenido
    console.log(`🤖 Procesando con IA: "${messageText}" | Archivo: "${filename}"`);
    const aiAnalysis = await analyzeProviderMessage(messageText, filename, providerInfo.nombre || groupName);
    
    // Procesar y guardar el archivo
    const mediaResult = await processWhatsAppMedia(message, aiAnalysis.tipo, 'auto_provider');
    
    if (!mediaResult.success) {
      throw new Error('Error procesando media: ' + mediaResult.message);
    }

    // Usar datos del análisis de IA
    const manhwaTitle = aiAnalysis.titulo;
    const contentType = aiAnalysis.tipo;
    const descripcion = aiAnalysis.descripcion;
    const fecha = new Date().toISOString();

    // Guardar en tabla aportes (Knex)
    await db('aportes').insert({
      contenido: descripcion,
      tipo: 'proveedor_auto',
      usuario: 'sistema_auto',
      grupo: groupJid,
      fecha: fecha,
      archivo_path: mediaResult.filepath,
      archivo_size: mediaResult.size,
      proveedor: providerInfo.nombre || groupName,
      manhwa_titulo: manhwaTitle,
      contenido_tipo: contentType,
      mensaje_original: JSON.stringify({
        messageText: messageText,
        filename: filename,
        mediaType: mediaResult.mediaType,
        originalMessage: {
          id: message.key.id,
          timestamp: message.messageTimestamp
        }
      }),
      estado: 'pendiente'
    });

    // Registrar en logs
    await logProviderActivity('auto_procesado', descripcion, groupJid, providerInfo.nombre);

    console.log(`✅ Aporte automático procesado: ${descripcion} desde ${providerInfo.nombre}`);

    return {
      success: true,
      manhwaTitle,
      contentType,
      provider: providerInfo.nombre,
      filepath: mediaResult.filepath,
      size: mediaResult.size,
      description: descripcion
    };

  } catch (error) {
    console.error('Error procesando mensaje de proveedor:', error);
    
    // Registrar error en logs
    await logProviderActivity('error', error.message, groupJid, groupName);
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Registrar actividad de proveedores en logs
 */
async function logProviderActivity(tipo, descripcion, groupJid, providerName) {
  try {
    const fecha = new Date().toISOString();
    await db('logs').insert({
      tipo: 'proveedor',
      comando: tipo,
      usuario: 'sistema_auto',
      grupo: groupJid,
      fecha,
      detalles: JSON.stringify({ descripcion, proveedor: providerName, timestamp: fecha })
    });
  } catch (error) {
    console.error('Error registrando log de proveedor:', error);
  }
}

/**
 * Obtener estadísticas de aportes de proveedores
 */
async function getProviderStats() {
  try {
    const detallado = await db('aportes')
      .where({ tipo: 'proveedor_auto' })
      .select('proveedor', 'manhwa_titulo', 'contenido_tipo')
      .count('* as total')
      .sum({ total_size: 'archivo_size' })
      .max({ ultimo_aporte: 'fecha' })
      .groupBy('proveedor', 'manhwa_titulo', 'contenido_tipo')
      .orderBy('ultimo_aporte', 'desc');

    const resumen = await db('aportes')
      .where({ tipo: 'proveedor_auto' })
      .select('proveedor')
      .count('* as total_aportes')
      .sum({ espacio_usado: 'archivo_size' })
      .countDistinct({ manhwas_diferentes: 'manhwa_titulo' })
      .groupBy('proveedor')
      .orderBy('total_aportes', 'desc');

    return { detallado, resumen };
  } catch (error) {
    console.error('Error obteniendo estadísticas de proveedores:', error);
    return { detallado: [], resumen: [] };
  }
}

/**
 * Obtener aportes de proveedores para el panel
 */
async function getProviderAportes(filtros = {}) {
  try {
    let q = db('aportes')
      .where({ tipo: 'proveedor_auto' })
      .select(
        'id',
        'contenido',
        'manhwa_titulo',
        'contenido_tipo',
        'proveedor',
        'archivo_path',
        'archivo_size',
        'fecha',
        'mensaje_original',
        'grupo'
      );

    if (filtros.proveedor) q = q.andWhere('proveedor', filtros.proveedor);
    if (filtros.manhwa) q = q.andWhere('manhwa_titulo', 'like', `%${filtros.manhwa}%`);
    if (filtros.tipo) q = q.andWhere('contenido_tipo', filtros.tipo);
    if (filtros.fecha_desde) q = q.andWhere('fecha', '>=', filtros.fecha_desde);
    if (filtros.fecha_hasta) q = q.andWhere('fecha', '<=', filtros.fecha_hasta);

    const limit = filtros.limit || 100;
    const aportes = await q.orderBy('fecha', 'desc').limit(limit);

    return aportes.map((a) => ({
      id: a.id,
      titulo: a.manhwa_titulo,
      tipo: a.contenido_tipo,
      proveedor: a.proveedor,
      archivo: {
        path: a.archivo_path,
        size: a.archivo_size,
        nombre: a.archivo_path ? path.basename(a.archivo_path) : null,
      },
      fecha: a.fecha,
      descripcion: a.contenido,
      metadata: a.mensaje_original ? JSON.parse(a.mensaje_original) : {},
    }));
  } catch (error) {
    console.error('Error obteniendo aportes de proveedores:', error);
    return [];
  }
}

/**
 * Limpiar títulos de manhwa duplicados o mal detectados
 */
async function cleanupManhwaTitles() {
  try {
    const titles = await db('aportes')
      .where({ tipo: 'proveedor_auto' })
      .whereNot('manhwa_titulo', 'Desconocido')
      .select('manhwa_titulo')
      .count('* as count')
      .groupBy('manhwa_titulo')
      .orderBy('count', 'desc');

    console.log('📊 Títulos de manhwa detectados:');
    titles.forEach((t) => console.log(`  - ${t.manhwa_titulo}: ${t.count} aportes`));
    return titles;
  } catch (error) {
    console.error('Error limpiando títulos:', error);
    return [];
  }
}

export {
  processProviderMessage,
  getProviderStats,
  getProviderAportes,
  cleanupManhwaTitles,
  detectManhwaTitle,
  detectContentType
};
