// Script para actualizar definitivamente los handlers de lock/unlock
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const targetFile = path.join(__dirname, '..', 'backend', 'full', 'commands-complete.js');

// Leer el archivo actual
let content = fs.readFileSync(targetFile, 'utf8');

// Actualizar handleLock
content = content.replace(
  /return \{ success: true, message: '🔒 Grupo bloqueado\. Solo administradores pueden enviar mensajes\.' \};\s*}\s*catch \(error\)\s*{\s*return \{ success: false, message: ' Error al bloquear el grupo\.' \};\s*}/,
  "return { success: true, message: '🔒 Grupo bloqueado. Solo administradores pueden enviar mensajes.' };\n  } catch (error) {\n    logger.error({ err: error, grupo }, 'handleLock error');\n    const detail = error?.message ? ` Detalle: ${error.message}` : ' Asegúrate de que el bot sea administrador.';\n    return { success: false, message: ` Error al bloquear el grupo.${detail}` };\n  }"
);

// Actualizar handleUnlock
content = content.replace(
  /return \{ success: true, message: '🔓 Grupo desbloqueado\. Todos los participantes pueden enviar mensajes\.' \};\s*}\s*catch \(error\)\s*{\s*return \{ success: false, message: ' Error al desbloquear el grupo\.' \};\s*}/,
  "return { success: true, message: '🔓 Grupo desbloqueado. Todos los participantes pueden enviar mensajes.' };\n  } catch (error) {\n    logger.error({ err: error, grupo }, 'handleUnlock error');\n    const detail = error?.message ? ` Detalle: ${error.message}` : ' Asegúrate de que el bot sea administrador.';\n    return { success: false, message: ` Error al desbloquear el grupo.${detail}` };\n  }"
);

// Guardar cambios
fs.writeFileSync(targetFile, content, 'utf8');
console.log('Handlers de lock/unlock actualizados con logging detallado.');
