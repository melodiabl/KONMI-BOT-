import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

import {
  launchSubbot,
  stopSubbot,
  listActiveSubbots,
  registerSubbotListeners,
  unregisterSubbotListeners
} from '../inproc-subbots.js';
import {
  createSubbotWithPairing,
  createSubbotWithQr,
  listUserSubbots,
  deleteUserSubbot,
  getSubbotByCode,
  markSubbotConnected,
  markSubbotDisconnected,
  getActiveRuntimeSubbots,
  updateSubbotMetadata,
  syncAllRuntimeStates,
  cleanOrphanSubbots
} from '../subbot-manager.js';

const SUBBOTS_DIR = path.join(process.cwd(), 'storage', 'subbots');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function generateSubbotPairingCode(ownerNumber, targetNumber, options = {}) {
  return createSubbotWithPairing({
    ownerNumber,
    targetNumber,
    displayName: options.displayName,
    requestJid: options.requestJid,
    requestParticipant: options.requestParticipant
  });
}

export function generateSubbotQR(ownerNumber, options = {}) {
  return createSubbotWithQr({
    ownerNumber,
    displayName: options.displayName,
    requestJid: options.requestJid
  });
}

export function getSubbotStatus(code) {
  return getSubbotByCode(code);
}

export function getAllSubbots(ownerNumber) {
  return listUserSubbots(ownerNumber);
}

export async function startSubbot({ type, ownerNumber, targetNumber, metadata }) {
  ensureDir(SUBBOTS_DIR);
  const launchResult = await launchSubbot({
    type,
    createdBy: ownerNumber,
    targetNumber,
    metadata
  });
  if (!launchResult.success) {
    throw new Error(launchResult.error || 'No se pudo lanzar el subbot');
  }
  return launchResult.subbot;
}

export async function stopSubbotRuntime(code) {
  await stopSubbot(code);
}

export async function removeSubbot(code, ownerNumber) {
  await deleteUserSubbot(code, ownerNumber);
}

export function listRuntimeSubbots() {
  return listActiveSubbots();
}

export function attachSubbotListeners(code, listeners) {
  return registerSubbotListeners(code, listeners);
}

export function detachSubbotListeners(code, predicate) {
  return unregisterSubbotListeners(code, predicate);
}

export async function syncSubbotsRuntime() {
  await syncAllRuntimeStates();
}

export async function cleanupSubbots() {
  await cleanOrphanSubbots();
}

// Reexportar stopSubbot para compatibilidad con consumidores existentes
export { stopSubbot };

export default {
  generateSubbotPairingCode,
  generateSubbotQR,
  getSubbotStatus,
  getAllSubbots,
  startSubbot,
  stopSubbotRuntime,
  removeSubbot,
  listRuntimeSubbots,
  attachSubbotListeners,
  detachSubbotListeners,
  syncSubbotsRuntime,
  cleanupSubbots
};
