// src/commands/help.js
import { getTheme } from '../utils/utils/theme.js'

async function handleHelp(ctx, commandMap) {
  const theme = getTheme();
  const displayName = ctx.pushName || 'Usuario';

  const buildCategoryIndex = () => {
    const map = new Map();
    for (const [name, command] of commandMap.entries()) {
      const category = (command.category || 'otros').toLowerCase();
      if (!map.has(category)) {
        map.set(category, []);
      }
      map.get(category).push(command);
    }
    return map;
  };

  const categories = buildCategoryIndex();
  const selectedCategory = (ctx?.args?.[0] || '').toLowerCase();

  if (selectedCategory && categories.has(selectedCategory)) {
    const entries = categories.get(selectedCategory);
    const lines = entries.map(entry => `*/${entry.name}*: ${entry.description}`).join('\n');
    return { text: `*Comandos de la categoría: ${selectedCategory}*\n\n${lines}` };
  }

  const categoryButtons = Array.from(categories.keys()).map(category => ({
    text: category.charAt(0).toUpperCase() + category.slice(1),
    id: `/help ${category}`
  }));

  const welcomeText = `¡Hola, ${displayName}! 👋\n\nSoy Konmi Bot, tu asistente personal.\nAquí tienes todas las categorías de comandos disponibles. Selecciona una para ver los detalles.`;

  return {
    type: 'buttons',
    text: welcomeText,
    buttons: categoryButtons
  };
}

export default {
  name: 'help',
  description: 'Muestra el menú de ayuda interactivo.',
  category: 'utils',
  handler: handleHelp
};
