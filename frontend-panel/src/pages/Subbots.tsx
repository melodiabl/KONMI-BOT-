import React, { useState, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  IconButton,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useToast,
  Spinner,
  Alert,
  AlertIcon,
  Flex,
  Spacer,
  Card,
  CardBody,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  useColorModeValue,
  Tooltip,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  Image,
} from '@chakra-ui/react';
import {
  FaPlus,
  FaTrash,
  FaPlay,
  FaStop,
  FaSync,
  FaEye,
  FaQrcode,
  FaKey,
  FaServer,
  FaWifi,
  FaClock,
  FaUser,
  FaCog,
  FaDownload,
  FaUpload,
} from 'react-icons/fa';
import { MdWifiOff } from 'react-icons/md';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/api';
import { RUNTIME_CONFIG } from '../config/runtime-config';

interface Subbot {
  id: number;
  code: string;
  type: 'qr' | 'code';
  status: 'pending' | 'connected' | 'disconnected' | 'error';
  created_by: string;
  created_at: string;
  last_heartbeat: string;
  qr_data?: string;
  qr_path?: string;
  pairing_code?: string;
  isOnline?: boolean;
}

const Subbots: React.FC = () => {
  const { user, hasRole } = useAuth();
  const [subbots, setSubbots] = useState<Subbot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSubbot, setSelectedSubbot] = useState<Subbot | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();
  const API_URL = RUNTIME_CONFIG.API_BASE_URL;

  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Cargar subbots
  const loadSubbots = async () => {
    try {
      setLoading(true);
      const response = await apiService.getSubbots();
      setSubbots(response.subbots || []);
      setError(null);
    } catch (err) {
      setError('Error cargando subbots');
      console.error('Error cargando subbots:', err);
    } finally {
      setLoading(false);
    }
  };

  // Crear nuevo subbot
  const createSubbot = async (type: 'qr' | 'code') => {
    try {
      setActionLoading('create');
      const response = await apiService.createSubbot(user?.id || 0, type);
      if (response.success) {
        toast({
          title: 'Subbot creado',
          description: `Subbot ${type.toUpperCase()} creado exitosamente`,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
        await loadSubbots();
      } else {
        throw new Error(response.error || 'Error creando subbot');
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Error creando subbot',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Eliminar subbot
  const deleteSubbot = async (subbotId: string) => {
    try {
      setActionLoading(subbotId);
      const response = await apiService.deleteSubbot(subbotId);
      if (response.success) {
        toast({
          title: 'Subbot eliminado',
          description: 'Subbot eliminado exitosamente',
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
        await loadSubbots();
      } else {
        throw new Error(response.error || 'Error eliminando subbot');
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Error eliminando subbot',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Obtener estado de subbots
  const getSubbotStatus = async () => {
    try {
      const response = await apiService.getSubbotStatus();
      // Actualizar estado de subbots
      setSubbots(prev => prev.map(subbot => {
        const status = response.subbots.find(s => s.subbotId === subbot.code);
        return {
          ...subbot,
          isOnline: status?.isOnline || false,
          status: status?.status || subbot.status
        };
      }));
    } catch (err) {
      console.error('Error obteniendo estado de subbots:', err);
    }
  };

  // Cargar datos iniciales
  useEffect(() => {
    loadSubbots();
    
    // Actualizar estado cada 30 segundos
    const interval = setInterval(getSubbotStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  // Función para obtener color del estado
  const getStatusColor = (status: string, isOnline: boolean) => {
    if (isOnline) return 'green';
    if (status === 'pending') return 'yellow';
    if (status === 'error') return 'red';
    return 'gray';
  };

  // Función para obtener texto del estado
  const getStatusText = (status: string, isOnline: boolean) => {
    if (isOnline) return 'Conectado';
    if (status === 'pending') return 'Esperando QR';
    if (status === 'error') return 'Error';
    return 'Desconectado';
  };

  // Función para formatear fecha
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-ES');
  };

  // Función para obtener tiempo transcurrido
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

  if (loading) {
    return (
      <Box p={6}>
        <Flex justify="center" align="center" h="200px">
          <Spinner size="xl" />
        </Flex>
      </Box>
    );
  }

  return (
    <Box p={6}>
      <VStack spacing={6} align="stretch">
        {/* Header */}
        <Flex justify="space-between" align="center">
          <VStack align="start" spacing={2}>
            <Heading size="lg" color="blue.500">
              🤖 Gestión de Subbots
            </Heading>
            <Text color="gray.600">
              Administra tus subbots de WhatsApp
            </Text>
          </VStack>
          <HStack spacing={3}>
            <Button
              leftIcon={<FaQrcode />}
              colorScheme="blue"
              onClick={() => createSubbot('qr')}
              isLoading={actionLoading === 'create'}
              loadingText="Creando..."
            >
              Nuevo QR
            </Button>
            <Button
              leftIcon={<FaKey />}
              colorScheme="green"
              onClick={() => createSubbot('code')}
              isLoading={actionLoading === 'create'}
              loadingText="Creando..."
            >
              Nuevo Código
            </Button>
            <Button
              leftIcon={<FaSync />}
              onClick={loadSubbots}
              isLoading={loading}
            >
              Actualizar
            </Button>
          </HStack>
        </Flex>

        {/* Estadísticas */}
        <HStack spacing={4}>
          <Card flex="1">
            <CardBody>
              <Stat>
                <StatLabel>Total Subbots</StatLabel>
                <StatNumber>{subbots.length}</StatNumber>
                <StatHelpText>
                  <FaServer color="blue" /> {subbots.filter(s => s.type === 'qr').length} QR, {subbots.filter(s => s.type === 'code').length} Códigos
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>
          <Card flex="1">
            <CardBody>
              <Stat>
                <StatLabel>Conectados</StatLabel>
                <StatNumber color="green.500">
                  {subbots.filter(s => s.isOnline).length}
                </StatNumber>
                <StatHelpText>
                  <FaWifi color="green" /> Activos ahora
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>
          <Card flex="1">
            <CardBody>
              <Stat>
                <StatLabel>Esperando</StatLabel>
                <StatNumber color="yellow.500">
                  {subbots.filter(s => s.status === 'pending').length}
                </StatNumber>
                <StatHelpText>
                  <FaClock color="yellow" /> Por conectar
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>
        </HStack>

        {/* Error */}
        {error && (
          <Alert status="error">
            <AlertIcon />
            {error}
          </Alert>
        )}

        {/* Tabla de subbots */}
        <Card>
          <CardBody>
            <Table variant="simple">
              <Thead>
                <Tr>
                  <Th>ID</Th>
                  <Th>Tipo</Th>
                  <Th>Estado</Th>
                  <Th>Creado por</Th>
                  <Th>Creado</Th>
                  <Th>Última actividad</Th>
                  <Th>Acciones</Th>
                </Tr>
              </Thead>
              <Tbody>
                {subbots.map((subbot) => (
                  <Tr key={subbot.id}>
                    <Td>
                      <Text fontFamily="mono" fontSize="sm">
                        {subbot.code}
                      </Text>
                    </Td>
                    <Td>
                      <Badge
                        colorScheme={subbot.type === 'qr' ? 'blue' : 'green'}
                        variant="subtle"
                      >
                        {subbot.type === 'qr' ? 'QR' : 'Código'}
                      </Badge>
                    </Td>
                    <Td>
                      <HStack spacing={2}>
                        <Badge
                          colorScheme={getStatusColor(subbot.status, subbot.isOnline || false)}
                          variant="solid"
                        >
                          {getStatusText(subbot.status, subbot.isOnline || false)}
                        </Badge>
                        {subbot.isOnline ? (
                          <FaWifi color="green" />
                        ) : (
                          <MdWifiOff color="gray" />
                        )}
                      </HStack>
                    </Td>
                    <Td>
                      <HStack spacing={2}>
                        <FaUser />
                        <Text fontSize="sm">{subbot.created_by}</Text>
                      </HStack>
                    </Td>
                    <Td>
                      <Text fontSize="sm">
                        {formatDate(subbot.created_at)}
                      </Text>
                    </Td>
                    <Td>
                      <Text fontSize="sm">
                        {getTimeAgo(subbot.last_heartbeat)}
                      </Text>
                    </Td>
                    <Td>
                      <HStack spacing={2}>
                        <Tooltip label="Ver detalles">
                          <IconButton
                            aria-label="Ver detalles"
                            icon={<FaEye />}
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedSubbot(subbot);
                              onOpen();
                            }}
                          />
                        </Tooltip>
                        <Tooltip label="Eliminar">
                          <IconButton
                            aria-label="Eliminar"
                            icon={<FaTrash />}
                            size="sm"
                            variant="ghost"
                            colorScheme="red"
                            onClick={() => deleteSubbot(subbot.code)}
                            isLoading={actionLoading === subbot.code}
                          />
                        </Tooltip>
                      </HStack>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </CardBody>
        </Card>
      </VStack>

      {/* Modal de detalles */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Detalles del Subbot</ModalHeader>
          <ModalBody>
            {selectedSubbot && (
              <VStack spacing={4} align="stretch">
                <HStack justify="space-between">
                  <Text fontWeight="bold">ID:</Text>
                  <Text fontFamily="mono">{selectedSubbot.code}</Text>
                </HStack>
                <HStack justify="space-between">
                  <Text fontWeight="bold">Tipo:</Text>
                  <Badge
                    colorScheme={selectedSubbot.type === 'qr' ? 'blue' : 'green'}
                  >
                    {selectedSubbot.type === 'qr' ? 'QR' : 'Código'}
                  </Badge>
                </HStack>
                <HStack justify="space-between">
                  <Text fontWeight="bold">Estado:</Text>
                  <Badge
                    colorScheme={getStatusColor(selectedSubbot.status, selectedSubbot.isOnline || false)}
                  >
                    {getStatusText(selectedSubbot.status, selectedSubbot.isOnline || false)}
                  </Badge>
                </HStack>
                <HStack justify="space-between">
                  <Text fontWeight="bold">Creado por:</Text>
                  <Text>{selectedSubbot.created_by}</Text>
                </HStack>
                <HStack justify="space-between">
                  <Text fontWeight="bold">Creado:</Text>
                  <Text>{formatDate(selectedSubbot.created_at)}</Text>
                </HStack>
                <HStack justify="space-between">
                  <Text fontWeight="bold">Última actividad:</Text>
                  <Text>{getTimeAgo(selectedSubbot.last_heartbeat)}</Text>
                </HStack>
                {selectedSubbot.pairing_code && (
                  <HStack justify="space-between">
                    <Text fontWeight="bold">Código:</Text>
                    <Text fontFamily="mono">{selectedSubbot.pairing_code}</Text>
                  </HStack>
                )}
                {selectedSubbot.qr_path && (
                  <Box>
                    <Text fontWeight="bold" mb={2}>QR:</Text>
                    <Image
                      src={`${API_URL}${selectedSubbot.qr_path}`}
                      alt="QR del subbot"
                      borderRadius="md"
                    />
                  </Box>
                )}
                {selectedSubbot.qr_data && (
                  <Box>
                    <Text fontWeight="bold" mb={2}>QR Data:</Text>
                    <Text
                      fontFamily="mono"
                      fontSize="sm"
                      p={2}
                      bg="gray.100"
                      borderRadius="md"
                      wordBreak="break-all"
                    >
                      {selectedSubbot.qr_data}
                    </Text>
                  </Box>
                )}
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button onClick={onClose}>Cerrar</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default Subbots;

