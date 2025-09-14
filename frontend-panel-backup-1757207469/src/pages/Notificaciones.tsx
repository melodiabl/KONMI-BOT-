import React, { useState } from 'react';
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

interface Notification {
  id: number;
  title: string;
  message: string;
  type: string;
  category: string;
  read: boolean;
  user_id: number;
  created_at: string;
  updated_at: string;
  metadata?: any;
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
  const [typeFilter, setTypeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [readFilter, setReadFilter] = useState('');
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
    () => apiService.getNotificaciones(currentPage, 20)
  );

  const { data: stats } = useQuery('notificationStats', () => apiService.getNotificationStats());

  // Mutations
  const markAsReadMutation = useMutation(
    (id: number) => apiService.markAsRead(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('notifications');
        queryClient.invalidateQueries('notificationStats');
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

  const getNotificationStats = () => {
    if (!notificationsData?.notifications) return { total: 0, unread: 0, read: 0 };
    
    const total = notificationsData.notifications.length;
    const unread = notificationsData.notifications.filter((n: Notification) => !n.read).length;
    const read = total - unread;
    
    return { total, unread, read };
  };

  const notificationStats = getNotificationStats();

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
              isDisabled={notificationStats.unread === 0}
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
                  {notificationStats.total}
                </Badge>
                <Text fontSize="sm" fontWeight="semibold">Total</Text>
              </VStack>
              <VStack>
                <Badge colorScheme="red" size="lg">
                  {notificationStats.unread}
                </Badge>
                <Text fontSize="sm" fontWeight="semibold">No leídas</Text>
              </VStack>
              <VStack>
                <Badge colorScheme="green" size="lg">
                  {notificationStats.read}
                </Badge>
                <Text fontSize="sm" fontWeight="semibold">Leídas</Text>
              </VStack>
              <VStack>
                <Badge colorScheme="purple" size="lg">
                  {stats?.totalCategories || 0}
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
                placeholder="Filtrar por tipo"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                maxW="200px"
              >
                <option value="info">Info</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
                <option value="system">System</option>
              </Select>
              <Select
                placeholder="Filtrar por categoría"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                maxW="200px"
              >
                <option value="system">Sistema</option>
                <option value="user">Usuario</option>
                <option value="content">Contenido</option>
                <option value="security">Seguridad</option>
                <option value="general">General</option>
              </Select>
              <Select
                placeholder="Filtrar por estado"
                value={readFilter}
                onChange={(e) => setReadFilter(e.target.value)}
                maxW="200px"
              >
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
                    <Text fontSize="sm" color="gray.600">
                      {JSON.stringify(selectedNotification.metadata, null, 2)}
                    </Text>
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



