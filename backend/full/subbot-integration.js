import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import db from './db.js';
import logger from './config/logger.js';
import * as multiAccount from './multiaccount-manager.js';

const subbotEvents = new EventEmitter();
const SUBS_DIR = path.join(process.cwd(), 'storage', 'subbots');

class SubbotIntegration {
  constructor() {
    this.activeSubbots = new Map();
    this.setupEventHandlers();
    this.cleanupInterval = setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000);
  }

  setupEventHandlers() {
    subbotEvents.on('create', async ({ type, phoneNumber, ownerJid, displayName = 'KONMI-BOT' }) => {
      try {
        let result;
        if (type === 'pairing') result = await this.createPairingSubbot(phoneNumber, ownerJid, displayName);
        import { EventEmitter } from 'events';
        import path from 'path';
        import fs from 'fs';
        import db from './db.js';
        import logger from './config/logger.js';
        import * as multiAccount from './multiaccount-manager.js';

        const subbotEvents = new EventEmitter();
        const SUBS_DIR = path.join(process.cwd(), 'storage', 'subbots');

        class SubbotIntegration {
          constructor() {
            this.activeSubbots = new Map();
            this.setupEventHandlers();
            this.cleanupInterval = setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000);
          }

          setupEventHandlers() {
            subbotEvents.on('create', async ({ type, phoneNumber, ownerJid, displayName = 'KONMI-BOT' }) => {
              try {
                let result;
                if (type === 'pairing') result = await this.createPairingSubbot(phoneNumber, ownerJid, displayName);
                else result = await this.createQRSubbot(ownerJid, displayName);
                subbotEvents.emit('created', { ...result, ownerJid });
              } catch (err) {
                logger.error('Error creating subbot', err);
                subbotEvents.emit('error', { error: err.message || String(err), ownerJid, type });
              }
            });
          }

          async createPairingSubbot(phoneNumber, ownerJid, displayName) {
            const result = await multiAccount.generateSubbotPairingCode(phoneNumber, displayName);
            if (!result?.success) throw new Error(result?.error || 'Failed to generate pairing code');

            const now = new Date();
            await db('subbots').insert({
              id: result.sessionId,
              owner_jid: ownerJid,
              phone_number: phoneNumber,
              display_name: displayName,
              type: 'pairing',
              status: 'pending',
              created_at: now,
              expires_at: new Date(result.expiresAt),
              metadata: JSON.stringify({ code: result.code, displayCode: result.displayCode, expiresAt: result.expiresAt })
            });

            await this.startSubbotConnection(result.sessionId, ownerJid);
            return { success: true, sessionId: result.sessionId, code: result.code, displayCode: result.displayCode, expiresAt: result.expiresAt };
          }

          async createQRSubbot(ownerJid, displayName) {
            const result = await multiAccount.generateSubbotQR(displayName);
            if (!result?.success) throw new Error(result?.error || 'Failed to generate QR');

            const now = new Date();
            await db('subbots').insert({
              id: result.sessionId,
              owner_jid: ownerJid,
              display_name: displayName,
              type: 'qr',
              status: 'pending',
              created_at: now,
              expires_at: new Date(result.expiresAt),
              metadata: JSON.stringify({ qr: result.qr, expiresAt: result.expiresAt })
            });

            await this.startSubbotConnection(result.sessionId, ownerJid);
            return { success: true, sessionId: result.sessionId, qr: result.qr, expiresAt: result.expiresAt };
          }

          async startSubbotConnection(sessionId, ownerJid) {
            try {
              const sessionPath = path.join(SUBS_DIR, 'sessions', sessionId);
              await fs.promises.mkdir(sessionPath, { recursive: true });

              const res = await multiAccount.startSession(sessionId, {
                onQR: async ({ sessionId: sid, qr, qrUrl }) => {
                  await db('subbots').where({ id: sid }).update({ status: 'qr_ready', qr_code: qrUrl || qr, last_activity: new Date() });
                  subbotEvents.emit('qr', { sessionId: sid, qr: qrUrl || qr, ownerJid });
                },
                onConnected: async ({ sessionId: sid, phoneNumber, user }) => {
                  await db('subbots').where({ id: sid }).update({ status: 'connected', phone_number: phoneNumber, connected_at: new Date(), last_activity: new Date() });
                  this.activeSubbots.set(sid, { sessionId: sid, ownerJid, phoneNumber, connectedAt: new Date() });
                  subbotEvents.emit('connected', { sessionId: sid, phoneNumber, ownerJid });
                },
                onDisconnected: async ({ sessionId: sid, reason }) => {
                  await db('subbots').where({ id: sid }).update({ status: 'disconnected', last_activity: new Date() });
                  this.activeSubbots.delete(sid);
                  subbotEvents.emit('disconnected', { sessionId: sid, ownerJid, reason });
                }
              });

              return res;
            } catch (err) {
              logger.error('Error starting session', err);
              await db('subbots').where({ id: sessionId }).update({ status: 'error', last_activity: new Date(), metadata: JSON.stringify({ error: err.message }) });
              throw err;
            }
          }

          async cleanupSubbot(sessionId) {
            const session = this.activeSubbots.get(sessionId);
            if (session?.socket) {
              try { await session.socket.logout?.(); } catch(e) {}
              try { await session.socket.end?.(); } catch(e) {}
            }
            this.activeSubbots.delete(sessionId);

            await db('subbots').where({ id: sessionId }).update({ status: 'disconnected', is_active: false, last_activity: new Date() });

            const sessionPath = path.join(SUBS_DIR, 'sessions', sessionId);
            if (fs.existsSync(sessionPath)) {
              try { await fs.promises.rm(sessionPath, { recursive: true, force: true }); } catch (e) { logger.warn('Failed to remove session dir', e); }
            }

            return true;
          }

          async cleanupExpiredSessions() {
            try {
              const expired = await db('subbots').where('expires_at', '<', new Date()).andWhere('status', '!=', 'expired');
              for (const s of expired) {
                await this.cleanupSubbot(s.id);
                await db('subbots').where({ id: s.id }).update({ status: 'expired' });
              }
              return expired.length;
            } catch (err) {
              logger.error('cleanupExpiredSessions error', err);
              return 0;
            }
          }

          async getOwnerSubbots(ownerJid) {
            try {
              return await db('subbots').where({ owner_jid: ownerJid }).orderBy('created_at', 'desc');
            } catch (err) {
              logger.error('getOwnerSubbots error', err);
              return [];
            }
          }

          async deleteSubbot(sessionId, ownerJid) {
            try {
              const subbot = await db('subbots').where({ id: sessionId, owner_jid: ownerJid }).first();
              if (!subbot) throw new Error('Subbot not found or unauthorized');

              await this.cleanupSubbot(sessionId);
              await db('subbots').where({ id: sessionId }).delete();

              const sessionPath = path.join(SUBS_DIR, 'sessions', sessionId);
              if (fs.existsSync(sessionPath)) {
                try { await fs.promises.rm(sessionPath, { recursive: true, force: true }); } catch (e) { logger.warn('Failed to remove session dir', e); }
              }

              return true;
            } catch (err) {
              logger.error('deleteSubbot error', err);
              throw err;
            }
          }
        }

        export const subbotIntegration = new SubbotIntegration();
        export default subbotIntegration;


