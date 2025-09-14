import db from './db.js';

async function fixMelodiaRole() {
  try {
    // Actualizar el rol de Melodia a owner
    const updated = await db('usuarios').where({ username: 'Melodia' }).update({ rol: 'owner' });
    if (updated) {
      console.log('✅ Rol de Melodia actualizado a OWNER');
      console.log('Filas afectadas:', updated);
    } else {
      console.log('❌ Usuario Melodia no encontrado');
    }

    // Verificar el cambio
    const row = await db('usuarios').where({ username: 'Melodia' }).first();
    if (row) {
      console.log('✅ Usuario verificado:', row);
    } else {
      console.log('❌ Usuario no encontrado');
    }
  } catch (err) {
    console.error('Error actualizando/verificando usuario:', err);
  }
}

fixMelodiaRole();
