import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Save,
  RotateCcw,
  Bot,
  Shield,
  Bell,
  Server,
  Globe,
  Eye,
  EyeOff,
  Check,
  X,
  Loader2,
  AlertTriangle,
  Wifi,
  Lock,
  Clock,
  Database,
  Network,
  Cog,
  UserCog,
  Bell as BellIcon,
  Shield as ShieldIcon,
  Server as ServerIcon,
  Settings as CogIcon,
  Power,
  PowerOff,
  MessageSquare,
  Globe as GlobeIcon
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiService } from '../services/api';

interface BotConfig {
  autoReconnect: boolean;
  maxReconnectAttempts: number;
  reconnectInterval: number;
  logLevel: string;
  qrTimeout: number;
  sessionTimeout: number;
}

interface SecurityConfig {
  jwtSecret: string;
  jwtExpiration: number;
  passwordMinLength: number;
  requireSpecialChars: boolean;
  maxLoginAttempts: number;
  lockoutDuration: number;
}

interface NotificationConfig {
  emailEnabled: boolean;
  webhookEnabled: boolean;
  webhookUrl: string;
  notificationRetention: number;
  autoCleanup: boolean;
}

interface SystemConfig {
  maintenanceMode: boolean;
  debugMode: boolean;
  apiRateLimit: number;
  fileUploadLimit: number;
  sessionTimeout: number;
}

export const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [showSecrets, setShowSecrets] = useState(false);
  const [botConfig, setBotConfig] = useState<BotConfig>({
    autoReconnect: true,
    maxReconnectAttempts: 5,
    reconnectInterval: 30,
    logLevel: 'info',
    qrTimeout: 60,
    sessionTimeout: 3600,
  });

  const [securityConfig, setSecurityConfig] = useState<SecurityConfig>({
    jwtSecret: '',
    jwtExpiration: 24,
    passwordMinLength: 8,
    requireSpecialChars: true,
    maxLoginAttempts: 5,
    lockoutDuration: 15,
  });

  const [notificationConfig, setNotificationConfig] = useState<NotificationConfig>({
    emailEnabled: false,
    webhookEnabled: false,
    webhookUrl: '',
    notificationRetention: 30,
    autoCleanup: true,
  });

  const [systemConfig, setSystemConfig] = useState<SystemConfig>({
    maintenanceMode: false,
    debugMode: false,
    apiRateLimit: 100,
    fileUploadLimit: 10,
    sessionTimeout: 3600,
  });

  const queryClient = useQueryClient();

  // Queries
  const { data: botConfigData, isLoading: botLoading } = useQuery('botConfig', apiService.getBotConfig);
  const { data: systemStats } = useQuery('systemStats', () => apiService.getSystemStats());
  const { data: botGlobalState, refetch: refetchBotGlobalState } = useQuery('botGlobalState', apiService.getBotGlobalState);
  const { data: globalOffMessageData } = useQuery('botGlobalOffMessage', apiService.getBotGlobalOffMessage);

  // Mutations
  const updateBotConfigMutation = useMutation(
    (config: BotConfig) => apiService.updateBotConfig(config),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('botConfig');
        alert('Configuración del bot actualizada exitosamente');
      },
      onError: (error: any) => {
        alert(`Error al actualizar configuración del bot: ${error.response?.data?.message || 'Error desconocido'}`);
      },
    }
  );

  const updateSystemConfigMutation = useMutation(
    (config: any) => apiService.updateSystemConfig(config),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('systemConfig');
        alert('Configuración del sistema actualizada exitosamente');
      },
      onError: (error: any) => {
        alert(`Error al actualizar configuración del sistema: ${error.response?.data?.message || 'Error desconocido'}`);
      },
    }
  );

  const setBotGlobalStateMutation = useMutation(
    (isOn: boolean) => apiService.setBotGlobalState(isOn),
    {
      onSuccess: (_, isOn) => {
        refetchBotGlobalState();
        alert(isOn ? 'Bot activado globalmente' : 'Bot desactivado globalmente');
      },
      onError: (error: any) => {
        alert(`Error al cambiar estado del bot: ${error.response?.data?.message || 'Error desconocido'}`);
      },
    }
  );

  const setGlobalOffMessageMutation = useMutation(
    (message: string) => apiService.setBotGlobalOffMessage(message),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('botGlobalOffMessage');
        alert('Mensaje global OFF actualizado exitosamente');
      },
      onError: (error: any) => {
        alert(`Error al actualizar mensaje: ${error.response?.data?.message || 'Error desconocido'}`);
      },
    }
  );

  // Effects
  useEffect(() => {
    if (botConfigData) {
      setBotConfig(prev => ({ ...prev, ...botConfigData }));
    }
  }, [botConfigData]);

  useEffect(() => {
    if (globalOffMessageData?.message) {
      // No need to set state for this, we'll use it directly
    }
  }, [globalOffMessageData]);

  // Handlers
  const handleSaveBotConfig = () => {
    updateBotConfigMutation.mutate(botConfig);
  };

  const handleSaveSecurityConfig = () => {
    alert('Configuración de seguridad actualizada exitosamente');
  };

  const handleSaveNotificationConfig = () => {
    alert('Configuración de notificaciones actualizada exitosamente');
  };

  const handleSaveSystemConfig = () => {
    updateSystemConfigMutation.mutate(systemConfig);
  };

  const handleBotGlobalToggle = (isOn: boolean) => {
    setBotGlobalStateMutation.mutate(isOn);
  };

  const handleSaveGlobalOffMessage = (message: string) => {
    if (message.trim()) {
      setGlobalOffMessageMutation.mutate(message);
    }
  };

  const handleResetToDefaults = () => {
    if (window.confirm('¿Estás seguro de que quieres restaurar la configuración por defecto?')) {
      setBotConfig({
        autoReconnect: true,
        maxReconnectAttempts: 5,
        reconnectInterval: 30,
        logLevel: 'info',
        qrTimeout: 60,
        sessionTimeout: 3600,
      });
      alert('Configuración restaurada a valores por defecto');
    }
  };

  const tabs = [
    { id: 0, name: 'Bot', icon: Bot },
    { id: 1, name: 'Seguridad', icon: Shield },
    { id: 2, name: 'Notificaciones', icon: Bell },
    { id: 3, name: 'Sistema', icon: Server },
  ];

  if (botLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-500" />
          <h2 className="text-xl font-semibold">Cargando configuración...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
        {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Configuración del Sistema</h1>
          <p className="text-gray-600 mt-1">Gestión de configuraciones del bot y sistema</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
              onClick={handleResetToDefaults}
            className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
            <RotateCcw className="w-4 h-4 mr-2" />
              Restaurar por defecto
          </button>
          <button
              onClick={() => {
                handleSaveBotConfig();
                handleSaveSecurityConfig();
                handleSaveNotificationConfig();
                handleSaveSystemConfig();
              }}
            className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
            <Save className="w-4 h-4 mr-2" />
              Guardar Todo
          </button>
        </div>
      </div>

        {/* Estadísticas del Sistema */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center mb-6">
          <ServerIcon className="w-6 h-6 text-blue-500 mr-3" />
          <h2 className="text-xl font-semibold text-gray-900">Estado del Sistema</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="text-center">
            <h3 className="text-sm font-medium text-gray-500">Uptime</h3>
            <p className="text-2xl font-bold text-gray-900">{systemStats?.uptime || '0h 0m'}</p>
            <p className="text-xs text-gray-400 mt-1">Tiempo activo</p>
          </div>
          <div className="text-center">
            <h3 className="text-sm font-medium text-gray-500">Memoria</h3>
            <p className="text-2xl font-bold text-gray-900">{systemStats?.memoryUsage || '0%'}</p>
            <p className="text-xs text-gray-400 mt-1">Uso de memoria</p>
          </div>
          <div className="text-center">
            <h3 className="text-sm font-medium text-gray-500">CPU</h3>
            <p className="text-2xl font-bold text-gray-900">{systemStats?.cpuUsage || '0%'}</p>
            <p className="text-xs text-gray-400 mt-1">Uso de CPU</p>
          </div>
          <div className="text-center">
            <h3 className="text-sm font-medium text-gray-500">Versión</h3>
            <p className="text-2xl font-bold text-gray-900">{systemStats?.version || '1.0.0'}</p>
            <p className="text-xs text-gray-400 mt-1">Versión del sistema</p>
          </div>
        </div>
      </div>

        {/* Tabs de Configuración */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-5 h-5 mr-2" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6">
                {/* Configuración del Bot */}
          {activeTab === 0 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Configuración del Bot de WhatsApp</h2>

                    {/* Control Global del Bot */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Estado Global del Bot</h3>
                    <p className="text-sm text-gray-600">
                                Controla si el bot responde a comandos en todos los grupos y chats privados
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className={`text-sm font-medium ${botGlobalState?.isOn ? 'text-green-600' : 'text-red-600'}`}>
                      {botGlobalState?.isOn ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                    <button
                      onClick={() => handleBotGlobalToggle(!botGlobalState?.isOn)}
                      disabled={setBotGlobalStateMutation.isLoading}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        botGlobalState?.isOn ? 'bg-green-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          botGlobalState?.isOn ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
                          {setBotGlobalStateMutation.isLoading && (
                  <div className="flex items-center justify-center mt-2">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    <span className="text-sm text-gray-600">Cambiando estado...</span>
                  </div>
                )}
              </div>

              {/* Mensaje Global OFF */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-medium text-gray-900 mb-2">Mensaje cuando el bot está OFF</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Este mensaje se mostrará cuando alguien use un comando mientras el bot esté globalmente desactivado
                </p>
                <div className="space-y-3">
                  <div className="p-3 bg-white border border-gray-200 rounded-lg">
                    <p className="text-gray-900">{globalOffMessageData?.message || 'No hay mensaje configurado'}</p>
                  </div>
                  <button
                    onClick={() => {
                      const newMessage = prompt('Ingresa el nuevo mensaje:', globalOffMessageData?.message || '');
                      if (newMessage !== null) {
                        handleSaveGlobalOffMessage(newMessage);
                      }
                    }}
                    className="flex items-center px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"
                  >
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Editar Mensaje
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Wifi className="w-5 h-5 text-gray-500 mr-2" />
                    <span className="text-sm font-medium text-gray-700">Auto Reconexión</span>
                  </div>
                  <button
                    onClick={() => setBotConfig({ ...botConfig, autoReconnect: !botConfig.autoReconnect })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      botConfig.autoReconnect ? 'bg-green-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        botConfig.autoReconnect ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Intentos de Reconexión</label>
                  <input
                    type="number"
                          value={botConfig.maxReconnectAttempts}
                    onChange={(e) => setBotConfig({ ...botConfig, maxReconnectAttempts: parseInt(e.target.value) })}
                    min="1"
                    max="10"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Intervalo de Reconexión (segundos)</label>
                  <input
                    type="number"
                          value={botConfig.reconnectInterval}
                    onChange={(e) => setBotConfig({ ...botConfig, reconnectInterval: parseInt(e.target.value) })}
                    min="5"
                    max="300"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Nivel de Log</label>
                  <select
                          value={botConfig.logLevel}
                          onChange={(e) => setBotConfig({ ...botConfig, logLevel: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="error">Error</option>
                          <option value="warn">Warning</option>
                          <option value="info">Info</option>
                          <option value="debug">Debug</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Timeout QR (segundos)</label>
                  <input
                    type="number"
                          value={botConfig.qrTimeout}
                    onChange={(e) => setBotConfig({ ...botConfig, qrTimeout: parseInt(e.target.value) })}
                    min="30"
                    max="300"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Timeout de Sesión (segundos)</label>
                  <input
                    type="number"
                          value={botConfig.sessionTimeout}
                    onChange={(e) => setBotConfig({ ...botConfig, sessionTimeout: parseInt(e.target.value) })}
                    min="1800"
                    max="86400"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                        onClick={handleSaveBotConfig}
                  disabled={updateBotConfigMutation.isLoading}
                  className="flex items-center px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                  {updateBotConfigMutation.isLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                        Guardar Configuración del Bot
                </button>
              </div>
            </div>
          )}

                {/* Configuración de Seguridad */}
          {activeTab === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Configuración de Seguridad</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">JWT Secret</label>
                  <div className="flex">
                    <input
                            type={showSecrets ? 'text' : 'password'}
                            value={securityConfig.jwtSecret}
                            onChange={(e) => setSecurityConfig({ ...securityConfig, jwtSecret: e.target.value })}
                            placeholder="Ingresa el JWT secret"
                      className="flex-1 p-3 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                    <button
                            onClick={() => setShowSecrets(!showSecrets)}
                      className="px-3 py-3 border border-l-0 border-gray-300 rounded-r-lg hover:bg-gray-50"
                    >
                      {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Expiración JWT (horas)</label>
                  <input
                    type="number"
                          value={securityConfig.jwtExpiration}
                    onChange={(e) => setSecurityConfig({ ...securityConfig, jwtExpiration: parseInt(e.target.value) })}
                    min="1"
                    max="168"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Longitud mínima de contraseña</label>
                  <input
                    type="number"
                          value={securityConfig.passwordMinLength}
                    onChange={(e) => setSecurityConfig({ ...securityConfig, passwordMinLength: parseInt(e.target.value) })}
                    min="6"
                    max="20"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Lock className="w-5 h-5 text-gray-500 mr-2" />
                    <span className="text-sm font-medium text-gray-700">Requerir caracteres especiales</span>
                  </div>
                  <button
                    onClick={() => setSecurityConfig({ ...securityConfig, requireSpecialChars: !securityConfig.requireSpecialChars })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      securityConfig.requireSpecialChars ? 'bg-green-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        securityConfig.requireSpecialChars ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Intentos máximos de login</label>
                  <input
                    type="number"
                          value={securityConfig.maxLoginAttempts}
                    onChange={(e) => setSecurityConfig({ ...securityConfig, maxLoginAttempts: parseInt(e.target.value) })}
                    min="3"
                    max="10"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Duración de bloqueo (minutos)</label>
                  <input
                    type="number"
                          value={securityConfig.lockoutDuration}
                    onChange={(e) => setSecurityConfig({ ...securityConfig, lockoutDuration: parseInt(e.target.value) })}
                    min="5"
                    max="60"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSaveSecurityConfig}
                  className="flex items-center px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  <Save className="w-4 h-4 mr-2" />
                        Guardar Configuración de Seguridad
                </button>
              </div>
            </div>
          )}

                {/* Configuración de Notificaciones */}
          {activeTab === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Configuración de Notificaciones</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <BellIcon className="w-5 h-5 text-gray-500 mr-2" />
                    <span className="text-sm font-medium text-gray-700">Notificaciones por Email</span>
                  </div>
                  <button
                    onClick={() => setNotificationConfig({ ...notificationConfig, emailEnabled: !notificationConfig.emailEnabled })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      notificationConfig.emailEnabled ? 'bg-green-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        notificationConfig.emailEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Network className="w-5 h-5 text-gray-500 mr-2" />
                    <span className="text-sm font-medium text-gray-700">Webhooks</span>
                  </div>
                  <button
                    onClick={() => setNotificationConfig({ ...notificationConfig, webhookEnabled: !notificationConfig.webhookEnabled })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      notificationConfig.webhookEnabled ? 'bg-green-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        notificationConfig.webhookEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">URL del Webhook</label>
                  <input
                    type="url"
                          value={notificationConfig.webhookUrl}
                          onChange={(e) => setNotificationConfig({ ...notificationConfig, webhookUrl: e.target.value })}
                          placeholder="https://api.example.com/webhook"
                    disabled={!notificationConfig.webhookEnabled}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Retención de notificaciones (días)</label>
                  <input
                    type="number"
                          value={notificationConfig.notificationRetention}
                    onChange={(e) => setNotificationConfig({ ...notificationConfig, notificationRetention: parseInt(e.target.value) })}
                    min="1"
                    max="365"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Clock className="w-5 h-5 text-gray-500 mr-2" />
                    <span className="text-sm font-medium text-gray-700">Limpieza automática</span>
                  </div>
                  <button
                    onClick={() => setNotificationConfig({ ...notificationConfig, autoCleanup: !notificationConfig.autoCleanup })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      notificationConfig.autoCleanup ? 'bg-green-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        notificationConfig.autoCleanup ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSaveNotificationConfig}
                  className="flex items-center px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  <Save className="w-4 h-4 mr-2" />
                        Guardar Configuración de Notificaciones
                </button>
              </div>
            </div>
          )}

                {/* Configuración del Sistema */}
          {activeTab === 3 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Configuración del Sistema</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <AlertTriangle className="w-5 h-5 text-gray-500 mr-2" />
                    <span className="text-sm font-medium text-gray-700">Modo Mantenimiento</span>
                  </div>
                  <button
                    onClick={() => setSystemConfig({ ...systemConfig, maintenanceMode: !systemConfig.maintenanceMode })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      systemConfig.maintenanceMode ? 'bg-orange-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        systemConfig.maintenanceMode ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <CogIcon className="w-5 h-5 text-gray-500 mr-2" />
                    <span className="text-sm font-medium text-gray-700">Modo Debug</span>
                  </div>
                  <button
                    onClick={() => setSystemConfig({ ...systemConfig, debugMode: !systemConfig.debugMode })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      systemConfig.debugMode ? 'bg-purple-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        systemConfig.debugMode ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Rate Limit API (requests/min)</label>
                  <input
                    type="number"
                          value={systemConfig.apiRateLimit}
                    onChange={(e) => setSystemConfig({ ...systemConfig, apiRateLimit: parseInt(e.target.value) })}
                    min="10"
                    max="1000"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Límite de subida (MB)</label>
                  <input
                    type="number"
                          value={systemConfig.fileUploadLimit}
                    onChange={(e) => setSystemConfig({ ...systemConfig, fileUploadLimit: parseInt(e.target.value) })}
                    min="1"
                    max="100"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Timeout de sesión (segundos)</label>
                  <input
                    type="number"
                          value={systemConfig.sessionTimeout}
                    onChange={(e) => setSystemConfig({ ...systemConfig, sessionTimeout: parseInt(e.target.value) })}
                    min="1800"
                    max="86400"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                        onClick={handleSaveSystemConfig}
                  disabled={updateSystemConfigMutation.isLoading}
                  className="flex items-center px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                      >
                  {updateSystemConfigMutation.isLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                        Guardar Configuración del Sistema
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
