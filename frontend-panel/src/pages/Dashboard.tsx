import React, { useState, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Card,
  CardBody,
  CardHeader,
  Heading,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  StatArrow,
  Badge,
  Switch,
  Textarea,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  IconButton,
  Spinner,
  Flex,
  Grid,
  GridItem,
  Divider,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  useToast,
  Tooltip,
  Icon,
  Spacer
} from '@chakra-ui/react';
import {
  FiUsers,
  FiMessageSquare,
  FiBot,
  FiActivity,
  FiAlertTriangle,
  FiCheckCircle,
  FiXCircle,
  FiClock,
  FiBarChart3,
  FiRefreshCw,
  FiPower,
  FiPowerOff,
  FiSettings,
  FiTrendingUp,
  FiTrendingDown,
  FiEye,
  FiEyeOff,
  FiGlobe,
  FiSmartphone,
  FiWifi,
  FiWifiOff
} from 'react-icons/fi';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiService, getBotStatus, getStats } from '../services/api';

interface DashboardStats {
  totalUsuarios: number;
  totalGrupos: number;
  totalAportes: number;
  totalPedidos: number;
  totalSubbots: number;
  totalMensajes: number;
  totalComandos: number;
  usuariosActivos: number;
  gruposActivos: number;
  aportesHoy: number;
  pedidosHoy: number;
  comandosHoy: number;
  actividadDiaria: Array<{
    fecha: string;
    usuarios: number;
    grupos: number;
    mensajes: number;
  }>;
}

interface BotStatus {
  connected: boolean;
  phone?: string;
  uptime?: string;
  lastSeen?: string;
  isConnected?: boolean;
}

export const Dashboard: React.FC = () => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showGlobalControls, setShowGlobalControls] = useState(false);
  const [globalOffMessage, setGlobalOffMessage] = useState('');
  const [isEditingMessage, setIsEditingMessage] = useState(false);
  const toast = useToast();

  const queryClient = useQueryClient();

  // Queries
  const { data: botStatus, isLoading: botLoading, error: botError } = useQuery<BotStatus>('botStatus', getBotStatus, {
    refetchInterval: 5000,
  });

  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery<DashboardStats>('dashboardStats', getStats);

  const { data: globalState } = useQuery('botGlobalState', apiService.getBotGlobalState);
  const { data: globalOffMessageData } = useQuery('botGlobalOffMessage', apiService.getBotGlobalOffMessage);

  // Mutations
  const restartBotMutation = useMutation(apiService.restartBot, {
    onSuccess: () => {
      queryClient.invalidateQueries('botStatus');
      toast({
        title: 'Bot reiniciado',
        description: 'El bot se ha reiniciado exitosamente',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error al reiniciar',
        description: error.response?.data?.message || 'Error desconocido',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    },
  });

  const disconnectBotMutation = useMutation(apiService.disconnectBot, {
    onSuccess: () => {
      queryClient.invalidateQueries('botStatus');
      toast({
        title: 'Bot desconectado',
        description: 'El bot se ha desconectado exitosamente',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error al desconectar',
        description: error.response?.data?.message || 'Error desconocido',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    },
  });

  const setGlobalStateMutation = useMutation(apiService.setBotGlobalState, {
    onSuccess: () => {
      queryClient.invalidateQueries('botGlobalState');
      toast({
        title: 'Estado actualizado',
        description: 'El estado global del bot ha sido actualizado',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error al actualizar estado',
        description: error.response?.data?.message || 'Error desconocido',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    },
  });

  const setGlobalOffMessageMutation = useMutation(apiService.setBotGlobalOffMessage, {
    onSuccess: () => {
      queryClient.invalidateQueries('botGlobalOffMessage');
      setIsEditingMessage(false);
      toast({
        title: 'Mensaje actualizado',
        description: 'El mensaje global OFF ha sido actualizado',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error al actualizar mensaje',
        description: error.response?.data?.message || 'Error desconocido',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    },
  });

  // Effects
  useEffect(() => {
    if (globalOffMessageData?.message) {
      setGlobalOffMessage(globalOffMessageData.message);
    }
  }, [globalOffMessageData]);

  // Handlers
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries('botStatus'),
      queryClient.invalidateQueries('dashboardStats'),
      queryClient.invalidateQueries('botGlobalState'),
      queryClient.invalidateQueries('botGlobalOffMessage')
    ]);
    setTimeout(() => setIsRefreshing(false), 1000);
  };

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

  const handleToggleGlobalState = () => {
    const newState = !globalState?.isOn;
    setGlobalStateMutation.mutate(newState);
  };

  const handleSaveGlobalOffMessage = () => {
    if (globalOffMessage.trim()) {
      setGlobalOffMessageMutation.mutate(globalOffMessage);
    }
  };

  const formatUptime = (uptime?: string) => {
    if (!uptime) return '0h 0m';
    return uptime;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getStatusColor = (connected: boolean) => {
    return connected ? 'text-green-500' : 'text-red-500';
  };

  const getStatusIcon = (connected: boolean) => {
    return connected ? FiCheckCircle : FiXCircle;
  };

  if (botLoading || statsLoading) {
    return (
      <Flex align="center" justify="center" minH="50vh">
        <VStack spacing={4}>
          <Spinner size="xl" color="blue.500" />
          <Text fontSize="xl" fontWeight="semibold">Cargando dashboard...</Text>
        </VStack>
      </Flex>
    );
  }

  if (botError || statsError) {
    return (
      <Alert status="error" borderRadius="lg">
        <AlertIcon />
        <AlertTitle>Error al cargar datos:</AlertTitle>
        <AlertDescription>
          {(botError as any)?.message || (statsError as any)?.message}
        </AlertDescription>
      </Alert>
    );
  }

  const isConnected = botStatus?.connected || botStatus?.isConnected;
  const StatusIcon = getStatusIcon(isConnected);

  return (
      <VStack spacing={6} align="stretch">
        {/* Header */}
      <Flex justify="space-between" align="center">
          <Box>
          <Heading size="lg" color="gray.900">Dashboard</Heading>
          <Text color="gray.600" mt={1}>Panel de control y estadísticas del sistema</Text>
          </Box>
          <HStack spacing={3}>
            <Button
            onClick={handleRefresh}
            isLoading={isRefreshing}
            loadingText="Actualizando..."
            leftIcon={<Icon as={FiRefreshCw} />}
              variant="outline"
            size="sm"
            >
              Actualizar
            </Button>
          </HStack>
        </Flex>

        {/* Estado del Bot */}
      <Card>
          <CardHeader>
            <HStack>
            <Icon as={FiBot} w={6} h={6} color="green.500" />
            <Heading size="md" color="gray.900">Estado del Bot</Heading>
            </HStack>
          </CardHeader>
          <CardBody>

          <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }} gap={6} mb={6}>
            <Stat textAlign="center">
              <Flex justify="center" mb={2}>
                <Icon as={StatusIcon} w={8} h={8} color={isConnected ? "green.500" : "red.500"} />
              </Flex>
              <StatLabel color="gray.500">Estado de Conexión</StatLabel>
              <StatNumber color={isConnected ? "green.500" : "red.500"}>
                {isConnected ? 'Conectado' : 'Desconectado'}
                </StatNumber>
              <StatHelpText color="gray.400">
                {isConnected ? 'Bot activo' : 'Bot inactivo'}
                </StatHelpText>
              </Stat>

            <Stat textAlign="center">
              <Flex justify="center" mb={2}>
                <Icon as={FiSmartphone} w={8} h={8} color="blue.500" />
              </Flex>
              <StatLabel color="gray.500">Número de Teléfono</StatLabel>
              <StatNumber color="gray.900">
                  {botStatus?.phone || 'No disponible'}
                </StatNumber>
              <StatHelpText color="gray.400">WhatsApp conectado</StatHelpText>
              </Stat>

            <Stat textAlign="center">
              <Flex justify="center" mb={2}>
                <Icon as={FiClock} w={8} h={8} color="purple.500" />
              </Flex>
              <StatLabel color="gray.500">Tiempo Activo</StatLabel>
              <StatNumber color="gray.900">{formatUptime(botStatus?.uptime)}</StatNumber>
              <StatHelpText color="gray.400">Uptime del bot</StatHelpText>
              </Stat>

            <Stat textAlign="center">
              <Flex justify="center" mb={2}>
                <Icon as={FiActivity} w={8} h={8} color="orange.500" />
              </Flex>
              <StatLabel color="gray.500">Última Actividad</StatLabel>
              <StatNumber color="gray.900" fontSize="sm">
                  {botStatus?.lastSeen ? new Date(botStatus.lastSeen).toLocaleString() : 'N/A'}
                </StatNumber>
              <StatHelpText color="gray.400">Última vez activo</StatHelpText>
              </Stat>
          </Grid>

          <Flex justify="center" gap={4}>
            <Button
              onClick={handleRestartBot}
              isDisabled={!isConnected || restartBotMutation.isLoading}
              isLoading={restartBotMutation.isLoading}
              loadingText="Reiniciando..."
              leftIcon={<Icon as={FiPower} />}
              colorScheme="green"
              size="md"
            >
              Reiniciar Bot
            </Button>
            <Button
              onClick={handleDisconnectBot}
              isDisabled={!isConnected || disconnectBotMutation.isLoading}
              isLoading={disconnectBotMutation.isLoading}
              loadingText="Desconectando..."
              leftIcon={<Icon as={FiPowerOff} />}
              colorScheme="red"
              size="md"
            >
              Desconectar Bot
            </Button>
          </Flex>
        </CardBody>
      </Card>

      {/* Control Global del Bot */}
      <Card>
        <CardHeader>
          <Flex justify="space-between" align="center">
            <HStack>
              <Icon as={FiGlobe} w={6} h={6} color="blue.500" />
              <Heading size="md" color="gray.900">Control Global del Bot</Heading>
            </HStack>
            <Button
              onClick={() => setShowGlobalControls(!showGlobalControls)}
              leftIcon={<Icon as={showGlobalControls ? FiEyeOff : FiEye} />}
              variant="outline"
              size="sm"
            >
              {showGlobalControls ? 'Ocultar' : 'Mostrar'} Controles
            </Button>
          </Flex>
        </CardHeader>
        <CardBody>

          {showGlobalControls && (
            <VStack spacing={4} align="stretch">
              <Flex justify="space-between" align="center" p={4} bg="gray.50" borderRadius="lg">
                <Box>
                  <Heading size="sm" color="gray.900">Estado Global</Heading>
                  <Text fontSize="sm" color="gray.600">
                    Controla si el bot responde a comandos en todos los grupos y chats privados
                  </Text>
                </Box>
                <HStack spacing={3}>
                  <Badge colorScheme={globalState?.isOn ? "green" : "red"} variant="solid">
                    {globalState?.isOn ? 'ACTIVO' : 'INACTIVO'}
                  </Badge>
                  <Switch
                    isChecked={globalState?.isOn}
                    onChange={handleToggleGlobalState}
                    isDisabled={setGlobalStateMutation.isLoading}
                    colorScheme="green"
                    size="lg"
                  />
                </HStack>
              </Flex>

              <Box p={4} bg="gray.50" borderRadius="lg">
                <Heading size="sm" color="gray.900" mb={2}>Mensaje cuando el bot está OFF</Heading>
                <Text fontSize="sm" color="gray.600" mb={3}>
                  Este mensaje se mostrará cuando alguien use un comando mientras el bot esté globalmente desactivado
                </Text>
                {isEditingMessage ? (
                  <VStack spacing={3} align="stretch">
                    <Textarea
                      value={globalOffMessage}
                      onChange={(e) => setGlobalOffMessage(e.target.value)}
                      placeholder="Ingresa el mensaje que se mostrará cuando el bot esté OFF..."
                      rows={3}
                    />
                    <HStack spacing={2}>
                      <Button
                        onClick={handleSaveGlobalOffMessage}
                        isLoading={setGlobalOffMessageMutation.isLoading}
                        loadingText="Guardando..."
                        colorScheme="blue"
                        size="sm"
                      >
                        Guardar
                      </Button>
                      <Button
                        onClick={() => setIsEditingMessage(false)}
                        variant="outline"
                        size="sm"
                      >
                        Cancelar
                      </Button>
                    </HStack>
                  </VStack>
                ) : (
                  <VStack spacing={3} align="stretch">
                    <Box p={3} bg="white" border="1px" borderColor="gray.200" borderRadius="lg">
                      <Text color="gray.900">{globalOffMessage || 'No hay mensaje configurado'}</Text>
                    </Box>
                    <Button
                      onClick={() => setIsEditingMessage(true)}
                      leftIcon={<Icon as={FiSettings} />}
                      colorScheme="blue"
                      variant="outline"
                      size="sm"
                    >
                      Editar Mensaje
                    </Button>
                  </VStack>
                )}
              </Box>
            </VStack>
          )}
        </CardBody>
      </Card>

      {/* Estadísticas Generales */}
      <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }} gap={6}>
        <Card>
          <CardBody>
            <HStack>
              <Box p={2} bg="blue.100" borderRadius="lg">
                <Icon as={FiUsers} w={6} h={6} color="blue.600" />
              </Box>
              <Box>
                <Text fontSize="sm" color="gray.500" fontWeight="medium">Total Usuarios</Text>
                <Text fontSize="2xl" fontWeight="bold" color="gray.900">{formatNumber(stats?.totalUsuarios || 0)}</Text>
                <HStack>
                  <Icon as={FiTrendingUp} w={3} h={3} color="green.600" />
                  <Text fontSize="xs" color="green.600">
                    {stats?.usuariosActivos || 0} activos
                  </Text>
                </HStack>
              </Box>
            </HStack>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <HStack>
              <Box p={2} bg="green.100" borderRadius="lg">
                <Icon as={FiUsers} w={6} h={6} color="green.600" />
              </Box>
              <Box>
                <Text fontSize="sm" color="gray.500" fontWeight="medium">Total Grupos</Text>
                <Text fontSize="2xl" fontWeight="bold" color="gray.900">{formatNumber(stats?.totalGrupos || 0)}</Text>
                <HStack>
                  <Icon as={FiTrendingUp} w={3} h={3} color="green.600" />
                  <Text fontSize="xs" color="green.600">
                    {stats?.gruposActivos || 0} bot activo
                  </Text>
                </HStack>
              </Box>
            </HStack>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <HStack>
              <Box p={2} bg="purple.100" borderRadius="lg">
                <Icon as={FiMessageSquare} w={6} h={6} color="purple.600" />
              </Box>
              <Box>
                <Text fontSize="sm" color="gray.500" fontWeight="medium">Total Aportes</Text>
                <Text fontSize="2xl" fontWeight="bold" color="gray.900">{formatNumber(stats?.totalAportes || 0)}</Text>
                <HStack>
                  <Icon as={FiTrendingUp} w={3} h={3} color="green.600" />
                  <Text fontSize="xs" color="green.600">
                    Contenido compartido
                  </Text>
                </HStack>
              </Box>
            </HStack>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <HStack>
              <Box p={2} bg="orange.100" borderRadius="lg">
                <Icon as={FiAlertTriangle} w={6} h={6} color="orange.600" />
              </Box>
              <Box>
                <Text fontSize="sm" color="gray.500" fontWeight="medium">Pedidos Pendientes</Text>
                <Text fontSize="2xl" fontWeight="bold" color="gray.900">{formatNumber(stats?.totalPedidos || 0)}</Text>
                <HStack>
                  <Icon as={FiTrendingDown} w={3} h={3} color="red.600" />
                  <Text fontSize="xs" color="red.600">
                    Requieren atención
                  </Text>
                </HStack>
              </Box>
            </HStack>
          </CardBody>
        </Card>
      </Grid>

      {/* Estadísticas Adicionales */}
      <Grid templateColumns={{ base: "1fr", lg: "repeat(3, 1fr)" }} gap={6}>
        <Card>
          <CardBody>
            <Heading size="sm" color="gray.900" mb={4}>Actividad de Hoy</Heading>
            <VStack spacing={3} align="stretch">
              <Flex justify="space-between" align="center">
                <Text fontSize="sm" color="gray.600">Aportes</Text>
                <Text fontSize="lg" fontWeight="semibold" color="gray.900">{stats?.aportesHoy || 0}</Text>
              </Flex>
              <Flex justify="space-between" align="center">
                <Text fontSize="sm" color="gray.600">Pedidos</Text>
                <Text fontSize="lg" fontWeight="semibold" color="gray.900">{stats?.pedidosHoy || 0}</Text>
              </Flex>
              <Flex justify="space-between" align="center">
                <Text fontSize="sm" color="gray.600">Comandos</Text>
                <Text fontSize="lg" fontWeight="semibold" color="gray.900">{stats?.comandosHoy || 0}</Text>
              </Flex>
            </VStack>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <Heading size="sm" color="gray.900" mb={4}>Sistema</Heading>
            <VStack spacing={3} align="stretch">
              <Flex justify="space-between" align="center">
                <Text fontSize="sm" color="gray.600">Subbots</Text>
                <Text fontSize="lg" fontWeight="semibold" color="gray.900">{stats?.totalSubbots || 0}</Text>
              </Flex>
              <Flex justify="space-between" align="center">
                <Text fontSize="sm" color="gray.600">Mensajes</Text>
                <Text fontSize="lg" fontWeight="semibold" color="gray.900">{formatNumber(stats?.totalMensajes || 0)}</Text>
              </Flex>
              <Flex justify="space-between" align="center">
                <Text fontSize="sm" color="gray.600">Comandos</Text>
                <Text fontSize="lg" fontWeight="semibold" color="gray.900">{formatNumber(stats?.totalComandos || 0)}</Text>
              </Flex>
            </VStack>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <Heading size="sm" color="gray.900" mb={4}>Estado de Conexión</Heading>
            <VStack spacing={3} align="stretch">
              <Flex justify="space-between" align="center">
                <Text fontSize="sm" color="gray.600">Estado</Text>
                <HStack>
                  <Icon as={StatusIcon} w={4} h={4} color={isConnected ? "green.500" : "red.500"} />
                  <Text fontSize="sm" fontWeight="medium" color={isConnected ? "green.500" : "red.500"}>
                    {isConnected ? 'Conectado' : 'Desconectado'}
                  </Text>
                </HStack>
              </Flex>
              <Flex justify="space-between" align="center">
                <Text fontSize="sm" color="gray.600">Uptime</Text>
                <Text fontSize="sm" fontWeight="medium" color="gray.900">{formatUptime(botStatus?.uptime)}</Text>
              </Flex>
              <Flex justify="space-between" align="center">
                <Text fontSize="sm" color="gray.600">Global</Text>
                <Text fontSize="sm" fontWeight="medium" color={globalState?.isOn ? "green.600" : "red.600"}>
                  {globalState?.isOn ? 'ON' : 'OFF'}
                </Text>
              </Flex>
            </VStack>
          </CardBody>
        </Card>
      </Grid>

      {/* Alertas */}
      {(!isConnected || (stats?.totalPedidos || 0) > 0) && (
        <Card>
          <CardBody>
            <Heading size="sm" color="gray.900" mb={4}>Alertas del Sistema</Heading>
            <VStack spacing={3} align="stretch">
              {!isConnected && (
                <Alert status="error" borderRadius="lg">
                  <AlertIcon />
                  <Box>
                    <AlertTitle>Bot desconectado</AlertTitle>
                    <AlertDescription>
                      El bot de WhatsApp no está conectado. Revisa la conexión.
                    </AlertDescription>
                  </Box>
                </Alert>
              )}

              {(stats?.totalPedidos || 0) > 0 && (
                <Alert status="warning" borderRadius="lg">
                  <AlertIcon />
                  <Box>
                    <AlertTitle>Pedidos pendientes</AlertTitle>
                    <AlertDescription>
                      Hay {stats?.totalPedidos} pedidos que requieren atención.
                    </AlertDescription>
                  </Box>
                </Alert>
              )}
            </VStack>
          </CardBody>
        </Card>
      )}
    </VStack>
  );
};

export default Dashboard;
