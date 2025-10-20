import React, { useState } from 'react';
import {
  BarChart3,
  Users,
  MessageSquare,
  FileText,
  Clock,
  Download,
  TrendingUp,
  TrendingDown,
  Activity,
  Eye,
  EyeOff,
  Calendar,
  Server,
  Database,
  Network,
  Smartphone,
  Desktop,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { useQuery } from 'react-query';
import { apiService, getUsuarioStats, getGroupStats, getAporteStats, getPedidoStats, getStats } from '../services/api';

interface AnalyticsData {
  overview: {
    totalUsers: number;
    totalGroups: number;
    totalAportes: number;
    totalPedidos: number;
    activeUsers: number;
    botUptime: string;
  };
  trends: {
    usersGrowth: number;
    groupsGrowth: number;
    aportesGrowth: number;
    pedidosGrowth: number;
  };
  engagement: {
    dailyActiveUsers: number;
    weeklyActiveUsers: number;
    monthlyActiveUsers: number;
    averageSessionTime: string;
    bounceRate: number;
  };
  performance: {
    responseTime: number;
    uptime: number;
    errorRate: number;
    throughput: number;
  };
  topContent: Array<{
    id: number;
    title: string;
    views: number;
    likes: number;
    shares: number;
    type: string;
  }>;
  userActivity: Array<{
    date: string;
    users: number;
    sessions: number;
    pageViews: number;
  }>;
}

export const Analytics: React.FC = () => {
  const [timeRange, setTimeRange] = useState('7d');
  const [activeTab, setActiveTab] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Queries
  const { data: analyticsData, isLoading, error } = useQuery(
    ['analytics', timeRange],
    () => apiService.getAnalytics(timeRange)
  );

  const { data: userStats } = useQuery('userStats', getUsuarioStats);
  const { data: groupStats } = useQuery('groupStats', getGroupStats);
  const { data: aporteStats } = useQuery('aporteStats', getAporteStats);
  const { data: pedidoStats } = useQuery('pedidoStats', getPedidoStats);
  const { data: generalStats } = useQuery('dashboardStats', getStats);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Simulate refresh
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const getGrowthColor = (growth: number) => {
    if (growth > 0) return 'text-green-500';
    if (growth < 0) return 'text-red-500';
    return 'text-gray-500';
  };

  const getGrowthIcon = (growth: number) => {
    if (growth > 0) return TrendingUp;
    if (growth < 0) return TrendingDown;
    return Activity;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatPercentage = (num: number) => {
    return `${num.toFixed(1)}%`;
  };

  const tabs = [
    { id: 0, name: 'Resumen', icon: BarChart3 },
    { id: 1, name: 'Usuarios', icon: Users },
    { id: 2, name: 'Contenido', icon: FileText },
    { id: 3, name: 'Rendimiento', icon: Server },
  ];

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <Activity className="w-5 h-5 text-red-500 mr-2" />
          <span className="text-red-700">
        Error al cargar analíticas: {(error as any).message}
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
          <h2 className="text-xl font-semibold">Cargando analíticas...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
        {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analíticas del Sistema</h1>
          <p className="text-gray-600 mt-1">Métricas y estadísticas detalladas del sistema</p>
        </div>
        <div className="flex items-center space-x-3">
          <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="1d">Último día</option>
              <option value="7d">Últimos 7 días</option>
              <option value="30d">Últimos 30 días</option>
              <option value="90d">Últimos 90 días</option>
          </select>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          <button className="flex items-center px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100">
            <Download className="w-4 h-4 mr-2" />
              Exportar
          </button>
        </div>
      </div>

        {/* Métricas Principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Usuarios Totales</p>
              <p className="text-2xl font-bold text-gray-900">{formatNumber(userStats?.totalUsuarios || 0)}</p>
              <p className="text-xs text-green-600 flex items-center">
                <TrendingUp className="w-3 h-3 mr-1" />
                  {analyticsData?.trends?.usersGrowth || 0}% vs período anterior
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <MessageSquare className="w-6 h-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Grupos Activos</p>
              <p className="text-2xl font-bold text-gray-900">{formatNumber(groupStats?.totalGrupos || 0)}</p>
              <p className="text-xs text-green-600 flex items-center">
                <TrendingUp className="w-3 h-3 mr-1" />
                  {analyticsData?.trends?.groupsGrowth || 0}% vs período anterior
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <FileText className="w-6 h-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Aportes</p>
              <p className="text-2xl font-bold text-gray-900">{formatNumber(aporteStats?.totalAportes || 0)}</p>
              <p className="text-xs text-green-600 flex items-center">
                <TrendingUp className="w-3 h-3 mr-1" />
                  {analyticsData?.trends?.aportesGrowth || 0}% vs período anterior
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Clock className="w-6 h-6 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Pedidos</p>
              <p className="text-2xl font-bold text-gray-900">{formatNumber(pedidoStats?.totalPedidos || 0)}</p>
              <p className="text-xs text-green-600 flex items-center">
                <TrendingUp className="w-3 h-3 mr-1" />
                  {analyticsData?.trends?.pedidosGrowth || 0}% vs período anterior
              </p>
            </div>
          </div>
        </div>
      </div>

        {/* Tabs de Análisis Detallado */}
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
                {/* Resumen General */}
          {activeTab === 0 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Resumen General</h2>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Engagement */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Engagement</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Usuarios Activos Diarios</span>
                      <span className="text-lg font-semibold text-gray-900">
                        {formatNumber(analyticsData?.engagement?.dailyActiveUsers || 0)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${Math.min((analyticsData?.engagement?.dailyActiveUsers || 0) / (userStats?.totalUsuarios || 1) * 100, 100)}%` }}
                      ></div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Usuarios Activos Semanales</span>
                      <span className="text-lg font-semibold text-gray-900">
                                {formatNumber(analyticsData?.engagement?.weeklyActiveUsers || 0)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full"
                        style={{ width: `${Math.min((analyticsData?.engagement?.weeklyActiveUsers || 0) / (userStats?.totalUsuarios || 1) * 100, 100)}%` }}
                      ></div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Usuarios Activos Mensuales</span>
                      <span className="text-lg font-semibold text-gray-900">
                                {formatNumber(analyticsData?.engagement?.monthlyActiveUsers || 0)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-purple-600 h-2 rounded-full"
                        style={{ width: `${Math.min((analyticsData?.engagement?.monthlyActiveUsers || 0) / (userStats?.totalUsuarios || 1) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                      {/* Tendencias */}
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Tendencias</h3>
                  <div className="space-y-4">
                    {analyticsData?.trends && Object.entries(analyticsData.trends).map(([key, value]) => {
                      const GrowthIcon = getGrowthIcon(value as number);
                      return (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600 capitalize">
                                  {key.replace('Growth', '')}
                          </span>
                          <div className="flex items-center">
                            <GrowthIcon className={`w-4 h-4 mr-2 ${getGrowthColor(value as number)}`} />
                            <span className={`text-sm font-semibold ${getGrowthColor(value as number)}`}>
                                    {(value as number) > 0 ? '+' : ''}{(value as number)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

                    {/* Top Content */}
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Contenido Más Popular</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Título</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vistas</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Me gusta</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Compartidos</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                            {analyticsData?.topContent?.slice(0, 5).map((content) => (
                        <tr key={content.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {content.title}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-100 rounded-full">
                                    {content.type}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatNumber(content.views)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatNumber(content.likes)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatNumber(content.shares)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

                {/* Análisis de Usuarios */}
          {activeTab === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Análisis de Usuarios</h2>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Distribución por Rol</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="px-2 py-1 text-xs font-medium text-red-600 bg-red-100 rounded-full mr-2">Admin</span>
                        <span className="text-sm text-gray-600">Administradores</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{userStats?.totalAdmins || 0}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-red-600 h-2 rounded-full"
                        style={{ width: `${(userStats?.totalAdmins || 0) / (userStats?.totalUsuarios || 1) * 100}%` }}
                      ></div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-100 rounded-full mr-2">Creador</span>
                        <span className="text-sm text-gray-600">Creadores</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{userStats?.totalCreadores || 0}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${(userStats?.totalCreadores || 0) / (userStats?.totalUsuarios || 1) * 100}%` }}
                      ></div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="px-2 py-1 text-xs font-medium text-green-600 bg-green-100 rounded-full mr-2">Moderador</span>
                        <span className="text-sm text-gray-600">Moderadores</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{userStats?.totalModeradores || 0}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full"
                        style={{ width: `${(userStats?.totalModeradores || 0) / (userStats?.totalUsuarios || 1) * 100}%` }}
                      ></div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-full mr-2">Usuario</span>
                        <span className="text-sm text-gray-600">Usuarios</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                                {(userStats?.totalUsuarios || 0) - (userStats?.totalAdmins || 0) - (userStats?.totalCreadores || 0) - (userStats?.totalModeradores || 0)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-gray-600 h-2 rounded-full"
                        style={{ width: `${((userStats?.totalUsuarios || 0) - (userStats?.totalAdmins || 0) - (userStats?.totalCreadores || 0) - (userStats?.totalModeradores || 0)) / (userStats?.totalUsuarios || 1) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Actividad de Usuarios</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Tiempo Promedio de Sesión</span>
                      <span className="text-sm font-semibold text-gray-900">
                                {analyticsData?.engagement?.averageSessionTime || '0m'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Tasa de Rebote</span>
                      <span className="text-sm font-semibold text-gray-900">
                                {formatPercentage(analyticsData?.engagement?.bounceRate || 0)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Usuarios Activos</span>
                      <span className="text-sm font-semibold text-gray-900">
                                {formatNumber(analyticsData?.overview?.activeUsers || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

                {/* Análisis de Contenido */}
          {activeTab === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Análisis de Contenido</h2>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Estados de Aportes</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="px-2 py-1 text-xs font-medium text-green-600 bg-green-100 rounded-full mr-2">Aprobados</span>
                        <span className="text-sm text-gray-600">Aportes aprobados</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{aporteStats?.aportesAprobados || 0}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full"
                        style={{ width: `${(aporteStats?.aportesAprobados || 0) / (aporteStats?.totalAportes || 1) * 100}%` }}
                      ></div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="px-2 py-1 text-xs font-medium text-yellow-600 bg-yellow-100 rounded-full mr-2">Pendientes</span>
                        <span className="text-sm text-gray-600">En revisión</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{aporteStats?.aportesPendientes || 0}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-yellow-600 h-2 rounded-full"
                        style={{ width: `${(aporteStats?.aportesPendientes || 0) / (aporteStats?.totalAportes || 1) * 100}%` }}
                      ></div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="px-2 py-1 text-xs font-medium text-red-600 bg-red-100 rounded-full mr-2">Rechazados</span>
                        <span className="text-sm text-gray-600">Aportes rechazados</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{aporteStats?.aportesRechazados || 0}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-red-600 h-2 rounded-full"
                        style={{ width: `${(aporteStats?.aportesRechazados || 0) / (aporteStats?.totalAportes || 1) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Estados de Pedidos</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="px-2 py-1 text-xs font-medium text-green-600 bg-green-100 rounded-full mr-2">Completados</span>
                        <span className="text-sm text-gray-600">Pedidos finalizados</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{pedidoStats?.pedidosCompletados || 0}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full"
                        style={{ width: `${(pedidoStats?.pedidosCompletados || 0) / (pedidoStats?.totalPedidos || 1) * 100}%` }}
                      ></div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="px-2 py-1 text-xs font-medium text-yellow-600 bg-yellow-100 rounded-full mr-2">Pendientes</span>
                        <span className="text-sm text-gray-600">En espera</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{pedidoStats?.pedidosPendientes || 0}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-yellow-600 h-2 rounded-full"
                        style={{ width: `${(pedidoStats?.pedidosPendientes || 0) / (pedidoStats?.totalPedidos || 1) * 100}%` }}
                      ></div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <span className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-100 rounded-full mr-2">En Proceso</span>
                        <span className="text-sm text-gray-600">En desarrollo</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{pedidoStats?.pedidosEnProceso || 0}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${(pedidoStats?.pedidosEnProceso || 0) / (pedidoStats?.totalPedidos || 1) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Análisis de Rendimiento */}
          {activeTab === 3 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Análisis de Rendimiento</h2>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Métricas del Sistema</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Tiempo de Respuesta</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {analyticsData?.performance?.responseTime || 0}ms
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${analyticsData?.performance?.responseTime < 500 ? 'bg-green-600' : 'bg-orange-600'}`}
                        style={{ width: `${Math.min((analyticsData?.performance?.responseTime || 0) / 1000 * 100, 100)}%` }}
                      ></div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Uptime</span>
                      <span className="text-sm font-semibold text-gray-900">
                                {formatPercentage(analyticsData?.performance?.uptime || 0)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full"
                        style={{ width: `${analyticsData?.performance?.uptime || 0}%` }}
                      ></div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Tasa de Error</span>
                      <span className="text-sm font-semibold text-gray-900">
                                {formatPercentage(analyticsData?.performance?.errorRate || 0)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${analyticsData?.performance?.errorRate < 5 ? 'bg-green-600' : 'bg-red-600'}`}
                        style={{ width: `${analyticsData?.performance?.errorRate || 0}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Throughput</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Requests/min</span>
                      <span className="text-sm font-semibold text-gray-900">
                                {formatNumber(analyticsData?.performance?.throughput || 0)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${Math.min((analyticsData?.performance?.throughput || 0) / 1000 * 100, 100)}%` }}
                      ></div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Bot Uptime</span>
                      <span className="text-sm font-semibold text-gray-900">
                                {analyticsData?.overview?.botUptime || '0h 0m'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Grupos Autorizados</span>
                      <span className="text-sm font-semibold text-gray-900">
                                {groupStats?.gruposAutorizados || 0} / {groupStats?.totalGrupos || 0}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full"
                        style={{ width: `${(groupStats?.gruposAutorizados || 0) / (groupStats?.totalGrupos || 1) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analytics;
