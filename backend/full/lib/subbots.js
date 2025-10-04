import pino from 'pino';
import path from 'path';
import { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, DisconnectReason, jidNormalizedUser } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import { writeFile, mkdir, rm } from 'fs/promises';

import { db } from './db.js';

// Almacena las instancias activas de subbots
const subbots = new Map();

// Directorio base para las sesiones de los subbots
const SESSION_DIR = path.join(process.cwd(), 'sessions', 'subbots');

export async function startSubbot(userJid, msgCallback, { connectionType = 'qr' } = {}) {
    if (subbots.has(userJid)) {
        return { success: false, error: 'SubBot ya está activo' };
    }
    
    const phoneNumber = userJid.split('@')[0];

    const sessionPath = path.join(SESSION_DIR, phoneNumber);
    // Ensure session directory exists before using the auth state
    try {
        await mkdir(sessionPath, { recursive: true });
    } catch (err) {
        console.error('[SubBot] Error creando directorio de sesión:', err);
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['SubBot', 'Chrome', '2.0.0'],
        generateHighQualityLinkPreview: true,
        version: [2, 2323, 4],
        patchMessageBeforeSending: false,
        getMessage: async () => { return { conversation: 'SubBot iniciado' }; }
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (connectionType === 'qr' && qr) {
            try {
                const qrImage = await QRCode.toDataURL(qr, { scale: 8 });
                const qrPath = path.join(sessionPath, 'qr.png');
                await writeFile(qrPath, qrImage.split(',')[1], 'base64');
                
                if (msgCallback) {
                    await msgCallback({
                        image: Buffer.from(qrImage.split(',')[1], 'base64'),
                        caption: '📱 Escanea este código QR para conectar tu SubBot\n⏳ El código expira en 45 segundos'
                    });
                }
            } catch (err) {
                console.error('Error generando QR:', err);
            }
        } else if (connectionType === 'pairing' && !qr && !connection) {
            try {
                const pairingCode = await sock.requestPairingCode(phoneNumber);
                if (msgCallback) {
                    await msgCallback({
                        text: `🔑 Tu código de emparejamiento es: *${pairingCode}*\n\n📱 Para conectar tu WhatsApp:\n1. Abre WhatsApp en tu teléfono\n2. Ve a Ajustes > Dispositivos Vinculados\n3. Selecciona "Vincular un dispositivo"\n4. Elige "Vincular con número de teléfono"\n5. Ingresa el código mostrado arriba\n\n⏳ El código expira en 60 segundos`
                    });
                }
            } catch (err) {
                console.error('Error generando código de emparejamiento:', err);
                if (msgCallback) {
                    await msgCallback({
                        text: '❌ Error generando el código de emparejamiento. Por favor, intenta de nuevo.'
                    });
                }
            }
        }

        if (connection === 'open') {
            console.log(`[SubBot] Conectado: ${userJid}`);
            await db('subbots')
                .where({ user_phone: userJid })
                .update({
                    status: 'connected',
                    connected_at: new Date().toISOString(),
                    last_activity: new Date().toISOString()
                });

            if (msgCallback) {
                await msgCallback({
                    text: '✅ SubBot conectado exitosamente! Ahora puedes usar los comandos en cualquier chat.'
                });
            }
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`[SubBot] Conexión cerrada. Reconectar: ${shouldReconnect}`);

            if (shouldReconnect) {
                await startSubbot(userJid, msgCallback);
            } else {
                await db('subbots')
                    .where({ user_phone: userJid })
                    .update({
                        status: 'disconnected',
                        disconnected_at: new Date().toISOString(),
                        last_activity: new Date().toISOString()
                    });
                // Remove from memory and allow cleanup of session dir later
                subbots.delete(userJid);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    subbots.set(userJid, {
        sock,
        sessionPath
    });

    return { success: true };
}

export async function stopSubbot(userJid) {
    const subbot = subbots.get(userJid);
    if (!subbot) {
        return { success: false, error: 'SubBot no encontrado' };
    }

    try {
        // Attempt a clean logout then end the connection
        try {
            await subbot.sock.logout();
        } catch (e) {
            // ignore logout errors
        }
        try {
            await subbot.sock.end();
        } catch (e) {
            // ignore
        }

        subbots.delete(userJid);
        
        await db('subbots')
            .where({ user_phone: userJid })
            .update({
                status: 'disconnected',
                disconnected_at: new Date().toISOString(),
                last_activity: new Date().toISOString()
            });

        // Remove session directory if present
        if (subbot.sessionPath) {
            try {
                await rm(subbot.sessionPath, { recursive: true, force: true });
            } catch (err) {
                console.error('[SubBot] Error eliminando directorio de sesión:', err);
            }
        }

        return { success: true };
    } catch (error) {
        console.error('Error deteniendo SubBot:', error);
        return { success: false, error: 'Error al detener el SubBot' };
    }
}

export async function getSubbotStatus(userJid) {
    const subbot = subbots.get(userJid);
    if (!subbot) {
        return { active: false };
    }

    const dbStatus = await db('subbots')
        .where({ user_phone: userJid })
        .select('status', 'connected_at', 'last_activity')
        .first();

    return {
        active: true,
        status: dbStatus?.status || 'unknown',
        connectedAt: dbStatus?.connected_at,
        lastActivity: dbStatus?.last_activity
    };
}

export function getAllSubbots() {
    // Return a snapshot with awaited statuses
    return Promise.all(Array.from(subbots.keys()).map(async (jid) => ({
        jid,
        ...(await getSubbotStatus(jid))
    })));
}