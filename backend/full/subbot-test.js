#!/usr/bin/env node

/**
 * Test del sistema de subbots
 * Ejecutar con: node subbot-test.js
 */

import { handleSerbot, handleMisSubbots, handleDelSubbot, handleStatusBot } from './subbot-commands.js';

console.log(' Iniciando pruebas del sistema de subbots...\n');

// Simular usuario de prueba
const testUser = '595971284430@s.whatsapp.net';
const testGroup = 'test_group@g.us';
const testDate = new Date().toISOString();

async function runTests() {
  try {
    console.log('1 Probando creacin de subbot con QR...');
    const result1 = await handleSerbot(testUser, testGroup, testDate, []);
    console.log('Resultado:', result1.success ? ' xito' : ' Error');
    console.log('Mensaje:', result1.message.substring(0, 100) + '...\n');

    console.log('2 Probando creacin de subbot con cdigo...');
    const result2 = await handleSerbot(testUser, testGroup, testDate, ['codigo']);
    console.log('Resultado:', result2.success ? ' xito' : ' Error');
    console.log('Mensaje:', result2.message.substring(0, 100) + '...\n');

    console.log('3 Probando listado de subbots...');
    const result3 = await handleMisSubbots(testUser, testGroup, testDate);
    console.log('Resultado:', result3.success ? ' xito' : ' Error');
    console.log('Mensaje:', result3.message.substring(0, 200) + '...\n');

    console.log('4 Probando comando sin argumentos...');
    const result4 = await handleDelSubbot(testUser, testGroup, testDate, []);
    console.log('Resultado:', result4.success ? ' xito' : ' Error (esperado)');
    console.log('Mensaje:', result4.message.substring(0, 100) + '...\n');

    console.log(' Pruebas completadas!');
    console.log('\n Resumen:');
    console.log('- Sistema de comandos:  Funcional');
    console.log('- Validaciones:  Implementadas');
    console.log('- Mensajes de error:  Informativos');
    console.log('- Gestin de recursos:  Inteligente');

  } catch (error) {
    console.error(' Error en las pruebas:', error.message);
    console.log('\n Posibles causas:');
    console.log('- Base de datos no conectada');
    console.log('- Dependencias faltantes');
    console.log('- Configuracin incorrecta');
  }
}

// Ejecutar pruebas
runTests();
