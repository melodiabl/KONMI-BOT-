import React, { useState, useEffect } from 'react';
import {
  Plus,
  QrCode,
  Key,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Smartphone,
  Bot,
  AlertCircle,
  Eye,
  Download,
  Copy,
  Wifi,
  WifiOff
} from 'lucide-react';

interface Subbot {
  id: number;
  codigo: string;
  tipo: 'qr' | 'code';
  estado: 'activo' | 'inactivo' | 'error';
  usuario: string;
  fecha_creacion: string;
  numero?: string;
  qr_data?: string;
  isOnline?: boolean;
  phoneNumber?: string;
  pairingCode?: string;
}

const Subbots: React.FC = () => {
  const [subbots, setSubbots] = useState<Subbot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedSubbot, setSelectedSubbot] = useState<Subbot | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showPhoneModal, setShowPhoneModal] = useState(false);

  // Cargar subbots al montar el componente
  useEffect(() => {
    loadSubbots();

    // Actualizar estado cada 30 segundos
    const interval = setInterval(() => {
      getSubbotStatus();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const loadSubbots = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/subbots', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setSubbots(data || []);
      setError(null);
      } else {
        setError('Error al cargar subbots');
      }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const getSubbotStatus = async () => {
    try {
      const response = await fetch('/api/subbots/status');
      if (response.ok) {
        const data = await response.json();
        setSubbots(prev => prev.map(subbot => {
          const status = data.subbots.find((s: any) => s.subbotId === subbot.code);
          return {
            ...subbot,
            isOnline: status?.isOnline || false,
            status: status?.status || subbot.status
          };
        }));
      }
    } catch (err) {
      console.error('Error obteniendo estado de subbots:', err);
    }
  };

  const createQRSubbot = async () => {
    try {
      setActionLoading('qr');
      setError(null);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/subbots/qr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          usuario: 'admin' // TODO: Get from auth context
        })
      });

      if (response.ok) {
        const newSubbot = await response.json();
        setSubbots(prev => [newSubbot, ...prev]);
        setSuccess('Subbot QR creado correctamente');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Error al crear subbot QR');
      }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setActionLoading(null);
    }
  };

  const createCodeSubbot = async () => {
    if (!phoneNumber.trim()) {
      setError('Ingresa un número de teléfono válido');
      return;
    }

    try {
      setActionLoading('code');
      setError(null);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/subbots/code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          usuario: 'admin', // TODO: Get from auth context
          numero: phoneNumber.replace(/[^0-9]/g, '')
        })
      });

      if (response.ok) {
        const newSubbot = await response.json();
        setSubbots(prev => [newSubbot, ...prev]);
        setSuccess('Subbot CODE creado correctamente');
        setShowPhoneModal(false);
        setPhoneNumber('');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Error al crear subbot CODE');
      }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setActionLoading(null);
    }
  };

  const deleteSubbot = async (id: number) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este subbot?')) return;

    try {
      setActionLoading(`delete-${id}`);
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/subbots/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setSubbots(prev => prev.filter(s => s.id !== id));
        setSuccess('Subbot eliminado correctamente');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Error al eliminar subbot');
      }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setActionLoading(null);
    }
  };

  const viewQR = async (subbot: Subbot) => {
    try {
      if (subbot.qr_data) {
        // Generar QR desde qr_data
        const QRCode = await import('qrcode');
        const qrDataURL = await QRCode.toDataURL(subbot.qr_data, {
          width: 256,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
        setQrImage(qrDataURL);
        setSelectedSubbot(subbot);
        setShowQR(true);
      } else {
        // Fallback a backend
        const response = await fetch(`/api/subbots/${subbot.code}/qr`);
        if (response.ok) {
          const data = await response.json();
          setQrImage(`data:image/png;base64,${data.qr}`);
          setSelectedSubbot(subbot);
          setShowQR(true);
        } else {
          setError('QR no disponible para este subbot');
        }
      }
    } catch (err) {
      setError('Error obteniendo QR');
    }
  };

  const viewCode = (subbot: Subbot) => {
    setSelectedSubbot(subbot);
    setShowCode(true);
  };

  const getStatusIcon = (status: string, isOnline: boolean) => {
    if (isOnline) return <CheckCircle className="w-5 h-5 text-green-500" />;
    if (status === 'activo') return <Clock className="w-5 h-5 text-yellow-500" />;
    if (status === 'error') return <XCircle className="w-5 h-5 text-red-500" />;
    return <WifiOff className="w-5 h-5 text-gray-500" />;
  };

  const getStatusText = (status: string, isOnline: boolean) => {
    if (isOnline) return 'Conectado';
    if (status === 'activo') return 'Activo';
    if (status === 'inactivo') return 'Inactivo';
    if (status === 'error') return 'Error';
    return 'Desconectado';
  };

  const getStatusColor = (status: string, isOnline: boolean) => {
    if (isOnline) return 'bg-green-100 text-green-800 border-green-200';
    if (status === 'activo') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (status === 'inactivo') return 'bg-gray-100 text-gray-800 border-gray-200';
    if (status === 'error') return 'bg-red-100 text-red-800 border-red-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getTypeIcon = (type: string) => {
    return type === 'qr' ? <QrCode className="w-4 h-4" /> : <Key className="w-4 h-4" />;
  };

  const getTypeText = (type: string) => {
    return type === 'qr' ? 'QR Code' : 'Pairing Code';
  };

  const getTypeColor = (type: string) => {
    return type === 'qr' ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-green-100 text-green-800 border-green-200';
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

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Bot className="w-8 h-8 text-blue-600" />
                Gestión de Subbots
              </h1>
              <p className="text-gray-600 mt-2">
                Crea y gestiona subbots para conectar múltiples cuentas de WhatsApp
              </p>
            </div>
            <button
              onClick={loadSubbots}
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Subbots</p>
                <p className="text-2xl font-bold text-gray-900">{subbots.length}</p>
              </div>
              <Bot className="w-8 h-8 text-blue-500" />
            </div>
            <div className="mt-2 text-sm text-gray-600">
              {subbots.filter(s => s.type === 'qr').length} QR • {subbots.filter(s => s.type === 'code').length} Códigos
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Conectados</p>
                <p className="text-2xl font-bold text-green-600">
                  {subbots.filter(s => s.isOnline).length}
                </p>
              </div>
              <Wifi className="w-8 h-8 text-green-500" />
            </div>
            <div className="mt-2 text-sm text-gray-600">
              Activos ahora
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Esperando</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {subbots.filter(s => s.status === 'pending').length}
                </p>
              </div>
              <Clock className="w-8 h-8 text-yellow-500" />
            </div>
            <div className="mt-2 text-sm text-gray-600">
              Por conectar
            </div>
          </div>
        </div>

        {/* Botones de Acción */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Crear Nuevo Subbot</h2>
          <div className="flex gap-4">
            <button
              onClick={createQRSubbot}
              disabled={actionLoading === 'qr'}
              className="flex items-center gap-3 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <QrCode className="w-5 h-5" />
              <span className="font-medium">
                {actionLoading === 'qr' ? 'Creando...' : 'Crear QR Subbot'}
              </span>
            </button>
            <button
              onClick={() => setShowPhoneModal(true)}
              disabled={actionLoading === 'code'}
              className="flex items-center gap-3 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Key className="w-5 h-5" />
              <span className="font-medium">
                {actionLoading === 'code' ? 'Creando...' : 'Crear CODE Subbot'}
              </span>
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-3">
            • <strong>QR Subbot:</strong> Escanea el código QR con WhatsApp
            <br />
            • <strong>CODE Subbot:</strong> Usa el código de emparejamiento
          </p>
        </div>

        {/* Lista de Subbots */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Subbots Activos</h2>
            <p className="text-gray-600 mt-1">
              {subbots.length} subbot{subbots.length !== 1 ? 's' : ''} configurado{subbots.length !== 1 ? 's' : ''}
            </p>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Cargando subbots...</p>
            </div>
          ) : subbots.length === 0 ? (
            <div className="p-8 text-center">
              <Bot className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay subbots</h3>
              <p className="text-gray-600 mb-4">Crea tu primer subbot para comenzar</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {subbots.map((subbot) => (
                <div key={subbot.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(subbot.estado, subbot.isOnline || false)}
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(subbot.estado, subbot.isOnline || false)}`}>
                          {getStatusText(subbot.estado, subbot.isOnline || false)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {getTypeIcon(subbot.tipo)}
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getTypeColor(subbot.tipo)}`}>
                          {getTypeText(subbot.tipo)}
                        </span>
                      </div>

                      <div className="text-sm text-gray-600">
                        <span className="font-mono">{subbot.codigo}</span>
                      </div>

                      {subbot.numero && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <Smartphone className="w-4 h-4" />
                          <span className="text-sm">{subbot.numero}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right text-sm text-gray-500">
                        <div>Creado: {formatDate(subbot.fecha_creacion)}</div>
                        <div>Usuario: {subbot.usuario}</div>
                      </div>

                      <div className="flex gap-2">
                        {subbot.tipo === 'qr' && (
                          <button
                            onClick={() => viewQR(subbot)}
                            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Ver QR"
                          >
                            <QrCode className="w-4 h-4" />
                          </button>
                        )}

                        {subbot.tipo === 'code' && subbot.pairingCode && (
                          <button
                            onClick={() => viewCode(subbot)}
                            className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Ver Código"
                          >
                            <Key className="w-4 h-4" />
                          </button>
                        )}

                        <button
                            onClick={() => deleteSubbot(subbot.code)}
                          disabled={actionLoading === subbot.code}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Eliminar subbot"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal para número de teléfono */}
        {showPhoneModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Crear Subbot con Código</h3>
                <button
                  onClick={() => setShowPhoneModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Ingresa el número de WhatsApp (con código de país) para generar el código de emparejamiento.
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Número de WhatsApp
                  </label>
                  <input
                    type="tel"
                    placeholder="Ejemplo: 595974154768"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowPhoneModal(false)}
                    className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={createCodeSubbot}
                    disabled={actionLoading === 'code' || !phoneNumber.trim()}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {actionLoading === 'code' ? 'Creando...' : 'Crear Subbot'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal para mostrar QR */}
        {showQR && selectedSubbot && qrImage && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Código QR del Subbot</h3>
                <button
                  onClick={() => setShowQR(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              <div className="text-center">
                <img
                  src={qrImage}
                  alt="QR Code"
                  className="mx-auto mb-4 rounded-lg"
                />
                <p className="text-sm text-gray-600 mb-4">
                  Escanea este código con WhatsApp para conectar el subbot
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = qrImage;
                      link.download = `subbot-qr-${selectedSubbot.code}.png`;
                      link.click();
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Descargar QR
                  </button>
                  <button
                    onClick={() => copyToClipboard(selectedSubbot.qr_data || '')}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                    Copiar Datos
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal para mostrar código de emparejamiento */}
        {showCode && selectedSubbot?.pairingCode && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Código de Emparejamiento</h3>
                <button
                  onClick={() => setShowCode(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              <div className="text-center">
                <div className="bg-gray-100 rounded-lg p-4 mb-4">
                  <code className="text-2xl font-mono font-bold text-gray-900">
                    {selectedSubbot.pairingCode}
                  </code>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  Usa este código en WhatsApp para conectar el subbot
                </p>
                <button
                  onClick={() => copyToClipboard(selectedSubbot.pairingCode)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors mx-auto"
                >
                  <Copy className="w-4 h-4" />
                  Copiar Código
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Subbots;
