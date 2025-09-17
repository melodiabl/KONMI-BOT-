import React, { useState, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Input,
  InputGroup,
  InputLeftElement,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  IconButton,
  useToast,
  Spinner,
  Alert,
  AlertIcon,
  Flex,
  Card,
  CardBody,
  Select,
  useColorModeValue,
  Tooltip,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  Switch,
  FormControl,
  FormLabel,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Avatar,
  Divider,
} from '@chakra-ui/react';
import {
  FaSearch,
  FaBell,
  FaCheck,
  FaTimes,
  FaEye,
  FaEllipsisV,
  FaTrash,
  FaEnvelope,
  FaEnvelopeOpen,
  FaExclamationTriangle,
  FaInfoCircle,
  FaCheckCircle,
  FaClock,
  FaUser,
  FaCog,
  FaFilter,
  FaDownload,
} from 'react-icons/fa';
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
  info: FaInfoCircle,
  success: FaCheckCircle,
  warning: FaExclamationTriangle,
  error: FaExclamationTriangle,
  system: FaCog,
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

  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();
  const queryClient = useQueryClient();

  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

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
        toast({
          title: 'Notificación marcada como leída',
          status: 'success',
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al marcar como leída',
          status: 'error',
        });
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
        toast({
          title: 'Todas las notificaciones marcadas como leídas',
          status: 'success',
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al marcar todas como leídas',
          status: 'error',
        });
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
        toast({
          title: 'Notificación eliminada',
          status: 'success',
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al eliminar notificación',
          status: 'error',
        });
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
    onOpen();
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
      <Alert status="error">
        <AlertIcon />
        Error al cargar notificaciones: {(error as any).message}
      </Alert>
    );
  }

  return (
    <Box>
      <VStack spacing={6} align="stretch">
        {/* Header */}
        <Flex align="center" justify="space-between">
          <Box>
            <Heading size="lg">Notificaciones</Heading>
            <Text color="gray.600" mt={1}>
              Gestión y visualización de notificaciones del sistema
            </Text>
          </Box>
          <HStack spacing={3}>
            <Button
              leftIcon={<FaCheck />}
              colorScheme="blue"
              variant="outline"
              onClick={handleMarkAllAsRead}
              isLoading={markAllAsReadMutation.isLoading}
              isDisabled={unreadNotifications === 0}
            >
              Marcar todas como leídas
            </Button>
            <Button
              leftIcon={<FaDownload />}
              colorScheme="green"
              variant="outline"
            >
              Exportar
            </Button>
          </HStack>
        </Flex>

        {/* Estadísticas */}
        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardBody>
            <HStack spacing={8} justify="center">
              <VStack>
                <Badge colorScheme="blue" size="lg">
                  {totalNotifications}
                </Badge>
                <Text fontSize="sm" fontWeight="semibold">Total</Text>
              </VStack>
              <VStack>
                <Badge colorScheme="red" size="lg">
                  {unreadNotifications}
                </Badge>
                <Text fontSize="sm" fontWeight="semibold">No leídas</Text>
              </VStack>
              <VStack>
                <Badge colorScheme="green" size="lg">
                  {readNotifications}
                </Badge>
                <Text fontSize="sm" fontWeight="semibold">Leídas</Text>
              </VStack>
              <VStack>
                <Badge colorScheme="purple" size="lg">
                  {categoriesCount}
                </Badge>
                <Text fontSize="sm" fontWeight="semibold">Categorías</Text>
              </VStack>
            </HStack>
          </CardBody>
        </Card>

        {/* Filtros */}
        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardBody>
            <HStack spacing={4} wrap="wrap">
              <InputGroup maxW="300px">
                <InputLeftElement pointerEvents="none">
                  <FaSearch color="gray.300" />
                </InputLeftElement>
                <Input
                  placeholder="Buscar notificaciones..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </InputGroup>
              <Select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                maxW="200px"
              >
                <option value="all">Todos los tipos</option>
                {(typesData?.types || stats?.types || ['info', 'success', 'warning', 'error', 'system']).map((typeOption: string) => (
                  <option key={typeOption} value={typeOption}>{typeOption}</option>
                ))}
              </Select>
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                maxW="200px"
              >
                <option value="all">Todas las categorías</option>
                {(categoriesData?.categories || stats?.categories || ['system', 'user', 'content', 'security', 'general']).map((categoryOption: string) => (
                  <option key={categoryOption} value={categoryOption}>{categoryOption}</option>
                ))}
              </Select>
              <Select
                value={readFilter}
                onChange={(e) => setReadFilter(e.target.value)}
                maxW="200px"
              >
                <option value="all">Todas</option>
                <option value="unread">No leídas</option>
                <option value="read">Leídas</option>
              </Select>
            </HStack>
          </CardBody>
        </Card>

        {/* Tabla de Notificaciones */}
        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardBody>
            {isLoading ? (
              <Box textAlign="center" py={8}>
                <Spinner size="xl" />
                <Text mt={4}>Cargando notificaciones...</Text>
              </Box>
            ) : (
              <Box overflowX="auto">
                <Table variant="simple">
                  <Thead>
                    <Tr>
                      <Th>Estado</Th>
                      <Th>Título</Th>
                      <Th>Tipo</Th>
                      <Th>Categoría</Th>
                      <Th>Fecha</Th>
                      <Th>Acciones</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {notificationsData?.notifications?.length === 0 && (
                      <Tr>
                        <Td colSpan={6}>
                          <Alert status="info" variant="subtle">
                            <AlertIcon />
                            No se encontraron notificaciones.
                          </Alert>
                        </Td>
                      </Tr>
                    )}
                    {notificationsData?.notifications?.map((notification: Notification) => {
                      const IconComponent = typeIcons[notification.type as keyof typeof typeIcons] || FaBell;
                      
                      return (
                        <Tr 
                          key={notification.id}
                          bg={!notification.read ? `${typeColors[notification.type as keyof typeof typeColors]}.50` : undefined}
                          _hover={{ bg: `${typeColors[notification.type as keyof typeof typeColors]}.100` }}
                          cursor="pointer"
                          onClick={() => handleViewNotification(notification)}
                        >
                          <Td>
                            <HStack>
                              {notification.read ? (
                                <FaEnvelopeOpen color="gray" />
                              ) : (
                                <FaEnvelope color="blue" />
                              )}
                              {!notification.read && (
                                <Box
                                  w={2}
                                  h={2}
                                  borderRadius="full"
                                  bg={`${typeColors[notification.type as keyof typeof typeColors]}.500`}
                                />
                              )}
                            </HStack>
                          </Td>
                          <Td>
                            <VStack align="start" spacing={1}>
                              <Text fontWeight="semibold" color={!notification.read ? 'blue.600' : undefined}>
                                {notification.title}
                              </Text>
                              <Text fontSize="sm" color="gray.500" noOfLines={2}>
                                {notification.message}
                              </Text>
                            </VStack>
                          </Td>
                          <Td>
                            <HStack>
                              <Box as={IconComponent} color={`${typeColors[notification.type as keyof typeof typeColors]}.500`} />
                              <Badge
                                colorScheme={typeColors[notification.type as keyof typeof typeColors] || 'gray'}
                                variant="subtle"
                              >
                                {notification.type}
                              </Badge>
                            </HStack>
                          </Td>
                          <Td>
                            <Badge
                              colorScheme={categoryColors[notification.category as keyof typeof categoryColors] || 'gray'}
                              variant="subtle"
                            >
                              {notification.category}
                            </Badge>
                          </Td>
                          <Td>
                            <VStack align="start" spacing={0}>
                              <Text fontSize="sm">{formatTimestamp(notification.created_at)}</Text>
                              <Text fontSize="xs" color="gray.500">
                                {new Date(notification.created_at).toLocaleDateString()}
                              </Text>
                            </VStack>
                          </Td>
                          <Td>
                            <HStack spacing={2}>
                              <Tooltip label="Ver detalles">
                                <IconButton
                                  aria-label="Ver detalles"
                                  icon={<FaEye />}
                                  size="sm"
                                  variant="ghost"
                                  colorScheme="blue"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewNotification(notification);
                                  }}
                                />
                              </Tooltip>
                              {!notification.read && (
                                <Tooltip label="Marcar como leída">
                                  <IconButton
                                    aria-label="Marcar como leída"
                                    icon={<FaCheck />}
                                    size="sm"
                                    variant="ghost"
                                    colorScheme="green"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleMarkAsRead(notification.id);
                                    }}
                                  />
                                </Tooltip>
                              )}
                              <Menu>
                                <MenuButton
                                  as={IconButton}
                                  aria-label="Más opciones"
                                  icon={<FaEllipsisV />}
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <MenuList>
                                  <MenuItem icon={<FaUser />}>
                                    Ver usuario
                                  </MenuItem>
                                  <MenuItem icon={<FaClock />}>
                                    Ver historial
                                  </MenuItem>
                                  <MenuDivider />
                                  <MenuItem 
                                    icon={<FaTrash />} 
                                    color="red.500"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(notification.id);
                                    }}
                                  >
                                    Eliminar
                                  </MenuItem>
                                </MenuList>
                              </Menu>
                            </HStack>
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              </Box>
            )}

            {/* Paginación */}
            {notificationsData?.pagination && (
              <Flex justify="center" mt={6}>
                <HStack spacing={2}>
                  <Button
                    size="sm"
                    onClick={() => setCurrentPage(currentPage - 1)}
                    isDisabled={currentPage === 1}
                  >
                    Anterior
                  </Button>
                  <Text>
                    Página {currentPage} de {notificationsData.pagination.totalPages}
                  </Text>
                  <Button
                    size="sm"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    isDisabled={currentPage === notificationsData.pagination.totalPages}
                  >
                    Siguiente
                  </Button>
                </HStack>
              </Flex>
            )}
          </CardBody>
        </Card>
      </VStack>

      {/* Modal de Detalles de Notificación */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack>
              <Box 
                as={typeIcons[selectedNotification?.type as keyof typeof typeIcons] || FaBell} 
                color={`${typeColors[selectedNotification?.type as keyof typeof typeColors]}.500`} 
              />
              <Text>Detalles de la Notificación</Text>
            </HStack>
          </ModalHeader>
          <ModalBody>
            {selectedNotification && (
              <VStack spacing={4} align="stretch">
                <Box>
                  <HStack justify="space-between" mb={2}>
                    <Text fontWeight="semibold" fontSize="lg">
                      {selectedNotification.title}
                    </Text>
                    <Badge colorScheme={typeColors[selectedNotification.type as keyof typeof typeColors]}>
                      {selectedNotification.type}
                    </Badge>
                  </HStack>
                  <Text fontSize="sm" color="gray.600">
                    {formatTimestamp(selectedNotification.created_at)} • {selectedNotification.category}
                  </Text>
                </Box>

                <Divider />

                <Box>
                  <Text fontWeight="semibold" mb={2}>Mensaje</Text>
                  <Text>{selectedNotification.message}</Text>
                </Box>

                {selectedNotification.metadata && (
                  <Box>
                    <Text fontWeight="semibold" mb={2}>Información Adicional</Text>
                    <Box
                      as="pre"
                      fontSize="sm"
                      color="gray.600"
                      whiteSpace="pre-wrap"
                    >
                      {JSON.stringify(selectedNotification.metadata, null, 2)}
                    </Box>
                  </Box>
                )}
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <HStack spacing={3}>
              {selectedNotification && !selectedNotification.read && (
                <Button
                  leftIcon={<FaCheck />}
                  colorScheme="green"
                  onClick={() => {
                    handleMarkAsRead(selectedNotification.id);
                    onClose();
                  }}
                >
                  Marcar como leída
                </Button>
              )}
              <Button onClick={onClose}>Cerrar</Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default Notificaciones;
