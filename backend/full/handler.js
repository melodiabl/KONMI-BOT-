// handler.js
// Handler principal para logica de aportes, media, pedidos y proveedores

import db from './db.js';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { processWhatsAppMedia } from './file-manager.js';


/**
 * Agrega un aporte al sistema
 * @param {Object} params - { usuario, grupo, tipo, contenido, descripcion, mediaPath, estado, fuente, metadata }
 * @returns {Promise<{success: boolean, message: string, aporte?: any}>}
 */
export async function addAporte({ usuario, grupo, tipo, contenido, descripcion = '', mediaPath = null, estado = 'pendiente', fuente = '', metadata = {} }) {
  try {
    const fecha = new Date().toISOString();
    const aporteData = {
      usuario,
      grupo,
      tipo,
      contenido,
      descripcion,
      archivo_path: mediaPath,
      estado,
      fuente,
      metadata: JSON.stringify(metadata),
      fecha,
      updated_at: fecha
    };
    const [id] = await db('aportes').insert(aporteData);
    const aporte = await db('aportes').where({ id }).first();
    return { success: true, message: 'Aporte registrado correctamente.', aporte };
  } catch (error) {
    return { success: false, message: 'Error al registrar aporte: ' + error.message };
  }
}

/**
 * Agrega un pedido al sistema
 * @param {Object} params - { usuario, grupo, contenido, fecha }
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function addPedido({ usuario, grupo, contenido, fecha }) {
  try {
    await db('pedidos').insert({
      texto: contenido,
      estado: 'pendiente',
      usuario,
      grupo,
      fecha
    });
    return { success: true, message: 'Pedido registrado correctamente.' };
  } catch (error) {
    return { success: false, message: 'Error al registrar pedido: ' + error.message };
  }
}

/**
 * Agrega un proveedor al sistema
 * @param {Object} params - { grupo, tipo, descripcion, activo }
 * @returns {Promise<{success: boolean, message: string, proveedor?: any}>}
 */
export async function addProveedor({ grupo, tipo, descripcion, activo = true }) {
  try {
    const fecha = new Date().toISOString();
    const proveedorData = {
      grupo_jid: grupo,
      tipo,
      descripcion,
      activo,
      fecha_creacion: fecha,
      updated_at: fecha
    };
    const [id] = await db('proveedores').insert(proveedorData);
    const proveedor = await db('proveedores').where({ id }).first();
    return { success: true, message: 'Proveedor registrado correctamente.', proveedor };
  } catch (error) {
    return { success: false, message: 'Error al registrar proveedor: ' + error.message };
  }
}

// Funciones adicionales de comandos que se movieron desde commands.js

/**
 * Normaliza el tipo de aporte
 */
export function normalizeAporteTipo(raw) {
  if (!raw) return 'extra';
  const v = String(raw).trim().toLowerCase();
  const map = {
    'manhwa': 'manhwa',
    'manhwas': 'manhwa',
    'manhwas_bls': 'manhwas_bls',
    'manhwa bls': 'manhwas_bls',
    'bls': 'manhwas_bls',
    'serie': 'series',
    'series': 'series',
    'series_videos': 'series_videos',
    'series videos': 'series_videos',
    'series_bls': 'series_bls',
    'series bls': 'series_bls',
    'anime': 'anime',
    'anime_bls': 'anime_bls',
    'anime bls': 'anime_bls',
    'extra': 'extra',
    'extra_imagen': 'extra_imagen',
    'extra imagen': 'extra_imagen',
    'imagen': 'extra_imagen',
    'ilustracion': 'ilustracion',
    'ilustracion': 'ilustracion',
    'ilustraciones': 'ilustracion',
    'pack': 'pack'
  };
  return map[v] || v.replace(/\s+/g, '_');
}

/**
 * Handle the /aportar command to save a new aporte in the database.
 * @param {string} contenido - The content description or title.
 * @param {string} tipo - The type of content (e.g., 'manhwa', 'ilustracion', 'extra').
 * @param {string} usuario - The user who sent the aporte.
 * @param {string} grupo - The group where the aporte was sent.
 * @param {string} fecha - The date/time of the aporte.
 */
export async function handleAportar(contenido, tipo, usuario, grupo, fecha) {
  try {
    const tipoNorm = normalizeAporteTipo(tipo);
    // Usar el handler principal
    return await addAporte({ contenido, tipo: tipoNorm, usuario, grupo, fecha });
  } catch (error) {
    return { success: false, message: error.message };
  }
}

/**
 * Handle the /pedido [contenido] - Hace un pedido y busca en la base de datos si existe
 */
export async function handlePedido(contenido, usuario, grupo, fecha) {
  try {
    const { getSocket } = await import('./whatsapp.js');
    const sock = getSocket();
    const remoteJid = grupo || usuario;

    // Buscar en manhwas
    const manhwaEncontrado = await db.get(
      'SELECT * FROM manhwas WHERE titulo LIKE ? OR titulo LIKE ?',
      [`%${contenido}%`, `${contenido}%`]
    );

    // Buscar en aportes
    const aporteEncontrado = await db.get(
      'SELECT * FROM aportes WHERE contenido LIKE ? OR contenido LIKE ?',
      [`%${contenido}%`, `${contenido}%`]
    );

    // Buscar en archivos descargados
    const archivosEncontrados = await db.all(
      'SELECT * FROM descargas WHERE filename LIKE ? OR filename LIKE ?',
      [`%${contenido}%`, `${contenido}%`]
    );

    // Registrar el pedido en la base de datos
    const stmt = await db.prepare(
      'INSERT INTO pedidos (texto, estado, usuario, grupo, fecha) VALUES (?, ?, ?, ?, ?)'
    );
    await stmt.run(contenido, 'pendiente', usuario, grupo, fecha);
    await stmt.finalize();

    let response = ` *Pedido registrado:* "${contenido}"\n\n`;

    // Si encontr contenido, mencionarlo
    if (manhwaEncontrado) {
      response += ` *Encontrado en manhwas!*\n`;
      response += ` **${manhwaEncontrado.titulo}**\n`;
      response += ` Autor: ${manhwaEncontrado.autor}\n`;
      response += ` Estado: ${manhwaEncontrado.estado}\n`;
      if (manhwaEncontrado.descripcion) {
        response += ` ${manhwaEncontrado.descripcion}\n`;
      }
      if (manhwaEncontrado.url) {
        response += ` ${manhwaEncontrado.url}\n`;
      }
      response += `\n`;
    }

    if (aporteEncontrado) {
      response += ` *Encontrado en aportes!*\n`;
      response += ` **${aporteEncontrado.contenido}**\n`;
      response += ` Tipo: ${aporteEncontrado.tipo}\n`;
      {
        const num = String(aporteEncontrado.usuario || '').split('@')[0].split(':')[0];
        const u = await db('usuarios').where({ whatsapp_number: num }).select('username').first();
        const wa = u?.username ? null : await db('wa_contacts').where({ wa_number: num }).select('display_name').first();
        const mention = `@${u?.username || wa?.display_name || num}`;
        response += ` Aportado por: ${mention}\n`;
      }
      response += ` Fecha: ${new Date(aporteEncontrado.fecha).toLocaleDateString()}\n\n`;
    }

    // Buscar y enviar archivos fsicos si existen
    let archivosEnviados = 0;
    if (archivosEncontrados.length > 0 && sock) {
      response += ` *Archivos encontrados:*\n`;

      for (const archivo of archivosEncontrados.slice(0, 5)) { // Mximo 5 archivos
        try {
          const archivoPath = path.join(process.cwd(), 'storage', 'downloads', archivo.category, archivo.filename);

          if (fs.existsSync(archivoPath)) {
            const fileBuffer = fs.readFileSync(archivoPath);
            const fileExtension = path.extname(archivo.filename).toLowerCase();

            let mediaType = 'document';
            if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(fileExtension)) {
              mediaType = 'image';
            } else if (['.mp4', '.avi', '.mkv', '.mov'].includes(fileExtension)) {
              mediaType = 'video';
            } else if (['.mp3', '.wav', '.m4a'].includes(fileExtension)) {
              mediaType = 'audio';
            }

            // Enviar el archivo
            let sentMessage;
            if (mediaType === 'image') {
              sentMessage = await sock.sendMessage(remoteJid, {
                image: fileBuffer,
                caption: ` ${archivo.filename}\n ${archivo.category}\n Subido por: ${archivo.usuario}\n ${new Date(archivo.fecha).toLocaleDateString()}`
              });
            } else if (mediaType === 'video') {
              sentMessage = await sock.sendMessage(remoteJid, {
                video: fileBuffer,
                caption: ` ${archivo.filename}\n ${archivo.category}`
              });
            } else if (mediaType === 'audio') {
              sentMessage = await sock.sendMessage(remoteJid, {
                audio: fileBuffer,
                mimetype: 'audio/mpeg'
              });
            } else {
              sentMessage = await sock.sendMessage(remoteJid, {
                document: fileBuffer,
                fileName: archivo.filename,
                caption: ` ${archivo.filename}\n ${archivo.category}`
              });
            }

            response += ` *Enviado:* ${archivo.filename} (${archivo.category})\n`;
            archivosEnviados++;

            // Marcar el pedido como completado si se envi al menos un archivo
            if (archivosEnviados === 1) {
              await db('pedidos')
                .where({ texto: contenido, usuario: usuario, grupo: grupo })
                .update({ estado: 'completado', completado_por: 'bot', fecha_completado: new Date().toISOString() });
            }
          }
        } catch (fileError) {
          console.error(`Error enviando archivo ${archivo.filename}:`, fileError);
          response += ` Error enviando: ${archivo.filename}\n`;
        }
      }

      if (archivosEnviados === 0) {
        response += ` Archivos encontrados pero no se pudieron enviar\n`;
      }
    }

    if (!manhwaEncontrado && !aporteEncontrado && archivosEnviados === 0) {
      response += ` *No encontrado en la base de datos*\n`;
      response += `Tu pedido ha sido registrado y ser revisado por los administradores.\n`;
    } else if (archivosEnviados > 0) {
      response += `\n *Pedido completado automticamente!* `;
    }

    return { success: true, message: response };
  } catch (error) {
    console.error('Error en handlePedido:', error);
    return { success: false, message: 'Error al procesar pedido.' };
  }
}

/**
 * /pedidos - Muestra los pedidos del usuario
 */
export async function handlePedidos(usuario, grupo) {
  try {
    const pedidos = await db.all(
      'SELECT * FROM pedidos WHERE usuario = ? ORDER BY fecha DESC LIMIT 10',
      [usuario]
    );

    if (pedidos.length === 0) {
      return { success: true, message: ' No tienes pedidos registrados.' };
    }

    let message = ` *Tus pedidos (${pedidos.length}):*\n\n`;
    pedidos.forEach((pedido, index) => {
      const fecha = new Date(pedido.fecha).toLocaleDateString();
      const estado = pedido.estado === 'pendiente' ? '' : pedido.estado === 'completado' ? '' : '';
      message += `${index + 1}. ${estado} ${pedido.texto}\n`;
      message += `    ${fecha} - Estado: ${pedido.estado}\n\n`;
    });

    return { success: true, message };
  } catch (error) {
    return { success: false, message: 'Error al obtener pedidos.' };
  }
}

// =====================
// AI: Gemini helpers and commands (consolidated)
// =====================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

export async function analyzeContentWithAI(content, filename = '') {
  try {
    if (!GEMINI_API_KEY) {
      return { success: false, error: 'GEMINI_API_KEY no configurada' };
    }

    const prompt = `
Analiza el siguiente contenido de un mensaje de WhatsApp y clasificalo:

Contenido del mensaje: "${content}"
Nombre del archivo: "${filename}"

Responde en formato JSON con la siguiente estructura:
{
  "tipo": "manhwa|serie|extra|ilustracion|pack|anime|otros",
  "titulo": "Ttulo detectado o null",
  "capitulo": "Nmero de captulo detectado o null",
  "confianza": 0-100,
  "descripcion": "Breve descripcin del contenido"
}

Reglas de clasificacin:
- Si menciona "manhwa", "manga", "comic"  tipo: "manhwa"
- Si menciona "serie", "episodio", "temporada"  tipo: "serie"
- Si menciona "ilustracion", "fanart", "arte"  tipo: "ilustracion"
- Si menciona "pack", "coleccion"  tipo: "pack"
- Si menciona "anime", "animacion"  tipo: "anime"
- Por defecto: "extra"

Busca nmeros que parezcan captulos (ej: "cap 45", "episodio 12", "volumen 3").
Extrae ttulos que parezcan nombres de obras.
`;

    const response = await axios.post(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      contents: [{ parts: [{ text: prompt }] }]
    }, { headers: { 'Content-Type': 'application/json' } });

    const aiResponse = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!aiResponse) return { success: false, error: 'No se recibi respuesta de la IA' };

    let analysis;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) analysis = JSON.parse(jsonMatch[0]);
      else throw new Error('No se encontro JSON valido');
    } catch (parseError) {
      console.error('Error parseando respuesta AI:', parseError);
      return { success: false, error: 'Error parseando respuesta de la IA' };
    }

    return {
      success: true,
      analysis: {
        tipo: analysis.tipo || 'extra',
        titulo: analysis.titulo || null,
        capitulo: analysis.capitulo || null,
        confianza: analysis.confianza || 50,
        descripcion: analysis.descripcion || content
      }
    };

  } catch (error) {
    console.error('Error en analyzeContentWithAI:', error);
    return { success: false, error: error.message };
  }
}

export async function chatWithAI(message, context = '') {
  try {
    if (!GEMINI_API_KEY) {
      return { success: false, error: 'GEMINI_API_KEY no est configurada' };
    }

    const prompt = `
Eres un asistente de IA amigable para un bot de WhatsApp llamado KONMI-BOT.
Contexto: ${context}

Pregunta del usuario: ${message}

Responde de forma clara, concisa y til. Si la pregunta es sobre manhwas, series, o contenido multimedia, s especfico.
Mantn un tono amigable y profesional.
`;

    const response = await axios.post(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      contents: [{ parts: [{ text: prompt }] }]
    }, { headers: { 'Content-Type': 'application/json' } });

    const aiResponse = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!aiResponse) return { success: false, error: 'No se recibi respuesta de la IA' };

    return { success: true, response: aiResponse, model: 'gemini-1.5-flash' };

  } catch (error) {
    console.error('Error en chatWithAI:', error);
    return { success: false, error: error.message };
  }
}

export async function analyzeManhwaContent(content) {
  try {
    if (!GEMINI_API_KEY) {
      return { success: false, error: 'GEMINI_API_KEY no configurada' };
    }

    const prompt = `
Analiza si el siguiente contenido es de un manhwa y extrae informacin:

Contenido: "${content}"

Responde en formato JSON:
{
  "es_manhwa": true/false,
  "titulo": "Ttulo del manhwa o null",
  "capitulo": "Nmero de captulo o null",
  "autor": "Autor si se menciona o null",
  "genero": "Gnero si se detecta o null"
}
`;

    const response = await axios.post(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      contents: [{ parts: [{ text: prompt }] }]
    }, { headers: { 'Content-Type': 'application/json' } });

    const aiResponse = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    const analysis = JSON.parse(jsonMatch[0]);

    return { success: true, analysis };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

// =====================
// Provider handlers (consolidated)
// =====================

export async function processProviderMessage(message, groupJid, groupName) {
  try {
    const grupo = await db('grupos_autorizados').where('jid', groupJid).first();
    if (!grupo) throw new Error('No es grupo proveedor');

    const usuario = message.key.participant || message.key.remoteJid;
    const fecha = new Date().toISOString();

    const hasMedia = message.message.imageMessage ||
                     message.message.videoMessage ||
                     message.message.documentMessage ||
                     message.message.audioMessage;

    if (!hasMedia) return { success: false, message: 'No hay media para procesar' };

    const messageText = message.message.conversation ||
                        message.message.extendedTextMessage?.text ||
                        message.message.imageMessage?.caption ||
                        message.message.videoMessage?.caption ||
                        message.message.documentMessage?.caption ||
                        'Media sin descripcin';

    const categoria = 'auto';
    const result = await processWhatsAppMedia(message, categoria, usuario);
    if (!result.success) return { success: false, message: 'Error procesando media' };

    let tipoClasificado = 'extra';
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
      console.error('Error en anlisis AI:', aiError);
    }

    const tipoNormalizado = normalizeAporteTipo(tipoClasificado);
    let carpetaDestino = tipoNormalizado;
    if (tituloDetectado) carpetaDestino = `${tipoNormalizado}/${sanitizeFilename(tituloDetectado)}`;
    if (capituloDetectado) carpetaDestino = `${carpetaDestino}/Capitulo ${capituloDetectado}`;

    const storagePath = path.join(process.cwd(), 'storage', 'media', carpetaDestino);
    if (!fs.existsSync(storagePath)) fs.mkdirSync(storagePath, { recursive: true });

    const archivoActual = result.filepath;
    const archivoNuevo = path.join(storagePath, path.basename(archivoActual));
    if (archivoActual !== archivoNuevo) {
      fs.renameSync(archivoActual, archivoNuevo);
      result.filepath = archivoNuevo;
    }

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
      message: 'Aporte automtico procesado correctamente',
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

export async function getProviderStats() {
  try {
    await ensureGruposTable();
    const total = await db('grupos_autorizados').where({ tipo: 'proveedor' }).count('jid as count').first();
    return { totalProviders: Number(total?.count || 0) };
  } catch (error) {
    console.error('Error getting provider stats:', error);
    return { totalProviders: 0, error: error.message };
  }
}

export async function getProviderAportes() {
  try {
    const aportes = await db('aportes')
      .where('fuente', 'auto_proveedor')
      .select('tipo', 'contenido', 'fecha', 'grupo')
      .orderBy('fecha', 'desc')
      .limit(20);
    return { success: true, aportes };
  } catch (error) {
    console.error('Error getting provider aportes:', error);
    return { success: false, error: error.message, aportes: [] };
  }
}

// Helper function to ensure tables exist
async function ensureGruposTable() {
  const has = await db.schema.hasTable('grupos_autorizados');
  if (!has) {
    await db.schema.createTable('grupos_autorizados', (t) => {
      t.increments('id').primary();
      t.string('jid').notNullable().unique();
      t.string('nombre').defaultTo('');
      t.text('descripcion').defaultTo('');
      t.boolean('bot_enabled').defaultTo(true);
      t.boolean('es_proveedor').defaultTo(false);
      t.string('tipo').defaultTo('normal');
      t.integer('usuario_id').nullable();
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.timestamp('updated_at').defaultTo(db.fn.now());
    });
  }
}
