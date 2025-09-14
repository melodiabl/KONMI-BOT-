import jwt from 'jsonwebtoken';
import db from './db.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

async function debugAuth() {
  try {
    // Generar token para Melodia
    const token = jwt.sign({ username: 'Melodia', rol: 'owner' }, JWT_SECRET, { expiresIn: '24h' });
    console.log('1. Token generado:', token);

    // Decodificar token
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('2. Token decodificado:', decoded);

    // Buscar usuario en base de datos
    const user = await db('usuarios').select('id', 'username', 'rol').where({ username: decoded.username }).first();
    console.log('3. Usuario encontrado en BD:', user);

    // Verificar si el rol está en la lista de roles autorizados
    const authorizedRoles = ['admin', 'owner'];
    const hasPermission = authorizedRoles.includes(user?.rol);
    console.log('4. Roles autorizados:', authorizedRoles);
    console.log('5. Rol del usuario:', user?.rol);
    console.log('6. Tiene permisos:', hasPermission);

    // Simular el middleware authorizeRoles
    console.log('7. Simulando authorizeRoles...');
    if (!authorizedRoles.includes(user.rol)) {
      console.log('8. ERROR: No tienes permisos para esta acción');
    } else {
      console.log('8. SUCCESS: Permisos verificados correctamente');
    }
    
    // ...existing code...
    
  } catch (error) {
    console.error('Error en debug:', error);
  }
}

debugAuth();
