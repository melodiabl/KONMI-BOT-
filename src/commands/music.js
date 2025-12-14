// src/commands/music.js

async function handlePlay(ctx) {
  // Lógica para reproducir música
  return { text: 'Función de reproducción de música aún no implementada.' };
}

export default {
  name: 'play',
  description: 'Reproduce una canción de YouTube.',
  category: 'media',
  handler: handlePlay,
};
