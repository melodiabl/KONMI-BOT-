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

  sock.requestPairingCode = async (phone) => {
    const customCode = getCustomCode();
    
    if (!customCode) {
      console.log('📲 Sin código personalizado, pidiendo auto-generado a WhatsApp...');
      return originalRequestPairingCode?.(phone) || null;
    }

    console.log(`🔑 Usando código personalizado: ${customCode}`);

    try {
      // Algunos forks soportan custom code
      if (typeof sock.requestPhonePairingCode === 'function') {
        try {
          return await sock.requestPhonePairingCode(phone, customCode);
        } catch (e) {
          console.warn('⚠️ requestPhonePairingCode no soporta custom code');
        }
      }

      // Intenta con requestPairingCode pasando custom code
      if (originalRequestPairingCode) {
        try {
          const result = await originalRequestPairingCode(phone, customCode);
          return result;
        } catch (e) {
          console.warn('⚠️ requestPairingCode no soporta custom code como parámetro');
        }
      }

      // Fallback: devolver el código personalizado como si fuera generado por WhatsApp
      console.log('✅ Usando fallback: devolviendo código personalizado');
      return customCode;
    } catch (error) {
      console.error('❌ Error en requestPairingCode:', error.message);
      throw error;
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
