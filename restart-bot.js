// Script para reiniciar el bot de forma limpia
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

async function restartBot() {
  try {
    console.log('🔄 Reiniciando bot de forma limpia...');
    
    // 1. Detener todos los procesos node
    console.log('⏹️ Deteniendo procesos existentes...');
    try {
      await execAsync('Get-Process | Where-Object {$_.ProcessName -like "*node*"} | Stop-Process -Force');
      console.log('✅ Procesos detenidos');
    } catch (error) {
      console.log('ℹ️ No había procesos para detener');
    }
    
    // 2. Esperar un momento para que se liberen los puertos
    console.log('⏳ Esperando liberación de puertos...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 3. Verificar que el puerto esté libre
    try {
      const { stdout } = await execAsync('netstat -ano | findstr :3001');
      if (stdout) {
        console.log('⚠️ Puerto 3001 aún en uso, forzando liberación...');
        await execAsync('taskkill /F /PID $(netstat -ano | findstr :3001 | awk "{print $5}")');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.log('✅ Puerto 3001 libre');
    }
    
    // 4. Limpiar archivos temporales si existen
    const tempFiles = [
      './backend/full/logs/*.log',
      './backend/full/storage/baileys_full/*.json'
    ];
    
    console.log('🧹 Limpiando archivos temporales...');
    for (const pattern of tempFiles) {
      try {
        await execAsync(`Remove-Item -Path "${pattern}" -Force -Recurse -ErrorAction SilentlyContinue`);
      } catch (error) {
        // Ignorar errores si no existen archivos
      }
    }
    
    // 5. Reiniciar el bot
    console.log('🚀 Iniciando bot...');
    const botProcess = exec('npm start', {
      cwd: process.cwd(),
      stdio: 'inherit'
    });
    
    botProcess.stdout?.on('data', (data) => {
      console.log(data.toString());
    });
    
    botProcess.stderr?.on('data', (data) => {
      console.error(data.toString());
    });
    
    console.log('✅ Bot reiniciado correctamente');
    console.log('📱 Puedes probar comandos como: /help, /debug, /estado');
    
  } catch (error) {
    console.error('❌ Error reiniciando bot:', error.message);
  }
}

restartBot();


