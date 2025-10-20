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
  Switch,
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
  Select,
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
  FaUsers,
  FaWhatsapp,
  FaShieldAlt,
  FaStore,
  FaCalendar,
  FaUser,
} from 'react-icons/fa';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiService } from '../services/api';

interface Group {
  id: number;
  nombre: string;
  descripcion?: string;
  wa_jid: string;
  autorizado: boolean;
  es_proveedor: boolean;
  created_at: string;
  updated_at: string;
  usuario_id?: number;
  usuario?: {
    username: string;
  };
}

interface GroupFormData {
  nombre: string;
  descripcion: string;
  wa_jid: string;
  autorizado: boolean;
  es_proveedor: boolean;
}

export const Grupos: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [autorizadoFilter, setAutorizadoFilter] = useState('');
  const [proveedorFilter, setProveedorFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [formData, setFormData] = useState<GroupFormData>({
    nombre: '',
    descripcion: '',
    wa_jid: '',
    autorizado: false,
    es_proveedor: false,
  });

  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();
  const queryClient = useQueryClient();

  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Queries
  const { data: gruposData, isLoading, error } = useQuery(
    ['grupos', currentPage, searchTerm, autorizadoFilter, proveedorFilter],
    () => apiService.getGroups(currentPage, 20, searchTerm)
  );

  const { data: stats } = useQuery('groupStats', apiService.getGroupStats);

  // Mutations
  const createGroupMutation = useMutation(apiService.createGrupo, {
    onSuccess: () => {
      queryClient.invalidateQueries('grupos');
      toast({
        title: 'Grupo creado',
        description: 'El grupo ha sido creado exitosamente',
        status: 'success',
      });
      onClose();
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Error al crear grupo',
        status: 'error',
      });
    },
  });

  const updateGroupMutation = useMutation(
    (data: { id: number; group: Partial<Group> }) =>
      apiService.updateGrupo(data.id, data.group),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('grupos');
        toast({
          title: 'Grupo actualizado',
          description: 'El grupo ha sido actualizado exitosamente',
          status: 'success',
        });
        onClose();
        resetForm();
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al actualizar grupo',
          status: 'error',
        });
      },
    }
  );

  const deleteGroupMutation = useMutation(apiService.deleteGrupo, {
    onSuccess: () => {
      queryClient.invalidateQueries('grupos');
      toast({
        title: 'Grupo eliminado',
        description: 'El grupo ha sido eliminado exitosamente',
        status: 'success',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Error al eliminar grupo',
        status: 'error',
      });
    },
  });

  const authorizeGroupMutation = useMutation(
    (data: { id: number; autorizado: boolean }) =>
      apiService.authorizeGroup(data.id, data.autorizado),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('grupos');
        toast({
          title: 'Autorización actualizada',
          description: 'La autorización del grupo ha sido actualizada',
          status: 'success',
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al actualizar autorización',
          status: 'error',
        });
      },
    }
  );

  const toggleProviderMutation = useMutation(
    (data: { id: number; es_proveedor: boolean }) =>
      apiService.toggleProvider(data.id, data.es_proveedor),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('grupos');
        toast({
          title: 'Estado de proveedor actualizado',
          description: 'El estado de proveedor ha sido actualizado',
          status: 'success',
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al actualizar estado de proveedor',
          status: 'error',
        });
      },
    }
  );

  const resetForm = () => {
    setFormData({
      nombre: '',
      descripcion: '',
      wa_jid: '',
      autorizado: false,
      es_proveedor: false,
    });
    setEditingGroup(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    onOpen();
  };

  const handleOpenEdit = (group: Group) => {
    setEditingGroup(group);
    setFormData({
      nombre: group.nombre,
      descripcion: group.descripcion || '',
      wa_jid: group.wa_jid,
      autorizado: group.autorizado,
      es_proveedor: group.es_proveedor,
    });
    onOpen();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingGroup) {
      updateGroupMutation.mutate({
        id: editingGroup.id,
        group: formData,
      });
    } else {
      createGroupMutation.mutate(formData);
    }
  };

  const handleDelete = (groupId: number) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar este grupo?')) {
      deleteGroupMutation.mutate(groupId);
    }
  };

  const handleAutorizar = (groupId: number, autorizado: boolean) => {
    authorizeGroupMutation.mutate({ id: groupId, autorizado });
  };

  const handleToggleProvider = (groupId: number, es_proveedor: boolean) => {
    toggleProviderMutation.mutate({ id: groupId, es_proveedor });
  };

  if (error) {
    return (
      <Alert status="error">
        <AlertIcon />
        Error al cargar grupos: {(error as any).message}
      </Alert>
    );
  }

  return (
    <Box>
      <VStack spacing={6} align="stretch">
        {/* Header */}
        <Flex align="center" justify="space-between">
          <Heading size="lg">Gestión de Grupos</Heading>
          <Button
            leftIcon={<FaPlus />}
            colorScheme="green"
            onClick={handleOpenCreate}
          >
            Nuevo Grupo
          </Button>
        </Flex>

        {/* Estadísticas */}
        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardBody>
            <HStack spacing={8} justify="center">
              <Stat textAlign="center">
                <StatLabel>Total Grupos</StatLabel>
                <StatNumber>{stats?.totalGrupos || 0}</StatNumber>
                <StatHelpText>Registrados en el sistema</StatHelpText>
              </Stat>
              <Stat textAlign="center">
                <StatLabel>Autorizados</StatLabel>
                <StatNumber color="green.500">{stats?.gruposAutorizados || 0}</StatNumber>
                <StatHelpText>Grupos autorizados</StatHelpText>
              </Stat>
              <Stat textAlign="center">
                <StatLabel>Proveedores</StatLabel>
                <StatNumber color="blue.500">{stats?.gruposProveedores || 0}</StatNumber>
                <StatHelpText>Grupos proveedores</StatHelpText>
              </Stat>
            </HStack>
          </CardBody>
        </Card>

        {/* Filtros */}
        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardBody>
            <HStack spacing={4}>
              <InputGroup maxW="300px">
                <InputLeftElement pointerEvents="none">
                  <FaSearch color="gray.300" />
                </InputLeftElement>
                <Input
                  placeholder="Buscar grupos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </InputGroup>
              <Select
                placeholder="Filtrar por autorización"
                value={autorizadoFilter}
                onChange={(e) => setAutorizadoFilter(e.target.value)}
                maxW="200px"
              >
                <option value="true">Autorizados</option>
                <option value="false">No autorizados</option>
              </Select>
              <Select
                placeholder="Filtrar por proveedor"
                value={proveedorFilter}
                onChange={(e) => setProveedorFilter(e.target.value)}
                maxW="200px"
              >
                <option value="true">Proveedores</option>
                <option value="false">No proveedores</option>
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
                <Text mt={4}>Cargando grupos...</Text>
              </Box>
            ) : (
              <Box overflowX="auto">
                <Table variant="simple">
                  <Thead>
                    <Tr>
                      <Th>Grupo</Th>
                      <Th>WhatsApp JID</Th>
                      <Th>Autorizado</Th>
                      <Th>Proveedor</Th>
                      <Th>Usuario</Th>
                      <Th>Fecha Creación</Th>
                      <Th>Acciones</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {gruposData?.grupos?.map((group: Group) => (
                      <Tr key={group.id}>
                        <Td>
                          <VStack align="start" spacing={1}>
                            <Text fontWeight="semibold">{group.nombre}</Text>
                            {group.descripcion && (
                              <Text fontSize="sm" color="gray.500" noOfLines={2}>
                                {group.descripcion}
                              </Text>
                            )}
                            <Text fontSize="xs" color="gray.400">
                              ID: {group.id}
                            </Text>
                          </VStack>
                        </Td>
                        <Td>
                          <Text fontSize="sm" fontFamily="mono">
                            {group.wa_jid}
                          </Text>
                        </Td>
                        <Td>
                          <Badge
                            colorScheme={group.autorizado ? 'green' : 'red'}
                            variant="subtle"
                          >
                            {group.autorizado ? 'Autorizado' : 'No autorizado'}
                          </Badge>
                        </Td>
                        <Td>
                          <Badge
                            colorScheme={group.es_proveedor ? 'blue' : 'gray'}
                            variant="subtle"
                          >
                            {group.es_proveedor ? 'Proveedor' : 'Usuario'}
                          </Badge>
                        </Td>
                        <Td>
                          {group.usuario ? (
                            <Text fontSize="sm">{group.usuario.username}</Text>
                          ) : (
                            <Text fontSize="sm" color="gray.500">
                              Sin asignar
                            </Text>
                          )}
                        </Td>
                        <Td>
                          <Text fontSize="sm">
                            {new Date(group.created_at).toLocaleDateString()}
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
                            <Tooltip label="Editar grupo">
                              <IconButton
                                aria-label="Editar grupo"
                                icon={<FaEdit />}
                                size="sm"
                                variant="ghost"
                                colorScheme="orange"
                                onClick={() => handleOpenEdit(group)}
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
                                <MenuItem
                                  icon={group.autorizado ? <FaTimes /> : <FaCheck />}
                                  onClick={() => handleAutorizar(group.id, !group.autorizado)}
                                >
                                  {group.autorizado ? 'Desautorizar' : 'Autorizar'}
                                </MenuItem>
                                <MenuItem
                                  icon={<FaStore />}
                                  onClick={() => handleToggleProvider(group.id, !group.es_proveedor)}
                                >
                                  {group.es_proveedor ? 'Quitar proveedor' : 'Marcar como proveedor'}
                                </MenuItem>
                                <MenuDivider />
                                <MenuItem
                                  icon={<FaTrash />}
                                  color="red.500"
                                  onClick={() => handleDelete(group.id)}
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
            {gruposData?.pagination && (
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
                    Página {currentPage} de {gruposData.pagination.totalPages}
                  </Text>
                  <Button
                    size="sm"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    isDisabled={currentPage === gruposData.pagination.totalPages}
                  >
                    Siguiente
                  </Button>
                </HStack>
              </Flex>
            )}
          </CardBody>
        </Card>
      </VStack>

      {/* Modal de Crear/Editar Grupo */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <form onSubmit={handleSubmit}>
            <ModalHeader>
              {editingGroup ? 'Editar Grupo' : 'Crear Nuevo Grupo'}
            </ModalHeader>
            <ModalBody>
              <VStack spacing={4}>
                <FormControl isRequired>
                  <FormLabel>Nombre del Grupo</FormLabel>
                  <Input
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    placeholder="Ingresa el nombre del grupo"
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>Descripción</FormLabel>
                  <Textarea
                    value={formData.descripcion}
                    onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                    placeholder="Descripción opcional del grupo"
                    rows={3}
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>WhatsApp JID</FormLabel>
                  <Input
                    value={formData.wa_jid}
                    onChange={(e) => setFormData({ ...formData, wa_jid: e.target.value })}
                    placeholder="1234567890-1234567890@g.us"
                  />
                </FormControl>

                <FormControl display="flex" alignItems="center">
                  <FormLabel mb="0">
                    <HStack>
                      <FaCheck />
                      <Text>Autorizado</Text>
                    </HStack>
                  </FormLabel>
                  <Switch
                    isChecked={formData.autorizado}
                    onChange={(e) => setFormData({ ...formData, autorizado: e.target.checked })}
                    colorScheme="green"
                  />
                </FormControl>

                <FormControl display="flex" alignItems="center">
                  <FormLabel mb="0">
                    <HStack>
                      <FaStore />
                      <Text>Es Proveedor</Text>
                    </HStack>
                  </FormLabel>
                  <Switch
                    isChecked={formData.es_proveedor}
                    onChange={(e) => setFormData({ ...formData, es_proveedor: e.target.checked })}
                    colorScheme="blue"
                  />
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
                isLoading={createGroupMutation.isLoading || updateGroupMutation.isLoading}
              >
                {editingGroup ? 'Actualizar' : 'Crear'}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default Grupos;



