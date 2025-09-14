import db from './db.js';

// Comando /ia para responder con IA (ejemplo simple)
async function handleIA(prompt, usuario, grupo) {
  // Aquí se integraría con un servicio de IA real, por ahora respuesta dummy
  const respuesta = `Respuesta IA para: ${prompt}`;
  return { success: true, message: respuesta };
}

// Comando para advertencias
async function handleWarning(usuario, grupo, motivo) {
  try {
    const fecha = new Date().toISOString();
    const advertenciaExistente = await db('advertencias')
      .where({ usuario, grupo })
      .first();

    if (advertenciaExistente) {
      const nuevoNumero = advertenciaExistente.numero + 1;
      await db('advertencias')
        .where({ usuario, grupo })
        .update({
          motivo,
          fecha,
          numero: nuevoNumero
        });
      return { success: true, message: `Advertencia actualizada. Total: ${nuevoNumero}` };
    } else {
      await db('advertencias').insert({
        usuario,
        grupo,
        motivo,
        fecha,
        numero: 1
      });
      return { success: true, message: 'Primera advertencia registrada.' };
    }
  } catch (error) {
    return { success: false, message: error.message };
  }
}

// Comando para activar/desactivar modo privado
let modoPrivado = false;
function toggleModoPrivado() {
  modoPrivado = !modoPrivado;
  return modoPrivado;
}

// Comando para activar/desactivar modo amigos
let modoAmigos = false;
function toggleModoAmigos() {
  modoAmigos = !modoAmigos;
  return modoAmigos;
}

// Obtener lista de grupos autorizados
async function getAuthorizedGroups() {
  try {
    const grupos = await db('grupos_autorizados').select('*');
    return grupos;
  } catch (error) {
    return [];
  }
}

export {
  handleIA,
  handleWarning,
  toggleModoPrivado,
  toggleModoAmigos,
  getAuthorizedGroups,
};
