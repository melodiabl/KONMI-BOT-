import db from './db.js';
import axios from 'axios';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getSocket } from './whatsapp.js';
import config from './config.js';

// Almacenar estado de subbots
const subbotConnections = new Map();

/**
 * Registrar evento de subbot
 */
export async function registerSubbotEvent(subbotId, event, data) {
  try {
    console.log(`📱 Subbot ${subbotId} - Evento: ${event}`);
    
    // Actualizar estado en memoria
    subbotConnections.set(subbotId, {
      ...subbotConnections.get(subbotId),
      lastEvent: event,
      lastEventData: data,
      lastSeen: new Date().toISOString(),
      status: event === 'connected' ? 'online' : 
              event === 'disconnected' ? 'offline' : 
              event === 'qr_generated' ? 'waiting_qr' : 'unknown'
    });

    // Asegurar columnas mínimas y guardar en base de datos
    try {
      const hasTable = await db.schema.hasTable('subbots');
      if (hasTable) {
        const addCol = async (name, builder) => { if (!(await db.schema.hasColumn('subbots', name))) { await db.schema.alterTable('subbots', builder); } };
        await addCol('status', (t) => t.string('status'));
        await addCol('last_heartbeat', (t) => t.timestamp('last_heartbeat'));
        await addCol('qr_data', (t) => t.text('qr_data'));
        await addCol('qr_path', (t) => t.string('qr_path'));
        await addCol('pairing_code', (t) => t.string('pairing_code'));
        await addCol('type', (t) => t.string('type'));
        await addCol('created_by', (t) => t.string('created_by'));
      }
    } catch (e) { console.error('No se pudo ajustar columnas de subbots:', e.message); }

    const update = {
      status: event === 'connected' ? 'connected' :
              event === 'disconnected' ? 'disconnected' :
              (event === 'qr_generated' || event === 'qr_ready') ? 'pending' : 'unknown',
      last_heartbeat: new Date().toISOString(),
    };
    if (event === 'qr_generated' && data?.qr) update.qr_data = data.qr;
    if (event === 'qr_ready' && data?.qrPath) update.qr_path = data.qrPath;
    if (event === 'pairing_code' && data?.code) update.pairing_code = data.code;
    await db('subbots').where('code', subbotId).update(update);

    // Enviar por WhatsApp al propietario: QR o código de emparejamiento
    const owner = (config.owner?.whatsapp || '').replace(/[^0-9]/g, '');
    const sock = getSocket?.();
    if (sock) {
      // Determinar destinatarios: owner y creador del subbot
      let recipients = [];
      try {
        const row = await db('subbots').where('code', subbotId).first();
        const createdBy = (row?.created_by || '').toString().replace(/[^0-9]/g, '');
        if (createdBy) recipients.push(`${createdBy}@s.whatsapp.net`);
      } catch (_) {}
      if (owner) recipients.push(`${owner}@s.whatsapp.net`);
      // Enviar notificaciones
      for (const to of recipients) {
        if (event === 'pairing_code' && data?.code) {
          await sock.sendMessage(to, {
            text: `🔑 Pairing Code para sub-bot ${subbotId}:\n\n${data.code}\n\n(Expira en pocos minutos)`
          });
        }
        if (event === 'qr_ready') {
          const qrPath = data?.qrPath;
          if (qrPath && fs.existsSync(qrPath)) {
            const buffer = fs.readFileSync(qrPath);
            await sock.sendMessage(to, {
              image: buffer,
              caption: `📱 QR listo para sub-bot ${subbotId}.\nEscanéalo desde WhatsApp para vincular.`
            });
          } else if (data?.qr) {
            await sock.sendMessage(to, {
              text: `QR para sub-bot ${subbotId}: (abre el panel para visualizar la imagen)`
            });
          }
        }
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error registrando evento de subbot:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Obtener estado de todos los subbots
 */
export function getSubbotStatus() {
  const status = [];
  for (const [subbotId, connection] of subbotConnections) {
    status.push({
      subbotId,
      status: connection.status,
      lastEvent: connection.lastEvent,
      lastSeen: connection.lastSeen,
      isOnline: connection.status === 'online'
    });
  }
  return status;
}

/**
 * Obtener subbot por ID
 */
export function getSubbot(subbotId) {
  return subbotConnections.get(subbotId);
}

/**
 * Listar todos los subbots
 */
export async function listSubbots() {
  try {
    const subbots = await db('subbots')
      .select('*')
      .orderBy('created_at', 'desc');
    
    return subbots.map(subbot => ({
      ...subbot,
      isOnline: subbotConnections.has(subbot.code) && 
                subbotConnections.get(subbot.code).status === 'online'
    }));
  } catch (error) {
    console.error('Error listando subbots:', error);
    return [];
  }
}

/**
 * Crear nuevo subbot
 */
export async function createSubbot(userId, type = 'qr') {
  try {
    const subbotId = `subbot_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    // Registrar en DB (tolerante a columnas opcionales)
    try {
      await db('subbots').insert({
      code: subbotId,
      type: type,
      status: 'pending',
      created_by: userId,
      created_at: new Date().toISOString(),
      last_heartbeat: new Date().toISOString()
      });
    } catch (e) {
      // Intentar crear tabla mínima si no existe
      try {
        const has = await db.schema.hasTable('subbots');
        if (!has) {
          await db.schema.createTable('subbots', (t) => {
            t.increments('id').primary();
            t.string('code').unique().notNullable();
            t.string('type').defaultTo('qr');
            t.string('status').defaultTo('pending');
            t.string('nombre').nullable();
            t.string('created_by').nullable();
            t.timestamp('created_at').defaultTo(db.fn.now());
            t.timestamp('last_heartbeat').defaultTo(db.fn.now());
            t.text('qr_data').nullable();
          });
          await db('subbots').insert({
            code: subbotId,
            type: type,
            status: 'pending',
            created_by: String(userId),
            created_at: new Date().toISOString(),
            last_heartbeat: new Date().toISOString()
          });
        }
      } catch (_) {}
    }

    // Lanzar proceso del sub-bot que generará QR / pairing code y notificará al backend
    try {
      const subbotDir = path.join(process.cwd(), 'jadibots', subbotId);
      if (!fs.existsSync(subbotDir)) fs.mkdirSync(subbotDir, { recursive: true });
      const child = spawn('node', [path.join(process.cwd(), 'subbot-template', 'index.js')], {
        cwd: subbotDir,
        env: { ...process.env, SUBBOT_ID: subbotId, SUBBOT_DIR: subbotDir, SUBBOT_TYPE: type }
      });
      child.stdout.on('data', (d) => console.log(`[subbot ${subbotId}]`, d.toString().trim()));
      child.stderr.on('data', (d) => console.error(`[subbot ${subbotId} ERROR]`, d.toString().trim()));
      child.on('close', (code) => console.log(`[subbot ${subbotId}] exited with code ${code}`));
    } catch (e) {
      console.error('Error spawning subbot process:', e);
    }

    return { success: true, subbotId };
  } catch (error) {
    console.error('Error creando subbot:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Eliminar subbot
 */
export async function deleteSubbot(subbotId) {
  try {
    await db('subbots').where('code', subbotId).del();
    subbotConnections.delete(subbotId);
    return { success: true };
  } catch (error) {
    console.error('Error eliminando subbot:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Ejecutar comando en subbot
 */
export async function executeSubbotCommand(subbotId, command, from, group) {
  try {
    // Aquí podrías implementar lógica específica para cada comando
    // Por ahora, solo registramos el comando
    console.log(`Comando ejecutado en subbot ${subbotId}: ${command}`);
    
    return {
      success: true,
      message: `Comando ${command} ejecutado en subbot ${subbotId}`
    };
  } catch (error) {
    console.error('Error ejecutando comando en subbot:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Obtener comandos para subbot
 */
export async function getSubbotCommands(subbotId) {
  try {
    // Aquí podrías implementar lógica para obtener comandos específicos
    // Por ahora, retornamos comandos básicos
    return {
      commands: ['/help', '/ping', '/status']
    };
  } catch (error) {
    console.error('Error obteniendo comandos de subbot:', error);
    return { commands: [] };
  }
}

/**
 * Limpiar subbots inactivos
 */
export async function cleanupInactiveSubbots() {
  try {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 horas
    
    await db('subbots')
      .where('last_heartbeat', '<', cutoffTime.toISOString())
      .where('status', '!=', 'connected')
      .del();
    
    return { success: true };
  } catch (error) {
    console.error('Error limpiando subbots inactivos:', error);
    return { success: false, error: error.message };
  }
}
