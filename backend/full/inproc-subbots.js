import * as baileys from '@whiskeysockets/baileys';
import EventEmitter from 'events';
import path from 'path';
import fs from 'fs';
import db from './db.js';

const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = baileys;

const emitter = new EventEmitter();
const running = new Map(); // code -> { sock, type, targetNumber, status, lastEvent, lastSeen, dir, metadata }

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
function digits(val){ return String(val||'').replace(/[^0-9]/g,''); }

export function onSubbotEvent(event, handler){ emitter.on(event, handler); }

export async function listSubbots(){ return db('subbots').select('*').orderBy('created_at','desc'); }
export async function getSubbotByCode(code){ return db('subbots').where({ code }).first(); }

export async function fetchSubbotListWithOnlineFlag(){
  const subs = await listSubbots();
  return subs.map(s => ({ ...s, isOnline: running.has(s.code) && running.get(s.code).status === 'connected' }));
}

export async function deleteSubbot(code){
  try {
    const entry = running.get(code);
    if (entry?.sock){ try { await entry.sock.logout(); } catch(_){} try { entry.sock.end(); } catch(_){} }
    running.delete(code);
    await db('subbots').where({ code }).del();
    const dir = path.join(process.cwd(), 'backend', 'full', 'storage', 'subbots', code);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive:true, force:true });
    emitter.emit('stopped', { subbotId: code });
    return { success: true };
  } catch (e) {
    return { success:false, error: e.message };
  }
}

function codeId(type){
  const t = type === 'code' ? 'code' : 'qr';
  return `subbot_${Math.random().toString(36).substring(2,7)}_${Date.now()}`;
}

export async function launchSubbot({ type='qr', createdBy=null, requestJid=null, requestParticipant=null, targetNumber=null, metadata={} }){
  const normalizedType = type === 'code' ? 'code' : 'qr';
  const target = normalizedType === 'code' ? digits(targetNumber) : null;
  if (normalizedType === 'code' && !target) return { success:false, error:'Numero de emparejamiento invalido' };

  const code = codeId(normalizedType);
  const now = new Date().toISOString();
  const dir = path.join(process.cwd(), 'backend', 'full', 'storage', 'subbots', code);
  ensureDir(dir); ensureDir(path.join(dir,'auth'));

  const record = {
    code, type: normalizedType, status: 'launching',
    created_by: digits(createdBy), request_jid: requestJid, request_participant: requestParticipant,
    target_number: target, created_at: now, updated_at: now, last_heartbeat: now,
    metadata: metadata ? JSON.stringify(metadata) : null
  };
  await db('subbots').insert(record);
  startSubbotSocket({ code, type: normalizedType, dir, targetNumber: target, metadata });
  emitter.emit('launch', { subbot: record });
  return { success:true, subbot: record };
}

async function startSubbotSocket({ code, type, dir, targetNumber, metadata }){
  const { state, saveCreds } = await useMultiFileAuthState(path.join(dir,'auth'));
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({ version, logger: undefined, printQRInTerminal: false, auth: state, browser: ['KONMI Subbot','Desktop','1.0.0'] });
  running.set(code, { sock, type, targetNumber, status:'launching', lastEvent:'spawn', lastSeen: new Date().toISOString(), dir, metadata });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (u)=>{
    const entry = running.get(code);
    if (!entry) return;
    const { connection, qr, lastDisconnect } = u;
    if (qr && type === 'qr'){
      // Emit QR como PNG base64 (dataURL sin prefijo)
      try {
        const QR = await (await import('qrcode')).default;
        const png = await QR.toDataURL(qr, { errorCorrectionLevel:'M', margin:1, scale:6 });
        const base64 = png.split(',')[1];
        emitter.emit('qr_ready', { subbot: { code, request_jid: metadata?.requestJid || null, request_participant: metadata?.requesterJid || null, metadata }, data: { qrImage: base64 } });
      } catch (e) { emitter.emit('error', { subbot:{ code }, data:{ message:e.message }}); }
    }
    if (connection === 'open'){
      emitter.emit('connected', { subbot: { code } });
      entry.status = 'connected';
      // Si es tipo code, solicitar pairing inmediatamente
      if (type === 'code' && targetNumber){
        try {
          if (sock?.authState?.creds){ sock.authState.creds.usePairingCode = true; }
          const raw = await sock.requestPairingCode(targetNumber);
          const display = (metadata?.customPairingDisplay || 'KONMI-BOT');
          emitter.emit('pairing_code', { subbot: { code, target_number: targetNumber, request_jid: metadata?.requestJid || null, request_participant: metadata?.requesterJid || null, metadata }, data:{ code: raw, displayCode: display, targetNumber } });
        } catch(e){ emitter.emit('error', { subbot:{ code }, data:{ message:e.message }}); }
      }
    }
    if (connection === 'close'){
      const codeErr = lastDisconnect?.error?.output?.statusCode;
      emitter.emit('disconnected', { subbot: { code }, data:{ reason: codeErr }});
      entry.status = 'disconnected';
      // No auto-restart para simplificar
    }
  });
}

export async function registerSubbotEvent(){ return { success:false, error:'inproc manager does not accept external events' }; }
export async function getSubbotStatus(){
  const arr = [];
  for (const [code, info] of running.entries()){
    arr.push({ subbotId: code, status: info.status, lastEvent: info.lastEvent, lastSeen: info.lastSeen, isOnline: info.status==='connected' });
  }
  return arr;
}

// Reinicia todos los subbots en ejecucin para que tomen nueva configuracin
export async function reloadAllSubbots(){
  let total = 0;
  let restarted = 0;
  for (const [code, info] of running.entries()){
    total += 1;
    try {
      try { info.sock?.end(); } catch(_) {}
      const dir = info.dir || path.join(process.cwd(), 'backend', 'full', 'storage', 'subbots', code);
      await startSubbotSocket({ code, type: info.type, dir, targetNumber: info.targetNumber || null, metadata: info.metadata || {} });
      restarted += 1;
    } catch (_) {}
  }
  return { success: true, total, restarted };
}

