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

  // Métodos de subbots
  async getSubbots(): Promise<{ subbots: any[] }> {
    this.ensureApi();
    const response = await this.api.get('/api/subbot/list');
    return response.data;
  }

  async getSubbotStatus(): Promise<{ subbots: any[] }> {
    this.ensureApi();
    const response = await this.api.get('/api/subbot/status');
    return response.data;
  }

  async createSubbot(userId: number, type: 'qr' | 'code'): Promise<{ success: boolean; subbotId?: string; error?: string }> {
    this.ensureApi();
    const response = await this.api.post('/api/subbot/create', { userId, type });
    return response.data;
  }

  async deleteSubbot(subbotId: string): Promise<{ success: boolean; error?: string }> {
    this.ensureApi();
    const response = await this.api.delete(`/api/subbot/${subbotId}`);
    return response.data;
  }

  // Métodos adicionales para funcionalidades específicas
  async getUsers() {
    this.ensureApi();
    const response = await this.api.get('/api/usuarios');
    return response.data;
  }

  async searchMusic(query: string) {
    this.ensureApi();
    const response = await this.api.get(`/api/music/search?q=${encodeURIComponent(query)}`);
    return response.data;
  }

  async getPopularSongs() {
    this.ensureApi();
    const response = await this.api.get('/api/music/popular');
    return response.data;
  }

  async getMusicGenres() {
    this.ensureApi();
    const response = await this.api.get('/api/music/genres');
    return response.data;
  }

  async getDownloadStats() {
    this.ensureApi();
    const response = await this.api.get('/api/music/stats');
    return response.data;
  }

  async getDownloadHistory() {
    this.ensureApi();
    const response = await this.api.get('/api/music/history');
    return response.data;
  }

  async downloadMusic(query: string, format: string, quality: string) {
    this.ensureApi();
    const response = await this.api.post('/api/music/download', { query, format, quality });
    return response.data;
  }

  async getMusicHistory() {
    this.ensureApi();
    const response = await this.api.get('/api/music/history');
    return response.data;
  }

  async getMusicStats() {
    this.ensureApi();
    const response = await this.api.get('/api/music/stats');
    return response.data;
  }

  // Comandos del bot
  async executeBotCommand(command: string, groupId?: string) {
    this.ensureApi();
    const response = await this.api.post('/api/bot/execute', { command, groupId });
    return response.data;
  }

  async getBotCommandHelp(category?: string) {
    this.ensureApi();
    const params = category ? `?category=${category}` : '';
    const response = await this.api.get(`/api/bot/help${params}`);
    return response.data;
  }

  async getBotCommandStats() {
    this.ensureApi();
    const response = await this.api.get('/api/bot/stats');
    return response.data;
  }

  async getPopularBotCommands() {
    this.ensureApi();
    const response = await this.api.get('/api/bot/popular');
    return response.data;
  }

  async getBotCommandCategories() {
    this.ensureApi();
    const response = await this.api.get('/api/bot/categories');
    return response.data;
  }

  async testBotCommandWithArgs(command: string, args: string[] = []) {
    this.ensureApi();
    const response = await this.api.post('/api/bot/test', { command, args });
    return response.data;
  }

  async searchNews(query: string, limit: number = 10) {
    this.ensureApi();
    const response = await this.api.get(`/news/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    return response.data;
  }

  async getTopNews(category: string = 'general', limit: number = 10) {
    this.ensureApi();
    const response = await this.api.get(`/news/top?category=${category}&limit=${limit}`);
    return response.data;
  }

  async getCurrentWeather(city: string) {
    this.ensureApi();
    const response = await this.api.get(`/weather/current?city=${encodeURIComponent(city)}`);
    return response.data;
  }

  async getWeatherForecast(city: string, days: number = 3) {
    this.ensureApi();
    const response = await this.api.get(`/weather/forecast?city=${encodeURIComponent(city)}&days=${days}`);
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
    // En backend actual, /api/grupos devuelve lista sin paginar; mantenemos search opcional
    if (search) params.append('search', search);
    const qs = params.toString();
    const url = `/api/grupos${qs ? `?${qs}` : ''}`;
    const response = await this.api.get(url);
    return response.data;
  }

  async createGrupo(data: Partial<Group>) {
    this.ensureApi();
    const payload: any = {
      jid: (data as any).wa_jid || (data as any).jid,
      nombre: data.nombre,
      botEnabled: (data as any).bot_enabled !== false,
    };
    const response = await this.api.post('/api/grupos', payload);
    return response.data;
  }

  async updateGrupo(idOrJid: string | number, data: Partial<Group>) {
    this.ensureApi();
    const jid: any = (data as any)?.wa_jid || idOrJid;
    const payload: any = {
      nombre: data.nombre,
      botEnabled: (data as any).bot_enabled,
    };
    const response = await this.api.put(`/api/grupos/${jid}`, payload);
    return response.data;
  }

  async authorizeGroup(jid: string, enabled: boolean) {
    // Compatibilidad: usar como toggle de bot
    return this.updateGrupo(jid, { bot_enabled: enabled } as any);
  }

  async toggleProvider(id: number, es_proveedor: boolean) {
    this.ensureApi();
    const response = await this.api.patch(`/api/grupos/${id}/proveedor`, { es_proveedor });
    return response.data;
  }

  async getGroupStats() {
    this.ensureApi();
    const response = await this.api.get('/api/grupos/stats');
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

    const response = await this.api.get(`/api/aportes?${params}`);
    return response.data;
  }

  async getAporteById(id: number) {
    this.ensureApi();
    const response = await this.api.get(`/api/aportes/${id}`);
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
    const response = await this.api.delete(`/api/aportes/${id}`);
    return response.data;
  }

  async approveAporte(id: number, estado: string, motivo_rechazo?: string) {
    this.ensureApi();
    const response = await this.api.patch(`/api/aportes/${id}/estado`, { estado, motivo_rechazo });
    return response.data;
  }

  async getAporteStats() {
    this.ensureApi();
    const response = await this.api.get('/api/aportes/stats');
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

    const response = await this.api.get(`/api/pedidos?${params}`);
    return response.data;
  }

  async getPedidoById(id: number) {
    this.ensureApi();
    const response = await this.api.get(`/api/pedidos/${id}`);
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
    const response = await this.api.delete(`/api/pedidos/${id}`);
    return response.data;
  }

  async resolvePedido(id: number, aporte_id?: number) {
    this.ensureApi();
    const response = await this.api.patch(`/api/pedidos/${id}/resolver`, { aporte_id });
    return response.data;
  }

  async getPedidoStats() {
    this.ensureApi();
    const response = await this.api.get('/api/pedidos/stats');
    return response.data;
  }

  // Proveedores
  async getProveedores(page = 1, limit = 20, search?: string) {
    this.ensureApi();
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (search) params.append('search', search);

    const response = await this.api.get(`/api/proveedores?${params}`);
    return response.data;
  }

  async getProveedor(id: number) {
    this.ensureApi();
    const response = await this.api.get(`/api/proveedores/${id}`);
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
    const response = await this.api.get('/api/proveedores/me');
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

    const response = await this.api.get(`/api/usuarios?${params}`);
    return response.data;
  }

  async getUsuarioById(id: number) {
    this.ensureApi();
    const response = await this.api.get(`/api/usuarios/${id}`);
    return response.data;
  }

  async createUsuario(usuario: Partial<User> & { password: string }) {
    this.ensureApi();
    const response = await this.api.post('/api/usuarios', usuario);
    return response.data;
  }

  async updateUsuario(id: number, usuario: Partial<User> & { password?: string }) {
    this.ensureApi();
    const response = await this.api.put(`/api/usuarios/${id}/full-edit`, usuario);
    return response.data;
  }

  async deleteUsuario(id: number) {
    this.ensureApi();
    const response = await this.api.delete(`/api/usuarios/${id}`);
    return response.data;
  }

  async updateUsuarioEstado(id: number, estado: string) {
    this.ensureApi();
    const response = await this.api.patch(`/api/usuarios/${id}/estado`, { estado });
    return response.data;
  }

  async getUsuarioStats() {
    this.ensureApi();
    const response = await this.api.get('/api/usuarios/stats');
    return response.data;
  }

  // Logs
  async getLogs(page = 1, limit = 50, level?: string) {
    this.ensureApi();
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (level) params.append('level', level);

    const response = await this.api.get(`/api/logs?${params}`);
    return response.data;
  }

  // Notificaciones
  async getNotificaciones(page = 1, limit = 20) {
    this.ensureApi();
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());

    const response = await this.api.get(`/api/notificaciones?${params}`);
    return response.data;
  }

  async markAsRead(id: number) {
    this.ensureApi();
    const response = await this.api.patch(`/api/notificaciones/${id}/read`);
    return response.data;
  }

  async markAllAsRead() {
    this.ensureApi();
    const response = await this.api.patch('/api/notificaciones/read-all');
    return response.data;
  }

  // ====== MÉTODOS AGREGADOS PARA NOTIFICACIONES ======
  async markNotificationAsRead(id: number) {
    this.ensureApi();
    // Lógica básica: marcar como leída una notificación
    const response = await this.api.patch(`/api/notificaciones/${id}/read`);
    return response.data;
  }

  async markAllNotificationsAsRead() {
    this.ensureApi();
    // Lógica básica: marcar todas como leídas
    const response = await this.api.patch('/api/notificaciones/read-all');
    return response.data;
  }

  async createTestNotification(message: string, type: string = 'info') {
    this.ensureApi();
    // Lógica básica: crear una notificación de prueba
    const response = await this.api.post('/api/notificaciones/test', { message, type });
    return response.data;
  }

  async getNotificationCategories() {
    this.ensureApi();
    // Lógica básica: obtener categorías de notificaciones
    const response = await this.api.get('/api/notificaciones/categories');
    return response.data;
  }

  async getNotificationTypes() {
    this.ensureApi();
    // Lógica básica: obtener tipos de notificaciones
    const response = await this.api.get('/api/notificaciones/types');
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
    const response = await this.api.get(`/api/analytics${params}`);
    return response.data;
  }

  // Logs
  async clearLogs() {
    this.ensureApi();
    const response = await this.api.delete('/api/logs');
    return response.data;
  }

  async exportLogs() {
    this.ensureApi();
    const response = await this.api.get('/api/logs/export');
    return response.data;
  }

  // Notificaciones
  async deleteNotification(id: number) {
    this.ensureApi();
    const response = await this.api.delete(`/api/notificaciones/${id}`);
    return response.data;
  }

  async getNotificationStats() {
    this.ensureApi();
    const response = await this.api.get('/api/notificaciones/stats');
    return response.data;
  }

  // Proveedores
  async getProviders() {
    this.ensureApi();
    const response = await this.api.get('/api/proveedores');
    return response.data;
  }

  async getProviderStats() {
    this.ensureApi();
    const response = await this.api.get('/api/proveedores/stats');
    return response.data;
  }

  async createProvider(data: any) {
    this.ensureApi();
    const response = await this.api.post('/api/proveedores', data);
    return response.data;
  }

  async updateProvider(id: number, data: any) {
    this.ensureApi();
    const response = await this.api.patch(`/api/proveedores/${id}`, data);
    return response.data;
  }

  async deleteProvider(id: number) {
    this.ensureApi();
    const response = await this.api.delete(`/api/proveedores/${id}`);
    return response.data;
  }

  async toggleProviderStatus(id: number, status: string) {
    this.ensureApi();
    const response = await this.api.patch(`/api/proveedores/${id}/status`, { status });
    return response.data;
  }

  // Grupos
  async deleteGrupo(id: number) {
    this.ensureApi();
    const response = await this.api.delete(`/api/grupos/${id}`);
    return response.data;
  }

  // Multimedia
  async getMultimediaStats() {
    this.ensureApi();
    const response = await this.api.get('/api/multimedia/stats');
    return response.data;
  }

  // Settings
  async getSystemStats() {
    this.ensureApi();
    const response = await this.api.get('/api/system/stats');
    return response.data;
  }

  async updateSystemConfig(config: any) {
    this.ensureApi();
    const response = await this.api.patch('/api/system/config', config);
    return response.data;
  }

  // Gestión de Grupos
  async getGroupsManagement() {
    this.ensureApi();
    const response = await this.api.get('/api/grupos/management');
    return response.data;
  }

  async toggleGroupBot(groupId: string, action: 'on' | 'off') {
    this.ensureApi();
    const response = await this.api.post(`/api/grupos/${groupId}/toggle`, { action });
    return response.data;
  }

  // Notificaciones Globales
  async getGlobalNotifications(page = 1, limit = 20) {
    this.ensureApi();
    const response = await this.api.get(`/api/notificaciones-globales?page=${page}&limit=${limit}`);
    return response.data;
  }

  async getGlobalNotificationStats() {
    this.ensureApi();
    const response = await this.api.get('/api/notificaciones-globales/stats');
    return response.data;
  }

  // Control Global del Bot
  async shutdownBotGlobally() {
    this.ensureApi();
    const response = await this.api.post('/api/bot/global-shutdown');
    return response.data;
  }

  async startupBotGlobally() {
    this.ensureApi();
    const response = await this.api.post('/api/bot/global-startup');
    return response.data;
  }

  // Bot Global Control
  async setBotGlobalState(isOn: boolean) {
    this.ensureApi();
    const response = await this.api.post('/api/bot/global-state', { isOn });
    return response.data;
  }

  async getBotGlobalState() {
    this.ensureApi();
    const response = await this.api.get('/api/bot/global-state');
    return response.data;
  }



  // Multimedia
  async uploadMultimedia(file: File) {
    this.ensureApi();
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await this.api.post('/multimedia/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  }

  async convertMultimedia(id: string, format: string) {
    this.ensureApi();
    const response = await this.api.post(`/multimedia/${id}/convert`, { format });
    return response.data;
  }

  async getMultimedia(id: string) {
    this.ensureApi();
    if (id === 'all') {
      const response = await this.api.get('/api/multimedia/all');
      return response.data;
    }
    const response = await this.api.get(`/multimedia/${id}`);
    return response.data;
  }

  async getAllMultimedia() {
    this.ensureApi();
    const response = await this.api.get('/api/multimedia/all');
    return response.data;
  }

  async deleteMultimedia(id: string) {
    this.ensureApi();
    const response = await this.api.delete(`/multimedia/${id}`);
    return response.data;
  }

  // Stats
  async getStats() {
    this.ensureApi();
    const response = await this.api.get('/api/stats/overview');
    return response.data;
  }

  // BOT: Captura y monitoreo de grupos
  async startGroupMonitoring(grupo_id: number, tipos_contenido: string[]) {
    this.ensureApi();
    const response = await this.api.post('/bot/start-monitoring', { grupo_id, tipos_contenido });
    return response.data;
  }

  async stopGroupMonitoring(grupo_id: number) {
    this.ensureApi();
    const response = await this.api.post('/bot/stop-monitoring', { grupo_id });
    return response.data;
  }

  async captureGroupContent(grupo_id: number, tipo_contenido: string, contenido: string, metadata?: any) {
    this.ensureApi();
    const response = await this.api.post('/bot/capture-group', { grupo_id, tipo_contenido, contenido, metadata });
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
    const response = await this.api.get(`/bot/captured-content?${query.toString()}`);
    return response.data;
  }

  async deleteCapturedContent(id: number) {
    this.ensureApi();
    const response = await this.api.delete(`/bot/captured-content/${id}`);
    return response.data;
  }

  // Métodos para AI Chat
  async getChatSessions() {
    this.ensureApi();
    const response = await this.api.get('/api/chat/sessions');
    return response.data;
  }

  async getChatMessages(sessionId: string) {
    this.ensureApi();
    const response = await this.api.get(`/api/chat/sessions/${sessionId}/messages`);
    return response.data;
  }

  async createChatSession(title: string) {
    this.ensureApi();
    const response = await this.api.post('/api/chat/sessions', { title });
    return response.data;
  }

  async deleteChatSession(sessionId: string) {
    this.ensureApi();
    const response = await this.api.delete(`/api/chat/sessions/${sessionId}`);
    return response.data;
  }

  async sendChatMessage(sessionId: string, message: string) {
    this.ensureApi();
    const response = await this.api.post(`/api/chat/sessions/${sessionId}/messages`, { message });
    return response.data;
  }

  async getAiStats() {
    this.ensureApi();
    const response = await this.api.get('/api/ai/stats');
    return response.data;
  }

  // Métodos para Bot Commands
  async getBotCommands(searchTerm = '', category = 'all') {
    this.ensureApi();
    const response = await this.api.get(`/api/bot/commands?search=${searchTerm}&category=${category}`);
    return response.data;
  }

  async getCommandCategories() {
    this.ensureApi();
    const response = await this.api.get('/api/bot/commands/categories');
    return response.data;
  }

  async getCommandStats() {
    this.ensureApi();
    const response = await this.api.get('/api/bot/commands/stats');
    return response.data;
  }

  async createBotCommand(command: any) {
    this.ensureApi();
    const response = await this.api.post('/api/bot/commands', command);
    return response.data;
  }

  async updateBotCommand(id: string, command: any) {
    this.ensureApi();
    const response = await this.api.put(`/api/bot/commands/${id}`, command);
    return response.data;
  }

  async deleteBotCommand(id: string) {
    this.ensureApi();
    const response = await this.api.delete(`/api/bot/commands/${id}`);
    return response.data;
  }

  async toggleBotCommand(id: string, enabled: boolean) {
    this.ensureApi();
    const response = await this.api.patch(`/api/bot/commands/${id}/toggle`, { enabled });
    return response.data;
  }

  async testBotCommand(command: string, testMessage: string) {
    this.ensureApi();
    const response = await this.api.post('/api/bot/commands/test', { command, testMessage });
    return response.data;
  }
}

export const apiService = new ApiService();

// Wrapper functions para mantener el contexto de 'this'
export const getBotStatus = () => apiService.getBotStatus();
export const getBotQR = () => apiService.getBotQR();
export const restartBot = () => apiService.restartBot();
export const getBotConfig = () => apiService.getBotConfig();
export const updateBotConfig = (config: any) => apiService.updateBotConfig(config);
export const getStats = () => apiService.getStats();
export const getUsuarioStats = () => apiService.getUsuarioStats();
export const getGroupStats = () => apiService.getGroupStats();
export const getAporteStats = () => apiService.getAporteStats();
export const getPedidoStats = () => apiService.getPedidoStats();
export const getProviders = () => apiService.getProviders();
export const getProviderStats = () => apiService.getProviderStats();
export const getMultimediaStats = () => apiService.getMultimediaStats();
export const getBotGlobalState = () => apiService.getBotGlobalState();
export const updateBotGlobalState = (state: any) => apiService.setBotGlobalState(state);

// Funciones adicionales que se usan en useQuery
export const getUsuarios = (page = 1, limit = 20, search?: string, estado?: string) => 
  apiService.getUsuarios(page, limit, search, estado);
export const getAportes = (page = 1, limit = 20, search?: string, estado?: string, fuente?: string) => 
  apiService.getAportes(page, limit, search, estado, fuente);
export const getPedidos = (page = 1, limit = 20, search?: string, estado?: string) => 
  apiService.getPedidos(page, limit, search, estado);
export const getGrupos = (page = 1, limit = 20, search?: string) => 
  apiService.getGroups(page, limit, search);
export const getLogs = (page = 1, limit = 50, level?: string) => 
  apiService.getLogs(page, limit, level);
export const getNotificaciones = (page = 1, limit = 20) => 
  apiService.getNotificaciones(page, limit);
export const getNotificationStats = () => 
  apiService.getNotificationStats();
export const getAnalytics = (timeRange?: string) => 
  apiService.getAnalytics(timeRange);
export const getSystemStats = () => 
  apiService.getSystemStats();

// ===== MÚSICA =====
export const searchMusic = async (query: string) => {
  return await apiService.searchMusic(query);
};

export const downloadMusic = async (request: { query: string; format: string; quality: string }) => {
  return await apiService.downloadMusic(request.query, request.format, request.quality);
};

export const getDownloadHistory = async () => {
  return await apiService.getMusicHistory();
};

export const getDownloadStats = async () => {
  return await apiService.getMusicStats();
};

export const getPopularSongs = async () => {
  return await apiService.getPopularSongs();
};

export const getMusicGenres = async () => {
  return await apiService.getMusicGenres();
};

// ===== COMANDOS DEL BOT =====
export const executeBotCommand = async (command: string, groupId?: string) => {
  return await apiService.executeBotCommand(command, groupId);
};

export const getBotCommandHelp = async (category?: string) => {
  return await apiService.getBotCommandHelp(category);
};

export const getBotCommandStats = async () => {
  return await apiService.getBotCommandStats();
};

export const getPopularBotCommands = async () => {
  return await apiService.getPopularBotCommands();
};

export const getBotCommandCategories = async () => {
  return await apiService.getBotCommandCategories();
};

export const testBotCommand = async (command: string, args: string[] = []) => {
  return await apiService.testBotCommandWithArgs(command, args);
};

// ===== NOTIFICACIONES =====
export const getUserNotifications = async (limit: number = 50) => {
  return await apiService.getNotificaciones(1, limit);
};

export const markNotificationAsRead = async (notificationId: string) => {
  return await apiService.markNotificationAsRead(parseInt(notificationId));
};

export const markAllNotificationsAsRead = async () => {
  return await apiService.markAllNotificationsAsRead();
};

export const deleteNotification = async (notificationId: string) => {
  return await apiService.deleteNotification(parseInt(notificationId));
};

export const createTestNotification = async (notification: {
  title: string;
  message: string;
  type?: string;
  category?: string;
}) => {
  return await apiService.createTestNotification(notification.message, notification.type || 'info');
};

export const getNotificationCategories = async () => {
  return await apiService.getNotificationCategories();
};

export const getNotificationTypes = async () => {
  return await apiService.getNotificationTypes();
};
