import { createSubbot, deleteSubbot, getSubbotAccessData } from '../handler.js';
import { db } from '../db.js';
import { db } from '../db.js';

let handler = async (m, { conn, args, usedPrefix, command }) => {
    if (!args[0]) {
        return m.reply(`⚠️ *Uso del comando:*
${usedPrefix + command} qr - Genera un código QR para conectar
${usedPrefix + command} code - Genera un código de emparejamiento
${usedPrefix + command} stop - Detiene tu sub-bot activo`);
    }

    const option = args[0].toLowerCase();
    const user = m.sender;

    switch (option) {
        case 'qr':
        case 'code':
            try {
                const existingStatus = await getSubbotStatus(user);
                const isActive = existingStatus?.active || false;

                if (isActive) {
                    return m.reply('⚠️ Ya tienes un sub-bot activo. Usa */subbot stop* para detenerlo primero.');
                }

                await m.reply('Iniciando tu sub-bot...');
                const connectionType = option === 'qr' ? 'qr' : 'pairing';
                const userName = m.pushName || 'Usuario';
                const result = await createSubbot(user, userName, connectionType);
                if (!result.success) throw new Error(result.error || 'Error al crear sub-bot');

                // If QR returned, send it as image; if pairing code, send code
                if (result.qr) {
                    try {
                        const qrBase64 = result.qr.replace(/^data:image\/(png|jpeg);base64,/, '');
                        const qrBuffer = Buffer.from(qrBase64, 'base64');
                        await conn.sendMessage(m.chat, { image: qrBuffer, caption: '📱 Escanea este código QR para conectar tu sub-bot\n⏳ El código expira pronto' });
                    } catch (e) {
                        await m.reply('Se generó el QR pero no se pudo enviar la imagen. Usa /subbot status o el panel web.');
                    }
                } else if (result.pairingCode || result.pairingcode || result.code) {
                    const code = result.pairingCode || result.pairingcode || result.code;
                    await m.reply(`🔑 Tu código de emparejamiento es: *${code}*\n\nSigue las instrucciones en WhatsApp > Dispositivos vinculados.`);
                } else {
                    await m.reply('Sub-bot creado. Revisa el panel o espera a que se muestre el QR/código.');
                }
            } catch (error) {
                console.error('Error en comando subbot:', error);
                m.reply(`❌ Error: ${error.message}`);
            }
            break;

        case 'stop':
            try {
                const status = await getSubbotStatus(user);
                if (!status?.active) {
                    return m.reply('⚠️ No tienes ningún sub-bot activo.');
                }

                const result = await stopSubbot(user);
                
                if (result.success) {
                    m.reply('✅ Sub-bot detenido correctamente.');
                } else {
                    throw new Error(result.error || 'Error al detener el sub-bot');
                }
            } catch (error) {
                console.error('Error deteniendo subbot:', error);
                m.reply(`❌ Error: ${error.message}`);
            }
            break;

        default:
            m.reply(`⚠️ Opción no válida. Usa:
${usedPrefix + command} qr - Genera un código QR para conectar
${usedPrefix + command} code - Genera un código de emparejamiento
${usedPrefix + command} stop - Detiene tu sub-bot activo`);
    }
};

handler.help = ['subbot'];
handler.tags = ['subbots'];
handler.command = ['subbot'];
handler.register = true;

export default handler;