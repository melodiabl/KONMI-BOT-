// ESM patch script (safe quoting) to add attachment support to /addmanhwa, /addserie, and /guardar|/save in backend/full/whatsapp.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function ts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function patchWhatsappJs(file) {
  let src = fs.readFileSync(file, 'utf8');
  const backup = `${file}.bak_${ts()}`;
  fs.writeFileSync(backup, src);

  // 1) /addmanhwa
  const addManhwaPattern = /case '\/addmanhwa':[\s\S]*?break;/;
  if (addManhwaPattern.test(src)) {
    const addManhwaReplacement = [
      "case '/addmanhwa':",
      "        try {",
      "          const { processWhatsAppMedia } = await import('./file-manager.js');",
      "          const manhwaData = messageText.substring('/addmanhwa'.length).trim();",
      "          const parts = (manhwaData || '').split('|').map(p => p.trim());",
      "          const titulo = parts[0] || 'Sin titulo';",
      "          const genero = parts[1] || 'General';",
      "          const descripcion = parts[2] || 'Sin descripcion';",
      "",
      "          const hasDirectMedia = !!(message.message?.imageMessage || message.message?.videoMessage || message.message?.documentMessage || message.message?.audioMessage);",
      "          const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;",
      "          let coverPath = null;",
      "",
      "          if (hasDirectMedia) {",
      "            const res = await processWhatsAppMedia(message, 'manhwa', usuario);",
      "            if (res?.filepath) coverPath = res.filepath;",
      "          } else if (quoted && (quoted.imageMessage || quoted.videoMessage || quoted.documentMessage || quoted.audioMessage)) {",
      "            const qmsg = { message: quoted };",
      "            const res = await processWhatsAppMedia(qmsg, 'manhwa', usuario);",
      "            if (res?.filepath) coverPath = res.filepath;",
      "          }",
      "",
      "          await db('manhwas').insert({",
      "            titulo,",
      "            genero,",
      "            descripcion,",
      "            cover_path: coverPath || null,",
      "            created_at: new Date().toISOString()",
      "          });",
      "",
      "          const extra = coverPath ? '\n🖼️ Adjunto guardado' : '';",
      "          await sock.sendMessage(remoteJid, { ",
      "            text: `✅ *Manhwa agregado*\n\n📌 Título: ${titulo}\n🏷️ Género: ${genero}\n📝 Descripción: ${descripcion}${extra}\n👤 Por: ${usuario}\n🕒 Fecha: ${new Date().toLocaleString('es-ES')}` ",
      "          });",
      "        } catch (error) {",
      "          logger.error('Error agregando manhwa:', error);",
      "          await sock.sendMessage(remoteJid, { text: '⚠️ Error agregando manhwa. Intenta más tarde.' });",
      "        }",
      "        break;"
    ].join('\n');
    src = src.replace(addManhwaPattern, addManhwaReplacement);
  }

  // 2) /addserie
  const addSeriePattern = /case '\/addserie':[\s\S]*?break;/;
  if (addSeriePattern.test(src)) {
    const addSerieReplacement = [
      "case '/addserie':",
      "        try {",
      "          const { processWhatsAppMedia } = await import('./file-manager.js');",
      "          const serieData = messageText.substring('/addserie'.length).trim();",
      "          const parts = (serieData || '').split('|').map(p => p.trim());",
      "          const titulo = parts[0] || 'Sin titulo';",
      "          const genero = parts[1] || 'Serie';",
      "          const descripcion = parts[2] || 'Sin descripcion';",
      "",
      "          const hasDirectMedia = !!(message.message?.imageMessage || message.message?.videoMessage || message.message?.documentMessage || message.message?.audioMessage);",
      "          const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;",
      "          let coverPath = null;",
      "",
      "          if (hasDirectMedia) {",
      "            const res = await processWhatsAppMedia(message, 'serie', usuario);",
      "            if (res?.filepath) coverPath = res.filepath;",
      "          } else if (quoted && (quoted.imageMessage || quoted.videoMessage || quoted.documentMessage || quoted.audioMessage)) {",
      "            const qmsg = { message: quoted };",
      "            const res = await processWhatsAppMedia(qmsg, 'serie', usuario);",
      "            if (res?.filepath) coverPath = res.filepath;",
      "          }",
      "",
      "          await db('manhwas').insert({",
      "            titulo,",
      "            genero: `Serie - ${genero}`,",
      "            descripcion,",
      "            cover_path: coverPath || null,",
      "            created_at: new Date().toISOString()",
      "          });",
      "",
      "          const extra = coverPath ? '\n🖼️ Adjunto guardado' : '';",
      "          await sock.sendMessage(remoteJid, { ",
      "            text: `✅ *Serie agregada*\n\n📌 Título: ${titulo}\n🏷️ Género: ${genero}\n📝 Descripción: ${descripcion}${extra}\n👤 Por: ${usuario}\n🕒 Fecha: ${new Date().toLocaleString('es-ES')}` ",
      "          });",
      "        } catch (error) {",
      "          logger.error('Error agregando serie:', error);",
      "          await sock.sendMessage(remoteJid, { text: '⚠️ Error agregando serie. Intenta más tarde.' });",
      "        }",
      "        break;"
    ].join('\n');
    src = src.replace(addSeriePattern, addSerieReplacement);
  }

  // 3) /guardar | /save
  const guardarPattern = /case '\/guardar':[\s\S]*?case '\/save':[\s\S]*?break;/;
  if (guardarPattern.test(src)) {
    const guardarReplacement = [
      "case '/guardar':",
      "      case '/save':",
      "        try {",
      "          const { processWhatsAppMedia } = await import('./file-manager.js');",
      "          const categoria = args[0] || 'general';",
      "          const hasDirectMedia = !!(message.message?.imageMessage || message.message?.videoMessage || message.message?.documentMessage || message.message?.audioMessage);",
      "          const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;",
      "",
      "          if (!hasDirectMedia && !quoted) {",
      "            await sock.sendMessage(remoteJid, { ",
      "              text: 'ℹ️ Debes adjuntar un archivo o responder a un mensaje con un archivo para guardar.'",
      "            });",
      "            break;",
      "          }",
      "",
      "          let res = null;",
      "          if (hasDirectMedia) {",
      "            res = await processWhatsAppMedia(message, categoria, usuario);",
      "          } else {",
      "            const qmsg = { message: quoted };",
      "            res = await processWhatsAppMedia(qmsg, categoria, usuario);",
      "          }",
      "",
      "          if (res?.filepath) {",
      "            await sock.sendMessage(remoteJid, { ",
      "              text: `✅ *Archivo guardado*\n\n📦 Categoría: ${categoria}\n📁 Ruta: ${res.filepath}\n📄 Nombre: ${res.filename}\n🔢 Tamaño: ${res.size} bytes` ",
      "            });",
      "          } else {",
      "            await sock.sendMessage(remoteJid, { text: '⚠️ No se pudo guardar el archivo.' });",
      "          }",
      "        } catch (error) {",
      "          logger.error('Error en /guardar:', error);",
      "          await sock.sendMessage(remoteJid, { text: '⚠️ Error al guardar el archivo. Intenta de nuevo.' });",
      "        }",
      "        break;"
    ].join('\n');
    src = src.replace(guardarPattern, guardarReplacement);
  }

  fs.writeFileSync(file, src, 'utf8');
  return backup;
}

(function main() {
  const root = path.resolve(__dirname, '..');
  const wp = path.join(root, 'backend', 'full', 'whatsapp.js');

  if (!fs.existsSync(wp)) {
    console.error('whatsapp.js no encontrado:', wp);
    process.exit(1);
  }

  const backup = patchWhatsappJs(wp);
  console.log('Backup creado:', backup);
  console.log('Parche aplicado a whatsapp.js (/addmanhwa, /addserie, /guardar|/save)');
})();
