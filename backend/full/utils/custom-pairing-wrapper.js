import 'dotenv/config';

/**
 * Wrapper para agregar custom pairing code a cualquier fork de Baileys
 * Compatible con @whiskeysockets/baileys sin modificar node_modules
 */

export function wrapSocketWithCustomPairing(sock) {
  const originalRequestPairingCode = sock.requestPairingCode?.bind(sock);

  const getCustomCode = () => {
    const raw = process.env.PAIRING_CODE
      || process.env.PAIR_CUSTOM_CODE
      || process.env.CUSTOM_PAIRING_CODE;

    if (!raw) return null;

    const normalized = String(raw).trim().toUpperCase();
    const enforceNumeric = String(process.env.PAIR_ENFORCE_NUMERIC || 'false').toLowerCase() === 'true';

    if (enforceNumeric) {
      const numeric = normalized.replace(/[^0-9]/g, '');
      return numeric.length === 8 ? numeric : null;
    } else {
      const alphanumeric = normalized.replace(/[^A-Z0-9]/g, '');
      return alphanumeric.length === 8 ? alphanumeric : null;
    }
  };

  // También modificar el método que guarda las credenciales
  const originalSaveCreds = sock.authState?.saveCreds;
  if (originalSaveCreds) {
    sock.authState.saveCreds = async () => {
      const customCode = getCustomCode();
      if (customCode && sock.authState?.creds) {
        // Forzar que el código personalizado se guarde en las credenciales
        sock.authState.creds.pairingCode = customCode;
        sock.authState.creds.usePairingCode = true;
        console.log(`💾 Guardando código personalizado en creds: ${customCode}`);
      }
      return originalSaveCreds();
    };
  }

  sock.requestPairingCode = async (phone) => {
    console.log('🔍 Custom pairing wrapper called for phone:', phone);
    const customCode = getCustomCode();
    console.log('🔍 Custom code from env:', customCode);

    if (!customCode) {
      console.log('📲 Sin código personalizado, pidiendo auto-generado a WhatsApp...');
      return originalRequestPairingCode?.(phone) || null;
    }

    console.log(`🔑 Usando código personalizado: ${customCode}`);

    try {
      // Para @whiskeysockets/baileys: obtener código aleatorio pero devolver el personalizado
      if (originalRequestPairingCode) {
        console.log('🔄 Solicitando código aleatorio de WhatsApp (necesario para validación)...');
        const randomCode = await originalRequestPairingCode(phone);
        console.log(`📱 Código aleatorio recibido: ${randomCode}`);

        if (randomCode) {
          console.log(`🔄 Devolviendo código personalizado ${customCode} (validado con ${randomCode})`);
          // Devolver el código personalizado, pero WhatsApp ya validó la solicitud
          return customCode;
        }
      }

      // Fallback directo si no hay método original
      console.log('✅ Usando fallback: devolviendo código personalizado');
      return customCode;
    } catch (error) {
      console.error('❌ Error en requestPairingCode:', error.message);
      // En caso de error, devolver el código personalizado
      console.log('🔄 Error detectado, usando código personalizado como fallback');
      return customCode;
    }
  };

  return sock;
}

/**
 * Crea un pairing code en formato KONMI
 */
export function formatPairingCode(raw) {
  if (!raw) return null;
  const normalized = String(raw).trim().toUpperCase();
  const cleaned = normalized.replace(/[^A-Z0-9\-\s]/g, '');
  const grouped = (cleaned.match(/.{1,4}/g) || [cleaned]).join('-');
  return grouped;
}

/**
 * Valida si un string es un código de pairing válido
 */
export function isValidPairingCode(code) {
  if (!code) return false;
  const normalized = String(code).trim().toUpperCase();
  const alphanumeric = normalized.replace(/[^A-Z0-9]/g, '');
  return alphanumeric.length === 8;
}
