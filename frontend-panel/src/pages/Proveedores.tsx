import React, { useState, useEffect, useMemo } from 'react';
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
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  useToast,
  useColorModeValue,
  Alert,
  AlertIcon,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Select,
  IconButton,
  Spinner,
  Wrap,
  WrapItem,
  Badge,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Divider,
  SimpleGrid,
} from '@chakra-ui/react';
import {
  FaUserTie,
  FaPlus,
  FaTrash,
  FaPlay,
  FaStop,
  FaEye,
  FaSync,
} from 'react-icons/fa';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiService } from '../services/api';
import dayjs from 'dayjs';

interface Provider {
  id: number | null;
  jid: string;
  name: string;
  status: 'active' | 'inactive';
  esProveedor?: boolean;
}

interface ProviderStats {
  totalProviders: number;
}

interface GroupOption {
  id: number;
  jid: string;
  nombre: string;
}

interface CapturedContent {
  id: number;
  grupo_id: number;
  usuario_id: number;
  tipo_contenido: string;
  contenido: string;
  metadata?: any;
  fecha_captura: string;
  estado: string;
  grupo?: { nombre: string };
  usuario?: { username: string };
}

const CONTENT_TYPES = ['texto', 'imagen', 'video', 'audio', 'documento'];

const Proveedores: React.FC = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [capturedContent, setCapturedContent] = useState<CapturedContent[]>([]);
  const [loadingContent, setLoadingContent] = useState(false);
  const [monitoring, setMonitoring] = useState(false);

  const { isOpen, onOpen, onClose } = useDisclosure();

  const providersQuery = useQuery('providers', async () => {
    const response = await apiService.getProviders();
    return (response?.providers || []) as Provider[];
  });

  const providerStatsQuery = useQuery('providerStats', async () => {
    const response = await apiService.getProviderStats();
    return response as ProviderStats;
  });

  const groupsQuery = useQuery('groups', async () => {
    const response = await apiService.getGroups(1, 100);
    return (response?.grupos || []) as GroupOption[];
  });

  const providers = providersQuery.data || [];
  const providerStats = providerStatsQuery.data;

  const availableGroups = useMemo(() => {
    const groups = groupsQuery.data || [];
    if (!groups.length) return [];
    return groups.filter((group) => !providers.some((provider) => provider.jid === group.jid));
  }, [groupsQuery.data, providers]);

  const addProviderMutation = useMutation(
    (jid: string) => apiService.createProvider({ jid }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('providers');
        queryClient.invalidateQueries('providerStats');
        toast({ title: 'Proveedor añadido', status: 'success' });
        setSelectedGroup('');
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'No se pudo añadir el proveedor',
          status: 'error',
        });
      },
    }
  );

  const removeProviderMutation = useMutation(
    (jid: string) => apiService.deleteProvider(jid),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('providers');
        queryClient.invalidateQueries('providerStats');
        toast({ title: 'Proveedor quitado', status: 'info' });
        if (selectedProvider && selectedProvider.jid === jid) {
          setSelectedProvider(null);
          setCapturedContent([]);
        }
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'No se pudo quitar el proveedor',
          status: 'error',
        });
      },
    }
  );

  const fetchCapturedContent = async (jid: string) => {
    try {
      setLoadingContent(true);
      const response = await apiService.getCapturedContent({ grupo_id: jid, limit: 25 });
      const data = (response?.data || response || []) as CapturedContent[];
      setCapturedContent(data);
    } catch (error) {
      toast({ title: 'Error al cargar contenido', status: 'error' });
    } finally {
      setLoadingContent(false);
    }
  };

  useEffect(() => {
    if (selectedProvider) {
      fetchCapturedContent(selectedProvider.jid);
    } else {
      setCapturedContent([]);
    }
  }, [selectedProvider]);

  useEffect(() => {
    if (!selectedProvider) return;

    const eventSource = new EventSource(`${apiService.api.defaults.baseURL || ''}/api/aportes/stream?token=${localStorage.getItem('token') || ''}`);
    eventSource.onmessage = (event) => {
      if (!event.data) return;
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'aporteChanged') {
          fetchCapturedContent(selectedProvider.jid);
        }
      } catch (error) {
        console.error('Error procesando SSE de aportes:', error);
      }
    };
    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [selectedProvider]);

  const handleAddProvider = () => {
    if (!selectedGroup) {
      toast({ title: 'Selecciona un grupo', status: 'warning' });
      return;
    }
    addProviderMutation.mutate(selectedGroup);
  };

  const handleSelectProvider = (provider: Provider) => {
    setSelectedProvider(provider);
    onOpen();
  };

  const handleRemoveProvider = (provider: Provider) => {
    if (window.confirm(`¿Quitar ${provider.name} como proveedor?`)) {
      removeProviderMutation.mutate(provider.jid);
    }
  };

  const handleStartMonitoring = async () => {
    if (!selectedProvider) return;
    try {
      await apiService.startGroupMonitoring(selectedProvider.jid, CONTENT_TYPES);
      toast({ title: 'Monitoreo iniciado', status: 'success' });
      setMonitoring(true);
    } catch (error: any) {
      toast({
        title: 'Error al iniciar monitoreo',
        description: error.response?.data?.message || error.message,
        status: 'error',
      });
    }
  };

  const handleStopMonitoring = async () => {
    if (!selectedProvider) return;
    try {
      await apiService.stopGroupMonitoring(selectedProvider.jid);
      toast({ title: 'Monitoreo detenido', status: 'info' });
      setMonitoring(false);
    } catch (error: any) {
      toast({
        title: 'Error al detener monitoreo',
        description: error.response?.data?.message || error.message,
        status: 'error',
      });
    }
  };

  const parseMetadata = (metadata: any) => {
    if (!metadata) return null;
    if (typeof metadata === 'object') return metadata;
    try {
      return JSON.parse(metadata);
    } catch (_) {
      return null;
    }
  };

  return (
    <Box>
      <VStack spacing={6} align="stretch">
        <Flex align="center" justify="space-between">
          <Box>
            <Heading size="lg">Gestión de Proveedores</Heading>
            <Text color="gray.600" mt={1}>
              Selecciona grupos para que el bot capture y clasifique contenido automáticamente.
            </Text>
          </Box>
          <HStack>
            <Button
              leftIcon={<FaSync />}
              variant="outline"
              onClick={() => queryClient.invalidateQueries('providers')}
            >
              Actualizar
            </Button>
          </HStack>
        </Flex>

        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardBody>
            <Stat textAlign="center">
              <StatLabel>Total Proveedores</StatLabel>
              <StatNumber>{providerStats?.totalProviders || 0}</StatNumber>
              <StatHelpText>Grupos configurados como proveedores</StatHelpText>
            </Stat>
          </CardBody>
        </Card>

        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardHeader>
            <Heading size="md">Añadir nuevo proveedor</Heading>
          </CardHeader>
          <CardBody>
            <HStack spacing={4} align="center">
              <Select
                placeholder="Seleccionar grupo"
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                maxW="300px"
              >
                {availableGroups.map((group) => (
                  <option key={group.jid} value={group.jid}>
                    {group.nombre || group.jid}
                  </option>
                ))}
              </Select>
              <Button
                leftIcon={<FaPlus />}
                colorScheme="green"
                onClick={handleAddProvider}
                isLoading={addProviderMutation.isLoading}
              >
                Añadir proveedor
              </Button>
              {availableGroups.length === 0 && (
                <Text color="gray.500">No hay grupos disponibles para convertir en proveedores.</Text>
              )}
            </HStack>
          </CardBody>
        </Card>

        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardHeader>
            <Heading size="md">Proveedores configurados</Heading>
          </CardHeader>
          <CardBody>
            {providersQuery.isLoading ? (
              <Box textAlign="center" py={8}>
                <Spinner size="xl" />
                <Text mt={4}>Cargando proveedores...</Text>
              </Box>
            ) : providers.length === 0 ? (
              <Alert status="info">
                <AlertIcon />
                Aún no hay proveedores configurados.
              </Alert>
            ) : (
              <Table size="sm">
                <Thead>
                  <Tr>
                    <Th>Proveedor</Th>
                    <Th>Estado</Th>
                    <Th>Acciones</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {providers.map((provider) => (
                    <Tr key={provider.jid}>
                      <Td>
                        <HStack spacing={3}>
                          <Icon as={FaUserTie} color="blue.500" />
                          <Box>
                            <Text fontWeight="bold">{provider.name}</Text>
                            <Text fontSize="sm" color="gray.500">{provider.jid}</Text>
                          </Box>
                        </HStack>
                      </Td>
                      <Td>
                        <Badge colorScheme={provider.status === 'active' ? 'green' : 'gray'}>
                          {provider.status === 'active' ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </Td>
                      <Td>
                        <HStack spacing={2}>
                          <Button
                            size="xs"
                            leftIcon={<FaEye />}
                            onClick={() => handleSelectProvider(provider)}
                          >
                            Ver contenido
                          </Button>
                          <IconButton
                            aria-label="Eliminar proveedor"
                            icon={<FaTrash />}
                            size="xs"
                            variant="ghost"
                            colorScheme="red"
                            onClick={() => handleRemoveProvider(provider)}
                          />
                        </HStack>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </CardBody>
        </Card>

        <Modal isOpen={isOpen} onClose={onClose} size="xl">
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>Contenido capturado</ModalHeader>
            <ModalBody>
              {!selectedProvider ? (
                <Text>Selecciona un proveedor para ver su contenido capturado.</Text>
              ) : (
                <VStack spacing={4} align="stretch">
                  <HStack justify="space-between">
                    <Box>
                      <Heading size="sm">{selectedProvider.name}</Heading>
                      <Text fontSize="sm" color="gray.500">{selectedProvider.jid}</Text>
                    </Box>
                    <HStack>
                      <Button
                        leftIcon={<FaPlay />}
                        size="sm"
                        colorScheme="green"
                        onClick={handleStartMonitoring}
                      >
                        Iniciar monitoreo
                      </Button>
                      <Button
                        leftIcon={<FaStop />}
                        size="sm"
                        colorScheme="orange"
                        onClick={handleStopMonitoring}
                      >
                        Detener
                      </Button>
                      <IconButton
                        aria-label="Actualizar contenido"
                        icon={<FaSync />}
                        size="sm"
                        onClick={() => selectedProvider && fetchCapturedContent(selectedProvider.jid)}
                      />
                    </HStack>
                  </HStack>
                  <Divider />
                  {loadingContent ? (
                    <Spinner />
                  ) : capturedContent.length === 0 ? (
                    <Alert status="info">
                      <AlertIcon />
                      No se ha capturado contenido aún.
                    </Alert>
                  ) : (
                    <VStack spacing={3} align="stretch">
                      {capturedContent.map((content) => {
                        const metadata = parseMetadata(content.metadata);
                        return (
                          <Box key={content.id} borderWidth="1px" borderRadius="md" p={4} borderColor={borderColor}>
                            <HStack justify="space-between">
                              <Badge colorScheme="blue">{content.tipo_contenido}</Badge>
                              <Text fontSize="xs" color="gray.500">
                                {dayjs(content.fecha_captura).format('DD/MM/YYYY HH:mm')}
                              </Text>
                            </HStack>
                            <Text mt={2}>{content.contenido}</Text>
                            {metadata && (
                              <Box mt={2} fontSize="sm" color="gray.500">
                                <Text fontWeight="bold">Clasificación:</Text>
                                <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(metadata, null, 2)}</pre>
                              </Box>
                            )}
                          </Box>
                        );
                      })}
                    </VStack>
                  )}
                </VStack>
              )}
            </ModalBody>
            <ModalFooter>
              <Button onClick={onClose}>Cerrar</Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </VStack>
    </Box>
  );
};

export default Proveedores;
