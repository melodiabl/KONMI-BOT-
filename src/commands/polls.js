// commands/polls.js
// Comando para crear encuestas nativas de WhatsApp, aprovechando las capacidades del fork.

/**
 * Crea una encuesta nativa en el chat.
 * El formato del comando es: /poll "Título de la Encuesta" "Opción 1" "Opción 2" ...
 * @param {object} ctx - El objeto de contexto del mensaje.
 */
export async function poll(ctx) {
  const { args, isGroup } = ctx;

  if (!isGroup) {
      return { success: false, message: 'ℹ️ Las encuestas solo se pueden crear en grupos.' };
  }

  // Parsear los argumentos que están entre comillas
  const pollArgs = ctx.text.match(/"([^"]+)"/g);

  if (!pollArgs || pollArgs.length < 3) {
    return {
      success: false,
      message: 'ℹ️ Formato incorrecto. Uso: /poll "Título" "Opción 1" "Opción 2" [...]',
    };
  }

  // Limpiar las comillas de los argumentos
  const cleanedArgs = pollArgs.map(arg => arg.slice(1, -1));

  const [title, ...options] = cleanedArgs;

  if (options.length < 2) {
    return { success: false, message: 'ℹ️ Una encuesta debe tener al menos 2 opciones.' };
  }
  if (options.length > 12) {
    return { success: false, message: 'ℹ️ WhatsApp permite un máximo de 12 opciones por encuesta.' };
  }

  return {
    type: 'poll',
    title: title,
    options: options,
    // selectableCount: 1, // Por defecto es 1, se puede hacer configurable en el futuro
  };
}

export default { poll };
