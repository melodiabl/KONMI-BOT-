import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const file = path.join(__dirname, '..', 'backend', 'full', 'commands-complete.js');

let src = fs.readFileSync(file, 'utf8');

const lockPattern = /return \{ success: true, message: '🔒 Grupo bloqueado\. Solo administradores pueden enviar mensajes\.' \};\s*}\s*catch \(error\)\s*{\s*return \{ success: false, message: `? Error al bloquear el grupo\.?(?:\${detail})?`? \};\s*}/;
const lockReplacement = "return { success: true, message: '🔒 Grupo bloqueado. Solo administradores pueden enviar mensajes.' };\n  } catch (error) {\n    logger.error({ err: error }, 'handleLock error');\n    const detail = error?.message ? ` Detalle: ${error.message}` : ' Asegúrate de que el bot sea administrador.';\n    return { success: false, message: ` Error al bloquear el grupo.${detail}` };\n  }";

const unlockPattern = /return \{ success: true, message: '🔓 Grupo desbloqueado\. Todos los participantes pueden enviar mensajes\.' \};\s*}\s*catch \(error\)\s*{\s*return \{ success: false, message: `? Error al desbloquear el grupo\.?(?:\${detail})?`? \};\s*}/;
const unlockReplacement = "return { success: true, message: '🔓 Grupo desbloqueado. Todos los participantes pueden enviar mensajes.' };\n  } catch (error) {\n    logger.error({ err: error }, 'handleUnlock error');\n    const detail = error?.message ? ` Detalle: ${error.message}` : ' Asegúrate de que el bot sea administrador.';\n    return { success: false, message: ` Error al desbloquear el grupo.${detail}` };\n  }";

let changed = false;
if (lockPattern.test(src)) {
  src = src.replace(lockPattern, lockReplacement);
  changed = true;
}
if (unlockPattern.test(src)) {
  src = src.replace(unlockPattern, unlockReplacement);
  changed = true;
}

if (changed) {
  fs.writeFileSync(file, src, 'utf8');
  console.log('Lock/unlock handlers actualizados con logger.');
} else {
  console.log('No se encontraron patrones para actualizar.');
}
