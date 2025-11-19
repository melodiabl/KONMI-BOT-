// ESM patch script to update owner detection and /addaporte attachment support
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

  // 1) isSpecificOwner: replace hardcoded owner number
  src = src.replace(
    /const ownerNumber = '595974154768';/,
    "const ownerNumber = ((process.env.OWNER_WHATSAPP_NUMBER || (Array.isArray(global.owner) && global.owner[0]?.[0]) || '') + '').replace(/[^0-9]/g, '');"
  );

  // 2) Logger owner kv in private logs
  src = src.replace(
    /logger\.pretty\.kv\('Owner', usuario === '595974154768' \? 'SI' : 'NO'\);/,
    "logger.pretty.kv('Owner', isSpecificOwner(usuario) ? 'SI' : 'NO');"
  );

  // 3) Owner checks for display name from message
  src = src.replace(
    /else if \(usuario === '595974154768'\)/,
    'else if (isSpecificOwner(usuario))'
  );
  src = src.replace(
    /if \(participant === '595974154768'\)/,
    'if (isSpecificOwner(participant))'
  );

  // 4) getContactName: replace owner tail logic and static JIDs up to cache check marker
  src = src.replace(
    /const ownerNumber = '974154768';[\s\S]*?\/\/ Verificar cache primero/,
    "const envOwner = ((process.env.OWNER_WHATSAPP_NUMBER || (Array.isArray(global.owner) && global.owner[0]?.[0]) || '') + '').replace(/[^0-9]/g, '');\n    const ownerNumber = envOwner;\n    const ownerTail = ownerNumber ? ownerNumber.slice(-9) : '';\n    \n    // Verificar cache primero"
  );

  // Replace owner block for contact name
  src = src.replace(
    /\/\/ Verificar si es el owner \(con diferentes formatos\)[\s\S]*?return ownerName;\n\s*\}/,
    `// Verificar si es el owner (con diferentes formatos)
    if ((ownerNumber && number === ownerNumber) ||
        (ownerTail && number === ownerTail) ||
        (ownerNumber && userId === \`${'${ownerNumber}'}@s.whatsapp.net\`) ||
        (ownerTail && fullUserId.endsWith(\`${'${ownerTail}'}@s.whatsapp.net\`)) ||
        isSpecificOwner(userId)) {
      const ownerName = 'Melodia (Owner)';
      logger.debug(\`[CONTACTO] Identificado como owner: \${ownerName}\`);
      nameCache.set(fullUserId, ownerName);
      if (ownerNumber) {
        nameCache.set(\`${'${ownerNumber}'}@s.whatsapp.net\`, ownerName);
        nameCache.set(ownerNumber, ownerName);
      }
      return ownerName;
    }`
  );

  // 5) /addaporte: replace case block to accept media (direct or quoted)
  src = src.replace(
    /case '\/addaporte':[\s\S]*?break;/,
    `case '/addaporte':
        try {
          const { processWhatsAppMedia } = await import('./file-manager.js');
          const aporteText = messageText.substring('/addaporte'.length).trim();
          const hasDirectMedia = !!(message.message?.imageMessage || message.message?.videoMessage || message.message?.documentMessage || message.message?.audioMessage);
          const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          let archivoPath = null;

          if (hasDirectMedia) {
            const res = await processWhatsAppMedia(message, 'aporte', usuario);
            if (res?.filepath) archivoPath = res.filepath;
          } else if (quoted && (quoted.imageMessage || quoted.videoMessage || quoted.documentMessage || quoted.audioMessage)) {
            const qmsg = { message: quoted };
            const res = await processWhatsAppMedia(qmsg, 'aporte', usuario);
            if (res?.filepath) archivoPath = res.filepath;
          }

          if (!aporteText && !archivoPath) {
            await sock.sendMessage(remoteJid, { text: 'ℹ️ Uso: /addaporte [texto opcional] adjuntando un archivo o respondiendo a uno.' });
          } else {
            result = await handleAddAporte(aporteText || '(archivo adjunto)', archivoPath ? 'media' : 'general', usuario, remoteJid, new Date().toISOString(), archivoPath || null);
          }
        } catch (error) {
          logger.error('Error en addaporte:', error);
          await sock.sendMessage(remoteJid, { text: '⚠️ Error agregando aporte. Intenta más tarde.' });
        }
        break;`
  );

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
  console.log('Parche aplicado a whatsapp.js');
})();
