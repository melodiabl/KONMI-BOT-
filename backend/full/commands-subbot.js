import db from './db.js';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import QRCode from 'qrcode';
import chalk from 'chalk';

/**
 * Handle the /serbot command to create a new sub-bot
 * @param {string} usuario - The user who sent the command
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleSerbot(usuario, grupo, fecha) {
  try {
    console.log(`🤖 Comando /serbot recibido de ${usuario}`);
    
    // Verificar si el usuario es admin
    const whatsappNumber = usuario.split('@')[0];
    const user = await db('usuarios').where({ whatsapp_number: whatsappNumber }).select('rol').first();
    
    if (!user || user.rol !== 'admin') {
      return { 
        success: true, 
        message: '❌ *Solo administradores pueden crear sub-bots*' 
      };
    }

    // Generar ID único para el sub-bot
    const subbotId = `subbot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const subbotDir = path.join(process.cwd(), 'jadibots', subbotId);
    
    // Crear directorio del sub-bot
    if (!fs.existsSync(subbotDir)) {
      fs.mkdirSync(subbotDir, { recursive: true });
    }

    // Crear archivo de configuración del sub-bot
    const subbotConfig = {
      id: subbotId,
      created: new Date().toISOString(),
      createdBy: whatsappNumber,
      status: 'pending',
      qrGenerated: false
    };

    fs.writeFileSync(
      path.join(subbotDir, 'subbot.json'), 
      JSON.stringify(subbotConfig, null, 2)
    );

    // Guardar en base de datos
    await db('subbots').insert({
      code: subbotId,
      nombre: `Sub-bot ${subbotId.split('_')[1]}`,
      status: 'pending',
      created_by: whatsappNumber,
      created_at: new Date().toISOString()
    });

    // Crear archivo de configuración del sub-bot
    const subbotConfig = {
      id: subbotId,
      created: new Date().toISOString(),
      createdBy: whatsappNumber,
      status: 'pending',
      qrGenerated: false,
      qrData: null
    };

    fs.writeFileSync(
      path.join(subbotDir, 'subbot.json'), 
      JSON.stringify(subbotConfig, null, 2)
    );

    // Iniciar proceso del sub-bot de forma asíncrona
    setTimeout(async () => {
      try {
        const subbotProcess = spawn('node', [path.join(process.cwd(), 'subbot-template', 'index.js')], {
          cwd: subbotDir,
          env: {
            ...process.env,
            SUBBOT_ID: subbotId,
            SUBBOT_DIR: subbotDir
          }
        });

        subbotProcess.stdout.on('data', (data) => {
          console.log(`Sub-bot ${subbotId}: ${data}`);
        });

        subbotProcess.stderr.on('data', (data) => {
          console.error(`Sub-bot ${subbotId} error: ${data}`);
        });

        subbotProcess.on('close', (code) => {
          console.log(`Sub-bot ${subbotId} process exited with code ${code}`);
        });
      } catch (error) {
        console.error('Error starting sub-bot:', error);
      }
    }, 1000);

    // Log de la acción
    await logControlAction(usuario, 'CREATE_SUBBOT', `Sub-bot creado: ${subbotId}`, grupo);

    return { 
      success: true, 
      message: `╭─❍「 🤖 Melodia Sub-bot ✦ 」
│
├─ ✅ *ID:* \`${subbotId}\`
├─ 📁 *Directorio:* \`${subbotDir}\`
├─ ⏳ *Iniciando proceso...*
├─ 🔗 *El QR se generará en unos segundos*
│
├─ 💫 Melodia ha creado tu sub-bot perfectamente~ ♡
╰─✦` 
    };
  } catch (error) {
    console.error('Error en serbot:', error);
    return { 
      success: false, 
      message: '❌ *Error al crear sub-bot*' 
    };
  }
}

/**
 * Handle the /bots command to list all sub-bots
 * @param {string} usuario - The user who sent the command
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleBots(usuario, grupo, fecha) {
  try {
    console.log(`📋 Comando /bots recibido de ${usuario}`);
    
    const subbots = await db('subbots').select('*').orderBy('created_at', 'desc');
    
    if (subbots.length === 0) {
      return { 
        success: true, 
        message: '🤖 *Lista de Sub-bots*\n\n⚠️ No hay sub-bots creados\n\n💡 Usa `/serbot` para crear uno' 
      };
    }

    let message = '🤖 *Lista de Sub-bots*\n\n';
    
    subbots.forEach((bot, index) => {
      const status = bot.status === 'connected' ? '🟢' : 
                   bot.status === 'pending' ? '🟡' : 
                   bot.status === 'disconnected' ? '🔴' : '⚪';
      
      message += `${index + 1}. ${status} *${bot.nombre}*\n`;
      message += `   📱 ID: \`${bot.code}\`\n`;
      message += `   📅 Creado: ${new Date(bot.created_at).toLocaleDateString()}\n`;
      message += `   👤 Por: ${bot.created_by}\n\n`;
    });

    message += `📊 Total: ${subbots.length} sub-bots`;

    return { 
      success: true, 
      message 
    };
  } catch (error) {
    console.error('Error en bots:', error);
    return { 
      success: false, 
      message: '❌ *Error al obtener lista de sub-bots*' 
    };
  }
}

/**
 * Handle the /delsubbot command to delete a sub-bot
 * @param {string} subbotId - The sub-bot ID to delete
 * @param {string} usuario - The user who sent the command
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleDelSubbot(subbotId, usuario, grupo, fecha) {
  try {
    console.log(`🗑️ Comando /delsubbot recibido de ${usuario} para ${subbotId}`);
    
    // Verificar si el usuario es admin
    const whatsappNumber = usuario.split('@')[0];
    const user = await db('usuarios').where({ whatsapp_number: whatsappNumber }).select('rol').first();
    
    if (!user || user.rol !== 'admin') {
      return { 
        success: true, 
        message: '❌ *Solo administradores pueden eliminar sub-bots*' 
      };
    }

    // Verificar que el sub-bot existe
    const subbot = await db('subbots').where('code', subbotId).first();
    if (!subbot) {
      return { 
        success: true, 
        message: '❌ *Sub-bot no encontrado*' 
      };
    }

    // Eliminar de base de datos
    await db('subbots').where('code', subbotId).del();

    // Eliminar directorio del sub-bot
    const subbotDir = path.join(process.cwd(), 'jadibots', subbotId);
    if (fs.existsSync(subbotDir)) {
      fs.rmSync(subbotDir, { recursive: true, force: true });
    }

    // Log de la acción
    await logControlAction(usuario, 'DELETE_SUBBOT', `Sub-bot eliminado: ${subbotId}`, grupo);

    return { 
      success: true, 
      message: `🗑️ *Sub-bot Eliminado*\n\n✅ ID: \`${subbotId}\`\n📁 Directorio eliminado\n🗃️ Datos de BD eliminados` 
    };
  } catch (error) {
    console.error('Error en delsubbot:', error);
    return { 
      success: false, 
      message: '❌ *Error al eliminar sub-bot*' 
    };
  }
}

/**
 * Handle the /qr command to get QR code for a sub-bot
 * @param {string} subbotId - The sub-bot ID
 * @param {string} usuario - The user who sent the command
 * @param {string} grupo - The group where the command was sent
 * @param {string} fecha - The date/time of the command
 */
async function handleQR(subbotId, usuario, grupo, fecha) {
  try {
    console.log(`📱 Comando /qr recibido de ${usuario} para ${subbotId}`);
    
    // Verificar que el sub-bot existe
    const subbot = await db('subbots').where('code', subbotId).first();
    if (!subbot) {
      return { 
        success: true, 
        message: `❌ *Sub-bot no encontrado*\n\n⚠️ El sub-bot \`${subbotId}\` no existe` 
      };
    }

    // Verificar si el QR está listo
    if (subbot.status !== 'qr_ready' && subbot.status !== 'connected') {
      return { 
        success: true, 
        message: `╭─❍「 📱 Melodia QR ✦ 」
│
├─ ⏳ *QR en preparación...*
├─ 🤖 Sub-bot: \`${subbotId}\`
├─ 📊 Estado: ${subbot.status}
│
├─ 💡 Espera unos segundos y vuelve a intentar
╰─✦` 
      };
    }

    // Buscar el archivo QR
    const subbotDir = path.join(process.cwd(), 'jadibots', subbotId);
    const qrFile = path.join(subbotDir, 'qr.png');
    
    if (!fs.existsSync(qrFile)) {
      return { 
        success: true, 
        message: `╭─❍「 ❌ QR No Disponible ✦ 」
│
├─ ⚠️ El sub-bot \`${subbotId}\` no tiene QR generado
├─ 📊 Estado: ${subbot.status}
│
├─ 💡 Espera unos segundos y vuelve a intentar
╰─✦` 
      };
    }

    // Leer y enviar QR
    const qrBuffer = fs.readFileSync(qrFile);
    
    return { 
      success: true, 
      message: `╭─❍「 📱 Melodia QR ✦ 」
│
├─ 🤖 *Sub-bot:* \`${subbotId}\`
├─ 📊 *Estado:* ${subbot.status}
├─ 📸 *Escanea este código para vincular el sub-bot*
│
├─ 💫 *QR generado por Melodia*
╰─✦`,
      qrImage: qrBuffer
    };
  } catch (error) {
    console.error('Error en qr:', error);
    return { 
      success: false, 
      message: '❌ *Error al obtener QR*' 
    };
  }
}

// Función auxiliar para logging (importar desde commands.js)
async function logControlAction(usuario, action, details, grupo) {
  try {
    await db('control_logs').insert({
      usuario,
      accion: action,
      detalles: details,
      grupo,
      fecha: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error logging control action:', error);
  }
}

export {
  handleSerbot,
  handleBots,
  handleDelSubbot,
  handleQR
};

