import React, { useState, useEffect } from 'react';
import {
  Image,
  Video,
  Music,
  File,
  Plus,
  Edit,
  Trash2,
  Download,
  Eye,
  Share,
  Upload,
  Search,
  MoreVertical,
  Images,
  Mic,
  FileText,
  Loader2,
  RefreshCw,
  X,
  Check,
  AlertTriangle,
  Info
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiService } from '../services/api';
import { RUNTIME_CONFIG } from '../config/runtime-config';

interface MultimediaItem {
  id: number;
  name: string;
  description: string;
  type: 'image' | 'video' | 'audio' | 'document';
  format: string;
  size: number;
  url: string;
  thumbnail?: string;
  duration?: number;
  tags: string[];
  category: string;
  uploadedBy: string;
  uploadedAt: string;
  downloads: number;
  views: number;
}

interface MultimediaResponse {
  items: MultimediaItem[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface MultimediaStats {
  total: number;
  totalFiles: number;
  images: number;
  videos: number;
  audio: number;
  documents: number;
}

export const Multimedia: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedItem, setSelectedItem] = useState<MultimediaItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);

  const queryClient = useQueryClient();

  // Queries
  const { data: multimediaData, isLoading, error } = useQuery<MultimediaResponse>(
    ['multimedia', currentPage, searchTerm, typeFilter],
    () =>
      apiService.getMultimediaItems({
        page: currentPage,
        limit: 12,
        search: searchTerm,
        type: typeFilter === 'all' ? undefined : typeFilter,
      })
  );

  const { data: multimediaStats } = useQuery<MultimediaStats>('multimediaStats', apiService.getMultimediaStats);

  // Mutations
  const deleteMultimediaMutation = useMutation(
    (id: number) => apiService.deleteMultimedia(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('multimedia');
        queryClient.invalidateQueries('multimediaStats');
        alert('Archivo eliminado exitosamente');
      },
      onError: (error: any) => {
        alert(`Error al eliminar el archivo: ${error.response?.data?.message || 'Error desconocido'}`);
      },
    }
  );

  const uploadMultimediaMutation = useMutation(
    (file: File) => apiService.uploadMultimedia(file),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('multimedia');
        queryClient.invalidateQueries('multimediaStats');
      },
      onError: (error: any) => {
        alert(`Error al subir archivo: ${error.response?.data?.message || 'Error desconocido'}`);
      },
    }
  );

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'image': return Image;
      case 'video': return Video;
      case 'audio': return Music;
      case 'document': return File;
      default: return File;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'image': return 'blue';
      case 'video': return 'purple';
      case 'audio': return 'green';
      case 'document': return 'orange';
      default: return 'gray';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return null;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  const items = multimediaData?.items || [];
  const pagination = multimediaData?.pagination;

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
      const url = new URL('api/aportes/stream', normalizedBase);
      url.searchParams.set('token', token);
      eventSource = new EventSource(url.toString());
    } catch (err) {
      console.error('No se pudo iniciar la sincronización en tiempo real de multimedia', err);
      return;
    }

    eventSource.onmessage = (event) => {
      if (!event.data) return;
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'aporteChanged') {
          queryClient.invalidateQueries('multimedia');
          queryClient.invalidateQueries('multimediaStats');
        }
      } catch (error) {
        console.error('Error procesando actualización de multimedia', error);
      }
    };

    eventSource.onerror = (err) => {
      console.error('Stream de multimedia en tiempo real desconectado', err);
    };

    return () => {
      eventSource?.close();
    };
  }, [queryClient]);

  const handleDeleteItem = (id: number) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar este archivo?')) {
      deleteMultimediaMutation.mutate(id);
    }
  };

  const handleViewItem = (item: MultimediaItem) => {
    setSelectedItem(item);
    setIsViewOpen(true);
  };

  const handleDownload = (item: MultimediaItem) => {
    if (!item.url) {
      alert('Sin archivo disponible');
      return;
    }
    const link = document.createElement('a');
    link.href = item.url;
    link.download = item.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    alert(`Descargando ${item.name}`);
  };

  const handleFileUpload = async (files: FileList) => {
    if (!files.length) return;

    try {
      setUploading(true);
      let done = 0;
      for (const file of Array.from(files)) {
        await uploadMultimediaMutation.mutateAsync(file);
        done += 1;
        setUploadCount(done);
      }
      alert(`Archivos subidos: ${done} archivo(s) subidos`);
      setIsUploadOpen(false);
    } catch (err: any) {
      alert(`Error al subir: ${err?.response?.data?.error || err?.message}`);
    } finally {
      setUploading(false);
      setUploadCount(0);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleFileUpload(e.dataTransfer.files);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, typeFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-500" />
          <h2 className="text-xl font-semibold">Cargando multimedia...</h2>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <AlertTriangle className="w-5 h-5 text-red-500 mr-2" />
          <span className="text-red-700">
            Error al cargar multimedia: {(error as any).message}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gestión de Multimedia</h1>
          <p className="text-gray-600 mt-1">Administra archivos multimedia del sistema</p>
        </div>
        <button
          onClick={() => setIsUploadOpen(true)}
          className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          <Upload className="w-4 h-4 mr-2" />
          Subir Archivos
        </button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Images className="w-6 h-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Archivos</p>
              <p className="text-2xl font-bold text-gray-900">{multimediaStats?.totalFiles || 0}</p>
              <p className="text-xs text-gray-400 mt-1">Archivos en el sistema</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Video className="w-6 h-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Videos</p>
              <p className="text-2xl font-bold text-gray-900">{multimediaStats?.videos || 0}</p>
              <p className="text-xs text-gray-400 mt-1">Archivos de video</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <Image className="w-6 h-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Imágenes</p>
              <p className="text-2xl font-bold text-gray-900">{multimediaStats?.images || 0}</p>
              <p className="text-xs text-gray-400 mt-1">Archivos de imagen</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Mic className="w-6 h-6 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Audio</p>
              <p className="text-2xl font-bold text-gray-900">{multimediaStats?.audio || 0}</p>
              <p className="text-xs text-gray-400 mt-1">Archivos de audio</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="p-2 bg-teal-100 rounded-lg">
              <FileText className="w-6 h-6 text-teal-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Documentos</p>
              <p className="text-2xl font-bold text-gray-900">{multimediaStats?.documents || 0}</p>
              <p className="text-xs text-gray-400 mt-1">Archivos de documentos</p>
            </div>
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
                placeholder="Buscar archivos..."
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
            <option value="image">Imágenes</option>
            <option value="video">Videos</option>
            <option value="audio">Audio</option>
            <option value="document">Documentos</option>
          </select>
        </div>
      </div>

      {/* Galería de Multimedia */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {items.length === 0 && (
          <div className="col-span-full">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
              <Info className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No se encontraron archivos multimedia.</p>
            </div>
          </div>
        )}

        {items.map((item: MultimediaItem) => {
          const TypeIcon = getTypeIcon(item.type);
          const typeColor = getTypeColor(item.type);

          return (
            <div
              key={item.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
            >
              <div className="aspect-video bg-gray-100 relative">
                {item.type === 'image' ? (
                  <img
                    src={item.thumbnail || item.url}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    onClick={() => handleViewItem(item)}
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center bg-gray-100"
                    onClick={() => handleViewItem(item)}
                  >
                    <TypeIcon className={`w-12 h-12 text-${typeColor}-500`} />
                  </div>
                )}
                <div className="absolute top-2 right-2">
                  <span className={`px-2 py-1 text-xs font-medium text-${typeColor}-600 bg-${typeColor}-100 rounded-full`}>
                    {item.format.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="p-4">
                <h3 className="font-semibold text-gray-900 truncate mb-1">{item.name}</h3>
                <p className="text-sm text-gray-500 line-clamp-2 mb-3">{item.description}</p>

                <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
                  <span>{formatFileSize(item.size)}</span>
                  <span>{item.views} vistas</span>
                </div>

                <div className="flex flex-wrap gap-1 mb-3">
                  {item.tags.slice(0, 2).map((tag, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-100 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                  {item.tags.length > 2 && (
                    <span className="px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-full">
                      +{item.tags.length - 2}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
                  <span>{item.uploadedBy}</span>
                  <span>{new Date(item.uploadedAt).toLocaleDateString()}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleViewItem(item)}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Ver detalles"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDownload(item)}
                      className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="Descargar"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Paginación */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center space-x-2">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Anterior
          </button>
          <span className="px-4 py-2 text-sm text-gray-700">
            Página {pagination.page} de {pagination.totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, pagination.totalPages))}
            disabled={currentPage === pagination.totalPages}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Siguiente
          </button>
        </div>
      )}

      {/* Modal Subir Archivos */}
      {isUploadOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Subir Archivos Multimedia</h3>
                <button
                  onClick={() => setIsUploadOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-semibold text-gray-900 mb-2">
                  Arrastra archivos aquí o haz clic para seleccionar
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  Soporta imágenes, videos, audio y documentos
                </p>
                <input
                  type="file"
                  multiple
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
                  onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="inline-flex items-center px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer"
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  {uploading ? 'Subiendo...' : 'Seleccionar Archivos'}
                </label>
                {uploading && (
                  <p className="mt-3 text-sm text-gray-500">Subiendo... {uploadCount}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ver Detalles */}
      {isViewOpen && selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Detalles del Archivo</h3>
                <button
                  onClick={() => setIsViewOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <div className={`p-3 bg-${getTypeColor(selectedItem.type)}-100 rounded-lg`}>
                    <TypeIcon className={`w-8 h-8 text-${getTypeColor(selectedItem.type)}-600`} />
                  </div>
                  <div>
                    <h4 className="text-xl font-semibold text-gray-900">{selectedItem.name}</h4>
                    <span className={`px-2 py-1 text-xs font-medium text-${getTypeColor(selectedItem.type)}-600 bg-${getTypeColor(selectedItem.type)}-100 rounded-full`}>
                      {selectedItem.format.toUpperCase()}
                    </span>
                  </div>
                </div>

                <p className="text-gray-700">{selectedItem.description}</p>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h5 className="text-sm font-medium text-gray-500">Tamaño</h5>
                    <p className="text-lg font-semibold text-gray-900">{formatFileSize(selectedItem.size)}</p>
                  </div>
                  <div>
                    <h5 className="text-sm font-medium text-gray-500">Descargas</h5>
                    <p className="text-lg font-semibold text-gray-900">{selectedItem.downloads}</p>
                  </div>
                  <div>
                    <h5 className="text-sm font-medium text-gray-500">Vistas</h5>
                    <p className="text-lg font-semibold text-gray-900">{selectedItem.views}</p>
                  </div>
                  <div>
                    <h5 className="text-sm font-medium text-gray-500">Categoría</h5>
                    <p className="text-lg font-semibold text-gray-900">{selectedItem.category}</p>
                  </div>
                </div>

                <div className="text-sm text-gray-500">
                  <p>Subido por: {selectedItem.uploadedBy}</p>
                  <p>Fecha: {new Date(selectedItem.uploadedAt).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="flex justify-end mt-6 space-x-3">
                <button
                  onClick={() => setIsViewOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cerrar
                </button>
                <button
                  onClick={() => handleDownload(selectedItem)}
                  className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Descargar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Multimedia;
