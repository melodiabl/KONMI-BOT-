import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Plus,
  Edit,
  Trash2,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Calendar,
  Tag,
  MessageSquare,
  AlertCircle,
  RefreshCw,
  Filter,
  Star,
  ThumbsUp,
  ThumbsDown
} from 'lucide-react';

interface Pedido {
  id: number;
  titulo: string;
  descripcion: string;
  tipo: string;
  estado: 'pendiente' | 'en_proceso' | 'completado' | 'cancelado';
  usuario: string;
  fecha_creacion: string;
  fecha_actualizacion?: string;
  prioridad: 'baja' | 'media' | 'alta';
  votos: number;
  grupo_id?: number;
  grupo_nombre?: string;
}

interface PedidoStats {
  total: number;
  pendientes: number;
  en_proceso: number;
  completados: number;
  cancelados: number;
  por_tipo: Array<{ tipo: string; count: number }>;
  por_prioridad: Array<{ prioridad: string; count: number }>;
}

const Pedidos: React.FC = () => {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [stats, setStats] = useState<PedidoStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [selectedPedido, setSelectedPedido] = useState<Pedido | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPedido, setNewPedido] = useState<Partial<Pedido>>({});

  useEffect(() => {
    loadPedidos();
    loadStats();
  }, []);

  const loadPedidos = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/pedidos', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setPedidos(data || []);
        setError(null);
      } else {
        setError('Error al cargar pedidos');
      }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/pedidos/stats', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  const createPedido = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/pedidos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newPedido)
      });

      if (response.ok) {
        const createdPedido = await response.json();
        setPedidos(prev => [createdPedido, ...prev]);
        setSuccess('Pedido creado correctamente');
        setShowCreateModal(false);
        setNewPedido({});
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Error al crear pedido');
      }
    } catch (err) {
      setError('Error de conexión');
    }
  };

  const updatePedidoStatus = async (id: number, estado: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/pedidos/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ estado })
      });

      if (response.ok) {
        setPedidos(prev => prev.map(pedido =>
          pedido.id === id ? { ...pedido, estado: estado as any } : pedido
        ));
        setSuccess('Estado actualizado correctamente');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Error al actualizar estado');
      }
    } catch (err) {
      setError('Error de conexión');
    }
  };

  const deletePedido = async (id: number) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este pedido?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/pedidos/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setPedidos(prev => prev.filter(pedido => pedido.id !== id));
        setSuccess('Pedido eliminado correctamente');
        setTimeout(() => setSuccess(null), 3000);
    } else {
        const errorData = await response.json();
        setError(errorData.error || 'Error al eliminar pedido');
      }
    } catch (err) {
      setError('Error de conexión');
    }
  };

  const getStatusColor = (estado: string) => {
    switch (estado) {
      case 'completado': return 'bg-green-100 text-green-800 border-green-200';
      case 'en_proceso': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'pendiente': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'cancelado': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (estado: string) => {
    switch (estado) {
      case 'completado': return <CheckCircle className="w-4 h-4" />;
      case 'en_proceso': return <Clock className="w-4 h-4" />;
      case 'pendiente': return <Clock className="w-4 h-4" />;
      case 'cancelado': return <XCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getPriorityColor = (prioridad: string) => {
    switch (prioridad) {
      case 'alta': return 'bg-red-100 text-red-800 border-red-200';
      case 'media': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'baja': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTypeColor = (tipo: string) => {
    switch (tipo) {
      case 'manhwa': return 'bg-teal-100 text-teal-800 border-teal-200';
      case 'manga': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'anime': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'novela': return 'bg-green-100 text-green-800 border-green-200';
      case 'otro': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES');
  };

  const filteredPedidos = pedidos.filter(pedido => {
    const matchesSearch = pedido.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         pedido.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         pedido.usuario.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || pedido.tipo === typeFilter;
    const matchesStatus = statusFilter === 'all' || pedido.estado === statusFilter;
    const matchesPriority = priorityFilter === 'all' || pedido.prioridad === priorityFilter;
    return matchesSearch && matchesType && matchesStatus && matchesPriority;
  });

  const handleViewPedido = (pedido: Pedido) => {
    setSelectedPedido(pedido);
    setShowViewModal(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <FileText className="w-8 h-8 text-blue-600" />
                Sistema de Pedidos
              </h1>
              <p className="text-gray-600 mt-2">
                Gestiona los pedidos de la comunidad
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
            Nuevo Pedido
              </button>
              <button
                onClick={loadPedidos}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </button>
            </div>
          </div>
        </div>

        {/* Alertas */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500" />
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
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                </div>
                <FileText className="w-8 h-8 text-blue-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pendientes</p>
                  <p className="text-2xl font-bold text-yellow-600">{stats.pendientes}</p>
                </div>
                <Clock className="w-8 h-8 text-yellow-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">En Proceso</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.en_proceso}</p>
                </div>
                <Clock className="w-8 h-8 text-blue-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Completados</p>
                  <p className="text-2xl font-bold text-green-600">{stats.completados}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Cancelados</p>
                  <p className="text-2xl font-bold text-red-600">{stats.cancelados}</p>
                </div>
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Buscar pedidos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todos los tipos</option>
                <option value="manhwa">Manhwa</option>
                <option value="manga">Manga</option>
                <option value="anime">Anime</option>
                <option value="novela">Novela</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todos los estados</option>
                <option value="pendiente">Pendiente</option>
                <option value="en_proceso">En Proceso</option>
                <option value="completado">Completado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Todas las prioridades</option>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
          </div>
        </div>

        {/* Lista de Pedidos */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Lista de Pedidos</h2>
            <p className="text-gray-600 mt-1">
              {filteredPedidos.length} de {pedidos.length} pedidos
            </p>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Cargando pedidos...</p>
            </div>
          ) : filteredPedidos.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay pedidos</h3>
              <p className="text-gray-600">No se encontraron pedidos con los filtros aplicados</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredPedidos.map((pedido) => (
                <div key={pedido.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{pedido.titulo}</h3>
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(pedido.estado)}`}>
                          {getStatusIcon(pedido.estado)}
                          {pedido.estado.replace('_', ' ').charAt(0).toUpperCase() + pedido.estado.replace('_', ' ').slice(1)}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getTypeColor(pedido.tipo)}`}>
                          <Tag className="w-3 h-3" />
                          {pedido.tipo.charAt(0).toUpperCase() + pedido.tipo.slice(1)}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getPriorityColor(pedido.prioridad)}`}>
                          <Star className="w-3 h-3" />
                          {pedido.prioridad.charAt(0).toUpperCase() + pedido.prioridad.slice(1)}
                        </span>
                      </div>

                      <p className="text-gray-600 mb-3 line-clamp-2">{pedido.descripcion}</p>

                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          {pedido.usuario}
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(pedido.fecha_creacion)}
                        </div>
                        <div className="flex items-center gap-1">
                          <ThumbsUp className="w-4 h-4" />
                          {pedido.votos} votos
                        </div>
                        {pedido.grupo_nombre && (
                          <div className="flex items-center gap-1">
                            <MessageSquare className="w-4 h-4" />
                            {pedido.grupo_nombre}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => handleViewPedido(pedido)}
                        className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Ver detalles"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {pedido.estado === 'pendiente' && (
                        <>
                          <button
                            onClick={() => updatePedidoStatus(pedido.id, 'en_proceso')}
                            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Marcar en proceso"
                          >
                            <Clock className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => updatePedidoStatus(pedido.id, 'completado')}
                            className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Marcar completado"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                                  </>
                                )}

                                {pedido.estado === 'en_proceso' && (
                        <button
                          onClick={() => updatePedidoStatus(pedido.id, 'completado')}
                          className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Marcar completado"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        onClick={() => deletePedido(pedido.id)}
                        className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal de Ver Pedido */}
        {showViewModal && selectedPedido && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {selectedPedido.titulo}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Estado
                  </label>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(selectedPedido.estado)}`}>
                    {getStatusIcon(selectedPedido.estado)}
                    {selectedPedido.estado.replace('_', ' ').charAt(0).toUpperCase() + selectedPedido.estado.replace('_', ' ').slice(1)}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo
                  </label>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getTypeColor(selectedPedido.tipo)}`}>
                    <Tag className="w-3 h-3" />
                    {selectedPedido.tipo.charAt(0).toUpperCase() + selectedPedido.tipo.slice(1)}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Prioridad
                  </label>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getPriorityColor(selectedPedido.prioridad)}`}>
                    <Star className="w-3 h-3" />
                    {selectedPedido.prioridad.charAt(0).toUpperCase() + selectedPedido.prioridad.slice(1)}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descripción
                  </label>
                  <p className="text-sm text-gray-900 bg-gray-100 p-3 rounded">{selectedPedido.descripcion}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Usuario
                  </label>
                  <p className="text-sm text-gray-900">{selectedPedido.usuario}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Votos
                  </label>
                  <p className="text-sm text-gray-900">{selectedPedido.votos}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de creación
                  </label>
                  <p className="text-sm text-gray-900">{formatDate(selectedPedido.fecha_creacion)}</p>
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowViewModal(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Crear Pedido */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Crear Nuevo Pedido
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Título
                  </label>
                  <input
                    type="text"
                    value={newPedido.titulo || ''}
                    onChange={(e) => setNewPedido(prev => ({ ...prev, titulo: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Título del pedido"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descripción
                  </label>
                  <textarea
                    value={newPedido.descripcion || ''}
                    onChange={(e) => setNewPedido(prev => ({ ...prev, descripcion: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                    placeholder="Descripción del pedido"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo
                  </label>
                  <select
                    value={newPedido.tipo || ''}
                    onChange={(e) => setNewPedido(prev => ({ ...prev, tipo: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Seleccionar tipo</option>
                    <option value="manhwa">Manhwa</option>
                    <option value="manga">Manga</option>
                    <option value="anime">Anime</option>
                    <option value="novela">Novela</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Prioridad
                  </label>
                  <select
                    value={newPedido.prioridad || ''}
                    onChange={(e) => setNewPedido(prev => ({ ...prev, prioridad: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Seleccionar prioridad</option>
                    <option value="baja">Baja</option>
                    <option value="media">Media</option>
                    <option value="alta">Alta</option>
                  </select>
                </div>
              </div>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={createPedido}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Crear
                </button>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewPedido({});
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 transition-colors"
                >
                Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Pedidos;







