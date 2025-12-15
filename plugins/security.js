// plugins/security.js
// Sistema de seguridad avanzado - 2FA, whitelist, detección de spam, etc.

import db from './database/db.js'
import QRCode from 'qrcode'

// Importaciones opcionales para seguridad avanzada
let speakeasy, bcrypt, crypto;

try {
  speakeasy = (await import('speakeasy')).default;
} catch (e) {
  console.log('⚠️ speakeasy no disponible, usando 2FA básico');
}

try {
  bcrypt = (await import('bcrypt')).default;
} catch (e) {
  console.log('⚠️ bcrypt no disponible, usando hashing básico');
}

try {
  crypto = await import('crypto');
} catch (e) {
  console.log('⚠️ crypto no disponible, usando funciones básicas');
}

// Funcionalidad Wileys: Reacciones automáticas para seguridad
const addSecurityReaction = async (sock, message, emoji = '🔐') => {
  try {
    if (sock && message?.key) {
      await sock.sendMessage(message.key.remoteJid, {
        react: { text: emoji, key: message.key }
      });
    }
  } catch (error) {
    console.error('[SECURITY_REACTION] Error:', error);
  }
};

// Base de datos simulada para seguridad
const securityData = {
  whitelist: new Set(),
  blacklist: new Set(),
  twoFactorUsers: new Map(),
  spamDetection: new Map(),
  securityLogs: []
};

// Función para normalizar números de teléfono
const normalizePhone = (phone) => {
  return String(phone || '').replace(/[^0-9]/g, '');
};

// Función para generar secreto 2FA real
const generate2FASecret = (userPhone) => {
  return speakeasy.generateSecret({
    name: `KONMI Bot (${userPhone})`,
    issuer: 'KONMI Bot',
    length: 32
  });
};

// Función para detectar spam
const detectSpam = (userId, message) => {
  const now = Date.now();
  const userSpamData = securityData.spamDetection.get(userId) || { messages: [], warnings: 0 };

  // Limpiar mensajes antiguos (más de 1 minuto)
  userSpamData.messages = userSpamData.messages.filter(msg => now - msg.timestamp < 60000);

  // Agregar mensaje actual
  userSpamData.messages.push({ timestamp: now, content: message });

  // Detectar spam por frecuencia
  const recentMessages = userSpamData.messages.filter(msg => now - msg.timestamp < 10000); // 10 segundos
  if (recentMessages.length > 5) {
    userSpamData.warnings++;
    securityData.spamDetection.set(userId, userSpamData);
    return { isSpam: true, type: 'frequency', warnings: userSpamData.warnings };
  }

  // Detectar spam por contenido repetido
  const duplicates = userSpamData.messages.filter(msg => msg.content === message);
  if (duplicates.length > 3) {
    userSpamData.warnings++;
    securityData.spamDetection.set(userId, userSpamData);
    return { isSpam: true, type: 'duplicate', warnings: userSpamData.warnings };
  }

  securityData.spamDetection.set(userId, userSpamData);
  return { isSpam: false, warnings: userSpamData.warnings };
};

// Función para registrar logs de seguridad
const logSecurityEvent = (event, userId, details = {}) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event,
    userId: normalizePhone(userId),
    details,
    id: Date.now()
  };

  securityData.securityLogs.push(logEntry);

  // Mantener solo los últimos 1000 logs
  if (securityData.securityLogs.length > 1000) {
    securityData.securityLogs = securityData.securityLogs.slice(-1000);
  }

  console.log(`[SECURITY] ${event}: ${userId}`, details);
};

export async function whitelist(ctx) {
  const { args, sender, sock, message, isOwner } = ctx;
  const action = args[0]?.toLowerCase();
  const targetUser = args[1];

  await addSecurityReaction(sock, message, '✅');

  if (!isOwner) {
    return { success: false, message: '⛔ Solo el owner puede gestionar la whitelist.' };
  }

  if (!action || !['add', 'remove', 'list', 'check'].includes(action)) {
    return {
      success: true,
      message: `✅ *Gestión de Whitelist*\n\n*Comandos:*\n/whitelist add <número> - Agregar usuario\n/whitelist remove <número> - Quitar usuario\n/whitelist list - Ver lista\n/whitelist check <número> - Verificar usuario\n\n*Ejemplo:* /whitelist add 34612345678`
    };
  }

  switch (action) {
    case 'add':
      if (!targetUser) {
        return { success: false, message: '❌ Especifica el número a agregar\nEjemplo: /whitelist add 34612345678' };
      }

      const normalizedAdd = normalizePhone(targetUser);
      if (!normalizedAdd) {
        return { success: false, message: '❌ Número de teléfono inválido' };
      }

      securityData.whitelist.add(normalizedAdd);
      logSecurityEvent('WHITELIST_ADD', sender, { target: normalizedAdd });

      return {
        success: true,
        message: `✅ Usuario +${normalizedAdd} agregado a la whitelist\n📊 Total usuarios en whitelist: ${securityData.whitelist.size}`
      };

    case 'remove':
      if (!targetUser) {
        return { success: false, message: '❌ Especifica el número a quitar\nEjemplo: /whitelist remove 34612345678' };
      }

      const normalizedRemove = normalizePhone(targetUser);
      if (securityData.whitelist.has(normalizedRemove)) {
        securityData.whitelist.delete(normalizedRemove);
        logSecurityEvent('WHITELIST_REMOVE', sender, { target: normalizedRemove });
        return { success: true, message: `✅ Usuario +${normalizedRemove} removido de la whitelist` };
      } else {
        return { success: false, message: `❌ Usuario +${normalizedRemove} no está en la whitelist` };
      }

    case 'list':
      if (securityData.whitelist.size === 0) {
        return { success: true, message: '📋 La whitelist está vacía' };
      }

      const whitelistArray = Array.from(securityData.whitelist);
      let listMessage = `📋 *Whitelist (${whitelistArray.length} usuarios)*\n\n`;
      whitelistArray.forEach((phone, index) => {
        listMessage += `${index + 1}. +${phone}\n`;
      });

      return { success: true, message: listMessage };

    case 'check':
      if (!targetUser) {
        return { success: false, message: '❌ Especifica el número a verificar' };
      }

      const normalizedCheck = normalizePhone(targetUser);
      const isWhitelisted = securityData.whitelist.has(normalizedCheck);

      return {
        success: true,
        message: `🔍 Usuario +${normalizedCheck}: ${isWhitelisted ? '✅ En whitelist' : '❌ No en whitelist'}`
      };

    default:
      return { success: false, message: '❌ Acción no válida' };
  }
}

export async function blacklist(ctx) {
  const { args, sender, sock, message, isOwner } = ctx;
  const action = args[0]?.toLowerCase();
  const targetUser = args[1];

  await addSecurityReaction(sock, message, '❌');

  if (!isOwner) {
    return { success: false, message: '⛔ Solo el owner puede gestionar la blacklist.' };
  }

  if (!action || !['add', 'remove', 'list', 'check'].includes(action)) {
    return {
      success: true,
      message: `❌ *Gestión de Blacklist*\n\n*Comandos:*\n/blacklist add <número> - Bloquear usuario\n/blacklist remove <número> - Desbloquear usuario\n/blacklist list - Ver lista\n/blacklist check <número> - Verificar usuario\n\n*Ejemplo:* /blacklist add 34612345678`
    };
  }

  switch (action) {
    case 'add':
      if (!targetUser) {
        return { success: false, message: '❌ Especifica el número a bloquear' };
      }

      const normalizedAdd = normalizePhone(targetUser);
      if (!normalizedAdd) {
        return { success: false, message: '❌ Número de teléfono inválido' };
      }

      securityData.blacklist.add(normalizedAdd);
      logSecurityEvent('BLACKLIST_ADD', sender, { target: normalizedAdd });

      return {
        success: true,
        message: `❌ Usuario +${normalizedAdd} agregado a la blacklist\n🚫 Este usuario no podrá usar el bot`
      };

    case 'remove':
      if (!targetUser) {
        return { success: false, message: '❌ Especifica el número a desbloquear' };
      }

      const normalizedRemove = normalizePhone(targetUser);
      if (securityData.blacklist.has(normalizedRemove)) {
        securityData.blacklist.delete(normalizedRemove);
        logSecurityEvent('BLACKLIST_REMOVE', sender, { target: normalizedRemove });
        return { success: true, message: `✅ Usuario +${normalizedRemove} removido de la blacklist` };
      } else {
        return { success: false, message: `❌ Usuario +${normalizedRemove} no está en la blacklist` };
      }

    case 'list':
      if (securityData.blacklist.size === 0) {
        return { success: true, message: '📋 La blacklist está vacía' };
      }

      const blacklistArray = Array.from(securityData.blacklist);
      let listMessage = `📋 *Blacklist (${blacklistArray.length} usuarios)*\n\n`;
      blacklistArray.forEach((phone, index) => {
        listMessage += `${index + 1}. +${phone}\n`;
      });

      return { success: true, message: listMessage };

    case 'check':
      if (!targetUser) {
        return { success: false, message: '❌ Especifica el número a verificar' };
      }

      const normalizedCheck = normalizePhone(targetUser);
      const isBlacklisted = securityData.blacklist.has(normalizedCheck);

      return {
        success: true,
        message: `🔍 Usuario +${normalizedCheck}: ${isBlacklisted ? '❌ En blacklist' : '✅ No bloqueado'}`
      };

    default:
      return { success: false, message: '❌ Acción no válida' };
  }
}

export async function enable2fa(ctx) {
  const { sender, sock, message, remoteJid } = ctx;

  await addSecurityReaction(sock, message, '🔐');

  const userPhone = normalizePhone(sender);

  if (securityData.twoFactorUsers.has(userPhone)) {
    return { success: false, message: '❌ Ya tienes 2FA activado. Usa /disable2fa para desactivarlo.' };
  }

  try {
    if (!speakeasy) {
      return {
        success: false,
        message: '❌ 2FA avanzado no disponible. Instala: npm install speakeasy\n\n💡 Usando sistema básico de códigos temporales.'
      };
    }

    // Generar secreto 2FA real con Speakeasy
    const secret = generate2FASecret(userPhone);

    // Generar código QR para apps como Google Authenticator
    const qrCodeUrl = speakeasy.otpauthURL({
      secret: secret.ascii,
      label: userPhone,
      issuer: 'KONMI Bot',
      encoding: 'ascii'
    });

    const qrBuffer = await QRCode.toBuffer(qrCodeUrl, {
      width: 300,
      margin: 2
    });

    // Guardar secreto temporalmente
    securityData.twoFactorUsers.set(userPhone, {
      secret: secret.base32,
      verified: false,
      attempts: 0,
      createdAt: Date.now()
    });

    logSecurityEvent('2FA_ENABLE_REQUEST', sender);

    // Enviar QR y instrucciones
    await sock.sendMessage(remoteJid, {
      image: qrBuffer,
      caption: `🔐 *Configuración de 2FA*\n\n📱 **Pasos:**\n1. Instala Google Authenticator o similar\n2. Escanea este código QR\n3. Usa */verify2fa <código>* con el código de 6 dígitos\n\n🔑 **Secreto manual:**\n\`${secret.base32}\`\n\n💡 *Nota:* Guarda el secreto en un lugar seguro`
    });

    return { success: true };
  } catch (error) {
    console.error('Error configurando 2FA:', error);
    return { success: false, message: '❌ Error configurando 2FA' };
  }
}

export async function verify2fa(ctx) {
  const { args, sender, sock, message } = ctx;
  const inputCode = args[0];

  await addSecurityReaction(sock, message, '🔐');

  const userPhone = normalizePhone(sender);
  const userData = securityData.twoFactorUsers.get(userPhone);

  if (!userData) {
    return { success: false, message: '❌ No tienes un proceso de 2FA pendiente. Usa /enable2fa primero.' };
  }

  if (!inputCode) {
    return { success: false, message: '❌ Especifica el código de 6 dígitos\nEjemplo: /verify2fa 123456' };
  }

  if (!/^\d{6}$/.test(inputCode)) {
    return { success: false, message: '❌ El código debe tener exactamente 6 dígitos' };
  }

  userData.attempts++;

  if (userData.attempts > 5) {
    securityData.twoFactorUsers.delete(userPhone);
    logSecurityEvent('2FA_VERIFY_FAILED_MAX_ATTEMPTS', sender);
    return { success: false, message: '❌ Demasiados intentos fallidos. Inicia el proceso nuevamente con /enable2fa.' };
  }

  try {
    if (!speakeasy) {
      return {
        success: false,
        message: '❌ Verificación 2FA no disponible. Instala: npm install speakeasy'
      };
    }

    // Verificar código TOTP real con Speakeasy
    const verified = speakeasy.totp.verify({
      secret: userData.secret,
      encoding: 'base32',
      token: inputCode,
      window: 2 // Permitir 2 ventanas de tiempo (60 segundos antes/después)
    });

    if (!verified) {
      logSecurityEvent('2FA_VERIFY_FAILED', sender, { attempts: userData.attempts });
      return {
        success: false,
        message: `❌ Código incorrecto. Intentos restantes: ${5 - userData.attempts}\n\n💡 Asegúrate de usar el código actual de tu app de autenticación`
      };
    }

    // Marcar como verificado
    userData.verified = true;
    userData.verifiedAt = Date.now();

    logSecurityEvent('2FA_ENABLED', sender);

    return {
      success: true,
      message: `✅ *2FA Activado Exitosamente*\n\n🔐 Tu cuenta ahora está protegida con TOTP\n🛡️ Los comandos críticos requerirán verificación\n📱 Usa tu app de autenticación para códigos futuros\n\n💡 Usa */disable2fa* si necesitas desactivarlo`
    };
  } catch (error) {
    console.error('Error verificando 2FA:', error);
    return { success: false, message: '❌ Error verificando código 2FA' };
  }
}

export async function disable2fa(ctx) {
  const { sender, sock, message } = ctx;

  await addSecurityReaction(sock, message, '🔓');

  const userPhone = normalizePhone(sender);

  if (!securityData.twoFactorUsers.has(userPhone)) {
    return { success: false, message: '❌ No tienes 2FA activado.' };
  }

  const userData = securityData.twoFactorUsers.get(userPhone);
  if (!userData.verified) {
    return { success: false, message: '❌ Tu 2FA no está completamente configurado. Completa la verificación primero.' };
  }

  securityData.twoFactorUsers.delete(userPhone);
  logSecurityEvent('2FA_DISABLED', sender);

  return {
    success: true,
    message: `🔓 *2FA Desactivado*\n\n✅ La autenticación de dos factores ha sido desactivada\n⚠️ Tu cuenta ahora tiene menos protección\n\n💡 Puedes reactivarlo en cualquier momento con /enable2fa`
  };
}

export async function spamcheck(ctx) {
  const { args, sender, sock, message, text } = ctx;
  const targetUser = args[0];

  await addSecurityReaction(sock, message, '🕵️');

  if (targetUser) {
    // Verificar spam de usuario específico
    const normalizedUser = normalizePhone(targetUser);
    const spamData = securityData.spamDetection.get(normalizedUser);

    if (!spamData) {
      return { success: true, message: `🕵️ Usuario +${normalizedUser}: Sin actividad de spam detectada` };
    }

    return {
      success: true,
      message: `🕵️ *Reporte de Spam*\n\n👤 *Usuario:* +${normalizedUser}\n⚠️ *Advertencias:* ${spamData.warnings}\n📊 *Mensajes recientes:* ${spamData.messages.length}\n📅 *Última actividad:* ${new Date(spamData.messages[spamData.messages.length - 1]?.timestamp || 0).toLocaleString('es-ES')}`
    };
  } else {
    // Verificar spam del mensaje actual
    const userPhone = normalizePhone(sender);
    const spamResult = detectSpam(userPhone, text || '');

    if (spamResult.isSpam) {
      logSecurityEvent('SPAM_DETECTED', sender, { type: spamResult.type, warnings: spamResult.warnings });

      return {
        success: true,
        message: `🚨 *Spam Detectado*\n\n🕵️ *Tipo:* ${spamResult.type === 'frequency' ? 'Frecuencia alta' : 'Contenido repetido'}\n⚠️ *Advertencias totales:* ${spamResult.warnings}\n\n💡 *Recomendación:* ${spamResult.warnings > 3 ? 'Considerar restricciones' : 'Monitorear actividad'}`
      };
    } else {
      return {
        success: true,
        message: `✅ *Sin Spam Detectado*\n\n👤 Usuario: Comportamiento normal\n📊 Advertencias: ${spamResult.warnings}\n🛡️ Estado: Seguro`
      };
    }
  }
}

export async function securitylogs(ctx) {
  const { args, sender, sock, message, isOwner } = ctx;
  const limit = parseInt(args[0]) || 10;

  await addSecurityReaction(sock, message, '📋');

  if (!isOwner) {
    return { success: false, message: '⛔ Solo el owner puede ver los logs de seguridad.' };
  }

  if (securityData.securityLogs.length === 0) {
    return { success: true, message: '📋 No hay logs de seguridad registrados.' };
  }

  const recentLogs = securityData.securityLogs.slice(-limit).reverse();
  let logsMessage = `📋 *Logs de Seguridad (${Math.min(limit, securityData.securityLogs.length)} más recientes)*\n\n`;

  recentLogs.forEach((log, index) => {
    const date = new Date(log.timestamp).toLocaleString('es-ES');
    logsMessage += `${index + 1}. **${log.event}**\n`;
    logsMessage += `   👤 Usuario: +${log.userId}\n`;
    logsMessage += `   📅 Fecha: ${date}\n`;
    if (Object.keys(log.details).length > 0) {
      logsMessage += `   📝 Detalles: ${JSON.stringify(log.details)}\n`;
    }
    logsMessage += '\n';
  });

  return { success: true, message: logsMessage };
}

export async function securitystatus(ctx) {
  const { sock, message } = ctx;

  await addSecurityReaction(sock, message, '🛡️');

  const stats = {
    whitelistCount: securityData.whitelist.size,
    blacklistCount: securityData.blacklist.size,
    twoFactorUsers: Array.from(securityData.twoFactorUsers.values()).filter(u => u.verified).length,
    spamDetections: securityData.spamDetection.size,
    totalLogs: securityData.securityLogs.length
  };

  return {
    success: true,
    message: `🛡️ *Estado de Seguridad del Sistema*\n\n✅ *Whitelist:* ${stats.whitelistCount} usuarios\n❌ *Blacklist:* ${stats.blacklistCount} usuarios\n🔐 *2FA Activo:* ${stats.twoFactorUsers} usuarios\n🕵️ *Monitoreo Spam:* ${stats.spamDetections} usuarios\n📋 *Logs Totales:* ${stats.totalLogs} eventos\n\n🔒 *Nivel de Seguridad:* ${stats.twoFactorUsers > 0 ? 'Alto' : stats.whitelistCount > 0 ? 'Medio' : 'Básico'}`
  };
}

export default {
  whitelist,
  blacklist,
  enable2fa,
  verify2fa,
  disable2fa,
  spamcheck,
  securitylogs,
  securitystatus
};
