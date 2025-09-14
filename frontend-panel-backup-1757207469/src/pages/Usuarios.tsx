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
  Select,
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
} from '@chakra-ui/react';
import {
  FaSearch,
  FaPlus,
  FaEdit,
  FaTrash,
  FaEye,
  FaEllipsisV,
  FaUser,
  FaUserCheck,
  FaUserTimes,
  FaShieldAlt,
  FaUsers,
  FaCog,
} from 'react-icons/fa';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiService } from '../services/api';

interface User {
  id: number;
  username: string;
  roles: string[];
  estado: string;
  wa_jid?: string;
  created_at: string;
  updated_at: string;
}

interface UserFormData {
  username: string;
  password: string;
  roles: string[];
  estado: string;
  wa_jid?: string;
}

const roleColors = {
  admin: 'red',
  creador: 'blue',
  moderador: 'green',
  usuario: 'gray',
};

const estadoColors = {
  activo: 'green',
  inactivo: 'red',
  suspendido: 'orange',
};

export const Usuarios: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<UserFormData>({
    username: '',
    password: '',
    roles: ['usuario'],
    estado: 'activo',
    wa_jid: '',
  });

  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();
  const queryClient = useQueryClient();

  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Queries
  const { data: usuariosData, isLoading, error } = useQuery(
    ['usuarios', currentPage, searchTerm, estadoFilter],
    () => apiService.getUsuarios(currentPage, 20, searchTerm, estadoFilter)
  );

  const { data: stats } = useQuery('usuarioStats', apiService.getUsuarioStats);

  // Mutations
  const createUserMutation = useMutation(apiService.createUsuario, {
    onSuccess: () => {
      queryClient.invalidateQueries('usuarios');
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

  const updateEstadoMutation = useMutation(
    (data: { id: number; estado: string }) =>
      apiService.updateUsuarioEstado(data.id, data.estado),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('usuarios');
        toast({
          title: 'Estado actualizado',
          description: 'El estado del usuario ha sido actualizado',
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
      username: '',
      password: '',
      roles: ['usuario'],
      estado: 'activo',
      wa_jid: '',
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
      roles: user.roles,
      estado: user.estado,
      wa_jid: user.wa_jid || '',
    });
    onOpen();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingUser) {
      updateUserMutation.mutate({
        id: editingUser.id,
        user: formData,
      });
    } else {
      createUserMutation.mutate(formData);
    }
  };

  const handleDelete = (userId: number) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar este usuario?')) {
      deleteUserMutation.mutate(userId);
    }
  };

  const handleEstadoChange = (userId: number, newEstado: string) => {
    updateEstadoMutation.mutate({ id: userId, estado: newEstado });
  };

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
                  placeholder="Buscar usuarios..."
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
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
                <option value="suspendido">Suspendido</option>
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
                      <Th>Roles</Th>
                      <Th>Estado</Th>
                      <Th>WhatsApp</Th>
                      <Th>Fecha Creación</Th>
                      <Th>Acciones</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
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
                          <HStack spacing={1}>
                            {user.roles.map((role) => (
                              <Badge
                                key={role}
                                colorScheme={roleColors[role as keyof typeof roleColors] || 'gray'}
                                variant="subtle"
                              >
                                {role}
                              </Badge>
                            ))}
                          </HStack>
                        </Td>
                        <Td>
                          <Badge
                            colorScheme={estadoColors[user.estado as keyof typeof estadoColors] || 'gray'}
                            variant="subtle"
                          >
                            {user.estado}
                          </Badge>
                        </Td>
                        <Td>
                          {user.wa_jid ? (
                            <Text fontSize="sm" color="green.500">
                              {user.wa_jid}
                            </Text>
                          ) : (
                            <Text fontSize="sm" color="gray.500">
                              No configurado
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
                                  icon={<FaUserCheck />}
                                  onClick={() => handleEstadoChange(user.id, 'activo')}
                                  isDisabled={user.estado === 'activo'}
                                >
                                  Activar
                                </MenuItem>
                                <MenuItem
                                  icon={<FaUserTimes />}
                                  onClick={() => handleEstadoChange(user.id, 'inactivo')}
                                  isDisabled={user.estado === 'inactivo'}
                                >
                                  Desactivar
                                </MenuItem>
                                <MenuDivider />
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
                <FormControl isRequired>
                  <FormLabel>Nombre de Usuario</FormLabel>
                  <Input
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="Ingresa el nombre de usuario"
                  />
                </FormControl>

                <FormControl isRequired={!editingUser}>
                  <FormLabel>
                    {editingUser ? 'Nueva Contraseña (opcional)' : 'Contraseña'}
                  </FormLabel>
                  <Input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder={editingUser ? 'Dejar vacío para mantener' : 'Ingresa la contraseña'}
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>Roles</FormLabel>
                  <Select
                    value={formData.roles[0] || 'usuario'}
                    onChange={(e) => setFormData({ ...formData, roles: [e.target.value] })}
                  >
                    <option value="usuario">Usuario</option>
                    <option value="moderador">Moderador</option>
                    <option value="creador">Creador</option>
                    <option value="admin">Administrador</option>
                  </Select>
                </FormControl>

                <FormControl isRequired>
                  <FormLabel>Estado</FormLabel>
                  <Select
                    value={formData.estado}
                    onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                  >
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                    <option value="suspendido">Suspendido</option>
                  </Select>
                </FormControl>

                <FormControl>
                  <FormLabel>WhatsApp JID (opcional)</FormLabel>
                  <Input
                    value={formData.wa_jid || ''}
                    onChange={(e) => setFormData({ ...formData, wa_jid: e.target.value })}
                    placeholder="1234567890@s.whatsapp.net"
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



