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
  ModalFooter,
  useToast,
  Tooltip,
  Icon,
  Spacer,
  Image,
  Input,
  InputGroup,
  InputLeftElement,
  FormControl,
  FormLabel,
  FormHelperText,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Select,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Code as ChakraCode,
  Link,
  Center
} from '@chakra-ui/react';
import {
  FiBox as FiBot,
  FiPower,
  FiPower as FiPowerOff,
  FiRefreshCw,
  FiSettings,
  FiCode as FiQrCode,
  FiSmartphone,
  FiClock,
  FiActivity,
  FiCheckCircle,
  FiXCircle,
  FiAlertTriangle,
  FiWifi,
  FiWifiOff,
  FiGlobe,
  FiEye,
  FiEyeOff,
  FiSave,
  FiX,
  FiLoader as FiLoader2,
  FiCode,
  FiDownload
} from 'react-icons/fi';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiService, getBotStatus } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface BotConfig {
  autoReconnect: boolean;
  maxReconnectAttempts: number;
  reconnectInterval: number;
  logLevel: string;
  qrTimeout: number;
  sessionTimeout: number;
}

export const BotStatus: React.FC = () => {
  const { hasRole } = useAuth();
  const isOwner = hasRole('owner');
  const toast = useToast();

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isQROpen, setIsQROpen] = useState(false);
  const [isPairingOpen, setIsPairingOpen] = useState(false);
  const [showGlobalControls, setShowGlobalControls] = useState(false);
  const [isEditingMessage, setIsEditingMessage] = useState(false);
  const [globalOffMessage, setGlobalOffMessage] = useState('');
  const [pairingPhone, setPairingPhone] = useState('');
  const [authMethod, setAuthMethod] = useState<'qr' | 'pairing'>('qr');
  const [configData, setConfigData] = useState<BotConfig>({
    autoReconnect: true,
    maxReconnectAttempts: 5,
    reconnectInterval: 30,
    logLevel: 'info',
    qrTimeout: 60,
    sessionTimeout: 3600,
  });

  const queryClient = useQueryClient();

  // Queries
  const { data: botStatus, isLoading, error } = useQuery('botStatus', getBotStatus, {
    refetchInterval: 5000,
  });

  const { data: botConfig } = useQuery('botConfig', apiService.getBotConfig);
  const { data: qrCode, isLoading: qrLoading } = useQuery('botQR', apiService.getBotQR, {
    enabled: isOwner && !(botStatus?.connected || botStatus?.isConnected),
    refetchInterval: isOwner && !(botStatus?.connected || botStatus?.isConnected) ? 10000 : false,
  });

  const { data: globalState } = useQuery('botGlobalState', apiService.getBotGlobalState);
  const { data: globalOffMessageData } = useQuery('botGlobalOffMessage', apiService.getBotGlobalOffMessage);

  // Polling de código de pairing (owner)
  const { data: pairingInfo, refetch: refetchPairing, isFetching: pairingLoading } = useQuery(
    ['pairingCode', pairingPhone],
    () => apiService.getPairingCode(),
    {
      enabled: isOwner && authMethod === 'pairing' && isPairingOpen && !(botStatus?.connected || botStatus?.isConnected),
      refetchInterval: isOwner && authMethod === 'pairing' && isPairingOpen && !(botStatus?.connected || botStatus?.isConnected) ? 10000 : false,
    }
  );

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

  const updateConfigMutation = useMutation(apiService.updateBotConfig, {
    onSuccess: () => {
      queryClient.invalidateQueries('botConfig');
      toast({
        title: 'Configuración actualizada',
        description: 'La configuración del bot ha sido actualizada exitosamente',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      setIsConfigOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error al actualizar configuración',
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

  const setGlobalOffMessageMutation = useMutation((message: string) => apiService.setBotGlobalOffMessage(message), {
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

  const setAuthMethodMutation = useMutation(
    (data: { method: 'qr' | 'pairing'; phone?: string }) => apiService.setWhatsappAuthMethod(data.method, data.phone),
    {
      onSuccess: (_, data) => {
        if (data.method === 'pairing') {
          setIsPairingOpen(true);
          refetchPairing();
          toast({
            title: 'Pairing configurado',
            description: `Pairing configurado para +${data.phone}`,
            status: 'success',
            duration: 3000,
            isClosable: true,
          });
        } else {
          setIsPairingOpen(false);
          setIsQROpen(true);
          toast({
            title: 'Modo QR activado',
            description: 'El modo QR ha sido activado',
            status: 'success',
            duration: 3000,
            isClosable: true,
          });
        }
      },
      onError: (error: any) => {
        toast({
          title: 'Error al configurar método',
          description: error.response?.data?.message || 'Error desconocido',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      },
    }
  );

  // Effects
  useEffect(() => {
    if (globalOffMessageData?.message) {
      setGlobalOffMessage(globalOffMessageData.message);
    }
  }, [globalOffMessageData]);

  // Handlers
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

  const handleUpdateConfig = () => {
    updateConfigMutation.mutate(configData);
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

  const handleSetAuthMethod = async () => {
    try {
      if (authMethod === 'pairing') {
        const digits = pairingPhone.replace(/\D/g, '');
        if (!/^\d{7,15}$/.test(digits)) {
          alert('Número inválido. Usa solo dígitos con código de país (7-15)');
          return;
        }
        setAuthMethodMutation.mutate({ method: 'pairing', phone: digits });
      } else {
        setAuthMethodMutation.mutate({ method: 'qr' });
      }
    } catch (e: any) {
      alert(`Error: ${e?.message || 'No se pudo configurar'}`);
    }
  };

  const getConnectionStatus = () => {
    if (botStatus?.connected || botStatus?.isConnected) {
      return { status: 'success', text: 'Conectado', icon: FiCheckCircle, color: 'green.500' };
    } else if (botStatus?.connecting) {
      return { status: 'warning', text: 'Conectando...', icon: FiLoader2, color: 'yellow.500' };
    } else {
      return { status: 'error', text: 'Desconectado', icon: FiXCircle, color: 'red.500' };
    }
  };

  const connectionStatus = getConnectionStatus();
  const isConnected = botStatus?.connected || botStatus?.isConnected;

  if (error) {
    return (
      <Alert status="error" borderRadius="lg">
        <AlertIcon />
        <AlertTitle>Error al cargar el estado del bot:</AlertTitle>
        <AlertDescription>{(error as any).message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <VStack spacing={6} align="stretch">
      {/* Header */}
      <Flex justify="space-between" align="center">
        <Box>
          <Heading size="lg" color="gray.900">Estado del Bot</Heading>
          <Text color="gray.600" mt={1}>Monitoreo y control del bot de WhatsApp</Text>
        </Box>
        <HStack spacing={3}>
          {isOwner && (
            <Button
              onClick={() => setIsQROpen(true)}
              isDisabled={isConnected}
              leftIcon={<Icon as={FiQrCode} />}
              colorScheme="blue"
              variant="outline"
              size="sm"
            >
              Ver QR
            </Button>
          )}
          <Button
            onClick={() => queryClient.invalidateQueries('botStatus')}
            isLoading={isLoading}
            loadingText="Actualizando..."
            leftIcon={<Icon as={FiRefreshCw} />}
            variant="outline"
            size="sm"
          >
            Actualizar
          </Button>
        </HStack>
      </Flex>

      {/* Estado Principal */}
      <Card>
        <CardHeader>
          <HStack>
            <Icon as={FiBot} w={6} h={6} color="green.500" />
            <Heading size="md" color="gray.900">Estado de Conexión</Heading>
          </HStack>
        </CardHeader>
        <CardBody>
          <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)", lg: "repeat(4, 1fr)" }} gap={6} mb={6}>
            <Stat textAlign="center">
              <Flex justify="center" mb={2}>
                <Icon
                  as={connectionStatus.icon}
                  w={8} h={8}
                  color={connectionStatus.color}
                  animation={connectionStatus.icon === FiLoader2 ? 'spin 1s linear infinite' : undefined}
                />
              </Flex>
              <StatLabel color="gray.500">Estado</StatLabel>
              <StatNumber color={connectionStatus.color}>
                {connectionStatus.text}
              </StatNumber>
              <StatHelpText color="gray.400">
                {isConnected ? 'Bot funcionando correctamente' : 'Bot no está conectado'}
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
              <StatNumber color="gray.900">{botStatus?.uptime || '0h 0m'}</StatNumber>
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

          {/* Controles */}
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
            <Button
              onClick={() => setIsConfigOpen(true)}
              leftIcon={<Icon as={FiSettings} />}
              variant="outline"
              size="md"
            >
              Configuración
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
                        leftIcon={<Icon as={FiSave} />}
                        colorScheme="blue"
                        size="sm"
                      >
                        Guardar
                      </Button>
                      <Button
                        onClick={() => setIsEditingMessage(false)}
                        leftIcon={<Icon as={FiX} />}
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

      {/* Conexión (Owner) */}
      {isOwner && !isConnected && (
        <Card>
          <CardHeader>
            <Heading size="md" color="gray.900">Conectar Bot Principal</Heading>
          </CardHeader>
          <CardBody>
            <VStack spacing={4} align="stretch">
              <Box>
                <FormLabel fontSize="sm" color="gray.700" mb={2}>Método de Conexión</FormLabel>
                <HStack spacing={2}>
                  <Button
                    onClick={() => setAuthMethod('qr')}
                    leftIcon={<Icon as={FiQrCode} />}
                    colorScheme={authMethod === 'qr' ? 'blue' : 'gray'}
                    variant={authMethod === 'qr' ? 'solid' : 'outline'}
                    size="sm"
                  >
                    QR
                  </Button>
                  <Button
                    onClick={() => setAuthMethod('pairing')}
                    leftIcon={<Icon as={FiCode} />}
                    colorScheme={authMethod === 'pairing' ? 'blue' : 'gray'}
                    variant={authMethod === 'pairing' ? 'solid' : 'outline'}
                    size="sm"
                  >
                    Código (8 dígitos)
                  </Button>
                </HStack>
              </Box>

              {authMethod === 'pairing' && (
                <FormControl>
                  <FormLabel fontSize="sm" color="gray.700">
                    Número (solo dígitos con país)
                  </FormLabel>
                  <Input
                    type="text"
                    value={pairingPhone}
                    onChange={(e) => setPairingPhone(e.target.value)}
                    placeholder="595974154768"
                  />
                </FormControl>
              )}

              <Button
                onClick={handleSetAuthMethod}
                isDisabled={setAuthMethodMutation.isLoading || (authMethod === 'pairing' && !pairingPhone.trim())}
                isLoading={setAuthMethodMutation.isLoading}
                loadingText="Procesando..."
                leftIcon={<Icon as={FiSmartphone} />}
                colorScheme="green"
                size="md"
              >
                {authMethod === 'qr' ? 'Obtener QR' : 'Solicitar Código'}
              </Button>

              {authMethod === 'pairing' && isPairingOpen && (
                <Box p={4} bg="gray.50" borderRadius="lg">
                  {pairingLoading ? (
                    <HStack>
                      <Spinner size="sm" />
                      <Text>Esperando código de emparejamiento...</Text>
                    </HStack>
                  ) : pairingInfo?.available ? (
                    <VStack spacing={2} align="stretch">
                      <Text fontSize="sm" color="gray.500">Número: +{pairingInfo.phoneNumber}</Text>
                      <Heading size="md">KONMI-BOT: {(pairingInfo as any).pairingCode || (pairingInfo as any).code}</Heading>
                      <Text fontSize="sm" color="gray.600">WhatsApp → Dispositivos vinculados → Vincular con número.</Text>
                    </VStack>
                  ) : (
                    <Text color="gray.500">Código no disponible aún. Reintentando...</Text>
                  )}
                </Box>
              )}
            </VStack>
          </CardBody>
        </Card>
      )}

      {/* Información Detallada */}
      <Grid templateColumns={{ base: "1fr", lg: "repeat(2, 1fr)" }} gap={6}>
        {/* Configuración Actual */}
        <Card>
          <CardBody>
            <Heading size="sm" color="gray.900" mb={4}>Configuración Actual</Heading>
            <VStack spacing={3} align="stretch">
              <Flex justify="space-between" align="center">
                <Text fontSize="sm" color="gray.600">Auto Reconexión</Text>
                <Badge colorScheme={botConfig?.autoReconnect ? "green" : "red"} variant="solid">
                  {botConfig?.autoReconnect ? 'Activada' : 'Desactivada'}
                </Badge>
              </Flex>
              <Flex justify="space-between" align="center">
                <Text fontSize="sm" color="gray.600">Intentos de Reconexión</Text>
                <Text fontSize="sm" fontWeight="medium" color="gray.900">{botConfig?.maxReconnectAttempts || 5}</Text>
              </Flex>
              <Flex justify="space-between" align="center">
                <Text fontSize="sm" color="gray.600">Intervalo de Reconexión</Text>
                <Text fontSize="sm" fontWeight="medium" color="gray.900">{botConfig?.reconnectInterval || 30}s</Text>
              </Flex>
              <Flex justify="space-between" align="center">
                <Text fontSize="sm" color="gray.600">Nivel de Log</Text>
                <Badge colorScheme="blue" variant="subtle">
                  {botConfig?.logLevel || 'info'}
                </Badge>
              </Flex>
            </VStack>
          </CardBody>
        </Card>

        {/* Estadísticas de Conexión */}
        <Card>
          <CardBody>
            <Heading size="sm" color="gray.900" mb={4}>Estadísticas de Conexión</Heading>
            <VStack spacing={3} align="stretch">
              <Box>
                <Flex justify="space-between" align="center" mb={1}>
                  <Text fontSize="sm" color="gray.600">Estabilidad de Conexión</Text>
                  <Text fontSize="sm" fontWeight="medium" color="gray.900">85%</Text>
                </Flex>
                <Box w="full" bg="gray.200" borderRadius="full" h={2}>
                  <Box bg="green.600" h={2} borderRadius="full" w="85%" />
                </Box>
              </Box>
              <Box>
                <Flex justify="space-between" align="center" mb={1}>
                  <Text fontSize="sm" color="gray.600">Tiempo de Respuesta</Text>
                  <Text fontSize="sm" fontWeight="medium" color="gray.900">120ms</Text>
                </Flex>
                <Box w="full" bg="gray.200" borderRadius="full" h={2}>
                  <Box bg="blue.600" h={2} borderRadius="full" w="75%" />
                </Box>
              </Box>
              <Box>
                <Flex justify="space-between" align="center" mb={1}>
                  <Text fontSize="sm" color="gray.600">Mensajes Procesados</Text>
                  <Text fontSize="sm" fontWeight="medium" color="gray.900">1,234</Text>
                </Flex>
                <Box w="full" bg="gray.200" borderRadius="full" h={2}>
                  <Box bg="purple.600" h={2} borderRadius="full" w="90%" />
                </Box>
              </Box>
            </VStack>
          </CardBody>
        </Card>
      </Grid>

      {/* Alertas */}
      {!isConnected && (
        <Card>
          <CardBody>
            <Alert status="warning" borderRadius="lg">
              <AlertIcon />
              <Box>
                <AlertTitle>Bot desconectado</AlertTitle>
                <AlertDescription>
                  El bot no está conectado. {isOwner ? 'Usa QR o Código para conectarlo.' : 'Contacta al owner para conectar el bot.'}
                </AlertDescription>
              </Box>
            </Alert>
          </CardBody>
        </Card>
      )}

      {/* Modal de Código QR */}
      <Modal isOpen={isQROpen} onClose={() => setIsQROpen(false)} size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Conectar Bot a WhatsApp</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <Text color="gray.600" textAlign="center">
                Escanea este código QR con tu WhatsApp para conectar el bot
              </Text>
              {qrLoading ? (
                <VStack py={8}>
                  <Spinner size="lg" color="blue.500" />
                  <Text>Generando código QR...</Text>
                </VStack>
              ) : qrCode?.available && qrCode?.qr ? (
                <Center>
                  <Image
                    src={`data:image/png;base64,${qrCode.qr}`}
                    alt="QR Code"
                    maxW="xs"
                    mx="auto"
                  />
                </Center>
              ) : (
                <VStack py={8}>
                  <Text color="red.500">{qrCode?.message || 'Error al generar el código QR'}</Text>
                  <Text fontSize="sm" color="gray.500" textAlign="center">
                    Intenta cerrar y abrir este modal nuevamente
                  </Text>
                </VStack>
              )}
              <Text fontSize="xs" color="gray.500" textAlign="center">
                El código QR se actualiza automáticamente cada 10 segundos
              </Text>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <HStack spacing={3}>
              <Button
                onClick={() => queryClient.invalidateQueries('botQR')}
                isDisabled={qrLoading}
                leftIcon={<Icon as={FiRefreshCw} />}
                colorScheme="blue"
                variant="outline"
                size="sm"
              >
                Refrescar QR
              </Button>
              <Button
                onClick={() => setIsQROpen(false)}
                variant="outline"
                size="sm"
              >
                Cerrar
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal de Configuración */}
      <Modal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Configuración del Bot</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <Flex justify="space-between" align="center">
                <HStack>
                  <Icon as={FiWifi} w={5} h={5} color="gray.500" />
                  <Text fontSize="sm" fontWeight="medium" color="gray.700">Auto Reconexión</Text>
                </HStack>
                <Switch
                  isChecked={configData.autoReconnect}
                  onChange={(e) => setConfigData({ ...configData, autoReconnect: e.target.checked })}
                  colorScheme="green"
                  size="lg"
                />
              </Flex>

              <FormControl>
                <FormLabel fontSize="sm" color="gray.700">Intentos de Reconexión</FormLabel>
                <NumberInput
                  value={configData.maxReconnectAttempts}
                  onChange={(_, value) => setConfigData({ ...configData, maxReconnectAttempts: value })}
                  min={1}
                  max={10}
                >
                  <NumberInputField />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm" color="gray.700">Intervalo de Reconexión (segundos)</FormLabel>
                <NumberInput
                  value={configData.reconnectInterval}
                  onChange={(_, value) => setConfigData({ ...configData, reconnectInterval: value })}
                  min={5}
                  max={300}
                >
                  <NumberInputField />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm" color="gray.700">Nivel de Log</FormLabel>
                <Select
                  value={configData.logLevel}
                  onChange={(e) => setConfigData({ ...configData, logLevel: e.target.value })}
                >
                  <option value="error">Error</option>
                  <option value="warn">Warning</option>
                  <option value="info">Info</option>
                  <option value="debug">Debug</option>
                </Select>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <HStack spacing={3}>
              <Button
                onClick={() => setIsConfigOpen(false)}
                variant="outline"
                size="sm"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleUpdateConfig}
                isLoading={updateConfigMutation.isLoading}
                loadingText="Guardando..."
                leftIcon={<Icon as={FiSave} />}
                colorScheme="blue"
                size="sm"
              >
                Guardar Configuración
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </VStack>
  );
};

export default BotStatus;
