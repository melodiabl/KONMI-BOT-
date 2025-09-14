import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  StatArrow,
  Card,
  CardBody,
  CardHeader,
  Progress,
  Badge,
  Icon,
  useColorModeValue,
  Flex,
  Spacer,
  Button,
  useToast,
  Spinner,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import {
  FaUsers,
  FaUsersCog,
  FaWhatsapp,
  FaCheckCircle,
  FaTimesCircle,
  FaClock,
  FaChartLine,
  FaExclamationTriangle,
  FaPlay,
  FaStop,
  FaSync,
} from 'react-icons/fa';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiService, getBotStatus, getStats, getUsuarioStats, getGroupStats } from '../services/api';

export const Dashboard: React.FC = () => {
  const toast = useToast();
  const queryClient = useQueryClient();

  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Queries
  const { data: botStatus, isLoading: botLoading } = useQuery('botStatus', getBotStatus);
  const { data: stats, isLoading: statsLoading } = useQuery('dashboardStats', getStats);
  const { data: userStats } = useQuery('userStats', getUsuarioStats);
  const { data: groupStats } = useQuery('groupStats', getGroupStats);

  // Mutations
  const restartBotMutation = useMutation(apiService.restartBot, {
    onSuccess: () => {
      queryClient.invalidateQueries('botStatus');
      toast({
        title: 'Bot reiniciado',
        description: 'El bot ha sido reiniciado exitosamente',
        status: 'success',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Error al reiniciar el bot',
        status: 'error',
      });
    },
  });

  const disconnectBotMutation = useMutation(apiService.disconnectBot, {
    onSuccess: () => {
      queryClient.invalidateQueries('botStatus');
      toast({
        title: 'Bot desconectado',
        description: 'El bot ha sido desconectado exitosamente',
        status: 'success',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Error al desconectar el bot',
        status: 'error',
      });
    },
  });

  const handleRestartBot = () => {
    if (window.confirm('¿Estás seguro de que quieres reiniciar el bot?')) {
      restartBotMutation.mutate();
    }
  };

  const handleDisconnectBot = () => {
    if (window.confirm('¿Estás seguro de que quieres desconectar el bot?')) {
      disconnectBotMutation.mutate();
    }
  };

  if (botLoading || statsLoading) {
    return (
      <Box textAlign="center" py={10}>
        <Spinner size="xl" />
        <Heading mt={4}>Cargando dashboard...</Heading>
      </Box>
    );
  }

  return (
    <Box>
      <VStack spacing={6} align="stretch">
        {/* Header */}
        <Flex align="center" justify="space-between">
          <Box>
            <Heading size="lg">Dashboard</Heading>
            <Text color="gray.600" mt={1}>
              Panel de control y estadísticas del sistema
            </Text>
          </Box>
          <HStack spacing={3}>
            <Button
              leftIcon={<FaSync />}
              colorScheme="blue"
              variant="outline"
              onClick={() => queryClient.invalidateQueries()}
              isLoading={botLoading || statsLoading}
            >
              Actualizar
            </Button>
          </HStack>
        </Flex>

        {/* Estado del Bot */}
        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardHeader>
            <HStack>
              <Icon as={FaWhatsapp} color="green.500" />
              <Heading size="md">Estado del Bot</Heading>
            </HStack>
          </CardHeader>
          <CardBody>
            <SimpleGrid columns={{ base: 1, md: 4 }} spacing={6}>
              <Stat>
                <StatLabel>Estado de Conexión</StatLabel>
                <StatNumber color={botStatus?.connected ? 'green.400' : 'red.400'}>
                  {botStatus?.connected ? 'Conectado' : 'Desconectado'}
                </StatNumber>
                <StatHelpText>
                  <Icon as={botStatus?.connected ? FaCheckCircle : FaTimesCircle} mr={1} />
                  {botStatus?.connected ? 'Bot activo' : 'Bot inactivo'}
                </StatHelpText>
              </Stat>
              
              <Stat>
                <StatLabel>Número de Teléfono</StatLabel>
                <StatNumber fontSize="lg">
                  {botStatus?.phone || 'No disponible'}
                </StatNumber>
                <StatHelpText>WhatsApp conectado</StatHelpText>
              </Stat>
              
              <Stat>
                <StatLabel>Tiempo Activo</StatLabel>
                <StatNumber>{botStatus?.uptime || '0h 0m'}</StatNumber>
                <StatHelpText>
                  <Icon as={FaClock} mr={1} />
                  Uptime del bot
                </StatHelpText>
              </Stat>
              
              <Stat>
                <StatLabel>Última Actividad</StatLabel>
                <StatNumber fontSize="sm">
                  {botStatus?.lastSeen ? new Date(botStatus.lastSeen).toLocaleString() : 'N/A'}
                </StatNumber>
                <StatHelpText>Última vez activo</StatHelpText>
              </Stat>
            </SimpleGrid>
            
            <HStack mt={6} spacing={4}>
              <Button
                leftIcon={<FaPlay />}
                colorScheme="green"
                onClick={handleRestartBot}
                isLoading={restartBotMutation.isLoading}
                isDisabled={!botStatus?.connected}
              >
                Reiniciar Bot
              </Button>
              <Button
                leftIcon={<FaStop />}
                colorScheme="red"
                variant="outline"
                onClick={handleDisconnectBot}
                isLoading={disconnectBotMutation.isLoading}
                isDisabled={!botStatus?.connected}
              >
                Desconectar Bot
              </Button>
            </HStack>
          </CardBody>
        </Card>

        {/* Estadísticas Generales */}
        <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={6}>
          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardBody>
              <Stat>
                <StatLabel>
                  <HStack>
                    <Icon as={FaUsers} color="blue.500" />
                    <Text>Total Usuarios</Text>
                  </HStack>
                </StatLabel>
                <StatNumber>{userStats?.totalUsuarios || 0}</StatNumber>
                <StatHelpText>
                  <StatArrow type="increase" />
                  {userStats?.usuariosActivos || 0} activos
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardBody>
              <Stat>
                <StatLabel>
                  <HStack>
                    <Icon as={FaUsersCog} color="green.500" />
                    <Text>Total Grupos</Text>
                  </HStack>
                </StatLabel>
                <StatNumber>{groupStats?.totalGrupos || 0}</StatNumber>
                <StatHelpText>
                  <StatArrow type="increase" />
                  {groupStats?.gruposActivos || 0} bot activo
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardBody>
              <Stat>
                <StatLabel>
                  <HStack>
                    <Icon as={FaChartLine} color="purple.500" />
                    <Text>Total Aportes</Text>
                  </HStack>
                </StatLabel>
                <StatNumber>{stats?.totalAportes || 0}</StatNumber>
                <StatHelpText>
                  <StatArrow type="increase" />
                  Contenido compartido
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardBody>
              <Stat>
                <StatLabel>
                  <HStack>
                    <Icon as={FaExclamationTriangle} color="orange.500" />
                    <Text>Pedidos Pendientes</Text>
                  </HStack>
                </StatLabel>
                <StatNumber>{stats?.pedidosPendientes || 0}</StatNumber>
                <StatHelpText>
                  <StatArrow type="decrease" />
                  Requieren atención
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>
        </SimpleGrid>

        {/* Detalles de Usuarios y Grupos */}
        <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
          {/* Usuarios por Rol */}
          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardHeader>
              <Heading size="md">Usuarios por Rol</Heading>
            </CardHeader>
            <CardBody>
              <VStack spacing={4} align="stretch">
                <HStack justify="space-between">
                  <HStack>
                    <Badge colorScheme="red">Admin</Badge>
                    <Text fontSize="sm">Administradores</Text>
                  </HStack>
                  <Text fontWeight="semibold">{userStats?.totalAdmins || 0}</Text>
                </HStack>
                <Progress value={(userStats?.totalAdmins || 0) / (userStats?.totalUsuarios || 1) * 100} colorScheme="red" />
                
                <HStack justify="space-between">
                  <HStack>
                    <Badge colorScheme="blue">Creador</Badge>
                    <Text fontSize="sm">Creadores</Text>
                  </HStack>
                  <Text fontWeight="semibold">{userStats?.totalCreadores || 0}</Text>
                </HStack>
                <Progress value={(userStats?.totalCreadores || 0) / (userStats?.totalUsuarios || 1) * 100} colorScheme="blue" />
                
                <HStack justify="space-between">
                  <HStack>
                    <Badge colorScheme="green">Moderador</Badge>
                    <Text fontSize="sm">Moderadores</Text>
                  </HStack>
                  <Text fontWeight="semibold">{userStats?.totalModeradores || 0}</Text>
                </HStack>
                <Progress value={(userStats?.totalModeradores || 0) / (userStats?.totalUsuarios || 1) * 100} colorScheme="green" />
                
                <HStack justify="space-between">
                  <HStack>
                    <Badge colorScheme="gray">Usuario</Badge>
                    <Text fontSize="sm">Usuarios</Text>
                  </HStack>
                  <Text fontWeight="semibold">{userStats?.totalUsuarios - (userStats?.totalAdmins || 0) - (userStats?.totalCreadores || 0) - (userStats?.totalModeradores || 0) || 0}</Text>
                </HStack>
                <Progress value={(userStats?.totalUsuarios - (userStats?.totalAdmins || 0) - (userStats?.totalCreadores || 0) - (userStats?.totalModeradores || 0) || 0) / (userStats?.totalUsuarios || 1) * 100} colorScheme="gray" />
              </VStack>
            </CardBody>
          </Card>

          {/* Estado de Grupos */}
          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardHeader>
              <Heading size="md">Estado de Grupos</Heading>
            </CardHeader>
            <CardBody>
              <VStack spacing={4} align="stretch">
                <HStack justify="space-between">
                  <HStack>
                    <Badge colorScheme="green">Bot activo</Badge>
                    <Text fontSize="sm">Grupos con bot activado</Text>
                  </HStack>
                  <Text fontWeight="semibold">{groupStats?.gruposActivos || 0}</Text>
                </HStack>
                <Progress value={(groupStats?.gruposActivos || 0) / (groupStats?.totalGrupos || 1) * 100} colorScheme="green" />
                
                <HStack justify="space-between">
                  <HStack>
                    <Badge colorScheme="blue">Proveedores</Badge>
                    <Text fontSize="sm">Grupos proveedores</Text>
                  </HStack>
                  <Text fontWeight="semibold">{groupStats?.gruposProveedores || 0}</Text>
                </HStack>
                <Progress value={(groupStats?.gruposProveedores || 0) / (groupStats?.totalGrupos || 1) * 100} colorScheme="blue" />
                
                <HStack justify="space-between">
                  <HStack>
                    <Badge colorScheme="red">Bot inactivo</Badge>
                    <Text fontSize="sm">Grupos sin bot</Text>
                  </HStack>
                  <Text fontWeight="semibold">{(groupStats?.totalGrupos || 0) - (groupStats?.gruposActivos || 0)}</Text>
                </HStack>
                <Progress value={((groupStats?.totalGrupos || 0) - (groupStats?.gruposActivos || 0)) / (groupStats?.totalGrupos || 1) * 100} colorScheme="red" />
              </VStack>
            </CardBody>
          </Card>
        </SimpleGrid>

        {/* Alertas y Notificaciones */}
        {(!botStatus?.connected || (stats?.pedidosPendientes || 0) > 0) && (
          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardHeader>
              <Heading size="md">Alertas del Sistema</Heading>
            </CardHeader>
            <CardBody>
              <VStack spacing={3} align="stretch">
                {!botStatus?.connected && (
                  <Alert status="error">
                    <AlertIcon />
                    <Box>
                      <Text fontWeight="semibold">Bot desconectado</Text>
                      <Text fontSize="sm">El bot de WhatsApp no está conectado. Revisa la conexión.</Text>
                    </Box>
                  </Alert>
                )}
                
                {(stats?.pedidosPendientes || 0) > 0 && (
                  <Alert status="warning">
                    <AlertIcon />
                    <Box>
                      <Text fontWeight="semibold">Pedidos pendientes</Text>
                      <Text fontSize="sm">Hay {stats.pedidosPendientes} pedidos que requieren atención.</Text>
                    </Box>
                  </Alert>
                )}
              </VStack>
            </CardBody>
          </Card>
        )}
      </VStack>
    </Box>
  );
};

export default Dashboard;


























