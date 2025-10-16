import React, { useState } from 'react';
import {
  Bot,
  User,
  Send,
  Settings,
  History,
  Trash2,
  Copy,
  Download,
  Upload,
  Brain,
  Lightbulb,
  HelpCircle,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Plus,
  Loader2,
  X,
  Save,
  Clock,
  MessageSquare,
  Sparkles
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiService } from '../services/api';
import dayjs from 'dayjs';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tokens_used?: number;
  model?: string;
}

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  last_message: string;
  message_count: number;
}

export const AiChat: React.FC = () => {
  const [currentMessage, setCurrentMessage] = useState('');
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const queryClient = useQueryClient();

  // Queries
  const { data: messages, isLoading: messagesLoading } = useQuery(
    ['chatMessages', selectedSession],
    () => apiService.getChatMessages(selectedSession || ''),
    {
      enabled: !!selectedSession,
      refetchInterval: 1000,
    }
  );

  const { data: sessions, isLoading: sessionsLoading } = useQuery(
    'chatSessions',
    apiService.getChatSessions
  );

  const { data: aiStats } = useQuery('aiStats', apiService.getAiStats);

  // Mutations
  const sendMessageMutation = useMutation(
    (message: string) => apiService.sendChatMessage(selectedSession || '', message),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['chatMessages', selectedSession]);
        queryClient.invalidateQueries('chatSessions');
        setCurrentMessage('');
        setIsTyping(false);
      },
      onError: (error: any) => {
        alert(`Error al enviar mensaje: ${error.response?.data?.message || 'Error desconocido'}`);
        setIsTyping(false);
      },
    }
  );

  const createSessionMutation = useMutation(
    (title: string) => apiService.createChatSession(title),
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries('chatSessions');
        setSelectedSession(data.id);
        alert('Nueva sesión creada exitosamente');
      },
      onError: (error: any) => {
        alert(`Error al crear sesión: ${error.response?.data?.message || 'Error desconocido'}`);
      },
    }
  );

  const deleteSessionMutation = useMutation(
    (sessionId: string) => apiService.deleteChatSession(sessionId),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('chatSessions');
        if (selectedSession === selectedSession) {
          setSelectedSession(null);
        }
        alert('Sesión eliminada exitosamente');
      },
      onError: (error: any) => {
        alert(`Error al eliminar sesión: ${error.response?.data?.message || 'Error desconocido'}`);
      },
    }
  );

  const handleSendMessage = () => {
    if (!currentMessage.trim() || !selectedSession) return;

    setIsTyping(true);
    sendMessageMutation.mutate(currentMessage);
  };

  const handleCreateSession = () => {
    const title = `Chat ${dayjs().format('DD/MM/YYYY HH:mm')}`;
    createSessionMutation.mutate(title);
  };

  const handleDeleteSession = (sessionId: string) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar esta sesión?')) {
      deleteSessionMutation.mutate(sessionId);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Texto copiado al portapapeles');
  };

  const chatMessages = messages || [];
  const chatSessions = sessions || [];

  if (messagesLoading || sessionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-500" />
          <h2 className="text-xl font-semibold">Cargando chat AI...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">AI Chat</h1>
          <p className="text-gray-600 mt-1">Conversa con la inteligencia artificial del bot</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsHistoryOpen(true)}
            className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <History className="w-4 h-4 mr-2" />
            Historial
          </button>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Settings className="w-4 h-4 mr-2" />
            Configuración
          </button>
          <button
            onClick={handleCreateSession}
            disabled={createSessionMutation.isLoading}
            className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {createSessionMutation.isLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            Nueva Sesión
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center space-x-8">
          <div className="flex items-center space-x-2">
            <Brain className="w-6 h-6 text-purple-500" />
            <div>
              <div className="text-sm font-medium text-gray-500">Sesiones Activas</div>
              <div className="text-2xl font-bold text-gray-900">{chatSessions.length}</div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Send className="w-6 h-6 text-blue-500" />
            <div>
              <div className="text-sm font-medium text-gray-500">Mensajes Enviados</div>
              <div className="text-2xl font-bold text-gray-900">{aiStats?.totalMessages || 0}</div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Settings className="w-6 h-6 text-green-500" />
            <div>
              <div className="text-sm font-medium text-gray-500">Tokens Usados</div>
              <div className="text-2xl font-bold text-gray-900">{aiStats?.totalTokens || 0}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Lista de Sesiones */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Sesiones de Chat</h3>
          {chatSessions.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
              <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No hay sesiones de chat</p>
            </div>
          ) : (
            <div className="space-y-2">
              {chatSessions.map((session) => (
                <div
                  key={session.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedSession === session.id
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                  }`}
                  onClick={() => setSelectedSession(session.id)}
                >
                  <div className="space-y-1">
                    <h4 className="font-semibold text-sm text-gray-900 truncate">
                      {session.title}
                    </h4>
                    <p className="text-xs text-gray-500">
                      {session.message_count} mensajes
                    </p>
                    <p className="text-xs text-gray-400">
                      {dayjs(session.last_message).format('DD/MM HH:mm')}
                    </p>
                  </div>
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSession(session.id);
                      }}
                      className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chat Principal */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {selectedSession ? `Sesión: ${chatSessions.find(s => s.id === selectedSession)?.title}` : 'Selecciona una sesión'}
          </h3>

          {!selectedSession ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
              <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Selecciona una sesión de chat para comenzar</p>
            </div>
          ) : (
            <div className="space-y-4 h-96 flex flex-col">
              {/* Mensajes */}
              <div className="flex-1 overflow-y-auto p-4 bg-gray-50 rounded-lg">
                {chatMessages.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No hay mensajes en esta sesión</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {chatMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${
                            message.role === 'user'
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-gray-900 border border-gray-200'
                          }`}
                        >
                          <div className="flex items-start space-x-2">
                            <div className={`p-1 rounded-full ${
                              message.role === 'user' ? 'bg-blue-500' : 'bg-purple-100'
                            }`}>
                              {message.role === 'user' ? (
                                <User className="w-4 h-4 text-white" />
                              ) : (
                                <Bot className="w-4 h-4 text-purple-600" />
                              )}
                            </div>
                            <div className="flex-1">
                              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                              <div className="flex items-center justify-between mt-2 text-xs opacity-70">
                                <span>{dayjs(message.timestamp).format('HH:mm')}</span>
                                <div className="flex items-center space-x-2">
                                  {message.tokens_used && (
                                    <span>{message.tokens_used} tokens</span>
                                  )}
                                  {message.model && (
                                    <span>• {message.model}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => copyToClipboard(message.content)}
                              className="p-1 hover:bg-black hover:bg-opacity-10 rounded transition-colors"
                              title="Copiar mensaje"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {isTyping && (
                      <div className="flex justify-start">
                        <div className="bg-white text-gray-900 border border-gray-200 px-4 py-3 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <div className="p-1 rounded-full bg-purple-100">
                              <Bot className="w-4 h-4 text-purple-600" />
                            </div>
                            <div className="flex items-center space-x-1">
                              <span className="text-sm">AI está escribiendo</span>
                              <Loader2 className="w-3 h-3 animate-spin" />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Input de mensaje */}
              <div className="flex items-end space-x-3">
                <div className="flex-1">
                  <textarea
                    value={currentMessage}
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Escribe tu mensaje aquí..."
                    rows={2}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                </div>
                <button
                  onClick={handleSendMessage}
                  disabled={!currentMessage.trim() || sendMessageMutation.isLoading}
                  className="flex items-center px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sendMessageMutation.isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Configuración */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Configuración de AI Chat</h3>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Modelo de IA</label>
                  <select className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                    <option value="gpt-4">GPT-4</option>
                    <option value="claude-3">Claude 3</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Temperatura</label>
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    defaultValue="0.7"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Máximo de tokens</label>
                  <input
                    type="number"
                    defaultValue="1000"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Modo creativo</span>
                  <button className="relative inline-flex h-6 w-11 items-center rounded-full bg-blue-600 transition-colors">
                    <span className="inline-block h-4 w-4 transform rounded-full bg-white translate-x-6 transition-transform" />
                  </button>
                </div>
              </div>

              <div className="flex justify-end mt-6 space-x-3">
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Historial */}
      {isHistoryOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Historial de Conversaciones</h3>
                <button
                  onClick={() => setIsHistoryOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {chatSessions.map((session) => (
                  <div
                    key={session.id}
                    className="p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => {
                      setSelectedSession(session.id);
                      setIsHistoryOpen(false);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <h4 className="font-semibold text-gray-900">{session.title}</h4>
                        <p className="text-sm text-gray-500">
                          {session.message_count} mensajes • {dayjs(session.created_at).format('DD/MM/YYYY HH:mm')}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-100 rounded-full">
                          {session.message_count}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSession(session.id);
                          }}
                          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end mt-6">
                <button
                  onClick={() => setIsHistoryOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AiChat;
