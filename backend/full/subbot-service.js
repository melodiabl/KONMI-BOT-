import db from './db-connection.js';
import { activeSubbots, subbotSessions } from './handler.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Servicio inteligente de gestin de recursos para subbots
 */
class SubbotService {
  constructor() {
    this.maxActiveSubbots = parseInt(process.env.MAX_SUBBOTS) || 10;
    this.inactiveTimeout = parseInt(process.env.SUBBOT_TIMEOUT) || 30 * 60 * 1000; // 30 min
    this.cleanupInterval = parseInt(process.env.CLEANUP_INTERVAL) || 5 * 60 * 1000; // 5 min
    this.maxMemoryUsage = parseInt(process.env.MAX_MEMORY_MB) || 512; // 512MB por subbot

    // Iniciar limpieza automtica
    this.startCleanupService();

    // Monitorear uso de memoria
    this.startMemoryMonitoring();
  }

  /**
   * Verificar si se puede crear un nuevo subbot
   */
  async canCreateSubbot(userPhone) {
    try {
      // Verificar lmite global
      const activeCount = await db('subbots').where({ is_active: true }).count('id as count').first();
      if (activeCount.count >= this.maxActiveSubbots) {
        return {
          canCreate: false,
          reason: `Lmite global alcanzado (${this.maxActiveSubbots} subbots activos)`
        };
      }

      // Verificar lmite por usuario (mximo 2 por usuario)
      const userActiveCount = await db('subbots')
        .where({ user_phone: userPhone, is_active: true })
        .count('id as count')
        .first();

      if (userActiveCount.count >= 2) {
        return {
          canCreate: false,
          reason: 'Mximo 2 subbots activos por usuario'
        };
      }

      // Verificar uso de memoria
      const memoryUsage = process.memoryUsage();
      const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;

      if (memoryUsageMB > (this.maxMemoryUsage * this.maxActiveSubbots * 0.8)) {
        return {
          canCreate: false,
          reason: 'Uso de memoria alto, intenta ms tarde'
        };
      }

      return { canCreate: true };
    } catch (error) {
      console.error('Error verificando capacidad de subbots:', error);
      return {
        canCreate: false,
        reason: 'Error interno del sistema'
      };
    }
  }

  /**
   * Obtener estadsticas de uso de recursos
   */
  async getResourceStats() {
    try {
      const memoryUsage = process.memoryUsage();
      const activeCount = activeSubbots.size;
      const totalSubbots = await db('subbots').count('id as count').first();

      const stats = await db('subbots')
        .select('status')
        .count('id as count')
        .groupBy('status');

      return {
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024)
        },
        subbots: {
          active: activeCount,
          total: totalSubbots.count,
          maxCapacity: this.maxActiveSubbots,
          byStatus: stats
        },
        system: {
          uptime: Math.round(process.uptime()),
          nodeVersion: process.version,
          platform: process.platform
        }
      };
    } catch (error) {
      console.error('Error obteniendo estadsticas:', error);
      return null;
    }
  }

  /**
   * Limpiar subbots inactivos de forma inteligente
   */
  async intelligentCleanup() {
    try {
      const now = Date.now();
      const cleanupResults = {
        cleaned: 0,
        memoryFreed: 0,
        errors: []
      };

      // Obtener subbots candidatos para limpieza
      const candidates = [];

      for (const [subbotCode, session] of subbotSessions.entries()) {
        const timeSinceActivity = now - session.lastActivity;

        if (timeSinceActivity > this.inactiveTimeout) {
          candidates.push({
            code: subbotCode,
            inactiveTime: timeSinceActivity,
            session: session
          });
        }
      }

      // Ordenar por tiempo de inactividad (ms inactivos primero)
      candidates.sort((a, b) => b.inactiveTime - a.inactiveTime);

      // Limpiar subbots inactivos
      for (const candidate of candidates) {
        try {
          await this.cleanupSubbot(candidate.code);
          cleanupResults.cleaned++;

          console.log(` Subbot limpiado: ${candidate.code} (inactivo por ${Math.round(candidate.inactiveTime / 60000)} min)`);
        } catch (error) {
          cleanupResults.errors.push({
            code: candidate.code,
            error: error.message
          });
        }
      }

      // Si el uso de memoria sigue alto, limpiar ms agresivamente
      const memoryUsage = process.memoryUsage();
      const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;

      if (memoryUsageMB > (this.maxMemoryUsage * this.maxActiveSubbots * 0.9)) {
        console.log(' Memoria alta, limpieza agresiva activada');
        await this.aggressiveCleanup();
      }

      return cleanupResults;
    } catch (error) {
      console.error('Error en limpieza inteligente:', error);
      return { cleaned: 0, memoryFreed: 0, errors: [error.message] };
    }
  }

  /**
   * Limpiar un subbot especfico
   */
  async cleanupSubbot(subbotCode) {
    try {
      // Cerrar conexin
      if (activeSubbots.has(subbotCode)) {
        const sock = activeSubbots.get(subbotCode);
        sock.end();
        activeSubbots.delete(subbotCode);
      }

      // Limpiar sesin
      if (subbotSessions.has(subbotCode)) {
        subbotSessions.delete(subbotCode);
      }

      // Actualizar base de datos
      await db('subbots').where({ code: subbotCode }).update({
        status: 'inactive',
        is_active: false,
        last_activity: new Date().toISOString()
      });

      // Limpiar archivos de sesin temporales (mantener credenciales)
      const sessionDir = path.join(__dirname, 'sessions', 'subbots', subbotCode);
      if (fs.existsSync(sessionDir)) {
        const files = fs.readdirSync(sessionDir);
        for (const file of files) {
          if (file.startsWith('session-') || file.includes('temp')) {
            const filePath = path.join(sessionDir, file);
            fs.unlinkSync(filePath);
          }
        }
      }

      return true;
    } catch (error) {
      console.error(`Error limpiando subbot ${subbotCode}:`, error);
      throw error;
    }
  }

  /**
   * Limpieza agresiva cuando la memoria est muy alta
   */
  async aggressiveCleanup() {
    try {
      // Obtener todos los subbots activos ordenados por ltima actividad
      const activeSessions = Array.from(subbotSessions.entries())
        .sort((a, b) => a[1].lastActivity - b[1].lastActivity);

      // Limpiar los ms antiguos hasta liberar memoria
      const targetCleanup = Math.ceil(activeSessions.length * 0.3); // Limpiar 30%

      for (let i = 0; i < targetCleanup && i < activeSessions.length; i++) {
        const [subbotCode] = activeSessions[i];
        await this.cleanupSubbot(subbotCode);
        console.log(` Limpieza agresiva: ${subbotCode}`);
      }

      // Forzar garbage collection si est disponible
      if (global.gc) {
        global.gc();
      }
    } catch (error) {
      console.error('Error en limpieza agresiva:', error);
    }
  }

  /**
   * Iniciar servicio de limpieza automtica
   */
  startCleanupService() {
    setInterval(async () => {
      try {
        const results = await this.intelligentCleanup();
        if (results.cleaned > 0) {
          console.log(` Limpieza automtica: ${results.cleaned} subbots limpiados`);
        }
      } catch (error) {
        console.error('Error en limpieza automtica:', error);
      }
    }, this.cleanupInterval);

    console.log(` Servicio de limpieza iniciado (cada ${this.cleanupInterval / 60000} min)`);
  }

  /**
   * Monitorear uso de memoria
   */
  startMemoryMonitoring() {
    setInterval(() => {
      const memoryUsage = process.memoryUsage();
      const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;

      if (memoryUsageMB > (this.maxMemoryUsage * this.maxActiveSubbots * 0.8)) {
        console.log(` Uso de memoria alto: ${Math.round(memoryUsageMB)}MB`);
      }
    }, 60000); // Cada minuto
  }

  /**
   * Optimizar subbot existente
   */
  async optimizeSubbot(subbotCode) {
    try {
      const session = subbotSessions.get(subbotCode);
      if (!session) return false;

      // Actualizar ltima actividad
      session.lastActivity = Date.now();

      // Actualizar en base de datos
      await db('subbots').where({ code: subbotCode }).update({
        last_activity: new Date().toISOString()
      });

      return true;
    } catch (error) {
      console.error(`Error optimizando subbot ${subbotCode}:`, error);
      return false;
    }
  }
}

// Instancia singleton del servicio
const subbotService = new SubbotService();

export default subbotService;
