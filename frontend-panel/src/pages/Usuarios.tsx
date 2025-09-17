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
  Progress,
  Tooltip,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
} from '@chakra-ui/react';
import {
  FaSearch,
  FaPlus,
  FaEdit,
  FaTrash,
  FaEye,
  FaEllipsisV,
  FaShieldAlt,
} from 'react-icons/fa';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiService, getUsuarios, getUsuarioStats } from '../services/api';
import { RUNTIME_CONFIG } from '../config/runtime-config';
import { useAuth } from '../contexts/AuthContext';

interface User {
  id: number;
  username: string;
  rol: string;
  whatsapp_number?: string;
  grupo_registro?: string;
  fecha_registro: string;
  created_at: string;
}

interface UserFormData {
  username: string;
  password: string;
  rol: string;
  whatsapp_number?: string;
}

const roleColors: Record<string, string> = {
  owner: 'purple',
  admin: 'red',
  moderador: 'green',
  colaborador: 'blue',
  creador: 'teal',
  usuario: 'gray',
};

const roleLabels: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  moderador: 'Moderador',
  colaborador: 'Colaborador',
  creador: 'Creador',
  usuario: 'Usuario',
};

// Removido - no usamos estados de activo/inactivo

export const Usuarios: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<UserFormData>({
    username: '',
    password: '',
    rol: 'usuario',
    whatsapp_number: '',
  });
  const [formErrors, setFormErrors] = useState<Partial<UserFormData>>({});

  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();
  const queryClient = useQueryClient();

  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  const currentRole = (currentUser as any)?.rol || (currentUser as any)?.roles?.[0] || 'usuario';
  const baseRoleOptions = [
    { value: 'owner', label: 'Propietario' },
    { value: 'admin', label: 'Administrador' },
    { value: 'moderador', label: 'Moderador' },
    { value: 'colaborador', label: 'Colaborador' },
    { value: 'usuario', label: 'Usuario' },
  ];

  const roleOptions = baseRoleOptions.filter((option) => {
    if (currentRole === 'owner') return true;
    if (currentRole === 'admin') {
      return option.value !== 'owner';
    }
    if (currentRole === 'moderador') {
      return ['moderador', 'usuario'].includes(option.value);
    }
    return option.value === 'usuario';
  });

  // Queries
  const { data: usuariosData, isLoading, error } = useQuery(
    ['usuarios', currentPage, searchTerm, roleFilter],
    () => getUsuarios(currentPage, 20, searchTerm, roleFilter)
  );

  const { data: stats } = useQuery('usuarioStats', getUsuarioStats);

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
      const url = new URL('api/usuarios/stream', normalizedBase);
      url.searchParams.set('token', token);
      eventSource = new EventSource(url.toString());
    } catch (error) {
      console.error('No se pudo iniciar la sincronización en tiempo real de usuarios', error);
      return;
    }

    eventSource.onmessage = (event) => {
      if (!event.data) {
        return;
      }
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'usuarioChanged') {
          queryClient.invalidateQueries('usuarios');
          queryClient.invalidateQueries('usuarioStats');
        }
      } catch (err) {
        console.error('Error procesando actualización de usuarios', err);
      }
    };

    eventSource.onerror = (error) => {
      console.error('Stream de usuarios en tiempo real desconectado', error);
    };

    return () => {
      eventSource?.close();
    };
  }, [queryClient]);

  // Mutations
  const createUserMutation = useMutation(apiService.createUsuario, {
    onSuccess: () => {
      queryClient.invalidateQueries('usuarios');
      queryClient.invalidateQueries('usuarioStats');
      toast({
        title: 'Usuario creado',
        description: 'El usuario ha sido creado exitosamente',
        status: 'success',
      });
      onClose();
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Error al crear usuario',
        status: 'error',
      });
    },
  });

  const updateUserMutation = useMutation(
    (data: { id: number; user: Partial<User> & { password?: string } }) =>
      apiService.updateUsuario(data.id, data.user),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('usuarios');
        queryClient.invalidateQueries('usuarioStats');
        toast({
          title: 'Usuario actualizado',
          description: 'El usuario ha sido actualizado exitosamente',
          status: 'success',
        });
        onClose();
        resetForm();
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al actualizar usuario',
          status: 'error',
        });
      },
    }
  );

  const deleteUserMutation = useMutation(apiService.deleteUsuario, {
    onSuccess: () => {
      queryClient.invalidateQueries('usuarios');
      queryClient.invalidateQueries('usuarioStats');
      toast({
        title: 'Usuario eliminado',
        description: 'El usuario ha sido eliminado exitosamente',
        status: 'success',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Error al eliminar usuario',
        status: 'error',
      });
    },
  });

  // Removido - no usamos estados de activo/inactivo

  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      rol: 'usuario',
      whatsapp_number: '',
    });
    setEditingUser(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    onOpen();
  };

  const handleOpenEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      rol: user.rol,
      whatsapp_number: user.whatsapp_number || '',
    });
    onOpen();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Validaciones
    const errs: Partial<UserFormData> = {};
    const uname = formData.username.trim();
    if (!uname || uname.length < 3) errs.username = 'Mínimo 3 caracteres';
    if (!editingUser) {
      if (!formData.password || formData.password.length < 6) errs.password = 'Mínimo 6 caracteres';
    } else if (formData.password && formData.password.length < 6) {
      errs.password = 'Mínimo 6 caracteres';
    }
    const allowed = ['usuario','colaborador','admin','owner'];
    if (!allowed.includes(formData.rol)) errs.rol = 'Rol inválido';
    if (formData.whatsapp_number && !/^\d{6,20}$/.test(formData.whatsapp_number.replace(/[^0-9]/g,''))) {
      errs.whatsapp_number = 'Solo dígitos (6-20)';
    }
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const payload: UserFormData = {
      ...formData,
      username: uname,
      whatsapp_number: formData.whatsapp_number?.trim() || undefined
    };

    if (editingUser) {
      const updatePayload: Partial<UserFormData> = { ...payload };
      if (!updatePayload.password) {
        delete updatePayload.password;
      }
      updateUserMutation.mutate({
        id: editingUser.id,
        user: updatePayload,
      });
    } else {
      createUserMutation.mutate(payload);
    }
  };

  const handleDelete = (userId: number) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar este usuario?')) {
      deleteUserMutation.mutate(userId);
    }
  };

  const handleResetPassword = async (user: User) => {
    try {
      const defaultWa = user.whatsapp_number || '';
      const wa = window.prompt('Confirma o ingresa el número de WhatsApp para resetear contraseña (solo dígitos):', defaultWa) || '';
      const cleanWa = wa.replace(/[^0-9]/g, '');
      if (!cleanWa) return;
      const resp = await apiService.resetUserPassword(user.username, cleanWa);
      if (resp?.success && resp.tempPassword) {
        toast({ title: 'Contraseña temporal generada', description: `Usuario: ${user.username} | Temp: ${resp.tempPassword}`, status: 'success', duration: 7000, isClosable: true });
      } else {
        toast({ title: 'No se pudo resetear', status: 'error' });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e?.response?.data?.error || e?.message || 'Fallo al resetear contraseña', status: 'error' });
    }
  };

  // Removido - no usamos estados de activo/inactivo

  if (error) {
    return (
      <Alert status="error">
        <AlertIcon />
        Error al cargar usuarios: {(error as any).message}
      </Alert>
    );
  }

  return (
    <Box>
      <VStack spacing={6} align="stretch">
        {/* Header */}
        <Flex align="center" justify="space-between">
          <Heading size="lg">Gestión de Usuarios</Heading>
          <Button
            leftIcon={<FaPlus />}
            colorScheme="green"
            onClick={handleOpenCreate}
          >
            Nuevo Usuario
          </Button>
        </Flex>

        {/* Estadísticas */}
        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardBody>
            <HStack spacing={8} justify="center">
              <Stat textAlign="center">
                <StatLabel>Total Usuarios</StatLabel>
                <StatNumber>{stats?.totalUsuarios || 0}</StatNumber>
                <StatHelpText>Registrados en el sistema</StatHelpText>
              </Stat>
              <Stat textAlign="center">
                <StatLabel>Activos</StatLabel>
                <StatNumber color="green.500">{stats?.usuariosActivos || 0}</StatNumber>
                <StatHelpText>Usuarios activos</StatHelpText>
              </Stat>
              <Stat textAlign="center">
                <StatLabel>Administradores</StatLabel>
                <StatNumber color="red.500">{stats?.totalAdmins || 0}</StatNumber>
                <StatHelpText>Con rol admin</StatHelpText>
              </Stat>
              <Stat textAlign="center">
                <StatLabel>Creadores</StatLabel>
                <StatNumber color="purple.500">{stats?.totalCreadores || 0}</StatNumber>
                <StatHelpText>Usuarios con rol creador</StatHelpText>
              </Stat>
              <Stat textAlign="center">
                <StatLabel>Moderadores</StatLabel>
                <StatNumber color="teal.500">{stats?.totalModeradores || 0}</StatNumber>
                <StatHelpText>Equipo de moderación</StatHelpText>
              </Stat>
            </HStack>
          </CardBody>
        </Card>

        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardHeader>
            <Heading size="md">Distribución por Roles</Heading>
          </CardHeader>
          <CardBody>
            <VStack spacing={4} align="stretch">
              {(stats?.usuariosPorRol || []).map((rolItem: { rol: string; count: number }) => {
                const count = Number(rolItem.count || 0);
                const percentage = (count / (stats?.totalUsuarios || 1)) * 100;
                const label = roleLabels[rolItem.rol] || rolItem.rol;
                return (
                  <Box key={rolItem.rol}>
                    <HStack justify="space-between">
                      <HStack>
                        <Badge colorScheme={roleColors[rolItem.rol] || 'gray'}>{label}</Badge>
                        <Text fontSize="sm">{label}</Text>
                      </HStack>
                      <Text fontWeight="semibold">{count}</Text>
                    </HStack>
                    <Progress value={percentage} colorScheme={roleColors[rolItem.rol] || 'gray'} mt={2} />
                  </Box>
                );
              })}
            </VStack>
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
                  placeholder="Buscar usuarios..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </InputGroup>
              <Select
                maxW="220px"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="all">Todos los roles</option>
                <option value="owner">Propietario</option>
                <option value="admin">Administrador</option>
                <option value="moderador">Moderador</option>
                <option value="colaborador">Colaborador</option>
                <option value="usuario">Usuario</option>
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
                <Text mt={4}>Cargando usuarios...</Text>
              </Box>
            ) : (
              <Box overflowX="auto">
                <Table variant="simple">
                  <Thead>
                    <Tr>
                      <Th>Usuario</Th>
                      <Th>Rol</Th>
                      <Th>WhatsApp</Th>
                      <Th>Grupo Registro</Th>
                      <Th>Fecha Creación</Th>
                      <Th>Acciones</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {usuariosData?.usuarios?.length === 0 && (
                      <Tr>
                        <Td colSpan={6}>
                          <Alert status="info" variant="subtle">
                            <AlertIcon />
                            No se encontraron usuarios.
                          </Alert>
                        </Td>
                      </Tr>
                    )}
                    {usuariosData?.usuarios?.map((user: User) => (
                      <Tr key={user.id}>
                        <Td>
                          <VStack align="start" spacing={1}>
                            <Text fontWeight="semibold">{user.username}</Text>
                            <Text fontSize="sm" color="gray.500">
                              ID: {user.id}
                            </Text>
                          </VStack>
                        </Td>
                        <Td>
                          <Badge
                            colorScheme={roleColors[user.rol as keyof typeof roleColors] || 'gray'}
                            variant="subtle"
                          >
                            {roleLabels[user.rol] || user.rol}
                          </Badge>
                        </Td>
                        <Td>
                          {user.whatsapp_number ? (
                            <Text fontSize="sm" color="green.500">
                              {user.whatsapp_number}
                            </Text>
                          ) : (
                            <Text fontSize="sm" color="gray.500">
                              No configurado
                            </Text>
                          )}
                        </Td>
                        <Td>
                          {user.grupo_registro ? (
                            <Text fontSize="sm" color="blue.500">
                              {user.grupo_registro}
                            </Text>
                          ) : (
                            <Text fontSize="sm" color="gray.500">
                              No registrado
                            </Text>
                          )}
                        </Td>
                        <Td>
                          <Text fontSize="sm">
                            {new Date(user.created_at).toLocaleDateString()}
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
                            <Tooltip label="Editar usuario">
                              <IconButton
                                aria-label="Editar usuario"
                                icon={<FaEdit />}
                                size="sm"
                                variant="ghost"
                                colorScheme="orange"
                                onClick={() => handleOpenEdit(user)}
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
                                  icon={<FaShieldAlt />}
                                  onClick={() => handleResetPassword(user)}
                                >
                                  Resetear Contraseña
                                </MenuItem>
                                <MenuItem
                                  icon={<FaTrash />}
                                  color="red.500"
                                  onClick={() => handleDelete(user.id)}
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
            {usuariosData?.pagination && (
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
                    Página {currentPage} de {usuariosData.pagination.totalPages}
                  </Text>
                  <Button
                    size="sm"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    isDisabled={currentPage === usuariosData.pagination.totalPages}
                  >
                    Siguiente
                  </Button>
                </HStack>
              </Flex>
            )}
          </CardBody>
        </Card>
      </VStack>

      {/* Modal de Crear/Editar Usuario */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <form onSubmit={handleSubmit}>
            <ModalHeader>
              {editingUser ? 'Editar Usuario' : 'Crear Nuevo Usuario'}
            </ModalHeader>
            <ModalBody>
              <VStack spacing={4}>
                <FormControl isRequired isInvalid={!!formErrors.username}>
                  <FormLabel>Nombre de Usuario</FormLabel>
                  <Input
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="Ingresa el nombre de usuario"
                  />
                  {formErrors.username && <Text color="red.400" fontSize="sm">{formErrors.username}</Text>}
                </FormControl>

                <FormControl isRequired={!editingUser} isInvalid={!!formErrors.password}>
                  <FormLabel>
                    {editingUser ? 'Nueva Contraseña (opcional)' : 'Contraseña'}
                  </FormLabel>
                  <Input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder={editingUser ? 'Dejar vacío para mantener' : 'Ingresa la contraseña'}
                  />
                  {formErrors.password && <Text color="red.400" fontSize="sm">{formErrors.password}</Text>}
                </FormControl>

                <FormControl isRequired isInvalid={!!formErrors.rol}>
                  <FormLabel>Rol</FormLabel>
                  <Select
                    value={formData.rol}
                    onChange={(e) => setFormData({ ...formData, rol: e.target.value })}
                  >
                    {roleOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </Select>
                  {formErrors.rol && <Text color="red.400" fontSize="sm">{formErrors.rol}</Text>}
                </FormControl>

                <FormControl isInvalid={!!formErrors.whatsapp_number}>
                  <FormLabel>Número de WhatsApp (opcional)</FormLabel>
                  <Input
                    value={formData.whatsapp_number || ''}
                    onChange={(e) => setFormData({ ...formData, whatsapp_number: e.target.value })}
                    placeholder="1234567890"
                  />
                  {formErrors.whatsapp_number && <Text color="red.400" fontSize="sm">{formErrors.whatsapp_number}</Text>}
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
                isLoading={createUserMutation.isLoading || updateUserMutation.isLoading}
              >
                {editingUser ? 'Actualizar' : 'Crear'}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default Usuarios;
