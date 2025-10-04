import * as baileys from 'baileys-mod';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';

const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = baileys;

const CODE = process.env.SUB_CODE;
const TYPE = process.env.SUB_TYPE || 'qr';
const DIR = process.env.SUB_DIR;
const TARGET = (process.env.SUB_TARGET || '').replace(/[^0-9]/g,'');
const META = (() => { try { return JSON.parse(process.env.SUB_METADATA||'{}'); } catch(_) { return {}; } })();
const DISPLAY = process.env.SUB_DISPLAY || 'KONMI-BOT';

if (!CODE || !DIR) {
  process.send?.({ event:'error', data:{ message:'Missing SUB_CODE or SUB_DIR' } });
  process.exit(1);
}

async function start(){
  try {
    console.log('Iniciando subbot runner...');
    console.log('CODE:', CODE);
    console.log('TYPE:', TYPE);
    console.log('DIR:', DIR);
    console.log('TARGET:', TARGET);
    
    const authDir = path.join(DIR, 'auth');
    console.log('Auth dir:', authDir);
    
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    console.log('Auth state loaded');
    
    const { version } = await fetchLatestBaileysVersion();
    console.log('Baileys version:', version);
    
    const sock = makeWASocket({ version, logger: pino({ level: 'silent' }), printQRInTerminal:false, auth: state, browser:['KONMI Subbot','Desktop','1.0.0'] });
    console.log('Socket created');
    
    sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (u) => {
    const { connection, qr, lastDisconnect } = u;
    console.log('Connection update:', { connection, hasQR: !!qr, hasTarget: !!TARGET });
    
    if (qr && TYPE === 'qr'){
      try {
        console.log('Generando QR...');
        const QR = await import('qrcode');
        const png = await QR.default.toDataURL(qr, { 
          errorCorrectionLevel:'H', 
          margin:2, 
          scale:8,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
        const base64 = png.split(',')[1];
        console.log('QR generado, enviando evento...');
        try {
          process.send?.({ event:'qr_ready', data:{ qrImage: base64, qrCode: qr } });
        } catch (e) {
          console.log('No se pudo enviar mensaje al proceso padre (probablemente cerrado)');
        }
      } catch(e){ 
        console.error('Error generando QR:', e);
        try {
          process.send?.({ event:'error', data:{ message: e.message } });
        } catch (sendError) {
          console.log('No se pudo enviar mensaje al proceso padre (probablemente cerrado)');
        } 
      }
    }
    
    if (connection === 'open'){
      console.log('Conexin abierta');
      try {
        process.send?.({ event:'connected' });
      } catch (e) {
        console.log('No se pudo enviar mensaje al proceso padre (probablemente cerrado)');
      }
      
      if (TYPE === 'code' && TARGET){
        try {
          console.log('Solicitando cdigo de pairing para:', TARGET);
          if (sock?.authState?.creds){ 
            sock.authState.creds.usePairingCode = true; 
          }
          const raw = await sock.requestPairingCode(TARGET);
          console.log('Cdigo de pairing obtenido:', raw);
          try {
            process.send?.({ event:'pairing_code', data:{ code: raw, displayCode: DISPLAY, targetNumber: TARGET } });
          } catch (e) {
            console.log('No se pudo enviar mensaje al proceso padre (probablemente cerrado)');
          }
        } catch(e){ 
          console.error('Error obteniendo cdigo de pairing:', e);
          try {
          process.send?.({ event:'error', data:{ message: e.message } });
        } catch (sendError) {
          console.log('No se pudo enviar mensaje al proceso padre (probablemente cerrado)');
        } 
        }
      }
    }
    
    if (connection === 'close'){
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log('Conexin cerrada, cdigo:', code);
      try {
        process.send?.({ event:'disconnected', data:{ reason: code } });
      } catch (e) {
        console.log('No se pudo enviar mensaje al proceso padre (probablemente cerrado)');
      }
      process.exit(0);
    }
  });
  } catch (error) {
    console.error('Error en start():', error);
    process.send?.({ event:'error', data:{ message: error.message } });
    process.exit(1);
  }
}

start().catch((e)=>{
  console.error('Error en start():', e);
  process.send?.({ event:'error', data:{ message: e.message } });
  process.exit(1);
});

