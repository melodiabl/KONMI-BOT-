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
import { apiService, getUsuarios, getUsuarioStats } from '../services/api';

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

const roleColors = {
  owner: 'purple',
  admin: 'red',
  moderador: 'green',
  usuario: 'gray',
};

// Removido - no usamos estados de activo/inactivo

export const Usuarios: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState<UserFormData>({
    username: '',
    password: '',
    rol: 'usuario',
    whatsapp_number: '',
  });

  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();
  const queryClient = useQueryClient();

  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Queries
  const { data: usuariosData, isLoading, error } = useQuery(
    ['usuarios', currentPage, searchTerm, estadoFilter],
    () => getUsuarios(currentPage, 20, searchTerm, estadoFilter)
  );

  const { data: stats } = useQuery('usuarioStats', getUsuarioStats);

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
                            {user.rol}
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
                  <FormLabel>Rol</FormLabel>
                  <Select
                    value={formData.rol}
                    onChange={(e) => setFormData({ ...formData, rol: e.target.value })}
                  >
                    <option value="usuario">Usuario</option>
                    <option value="colaborador">Colaborador</option>
                    <option value="admin">Administrador</option>
                    <option value="owner">Propietario</option>
                  </Select>
                </FormControl>

                <FormControl>
                  <FormLabel>Número de WhatsApp (opcional)</FormLabel>
                  <Input
                    value={formData.whatsapp_number || ''}
                    onChange={(e) => setFormData({ ...formData, whatsapp_number: e.target.value })}
                    placeholder="1234567890"
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



