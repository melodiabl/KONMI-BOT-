// subbot.js
const baileys = require('@whiskeysockets/baileys');
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = baileys;
const axios = require('axios');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function main() {
  rl.question('Introduce el código de emparejamiento: ', async (code) => {
    // Info básica del subbot
    const subbotInfo = { nombre: 'Subbot', version: '1.0.0' };
    try {
      const res = await axios.post('http://localhost:3001/api/subbot/pair', { code, subbotInfo });
      const { id, token, config } = res.data;
      const subbotDir = path.join(__dirname, 'subbots', `subbot-${id}`);
      if (!fs.existsSync(subbotDir)) fs.mkdirSync(subbotDir, { recursive: true });
      fs.writeFileSync(path.join(subbotDir, 'subbot.json'), JSON.stringify({ id, token, config }, null, 2));
      console.log('✅ Subbot emparejado correctamente. ID:', id);
      // Iniciar sesión de WhatsApp para este subbot
      await startSubbotSession(subbotDir, id, token);
    } catch (e) {
      console.error('❌ Error al emparejar subbot:', e.response?.data || e.message);
    }
    rl.close();
  });
}

async function startSubbotSession(subbotDir, id, token) {
  const authDir = path.join(subbotDir, 'auth');
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version,
    logger: baileys.pino({ level: 'silent' }),
    printQRInTerminal: true,
    auth: state,
    browser: ['Subbot', 'Desktop', '1.0.0'],
  });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (update) => {
    if (update.connection === 'open') {
      console.log('🤖 Subbot conectado a WhatsApp');
    }
  });
  sock.ev.on('messages.upsert', async (m) => {
    const message = m.messages[0];
    if (!message.key.fromMe && message.message) {
      await processSubbotMessage(sock, message, id, token);
    }
  });
}

async function processSubbotMessage(sock, message, id, token) {
  const remoteJid = message.key.remoteJid;
  const isGroup = remoteJid.endsWith('@g.us');
  const sender = message.key.participant || remoteJid;
  const usuario = sender.split('@')[0];
  const messageText = message.message.conversation || message.message.extendedTextMessage?.text || '';
  if (!messageText.startsWith('/') && !messageText.startsWith('!')) return;
  // Sincronizar comandos/configuración
  let config = {};
  try {
    const res = await axios.post('http://localhost:3001/api/subbot/update', { subbotId: id, token });
    config = res.data;
  } catch (e) {
    console.error('❌ Error sincronizando comandos:', e.response?.data || e.message);
  }
  // Procesar comandos básicos (puedes expandir esto según tu lógica principal)
  if (messageText.startsWith('/ping')) {
    await sock.sendMessage(remoteJid, { text: '🏓 Pong desde subbot!' });
  } else if (messageText.startsWith('/help')) {
    await sock.sendMessage(remoteJid, { text: '🤖 Este es un subbot. Comandos disponibles: /ping, /help' });
  } else if (config && config.commands) {
    // Aquí puedes ejecutar comandos sincronizados desde el principal
    // Por ejemplo: if (messageText.startsWith('/info')) { ... }
  }
}

main();
