import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Select,
  useToast,
  Spinner,
  Alert,
  AlertIcon,
  Flex,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Badge,
  Icon,
  useColorModeValue,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  FormControl,
  FormLabel,
  Textarea,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Switch,
  Avatar,
  Tooltip,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  IconButton,
  Progress,
  Divider,
  Image,
  Grid,
  GridItem,
  Checkbox,
  CheckboxGroup,
  Tag,
  TagLabel,
  TagCloseButton,
  Wrap,
  WrapItem,
  useColorMode,
} from '@chakra-ui/react';
import {
  FaUserTie,
  FaPlus,
  FaEdit,
  FaTrash,
  FaCheck,
  FaTimes,
  FaStar,
  FaClock,
  FaFileAlt,
  FaPhone,
  FaEnvelope,
  FaGlobe,
  FaMapMarkerAlt,
  FaEllipsisV,
  FaEye,
  FaDownload,
  FaUpload,
  FaShieldAlt,
  FaCheckCircle,
  FaExclamationTriangle,
  FaUserCheck,
  FaUserTimes,
  FaChartLine,
  FaMoneyBillWave,
  FaImage,
  FaVideo,
  FaMusic,
  FaFile,
  FaCamera,
  FaMicrophone,
  FaPaperclip,
  FaFolder,
  FaUsers,
  FaCog,
  FaSearch,
  FaPlay,
} from 'react-icons/fa';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiService } from '../services/api';
import dayjs from 'dayjs';

interface Provider {
  id: number;
  name: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  status: 'active' | 'inactive' | 'pending' | 'suspended';
  rating: number;
  totalAportes: number;
  totalPedidos: number;
  completedOrders: number;
  pendingOrders: number;
  averageResponseTime: number;
  specializations: string[];
  description: string;
  createdAt: string;
  updatedAt: string;
  lastActivity: string;
  paymentInfo: {
    method: string;
    account: string;
    verified: boolean;
  };
  grupos?: Array<{
    id: number;
    nombre: string;
    descripcion?: string;
  }>;
  media?: Array<{
    id: string;
    type: 'image' | 'video' | 'audio' | 'document';
    url: string;
    filename: string;
    size: number;
    uploadedAt: string;
  }>;
}

interface ProviderFormData {
  name: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  description: string;
  specializations: string[];
  paymentInfo: {
    method: string;
    account: string;
  };
  grupos: number[];
  media: File[];
}

interface Group {
  id: number;
  nombre: string;
  descripcion?: string;
  es_proveedor: boolean;
  autorizado: boolean;
}

// Tipos para contenido capturado
interface CapturedContent {
  id: number;
  grupo_id: number;
  usuario_id: number;
  tipo_contenido: 'texto' | 'imagen' | 'video' | 'audio' | 'documento';
  contenido: string;
  metadata: string;
  fecha_captura: string;
  estado: string;
  grupo?: { nombre: string };
  usuario?: { username: string };
}

const CONTENT_TYPES = [
  { value: 'texto', label: 'Texto' },
  { value: 'imagen', label: 'Imagen' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'documento', label: 'Documento' },
];

const CONTENT_STATES = [
  { value: '', label: 'Todos' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'aprobado', label: 'Aprobado' },
  { value: 'rechazado', label: 'Rechazado' },
];

// CSS personalizado para animaciones
const pulseAnimation = {
  animation: 'pulse 2s infinite'
};

export const Proveedores: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [formData, setFormData] = useState<ProviderFormData>({
    name: '',
    email: '',
    phone: '',
    website: '',
    address: '',
    description: '',
    specializations: [],
    paymentInfo: {
      method: 'paypal',
      account: '',
    },
    grupos: [],
    media: [],
  });

  const [specializationInput, setSpecializationInput] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estado para monitoreo/captura
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedContentTypes, setSelectedContentTypes] = useState<string[]>(['texto', 'imagen', 'video', 'audio', 'documento']);
  const [monitoring, setMonitoring] = useState(false);
  const [capturedContent, setCapturedContent] = useState<CapturedContent[]>([]);
  const [loadingCapture, setLoadingCapture] = useState(false);
  const [filterContentType, setFilterContentType] = useState<string>('');
  const [filterState, setFilterState] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [selectedCaptured, setSelectedCaptured] = useState<CapturedContent | null>(null);
  const { isOpen: isCapturedModalOpen, onOpen: onCapturedModalOpen, onClose: onCapturedModalClose } = useDisclosure();
  
  // Estado para notificaciones de nuevos contenidos
  const [lastContentCount, setLastContentCount] = useState(0);
  const [showNewContentAlert, setShowNewContentAlert] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  const { isOpen: isCreateOpen, onOpen: onCreateOpen, onClose: onCreateClose } = useDisclosure();
  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure();
  const { isOpen: isViewOpen, onOpen: onViewOpen, onClose: onViewClose } = useDisclosure();
  const { isOpen: isMediaOpen, onOpen: onMediaOpen, onClose: onMediaClose } = useDisclosure();

  const toast = useToast();
  const queryClient = useQueryClient();
  const { colorMode } = useColorMode();
  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Queries
  const { data: providers, isLoading } = useQuery('providers', apiService.getProviders);
  const { data: providerStats } = useQuery('providerStats', apiService.getProviderStats);
  const { data: groups, isLoading: loadingGroups } = useQuery('groups', () => apiService.getGroups(1, 100));

  // Mutations
  const createProviderMutation = useMutation(
    (data: ProviderFormData) => apiService.createProvider(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('providers');
        queryClient.invalidateQueries('providerStats');
        onCreateClose();
        resetForm();
        toast({
          title: 'Proveedor creado exitosamente',
          status: 'success',
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al crear el proveedor',
          status: 'error',
        });
      },
    }
  );

  const updateProviderMutation = useMutation(
    ({ id, data }: { id: number; data: Partial<ProviderFormData> }) => apiService.updateProvider(id, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('providers');
        queryClient.invalidateQueries('providerStats');
        onEditClose();
        toast({
          title: 'Proveedor actualizado exitosamente',
          status: 'success',
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al actualizar el proveedor',
          status: 'error',
        });
      },
    }
  );

  const deleteProviderMutation = useMutation(
    (id: number) => apiService.deleteProvider(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('providers');
        queryClient.invalidateQueries('providerStats');
        toast({
          title: 'Proveedor eliminado exitosamente',
          status: 'success',
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al eliminar el proveedor',
          status: 'error',
        });
      },
    }
  );

  const toggleProviderStatusMutation = useMutation(
    ({ id, status }: { id: number; status: string }) => apiService.toggleProviderStatus(id, status),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('providers');
        queryClient.invalidateQueries('providerStats');
        toast({
          title: 'Estado del proveedor actualizado',
          status: 'success',
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al actualizar el estado',
          status: 'error',
        });
      },
    }
  );

  // Función para verificar nuevos contenidos
  const checkForNewContent = async () => {
    if (!selectedGroupId && !selectedProvider) return;
    
    try {
      const res = await apiService.getCapturedContent({
        grupo_id: selectedGroupId || undefined,
        tipo_contenido: filterContentType || undefined,
        estado: filterState || undefined,
        page: 1,
        limit: 20
      });
      
      let data = res.data || [];
      // Filtrado adicional por fecha en frontend
      if (filterDateFrom) {
        data = data.filter((item: any) => dayjs(item.fecha_captura).isAfter(dayjs(filterDateFrom).subtract(1, 'day')));
      }
      if (filterDateTo) {
        data = data.filter((item: any) => dayjs(item.fecha_captura).isBefore(dayjs(filterDateTo).add(1, 'day')));
      }
      
      // Verificar si hay nuevos contenidos
      if (data.length > lastContentCount && lastContentCount > 0) {
        const newCount = data.length - lastContentCount;
        setShowNewContentAlert(true);
        toast({
          title: `¡Nuevo contenido capturado!`,
          description: `Se han detectado ${newCount} nuevo(s) contenido(s)`,
          status: 'info',
          duration: 5000,
          isClosable: true,
        });
      }
      
      setCapturedContent(data);
      setLastContentCount(data.length);
    } catch (error) {
      console.error('Error verificando nuevos contenidos:', error);
    }
  };

  // Cargar contenido capturado cuando cambia el grupo seleccionado
  useEffect(() => {
    if (selectedGroupId || selectedProvider) {
      setLoadingCapture(true);
      apiService.getCapturedContent({
        grupo_id: selectedGroupId || undefined,
        tipo_contenido: filterContentType || undefined,
        estado: filterState || undefined,
        page: 1,
        limit: 20
      }).then(res => {
        let data = res.data || [];
        // Filtrado adicional por fecha en frontend
        if (filterDateFrom) {
          data = data.filter((item: any) => dayjs(item.fecha_captura).isAfter(dayjs(filterDateFrom).subtract(1, 'day')));
        }
        if (filterDateTo) {
          data = data.filter((item: any) => dayjs(item.fecha_captura).isBefore(dayjs(filterDateTo).add(1, 'day')));
        }
        setCapturedContent(data);
        setLastContentCount(data.length);
      }).finally(() => setLoadingCapture(false));
    } else {
      setCapturedContent([]);
      setLastContentCount(0);
    }
  }, [selectedGroupId, selectedProvider, monitoring, filterContentType, filterState, filterDateFrom, filterDateTo]);

  // Sistema de polling para detectar nuevos contenidos
  useEffect(() => {
    if (monitoring && (selectedGroupId || selectedProvider)) {
      // Iniciar polling cada 15 segundos
      const interval = setInterval(() => {
        checkForNewContent();
      }, 15000);
      
      setPollingInterval(interval);
      
      return () => {
        if (interval) {
          clearInterval(interval);
          setPollingInterval(null);
        }
      };
    } else {
      // Detener polling si no hay monitoreo activo
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
    }
  }, [monitoring, selectedGroupId, selectedProvider]);

  // Limpiar polling al desmontar el componente
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, []);

  // Iniciar monitoreo
  const handleStartMonitoring = async () => {
    if (!selectedGroupId) return;
    setLoadingCapture(true);
    try {
      await apiService.startGroupMonitoring(selectedGroupId, selectedContentTypes);
      setMonitoring(true);
      toast({ title: 'Monitoreo iniciado', status: 'success' });
    } catch (e: any) {
      toast({ title: 'Error iniciando monitoreo', description: e?.response?.data?.message || e.message, status: 'error' });
    } finally {
      setLoadingCapture(false);
    }
  };

  // Detener monitoreo
  const handleStopMonitoring = async () => {
    if (!selectedGroupId) return;
    setLoadingCapture(true);
    try {
      await apiService.stopGroupMonitoring(selectedGroupId);
      setMonitoring(false);
      toast({ title: 'Monitoreo detenido', status: 'info' });
    } catch (e: any) {
      toast({ title: 'Error deteniendo monitoreo', description: e?.response?.data?.message || e.message, status: 'error' });
    } finally {
      setLoadingCapture(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      website: '',
      address: '',
      description: '',
      specializations: [],
      paymentInfo: {
        method: 'paypal',
        account: '',
      },
      grupos: [],
      media: [],
    });
    setSpecializationInput('');
    setUploadProgress(0);
  };

  const handleCreateProvider = () => {
    createProviderMutation.mutate(formData);
  };

  const handleUpdateProvider = () => {
    if (selectedProvider) {
      updateProviderMutation.mutate({
        id: selectedProvider.id,
        data: formData,
      });
    }
  };

  const handleDeleteProvider = (id: number) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar este proveedor?')) {
      deleteProviderMutation.mutate(id);
    }
  };

  const handleEditProvider = (provider: Provider) => {
    setSelectedProvider(provider);
    setFormData({
      name: provider.name,
      email: provider.email,
      phone: provider.phone,
      website: provider.website,
      address: provider.address,
      description: provider.description,
      specializations: provider.specializations || [],
      paymentInfo: provider.paymentInfo,
      grupos: provider.grupos?.map(g => g.id) || [],
      media: [],
    });
    onEditOpen();
  };

  const handleViewProvider = (provider: Provider) => {
    setSelectedProvider(provider);
    onViewOpen();
  };

  const handleAddSpecialization = () => {
    if (specializationInput.trim() && !formData.specializations.includes(specializationInput.trim())) {
      setFormData({
        ...formData,
        specializations: [...formData.specializations, specializationInput.trim()],
      });
      setSpecializationInput('');
    }
  };

  const handleRemoveSpecialization = (spec: string) => {
    setFormData({
      ...formData,
      specializations: formData.specializations.filter(s => s !== spec),
    });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setFormData({
      ...formData,
      media: [...formData.media, ...files],
    });
  };

  const handleRemoveMedia = (index: number) => {
    setFormData({
      ...formData,
      media: formData.media.filter((_, i) => i !== index),
    });
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return FaImage;
    if (file.type.startsWith('video/')) return FaVideo;
    if (file.type.startsWith('audio/')) return FaMusic;
    return FaFile;
  };

  const getFileType = (file: File) => {
    if (file.type.startsWith('image/')) return 'Imagen';
    if (file.type.startsWith('video/')) return 'Video';
    if (file.type.startsWith('audio/')) return 'Audio';
    return 'Documento';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const filteredProviders = providers?.filter(provider => {
    const matchesSearch = provider.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         provider.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || provider.status === statusFilter;
    return matchesSearch && matchesStatus;
  }) || [];

  const handleDeleteCaptured = async (id: number) => {
    if (!window.confirm('¿Seguro que deseas eliminar este contenido?')) return;
    setLoadingCapture(true);
    try {
      await apiService.deleteCapturedContent(id);
      setCapturedContent(prev => prev.filter(item => item.id !== id));
      toast({ title: 'Contenido eliminado', status: 'success' });
    } catch (e: any) {
      toast({ title: 'Error eliminando contenido', description: e?.response?.data?.message || e.message, status: 'error' });
    } finally {
      setLoadingCapture(false);
    }
  };

  const handleApproveCaptured = async (id: number) => {
    setLoadingCapture(true);
    try {
      // Suponiendo que hay un endpoint para actualizar estado (puedes ajustar la ruta si es diferente)
      // Por ahora solo actualizamos el estado local ya que no existe el endpoint
      setCapturedContent(prev => prev.map(item => item.id === id ? { ...item, estado: 'aprobado' } : item));
      toast({ title: 'Marcado como revisado', status: 'success' });
    } catch (e: any) {
      toast({ title: 'Error al marcar como revisado', description: e?.response?.data?.message || e.message, status: 'error' });
    } finally {
      setLoadingCapture(false);
    }
  };

  if (isLoading) {
    return (
      <Box textAlign="center" py={10}>
        <Spinner size="xl" />
        <Text mt={4}>Cargando proveedores...</Text>
      </Box>
    );
  }

  return (
    <Box>
      <VStack spacing={6} align="stretch">
        {/* Header */}
        <Flex align="center" justify="space-between">
          <Box>
            <Heading size="lg">Gestión de Proveedores</Heading>
            <Text color="gray.600" mt={1}>
              Administra proveedores, grupos y contenido multimedia
            </Text>
          </Box>
          <Button
            leftIcon={<FaPlus />}
            colorScheme="blue"
            onClick={onCreateOpen}
          >
            Nuevo Proveedor
          </Button>
        </Flex>

        {/* Estadísticas */}
        {providerStats && (
          <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={6}>
            <Stat>
              <StatLabel>Total Proveedores</StatLabel>
              <StatNumber>{providerStats.totalProviders || 0}</StatNumber>
              <StatHelpText>
                <Icon as={FaUserTie} mr={1} />
                Proveedores registrados
              </StatHelpText>
            </Stat>
            <Stat>
              <StatLabel>Activos</StatLabel>
              <StatNumber>{providerStats.activeProviders || 0}</StatNumber>
              <StatHelpText>
                <Icon as={FaCheckCircle} mr={1} />
                Proveedores activos
              </StatHelpText>
            </Stat>
            <Stat>
              <StatLabel>Total Aportes</StatLabel>
              <StatNumber>{providerStats.totalAportes || 0}</StatNumber>
              <StatHelpText>
                <Icon as={FaStar} mr={1} />
                Aportes realizados
              </StatHelpText>
            </Stat>
            <Stat>
              <StatLabel>Total Pedidos</StatLabel>
              <StatNumber>{providerStats.totalPedidos || 0}</StatNumber>
              <StatHelpText>
                <Icon as={FaFileAlt} mr={1} />
                Pedidos atendidos
              </StatHelpText>
            </Stat>
          </SimpleGrid>
        )}

        {/* Filtros */}
        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardBody>
            <HStack spacing={4}>
              <FormControl maxW="300px">
                <Input
                  placeholder="Buscar proveedores..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </FormControl>
              <FormControl maxW="200px">
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">Todos los estados</option>
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                  <option value="pending">Pendiente</option>
                  <option value="suspended">Suspendido</option>
                </Select>
              </FormControl>
            </HStack>
          </CardBody>
        </Card>

        {/* Lista de Proveedores */}
        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardHeader>
            <Heading size="md">Proveedores</Heading>
          </CardHeader>
          <CardBody>
            {filteredProviders.length === 0 ? (
              <Alert status="info">
                <AlertIcon />
                No se encontraron proveedores
              </Alert>
            ) : (
              <Table variant="simple">
                <Thead>
                  <Tr>
                    <Th>Proveedor</Th>
                    <Th>Contacto</Th>
                    <Th>Grupos</Th>
                    <Th>Estado</Th>
                    <Th>Rating</Th>
                    <Th>Acciones</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {filteredProviders.map((provider) => (
                    <Tr key={provider.id}>
                      <Td>
                        <HStack>
                          <Avatar size="sm" name={provider.name} />
                          <Box>
                            <Text fontWeight="bold">{provider.name}</Text>
                            <Text fontSize="sm" color="gray.500">
                              {provider.specializations?.join(', ') || 'Sin especializaciones'}
                            </Text>
                          </Box>
                        </HStack>
                      </Td>
                      <Td>
                        <VStack align="start" spacing={1}>
                          <Text fontSize="sm">
                            <Icon as={FaEnvelope} mr={2} />
                            {provider.email}
                          </Text>
                          <Text fontSize="sm">
                            <Icon as={FaPhone} mr={2} />
                            {provider.phone}
                          </Text>
                        </VStack>
                      </Td>
                      <Td>
                        <Wrap>
                          {provider.grupos?.slice(0, 2).map((grupo) => (
                            <WrapItem key={grupo.id}>
                              <Tag size="sm" colorScheme="blue">
                                <TagLabel>{grupo.nombre}</TagLabel>
                              </Tag>
                            </WrapItem>
                          ))}
                          {provider.grupos && provider.grupos.length > 2 && (
                            <WrapItem>
                              <Tag size="sm" colorScheme="gray">
                                <TagLabel>+{provider.grupos.length - 2}</TagLabel>
                              </Tag>
                            </WrapItem>
                          )}
                        </Wrap>
                      </Td>
                      <Td>
                        <Badge
                          colorScheme={
                            provider.status === 'active' ? 'green' :
                            provider.status === 'inactive' ? 'red' :
                            provider.status === 'pending' ? 'yellow' : 'gray'
                          }
                        >
                          {provider.status === 'active' ? 'Activo' :
                           provider.status === 'inactive' ? 'Inactivo' :
                           provider.status === 'pending' ? 'Pendiente' : 'Suspendido'}
                        </Badge>
                      </Td>
                      <Td>
                        <HStack>
                          <Icon as={FaStar} color="yellow.400" />
                          <Text>{provider.rating || 0}/5</Text>
                        </HStack>
                      </Td>
                      <Td>
                        <HStack spacing={2}>
                          <IconButton
                            aria-label="Ver proveedor"
                            icon={<FaEye />}
                            size="sm"
                            variant="ghost"
                            onClick={() => handleViewProvider(provider)}
                          />
                          <IconButton
                            aria-label="Editar proveedor"
                            icon={<FaEdit />}
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditProvider(provider)}
                          />
                          <IconButton
                            aria-label="Ver media"
                            icon={<FaImage />}
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedProvider(provider);
                              onMediaOpen();
                            }}
                          />
                          <Menu>
                            <MenuButton
                              as={IconButton}
                              aria-label="Más opciones"
                              icon={<FaEllipsisV />}
                              size="sm"
                              variant="ghost"
                            />
                            <MenuList>
                              <MenuItem
                                icon={<FaTrash />}
                                onClick={() => handleDeleteProvider(provider.id)}
                              >
                                Eliminar
                              </MenuItem>
                            </MenuList>
                          </Menu>
                        </HStack>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </CardBody>
        </Card>

        {/* Panel de captura silenciosa del bot */}
        <Card bg={cardBg} border="1px" borderColor={borderColor} mb={6}>
          <CardHeader>
            <Heading size="md">Captura Silenciosa de Grupo (Bot)</Heading>
          </CardHeader>
          <CardBody>
            <VStack align="start" spacing={4}>
              {/* Filtros de contenido capturado */}
              <HStack spacing={4} w="full">
                <FormControl maxW="200px">
                  <FormLabel>Tipo de contenido</FormLabel>
                  <Select value={filterContentType} onChange={e => setFilterContentType(e.target.value)}>
                    <option value="">Todos</option>
                    {CONTENT_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </Select>
                </FormControl>
                <FormControl maxW="200px">
                  <FormLabel>Estado</FormLabel>
                  <Select value={filterState} onChange={e => setFilterState(e.target.value)}>
                    {CONTENT_STATES.map(state => (
                      <option key={state.value} value={state.value}>{state.label}</option>
                    ))}
                  </Select>
                </FormControl>
                <FormControl maxW="180px">
                  <FormLabel>Desde</FormLabel>
                  <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
                </FormControl>
                <FormControl maxW="180px">
                  <FormLabel>Hasta</FormLabel>
                  <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
                </FormControl>
              </HStack>
              <FormControl maxW="300px">
                <FormLabel>Selecciona un grupo</FormLabel>
                <Select
                  placeholder={loadingGroups ? 'Cargando grupos...' : 'Seleccionar grupo'}
                  value={selectedGroupId || ''}
                  onChange={e => setSelectedGroupId(Number(e.target.value) || null)}
                  isDisabled={loadingGroups}
                >
                  {!loadingGroups && groups?.data?.map((grupo: Group) => (
                    <option key={grupo.id} value={grupo.id}>{grupo.nombre}</option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Tipos de contenido a capturar</FormLabel>
                <CheckboxGroup
                  value={selectedContentTypes}
                  onChange={val => setSelectedContentTypes(val as string[])}
                >
                  <HStack>
                    {CONTENT_TYPES.map(type => (
                      <Checkbox key={type.value} value={type.value}>{type.label}</Checkbox>
                    ))}
                  </HStack>
                </CheckboxGroup>
              </FormControl>
              <HStack>
                <Button
                  colorScheme="green"
                  onClick={handleStartMonitoring}
                  isLoading={loadingCapture}
                  isDisabled={!selectedGroupId || monitoring}
                  leftIcon={monitoring ? <FaCheckCircle /> : <FaPlay />}
                >
                  {monitoring ? 'Captura Activa' : 'Iniciar Captura'}
                </Button>
                <Button
                  colorScheme="red"
                  onClick={handleStopMonitoring}
                  isLoading={loadingCapture}
                  isDisabled={!selectedGroupId || !monitoring}
                >
                  Detener Captura
                </Button>
                
                {/* Indicador de estado del polling */}
                {pollingInterval && (
                  <HStack spacing={2} px={3} py={2} bg="blue.50" borderRadius="md" border="1px" borderColor="blue.200">
                    <Box w={2} h={2} bg="green.400" borderRadius="full" style={pulseAnimation} />
                    <Text fontSize="sm" color="blue.700" fontWeight="medium">
                      Monitoreo activo - Actualizando cada 15s
                    </Text>
                  </HStack>
                )}
              </HStack>
              <Divider />
              <Box w="full">
                <HStack justify="space-between" align="center" mb={2}>
                  <Heading size="sm">
                    Contenidos capturados {selectedProvider ? `del proveedor: ${selectedProvider.name}` : selectedGroupId ? `del grupo seleccionado` : ''}
                  </Heading>
                  
                  {/* Contador de contenidos */}
                  {capturedContent.length > 0 && (
                    <HStack spacing={2}>
                      <Badge colorScheme="blue" variant="solid" px={3} py={1} borderRadius="full">
                        {capturedContent.length} contenido(s)
                      </Badge>
                      {pollingInterval && (
                        <Badge colorScheme="green" variant="outline" px={2} py={1} borderRadius="full">
                          <HStack spacing={1}>
                            <Box w={2} h={2} bg="green.400" borderRadius="full" />
                            <Text fontSize="xs">En vivo</Text>
                          </HStack>
                        </Badge>
                      )}
                      <Button
                        size="xs"
                        variant="ghost"
                        leftIcon={<FaSearch />}
                        onClick={checkForNewContent}
                        isLoading={loadingCapture}
                        colorScheme="blue"
                      >
                        Actualizar ahora
                      </Button>
                    </HStack>
                  )}
                </HStack>
                
                {/* Alerta de nuevos contenidos */}
                {showNewContentAlert && (
                  <Alert 
                    status="info" 
                    variant="left-accent" 
                    mb={4}
                    borderRadius="md"
                  >
                    <AlertIcon />
                    <Box flex="1">
                      <Text fontWeight="bold">¡Nuevo contenido detectado!</Text>
                      <Text fontSize="sm">
                        Se han capturado nuevos contenidos. La lista se ha actualizado automáticamente.
                      </Text>
                    </Box>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowNewContentAlert(false)}
                      ml={2}
                    >
                      <FaTimes />
                    </Button>
                  </Alert>
                )}
                {loadingCapture ? (
                  <Spinner />
                ) : capturedContent.length === 0 ? (
                  <Text color="gray.500">No hay contenido capturado para este grupo.</Text>
                ) : (
                  <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                    {capturedContent.map(item => (
                      <Card
                        key={item.id}
                        bg={cardBg}
                        border="1px"
                        borderColor={borderColor}
                        cursor="pointer"
                        onClick={() => { setSelectedCaptured(item); onCapturedModalOpen(); }}
                      >
                        <CardBody>
                          <Text fontWeight="bold" mb={1}>{item.tipo_contenido.toUpperCase()}</Text>
                          {item.tipo_contenido === 'imagen' && (
                            <Image src={item.contenido} alt="Imagen capturada" maxH="200px" objectFit="cover" mb={2} />
                          )}
                          {item.tipo_contenido === 'video' && (
                            <Box mb={2}><video src={item.contenido} controls style={{ maxWidth: '100%' }} /></Box>
                          )}
                          {item.tipo_contenido === 'audio' && (
                            <Box mb={2}><audio src={item.contenido} controls /></Box>
                          )}
                          {item.tipo_contenido === 'documento' && (
                            <Button as="a" href={item.contenido} target="_blank" leftIcon={<FaFile />} size="sm" mb={2}>Ver documento</Button>
                          )}
                          {item.tipo_contenido === 'texto' && (
                            <Text fontSize="sm" color="gray.700" mb={2}>{item.contenido}</Text>
                          )}
                          <HStack mt={2} spacing={2}>
                            {(item.tipo_contenido === 'imagen' || item.tipo_contenido === 'video' || item.tipo_contenido === 'audio' || item.tipo_contenido === 'documento') && (
                              <Button
                                size="xs"
                                leftIcon={<FaDownload />}
                                as="a"
                                href={item.contenido}
                                download
                                target="_blank"
                                variant="outline"
                              >
                                Descargar
                              </Button>
                            )}
                            <Button
                              size="xs"
                              colorScheme="red"
                              leftIcon={<FaTrash />}
                              onClick={() => handleDeleteCaptured(item.id)}
                              variant="outline"
                            >
                              Eliminar
                            </Button>
                            {item.estado !== 'aprobado' && (
                              <Button
                                size="xs"
                                colorScheme="green"
                                leftIcon={<FaCheck />}
                                onClick={() => handleApproveCaptured(item.id)}
                                variant="outline"
                              >
                                Revisado
                              </Button>
                            )}
                          </HStack>
                          <Text fontSize="xs" color="gray.500">{new Date(item.fecha_captura).toLocaleString()}</Text>
                          <Text fontSize="xs" color="gray.500">Estado: {item.estado}</Text>
                        </CardBody>
                      </Card>
                    ))}
                  </SimpleGrid>
                )}
              </Box>
            </VStack>
          </CardBody>
        </Card>
      </VStack>

      {/* Modal Crear Proveedor */}
      <Modal isOpen={isCreateOpen} onClose={onCreateClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Crear Nuevo Proveedor</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <Grid templateColumns="repeat(2, 1fr)" gap={4} w="full">
                <GridItem>
                  <FormControl isRequired>
                    <FormLabel>Nombre</FormLabel>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Nombre del proveedor"
                    />
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl isRequired>
                    <FormLabel>Email</FormLabel>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@ejemplo.com"
                    />
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl>
                    <FormLabel>Teléfono</FormLabel>
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+1234567890"
                    />
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl>
                    <FormLabel>Sitio Web</FormLabel>
                    <Input
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      placeholder="https://ejemplo.com"
                    />
                  </FormControl>
                </GridItem>
              </Grid>

              <FormControl>
                <FormLabel>Dirección</FormLabel>
                <Input
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Dirección completa"
                />
              </FormControl>

              <FormControl>
                <FormLabel>Descripción</FormLabel>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descripción del proveedor"
                  rows={3}
                />
              </FormControl>

              {/* Especializaciones */}
              <FormControl>
                <FormLabel>Especializaciones</FormLabel>
                <HStack>
                  <Input
                    value={specializationInput}
                    onChange={(e) => setSpecializationInput(e.target.value)}
                    placeholder="Agregar especialización"
                    onKeyPress={(e) => e.key === 'Enter' && handleAddSpecialization()}
                  />
                  <Button onClick={handleAddSpecialization} size="sm">
                    Agregar
                  </Button>
                </HStack>
                <Wrap mt={2}>
                  {formData.specializations.map((spec, index) => (
                    <WrapItem key={index}>
                      <Tag size="md" colorScheme="blue">
                        <TagLabel>{spec}</TagLabel>
                        <TagCloseButton onClick={() => handleRemoveSpecialization(spec)} />
                      </Tag>
                    </WrapItem>
                  ))}
                </Wrap>
              </FormControl>

              {/* Selector de Grupos */}
              <FormControl>
                <FormLabel>Grupos Asociados</FormLabel>
                <Select
                  placeholder="Seleccionar grupos"
                  onChange={(e) => {
                    const grupoId = parseInt(e.target.value);
                    if (grupoId && !formData.grupos.includes(grupoId)) {
                      setFormData({
                        ...formData,
                        grupos: [...formData.grupos, grupoId],
                      });
                    }
                  }}
                >
                  {groups?.data?.map((grupo: Group) => (
                    <option key={grupo.id} value={grupo.id}>
                      {grupo.nombre} {grupo.descripcion && `- ${grupo.descripcion}`}
                    </option>
                  ))}
                </Select>
                <Wrap mt={2}>
                  {formData.grupos.map((grupoId) => {
                    const grupo = groups?.data?.find((g: Group) => g.id === grupoId);
                    return (
                      <WrapItem key={grupoId}>
                        <Tag size="md" colorScheme="green">
                          <TagLabel>{grupo?.nombre}</TagLabel>
                          <TagCloseButton
                            onClick={() => setFormData({
                              ...formData,
                              grupos: formData.grupos.filter(id => id !== grupoId),
                            })}
                          />
                        </Tag>
                      </WrapItem>
                    );
                  })}
                </Wrap>
              </FormControl>

              {/* Captura de Media */}
              <FormControl>
                <FormLabel>Contenido Multimedia</FormLabel>
                <VStack spacing={3} align="stretch">
                  <HStack>
                    <Button
                      leftIcon={<FaUpload />}
                      onClick={() => fileInputRef.current?.click()}
                      colorScheme="blue"
                      variant="outline"
                    >
                      Seleccionar Archivos
                    </Button>
                    <Text fontSize="sm" color="gray.500">
                      Imágenes, videos, audio, documentos
                    </Text>
                  </HStack>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />

                  {formData.media.length > 0 && (
                    <Box>
                      <Text fontSize="sm" fontWeight="bold" mb={2}>
                        Archivos seleccionados ({formData.media.length}):
                      </Text>
                      <VStack spacing={2} align="stretch">
                        {formData.media.map((file, index) => (
                          <HStack
                            key={index}
                            p={3}
                            bg={colorMode === 'light' ? 'gray.50' : 'gray.700'}
                            borderRadius="md"
                            justify="space-between"
                          >
                            <HStack>
                              <Icon as={getFileIcon(file)} color="blue.500" />
                              <Box>
                                <Text fontSize="sm" fontWeight="medium">
                                  {file.name}
                                </Text>
                                <Text fontSize="xs" color="gray.500">
                                  {getFileType(file)} • {formatFileSize(file.size)}
                                </Text>
                              </Box>
                            </HStack>
                            <IconButton
                              aria-label="Eliminar archivo"
                              icon={<FaTimes />}
                              size="sm"
                              variant="ghost"
                              colorScheme="red"
                              onClick={() => handleRemoveMedia(index)}
                            />
                          </HStack>
                        ))}
                      </VStack>
                    </Box>
                  )}
                </VStack>
              </FormControl>

              {/* Información de Pago */}
              <Grid templateColumns="repeat(2, 1fr)" gap={4} w="full">
                <GridItem>
                  <FormControl>
                    <FormLabel>Método de Pago</FormLabel>
                    <Select
                      value={formData.paymentInfo.method}
                      onChange={(e) => setFormData({
                        ...formData,
                        paymentInfo: { ...formData.paymentInfo, method: e.target.value },
                      })}
                    >
                      <option value="paypal">PayPal</option>
                      <option value="stripe">Stripe</option>
                      <option value="bank">Transferencia Bancaria</option>
                      <option value="crypto">Criptomonedas</option>
                    </Select>
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl>
                    <FormLabel>Cuenta</FormLabel>
                    <Input
                      value={formData.paymentInfo.account}
                      onChange={(e) => setFormData({
                        ...formData,
                        paymentInfo: { ...formData.paymentInfo, account: e.target.value },
                      })}
                      placeholder="Cuenta o ID de pago"
                    />
                  </FormControl>
                </GridItem>
              </Grid>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onCreateClose}>
              Cancelar
            </Button>
            <Button
              colorScheme="blue"
              onClick={handleCreateProvider}
              isLoading={createProviderMutation.isLoading}
            >
              Crear Proveedor
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal Editar Proveedor */}
      <Modal isOpen={isEditOpen} onClose={onEditClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Editar Proveedor</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {/* Mismo contenido que el modal de crear, pero con handleUpdateProvider */}
            <VStack spacing={4}>
              <Grid templateColumns="repeat(2, 1fr)" gap={4} w="full">
                <GridItem>
                  <FormControl isRequired>
                    <FormLabel>Nombre</FormLabel>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Nombre del proveedor"
                    />
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl isRequired>
                    <FormLabel>Email</FormLabel>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@ejemplo.com"
                    />
                  </FormControl>
                </GridItem>
              </Grid>
              {/* Resto de campos similares al modal de crear */}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onEditClose}>
              Cancelar
            </Button>
            <Button
              colorScheme="blue"
              onClick={handleUpdateProvider}
              isLoading={updateProviderMutation.isLoading}
            >
              Actualizar Proveedor
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal Ver Proveedor */}
      <Modal isOpen={isViewOpen} onClose={onViewClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Detalles del Proveedor</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedProvider && (
              <VStack spacing={4} align="stretch">
                <HStack>
                  <Avatar size="lg" name={selectedProvider.name} />
                  <Box>
                    <Heading size="md">{selectedProvider.name}</Heading>
                    <Text color="gray.500">{selectedProvider.email}</Text>
                  </Box>
                </HStack>
                
                <Divider />
                
                <SimpleGrid columns={2} spacing={4}>
                  <Box>
                    <Text fontWeight="bold">Contacto</Text>
                    <Text>📧 {selectedProvider.email}</Text>
                    <Text>📱 {selectedProvider.phone}</Text>
                    <Text>🌐 {selectedProvider.website}</Text>
                    <Text>📍 {selectedProvider.address}</Text>
                  </Box>
                  <Box>
                    <Text fontWeight="bold">Estadísticas</Text>
                    <Text>⭐ Rating: {selectedProvider.rating}/5</Text>
                    <Text>📊 Aportes: {selectedProvider.totalAportes}</Text>
                    <Text>📋 Pedidos: {selectedProvider.totalPedidos}</Text>
                    <Text>⏱️ Tiempo respuesta: {selectedProvider.averageResponseTime}min</Text>
                  </Box>
                </SimpleGrid>

                {selectedProvider.specializations && selectedProvider.specializations.length > 0 && (
                  <>
                    <Divider />
                    <Box>
                      <Text fontWeight="bold" mb={2}>Especializaciones</Text>
                      <Wrap>
                        {selectedProvider.specializations.map((spec, index) => (
                          <WrapItem key={index}>
                            <Tag size="md" colorScheme="blue">
                              <TagLabel>{spec}</TagLabel>
                            </Tag>
                          </WrapItem>
                        ))}
                      </Wrap>
                    </Box>
                  </>
                )}

                {selectedProvider.grupos && selectedProvider.grupos.length > 0 && (
                  <>
                    <Divider />
                    <Box>
                      <Text fontWeight="bold" mb={2}>Grupos Asociados</Text>
                      <Wrap>
                        {selectedProvider.grupos.map((grupo) => (
                          <WrapItem key={grupo.id}>
                            <Tag size="md" colorScheme="green">
                              <TagLabel>{grupo.nombre}</TagLabel>
                            </Tag>
                          </WrapItem>
                        ))}
                      </Wrap>
                    </Box>
                  </>
                )}
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onViewClose}>
              Cerrar
            </Button>
            <Button
              colorScheme="blue"
              onClick={() => {
                onViewClose();
                if (selectedProvider) {
                  handleEditProvider(selectedProvider);
                }
              }}
            >
              Editar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal Ver Media */}
      <Modal isOpen={isMediaOpen} onClose={onMediaClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Contenido Multimedia del Proveedor</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedProvider && (
              <VStack spacing={4}>
                {selectedProvider.media && selectedProvider.media.length > 0 ? (
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} w="full">
                    {selectedProvider.media.map((item) => (
                      <Card key={item.id} bg={cardBg} border="1px" borderColor={borderColor}>
                        <CardBody>
                          {item.type === 'image' && (
                            <Image
                              src={item.url}
                              alt={item.filename}
                              borderRadius="md"
                              maxH="200px"
                              objectFit="cover"
                              mx="auto"
                            />
                          )}
                          {item.type === 'video' && (
                            <Box
                              bg="gray.100"
                              borderRadius="md"
                              p={4}
                              textAlign="center"
                            >
                              <Icon as={FaVideo} size="xl" color="blue.500" />
                              <Text mt={2} fontSize="sm">
                                {item.filename}
                              </Text>
                            </Box>
                          )}
                          {item.type === 'audio' && (
                            <Box
                              bg="gray.100"
                              borderRadius="md"
                              p={4}
                              textAlign="center"
                            >
                              <Icon as={FaMusic} size="xl" color="purple.500" />
                              <Text mt={2} fontSize="sm">
                                {item.filename}
                              </Text>
                            </Box>
                          )}
                          {item.type === 'document' && (
                            <Box
                              bg="gray.100"
                              borderRadius="md"
                              p={4}
                              textAlign="center"
                            >
                              <Icon as={FaFile} size="xl" color="green.500" />
                              <Text mt={2} fontSize="sm">
                                {item.filename}
                              </Text>
                            </Box>
                          )}
                          <VStack mt={3} spacing={2}>
                            <Text fontSize="sm" fontWeight="bold">
                              {item.filename}
                            </Text>
                            <Text fontSize="xs" color="gray.500">
                              {formatFileSize(item.size)} • {new Date(item.uploadedAt).toLocaleDateString()}
                            </Text>
                            <Button
                              leftIcon={<FaDownload />}
                              size="sm"
                              variant="outline"
                              colorScheme="blue"
                              onClick={() => window.open(item.url, '_blank')}
                            >
                              Descargar
                            </Button>
                          </VStack>
                        </CardBody>
                      </Card>
                    ))}
                  </SimpleGrid>
                ) : (
                  <Alert status="info">
                    <AlertIcon />
                    Este proveedor no tiene contenido multimedia
                  </Alert>
                )}
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onMediaClose}>
              Cerrar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal de detalle de contenido capturado */}
      <Modal isOpen={isCapturedModalOpen} onClose={onCapturedModalClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Detalle de Contenido Capturado</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedCaptured && (
              <VStack align="start" spacing={4}>
                <Text fontWeight="bold">Tipo: {selectedCaptured.tipo_contenido.toUpperCase()}</Text>
                {selectedCaptured.tipo_contenido === 'imagen' && (
                  <Image src={selectedCaptured.contenido} alt="Imagen capturada" maxH="300px" objectFit="contain" />
                )}
                {selectedCaptured.tipo_contenido === 'video' && (
                  <Box><video src={selectedCaptured.contenido} controls style={{ maxWidth: '100%' }} /></Box>
                )}
                {selectedCaptured.tipo_contenido === 'audio' && (
                  <Box><audio src={selectedCaptured.contenido} controls /></Box>
                )}
                {selectedCaptured.tipo_contenido === 'documento' && (
                  <Button as="a" href={selectedCaptured.contenido} target="_blank" leftIcon={<FaFile />} size="sm">Ver documento</Button>
                )}
                {selectedCaptured.tipo_contenido === 'texto' && (
                  <Text fontSize="md" color="gray.700">{selectedCaptured.contenido}</Text>
                )}
                <Divider />
                <Text fontSize="sm">Estado: {selectedCaptured.estado}</Text>
                <Text fontSize="sm">Fecha: {new Date(selectedCaptured.fecha_captura).toLocaleString()}</Text>
                <Text fontSize="sm">Grupo: {selectedCaptured.grupo?.nombre || selectedGroupId}</Text>
                <Text fontSize="sm">Usuario: {selectedCaptured.usuario?.username || '-'}</Text>
                <Text fontSize="sm">ID: {selectedCaptured.id}</Text>
                <Text fontSize="sm">Metadatos: {selectedCaptured.metadata}</Text>
                <HStack mt={2} spacing={2}>
                  {(selectedCaptured.tipo_contenido === 'imagen' || selectedCaptured.tipo_contenido === 'video' || selectedCaptured.tipo_contenido === 'audio' || selectedCaptured.tipo_contenido === 'documento') && (
                    <Button
                      size="sm"
                      leftIcon={<FaDownload />}
                      as="a"
                      href={selectedCaptured.contenido}
                      download
                      target="_blank"
                      variant="outline"
                    >
                      Descargar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    colorScheme="red"
                    leftIcon={<FaTrash />}
                    onClick={() => { handleDeleteCaptured(selectedCaptured.id); onCapturedModalClose(); }}
                    variant="outline"
                  >
                    Eliminar
                  </Button>
                  {selectedCaptured.estado !== 'aprobado' && (
                    <Button
                      size="sm"
                      colorScheme="green"
                      leftIcon={<FaCheck />}
                      onClick={() => { handleApproveCaptured(selectedCaptured.id); onCapturedModalClose(); }}
                      variant="outline"
                    >
                      Revisado
                    </Button>
                  )}
                </HStack>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button onClick={onCapturedModalClose}>Cerrar</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default Proveedores;



