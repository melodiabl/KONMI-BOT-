// commands/moderation.js — sistema de advertencias por grupo, refactorizado para ctx unificado

import db from '../database/db.js';

const onlyDigits = (v) => String(v || '').replace(/\D/g, '');

async function ensureWarningsTable() {
    try {
        const exists = await db.schema.hasTable('group_warnings');
        if (!exists) {
            await db.schema.createTable('group_warnings', t => {
                t.increments('id');
                t.string('group_id');
                t.string('user_jid'); // Cambiado a JID completo para más precisión
                t.integer('count').defaultTo(1);
                t.timestamp('created_at').defaultTo(db.fn.now());
                t.timestamp('updated_at').defaultTo(db.fn.now());
            });
        }
    } catch (e) {
        console.error("Error ensuring warnings table:", e.message);
    }
}

function extractTargetJid(ctx) {
    const { message, args } = ctx;
    const quoted = message?.message?.extendedTextMessage?.contextInfo;

    if (quoted?.mentionedJid?.length > 0) {
        return quoted.mentionedJid[0];
    }
    if (quoted?.participant) {
        return quoted.participant;
    }
    if (args.length > 0) {
        const mention = args[0].replace('@', '');
        if (/^\d+$/.test(mention)) {
            return `${mention}@s.whatsapp.net`;
        }
    }
    return null;
}

export async function warn(ctx) {
    const { isGroup, isAdmin, isOwner, remoteJid, sender } = ctx;
    if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos.' };
    if (!isAdmin && !isOwner) return { success: false, message: '⛔ Solo los administradores o el owner pueden aplicar advertencias.' };

    const targetJid = extractTargetJid(ctx);
    if (!targetJid) return { success: false, message: 'ℹ️ Uso: /warn @usuario o responde a un mensaje con /warn.' };

    await ensureWarningsTable();

    try {
        const userKey = onlyDigits(targetJid);
        const row = await db('group_warnings')
            .where({ group_id: remoteJid })
            .andWhere(q => {
                if (userKey) {
                    q.where('user_jid', userKey).orWhere('user_jid', targetJid);
                } else {
                    q.where('user_jid', targetJid);
                }
            })
            .first();
        let newCount = 1;
        if (row) {
            newCount = row.count + 1;
            await db('group_warnings').where({ id: row.id }).update({ count: newCount, updated_at: db.fn.now() });
        } else {
            await db('group_warnings').insert({ group_id: remoteJid, user_jid: userKey || targetJid, count: 1 });
        }

        return {
            success: true,
            message: `⚠️ Advertencia para @${targetJid.split('@')[0]}. Este usuario ahora tiene ${newCount} advertencia(s).`,
            mentions: [targetJid],
        };
    } catch (e) {
        console.error('Error en /warn:', e.message);
        return { success: false, message: '⚠️ Ocurrió un error al aplicar la advertencia.' };
    }
}

export async function unwarn(ctx) {
    const { isGroup, isAdmin, isOwner, remoteJid, args } = ctx;
    if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos.' };
    if (!isAdmin && !isOwner) return { success: false, message: '⛔ Solo los administradores o el owner pueden quitar advertencias.' };

    const targetJid = extractTargetJid(ctx);
    if (!targetJid) return { success: false, message: 'ℹ️ Uso: /unwarn @usuario.' };

    await ensureWarningsTable();

    try {
        const userKey = onlyDigits(targetJid);
        const deleted = await db('group_warnings')
            .where({ group_id: remoteJid })
            .andWhere(q => {
                if (userKey) {
                    q.where('user_jid', userKey).orWhere('user_jid', targetJid);
                } else {
                    q.where('user_jid', targetJid);
                }
            })
            .del();
        if (deleted > 0) {
            return {
                success: true,
                message: `♻️ Se han eliminado todas las advertencias para @${targetJid.split('@')[0]}.`,
                mentions: [targetJid],
            };
        } else {
            return { success: false, message: `ℹ️ @${targetJid.split('@')[0]} no tenía advertencias registradas.`, mentions: [targetJid] };
        }
    } catch (e) {
        console.error('Error en /unwarn:', e.message);
        return { success: false, message: '⚠️ Ocurrió un error al quitar las advertencias.' };
    }
}

export async function warns(ctx) {
    const { isGroup, remoteJid } = ctx;
    if (!isGroup) return { success: false, message: 'ℹ️ Este comando solo funciona en grupos.' };

    await ensureWarningsTable();

    try {
        const rows = await db('group_warnings').where({ group_id: remoteJid }).orderBy('count', 'desc').limit(20);
        if (rows.length === 0) return { success: true, message: '👍 No hay advertencias registradas en este grupo.' };

        const mentions = rows.map(r => r.user_jid);
        const list = rows.map((r, i) => `${i + 1}. @${r.user_jid.split('@')[0]} - ${r.count} advertencia(s)`).join('\n');

        return {
            success: true,
            message: `📋 *Advertencias en este grupo*\n\n${list}`,
            mentions,
        };
    } catch (e) {
        console.error('Error en /warns:', e.message);
        return { success: false, message: '⚠️ Ocurrió un error al obtener la lista de advertencias.' };
    }
}

export default { warn, unwarn, warns };
