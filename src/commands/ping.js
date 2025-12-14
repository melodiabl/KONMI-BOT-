// src/commands/ping.js

async function handlePing(ctx) {
  return { text: '🏓 Pong' };
}

export default {
  name: 'ping',
  description: 'Responde con Pong.',
  category: 'utils',
  handler: handlePing,
};
