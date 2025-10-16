import React, { useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Input,
  InputGroup,
  InputLeftElement,
  Button,
  FormControl,
  FormLabel,
  FormErrorMessage,
  useToast,
  Card,
  CardBody,
  Select,
  Icon,
  useColorModeValue,
  Divider,
  Alert,
  AlertIcon,
  Spinner,
  InputRightElement,
  IconButton,
} from '@chakra-ui/react';
import {
  FaUser,
  FaLock,
  FaEye,
  FaEyeSlash,
  FaShieldAlt,
  FaSignInAlt,
  FaWhatsapp,
  FaUsers,
  FaCog
} from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

interface LoginFormData {
  username: string;
  password: string;
  role: string;
}

const roleOptions = [
  { value: 'owner', label: 'Propietario', icon: FaShieldAlt, color: 'purple.500', description: 'Acceso total al sistema' },
  { value: 'admin', label: 'Administrador', icon: FaShieldAlt, color: 'red.500', description: 'Acceso completo al sistema' },
  { value: 'moderador', label: 'Moderador', icon: FaCog, color: 'green.500', description: 'Moderación de grupos' },
  { value: 'usuario', label: 'Usuario', icon: FaUser, color: 'gray.500', description: 'Acceso básico' },
];

export const Login: React.FC = () => {
  const [formData, setFormData] = useState<LoginFormData>({
    username: '',
    password: '',
    role: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<LoginFormData>>({});

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const bgGradient = useColorModeValue(
    'linear(to-br, blue.50, purple.50)',
    'linear(to-br, gray.900, blue.900)'
  );

  const from = location.state?.from?.pathname || '/';

  const validateForm = (): boolean => {
    const newErrors: Partial<LoginFormData> = {};

    if (!formData.username.trim()) {
      newErrors.username = 'El nombre de usuario es requerido';
    }

    if (!formData.password) {
      newErrors.password = 'La contraseña es requerida';
    } else if (formData.password.length < 6) {
      newErrors.password = 'La contraseña debe tener al menos 6 caracteres';
    }

    if (!formData.role) {
      newErrors.role = 'Debe seleccionar un rol';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: keyof LoginFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Limpiar error del campo cuando el usuario empiece a escribir
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      // Enviar también el rol al backend
      await login(formData.username, formData.password);

      toast({
        title: '¡Bienvenido!',
        description: `Has iniciado sesión como ${formData.role}`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      // Redirigir al usuario a la página que intentaba acceder o al dashboard
      navigate(from, { replace: true });
    } catch (error: any) {
      console.error('Error de login:', error);

      let errorMessage = 'Error al iniciar sesión';

      if (error.response?.status === 401) {
        errorMessage = 'Credenciales incorrectas';
      } else if (error.response?.status === 403) {
        errorMessage = 'No tienes permisos para acceder con este rol';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: 'Error de autenticación',
        description: errorMessage,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const selectedRole = roleOptions.find(role => role.value === formData.role);

  return (
    <Box
      minH="100vh"
      bgGradient={bgGradient}
      display="flex"
      alignItems="center"
      justifyContent="center"
      p={4}
    >
      <Card
        maxW="md"
        w="full"
        bg={cardBg}
        border="1px"
        borderColor={borderColor}
        shadow="xl"
        borderRadius="xl"
      >
        <CardBody p={8}>
          <VStack spacing={6} align="stretch">
            {/* Header */}
            <VStack spacing={3} textAlign="center">
              <Box
                p={3}
                borderRadius="full"
                bg="green.500"
                color="white"
                fontSize="2xl"
              >
                <FaWhatsapp />
              </Box>
              <Heading size="lg" color="gray.700">
                KONMI BOT Panel
              </Heading>
              <Text color="gray.600" fontSize="sm">
                Inicia sesión para acceder al sistema de gestión
              </Text>
            </VStack>

            <Divider />


            {/* Formulario */}
            <form onSubmit={handleSubmit}>
              <VStack spacing={4} align="stretch">
                {/* Selector de Rol */}
                <FormControl isInvalid={!!errors.role}>
                  <FormLabel fontWeight="semibold">Rol de Usuario</FormLabel>
                  <Select
                    value={formData.role}
                    onChange={(e) => handleInputChange('role', e.target.value)}
                    size="lg"
                    borderRadius="md"
                    placeholder="Selecciona un rol"
                  >
                    <option value="" disabled>Selecciona un rol</option>
                    {roleOptions.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </Select>
                  {errors.role && <FormErrorMessage>{errors.role}</FormErrorMessage>}
                </FormControl>

                {/* Información del Rol Seleccionado */}
                {selectedRole && (
                  <Alert
                    status="info"
                    borderRadius="md"
                    bg={`${selectedRole.color}50`}
                    border="1px"
                    borderColor={`${selectedRole.color}200`}
                  >
                    <AlertIcon color={selectedRole.color} />
                    <Box>
                      <Text fontWeight="semibold" color={selectedRole.color}>
                        {selectedRole.label}
                      </Text>
                      <Text fontSize="sm" color="gray.600">
                        {selectedRole.description}
                      </Text>
                    </Box>
                  </Alert>
                )}

                {/* Usuario */}
                <FormControl isInvalid={!!errors.username}>
                  <FormLabel fontWeight="semibold">Usuario</FormLabel>
                  <InputGroup size="lg">
                    <InputLeftElement pointerEvents="none">
                      <Icon as={FaUser} color="gray.400" />
                    </InputLeftElement>
                    <Input
                      type="text"
                      placeholder="Ingresa tu usuario"
                      value={formData.username}
                      onChange={(e) => handleInputChange('username', e.target.value)}
                      borderRadius="md"
                    />
                  </InputGroup>
                  {errors.username && <FormErrorMessage>{errors.username}</FormErrorMessage>}
                </FormControl>

                {/* Contraseña */}
                <FormControl isInvalid={!!errors.password}>
                  <FormLabel fontWeight="semibold">Contraseña</FormLabel>
                  <InputGroup size="lg">
                    <InputLeftElement pointerEvents="none">
                      <Icon as={FaLock} color="gray.400" />
                    </InputLeftElement>
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Ingresa tu contraseña"
                      value={formData.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      borderRadius="md"
                    />
                    <InputRightElement>
                      <IconButton
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        icon={<Icon as={showPassword ? FaEyeSlash : FaEye} />}
                        onClick={() => setShowPassword(!showPassword)}
                        variant="ghost"
                        size="sm"
                      />
                    </InputRightElement>
                  </InputGroup>
                  {errors.password && <FormErrorMessage>{errors.password}</FormErrorMessage>}
                </FormControl>

                {/* Botón de Login */}
                <Button
                  type="submit"
                  colorScheme="green"
                  size="lg"
                  leftIcon={<Icon as={FaSignInAlt} />}
                  isLoading={isLoading}
                  loadingText="Iniciando sesión..."
                  borderRadius="md"
                  _hover={{
                    transform: 'translateY(-2px)',
                    boxShadow: 'lg',
                  }}
                  transition="all 0.2s"
                >
                  Iniciar Sesión
                </Button>
              </VStack>
            </form>

            <Divider />

            {/* Información adicional */}
            <VStack spacing={2} textAlign="center">
              <Text fontSize="sm" color="gray.500">
                ¿Problemas para acceder?
              </Text>
              <Text fontSize="xs" color="gray.400">
                Contacta al administrador del sistema
              </Text>
            </VStack>
          </VStack>
        </CardBody>
      </Card>
    </Box>
  );
};

export default Login;










