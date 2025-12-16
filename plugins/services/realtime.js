import pg from 'pg';
import knexConfig from '../../knexfile.js';

const env = process.env.NODE_ENV || 'development';
const config = (knexConfig.default || knexConfig)[env];

const clientsByChannel = new Map();
const channelConfigs = new Map();
const desiredChannels = new Set();
const activeChannels = new Set();

let listenerClient = null;
let listenerReady = false;
let reconnectTimer = null;
let connectingPromise = null;

function getPgConnectionConfig() {
  if (!config || !config.connection) {
    return null;
  }
  if (typeof config.connection === 'string') {
    return { connectionString: config.connection };
  }
  return config.connection;
}

function getChannelClients(channel) {
  if (!clientsByChannel.has(channel)) {
    clientsByChannel.set(channel, new Set());
  }
  return clientsByChannel.get(channel);
}

function broadcast(channel, event = {}) {
  const config = channelConfigs.get(channel) || {};
  const payload = JSON.stringify({ type: config.eventType || 'event', channel, ...event });
  const clients = getChannelClients(channel);
  for (const res of clients) {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch (error) {
      clients.delete(res);
    }
  }
}

function handleNotification(msg) {
  try {
    const data = msg.payload ? JSON.parse(msg.payload) : {};
    broadcast(msg.channel, data);
  } catch (error) {
    console.error(`Error procesando notificacion del canal ${msg.channel}:`, error);
    broadcast(msg.channel, { operation: 'unknown' });
  }
}

function handleListenerError(error) {
  console.error('Error en listener de eventos en tiempo real:', error);
  listenerReady = false;
  activeChannels.clear();
  if (listenerClient) {
    listenerClient.removeAllListeners('notification');
    listenerClient.removeAllListeners('error');
    try {
      listenerClient.end().catch(() => {});
    } catch (_) {}
  }
  listenerClient = null;
  connectingPromise = null;
  scheduleReconnect();
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    ensureListener().catch((err) => {
      console.error('Error reintentando conexion de eventos en tiempo real:', err);
    });
  }, 5000);
}

async function ensureListener() {
  if (listenerClient) {
    return;
  }
  if (connectingPromise) {
    return connectingPromise;
  }

  const pgConfig = getPgConnectionConfig();
  if (!pgConfig) {
    console.warn('Configuracion de PostgreSQL no disponible para eventos en tiempo real');
    return;
  }

  connectingPromise = (async () => {
    const client = new pg.Client(pgConfig);
    client.on('notification', handleNotification);
    client.on('error', handleListenerError);

    try {
      await client.connect();
      listenerClient = client;
      listenerReady = true;
      activeChannels.clear();
      for (const channel of desiredChannels) {
        try {
          await client.query(`LISTEN ${channel}`);
          activeChannels.add(channel);
          console.log(`Escuchando canal de eventos: ${channel}`);
        } catch (channelError) {
          console.error(`No se pudo suscribir al canal ${channel}:`, channelError);
        }
      }
    } catch (error) {
      listenerReady = false;
      try {
        await client.end();
      } catch (_) {}
      listenerClient = null;
      throw error;
    } finally {
      connectingPromise = null;
    }
  })();

  try {
    await connectingPromise;
  } catch (error) {
    handleListenerError(error);
  }
}

async function ensureChannelSubscription(channel) {
  desiredChannels.add(channel);
  await ensureListener();
  if (listenerClient && listenerReady && !activeChannels.has(channel)) {
    try {
      await listenerClient.query(`LISTEN ${channel}`);
      activeChannels.add(channel);
      console.log(`Escuchando canal de eventos: ${channel}`);
    } catch (error) {
      console.error(`No se pudo suscribir al canal ${channel}:`, error);
    }
  }
}

function setupStream(channel, eventType, req, res) {
  channelConfigs.set(channel, { eventType });

  ensureChannelSubscription(channel).catch((error) => {
    console.error(`No se pudo garantizar la suscripcion para ${channel}:`, error);
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify({ type: 'connected', channel, listenerReady })}\n\n`);

  const clients = getChannelClients(channel);
  clients.add(res);

  const keepAlive = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(keepAlive);
      clients.delete(res);
      return;
    }
    res.write(': keep-alive\n\n');
  }, 20000);

  const closeHandler = () => {
    clearInterval(keepAlive);
    clients.delete(res);
  };

  req.on('close', closeHandler);
  res.on?.('close', closeHandler);
}

export function handleBotCommandsStream(req, res) {
  setupStream('bot_commands_changes', 'botCommandChanged', req, res);
}

export function handleUsuariosStream(req, res) {
  setupStream('usuarios_changes', 'usuarioChanged', req, res);
}

export function handleGruposStream(req, res) {
  setupStream('grupos_changes', 'grupoChanged', req, res);
}

export function handlePedidosStream(req, res) {
  setupStream('pedidos_changes', 'pedidoChanged', req, res);
}

export function handleNotificacionesStream(req, res) {
  setupStream('notificaciones_changes', 'notificationChanged', req, res);
}

export function handleAportesStream(req, res) {
  setupStream('aportes_changes', 'aporteChanged', req, res);
}

export function emitBotCommandsEvent(event = {}) {
  broadcast('bot_commands_changes', event);
}

export function emitUsuariosEvent(event = {}) {
  broadcast('usuarios_changes', event);
}

export function emitGruposEvent(event = {}) {
  broadcast('grupos_changes', event);
}

export function emitPedidosEvent(event = {}) {
  broadcast('pedidos_changes', event);
}

export function emitNotificacionesEvent(event = {}) {
  broadcast('notificaciones_changes', event);
}

export function emitAportesEvent(event = {}) {
  broadcast('aportes_changes', event);
}

export function emitChannelEvent(channel, event = {}) {
  broadcast(channel, event);
}
