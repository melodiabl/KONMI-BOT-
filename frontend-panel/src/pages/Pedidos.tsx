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
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  FormControl,
  FormLabel,
  Textarea,
  Select,
  useToast,
  Spinner,
  Alert,
  AlertIcon,
  Flex,
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
  Link,
  Avatar,
} from '@chakra-ui/react';
import {
  FaSearch,
  FaPlus,
  FaEdit,
  FaTrash,
  FaEye,
  FaEllipsisV,
  FaCheck,
  FaTimes,
  FaClock,
  FaUser,
  FaFileAlt,
  FaLink,
  FaDownload,
  FaShare,
  FaExclamationTriangle,
  FaCheckCircle,
  FaHourglassHalf,
  FaBan,
} from 'react-icons/fa';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiService } from '../services/api';
import { Pedido } from '../types';



interface PedidoFormData {
  titulo: string;
  descripcion: string;
  contenido_solicitado: string;
  estado: 'pendiente' | 'resuelto';
  prioridad: string;
  grupo_id?: number;
}

const estadoColors = {
  pendiente: 'yellow',
  resuelto: 'green',
};

const prioridadColors = {
  baja: 'green',
  media: 'yellow',
  alta: 'orange',
  urgente: 'red',
};

export const Pedidos: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [prioridadFilter, setPrioridadFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingPedido, setEditingPedido] = useState<Pedido | null>(null);
  const [formData, setFormData] = useState<PedidoFormData>({
    titulo: '',
    descripcion: '',
    contenido_solicitado: '',
    estado: 'pendiente',
    prioridad: 'media',
  });

  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();
  const queryClient = useQueryClient();

  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Queries
  const { data: pedidosData, isLoading, error } = useQuery(
    ['pedidos', currentPage, searchTerm, estadoFilter, prioridadFilter],
    () => apiService.getPedidos(currentPage, 20, searchTerm, estadoFilter)
  );

  const { data: stats } = useQuery('pedidoStats', apiService.getPedidoStats);

  // Mutations
  const createPedidoMutation = useMutation(apiService.createPedido, {
    onSuccess: () => {
      queryClient.invalidateQueries('pedidos');
      toast({
        title: 'Pedido creado',
        description: 'El pedido ha sido creado exitosamente',
        status: 'success',
      });
      onClose();
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Error al crear pedido',
        status: 'error',
      });
    },
  });

  const updatePedidoMutation = useMutation(
    (data: { id: number; pedido: Partial<Pedido> }) =>
      apiService.updatePedido(data.id, data.pedido),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('pedidos');
        toast({
          title: 'Pedido actualizado',
          description: 'El pedido ha sido actualizado exitosamente',
          status: 'success',
        });
        onClose();
        resetForm();
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al actualizar pedido',
          status: 'error',
        });
      },
    }
  );

  const deletePedidoMutation = useMutation(apiService.deletePedido, {
    onSuccess: () => {
      queryClient.invalidateQueries('pedidos');
      toast({
        title: 'Pedido eliminado',
        description: 'El pedido ha sido eliminado exitosamente',
        status: 'success',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Error al eliminar pedido',
        status: 'error',
      });
    },
  });

  const resolvePedidoMutation = useMutation(
    (data: { id: number; aporte_id?: number }) =>
      apiService.resolvePedido(data.id, data.aporte_id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('pedidos');
        toast({
          title: 'Pedido resuelto',
          description: 'El pedido ha sido marcado como completado',
          status: 'success',
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al resolver pedido',
          status: 'error',
        });
      },
    }
  );

  const resetForm = () => {
    setFormData({
      titulo: '',
      descripcion: '',
      contenido_solicitado: '',
      estado: 'pendiente',
      prioridad: 'media',
    });
    setEditingPedido(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    onOpen();
  };

  const handleOpenEdit = (pedido: Pedido) => {
    setEditingPedido(pedido);
    setFormData({
      titulo: pedido.titulo,
      descripcion: pedido.descripcion || '',
      contenido_solicitado: pedido.contenido_solicitado,
      estado: pedido.estado as 'pendiente' | 'resuelto',
      prioridad: pedido.prioridad,
      grupo_id: pedido.grupo_id,
    });
    onOpen();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingPedido) {
      updatePedidoMutation.mutate({
        id: editingPedido.id,
        pedido: formData as Partial<Pedido>,
      });
    } else {
      createPedidoMutation.mutate(formData as Partial<Pedido>);
    }
  };

  const handleDelete = (pedidoId: number) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar este pedido?')) {
      deletePedidoMutation.mutate(pedidoId);
    }
  };

  const handleResolve = (pedidoId: number) => {
    const aporteId = window.prompt('ID del aporte relacionado (opcional):');
    resolvePedidoMutation.mutate({ id: pedidoId, aporte_id: aporteId ? parseInt(aporteId) : undefined });
  };

  const handleEstadoChange = (pedidoId: number, newEstado: 'pendiente' | 'resuelto') => {
    updatePedidoMutation.mutate({
      id: pedidoId,
      pedido: { estado: newEstado },
    });
  };

  if (error) {
    return (
      <Alert status="error">
        <AlertIcon />
        Error al cargar pedidos: {(error as any).message}
      </Alert>
    );
  }

  return (
    <Box>
      <VStack spacing={6} align="stretch">
        {/* Header */}
        <Flex align="center" justify="space-between">
          <Heading size="lg">Gestión de Pedidos</Heading>
          <Button
            leftIcon={<FaPlus />}
            colorScheme="green"
            onClick={handleOpenCreate}
          >
            Nuevo Pedido
          </Button>
        </Flex>

        {/* Estadísticas */}
        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardBody>
            <HStack spacing={8} justify="center">
              <Stat textAlign="center">
                <StatLabel>Total Pedidos</StatLabel>
                <StatNumber>{stats?.totalPedidos || 0}</StatNumber>
                <StatHelpText>En el sistema</StatHelpText>
              </Stat>
              <Stat textAlign="center">
                <StatLabel>Pendientes</StatLabel>
                <StatNumber color="yellow.500">{stats?.pedidosPendientes || 0}</StatNumber>
                <StatHelpText>Requieren atención</StatHelpText>
              </Stat>
              <Stat textAlign="center">
                <StatLabel>En Proceso</StatLabel>
                <StatNumber color="blue.500">{stats?.pedidosEnProceso || 0}</StatNumber>
                <StatHelpText>En desarrollo</StatHelpText>
              </Stat>
              <Stat textAlign="center">
                <StatLabel>Completados</StatLabel>
                <StatNumber color="green.500">{stats?.pedidosCompletados || 0}</StatNumber>
                <StatHelpText>Finalizados</StatHelpText>
              </Stat>
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
                  placeholder="Buscar pedidos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </InputGroup>
              <Select
                placeholder="Filtrar por estado"
                value={estadoFilter}
                onChange={(e) => setEstadoFilter(e.target.value)}
                maxW="200px"
              >
                <option value="pendiente">Pendiente</option>
                <option value="resuelto">Resuelto</option>
              </Select>
              <Select
                placeholder="Filtrar por prioridad"
                value={prioridadFilter}
                onChange={(e) => setPrioridadFilter(e.target.value)}
                maxW="200px"
              >
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </Select>
            </HStack>
          </CardBody>
        </Card>

        {/* Tabla */}
        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardBody>
            {isLoading ? (
              <Box textAlign="center" py={8}>
                <Spinner size="xl" />
                <Text mt={4}>Cargando pedidos...</Text>
              </Box>
            ) : (
              <Box overflowX="auto">
                <Table variant="simple">
                  <Thead>
                    <Tr>
                      <Th>Título</Th>
                      <Th>Estado</Th>
                      <Th>Prioridad</Th>
                      <Th>Usuario</Th>
                      <Th>Aporte Relacionado</Th>
                      <Th>Fecha</Th>
                      <Th>Acciones</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {pedidosData?.pedidos?.map((pedido: Pedido) => (
                      <Tr key={pedido.id}>
                        <Td>
                          <VStack align="start" spacing={1}>
                            <Text fontWeight="semibold">{pedido.titulo}</Text>
                            {pedido.descripcion && (
                              <Text fontSize="sm" color="gray.500" noOfLines={2}>
                                {pedido.descripcion}
                              </Text>
                            )}
                            <Text fontSize="xs" color="gray.400">
                              ID: {pedido.id}
                            </Text>
                          </VStack>
                        </Td>
                        <Td>
                          <Badge
                            colorScheme={estadoColors[pedido.estado as keyof typeof estadoColors] || 'gray'}
                            variant="subtle"
                          >
                            {pedido.estado.replace('_', ' ')}
                          </Badge>
                        </Td>
                        <Td>
                          <Badge
                            colorScheme={prioridadColors[pedido.prioridad as keyof typeof prioridadColors] || 'gray'}
                            variant="subtle"
                          >
                            {pedido.prioridad}
                          </Badge>
                        </Td>
                        <Td>
                          <HStack>
                            <Avatar size="sm" name={pedido.usuario?.username} />
                            <Text fontSize="sm">{pedido.usuario?.username || 'N/A'}</Text>
                          </HStack>
                        </Td>
                        <Td>
                          {pedido.aporte ? (
                            <Link color="blue.500" fontSize="sm">
                              {pedido.aporte.titulo}
                            </Link>
                          ) : (
                            <Text fontSize="sm" color="gray.500">
                              Sin aporte
                            </Text>
                          )}
                        </Td>
                        <Td>
                          <VStack align="start" spacing={0}>
                            <Text fontSize="sm">
                              {new Date(pedido.created_at).toLocaleDateString()}
                            </Text>
                            <Text fontSize="xs" color="gray.500">
                              {new Date(pedido.created_at).toLocaleTimeString()}
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
                              />
                            </Tooltip>
                            <Tooltip label="Editar pedido">
                              <IconButton
                                aria-label="Editar pedido"
                                icon={<FaEdit />}
                                size="sm"
                                variant="ghost"
                                colorScheme="orange"
                                onClick={() => handleOpenEdit(pedido)}
                              />
                            </Tooltip>
                            <Menu>
                              <MenuButton
                                as={IconButton}
                                aria-label="Más opciones"
                                icon={<FaEllipsisV />}
                                size="sm"
                                variant="ghost"
                              />
                              <MenuList>
                                {pedido.estado === 'pendiente' && (
                                  <>
                                    <MenuItem
                                      icon={<FaHourglassHalf />}
                                      onClick={() => handleEstadoChange(pedido.id, 'resuelto')}
                                    >
                                      Marcar en proceso
                                    </MenuItem>
                                    <MenuItem
                                      icon={<FaCheckCircle />}
                                      onClick={() => handleResolve(pedido.id)}
                                    >
                                      Completar
                                    </MenuItem>
                                  </>
                                )}
                                {pedido.estado === 'resuelto' && (
                                  <MenuItem
                                    icon={<FaCheckCircle />}
                                    onClick={() => handleResolve(pedido.id)}
                                  >
                                    Completar
                                  </MenuItem>
                                )}
                                {pedido.estado === 'pendiente' && (
                                  <>
                                    <MenuItem
                                      icon={<FaBan />}
                                      onClick={() => handleEstadoChange(pedido.id, 'resuelto')}
                                    >
                                      Cancelar
                                    </MenuItem>
                                    <MenuItem
                                      icon={<FaTimes />}
                                      onClick={() => handleEstadoChange(pedido.id, 'resuelto')}
                                    >
                                      Rechazar
                                    </MenuItem>
                                  </>
                                )}
                                <MenuDivider />
                                <MenuItem
                                  icon={<FaTrash />}
                                  color="red.500"
                                  onClick={() => handleDelete(pedido.id)}
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
              </Box>
            )}

            {/* Paginación */}
            {pedidosData?.pagination && (
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
                    Página {currentPage} de {pedidosData.pagination.totalPages}
                  </Text>
                  <Button
                    size="sm"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    isDisabled={currentPage === pedidosData.pagination.totalPages}
                  >
                    Siguiente
                  </Button>
                </HStack>
              </Flex>
            )}
          </CardBody>
        </Card>
      </VStack>

      {/* Modal de Crear/Editar Pedido */}
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <form onSubmit={handleSubmit}>
            <ModalHeader>
              {editingPedido ? 'Editar Pedido' : 'Crear Nuevo Pedido'}
            </ModalHeader>
            <ModalBody>
              <VStack spacing={4}>
                <FormControl isRequired>
                  <FormLabel>Título</FormLabel>
                  <Input
                    value={formData.titulo}
                    onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                    placeholder="Ingresa el título del pedido"
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>Descripción</FormLabel>
                  <Textarea
                    value={formData.descripcion}
                    onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                    placeholder="Descripción opcional del pedido"
                    rows={3}
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>Contenido Solicitado</FormLabel>
                  <Textarea
                    value={formData.contenido_solicitado}
                    onChange={(e) => setFormData({ ...formData, contenido_solicitado: e.target.value })}
                    placeholder="Describe el contenido que necesitas"
                    rows={5}
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>Estado</FormLabel>
                  <Select
                    value={formData.estado}
                    onChange={(e) => setFormData({ ...formData, estado: e.target.value as 'pendiente' | 'resuelto' })}
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="resuelto">Resuelto</option>
                  </Select>
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>Prioridad</FormLabel>
                  <Select
                    value={formData.prioridad}
                    onChange={(e) => setFormData({ ...formData, prioridad: e.target.value })}
                  >
                    <option value="baja">Baja</option>
                    <option value="media">Media</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </Select>
                </FormControl>
              </VStack>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" mr={3} onClick={onClose}>
                Cancelar
              </Button>
              <Button
                colorScheme="blue"
                type="submit"
                isLoading={createPedidoMutation.isLoading || updatePedidoMutation.isLoading}
              >
                {editingPedido ? 'Actualizar' : 'Crear'}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default Pedidos;



