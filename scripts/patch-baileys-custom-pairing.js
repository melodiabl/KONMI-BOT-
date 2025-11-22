import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function patchBaileysForCustomPairing() {
  console.log('🔧 Aplicando patch de custom pairing a @whiskeysockets/baileys...\n');

  const socketPath = path.join(
    __dirname,
    '../node_modules/@whiskeysockets/baileys/lib/Socket/socket.js'
  );

  if (!fs.existsSync(socketPath)) {
    console.error('❌ No se encontró socket.js en @whiskeysockets/baileys');
    return false;
  }

  try {
    let content = fs.readFileSync(socketPath, 'utf8');

    // Verificar si ya está patcheado
    if (content.includes('KONMIBOT_CUSTOM_PAIRING_PATCH')) {
      console.log('✅ El patch ya está aplicado');
      return true;
    }

    // Buscar donde se genera el pairing code y agregar custom pairing
    // El pairing code se genera típicamente con generatePairingCode o similar
    // Vamos a buscar la función de configuración de pairing
    
    const patchCode = `
/**
 * KONMIBOT_CUSTOM_PAIRING_PATCH
 * Permite agregar códigos de pairing personalizados
 */
const getCustomPairingCode = () => {
    const customCode = process.env.PAIRING_CODE 
        || process.env.PAIR_CUSTOM_CODE 
        || process.env.CUSTOM_PAIRING_CODE;
    
    if (!customCode) return null;
    
    // Validar formato: 8 caracteres alfanuméricos
    const normalized = String(customCode).trim().toUpperCase();
    const enforceNumeric = String(process.env.PAIR_ENFORCE_NUMERIC || 'false').toLowerCase() === 'true';
    
    if (enforceNumeric) {
        const numeric = normalized.replace(/[^0-9]/g, '');
        return numeric.length === 8 ? numeric : null;
    } else {
        const alphanumeric = normalized.replace(/[^A-Z0-9]/g, '');
        return alphanumeric.length === 8 ? alphanumeric : null;
    }
};
`;

    // Buscar el final de los imports para insertar el código
    const lastImportMatch = content.lastIndexOf('import ');
    const nextSemicolon = content.indexOf(';', lastImportMatch);
    const insertPoint = content.indexOf('\n', nextSemicolon) + 1;

    content = content.slice(0, insertPoint) + patchCode + content.slice(insertPoint);

    // Buscar configureSuccessfulPairing para interceptar el code
    const configMatch = content.indexOf('configureSuccessfulPairing');
    if (configMatch !== -1) {
      console.log('✅ Encontrado configureSuccessfulPairing');
      console.log('📝 Nota: El custom pairing se activará a través de whatsapp.js');
    }

    fs.writeFileSync(socketPath, content, 'utf8');

    console.log('✅ Patch aplicado exitosamente\n');
    console.log('📌 Cambios realizados:');
    console.log('   - Agregada función getCustomPairingCode()');
    console.log('   - Busca variables de ambiente: PAIRING_CODE, PAIR_CUSTOM_CODE, CUSTOM_PAIRING_CODE');
    console.log('   - Soporta códigos de 8 caracteres alfanuméricos');
    console.log('   - Respeta PAIR_ENFORCE_NUMERIC para solo números\n');

    return true;
  } catch (error) {
    console.error('❌ Error al aplicar patch:', error.message);
    return false;
  }
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  patchBaileysForCustomPairing();
}
