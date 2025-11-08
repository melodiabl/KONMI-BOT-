// commands/bot-control.js
// Control del bot por grupo y global

import db from '../db.js'
import { buildQuickReplyFlow } from '../utils/flows.js'
import { isOwnerNumber, isGroupAdmin } from '../utils/identity.js'

async function ensureGatingTables() {
  // Tabla global de encendido/apagado ya se asegura en la sección global
  // Aquí aseguramos tablas usadas por el gateo por grupo en subbot-manager
  try {
    const exists = await db.schema.hasTable('grupos_desactivados')
    if (!exists) {
      await db.schema.createTable('grupos_desactivados', (t) => {
        t.increments('id')
        t.string('jid').unique().notNullable()
        t.timestamp('updated_at').defaultTo(db.fn.now())
      })
    }
  } catch {}
  try {
    const exists = await db.schema.hasTable('subbot_group_state')
    if (!exists) {
      await db.schema.createTable('subbot_group_state', (t) => {
        t.increments('id').primary()
        t.string('subbot_code', 120).notNullable()
        t.string('group_jid', 200).notNullable()
        t.boolean('is_active').notNullable().defaultTo(true)
        t.timestamp('updated_at').defaultTo(db.fn.now())
        t.unique(['subbot_code', 'group_jid'])
      })
    }
  } catch {}
}

export async function bot({ usuario, args, isGroup, remoteJid, sock, message }) {
  try {
    const a0 = (args||[])[0]
    const fromMe = !!(message?.key?.fromMe)
    // Global on/off (solo owner)
    if (a0 === 'global') {
      if (!fromMe && !isOwnerNumber(usuario, sock)) {
        return {
          success: true,
          type: 'buttons',
          text: '⛔ Solo el owner puede usar comandos globales',
          footer: 'KONMI BOT',
          buttons: [ { text: '📋 Ayuda', command: '/help' }, { text: '🏠 Menú', command: '/menu' } ],
          quoted: true,
          ephemeralDuration: 120,
        }
      }
      const v = (args||[])[1]
      if (v !== 'on' && v !== 'off') {
        const flow = buildQuickReplyFlow({
          header: '⚙️ Control global',
          body: 'Activar o desactivar el bot globalmente',
          footer: 'KONMI BOT',
          buttons: [
            { text: '🌍 Global ON', command: '/bot global on' },
            { text: '🌍 Global OFF', command: '/bot global off' },
            { text: '🏠 Menú', command: '/menu' },
          ],
        })
        return [
          { success:true, message:'⚙️ Control global del bot', quoted: true, ephemeralDuration: 120 },
          { type:'content', content: flow, quoted: true, ephemeralDuration: 300 },
        ]
      }
      const turnOn = v === 'on'
      try {
        // asegurar tabla bot_global_state para evitar errores "no such table"
        const exists = await db.schema.hasTable('bot_global_state')
        if (!exists) {
          await db.schema.createTable('bot_global_state', (table) => {
            table.increments('id').primary()
            table.boolean('is_on').notNullable().defaultTo(true)
            table.string('estado')
            table.string('activado_por')
            table.timestamp('fecha_cambio').defaultTo(db.fn.now())
          })
          await db('bot_global_state').insert({ id: 1, is_on: true, estado: 'on' }).catch(()=>{})
        }
        const row = await db('bot_global_state').first('*')
        if (row) await db('bot_global_state').update({ is_on: turnOn, estado: turnOn ? 'on' : 'off', activado_por: String(usuario), fecha_cambio: db.fn.now() }).where({ id: row.id || 1 })
        else await db('bot_global_state').insert({ id: 1, is_on: turnOn, estado: turnOn ? 'on' : 'off', activado_por: String(usuario) })
      } catch {}
      const msg = turnOn ? '✅ Bot activado globalmente' : '⛔ Bot desactivado globalmente'
      const flow = buildQuickReplyFlow({
        header: msg,
        body: 'Control global actualizado',
        footer: 'Acciones rápidas',
        buttons: [ { text: '🏠 Menú', command: '/menu' }, { text: '📋 Ayuda', command: '/help' } ],
      })
      return [
        { success: true, message: msg, quoted: true, ephemeralDuration: 120 },
        { type: 'content', content: flow, quoted: true, ephemeralDuration: 300 },
      ]
    }

    // Grupo on/off
    if (!isGroup) return { success: true, message: 'ℹ️ Este comando solo funciona en grupos', quoted: true, ephemeralDuration: 120 }
    // Si el comando es fromMe (enviado desde el propio bot), permitir siempre
    // Esto facilita la administración directa desde el dispositivo vinculado del bot
    const allowed = fromMe || isOwnerNumber(usuario, sock) || await isGroupAdmin(sock, remoteJid, usuario)
    if (!allowed) return { success: true, message: '⛔ Solo owner o administradores del grupo pueden usar /bot on/off.', quoted: true, ephemeralDuration: 120 }
    const turnOn = a0 === 'on'
    const turnOff = a0 === 'off'
    if (!turnOn && !turnOff) {
      const flow = buildQuickReplyFlow({
        header: '⚙️ Control del bot',
        body: 'Activar o desactivar en este grupo',
        footer: 'KONMI BOT',
        buttons: [ { text: '✅ ON', command: '/bot on' }, { text: '⛔ OFF', command: '/bot off' }, { text: '🌍 Global', command: '/bot global' }, { text: '👑 Admins', command: '/admins' } ],
      })
      return [
        { success:true, message:'⚙️ Control del bot en este grupo', quoted: true, ephemeralDuration: 120 },
        { type:'content', content: flow, quoted: true, ephemeralDuration: 300 },
      ]
    }
    try {
      // Compat previo: group_settings (no usado por el gate actual, pero mantenemos)
      try {
        const exists = await db.schema.hasTable('group_settings')
        if (exists) {
          const row = await db('group_settings').where({ group_id: remoteJid }).first()
          if (row) await db('group_settings').where({ group_id: remoteJid }).update({ is_active: turnOn, updated_by: usuario, updated_at: new Date().toISOString() })
          else await db('group_settings').insert({ group_id: remoteJid, is_active: turnOn, updated_by: usuario, updated_at: new Date().toISOString() })
        }
      } catch {}

      // Gate efectivo usado por whatsapp.js (subbot-manager):
      await ensureGatingTables()
      if (turnOn) {
        // Eliminar de grupos_desactivados y marcar activo en subbot_group_state
        try { await db('grupos_desactivados').where({ jid: remoteJid }).del() } catch {}
        try {
          await db('subbot_group_state')
            .insert({ subbot_code: 'main', group_jid: remoteJid, is_active: true, updated_at: db.fn.now() })
            .onConflict(['subbot_code', 'group_jid'])
            .merge({ is_active: true, updated_at: db.fn.now() })
        } catch {}
      } else {
        // Agregar a grupos_desactivados y marcar inactivo en subbot_group_state
        try {
          await db('grupos_desactivados')
            .insert({ jid: remoteJid, updated_at: db.fn.now() })
            .onConflict(['jid'])
            .merge({ updated_at: db.fn.now() })
        } catch {}
        try {
          await db('subbot_group_state')
            .insert({ subbot_code: 'main', group_jid: remoteJid, is_active: false, updated_at: db.fn.now() })
            .onConflict(['subbot_code', 'group_jid'])
            .merge({ is_active: false, updated_at: db.fn.now() })
        } catch {}
      }
    } catch {}
    const msg = turnOn ? '✅ Bot activado en este grupo' : '⛔ Bot desactivado en este grupo'
    const flow = buildQuickReplyFlow({
      header: msg,
      body: `Grupo: ${remoteJid}`,
      footer: 'Acciones rápidas',
      buttons: [ { text: turnOn ? '⛔ OFF' : '✅ ON', command: turnOn ? '/bot off' : '/bot on' }, { text: '👑 Admins', command: '/admins' }, { text: '🏠 Menú', command: '/menu' } ],
    })
    return [
      { success: true, message: msg, quoted: true, ephemeralDuration: 120 },
      { type: 'reaction', emoji: '✅', key: message?.key },
      { type: 'content', content: flow, quoted: true, ephemeralDuration: 300 },
    ]
  } catch (e) {
    return { success: false, message: `⚠️ Error en /bot: ${e?.message||e}` }
  }
}

export default { bot }


