import { fork } from 'child_process';
import path from 'path';
import fs from 'fs';
import EventEmitter from 'events';
import { fileURLToPath } from 'url';
import db from './db.js';

const emitter = new EventEmitter();
const running = new Map(); // code -> { child, status, lastEvent, lastSeen, meta, restarts, markDeleted }

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storageRoot = path.join(__dirname, 'storage');
const subbotsRoot = path.join(storageRoot, 'subbots');

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
function digits(v){ return String(v||'').replace(/[^0-9]/g,''); }

ensureDir(subbotsRoot);

export function onSubbotEvent(event, handler) { emitter.on(event, handler); }

export async function registerSubbotEvent({ subbotId, token, event, data }) {
  try {
    // Verificar token si es necesario
    if (token) {
      const subbot = await getSubbotByCode(subbotId);
      if (!subbot || subbot.api_token !== token) {
        return { success: false, error: 'Token invlido' };
      }
    }

    // Registrar el evento
    await db('subbot_events').insert({
      code: subbotId,
      event: event,
      payload: JSON.stringify(data || {}),
      created_at: new Date().toISOString()
    });

    // Emitir el evento para que otros listeners lo reciban
    emitter.emit(event, { subbotId, data });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function listSubbots(){
  try { return await db('subbots').select('*').orderBy('created_at','desc'); }
  catch(e){ return []; }
}

export async function getSubbotByCode(code){ return db('subbots').where({ code }).first(); }

export async function fetchSubbotListWithOnlineFlag(){
  const subs = await listSubbots();
  return subs.map(s => ({ ...s, isOnline: running.has(s.code) && running.get(s.code).status === 'connected' }));
}

export async function getSubbotStatus(){
  const arr = [];
  for (const [code, info] of running.entries()){
    arr.push({ subbotId: code, status: info.status, lastEvent: info.lastEvent, lastSeen: info.lastSeen, isOnline: info.status === 'connected' });
  }
  return arr;
}

function newCode(type){
  const t = type === 'code' ? 'code' : 'qr';
  return `subbot_${Math.random().toString(36).substring(2,8)}_${Date.now()}`;
}

export async function deleteSubbot(code){
  try {
    const item = running.get(code);
    if (item){ item.markDeleted = true; }
    if (item?.child) { try { item.child.kill('SIGTERM'); } catch(_){} }
    running.delete(code);
    await db('subbots').where({ code }).del();
    const dir = path.join(subbotsRoot, code);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive:true, force:true });
    emitter.emit('stopped', { subbotId: code });
    return { success:true };
  } catch(e){
    return { success:false, error: e.message };
  }
}

export async function launchSubbot({ type='qr', createdBy=null, requestJid=null, requestParticipant=null, targetNumber=null, metadata={} }){
  // Quotas
  const MAX_GLOBAL = parseInt(process.env.SUB_MAX_GLOBAL || '50');
  const MAX_PER_USER = parseInt(process.env.SUB_MAX_PER_USER || '5');
  try {
    const total = await db('subbots').count('code as c').first();
    if (Number(total?.c || 0) >= MAX_GLOBAL) return { success:false, error:'Lmite global de sub-bots alcanzado' };
    const per = await db('subbots').where({ created_by: digits(createdBy) }).count('code as c').first();
    if (Number(per?.c || 0) >= MAX_PER_USER) return { success:false, error:'Lmite de sub-bots por usuario alcanzado' };
  } catch(_){}
  const normalizedType = type === 'code' ? 'code' : 'qr';
  const target = normalizedType === 'code' ? digits(targetNumber) : null;
  if (normalizedType === 'code' && !target) return { success:false, error:'Nmero invlido' };

  const code = newCode(normalizedType);
  const now = new Date().toISOString();
  const dir = path.join(subbotsRoot, code);
  ensureDir(dir); ensureDir(path.join(dir,'auth'));

  const meta = {
    ...metadata,
    requestJid,
    requesterJid: requestParticipant || requestJid,
  };

  const record = {
    code,
    type: normalizedType,
    status: 'launching',
    created_by: digits(createdBy),
    request_jid: requestJid,
    request_participant: requestParticipant,
    target_number: target,
    created_at: now,
    updated_at: now,
    last_heartbeat: now,
    metadata: JSON.stringify(meta)
  };
  await db('subbots').insert(record);

  const runnerPath = path.join(__dirname, 'subbot-runner.js');
  const child = fork(runnerPath, [], {
    stdio: ['ignore','inherit','inherit','ipc'],
    env: {
      ...process.env,
      SUB_CODE: code,
      SUB_TYPE: normalizedType,
      SUB_DIR: dir,
      SUB_TARGET: target || '',
      SUB_METADATA: JSON.stringify(meta),
      SUB_DISPLAY: meta.customPairingDisplay || 'KONMI-BOT'
    }
  });

  running.set(code, { child, status:'launching', lastEvent:'spawn', lastSeen: now, meta, restarts: 0, markDeleted: false });

  async function recordEvent(ev, data){
    try { await db('subbot_events').insert({ code, event: ev, payload: JSON.stringify(data||{}), created_at: new Date().toISOString() }); } catch(_){}
  }

  child.on('message', async (msg) => {
    const info = running.get(code);
    if (!info) return;
    info.lastSeen = new Date().toISOString();
    info.lastEvent = msg?.event || 'message';
    let updates = { updated_at: info.lastSeen };
    switch (msg?.event) {
      case 'qr_ready':
        updates.status = 'pending';
        if (msg.data?.qrImage) updates.qr_data = msg.data.qrImage;
        emitter.emit('qr_ready', { subbot: { ...record, ...updates }, data: msg.data });
        await recordEvent('qr_ready', msg.data);
        break;
      case 'pairing_code':
        updates.status = 'pending';
        emitter.emit('pairing_code', { subbot: { ...record, ...updates }, data: msg.data });
        await recordEvent('pairing_code', msg.data);
        break;
      case 'connected':
        info.status = 'connected';
        updates.status = 'connected';
        emitter.emit('connected', { subbot: { ...record, ...updates } });
        await recordEvent('connected');
        break;
      case 'disconnected':
        info.status = 'disconnected';
        updates.status = 'disconnected';
        emitter.emit('disconnected', { subbot: { ...record, ...updates }, data: msg.data });
        await recordEvent('disconnected', msg.data);
        break;
      case 'error':
        updates.status = 'error';
        emitter.emit('error', { subbot: { ...record, ...updates }, data: msg.data });
        await recordEvent('error', msg.data);
        break;
      default:
        break;
    }
    try { await db('subbots').where({ code }).update(updates); } catch(_){}
  });

  child.on('exit', async (codeExit, signal) => {
    const info = running.get(code);
    if (info) info.status = 'stopped';
    try { await db('subbots').where({ code }).update({ status:'stopped', updated_at: new Date().toISOString() }); } catch(_){}
    emitter.emit('stopped', { subbotId: code, code: codeExit, signal });
    try { await db('subbot_events').insert({ code, event:'stopped', payload: JSON.stringify({ codeExit, signal }), created_at: new Date().toISOString() }); } catch(_){}
    // Auto-restart backoff si no fue delete explcito
    if (info && !info.markDeleted) {
      const MAX_RESTARTS = parseInt(process.env.SUB_MAX_RESTARTS || '3');
      if (info.restarts < MAX_RESTARTS) {
        const delay = Math.min(10000, 2000 * (info.restarts + 1));
        info.restarts += 1;
        try { await db('subbot_events').insert({ code, event:'restart_scheduled', payload: JSON.stringify({ delay }), created_at: new Date().toISOString() }); } catch(_){}
        setTimeout(() => {
          startSubbotSocket({ code, type: record.type, dir, targetNumber: record.target_number, metadata: meta });
        }, delay);
      }
    }
  });

  emitter.emit('launch', { subbot: record });
  return { success:true, subbot: record };
}
