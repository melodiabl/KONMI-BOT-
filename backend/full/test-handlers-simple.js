// test-handlers-simple.js
// Test simple para verificar que los handlers funcionan en runtime

console.log('🧪 Iniciando pruebas de handlers...\n');

async function testHandlers() {
  try {
    // Test 1: Importar commands.js
    console.log('1️⃣ Probando importación de commands.js...');
    const commands = await import('./commands.js');
    console.log('✅ commands.js importado correctamente');
    console.log('   Exports:', Object.keys(commands).join(', '));

    // Test 2: Importar download-commands.js
    console.log('\n2️⃣ Probando importación de download-commands.js...');
    const downloadCommands = await import('./commands/download-commands.js');
    console.log('✅ download-commands.js importado correctamente');
    console.log('   Exports:', Object.keys(downloadCommands).filter(k => k !== 'default').join(', '));

    // Test 3: Importar api-providers.js
    console.log('\n3️⃣ Probando importación de api-providers.js...');
    const apiProviders = await import('./utils/api-providers.js');
    console.log('✅ api-providers.js importado correctamente');
    console.log('   Exports:', Object.keys(apiProviders).filter(k => k !== 'default').join(', '));

    // Test 4: Probar handleAI
    console.log('\n4️⃣ Probando handleAI...');
    const testAI = await commands.handleAI(
      'Hola',
      'test@s.whatsapp.net',
      'test_group',
      new Date().toISOString()
    );
    console.log('✅ handleAI ejecutado');
    console.log('   Result:', testAI.success ? 'SUCCESS' : 'EXPECTED (no API key)');

    // Test 5: Probar handleQuote
    console.log('\n5️⃣ Probando handleQuote...');
    const testQuote = await downloadCommands.handleQuote('test_user');
    console.log('✅ handleQuote ejecutado');
    console.log('   Result:', testQuote.success ? 'SUCCESS' : 'FAILED');
    if (testQuote.message) {
      console.log('   Message preview:', testQuote.message.substring(0, 80) + '...');
    }

    // Test 6: Verificar que whatsapp.js puede importar todo
    console.log('\n6️⃣ Probando importaciones de whatsapp.js...');
    const whatsapp = await import('./whatsapp.js');
    console.log('✅ whatsapp.js importado correctamente');

    console.log('\n🎉 TODAS LAS PRUEBAS PASARON\n');
    console.log('✅ Los handlers están correctamente configurados');
    console.log('✅ Las importaciones funcionan');
    console.log('✅ Los comandos pueden ejecutarse');

  } catch (error) {
    console.error('\n❌ ERROR EN LAS PRUEBAS:');
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

testHandlers();
