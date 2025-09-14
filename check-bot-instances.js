// Script para verificar instancias del bot
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function checkBotInstances() {
  try {
    console.log('🔍 Verificando instancias del bot...');
    
    // En Windows, buscar procesos node que contengan "index.js"
    const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV');
    
    const lines = stdout.split('\n').filter(line => line.includes('node.exe'));
    
    if (lines.length > 1) {
      console.log(`⚠️ Se encontraron ${lines.length} procesos node.exe ejecutándose:`);
      lines.forEach((line, index) => {
        console.log(`   ${index + 1}. ${line.trim()}`);
      });
      
      console.log('\n🔧 Recomendaciones:');
      console.log('1. Detener todos los procesos: Get-Process | Where-Object {$_.ProcessName -like "*node*"} | Stop-Process -Force');
      console.log('2. Reiniciar solo una instancia del bot');
      console.log('3. Verificar que no haya scripts de auto-reinicio ejecutándose');
    } else {
      console.log('✅ Solo hay una instancia del bot ejecutándose');
    }
    
    // Verificar puertos en uso
    console.log('\n🔍 Verificando puertos en uso...');
    const { stdout: netstat } = await execAsync('netstat -ano | findstr :3001');
    
    if (netstat) {
      console.log('📡 Puerto 3001 en uso:');
      console.log(netstat);
    } else {
      console.log('✅ Puerto 3001 libre');
    }
    
  } catch (error) {
    console.error('❌ Error verificando instancias:', error.message);
  }
}

checkBotInstances();

