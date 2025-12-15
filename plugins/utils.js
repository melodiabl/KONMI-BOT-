// commands/utils.js
// Utilidades varias + Funcionalidades Wileys
import fetch from './utils/fetch.js'
import QRCode from 'qrcode'
// Importaciones opcionales - fallarán graciosamente si no están instaladas
let validator, moment, generatePassword, color;

try {
  validator = (await import('validator')).default;
} catch (e) {
  console.log('⚠️ validator no disponible, usando validación básica');
}

try {
  moment = (await import('moment-timezone')).default;
} catch (e) {
  console.log('⚠️ moment-timezone no disponible, usando Date nativo');
}

try {
  const genPwd = await import('generate-password');
  generatePassword = genPwd.generate;
} catch (e) {
  console.log('⚠️ generate-password no disponible, usando generador básico');
}

try {
  color = (await import('color')).default;
} catch (e) {
  console.log('⚠️ color no disponible, usando análisis básico');
}

// Funcionalidad Wileys: Reacciones automáticas para utilidades
const addUtilsReaction = async (sock, message, emoji = '🔧') => {
  try {
    if (sock && message?.key) {
      await sock.sendMessage(message.key.remoteJid, {
        react: { text: emoji, key: message.key }
      });
    }
  } catch (error) {
    console.error('[UTILS_REACTION] Error:', error);
  }
};

export async function shortUrl(raw, usuario) {
  try {
    const url = String(raw || '').trim()
    if (!url) {
      return { success: true, message: 'ℹ️ Uso: /short [URL]\nEjemplo: /short https://www.google.com', quoted: true }
    }
    const res = await fetch(`https://api.vreden.my.id/api/shorturl?url=${encodeURIComponent(url)}`)
    const data = await res.json().catch(()=>null)
    if (data?.status && data?.data?.shortUrl) {
      const short = data.data.shortUrl
      const saving = url.length > 0 ? Math.max(0, ((url.length - short.length) / url.length) * 100).toFixed(1) : '0.0'
      return {
        success: true,
        message: `🔗 URL acortada\n\n🔍 Original:\n${url}\n\n✂️ Acortada:\n${short}\n\n📉 Ahorro: ${saving}%\n\n🙋 ${usuario}\n📅 ${new Date().toLocaleString('es-ES')}`,
        quoted: true,
      }
    }
    return { success: true, message: `⚠️ No se pudo acortar la URL: "${url}"\n\nℹ️ Verifica que sea válida (http/https).`, quoted: true }
  } catch (e) {
    return { success: false, message: '⚠️ Error acortando URL. Intenta más tarde.', quoted: true }
  }
}


export async function tts(ctx) {
  const { args, sock, message } = ctx;
  const text = (args || []).join(' ').trim();

  if (!text) return { success: true, message: 'ℹ️ Uso: /tts [texto]\nEjemplo: /tts Hola mundo', quoted: true };

  // Funcionalidad Wileys: Reacción automática
  await addUtilsReaction(sock, message, '🔊');

  try {
    const url = `https://api.vreden.my.id/api/tts?text=${encodeURIComponent(text)}&lang=es`;
    // No validamos JSON; devolvemos audio por URL directa
    return { success: true, type: 'audio', audio: { url }, caption: `🔊 TTS: ${text}`, quoted: true };
  } catch {
    return { success: false, message: '⚠️ Error generando TTS.', quoted: true };
  }
}

// Alias esperado por el registry: utils.short(ctx)
export async function short(ctx = {}) {
  try {
    const { sock, message } = ctx;
    const usuario = ctx.sender || ctx.usuario || ''
    const raw = (ctx.args && ctx.args.length)
      ? ctx.args[0]
      : String(ctx.text || '').trim().split(/\s+/).slice(1).join(' ')

    // Funcionalidad Wileys: Reacción automática
    if (raw) await addUtilsReaction(sock, message, '🔗');

    return await shortUrl(raw, usuario)
  } catch {
    return { success: false, message: '⚠️ Error acortando URL.', quoted: true }
  }
}

// =========================
// FUNCIONALIDADES ADICIONALES
// =========================
export async function qrcode(ctx) {
  const { args, sock, message } = ctx;
  const text = args.join(' ').trim();

  if (!text) {
    return { text: '❌ Uso: /qrcode <texto>\nEjemplo: /qrcode https://google.com' };
  }

  // Funcionalidad Wileys: Reacción automática
  await addUtilsReaction(sock, message, '📱');

  try {
    // Generar QR real usando la librería qrcode
    const qrBuffer = await QRCode.toBuffer(text, {
      type: 'png',
      width: 500,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    return {
      success: true,
      type: 'image',
      image: qrBuffer,
      caption: `📱 *Código QR generado*\n\n📝 Texto: ${text}\n🔍 Tamaño: 500x500px`
    };
  } catch (error) {
    console.error('Error generando QR:', error);
    return { success: false, message: '❌ Error generando código QR' };
  }
}

export async function calc(ctx) {
  const { args, sock, message } = ctx;
  const expression = args.join(' ').trim();

  if (!expression) {
    return { text: '❌ Uso: /calc <expresión>\nEjemplo: /calc 2 + 2 * 3' };
  }

  // Funcionalidad Wileys: Reacción automática
  await addUtilsReaction(sock, message, '🧮');

  try {
    // Sanitizar la expresión para seguridad
    const sanitized = expression.replace(/[^0-9+\-*/.() ]/g, '');
    const result = eval(sanitized);

    return {
      text: `🧮 *Calculadora*\n\n📝 Expresión: ${expression}\n🔢 Resultado: ${result}`
    };
  } catch (error) {
    return { text: '❌ Expresión matemática inválida' };
  }
}

// =========================
// NUEVAS FUNCIONALIDADES WILEYS - UTILIDADES AVANZADAS
// =========================

export async function password(ctx) {
  const { args, sock, message } = ctx;
  const length = parseInt(args[0]) || 12;

  if (length < 4 || length > 50) {
    return { text: '❌ Longitud debe ser entre 4 y 50 caracteres\nEjemplo: /password 16' };
  }

  await addUtilsReaction(sock, message, '🔐');

  try {
    let password;

    if (generatePassword) {
      // Usar librería si está disponible
      password = generatePassword({
        length: length,
        numbers: true,
        symbols: true,
        lowercase: true,
        uppercase: true,
        excludeSimilarCharacters: true,
        exclude: '"\'`\\',
        strict: true
      });
    } else {
      // Generador básico si la librería no está disponible
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
      password = '';
      for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }

    // Calcular fuerza de la contraseña
    let strength = 'Débil';
    if (length >= 12 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) {
      strength = 'Muy Fuerte';
    } else if (length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password)) {
      strength = 'Fuerte';
    } else if (length >= 6) {
      strength = 'Media';
    }

    return {
      success: true,
      message: `🔐 *Generador de Contraseñas*\n\n🔑 Contraseña: \`${password}\`\n📏 Longitud: ${length} caracteres\n💪 Fuerza: ${strength}\n🛡️ Incluye: Mayúsculas, minúsculas, números y símbolos\n\n⚠️ *Importante:* Guarda esta contraseña en un lugar seguro`
    };
  } catch (error) {
    console.error('Error generando contraseña:', error);
    return { success: false, message: '❌ Error generando contraseña segura' };
  }
}

export async function convert(ctx) {
  const { args, sock, message } = ctx;

  if (args.length < 3) {
    return {
      text: `🔄 *Convertidor de Unidades*\n\n*Uso:* /convert <cantidad> <de> <a>\n\n*Ejemplos:*\n/convert 100 cm m\n/convert 32 f c\n/convert 1 kg lb\n\n*Unidades soportadas:*\n📏 Longitud: mm, cm, m, km, in, ft, yd\n🌡️ Temperatura: c, f, k\n⚖️ Peso: g, kg, lb, oz`
    };
  }

  await addUtilsReaction(sock, message, '🔄');

  const amount = parseFloat(args[0]);
  const from = args[1].toLowerCase();
  const to = args[2].toLowerCase();

  if (isNaN(amount)) {
    return { text: '❌ La cantidad debe ser un número válido' };
  }

  try {
    let result;
    let category;

    // Conversiones de longitud
    const lengthUnits = {
      mm: 0.001, cm: 0.01, m: 1, km: 1000,
      in: 0.0254, ft: 0.3048, yd: 0.9144
    };

    // Conversiones de peso
    const weightUnits = {
      g: 1, kg: 1000, lb: 453.592, oz: 28.3495
    };

    if (lengthUnits[from] && lengthUnits[to]) {
      result = (amount * lengthUnits[from]) / lengthUnits[to];
      category = '📏 Longitud';
    } else if (weightUnits[from] && weightUnits[to]) {
      result = (amount * weightUnits[from]) / weightUnits[to];
      category = '⚖️ Peso';
    } else if ((from === 'c' || from === 'f' || from === 'k') && (to === 'c' || to === 'f' || to === 'k')) {
      // Conversiones de temperatura
      let celsius = amount;
      if (from === 'f') celsius = (amount - 32) * 5/9;
      if (from === 'k') celsius = amount - 273.15;

      if (to === 'f') result = celsius * 9/5 + 32;
      else if (to === 'k') result = celsius + 273.15;
      else result = celsius;

      category = '🌡️ Temperatura';
    } else {
      return { text: '❌ Unidades no soportadas o incompatibles' };
    }

    return {
      text: `🔄 *${category}*\n\n📊 ${amount} ${from.toUpperCase()} = ${result.toFixed(4)} ${to.toUpperCase()}`
    };
  } catch (error) {
    return { text: '❌ Error en la conversión' };
  }
}

export async function email(ctx) {
  const { args, sock, message } = ctx;
  const emailToValidate = args[0];

  if (!emailToValidate) {
    return { text: '❌ Uso: /email <dirección>\nEjemplo: /email usuario@ejemplo.com' };
  }

  await addUtilsReaction(sock, message, '📧');

  try {
    // Usar validator.js para validación real
    const isValid = validator.isEmail(emailToValidate);
    const parts = emailToValidate.split('@');
    const domain = parts[1] || '';
    const username = parts[0] || '';

    // Validaciones adicionales
    const isDomainValid = domain ? validator.isFQDN(domain) : false;
    const isDisposable = ['10minutemail.com', 'tempmail.org', 'guerrillamail.com'].includes(domain.toLowerCase());

    let domainInfo = '';
    if (isDomainValid) {
      domainInfo = '✅ Dominio válido';
      if (isDisposable) {
        domainInfo += ' (⚠️ Email temporal)';
      }
    } else {
      domainInfo = '❌ Dominio inválido';
    }

    return {
      success: true,
      message: `📧 *Validador de Email*\n\n📮 Email: ${emailToValidate}\n${isValid ? '✅' : '❌'} Estado: ${isValid ? 'Válido' : 'Inválido'}\n👤 Usuario: ${username}\n🌐 Dominio: ${domain}\n🔍 ${domainInfo}\n📊 Longitud: ${emailToValidate.length} caracteres`
    };
  } catch (error) {
    console.error('Error validando email:', error);
    return { success: false, message: '❌ Error validando email' };
  }
}

export async function color(ctx) {
  const { args, sock, message } = ctx;
  const colorInput = args[0];

  if (!colorInput) {
    return {
      text: `🎨 *Códigos de Colores*\n\n*Uso:* /color <código>\n\n*Ejemplos:*\n/color #FF0000\n/color red\n/color rgb(255,0,0)\n\n*Formatos soportados:*\n• HEX: #FF0000\n• RGB: rgb(255,0,0)\n• HSL: hsl(0,100%,50%)\n• Nombres: red, blue, green, etc.`
    };
  }

  await addUtilsReaction(sock, message, '🎨');

  try {
    // Usar librería color real para análisis completo
    let colorObj;

    try {
      colorObj = color(colorInput);
    } catch (error) {
      return { success: false, message: '❌ Código de color inválido' };
    }

    const hex = colorObj.hex();
    const rgb = colorObj.rgb();
    const hsl = colorObj.hsl();
    const hsv = colorObj.hsv();
    const cmyk = colorObj.cmyk();

    // Calcular luminancia y contraste
    const luminance = colorObj.luminosity();
    const isDark = luminance < 0.5;
    const contrastColor = isDark ? '#FFFFFF' : '#000000';

    // Generar paleta de colores relacionados
    const complementary = colorObj.rotate(180).hex();
    const triadic1 = colorObj.rotate(120).hex();
    const triadic2 = colorObj.rotate(240).hex();

    return {
      success: true,
      message: `🎨 *Análisis Completo del Color*\n\n🔸 **Formatos:**\n• HEX: ${hex}\n• RGB: rgb(${Math.round(rgb.red())}, ${Math.round(rgb.green())}, ${Math.round(rgb.blue())})\n• HSL: hsl(${Math.round(hsl.hue())}, ${Math.round(hsl.saturationl())}%, ${Math.round(hsl.lightness())}%)\n• HSV: hsv(${Math.round(hsv.hue())}, ${Math.round(hsv.saturationv())}%, ${Math.round(hsv.value())}%)\n• CMYK: cmyk(${Math.round(cmyk.cyan())}%, ${Math.round(cmyk.magenta())}%, ${Math.round(cmyk.yellow())}%, ${Math.round(cmyk.black())}%)\n\n🔸 **Propiedades:**\n• Luminancia: ${(luminance * 100).toFixed(1)}%\n• Tipo: ${isDark ? 'Oscuro' : 'Claro'}\n• Contraste ideal: ${contrastColor}\n\n🔸 **Paleta Relacionada:**\n• Complementario: ${complementary}\n• Triádico 1: ${triadic1}\n• Triádico 2: ${triadic2}`
    };
  } catch (error) {
    console.error('Error analizando color:', error);
    return { success: false, message: '❌ Error analizando color' };
  }
}

export async function timezone(ctx) {
  const { args, sock, message } = ctx;

  if (args.length === 0) {
    return {
      text: `🌍 *Conversor de Zonas Horarias*\n\n*Uso:* /timezone <zona>\n\n*Ejemplos:*\n/timezone UTC\n/timezone America/New_York\n/timezone Europe/Madrid\n/timezone Asia/Tokyo\n\n*Zonas populares:*\n• UTC, GMT\n• America/New_York (EST)\n• Europe/London (GMT)\n• Asia/Tokyo (JST)\n• America/Los_Angeles (PST)`
    };
  }

  await addUtilsReaction(sock, message, '🌍');

  const timezone = args.join('/').replace(/_/g, '/');

  try {
    // Usar moment-timezone para conversiones reales
    const now = moment();
    const localTime = now.format('YYYY-MM-DD HH:mm:ss');
    const localTz = moment.tz.guess();

    // Verificar si la zona horaria existe
    if (!moment.tz.zone(timezone) && !['UTC', 'GMT'].includes(timezone.toUpperCase())) {
      // Buscar zonas similares
      const allZones = moment.tz.names();
      const similar = allZones.filter(zone =>
        zone.toLowerCase().includes(timezone.toLowerCase()) ||
        timezone.toLowerCase().includes(zone.toLowerCase())
      ).slice(0, 5);

      let message = `❌ Zona horaria "${timezone}" no encontrada`;
      if (similar.length > 0) {
        message += `\n\n🔍 *Zonas similares:*\n${similar.map(z => `• ${z}`).join('\n')}`;
      }
      return { success: false, message };
    }

    const targetTime = moment.tz(timezone === 'UTC' || timezone === 'GMT' ? 'UTC' : timezone);
    const offset = targetTime.utcOffset() / 60;
    const offsetStr = offset >= 0 ? `+${offset}` : `${offset}`;

    // Información adicional
    const isDST = targetTime.isDST();
    const zoneName = targetTime.format('z');

    return {
      success: true,
      message: `🌍 *Conversor de Zonas Horarias*\n\n🕐 **Hora local (${localTz}):**\n${localTime}\n\n🌐 **${timezone}:**\n${targetTime.format('YYYY-MM-DD HH:mm:ss')}\n\n📊 **Información:**\n• Diferencia UTC: ${offsetStr} horas\n• Zona: ${zoneName}\n• Horario de verano: ${isDST ? 'Sí' : 'No'}\n• Diferencia con local: ${targetTime.diff(now, 'hours')} horas`
    };
  } catch (error) {
    console.error('Error convirtiendo zona horaria:', error);
    return { success: false, message: '❌ Error al convertir zona horaria' };
  }
}

// Mantener también en el export por defecto si algún import usa default
export default { shortUrl, short, tts, qrcode, calc, password, convert, email, color, timezone }
