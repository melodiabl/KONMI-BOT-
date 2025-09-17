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
import { apiService, getGrupos, getGroupStats } from '../services/api';
import { RUNTIME_CONFIG } from '../config/runtime-config';

interface Group {
  id: number;
  nombre: string;
  descripcion?: string;
  wa_jid: string;
  bot_enabled: boolean;
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
  bot_enabled: boolean;
  es_proveedor: boolean;
}

export const Grupos: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [botEnabledFilter, setBotEnabledFilter] = useState('');
  const [proveedorFilter, setProveedorFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [formData, setFormData] = useState<GroupFormData>({
    nombre: '',
    descripcion: '',
    wa_jid: '',
    bot_enabled: true,
    es_proveedor: false,
  });

  // Estado para los grupos de WhatsApp disponibles
  const [waGroups, setWaGroups] = useState<any[]>([]);
  const [waGroupsLoading, setWaGroupsLoading] = useState(false);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();
  const queryClient = useQueryClient();

  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Queries
  const { data: gruposData, isLoading, error } = useQuery(
    ['grupos', currentPage, searchTerm, botEnabledFilter, proveedorFilter],
    () => getGrupos(currentPage, 20, searchTerm, botEnabledFilter, proveedorFilter)
  );

  const { data: stats } = useQuery('groupStats', getGroupStats);

  // Mutations
  const createGroupMutation = useMutation(apiService.createGrupo, {
    onSuccess: () => {
      queryClient.invalidateQueries('grupos');
      queryClient.invalidateQueries('groupStats');
      toast({
        title: 'Grupo añadido',
        description: 'El grupo ha sido añadido exitosamente',
        status: 'success',
      });
      onClose();
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Error al añadir grupo',
        status: 'error',
      });
    },
  });

  const updateGroupMutation = useMutation(
    (data: { id: string | number; group: Partial<Group> }) =>
      apiService.updateGrupo(data.id, data.group),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('grupos');
        queryClient.invalidateQueries('groupStats');
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
      queryClient.invalidateQueries('groupStats');
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
    (data: { jid: string; enabled: boolean }) =>
      apiService.authorizeGroup(data.jid, data.enabled),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('grupos');
        queryClient.invalidateQueries('groupStats');
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
    (data: { id: string | number; es_proveedor: boolean }) =>
      apiService.toggleProvider(data.id, data.es_proveedor),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('grupos');
        queryClient.invalidateQueries('groupStats');
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
      bot_enabled: true,
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
      bot_enabled: (group as any).bot_enabled,
      es_proveedor: group.es_proveedor,
    });
    onOpen();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...formData } as any;

    if (editingGroup) {
      updateGroupMutation.mutate({
        id: (editingGroup as any).wa_jid || editingGroup.id,
        group: payload,
      });
    } else {
      if (!payload.wa_jid) {
        toast({ title: 'Selecciona un grupo de WhatsApp', status: 'warning' });
        return;
      }
      createGroupMutation.mutate(payload);
    }
  };

  const handleDelete = (group: Group) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar este grupo?')) {
      const identifier = group.wa_jid || group.id;
      const idValue = typeof identifier === 'number' ? identifier : String(identifier);
      deleteGroupMutation.mutate(idValue);
    }
  };

  const handleAutorizar = (jid: string | number, enabled: boolean) => {
    authorizeGroupMutation.mutate({ jid: String(jid), enabled });
  };

  const handleToggleProvider = (group: Group, es_proveedor: boolean) => {
    const identifier = group.wa_jid || group.id;
    const idValue = typeof identifier === 'number' ? identifier : String(identifier);
    toggleProviderMutation.mutate({ id: idValue, es_proveedor });
  };

  // Obtener los grupos de WhatsApp al abrir el modal de crear grupo
  useEffect(() => {
    if (isOpen && !editingGroup) {
      setWaGroupsLoading(true);
      apiService.getAvailableGrupos()
        .then((data) => {
          setWaGroups(data?.grupos || []);
          setWaGroupsLoading(false);
        })
        .catch(() => setWaGroupsLoading(false));
    }
  }, [isOpen, editingGroup]);

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
      const url = new URL('api/grupos/stream', normalizedBase);
      url.searchParams.set('token', token);
      eventSource = new EventSource(url.toString());
    } catch (eventError) {
      console.error('No se pudo iniciar la sincronización en tiempo real de grupos', eventError);
      return;
    }

    eventSource.onmessage = (event) => {
      if (!event.data) {
        return;
      }
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'grupoChanged') {
          queryClient.invalidateQueries('grupos');
          queryClient.invalidateQueries('groupStats');
        }
      } catch (err) {
        console.error('Error procesando actualización de grupos', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('Stream de grupos en tiempo real desconectado', err);
    };

    return () => {
      eventSource?.close();
    };
  }, [queryClient]);

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
            Añadir Grupo
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
                <StatLabel>Bot activo</StatLabel>
                <StatNumber color="green.500">{stats?.gruposActivos || 0}</StatNumber>
                <StatHelpText>Grupos con bot activado</StatHelpText>
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
                placeholder="Filtrar por estado del bot"
                value={botEnabledFilter}
                onChange={(e) => setBotEnabledFilter(e.target.value)}
                maxW="220px"
              >
                <option value="true">Bot activo</option>
                <option value="false">Bot inactivo</option>
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
                            colorScheme={(group as any).bot_enabled ? 'green' : 'red'}
                            variant="subtle"
                          >
                            {(group as any).bot_enabled ? 'Bot activo' : 'Bot inactivo'}
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
                                  icon={(group as any).bot_enabled ? <FaTimes /> : <FaCheck />}
                                  onClick={() => handleAutorizar(group.wa_jid || group.id, !(group as any).bot_enabled)}
                                >
                                  {(group as any).bot_enabled ? 'Desactivar bot' : 'Activar bot'}
                                </MenuItem>
                                <MenuItem
                                  icon={<FaStore />}
                                  onClick={() => handleToggleProvider(group, !group.es_proveedor)}
                                >
                                  {group.es_proveedor ? 'Quitar proveedor' : 'Marcar como proveedor'}
                                </MenuItem>
                                <MenuDivider />
                                <MenuItem
                                  icon={<FaTrash />}
                                  color="red.500"
                                  onClick={() => handleDelete(group)}
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
              {editingGroup ? 'Editar Grupo' : 'Añadir Grupo'}
            </ModalHeader>
            <ModalBody>
              <VStack spacing={4}>
                <FormControl isRequired>
                  <FormLabel>Nombre del Grupo</FormLabel>
                  {editingGroup ? (
                    <Input
                      value={formData.nombre}
                      onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                      placeholder="Ingresa el nombre del grupo"
                    />
                  ) : (
                    <Select
                      placeholder={waGroupsLoading ? 'Cargando grupos...' : 'Selecciona un grupo de WhatsApp'}
                      isDisabled={waGroupsLoading}
                      value={formData.wa_jid}
                      onChange={e => {
                        const selected = waGroups.find(g => g.jid === e.target.value);
                        setFormData({
                          ...formData,
                          nombre: selected?.nombre || '',
                          descripcion: selected?.descripcion || '',
                          wa_jid: selected?.jid || '',
                        });
                      }}
                    >
                      {waGroups.map(g => (
                        <option key={g.jid} value={g.jid}>
                          {g.nombre} ({g.participantes} participantes)
                        </option>
                      ))}
                    </Select>
                  )}
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
                    isReadOnly
                    placeholder="Selecciona un grupo para autocompletar"
                  />
                </FormControl>

                <FormControl display="flex" alignItems="center">
                  <FormLabel mb="0">
                    <HStack>
                      <FaCheck />
                      <Text>Bot activo</Text>
                    </HStack>
                  </FormLabel>
                  <Switch
                    isChecked={formData.bot_enabled}
                    onChange={(e) => setFormData({ ...formData, bot_enabled: e.target.checked })}
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
                {editingGroup ? 'Actualizar' : 'Añadir'}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default Grupos;
