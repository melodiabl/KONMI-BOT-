import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const file = path.join(__dirname, '..', 'backend', 'full', 'commands-complete.js');

const src = fs.readFileSync(file, 'utf8');
let updated = src;

updated = updated.replace(
  /return \{ success: true, message: '🔒 Grupo bloqueado\. Solo administradores pueden enviar mensajes\.' \};\s*}\s*catch \(error\)\s*{\s*return \{ success: false, message: ' Error al bloquear el grupo\.' \};\s*}/,
  "return { success: true, message: '🔒 Grupo bloqueado. Solo administradores pueden enviar mensajes.' };\n  } catch (error) {\n    console.error('handleLock error:', error);\n    const detail = error?.message ? ` Detalle: ${error.message}` : ' Asegúrate de que el bot sea administrador.';\n    return { success: false, message: ` Error al bloquear el grupo.${detail}` };\n  }"
);

updated = updated.replace(
  /return \{ success: true, message: '🔓 Grupo desbloqueado\. Todos los participantes pueden enviar mensajes\.' \};\s*}\s*catch \(error\)\s*{\s*return \{ success: false, message: ' Error al desbloquear el grupo\.' \};\s*}/,
  "return { success: true, message: '🔓 Grupo desbloqueado. Todos los participantes pueden enviar mensajes.' };\n  } catch (error) {\n    console.error('handleUnlock error:', error);\n    const detail = error?.message ? ` Detalle: ${error.message}` : ' Asegúrate de que el bot sea administrador.';\n    return { success: false, message: ` Error al desbloquear el grupo.${detail}` };\n  }"
);

if (updated === src) {
  console.log('No se realizaron cambios (patrones no encontrados).');
} else {
  fs.writeFileSync(file, updated, 'utf8');
  console.log('Handlers de lock/unlock actualizados con mensajes detallados.');
}
