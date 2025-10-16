// test-handlemessage.js
// Script de prueba para identificar problemas en handleMessage

import { handleMessage } from './whatsapp.js';

console.log('🧪 Test de handleMessage\n');

// Mensaje de prueba simple
const testMessage = {
  key: {
    remoteJid: '595974154768@s.whatsapp.net',
    fromMe: false,
    id: 'TEST123',
  },
  message: {
    conversation: '/help',
  },
  pushName: 'Test User',
  messageTimestamp: Math.floor(Date.now() / 1000),
};

// Socket mock simple
const mockSock = {
  sendMessage: async (jid, content) => {
    console.log('✅ Mock sendMessage llamado:');
    console.log('   JID:', jid);
    console.log('   Content:', JSON.stringify(content, null, 2));
    return { status: 'success' };
  },
  user: {
    id: '51947266830:57@s.whatsapp.net',
  },
};

async function runTest() {
  try {
    console.log('📤 Enviando mensaje de prueba...\n');
    console.log('Mensaje:', JSON.stringify(testMessage, null, 2));
    console.log('\n⏳ Procesando...\n');

    await handleMessage(testMessage, mockSock);

    console.log('\n✅ Test completado sin errores');
  } catch (error) {
    console.error('\n❌ ERROR CAPTURADO EN TEST:');
    console.error('Tipo:', error?.constructor?.name || 'Unknown');
    console.error('Mensaje:', error?.message || 'Sin mensaje');
    console.error('Stack:\n', error?.stack || 'Sin stack trace');
    console.error('\nError completo:', error);
    process.exit(1);
  }
}

runTest();
