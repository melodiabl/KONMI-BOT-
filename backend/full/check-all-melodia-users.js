import db from './db.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function checkAllMelodiaUsers() {
  try {
    const users = await db('usuarios').where({ username: 'Melodia' });
    console.log('Usuarios con nombre "Melodia":');
    console.log('Total encontrados:', users.length);
    users.forEach((user, index) => {
      console.log(`\nUsuario ${index + 1}:`);
      console.log('ID:', user.id);
      console.log('Username:', user.username);
      console.log('Rol:', user.rol);
      console.log('Password hash:', user.password);
    });
  } catch (e) {
    console.error('Error:', e);
  }
}

checkAllMelodiaUsers().catch(console.error);
