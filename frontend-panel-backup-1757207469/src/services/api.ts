import axios, { AxiosInstance } from 'axios';
import { User, BotStatus, Aporte, Pedido, Proveedor, Group } from '../types';
import { RUNTIME_CONFIG } from '../config/runtime-config';

const API_URL = RUNTIME_CONFIG.API_BASE_URL;

class ApiService {
  private api: AxiosInstance;

  constructor() {
    console.log('ApiService: Inicializando con URL:', API_URL);
    this.api = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    // Interceptor para agregar token JWT
    this.api.interceptors.request.use((config) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
    // Interceptor para manejar errores
    this.api.interceptors.response.use(
      (response) => {
        console.log('API Response exitosa:', response.config.url);
        return response;
      },
      (error) => {
        console.log('API Error:', error.config?.url, error.response?.status);
        // Manejo de errores de autenticación
        if (error.response?.status === 401) {
          console.log('Error 401 detectado en:', error.config?.url);
          if (error.config?.url?.includes('/auth/me') || 
              error.config?.url?.includes('/auth/login') ||
              error.config?.url?.includes('/auth/verify')) {
            console.log('Error de autenticación crítico, removiendo token');
            localStorage.removeItem('token');
            if (window.location.pathname !== '/login') {
              window.location.href = '/login';
            }
          }
        }
        if (!error.response) {
          console.error('Error de red:', error);
        }
        if (error.response?.status >= 500) {
          console.error('Error del servidor:', error.response);
        }
        return Promise.reject(error);
      }
    );
  }

  private ensureApi() {
    if (!this.api) {
      throw new Error('ApiService no está inicializado correctamente');
    }
  }

  // Auth
  async login(username: string, password: string, role?: string) {
    this.ensureApi();
    const response = await this.api.post('/api/auth/login', { username, password, role });
    return response.data;
  }

  async register(username: string, password: string, wa_jid?: string) {
    this.ensureApi();
    const response = await this.api.post('/api/auth/register', { username, password, wa_jid });
    return response.data;
  }

  async getMe() {
    this.ensureApi();
    try {
      const response = await this.api.get('/api/auth/me');
      console.log('getMe exitoso:', response.data);
      return response.data;
    } catch (error) {
      console.error('getMe falló:', error);
      throw error;
    }
  }

  async verifyToken() {
    this.ensureApi();
    try {
      const response = await this.api.get('/api/auth/verify');
      return response.data;
    } catch (error) {
      console.error('verifyToken falló:', error);
      throw error;
    }
  }

  // Bot
  async getBotStatus(): Promise<BotStatus> {
    this.ensureApi();
    const response = await this.api.get('/api/bot/status');
    return response.data;
  }

  async getBotQR() {
    this.ensureApi();
    const response = await this.api.get('/api/bot/qr');
    return response.data;
  }

  async restartBot() {
    this.ensureApi();
    const response = await this.api.post('/api/bot/restart');
    return response.data;
  }

  async disconnectBot() {
    this.ensureApi();
    const response = await this.api.post('/api/bot/disconnect');
    return response.data;
  }

  async getBotConfig() {
    this.ensureApi();
    const response = await this.api.get('/api/bot/config');
    return response.data;
  }

  // Métodos adicionales para funcionalidades específicas
  async getUsers() {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/usuarios`);
    return response.data;
  }

  async searchMusic(query: string) {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/music/search?q=${encodeURIComponent(query)}`);
    return response.data;
  }

  async getPopularSongs() {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/music/popular`);
    return response.data;
  }

  async getMusicGenres() {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/music/genres`);
    return response.data;
  }

  async getDownloadStats() {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/music/stats`);
    return response.data;
  }

  async getDownloadHistory() {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/music/history`);
    return response.data;
  }

  async downloadMusic(request: any) {
    this.ensureApi();
    const response = await axios.post(`${API_URL}/music/download`, request);
    return response.data;
  }

  async searchNews(query: string, limit: number = 10) {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/news/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    return response.data;
  }

  async getTopNews(category: string = 'general', limit: number = 10) {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/news/top?category=${category}&limit=${limit}`);
    return response.data;
  }

  async getCurrentWeather(city: string) {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/weather/current?city=${encodeURIComponent(city)}`);
    return response.data;
  }

  async getWeatherForecast(city: string, days: number = 3) {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/weather/forecast?city=${encodeURIComponent(city)}&days=${days}`);
    return response.data;
  }

  async updateBotConfig(config: any) {
    this.ensureApi();
    const response = await this.api.patch('/api/bot/config', config);
    return response.data;
  }

  // Groups
  async getGroups(page = 1, limit = 20, search?: string) {
    this.ensureApi();
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (search) params.append('search', search);

    const response = await axios.get(`${API_URL}/grupos?${params}`);
    return response.data;
  }

  async createGrupo(data: Partial<Group>) {
    this.ensureApi();
    const response = await this.api.post('/api/grupos', data);
    return response.data;
  }

  async updateGrupo(id: number, data: Partial<Group>) {
    this.ensureApi();
    const response = await this.api.patch(`/api/grupos/${id}`, data);
    return response.data;
  }

  async authorizeGroup(id: number, autorizado: boolean) {
    this.ensureApi();
    const response = await this.api.patch(`/api/grupos/${id}/autorizar`, { autorizado });
    return response.data;
  }

  async toggleProvider(id: number, es_proveedor: boolean) {
    this.ensureApi();
    const response = await this.api.patch(`/api/grupos/${id}/proveedor`, { es_proveedor });
    return response.data;
  }

  async getGroupStats() {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/grupos/stats`);
    return response.data;
  }

  // Aportes
  async getAportes(page = 1, limit = 20, search?: string, estado?: string, fuente?: string) {
    this.ensureApi();
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (search) params.append('search', search);
    if (estado) params.append('estado', estado);
    if (fuente) params.append('fuente', fuente);

    const response = await axios.get(`${API_URL}/aportes?${params}`);
    return response.data;
  }

  async getAporteById(id: number) {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/aportes/${id}`);
    return response.data;
  }

  async createAporte(aporte: Partial<Aporte>) {
    this.ensureApi();
    const response = await this.api.post('/api/aportes', aporte);
    return response.data;
  }

  async updateAporte(id: number, aporte: Partial<Aporte>) {
    this.ensureApi();
    const response = await this.api.patch(`/api/aportes/${id}`, aporte);
    return response.data;
  }

  async deleteAporte(id: number) {
    this.ensureApi();
    const response = await axios.delete(`${API_URL}/aportes/${id}`);
    return response.data;
  }

  async approveAporte(id: number, estado: string, motivo_rechazo?: string) {
    this.ensureApi();
    const response = await this.api.patch(`/api/aportes/${id}/estado`, { estado, motivo_rechazo });
    return response.data;
  }

  async getAporteStats() {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/aportes/stats`);
    return response.data;
  }

  // Pedidos
  async getPedidos(page = 1, limit = 20, search?: string, estado?: string) {
    this.ensureApi();
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (search) params.append('search', search);
    if (estado) params.append('estado', estado);

    const response = await axios.get(`${API_URL}/pedidos?${params}`);
    return response.data;
  }

  async getPedidoById(id: number) {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/pedidos/${id}`);
    return response.data;
  }

  async createPedido(pedido: Partial<Pedido>) {
    this.ensureApi();
    const response = await this.api.post('/api/pedidos', pedido);
    return response.data;
  }

  async updatePedido(id: number, pedido: Partial<Pedido>) {
    this.ensureApi();
    const response = await this.api.patch(`/api/pedidos/${id}`, pedido);
    return response.data;
  }

  async deletePedido(id: number) {
    this.ensureApi();
    const response = await axios.delete(`${API_URL}/pedidos/${id}`);
    return response.data;
  }

  async resolvePedido(id: number, aporte_id?: number) {
    this.ensureApi();
    const response = await this.api.patch(`/api/pedidos/${id}/resolver`, { aporte_id });
    return response.data;
  }

  async getPedidoStats() {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/pedidos/stats`);
    return response.data;
  }

  // Proveedores
  async getProveedores(page = 1, limit = 20, search?: string) {
    this.ensureApi();
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (search) params.append('search', search);

    const response = await axios.get(`${API_URL}/proveedores?${params}`);
    return response.data;
  }

  async getProveedor(id: number) {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/proveedores/${id}`);
    return response.data;
  }

  async createProveedor(data: Partial<Proveedor>) {
    this.ensureApi();
    const response = await this.api.post('/api/proveedores', data);
    return response.data;
  }

  async updateProveedor(id: number, data: Partial<Proveedor>) {
    this.ensureApi();
    const response = await this.api.patch(`/api/proveedores/${id}`, data);
    return response.data;
  }

  async getMyProveedor() {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/proveedores/me`);
    return response.data;
  }

  // Usuarios
  async getUsuarios(page = 1, limit = 20, search?: string, estado?: string) {
    this.ensureApi();
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (search) params.append('search', search);
    if (estado) params.append('estado', estado);

    const response = await axios.get(`${API_URL}/usuarios?${params}`);
    return response.data;
  }

  async getUsuarioById(id: number) {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/usuarios/${id}`);
    return response.data;
  }

  async createUsuario(usuario: Partial<User> & { password: string }) {
    this.ensureApi();
    const response = await this.api.post('/api/usuarios', usuario);
    return response.data;
  }

  async updateUsuario(id: number, usuario: Partial<User> & { password?: string }) {
    this.ensureApi();
    const response = await this.api.patch(`/api/usuarios/${id}`, usuario);
    return response.data;
  }

  async deleteUsuario(id: number) {
    this.ensureApi();
    const response = await axios.delete(`${API_URL}/usuarios/${id}`);
    return response.data;
  }

  async updateUsuarioEstado(id: number, estado: string) {
    this.ensureApi();
    const response = await this.api.patch(`/api/usuarios/${id}/estado`, { estado });
    return response.data;
  }

  async getUsuarioStats() {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/usuarios/stats`);
    return response.data;
  }

  // Logs
  async getLogs(page = 1, limit = 50, level?: string) {
    this.ensureApi();
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (level) params.append('level', level);

    const response = await axios.get(`${API_URL}/logs?${params}`);
    return response.data;
  }

  // Notificaciones
  async getNotificaciones(page = 1, limit = 20) {
    this.ensureApi();
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());

    const response = await axios.get(`${API_URL}/notificaciones?${params}`);
    return response.data;
  }

  async markAsRead(id: number) {
    this.ensureApi();
    const response = await axios.patch(`${API_URL}/notificaciones/${id}/read`);
    return response.data;
  }

  async markAllAsRead() {
    this.ensureApi();
    const response = await axios.patch(`${API_URL}/notificaciones/read-all`);
    return response.data;
  }

  // AI
  async sendAIMessage(data: { message: string; model: string; context?: string }) {
    this.ensureApi();
    const response = await this.api.post('/api/ai/chat', data);
    return response.data;
  }

  async askAI(question: string) {
    this.ensureApi();
    const response = await this.api.post('/api/ai/ask', { question });
    return response.data;
  }

  async testAICommand(command: string) {
    this.ensureApi();
    const response = await this.api.post('/api/ai/test-command', { command });
    return response.data;
  }

  // Analytics
  async getAnalytics(timeRange?: string) {
    this.ensureApi();
    const params = timeRange ? `?timeRange=${timeRange}` : '';
    const response = await axios.get(`${API_URL}/analytics${params}`);
    return response.data;
  }

  // Logs
  async clearLogs() {
    this.ensureApi();
    const response = await axios.delete(`${API_URL}/logs`);
    return response.data;
  }

  async exportLogs() {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/logs/export`);
    return response.data;
  }

  // Notificaciones
  async deleteNotification(id: number) {
    this.ensureApi();
    const response = await axios.delete(`${API_URL}/notificaciones/${id}`);
    return response.data;
  }

  async getNotificationStats() {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/notificaciones/stats`);
    return response.data;
  }

  // Proveedores
  async getProviders() {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/proveedores`);
    return response.data;
  }

  async getProviderStats() {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/proveedores/stats`);
    return response.data;
  }

  async createProvider(data: any) {
    this.ensureApi();
    const response = await axios.post(`${API_URL}/proveedores`, data);
    return response.data;
  }

  async updateProvider(id: number, data: any) {
    this.ensureApi();
    const response = await axios.patch(`${API_URL}/proveedores/${id}`, data);
    return response.data;
  }

  async deleteProvider(id: number) {
    this.ensureApi();
    const response = await axios.delete(`${API_URL}/proveedores/${id}`);
    return response.data;
  }

  async toggleProviderStatus(id: number, status: string) {
    this.ensureApi();
    const response = await axios.patch(`${API_URL}/proveedores/${id}/status`, { status });
    return response.data;
  }

  // Grupos
  async deleteGrupo(id: number) {
    this.ensureApi();
    const response = await axios.delete(`${API_URL}/grupos/${id}`);
    return response.data;
  }

  // Multimedia
  async getMultimediaStats() {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/multimedia/stats`);
    return response.data;
  }

  // Settings
  async getSystemStats() {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/system/stats`);
    return response.data;
  }

  async updateSystemConfig(config: any) {
    this.ensureApi();
    const response = await this.api.patch('/api/system/config', config);
    return response.data;
  }



  // Multimedia
  async uploadMultimedia(file: File) {
    this.ensureApi();
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await axios.post(`${API_URL}/multimedia/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  }

  async convertMultimedia(id: string, format: string) {
    this.ensureApi();
    const response = await axios.post(`${API_URL}/multimedia/${id}/convert`, { format });
    return response.data;
  }

  async getMultimedia(id: string) {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/multimedia/${id}`);
    return response.data;
  }

  async deleteMultimedia(id: string) {
    this.ensureApi();
    const response = await axios.delete(`${API_URL}/multimedia/${id}`);
    return response.data;
  }

  // Stats
  async getStats() {
    this.ensureApi();
    const response = await axios.get(`${API_URL}/stats/overview`);
    return response.data;
  }

  // BOT: Captura y monitoreo de grupos
  async startGroupMonitoring(grupo_id: number, tipos_contenido: string[]) {
    this.ensureApi();
    const response = await axios.post(`${API_URL}/bot/start-monitoring`, { grupo_id, tipos_contenido });
    return response.data;
  }

  async stopGroupMonitoring(grupo_id: number) {
    this.ensureApi();
    const response = await axios.post(`${API_URL}/bot/stop-monitoring`, { grupo_id });
    return response.data;
  }

  async captureGroupContent(grupo_id: number, tipo_contenido: string, contenido: string, metadata?: any) {
    this.ensureApi();
    const response = await axios.post(`${API_URL}/bot/capture-group`, { grupo_id, tipo_contenido, contenido, metadata });
    return response.data;
  }

  async getCapturedContent(params: { grupo_id?: number; tipo_contenido?: string; estado?: string; page?: number; limit?: number }) {
    this.ensureApi();
    const query = new URLSearchParams();
    if (params.grupo_id) query.append('grupo_id', params.grupo_id.toString());
    if (params.tipo_contenido) query.append('tipo_contenido', params.tipo_contenido);
    if (params.estado) query.append('estado', params.estado);
    if (params.page) query.append('page', params.page.toString());
    if (params.limit) query.append('limit', params.limit.toString());
    const response = await axios.get(`${API_URL}/bot/captured-content?${query.toString()}`);
    return response.data;
  }

  async deleteCapturedContent(id: number) {
    this.ensureApi();
    const response = await axios.delete(`${API_URL}/bot/captured-content/${id}`);
    return response.data;
  }
}

export const apiService = new ApiService();

// ===== MÚSICA =====
export const searchMusic = async (query: string) => {
  return await axios.get(`${API_URL}/music/search?query=${encodeURIComponent(query)}`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  }).then(response => response.data);
};

export const downloadMusic = async (request: { query: string; format: string; quality: string }) => {
  return await axios.post(`${API_URL}/music/download`, request, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  }).then(response => response.data);
};

export const getDownloadHistory = async () => {
  return await axios.get(`${API_URL}/music/history`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  }).then(response => response.data);
};

export const getDownloadStats = async () => {
  return await axios.get(`${API_URL}/music/stats`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  }).then(response => response.data);
};

export const getPopularSongs = async () => {
  return await axios.get(`${API_URL}/music/popular`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  }).then(response => response.data);
};

export const getMusicGenres = async () => {
  return await axios.get(`${API_URL}/music/genres`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  }).then(response => response.data);
};

// ===== COMANDOS DEL BOT =====
export const executeBotCommand = async (command: string, groupId?: string) => {
  return await axios.post(`${API_URL}/bot/execute`, { command, groupId }, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  }).then(response => response.data);
};

export const getBotCommandHelp = async (category?: string) => {
  const params = category ? `?category=${category}` : '';
  return await axios.get(`${API_URL}/bot/help${params}`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  }).then(response => response.data);
};

export const getBotCommandStats = async () => {
  return await axios.get(`${API_URL}/bot/stats`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  }).then(response => response.data);
};

export const getPopularBotCommands = async () => {
  return await axios.get(`${API_URL}/bot/popular`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  }).then(response => response.data);
};

export const getBotCommandCategories = async () => {
  return await axios.get(`${API_URL}/bot/categories`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  }).then(response => response.data);
};

export const testBotCommand = async (command: string, args: string[] = []) => {
  return await axios.post(`${API_URL}/bot/test`, { command, args }, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  }).then(response => response.data);
};

// ===== NOTIFICACIONES =====
export const getUserNotifications = async (limit: number = 50) => {
  return await axios.get(`${API_URL}/notifications?limit=${limit}`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  }).then(response => response.data);
};

export const markNotificationAsRead = async (notificationId: string) => {
  return await axios.patch(`${API_URL}/notifications/${notificationId}/read`, {}, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  }).then(response => response.data);
};

export const markAllNotificationsAsRead = async () => {
  return await axios.patch(`${API_URL}/notifications/read-all`, {}, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  }).then(response => response.data);
};

export const deleteNotification = async (notificationId: string) => {
  return await axios.delete(`${API_URL}/notifications/${notificationId}`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  }).then(response => response.data);
};

export const getNotificationStats = async () => {
  return await axios.get(`${API_URL}/notifications/stats`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  }).then(response => response.data);
};

export const createTestNotification = async (notification: {
  title: string;
  message: string;
  type?: string;
  category?: string;
}) => {
  return await axios.post(`${API_URL}/notifications/test`, notification, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  }).then(response => response.data);
};

export const getNotificationCategories = async () => {
  return await axios.get(`${API_URL}/notifications/categories`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  }).then(response => response.data);
};

export const getNotificationTypes = async () => {
  return await axios.get(`${API_URL}/notifications/types`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('token')}`
    }
  }).then(response => response.data);
};
