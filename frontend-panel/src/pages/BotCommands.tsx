import React, { useState, useEffect } from 'react';
import {
  Bot,
  Search,
  Plus,
  Edit,
  Trash2,
  Play,
  Copy,
  Download,
  Upload,
  Terminal,
  Code,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  List,
  Filter,
  Settings,
  Eye,
  EyeOff,
  Clock,
  Users,
  BarChart3,
  HelpCircle,
  MessageSquare,
  Zap,
  Shield,
  Star,
  Tag
} from 'lucide-react';

interface BotCommand {
  id: string;
  command: string;
  description: string;
  response: string;
  category: string;
  enabled: boolean;
  usage_count: number;
  last_used?: string;
  created_at: string;
  updated_at: string;
  permissions: string[];
  aliases: string[];
}

interface CommandCategory {
  id: string;
  name: string;
  description: string;
  color: string;
  command_count: number;
}

const BotCommands: React.FC = () => {
  const [commands, setCommands] = useState<BotCommand[]>([]);
  const [categories, setCategories] = useState<CommandCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedCommand, setSelectedCommand] = useState<BotCommand | null>(null);
  const [showCommandModal, setShowCommandModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Cargar comandos al montar el componente
  useEffect(() => {
    loadCommands();
    loadCategories();
  }, []);

  const loadCommands = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/bot/commands');
      if (response.ok) {
        const data = await response.json();
        setCommands(data.commands || []);
        setError(null);
      } else {
        setError('Error al cargar comandos');
      }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await fetch('/api/bot/commands/categories');
      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error('Error cargando categorías:', err);
    }
  };

  const createCommand = async (commandData: Partial<BotCommand>) => {
    try {
      setActionLoading('create');
      setError(null);
      const response = await fetch('/api/bot/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(commandData)
      });

      if (response.ok) {
        setSuccess('Comando creado exitosamente');
        setShowCommandModal(false);
        await loadCommands();
      } else {
        setError('Error al crear comando');
      }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setActionLoading(null);
    }
  };

  const updateCommand = async (id: string, commandData: Partial<BotCommand>) => {
    try {
      setActionLoading('update');
      setError(null);
      const response = await fetch(`/api/bot/commands/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(commandData)
      });

      if (response.ok) {
        setSuccess('Comando actualizado exitosamente');
        setShowCommandModal(false);
        await loadCommands();
      } else {
        setError('Error al actualizar comando');
        }
      } catch (err) {
      setError('Error de conexión');
    } finally {
      setActionLoading(null);
    }
  };

  const deleteCommand = async (id: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este comando?')) return;

    try {
      setActionLoading(id);
      setError(null);
      const response = await fetch(`/api/bot/commands/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setSuccess('Comando eliminado exitosamente');
        await loadCommands();
      } else {
        setError('Error al eliminar comando');
      }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setActionLoading(null);
    }
  };

  const toggleCommand = async (id: string, enabled: boolean) => {
    try {
      setActionLoading(id);
      setError(null);
      const response = await fetch(`/api/bot/commands/${id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });

      if (response.ok) {
        setSuccess(`Comando ${enabled ? 'habilitado' : 'deshabilitado'} exitosamente`);
        await loadCommands();
      } else {
        setError('Error al cambiar estado del comando');
      }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setActionLoading(null);
    }
  };

  const testCommand = async (command: string, message: string) => {
    try {
      setActionLoading('test');
      setError(null);
      const response = await fetch('/api/bot/commands/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, message })
      });

      if (response.ok) {
        const data = await response.json();
        setTestResult(data.response);
        setSuccess('Comando probado exitosamente');
      } else {
        setError('Error al probar comando');
      }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setActionLoading(null);
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: { [key: string]: string } = {
      general: 'bg-blue-100 text-blue-800 border-blue-200',
      admin: 'bg-red-100 text-red-800 border-red-200',
      fun: 'bg-purple-100 text-purple-800 border-purple-200',
      utility: 'bg-green-100 text-green-800 border-green-200',
      info: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      subbot: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      media: 'bg-pink-100 text-pink-800 border-pink-200'
    };
    return colors[category] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getCategoryIcon = (category: string) => {
    const icons: { [key: string]: React.ReactNode } = {
      general: <HelpCircle className="w-4 h-4" />,
      admin: <Shield className="w-4 h-4" />,
      fun: <Zap className="w-4 h-4" />,
      utility: <Settings className="w-4 h-4" />,
      info: <MessageSquare className="w-4 h-4" />,
      subbot: <Bot className="w-4 h-4" />,
      media: <Upload className="w-4 h-4" />
    };
    return icons[category] || <Tag className="w-4 h-4" />;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-ES');
  };

  const getTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess('Copiado al portapapeles');
  };

  const filteredCommands = commands.filter((command) => {
    const matchesSearch = command.command.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         command.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || command.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const stats = {
    total: commands.length,
    active: commands.filter(c => c.enabled).length,
    todayUsage: commands.reduce((sum, c) => sum + c.usage_count, 0),
    categories: categories.length
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Bot className="w-8 h-8 text-blue-600" />
                Comandos del Bot
              </h1>
              <p className="text-gray-600 mt-2">
              Gestiona los comandos disponibles para el bot de WhatsApp
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={loadCommands}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </button>
              <button
                onClick={() => {
                  setSelectedCommand(null);
                  setIsEditing(false);
                  setShowCommandModal(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Nuevo Comando
              </button>
            </div>
          </div>
        </div>

        {/* Alertas */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <span className="text-red-700">{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="text-green-700">{success}</span>
            <button
              onClick={() => setSuccess(null)}
              className="ml-auto text-green-500 hover:text-green-700"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Estadísticas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Comandos</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              </div>
              <Terminal className="w-8 h-8 text-blue-500" />
            </div>
            <div className="mt-2 text-sm text-gray-600">
              Comandos registrados
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Activos</p>
                <p className="text-2xl font-bold text-green-600">{stats.active}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <div className="mt-2 text-sm text-gray-600">
              Comandos habilitados
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Usos Totales</p>
                <p className="text-2xl font-bold text-purple-600">{stats.todayUsage}</p>
              </div>
              <BarChart3 className="w-8 h-8 text-purple-500" />
            </div>
            <div className="mt-2 text-sm text-gray-600">
              Veces utilizados
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Categorías</p>
                <p className="text-2xl font-bold text-indigo-600">{stats.categories}</p>
              </div>
              <Tag className="w-8 h-8 text-indigo-500" />
            </div>
            <div className="mt-2 text-sm text-gray-600">
              Categorías disponibles
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Buscar comandos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">Todas las categorías</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Lista de Comandos */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Lista de Comandos</h2>
            <p className="text-gray-600 mt-1">
              {filteredCommands.length} comando{filteredCommands.length !== 1 ? 's' : ''} encontrado{filteredCommands.length !== 1 ? 's' : ''}
            </p>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Cargando comandos...</p>
            </div>
          ) : filteredCommands.length === 0 ? (
            <div className="p-8 text-center">
              <Terminal className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay comandos</h3>
              <p className="text-gray-600 mb-4">Crea tu primer comando para comenzar</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
                  {filteredCommands.map((command) => (
                <div key={command.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        {command.enabled ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                          <XCircle className="w-5 h-5 text-gray-400" />
                        )}
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${
                          command.enabled ? 'bg-green-100 text-green-800 border-green-200' : 'bg-gray-100 text-gray-800 border-gray-200'
                        }`}>
                          {command.enabled ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {getCategoryIcon(command.category)}
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getCategoryColor(command.category)}`}>
                          {command.category}
                        </span>
                      </div>

                      <div className="text-sm text-gray-900">
                        <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono">
                          {command.command}
                        </code>
                      </div>

                      <div className="text-sm text-gray-600 max-w-md">
                        {command.description}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <BarChart3 className="w-4 h-4" />
                          {command.usage_count} usos
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {command.last_used ? getTimeAgo(command.last_used) : 'Nunca'}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedCommand(command);
                            setTestMessage('');
                            setTestResult(null);
                            setShowTestModal(true);
                          }}
                          className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Probar comando"
                        >
                          <Play className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => {
                            setSelectedCommand(command);
                            setIsEditing(true);
                            setShowCommandModal(true);
                          }}
                          className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Editar comando"
                        >
                          <Edit className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => toggleCommand(command.id, !command.enabled)}
                          disabled={actionLoading === command.id}
                          className="p-2 text-gray-600 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors disabled:opacity-50"
                          title={command.enabled ? 'Deshabilitar' : 'Habilitar'}
                        >
                          {command.enabled ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>

                        <button
                          onClick={() => deleteCommand(command.id)}
                          disabled={actionLoading === command.id}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Eliminar comando"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {command.aliases.length > 0 && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs text-gray-500">Aliases:</span>
                      <div className="flex gap-1">
                        {command.aliases.map((alias, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                          >
                            {alias}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal para crear/editar comando */}
        {showCommandModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
            {isEditing ? 'Editar Comando' : 'Nuevo Comando'}
                </h3>
                <button
                  onClick={() => setShowCommandModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

            <CommandForm
              command={selectedCommand}
                onSubmit={isEditing ?
                  (data) => updateCommand(selectedCommand!.id, data) :
                  createCommand
                }
                isLoading={actionLoading === 'create' || actionLoading === 'update'}
                onCancel={() => setShowCommandModal(false)}
              />
            </div>
          </div>
        )}

        {/* Modal para probar comando */}
        {showTestModal && selectedCommand && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Probar Comando</h3>
                <button
                  onClick={() => setShowTestModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Comando
                  </label>
                  <code className="block p-2 bg-gray-100 rounded text-sm font-mono">
                    {selectedCommand.command}
                  </code>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Descripción
                  </label>
                  <p className="text-sm text-gray-600">
                    {selectedCommand.description}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mensaje de prueba
                  </label>
                  <textarea
                    placeholder="Escribe un mensaje de prueba..."
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                  />
                </div>

                {testResult && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Resultado
                    </label>
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm text-green-800">{testResult}</p>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowTestModal(false)}
                    className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
              Cancelar
                  </button>
                  <button
                    onClick={() => testCommand(selectedCommand.command, testMessage)}
                    disabled={actionLoading === 'test' || !testMessage.trim()}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {actionLoading === 'test' ? 'Probando...' : 'Probar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Componente de formulario para comandos
const CommandForm: React.FC<{
  command?: BotCommand | null;
  onSubmit: (data: Partial<BotCommand>) => void;
  isLoading: boolean;
  onCancel: () => void;
}> = ({ command, onSubmit, isLoading, onCancel }) => {
  const [formData, setFormData] = useState({
    command: command?.command || '',
    description: command?.description || '',
    response: command?.response || '',
    category: command?.category || 'general',
    enabled: command?.enabled ?? true,
    permissions: command?.permissions || [],
    aliases: command?.aliases || [],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Comando *
        </label>
        <input
          type="text"
            value={formData.command}
            onChange={(e) => setFormData({ ...formData, command: e.target.value })}
            placeholder="ej: /help"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Descripción *
        </label>
        <input
          type="text"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Descripción del comando"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Respuesta *
        </label>
        <textarea
            value={formData.response}
            onChange={(e) => setFormData({ ...formData, response: e.target.value })}
            placeholder="Respuesta del bot"
            rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Categoría
        </label>
        <select
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="general">General</option>
            <option value="admin">Administración</option>
            <option value="fun">Diversión</option>
            <option value="utility">Utilidades</option>
            <option value="info">Información</option>
          <option value="subbot">Subbots</option>
          <option value="media">Multimedia</option>
        </select>
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="enabled"
          checked={formData.enabled}
            onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
        <label htmlFor="enabled" className="ml-2 block text-sm text-gray-700">
          Habilitado
        </label>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </form>
  );
};

export default BotCommands;
