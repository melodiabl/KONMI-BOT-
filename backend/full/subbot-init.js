import db from './db.js';
import logger from './config/logger.js';
import { launchSubbot } from './inproc-subbots.js';

/**
 * Inicializa los subbots existentes al arrancar la aplicacin
 */
export async function initializeSubbots() {
  try {
    logger.info(' Inicializando subbots existentes...');

    // Verificar si la tabla subbots existe
    const hasTable = await db.schema.hasTable('subbots');
    if (!hasTable) {
      logger.warn('La tabla de subbots no existe. Ejecuta las migraciones primero.');
      return;
    }

    // Obtener todos los subbots que deberan estar activos
    const activeSubbots = await db('subbots')
      .where('is_active', true)
      .whereIn('status', ['connected', 'waiting_scan', 'waiting_pairing']);

    logger.info(` Intentando reconectar ${activeSubbots.length} subbots...`);

    // Iniciar cada subbot en segundo plano
    for (const subbot of activeSubbots) {
      try {
        logger.info(` Iniciando subbot ${subbot.id} (${subbot.status})`);

        // Actualizar el estado a reconectando
        await db('subbots')
          .where('id', subbot.id)
          .update({
            status: 'reconnecting',
            updated_at: new Date().toISOString()
          });

        // Iniciar el subbot en segundo plano
        launchSubbot(subbot.id, subbot.user_phone)
          .catch(error => {
            logger.error(` Error al reconectar subbot ${subbot.id}:`, error);
          });

      } catch (error) {
        logger.error(` Error procesando subbot ${subbot?.id}:`, error);
      }
    }

    logger.info(' Inicializacin de subbots completada');
  } catch (error) {
    logger.error(' Error en la inicializacin de subbots:', error);
  }
}

/**
 * Limpia el estado de los subbots al apagar la aplicacin
 */
export async function cleanupSubbots() {
  try {
    logger.info(' Limpiando estado de subbots...');

    // Actualizar el estado de todos los subbots a desconectados
    await db('subbots')
      .whereIn('status', ['connected', 'reconnecting'])
      .update({
        status: 'disconnected',
        is_active: false,
        updated_at: new Date().toISOString()
      });

    logger.info(' Limpieza de subbots completada');
  } catch (error) {
    logger.error(' Error al limpiar el estado de los subbots:', error);
  }
}

// Manejar seales de terminacin
process.on('SIGINT', async () => {
  logger.info('\n Recibida seal de terminacin. Limpiando...');
  await cleanupSubbots();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('\n Recibida seal de terminacin. Limpiando...');
  await cleanupSubbots();
  process.exit(0);
});

// Exportar funciones para uso en otros mdulos
export default {
  initializeSubbots,
  cleanupSubbots
};
