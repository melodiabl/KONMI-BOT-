// commands/system-info.js
// Estado del bot y del sistema

import os from 'os';
import { getConnectionStatus, getBotStatus } from '../whatsapp.js';

function humanBytes(n) {
  const u = ['B','KB','MB','GB','TB'];
  let i = 0; let v = Math.max(0, Number(n)||0);
  while (v >= 1024 && i < u.length-1) { v/=1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
}

export async function status() {
  const st = getConnectionStatus();
  const bot = getBotStatus();
  const mem = process.memoryUsage();
  const load = os.loadavg?.() || [];
  let msg = '📊 Estado del Bot\n\n';
  msg += `Conexión: ${bot.connected ? 'Conectado' : bot.connectionStatus}\n`;
  if (bot.pairingNumber) msg += `Pairing: ${bot.pairingNumber}\n`;
  if (bot.qrCode) msg += `QR: disponible\n`;
  msg += `Uptime: ${st.status === 'connected' ? Math.round(process.uptime()) + 's' : '0s'}\n`;
  msg += `Memoria: RSS ${humanBytes(mem.rss)}, Heap ${humanBytes(mem.heapUsed)}\n`;
  if (load.length) msg += `Carga: ${load.map(n=>n.toFixed(2)).join(' | ')}\n`;
  return { success: true, message: msg, quoted: true };
}

export async function serverInfo() {
  const cpus = os.cpus?.() || [];
  const memTotal = os.totalmem?.() || 0;
  const memFree = os.freemem?.() || 0;
  let msg = '🖥️ Server Info\n\n';
  msg += `SO: ${os.type?.()} ${os.release?.()} (${os.platform?.()})\n`;
  msg += `CPU: ${cpus[0]?.model || 'N/A'} x${cpus.length} @ ${(cpus[0]?.speed||0)/1000} GHz\n`;
  msg += `Mem: ${humanBytes(memFree)} libres / ${humanBytes(memTotal)} totales\n`;
  return { success: true, message: msg, quoted: true };
}

export async function hardware() {
  const cpus = os.cpus?.() || [];
  let msg = '🔧 Hardware\n\n';
  msg += cpus.slice(0,4).map((c,i)=>`CPU${i+1}: ${c.model} @ ${c.speed}MHz`).join('\n');
  return { success: true, message: msg, quoted: true };
}

export async function runtime() {
  let msg = '⏱️ Runtime\n\n';
  msg += `Node: ${process.version}\n`;
  msg += `PID: ${process.pid}\n`;
  msg += `Uptime: ${Math.round(process.uptime())}s\n`;
  return { success: true, message: msg, quoted: true };
}
