import React, { useState, useEffect } from 'react';
import {
  Building2,
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
  Phone,
  Mail,
  Globe,
  Users,
  Activity
} from 'lucide-react';

interface Proveedor {
  id: number;
  jid: string;
  nombre: string;
  descripcion: string;
  tipo: string;
  estado: 'activo' | 'inactivo' | 'suspendido';
  contacto: string;
  telefono?: string;
  email?: string;
  website?: string;
  fecha_registro: string;
  fecha_actualizacion?: string;
  total_aportes: number;
  total_pedidos: number;
  rating: number;
  grupo_id?: number;
  grupo_nombre?: string;
}

interface ProveedorStats {
  total: number;
  activos: number;
  inactivos: number;
  suspendidos: number;
  por_tipo: Array<{ tipo: string; count: number }>;
  top_proveedores: Array<{ nombre: string; aportes: number; pedidos: number }>;
}

const Proveedores: React.FC = () => {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [stats, setStats] = useState<ProveedorStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedProveedor, setSelectedProveedor] = useState<Proveedor | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProveedor, setNewProveedor] = useState<Partial<Proveedor>>({});

  useEffect(() => {
    loadProveedores();
    loadStats();
  }, []);

  const loadProveedores = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/proveedores', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setProveedores(data || []);
        setError(null);
      } else {
        setError('Error al cargar proveedores');
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
      const response = await fetch('/api/proveedores/stats', {
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

  const createProveedor = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/proveedores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newProveedor)
      });

      if (response.ok) {
        const createdProveedor = await response.json();
        setProveedores(prev => [createdProveedor, ...prev]);
        setSuccess('Proveedor creado correctamente');
        setShowCreateModal(false);
        setNewProveedor({});
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Error al crear proveedor');
      }
    } catch (err) {
      setError('Error de conexión');
    }
  };

  const updateProveedorStatus = async (jid: string, estado: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/proveedores/${jid}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ estado })
      });

      if (response.ok) {
        setProveedores(prev => prev.map(proveedor =>
          proveedor.jid === jid ? { ...proveedor, estado: estado as any } : proveedor
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

  const deleteProveedor = async (jid: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este proveedor?')) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/proveedores/${jid}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setProveedores(prev => prev.filter(proveedor => proveedor.jid !== jid));
        setSuccess('Proveedor eliminado correctamente');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Error al eliminar proveedor');
      }
    } catch (err) {
      setError('Error de conexión');
    }
  };

  const getStatusColor = (estado: string) => {
    switch (estado) {
      case 'activo': return 'bg-green-100 text-green-800 border-green-200';
      case 'inactivo': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'suspendido': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (estado: string) => {
    switch (estado) {
      case 'activo': return <CheckCircle className="w-4 h-4" />;
      case 'inactivo': return <Clock className="w-4 h-4" />;
      case 'suspendido': return <XCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getTypeColor = (tipo: string) => {
    switch (tipo) {
      case 'manhwa': return 'bg-teal-100 text-teal-800 border-teal-200';
      case 'manga': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'anime': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'novela': return 'bg-green-100 text-green-800 border-green-200';
      case 'general': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES');
  };

  const filteredProveedores = proveedores.filter(proveedor => {
    const matchesSearch = proveedor.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         proveedor.descripcion.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         proveedor.contacto.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || proveedor.tipo === typeFilter;
    const matchesStatus = statusFilter === 'all' || proveedor.estado === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  const handleViewProveedor = (proveedor: Proveedor) => {
    setSelectedProveedor(proveedor);
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
                <Building2 className="w-8 h-8 text-purple-600" />
                Gestión de Proveedores
              </h1>
              <p className="text-gray-600 mt-2">
                Administra los proveedores de contenido
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Nuevo Proveedor
              </button>
              <button
                onClick={loadProveedores}
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
                <Building2 className="w-8 h-8 text-purple-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Activos</p>
                  <p className="text-2xl font-bold text-green-600">{stats.activos}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Inactivos</p>
                  <p className="text-2xl font-bold text-gray-600">{stats.inactivos}</p>
                </div>
                <Clock className="w-8 h-8 text-gray-500" />
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Suspendidos</p>
                  <p className="text-2xl font-bold text-red-600">{stats.suspendidos}</p>
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
                  placeholder="Buscar proveedores..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="all">Todos los tipos</option>
                <option value="manhwa">Manhwa</option>
                <option value="manga">Manga</option>
                <option value="anime">Anime</option>
                <option value="novela">Novela</option>
                <option value="general">General</option>
              </select>
            </div>
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="all">Todos los estados</option>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
                <option value="suspendido">Suspendido</option>
              </select>
            </div>
          </div>
        </div>

        {/* Lista de Proveedores */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Lista de Proveedores</h2>
            <p className="text-gray-600 mt-1">
              {filteredProveedores.length} de {proveedores.length} proveedores
            </p>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-8 h-8 text-purple-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Cargando proveedores...</p>
            </div>
          ) : filteredProveedores.length === 0 ? (
            <div className="p-8 text-center">
              <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay proveedores</h3>
              <p className="text-gray-600">No se encontraron proveedores con los filtros aplicados</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredProveedores.map((proveedor) => (
                <div key={proveedor.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{proveedor.nombre}</h3>
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(proveedor.estado)}`}>
                          {getStatusIcon(proveedor.estado)}
                          {proveedor.estado.charAt(0).toUpperCase() + proveedor.estado.slice(1)}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getTypeColor(proveedor.tipo)}`}>
                          <Tag className="w-3 h-3" />
                          {proveedor.tipo.charAt(0).toUpperCase() + proveedor.tipo.slice(1)}
                        </span>
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-yellow-500" />
                          <span className="text-sm text-gray-600">{proveedor.rating.toFixed(1)}</span>
                        </div>
                      </div>

                      <p className="text-gray-600 mb-3 line-clamp-2">{proveedor.descripcion}</p>

                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          {proveedor.contacto}
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(proveedor.fecha_registro)}
                        </div>
                        <div className="flex items-center gap-1">
                          <Activity className="w-4 h-4" />
                          {proveedor.total_aportes} aportes
                        </div>
                        <div className="flex items-center gap-1">
                          <MessageSquare className="w-4 h-4" />
                          {proveedor.total_pedidos} pedidos
                        </div>
                        {proveedor.grupo_nombre && (
                          <div className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            {proveedor.grupo_nombre}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => handleViewProveedor(proveedor)}
                        className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Ver detalles"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {proveedor.estado === 'activo' && (
                        <button
                          onClick={() => updateProveedorStatus(proveedor.jid, 'suspendido')}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Suspender"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}

                      {proveedor.estado === 'suspendido' && (
                        <button
                          onClick={() => updateProveedorStatus(proveedor.jid, 'activo')}
                          className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Activar"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        onClick={() => deleteProveedor(proveedor.jid)}
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

        {/* Modal de Ver Proveedor */}
        {showViewModal && selectedProveedor && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {selectedProveedor.nombre}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Estado
                  </label>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(selectedProveedor.estado)}`}>
                    {getStatusIcon(selectedProveedor.estado)}
                    {selectedProveedor.estado.charAt(0).toUpperCase() + selectedProveedor.estado.slice(1)}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo
                  </label>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getTypeColor(selectedProveedor.tipo)}`}>
                    <Tag className="w-3 h-3" />
                    {selectedProveedor.tipo.charAt(0).toUpperCase() + selectedProveedor.tipo.slice(1)}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descripción
                  </label>
                  <p className="text-sm text-gray-900 bg-gray-100 p-3 rounded">{selectedProveedor.descripcion}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contacto
                  </label>
                  <p className="text-sm text-gray-900">{selectedProveedor.contacto}</p>
                </div>
                {selectedProveedor.telefono && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Teléfono
                    </label>
                    <p className="text-sm text-gray-900">{selectedProveedor.telefono}</p>
                  </div>
                )}
                {selectedProveedor.email && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <p className="text-sm text-gray-900">{selectedProveedor.email}</p>
                  </div>
                )}
                {selectedProveedor.website && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Website
                    </label>
                    <p className="text-sm text-gray-900">{selectedProveedor.website}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Total Aportes
                    </label>
                    <p className="text-sm text-gray-900">{selectedProveedor.total_aportes}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Total Pedidos
                    </label>
                    <p className="text-sm text-gray-900">{selectedProveedor.total_pedidos}</p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rating
                  </label>
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm text-gray-900">{selectedProveedor.rating.toFixed(1)}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de registro
                  </label>
                  <p className="text-sm text-gray-900">{formatDate(selectedProveedor.fecha_registro)}</p>
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

        {/* Modal de Crear Proveedor */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Crear Nuevo Proveedor
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={newProveedor.nombre || ''}
                    onChange={(e) => setNewProveedor(prev => ({ ...prev, nombre: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Nombre del proveedor"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Descripción
                  </label>
                  <textarea
                    value={newProveedor.descripcion || ''}
                    onChange={(e) => setNewProveedor(prev => ({ ...prev, descripcion: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    rows={3}
                    placeholder="Descripción del proveedor"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo
                  </label>
                  <select
                    value={newProveedor.tipo || ''}
                    onChange={(e) => setNewProveedor(prev => ({ ...prev, tipo: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="">Seleccionar tipo</option>
                    <option value="manhwa">Manhwa</option>
                    <option value="manga">Manga</option>
                    <option value="anime">Anime</option>
                    <option value="novela">Novela</option>
                    <option value="general">General</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contacto
                  </label>
                  <input
                    type="text"
                    value={newProveedor.contacto || ''}
                    onChange={(e) => setNewProveedor(prev => ({ ...prev, contacto: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Contacto del proveedor"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    JID (WhatsApp)
                  </label>
                  <input
                    type="text"
                    value={newProveedor.jid || ''}
                    onChange={(e) => setNewProveedor(prev => ({ ...prev, jid: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="jid@c.us"
                  />
                </div>
              </div>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={createProveedor}
                  className="flex-1 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Crear
                </button>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewProveedor({});
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

export default Proveedores;
