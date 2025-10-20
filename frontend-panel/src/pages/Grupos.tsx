import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  AlertCircle,
  Plus,
  User,
  Tag,
  MessageSquare,
  Settings,
} from 'lucide-react';

interface Grupo {
  id: number;
  nombre: string;
  descripcion: string;
  wa_jid: string;
  bot_enabled: boolean;
  es_proveedor: boolean;
  created_at: string;
  updated_at: string;
  usuario_id?: number;
  usuario?: { id: number; username: string } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const Grupos: React.FC = () => {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyBotEnabled, setShowOnlyBotEnabled] = useState(false);
  const [showOnlyProveedores, setShowOnlyProveedores] = useState(false);

  const loadGrupos = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pagination.limit),
        ...(searchTerm ? { search: searchTerm } : {}),
        ...(showOnlyBotEnabled ? { botEnabled: 'true' } : {}),
        ...(showOnlyProveedores ? { proveedor: 'true' } : {}),
      });
      const response = await fetch(`/api/grupos?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Error al cargar grupos');
      const data = await response.json();
      setGrupos(data.grupos);
      setPagination(data.pagination);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGrupos(1);
    // eslint-disable-next-line
  }, [searchTerm, showOnlyBotEnabled, showOnlyProveedores]);

  const getStatusColor = (enabled: boolean) =>
    enabled ? 'bg-green-100 text-green-800 border-green-200' : 'bg-gray-100 text-gray-800 border-gray-200';
  const getProveedorColor = (isProv: boolean) =>
    isProv ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-gray-100 text-gray-800 border-gray-200';
  const formatDate = (date: string) => new Date(date).toLocaleString('es-ES');

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Users className="w-8 h-8 text-blue-600" />
                Gestión de Grupos
              </h1>
              <p className="text-gray-600 mt-2">Visualiza y administra los grupos autorizados del bot</p>
            </div>
            <button
              onClick={() => loadGrupos(pagination.page)}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>
        </div>
        {/* Alertas */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-red-700">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}
        {/* Filtros */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6 flex flex-col md:flex-row gap-4 items-center">
          <div className="relative w-full md:w-1/2">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Buscar por nombre o JID..."
                  value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showOnlyBotEnabled}
              onChange={e => setShowOnlyBotEnabled(e.target.checked)}
              className="form-checkbox h-5 w-5 text-blue-600"
            />
            <span className="text-gray-700">Solo con bot activo</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showOnlyProveedores}
              onChange={e => setShowOnlyProveedores(e.target.checked)}
              className="form-checkbox h-5 w-5 text-blue-600"
            />
            <span className="text-gray-700">Solo proveedores</span>
          </label>
        </div>
        {/* Lista de Grupos */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Lista de Grupos</h2>
            <p className="text-gray-600 mt-1">{grupos.length} de {pagination.total} grupos</p>
          </div>
          {loading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Cargando grupos...</p>
            </div>
          ) : grupos.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay grupos</h3>
              <p className="text-gray-600">No se encontraron grupos con los filtros aplicados</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {grupos.map(grupo => (
                <div key={grupo.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{grupo.nombre}</h3>
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(grupo.bot_enabled)}`}>
                          {grupo.bot_enabled ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                          {grupo.bot_enabled ? 'Bot activo' : 'Bot inactivo'}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getProveedorColor(grupo.es_proveedor)}`}>
                          <Tag className="w-3 h-3" />
                          {grupo.es_proveedor ? 'Proveedor' : 'Normal'}
                        </span>
                      </div>
                      <p className="text-gray-600 mb-3 line-clamp-2">{grupo.descripcion}</p>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <MessageSquare className="w-4 h-4" />
                          {grupo.wa_jid}
                        </div>
                        <div className="flex items-center gap-1">
                          <Settings className="w-4 h-4" />
                          ID: {grupo.id}
                        </div>
                        <div className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          {grupo.usuario?.username || 'N/A'}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {formatDate(grupo.created_at)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => alert(JSON.stringify(grupo, null, 2))}
                        className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Ver detalles"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
            {/* Paginación */}
        <div className="flex justify-center items-center gap-4 mt-6">
          <button
            onClick={() => loadGrupos(Math.max(1, pagination.page - 1))}
            disabled={pagination.page === 1 || loading}
            className="px-4 py-2 bg-gray-200 rounded-lg disabled:opacity-50"
          >Anterior</button>
          <span>Página {pagination.page} de {pagination.totalPages}</span>
          <button
            onClick={() => loadGrupos(Math.min(pagination.totalPages, pagination.page + 1))}
            disabled={pagination.page === pagination.totalPages || loading}
            className="px-4 py-2 bg-gray-200 rounded-lg disabled:opacity-50"
          >Siguiente</button>
        </div>
      </div>
    </div>
  );
};

export default Grupos;
