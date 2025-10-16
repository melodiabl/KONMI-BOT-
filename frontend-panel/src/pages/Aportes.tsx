import React, { useState, useEffect } from 'react';
import {
  Star,
  Search,
  Plus,
  Edit,
  Trash2,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  User,
  FileText,
  Link,
  Download,
  Share,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  AlertCircle,
  Filter,
  Calendar,
  Tag
} from 'lucide-react';

interface Aporte {
  id: number;
  titulo: string;
  descripcion: string;
  contenido: string;
  tipo: string;
  fuente: string;
  estado: 'pendiente' | 'aprobado' | 'rechazado' | 'revisando';
  usuario: string;
  fecha_creacion: string;
  fecha_actualizacion?: string;
  grupo_id?: number;
  grupo_nombre?: string;
}

interface AporteStats {
  total: number;
  pendientes: number;
  aprobados: number;
  rechazados: number;
  por_tipo: Array<{ tipo: string; count: number }>;
  por_estado: Array<{ estado: string; count: number }>;
}

const Aportes: React.FC = () => {
  const [aportes, setAportes] = useState<Aporte[]>([]);
  const [stats, setStats] = useState<AporteStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedAporte, setSelectedAporte] = useState<Aporte | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAporte, setEditingAporte] = useState<Partial<Aporte>>({});

  useEffect(() => {
    loadAportes();
    loadStats();
  }, []);

  const loadAportes = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/aportes', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setAportes(data || []);
        setError(null);
      } else {
        setError('Error al cargar aportes');
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
      const response = await fetch('/api/aportes/stats', {
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

  const updateAporteStatus = async (id: number, estado: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/aportes/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ estado })
      });

      if (response.ok) {
        setAportes(prev => prev.map(aporte =>
          aporte.id === id ? { ...aporte, estado: estado as any } : aporte
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

  const deleteAporte = async (id: number) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este aporte?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/aportes/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setAportes(prev => prev.filter(aporte => aporte.id !== id));
        setSuccess('Aporte eliminado correctamente');
        setTimeout(() => setSuccess(null), 3000);
    } else {
        const errorData = await response.json();
        setError(errorData.error || 'Error al eliminar aporte');
      }
    } catch (err) {
      setError('Error de conexión');
    }
  };

  const getStatusColor = (estado: string) => {
    switch (estado) {
      case 'aprobado': return 'bg-green-100 text-green-800 border-green-200';
      case 'pendiente': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'rechazado': return 'bg-red-100 text-red-800 border-red-200';
      case 'revisando': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (estado: string) => {
    switch (estado) {
      case 'aprobado': return <CheckCircle className="w-4 h-4" />;
      case 'pendiente': return <Clock className="w-4 h-4" />;
      case 'rechazado': return <XCircle className="w-4 h-4" />;
      case 'revisando': return <Eye className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getTypeColor = (tipo: string) => {
    switch (tipo) {
      case 'manhwa': return 'bg-teal-100 text-teal-800 border-teal-200';
      case 'manga': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'anime': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'novela': return 'bg-green-100 text-green-800 border-green-200';
      case 'imagen': return 'bg-pink-100 text-pink-800 border-pink-200';
      case 'video': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES');
  };

  const filteredAportes = aportes.filter(aporte => {
    const matchesSearch = aporte.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         aporte.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         aporte.usuario.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || aporte.tipo === typeFilter;
    const matchesStatus = statusFilter === 'all' || aporte.estado === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  const handleViewAporte = (aporte: Aporte) => {
    setSelectedAporte(aporte);
    setShowViewModal(true);
  };

  const handleEditAporte = (aporte: Aporte) => {
    setEditingAporte(aporte);
    setShowEditModal(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Star className="w-8 h-8 text-yellow-600" />
                Sistema de Aportes
              </h1>
              <p className="text-gray-600 mt-2">
                Gestiona los aportes de la comunidad
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
            Nuevo Aporte
              </button>
              <button
                onClick={loadAportes}
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                </div>
                <Star className="w-8 h-8 text-yellow-500" />
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
                  <p className="text-sm font-medium text-gray-600">Aprobados</p>
                  <p className="text-2xl font-bold text-green-600">{stats.aprobados}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Rechazados</p>
                  <p className="text-2xl font-bold text-red-600">{stats.rechazados}</p>
                </div>
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Buscar aportes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              >
                <option value="all">Todos los tipos</option>
                <option value="manhwa">Manhwa</option>
                <option value="manga">Manga</option>
                <option value="anime">Anime</option>
                <option value="novela">Novela</option>
                <option value="imagen">Imagen</option>
                <option value="video">Video</option>
              </select>
            </div>
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              >
                <option value="all">Todos los estados</option>
                <option value="pendiente">Pendiente</option>
                <option value="aprobado">Aprobado</option>
                <option value="rechazado">Rechazado</option>
                <option value="revisando">Revisando</option>
              </select>
            </div>
          </div>
        </div>

        {/* Lista de Aportes */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Lista de Aportes</h2>
            <p className="text-gray-600 mt-1">
              {filteredAportes.length} de {aportes.length} aportes
            </p>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-8 h-8 text-yellow-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Cargando aportes...</p>
            </div>
          ) : filteredAportes.length === 0 ? (
            <div className="p-8 text-center">
              <Star className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay aportes</h3>
              <p className="text-gray-600">No se encontraron aportes con los filtros aplicados</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredAportes.map((aporte) => (
                <div key={aporte.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{aporte.titulo}</h3>
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(aporte.estado)}`}>
                          {getStatusIcon(aporte.estado)}
                          {aporte.estado.charAt(0).toUpperCase() + aporte.estado.slice(1)}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getTypeColor(aporte.tipo)}`}>
                          <Tag className="w-3 h-3" />
                          {aporte.tipo.charAt(0).toUpperCase() + aporte.tipo.slice(1)}
                        </span>
                      </div>

                      <p className="text-gray-600 mb-3 line-clamp-2">{aporte.descripcion}</p>

                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          {aporte.usuario}
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(aporte.fecha_creacion)}
                        </div>
                        {aporte.grupo_nombre && (
                          <div className="flex items-center gap-1">
                            <FileText className="w-4 h-4" />
                            {aporte.grupo_nombre}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => handleViewAporte(aporte)}
                        className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Ver detalles"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleEditAporte(aporte)}
                        className="p-2 text-gray-600 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Edit className="w-4 h-4" />
                      </button>

                      {aporte.estado === 'pendiente' && (
                        <>
                          <button
                            onClick={() => updateAporteStatus(aporte.id, 'aprobado')}
                            className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Aprobar"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => updateAporteStatus(aporte.id, 'rechazado')}
                            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Rechazar"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                                  </>
                                )}

                      <button
                        onClick={() => deleteAporte(aporte.id)}
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

        {/* Modal de Ver Aporte */}
        {showViewModal && selectedAporte && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {selectedAporte.titulo}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Estado
                  </label>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(selectedAporte.estado)}`}>
                    {getStatusIcon(selectedAporte.estado)}
                    {selectedAporte.estado.charAt(0).toUpperCase() + selectedAporte.estado.slice(1)}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo
                  </label>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getTypeColor(selectedAporte.tipo)}`}>
                    <Tag className="w-3 h-3" />
                    {selectedAporte.tipo.charAt(0).toUpperCase() + selectedAporte.tipo.slice(1)}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descripción
                  </label>
                  <p className="text-sm text-gray-900 bg-gray-100 p-3 rounded">{selectedAporte.descripcion}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contenido
                  </label>
                  <p className="text-sm text-gray-900 bg-gray-100 p-3 rounded whitespace-pre-wrap">{selectedAporte.contenido}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fuente
                  </label>
                  <p className="text-sm text-gray-900">{selectedAporte.fuente}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Usuario
                  </label>
                  <p className="text-sm text-gray-900">{selectedAporte.usuario}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de creación
                  </label>
                  <p className="text-sm text-gray-900">{formatDate(selectedAporte.fecha_creacion)}</p>
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
      </div>
    </div>
  );
};

export default Aportes;







