import React, { useState, useEffect } from 'react';
import {
  Search,
  Bell,
  Check,
  X,
  Eye,
  MoreVertical,
  Mail,
  MailOpen,
  AlertTriangle,
  Info,
  CheckCircle,
  Clock,
  User,
  Settings,
  Filter,
  Download,
  Trash2,
  Loader2,
  RefreshCw,
  X as XIcon
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiService } from '../services/api';
import { RUNTIME_CONFIG } from '../config/runtime-config';

interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  category: string;
  read: boolean;
  user_id?: number | null;
  created_at: string;
  updated_at: string;
  metadata?: any;
  user_name?: string | null;
}

const typeColors = {
  info: 'blue',
  success: 'green',
  warning: 'orange',
  error: 'red',
  system: 'purple',
};

const typeIcons = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertTriangle,
  system: Settings,
};

const categoryColors = {
  system: 'purple',
  user: 'blue',
  content: 'green',
  security: 'red',
  general: 'gray',
};

export const Notificaciones: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [readFilter, setReadFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);

  const queryClient = useQueryClient();

  // Queries
  const { data: notificationsData, isLoading, error } = useQuery(
    ['notifications', currentPage, searchTerm, typeFilter, categoryFilter, readFilter],
    () => apiService.getNotificaciones(currentPage, 20, {
      search: searchTerm,
      type: typeFilter,
      category: categoryFilter,
      read: readFilter,
    })
  );

  const { data: stats } = useQuery('notificationStats', () => apiService.getNotificationStats());
  const { data: categoriesData } = useQuery('notificationCategories', () => apiService.getNotificationCategories());
  const { data: typesData } = useQuery('notificationTypes', () => apiService.getNotificationTypes());

  // Mutations
  const markAsReadMutation = useMutation(
    (id: number) => apiService.markAsRead(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('notifications');
        queryClient.invalidateQueries('notificationStats');
        queryClient.invalidateQueries('notificationCategories');
        queryClient.invalidateQueries('notificationTypes');
        alert('Notificación marcada como leída');
      },
      onError: (error: any) => {
        alert(`Error al marcar como leída: ${error.response?.data?.message || 'Error desconocido'}`);
      },
    }
  );

  const markAllAsReadMutation = useMutation(
    () => apiService.markAllAsRead(),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('notifications');
        queryClient.invalidateQueries('notificationStats');
        queryClient.invalidateQueries('notificationCategories');
        queryClient.invalidateQueries('notificationTypes');
        alert('Todas las notificaciones marcadas como leídas');
      },
      onError: (error: any) => {
        alert(`Error al marcar todas como leídas: ${error.response?.data?.message || 'Error desconocido'}`);
      },
    }
  );

  const deleteNotificationMutation = useMutation(
    (id: number) => apiService.deleteNotification(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('notifications');
        queryClient.invalidateQueries('notificationStats');
        queryClient.invalidateQueries('notificationCategories');
        queryClient.invalidateQueries('notificationTypes');
        alert('Notificación eliminada');
      },
      onError: (error: any) => {
        alert(`Error al eliminar notificación: ${error.response?.data?.message || 'Error desconocido'}`);
      },
    }
  );

  const handleMarkAsRead = (id: number) => {
    markAsReadMutation.mutate(id);
  };

  const handleMarkAllAsRead = () => {
    if (window.confirm('¿Marcar todas las notificaciones como leídas?')) {
      markAllAsReadMutation.mutate();
    }
  };

  const handleDelete = (id: number) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar esta notificación?')) {
      deleteNotificationMutation.mutate(id);
    }
  };

  const handleViewNotification = (notification: Notification) => {
    setSelectedNotification(notification);
    if (!notification.read) {
      handleMarkAsRead(notification.id);
    }
    setIsViewOpen(true);
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return 'Hace unos minutos';
    } else if (diffInHours < 24) {
      return `Hace ${Math.floor(diffInHours)} horas`;
    } else {
      return date.toLocaleDateString();
    }
  };

  // Real-time updates
  useEffect(() => {
    if (!RUNTIME_CONFIG.ENABLE_REAL_TIME) {
      return;
    }

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      return;
    }

    const baseUrl = RUNTIME_CONFIG.API_BASE_URL && RUNTIME_CONFIG.API_BASE_URL.trim().length > 0
      ? RUNTIME_CONFIG.API_BASE_URL
      : window.location.origin;

    let eventSource: EventSource | null = null;

    try {
      const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
      const url = new URL('api/notificaciones/stream', normalizedBase);
      url.searchParams.set('token', token);
      eventSource = new EventSource(url.toString());
    } catch (err) {
      console.error('No se pudo iniciar la sincronización en tiempo real de notificaciones', err);
      return;
    }

    eventSource.onmessage = (event) => {
      if (!event.data) return;
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'notificationChanged') {
          queryClient.invalidateQueries('notifications');
          queryClient.invalidateQueries('notificationStats');
          queryClient.invalidateQueries('notificationCategories');
          queryClient.invalidateQueries('notificationTypes');
        }
      } catch (error) {
        console.error('Error procesando actualización de notificaciones', error);
      }
    };

    eventSource.onerror = (err) => {
      console.error('Stream de notificaciones en tiempo real desconectado', err);
    };

    return () => {
      eventSource?.close();
    };
  }, [queryClient]);

  const totalNotifications = stats?.total || 0;
  const unreadNotifications = stats?.no_leidas || 0;
  const readNotifications = stats?.leidas || 0;
  const categoriesCount = stats?.totalCategories || (stats?.categories?.length || 0);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <AlertTriangle className="w-5 h-5 text-red-500 mr-2" />
          <span className="text-red-700">
            Error al cargar notificaciones: {(error as any).message}
          </span>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-500" />
          <h2 className="text-xl font-semibold">Cargando notificaciones...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Notificaciones</h1>
          <p className="text-gray-600 mt-1">Gestión y visualización de notificaciones del sistema</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleMarkAllAsRead}
            disabled={unreadNotifications === 0 || markAllAsReadMutation.isLoading}
            className="flex items-center px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4 mr-2" />
            {markAllAsReadMutation.isLoading ? 'Marcando...' : 'Marcar todas como leídas'}
          </button>
          <button className="flex items-center px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100">
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </button>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center space-x-8">
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">{totalNotifications}</div>
            <div className="text-sm font-medium text-gray-500">Total</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-red-600">{unreadNotifications}</div>
            <div className="text-sm font-medium text-gray-500">No leídas</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600">{readNotifications}</div>
            <div className="text-sm font-medium text-gray-500">Leídas</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-600">{categoriesCount}</div>
            <div className="text-sm font-medium text-gray-500">Categorías</div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center space-x-4">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar notificaciones..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">Todos los tipos</option>
            {(typesData?.types || stats?.types || ['info', 'success', 'warning', 'error', 'system']).map((typeOption: string) => (
              <option key={typeOption} value={typeOption}>{typeOption}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">Todas las categorías</option>
            {(categoriesData?.categories || stats?.categories || ['system', 'user', 'content', 'security', 'general']).map((categoryOption: string) => (
              <option key={categoryOption} value={categoryOption}>{categoryOption}</option>
            ))}
          </select>
          <select
            value={readFilter}
            onChange={(e) => setReadFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">Todas</option>
            <option value="unread">No leídas</option>
            <option value="read">Leídas</option>
          </select>
        </div>
      </div>

      {/* Tabla de Notificaciones */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Título</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoría</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {notificationsData?.notifications?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-8">
                      <Info className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-500">No se encontraron notificaciones.</p>
                    </div>
                  </td>
                </tr>
              )}
              {notificationsData?.notifications?.map((notification: Notification) => {
                const IconComponent = typeIcons[notification.type as keyof typeof typeIcons] || Bell;
                const typeColor = typeColors[notification.type as keyof typeof typeColors] || 'gray';
                const categoryColor = categoryColors[notification.category as keyof typeof categoryColors] || 'gray';

                return (
                  <tr
                    key={notification.id}
                    className={`hover:bg-gray-50 cursor-pointer ${
                      !notification.read ? `bg-${typeColor}-50` : ''
                    }`}
                    onClick={() => handleViewNotification(notification)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {notification.read ? (
                          <MailOpen className="w-4 h-4 text-gray-400" />
                        ) : (
                          <Mail className="w-4 h-4 text-blue-500" />
                        )}
                        {!notification.read && (
                          <div className={`ml-2 w-2 h-2 rounded-full bg-${typeColor}-500`}></div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <p className={`text-sm font-semibold ${!notification.read ? 'text-blue-600' : 'text-gray-900'}`}>
                          {notification.title}
                        </p>
                        <p className="text-sm text-gray-500 line-clamp-2">
                          {notification.message}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <IconComponent className={`w-4 h-4 text-${typeColor}-500 mr-2`} />
                        <span className={`px-2 py-1 text-xs font-medium text-${typeColor}-600 bg-${typeColor}-100 rounded-full`}>
                          {notification.type}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium text-${categoryColor}-600 bg-${categoryColor}-100 rounded-full`}>
                        {notification.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatTimestamp(notification.created_at)}</div>
                      <div className="text-xs text-gray-500">
                        {new Date(notification.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewNotification(notification);
                          }}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Ver detalles"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {!notification.read && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarkAsRead(notification.id);
                            }}
                            className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Marcar como leída"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(notification.id);
                          }}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {notificationsData?.pagination && (
          <div className="flex items-center justify-center px-6 py-4 border-t border-gray-200">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <span className="px-4 py-2 text-sm text-gray-700">
                Página {currentPage} de {notificationsData.pagination.totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === notificationsData.pagination.totalPages}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Detalles de Notificación */}
      {isViewOpen && selectedNotification && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center">
                  <div className={`p-2 bg-${typeColors[selectedNotification.type as keyof typeof typeColors]}-100 rounded-lg mr-3`}>
                    <IconComponent className={`w-6 h-6 text-${typeColors[selectedNotification.type as keyof typeof typeColors]}-600`} />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Detalles de la Notificación</h3>
                </div>
                <button
                  onClick={() => setIsViewOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-lg font-semibold text-gray-900">{selectedNotification.title}</h4>
                    <span className={`px-2 py-1 text-xs font-medium text-${typeColors[selectedNotification.type as keyof typeof typeColors]}-600 bg-${typeColors[selectedNotification.type as keyof typeof typeColors]}-100 rounded-full`}>
                      {selectedNotification.type}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {formatTimestamp(selectedNotification.created_at)} • {selectedNotification.category}
                  </p>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <h5 className="font-semibold text-gray-900 mb-2">Mensaje</h5>
                  <p className="text-gray-700">{selectedNotification.message}</p>
                </div>

                {selectedNotification.metadata && (
                  <div className="border-t border-gray-200 pt-4">
                    <h5 className="font-semibold text-gray-900 mb-2">Información Adicional</h5>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <pre className="text-sm text-gray-600 whitespace-pre-wrap">
                        {JSON.stringify(selectedNotification.metadata, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end mt-6 space-x-3">
                {!selectedNotification.read && (
                  <button
                    onClick={() => {
                      handleMarkAsRead(selectedNotification.id);
                      setIsViewOpen(false);
                    }}
                    className="flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Marcar como leída
                  </button>
                )}
                <button
                  onClick={() => setIsViewOpen(false)}
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

export default Notificaciones;
