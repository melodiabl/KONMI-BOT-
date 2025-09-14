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
  Image,
  Link,
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
  FaThumbsUp,
  FaThumbsDown,
} from 'react-icons/fa';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiService } from '../services/api';
import { Aporte } from '../types';



interface AporteFormData {
  titulo: string;
  descripcion: string;
  contenido: string;
  tipo: string;
  fuente: 'colaborador' | 'proveedor';
  estado: 'pendiente' | 'aprobado' | 'rechazado';
  grupo_id?: number;
}

const estadoColors = {
  pendiente: 'yellow',
  aprobado: 'green',
  rechazado: 'red',
  revisando: 'blue',
};

const tipoColors = {
  manga: 'purple',
  anime: 'blue',
  novela: 'green',
  imagen: 'pink',
  video: 'red',
  otro: 'gray',
};

const fuenteColors = {
  usuario: 'blue',
  proveedor: 'green',
  admin: 'red',
  sistema: 'gray',
};

export const Aportes: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [fuenteFilter, setFuenteFilter] = useState('');
  const [tipoFilter, setTipoFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingAporte, setEditingAporte] = useState<Aporte | null>(null);
  const [formData, setFormData] = useState<AporteFormData>({
    titulo: '',
    descripcion: '',
    contenido: '',
    tipo: 'manga',
    fuente: 'colaborador',
    estado: 'pendiente',
  });

  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();
  const queryClient = useQueryClient();

  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Queries
  const { data: aportesData, isLoading, error } = useQuery(
    ['aportes', currentPage, searchTerm, estadoFilter, fuenteFilter, tipoFilter],
    () => apiService.getAportes(currentPage, 20, searchTerm, estadoFilter, fuenteFilter)
  );

  const { data: stats } = useQuery('aporteStats', apiService.getAporteStats);

  // Mutations
  const createAporteMutation = useMutation(apiService.createAporte, {
    onSuccess: () => {
      queryClient.invalidateQueries('aportes');
      toast({
        title: 'Aporte creado',
        description: 'El aporte ha sido creado exitosamente',
        status: 'success',
      });
      onClose();
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Error al crear aporte',
        status: 'error',
      });
    },
  });

  const updateAporteMutation = useMutation(
    (data: { id: number; aporte: Partial<Aporte> }) =>
      apiService.updateAporte(data.id, data.aporte),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('aportes');
        toast({
          title: 'Aporte actualizado',
          description: 'El aporte ha sido actualizado exitosamente',
          status: 'success',
        });
        onClose();
        resetForm();
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al actualizar aporte',
          status: 'error',
        });
      },
    }
  );

  const deleteAporteMutation = useMutation(apiService.deleteAporte, {
    onSuccess: () => {
      queryClient.invalidateQueries('aportes');
      toast({
        title: 'Aporte eliminado',
        description: 'El aporte ha sido eliminado exitosamente',
        status: 'success',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Error al eliminar aporte',
        status: 'error',
      });
    },
  });

  const approveAporteMutation = useMutation(
    (data: { id: number; estado: 'pendiente' | 'aprobado' | 'rechazado'; motivo_rechazo?: string }) =>
      apiService.approveAporte(data.id, data.estado, data.motivo_rechazo),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('aportes');
        toast({
          title: 'Estado actualizado',
          description: 'El estado del aporte ha sido actualizado',
          status: 'success',
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al actualizar estado',
          status: 'error',
        });
      },
    }
  );

  const resetForm = () => {
    setFormData({
      titulo: '',
      descripcion: '',
      contenido: '',
      tipo: 'manga',
      fuente: 'colaborador',
      estado: 'pendiente',
    });
    setEditingAporte(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    onOpen();
  };

  const handleOpenEdit = (aporte: Aporte) => {
    setEditingAporte(aporte);
    setFormData({
      titulo: aporte.titulo,
      descripcion: aporte.descripcion || '',
      contenido: aporte.contenido,
      tipo: aporte.tipo,
      fuente: aporte.fuente as 'colaborador' | 'proveedor',
      estado: aporte.estado as 'pendiente' | 'aprobado' | 'rechazado',
      grupo_id: aporte.grupo_id,
    });
    onOpen();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingAporte) {
      updateAporteMutation.mutate({
        id: editingAporte.id,
        aporte: formData as Partial<Aporte>,
      });
    } else {
      createAporteMutation.mutate(formData as Partial<Aporte>);
    }
  };

  const handleDelete = (aporteId: number) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar este aporte?')) {
      deleteAporteMutation.mutate(aporteId);
    }
  };

  const handleApprove = (aporteId: number) => {
    approveAporteMutation.mutate({ id: aporteId, estado: 'aprobado' });
  };

  const handleReject = (aporteId: number) => {
    const motivo = window.prompt('Motivo del rechazo:');
    if (motivo !== null) {
      approveAporteMutation.mutate({ id: aporteId, estado: 'rechazado', motivo_rechazo: motivo });
    }
  };

  if (error) {
    return (
      <Alert status="error">
        <AlertIcon />
        Error al cargar aportes: {(error as any).message}
      </Alert>
    );
  }

  return (
    <Box>
      <VStack spacing={6} align="stretch">
        {/* Header */}
        <Flex align="center" justify="space-between">
          <Heading size="lg">Gestión de Aportes</Heading>
          <Button
            leftIcon={<FaPlus />}
            colorScheme="green"
            onClick={handleOpenCreate}
          >
            Nuevo Aporte
          </Button>
        </Flex>

        {/* Estadísticas */}
        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardBody>
            <HStack spacing={8} justify="center">
              <Stat textAlign="center">
                <StatLabel>Total Aportes</StatLabel>
                <StatNumber>{stats?.totalAportes || 0}</StatNumber>
                <StatHelpText>En el sistema</StatHelpText>
              </Stat>
              <Stat textAlign="center">
                <StatLabel>Aprobados</StatLabel>
                <StatNumber color="green.500">{stats?.aportesAprobados || 0}</StatNumber>
                <StatHelpText>Aportes aprobados</StatHelpText>
              </Stat>
              <Stat textAlign="center">
                <StatLabel>Pendientes</StatLabel>
                <StatNumber color="yellow.500">{stats?.aportesPendientes || 0}</StatNumber>
                <StatHelpText>En revisión</StatHelpText>
              </Stat>
              <Stat textAlign="center">
                <StatLabel>Rechazados</StatLabel>
                <StatNumber color="red.500">{stats?.aportesRechazados || 0}</StatNumber>
                <StatHelpText>Aportes rechazados</StatHelpText>
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
                  placeholder="Buscar aportes..."
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
                <option value="aprobado">Aprobado</option>
                <option value="rechazado">Rechazado</option>
                <option value="revisando">Revisando</option>
              </Select>
              <Select
                placeholder="Filtrar por tipo"
                value={tipoFilter}
                onChange={(e) => setTipoFilter(e.target.value)}
                maxW="200px"
              >
                <option value="manga">Manga</option>
                <option value="anime">Anime</option>
                <option value="novela">Novela</option>
                <option value="imagen">Imagen</option>
                <option value="video">Video</option>
                <option value="otro">Otro</option>
              </Select>
              <Select
                placeholder="Filtrar por fuente"
                value={fuenteFilter}
                onChange={(e) => setFuenteFilter(e.target.value)}
                maxW="200px"
              >
                <option value="usuario">Usuario</option>
                <option value="proveedor">Proveedor</option>
                <option value="admin">Admin</option>
                <option value="sistema">Sistema</option>
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
                <Text mt={4}>Cargando aportes...</Text>
              </Box>
            ) : (
              <Box overflowX="auto">
                <Table variant="simple">
                  <Thead>
                    <Tr>
                      <Th>Título</Th>
                      <Th>Tipo</Th>
                      <Th>Fuente</Th>
                      <Th>Estado</Th>
                      <Th>Usuario</Th>
                      <Th>Fecha</Th>
                      <Th>Acciones</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {aportesData?.aportes?.map((aporte: Aporte) => (
                      <Tr key={aporte.id}>
                        <Td>
                          <VStack align="start" spacing={1}>
                            <Text fontWeight="semibold">{aporte.titulo}</Text>
                            {aporte.descripcion && (
                              <Text fontSize="sm" color="gray.500" noOfLines={2}>
                                {aporte.descripcion}
                              </Text>
                            )}
                            <Text fontSize="xs" color="gray.400">
                              ID: {aporte.id}
                            </Text>
                          </VStack>
                        </Td>
                        <Td>
                          <Badge
                            colorScheme={tipoColors[aporte.tipo as keyof typeof tipoColors] || 'gray'}
                            variant="subtle"
                          >
                            {aporte.tipo}
                          </Badge>
                        </Td>
                        <Td>
                          <Badge
                            colorScheme={fuenteColors[aporte.fuente as keyof typeof fuenteColors] || 'gray'}
                            variant="subtle"
                          >
                            {aporte.fuente}
                          </Badge>
                        </Td>
                        <Td>
                          <Badge
                            colorScheme={estadoColors[aporte.estado as keyof typeof estadoColors] || 'gray'}
                            variant="subtle"
                          >
                            {aporte.estado}
                          </Badge>
                        </Td>
                        <Td>
                          <Text fontSize="sm">{aporte.usuario?.username || 'N/A'}</Text>
                        </Td>
                        <Td>
                          <Text fontSize="sm">
                            {new Date(aporte.created_at).toLocaleDateString()}
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
                                colorScheme="blue"
                              />
                            </Tooltip>
                            <Tooltip label="Editar aporte">
                              <IconButton
                                aria-label="Editar aporte"
                                icon={<FaEdit />}
                                size="sm"
                                variant="ghost"
                                colorScheme="orange"
                                onClick={() => handleOpenEdit(aporte)}
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
                                {aporte.estado === 'pendiente' && (
                                  <>
                                    <MenuItem
                                      icon={<FaCheck />}
                                      onClick={() => handleApprove(aporte.id)}
                                    >
                                      Aprobar
                                    </MenuItem>
                                    <MenuItem
                                      icon={<FaTimes />}
                                      onClick={() => handleReject(aporte.id)}
                                    >
                                      Rechazar
                                    </MenuItem>
                                  </>
                                )}
                                <MenuItem
                                  icon={<FaDownload />}
                                >
                                  Descargar
                                </MenuItem>
                                <MenuItem
                                  icon={<FaShare />}
                                >
                                  Compartir
                                </MenuItem>
                                <MenuDivider />
                                <MenuItem
                                  icon={<FaTrash />}
                                  color="red.500"
                                  onClick={() => handleDelete(aporte.id)}
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
            {aportesData?.pagination && (
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
                    Página {currentPage} de {aportesData.pagination.totalPages}
                  </Text>
                  <Button
                    size="sm"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    isDisabled={currentPage === aportesData.pagination.totalPages}
                  >
                    Siguiente
                  </Button>
                </HStack>
              </Flex>
            )}
          </CardBody>
        </Card>
      </VStack>

      {/* Modal de Crear/Editar Aporte */}
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <form onSubmit={handleSubmit}>
            <ModalHeader>
              {editingAporte ? 'Editar Aporte' : 'Crear Nuevo Aporte'}
            </ModalHeader>
            <ModalBody>
              <VStack spacing={4}>
                <FormControl isRequired>
                  <FormLabel>Título</FormLabel>
                  <Input
                    value={formData.titulo}
                    onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                    placeholder="Ingresa el título del aporte"
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>Descripción</FormLabel>
                  <Textarea
                    value={formData.descripcion}
                    onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                    placeholder="Descripción opcional del aporte"
                    rows={3}
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>Contenido</FormLabel>
                  <Textarea
                    value={formData.contenido}
                    onChange={(e) => setFormData({ ...formData, contenido: e.target.value })}
                    placeholder="Contenido del aporte (enlace, texto, etc.)"
                    rows={5}
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>Tipo</FormLabel>
                  <Select
                    value={formData.tipo}
                    onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
                  >
                    <option value="manga">Manga</option>
                    <option value="anime">Anime</option>
                    <option value="novela">Novela</option>
                    <option value="imagen">Imagen</option>
                    <option value="video">Video</option>
                    <option value="otro">Otro</option>
                  </Select>
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>Fuente</FormLabel>
                  <Select
                    value={formData.fuente}
                    onChange={(e) => setFormData({ ...formData, fuente: e.target.value as 'colaborador' | 'proveedor' })}
                  >
                    <option value="colaborador">Colaborador</option>
                    <option value="proveedor">Proveedor</option>
                  </Select>
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>Estado</FormLabel>
                  <Select
                    value={formData.estado}
                    onChange={(e) => setFormData({ ...formData, estado: e.target.value as 'pendiente' | 'aprobado' | 'rechazado' })}
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="aprobado">Aprobado</option>
                    <option value="rechazado">Rechazado</option>

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
                isLoading={createAporteMutation.isLoading || updateAporteMutation.isLoading}
              >
                {editingAporte ? 'Actualizar' : 'Crear'}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default Aportes;



