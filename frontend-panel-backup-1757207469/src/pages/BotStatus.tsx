import React, { useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Heading,
  Text,
  Button,
  Card,
  CardBody,
  CardHeader,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Badge,
  Icon,
  useColorModeValue,
  Flex,
  Spacer,
  useToast,
  Spinner,
  Alert,
  AlertIcon,
  SimpleGrid,
  Progress,
  Divider,
  Image,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Textarea,
  FormControl,
  FormLabel,
  Input,
  Switch,
  Select,
} from '@chakra-ui/react';
import {
  FaPlay,
  FaStop,
  FaSync,
  FaCog,
  FaQrcode,
  FaWhatsapp,
  FaCheckCircle,
  FaTimesCircle,
  FaClock,
  FaMobile,
  FaWifi,
  FaExclamationTriangle,
  FaDownload,
  FaUpload,
} from 'react-icons/fa';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiService } from '../services/api';

export const BotStatus: React.FC = () => {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [configData, setConfigData] = useState({
    autoReconnect: true,
    maxReconnectAttempts: 5,
    reconnectInterval: 30,
    logLevel: 'info',
  });

  const { isOpen: isQROpen, onOpen: onQROpen, onClose: onQROpenClose } = useDisclosure();
  const toast = useToast();
  const queryClient = useQueryClient();

  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Queries
  const { data: botStatus, isLoading, error } = useQuery('botStatus', apiService.getBotStatus, {
    refetchInterval: 5000, // Actualizar cada 5 segundos
  });

  const { data: botConfig } = useQuery('botConfig', apiService.getBotConfig);
  const { data: qrCode, isLoading: qrLoading } = useQuery('botQR', apiService.getBotQR, {
    enabled: !botStatus?.connected,
    refetchInterval: !botStatus?.connected ? 10000 : false, // Actualizar QR cada 10 segundos si no está conectado
  });

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

  const updateConfigMutation = useMutation(apiService.updateBotConfig, {
    onSuccess: () => {
      queryClient.invalidateQueries('botConfig');
      toast({
        title: 'Configuración actualizada',
        description: 'La configuración del bot ha sido actualizada',
        status: 'success',
      });
      setIsConfigOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.message || 'Error al actualizar configuración',
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

  const handleUpdateConfig = () => {
    updateConfigMutation.mutate(configData);
  };

  const getConnectionStatus = () => {
    if (botStatus?.connected) {
      return { status: 'success', text: 'Conectado', icon: FaCheckCircle };
    } else if (botStatus?.connecting) {
      return { status: 'warning', text: 'Conectando...', icon: FaSync };
    } else {
      return { status: 'error', text: 'Desconectado', icon: FaTimesCircle };
    }
  };

  const connectionStatus = getConnectionStatus();

  if (error) {
    return (
      <Alert status="error">
        <AlertIcon />
        Error al cargar el estado del bot: {(error as any).message}
      </Alert>
    );
  }

  return (
    <Box>
      <VStack spacing={6} align="stretch">
        {/* Header */}
        <Flex align="center" justify="space-between">
          <Box>
            <Heading size="lg">Estado del Bot</Heading>
            <Text color="gray.600" mt={1}>
              Monitoreo y control del bot de WhatsApp
            </Text>
          </Box>
          <HStack spacing={3}>
            <Button
              leftIcon={<FaQrcode />}
              colorScheme="blue"
              variant="outline"
              onClick={onQROpen}
              isDisabled={botStatus?.connected}
            >
              Ver QR
            </Button>
            <Button
              leftIcon={<FaCog />}
              colorScheme="gray"
              variant="outline"
              onClick={() => setIsConfigOpen(true)}
            >
              Configuración
            </Button>
          </HStack>
        </Flex>

        {/* Estado Principal */}
        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardHeader>
            <HStack>
              <Icon as={FaWhatsapp} color="green.500" />
              <Heading size="md">Estado de Conexión</Heading>
            </HStack>
          </CardHeader>
          <CardBody>
            <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={6}>
              <Stat>
                <StatLabel>Estado</StatLabel>
                <StatNumber>
                  <HStack>
                    <Icon as={connectionStatus.icon} color={`${connectionStatus.status}.500`} />
                    <Text color={`${connectionStatus.status}.400`}>
                      {connectionStatus.text}
                    </Text>
                  </HStack>
                </StatNumber>
                <StatHelpText>
                  {botStatus?.connected ? 'Bot funcionando correctamente' : 'Bot no está conectado'}
                </StatHelpText>
              </Stat>

              <Stat>
                <StatLabel>Número de Teléfono</StatLabel>
                <StatNumber fontSize="lg">
                  {botStatus?.phone || 'No disponible'}
                </StatNumber>
                <StatHelpText>
                  <Icon as={FaMobile} mr={1} />
                  WhatsApp conectado
                </StatHelpText>
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

            <Divider my={6} />

            {/* Controles */}
            <HStack spacing={4} justify="center">
              <Button
                leftIcon={<FaPlay />}
                colorScheme="green"
                size="lg"
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
                size="lg"
                onClick={handleDisconnectBot}
                isLoading={disconnectBotMutation.isLoading}
                isDisabled={!botStatus?.connected}
              >
                Desconectar Bot
              </Button>
              <Button
                leftIcon={<FaSync />}
                colorScheme="blue"
                variant="outline"
                size="lg"
                onClick={() => queryClient.invalidateQueries('botStatus')}
                isLoading={isLoading}
              >
                Actualizar
              </Button>
            </HStack>
          </CardBody>
        </Card>

        {/* Información Detallada */}
        <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
          {/* Configuración Actual */}
          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardHeader>
              <Heading size="md">Configuración Actual</Heading>
            </CardHeader>
            <CardBody>
              <VStack spacing={4} align="stretch">
                <HStack justify="space-between">
                  <Text>Auto Reconexión</Text>
                  <Badge colorScheme={botConfig?.autoReconnect ? 'green' : 'red'}>
                    {botConfig?.autoReconnect ? 'Activada' : 'Desactivada'}
                  </Badge>
                </HStack>
                <HStack justify="space-between">
                  <Text>Intentos de Reconexión</Text>
                  <Text fontWeight="semibold">{botConfig?.maxReconnectAttempts || 5}</Text>
                </HStack>
                <HStack justify="space-between">
                  <Text>Intervalo de Reconexión</Text>
                  <Text fontWeight="semibold">{botConfig?.reconnectInterval || 30}s</Text>
                </HStack>
                <HStack justify="space-between">
                  <Text>Nivel de Log</Text>
                  <Badge colorScheme="blue">{botConfig?.logLevel || 'info'}</Badge>
                </HStack>
              </VStack>
            </CardBody>
          </Card>

          {/* Estadísticas de Conexión */}
          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardHeader>
              <Heading size="md">Estadísticas de Conexión</Heading>
            </CardHeader>
            <CardBody>
              <VStack spacing={4} align="stretch">
                <Box>
                  <HStack justify="space-between" mb={2}>
                    <Text fontSize="sm">Estabilidad de Conexión</Text>
                    <Text fontSize="sm" fontWeight="semibold">85%</Text>
                  </HStack>
                  <Progress value={85} colorScheme="green" />
                </Box>
                <Box>
                  <HStack justify="space-between" mb={2}>
                    <Text fontSize="sm">Tiempo de Respuesta</Text>
                    <Text fontSize="sm" fontWeight="semibold">120ms</Text>
                  </HStack>
                  <Progress value={75} colorScheme="blue" />
                </Box>
                <Box>
                  <HStack justify="space-between" mb={2}>
                    <Text fontSize="sm">Mensajes Procesados</Text>
                    <Text fontSize="sm" fontWeight="semibold">1,234</Text>
                  </HStack>
                  <Progress value={90} colorScheme="purple" />
                </Box>
              </VStack>
            </CardBody>
          </Card>
        </SimpleGrid>

        {/* Alertas */}
        {!botStatus?.connected && (
          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardBody>
              <Alert status="warning">
                <AlertIcon />
                <Box>
                  <Text fontWeight="semibold">Bot desconectado</Text>
                  <Text fontSize="sm">
                    El bot no está conectado. Escanea el código QR para conectarlo a WhatsApp.
                  </Text>
                </Box>
              </Alert>
            </CardBody>
          </Card>
        )}
      </VStack>

      {/* Modal de Código QR */}
      <Modal isOpen={isQROpen} onClose={onQROpenClose} size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Conectar Bot a WhatsApp</ModalHeader>
          <ModalBody>
            <VStack spacing={4}>
              <Text textAlign="center" color="gray.600">
                Escanea este código QR con tu WhatsApp para conectar el bot
              </Text>
              {qrLoading ? (
                <Box textAlign="center" py={8}>
                  <Spinner size="xl" />
                  <Text mt={4}>Generando código QR...</Text>
                </Box>
              ) : qrCode?.qr ? (
                <Box textAlign="center">
                  <Image
                    src={`data:image/png;base64,${qrCode.qr}`}
                    alt="QR Code"
                    maxW="300px"
                    mx="auto"
                  />
                </Box>
              ) : (
                <Box textAlign="center" py={8}>
                  <Text color="red.500">Error al generar el código QR</Text>
                  <Text fontSize="sm" color="gray.500" mt={2}>
                    Intenta cerrar y abrir este modal nuevamente
                  </Text>
                </Box>
              )}
              <Text fontSize="sm" color="gray.500" textAlign="center">
                El código QR se actualiza automáticamente cada 10 segundos
              </Text>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button 
              leftIcon={<FaSync />} 
              onClick={() => queryClient.invalidateQueries('botQR')}
              isLoading={qrLoading}
              mr={3}
            >
              Refrescar QR
            </Button>
            <Button onClick={onQROpenClose}>Cerrar</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal de Configuración */}
      <Modal isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Configuración del Bot</ModalHeader>
          <ModalBody>
            <VStack spacing={4}>
              <FormControl display="flex" alignItems="center">
                <FormLabel mb="0">
                  <HStack>
                    <FaWifi />
                    <Text>Auto Reconexión</Text>
                  </HStack>
                </FormLabel>
                <Switch
                  isChecked={configData.autoReconnect}
                  onChange={(e) => setConfigData({ ...configData, autoReconnect: e.target.checked })}
                  colorScheme="green"
                />
              </FormControl>

              <FormControl>
                <FormLabel>Intentos de Reconexión</FormLabel>
                <Input
                  type="number"
                  value={configData.maxReconnectAttempts}
                  onChange={(e) => setConfigData({ ...configData, maxReconnectAttempts: parseInt(e.target.value) })}
                  min={1}
                  max={10}
                />
              </FormControl>

              <FormControl>
                <FormLabel>Intervalo de Reconexión (segundos)</FormLabel>
                <Input
                  type="number"
                  value={configData.reconnectInterval}
                  onChange={(e) => setConfigData({ ...configData, reconnectInterval: parseInt(e.target.value) })}
                  min={5}
                  max={300}
                />
              </FormControl>

              <FormControl>
                <FormLabel>Nivel de Log</FormLabel>
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
            <Button variant="ghost" mr={3} onClick={() => setIsConfigOpen(false)}>
              Cancelar
            </Button>
            <Button
              colorScheme="blue"
              onClick={handleUpdateConfig}
              isLoading={updateConfigMutation.isLoading}
            >
              Guardar Configuración
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default BotStatus;



