import { RUNTIME_CONFIG } from './runtime-config';

// Configuración de la API
export const API_CONFIG = {
  // URL base de la API
  BASE_URL: RUNTIME_CONFIG.API_BASE_URL,

  // Timeouts
  TIMEOUT: 30000, // 30 segundos

  // Headers por defecto
  DEFAULT_HEADERS: {
    'Content-Type': 'application/json',
  },

  // Endpoints
  ENDPOINTS: {
    // Autenticación
    AUTH: {
      LOGIN: '/api/auth/login',
      REGISTER: '/api/auth/register',
      ME: '/api/auth/me',
    },

    // Bot
    BOT: {
      STATUS: '/api/bot/status',
      QR: '/api/bot/qr',
      RESTART: '/api/bot/restart',
      DISCONNECT: '/api/bot/disconnect',
      CONFIG: '/api/bot/config',
    },

    // Grupos
    GROUPS: {
      LIST: '/api/grupos',
      CREATE: '/api/grupos',
      GET: (id: number) => `/api/grupos/${id}`,
      UPDATE: (id: number) => `/api/grupos/${id}`,
      DELETE: (id: number) => `/api/grupos/${id}`,
      AUTHORIZE: (id: number) => `/api/grupos/${id}/autorizar`,
      PROVIDER: (id: number) => `/api/grupos/${id}/proveedor`,
      STATS: '/api/grupos/stats',
    },

    // Aportes
    APORTES: {
      LIST: '/api/aportes',
      CREATE: '/api/aportes',
      GET: (id: number) => `/api/aportes/${id}`,
      UPDATE: (id: number) => `/api/aportes/${id}`,
      DELETE: (id: number) => `/api/aportes/${id}`,
      APPROVE: (id: number) => `/api/aportes/${id}/estado`,
      STATS: '/api/aportes/stats',
    },

    // Pedidos
    PEDIDOS: {
      LIST: '/api/pedidos',
      CREATE: '/api/pedidos',
      GET: (id: number) => `/api/pedidos/${id}`,
      UPDATE: (id: number) => `/api/pedidos/${id}`,
      DELETE: (id: number) => `/api/pedidos/${id}`,
      RESOLVE: (id: number) => `/api/pedidos/${id}/resolver`,
      STATS: '/api/pedidos/stats',
    },

    // Usuarios
    USUARIOS: {
      LIST: '/api/usuarios',
      CREATE: '/api/usuarios',
      GET: (id: number) => `/api/usuarios/${id}`,
      UPDATE: (id: number) => `/api/usuarios/${id}`,
      DELETE: (id: number) => `/api/usuarios/${id}`,
      ESTADO: (id: number) => `/api/usuarios/${id}/estado`,
      STATS: '/api/usuarios/stats',
    },
  },

  // Configuración de paginación
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
  },

  // Configuración de caché
  CACHE: {
    STALE_TIME: 5 * 60 * 1000, // 5 minutos
    REFETCH_INTERVAL: 10 * 1000, // 10 segundos
  },

  // Configuración de reintentos
  RETRY: {
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000, // 1 segundo
  },
};

// Tipos de respuesta de la API
export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// Tipos de error de la API
export interface ApiError {
  status: number;
  message: string;
  details?: any;
}

// Configuración de filtros
export interface ApiFilters {
  page?: number;
  limit?: number;
  search?: string;
  [key: string]: any;
}
