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
  FormControl,
  FormLabel,
  Input,
  Switch,
  Select,
  Textarea,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  useToast,
  Spinner,
  Alert,
  AlertIcon,
  Flex,
  Divider,
  Badge,
  Icon,
  useColorModeValue,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
} from '@chakra-ui/react';
import {
  FaCog,
  FaSave,
  FaUndo,
  FaShieldAlt,
  FaBell,
  FaRobot,
  FaDatabase,
  FaNetworkWired,
  FaUserCog,
  FaExclamationTriangle,
  FaCheckCircle,
  FaClock,
  FaServer,
  FaWifi,
  FaLock,
  FaEye,
  FaEyeSlash,
} from 'react-icons/fa';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiService } from '../services/api';

interface BotConfig {
  autoReconnect: boolean;
  maxReconnectAttempts: number;
  reconnectInterval: number;
  logLevel: string;
  qrTimeout: number;
  sessionTimeout: number;
}

interface SecurityConfig {
  jwtSecret: string;
  jwtExpiration: number;
  passwordMinLength: number;
  requireSpecialChars: boolean;
  maxLoginAttempts: number;
  lockoutDuration: number;
}

interface NotificationConfig {
  emailEnabled: boolean;
  webhookEnabled: boolean;
  webhookUrl: string;
  notificationRetention: number;
  autoCleanup: boolean;
}

interface SystemConfig {
  maintenanceMode: boolean;
  debugMode: boolean;
  apiRateLimit: number;
  fileUploadLimit: number;
  sessionTimeout: number;
}

export const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [showSecrets, setShowSecrets] = useState(false);
  const [botConfig, setBotConfig] = useState<BotConfig>({
    autoReconnect: true,
    maxReconnectAttempts: 5,
    reconnectInterval: 30,
    logLevel: 'info',
    qrTimeout: 60,
    sessionTimeout: 3600,
  });

  const [securityConfig, setSecurityConfig] = useState<SecurityConfig>({
    jwtSecret: '',
    jwtExpiration: 24,
    passwordMinLength: 8,
    requireSpecialChars: true,
    maxLoginAttempts: 5,
    lockoutDuration: 15,
  });

  const [notificationConfig, setNotificationConfig] = useState<NotificationConfig>({
    emailEnabled: false,
    webhookEnabled: false,
    webhookUrl: '',
    notificationRetention: 30,
    autoCleanup: true,
  });

  const [systemConfig, setSystemConfig] = useState<SystemConfig>({
    maintenanceMode: false,
    debugMode: false,
    apiRateLimit: 100,
    fileUploadLimit: 10,
    sessionTimeout: 3600,
  });

  const toast = useToast();
  const queryClient = useQueryClient();

  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Queries
  const { data: botConfigData, isLoading: botLoading } = useQuery('botConfig', apiService.getBotConfig);
  const { data: systemStats } = useQuery('systemStats', () => apiService.getSystemStats());

  // Mutations
  const updateBotConfigMutation = useMutation(
    (config: BotConfig) => apiService.updateBotConfig(config),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('botConfig');
        toast({
          title: 'Configuración del bot actualizada',
          status: 'success',
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al actualizar configuración del bot',
          status: 'error',
        });
      },
    }
  );

  const updateSystemConfigMutation = useMutation(
    (config: any) => apiService.updateSystemConfig(config),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('systemConfig');
        toast({
          title: 'Configuración del sistema actualizada',
          status: 'success',
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al actualizar configuración del sistema',
          status: 'error',
        });
      },
    }
  );

  const handleSaveBotConfig = () => {
    updateBotConfigMutation.mutate(botConfig);
  };

  const handleSaveSecurityConfig = () => {
    // Aquí iría la mutación para guardar configuración de seguridad
    toast({
      title: 'Configuración de seguridad actualizada',
      status: 'success',
    });
  };

  const handleSaveNotificationConfig = () => {
    // Aquí iría la mutación para guardar configuración de notificaciones
    toast({
      title: 'Configuración de notificaciones actualizada',
      status: 'success',
    });
  };

  const handleSaveSystemConfig = () => {
    updateSystemConfigMutation.mutate(systemConfig);
  };

  const handleResetToDefaults = () => {
    if (window.confirm('¿Estás seguro de que quieres restaurar la configuración por defecto?')) {
      // Resetear configuraciones
      setBotConfig({
        autoReconnect: true,
        maxReconnectAttempts: 5,
        reconnectInterval: 30,
        logLevel: 'info',
        qrTimeout: 60,
        sessionTimeout: 3600,
      });
      toast({
        title: 'Configuración restaurada',
        description: 'Se han restaurado los valores por defecto',
        status: 'info',
      });
    }
  };

  if (botLoading) {
    return (
      <Box textAlign="center" py={10}>
        <Spinner size="xl" />
        <Text mt={4}>Cargando configuración...</Text>
      </Box>
    );
  }

  return (
    <Box>
      <VStack spacing={6} align="stretch">
        {/* Header */}
        <Flex align="center" justify="space-between">
          <Box>
            <Heading size="lg">Configuración del Sistema</Heading>
            <Text color="gray.600" mt={1}>
              Gestión de configuraciones del bot y sistema
            </Text>
          </Box>
          <HStack spacing={3}>
            <Button
              leftIcon={<FaUndo />}
              colorScheme="gray"
              variant="outline"
              onClick={handleResetToDefaults}
            >
              Restaurar por defecto
            </Button>
            <Button
              leftIcon={<FaSave />}
              colorScheme="blue"
              onClick={() => {
                handleSaveBotConfig();
                handleSaveSecurityConfig();
                handleSaveNotificationConfig();
                handleSaveSystemConfig();
              }}
            >
              Guardar Todo
            </Button>
          </HStack>
        </Flex>

        {/* Estadísticas del Sistema */}
        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardHeader>
            <HStack>
              <Icon as={FaServer} color="blue.500" />
              <Heading size="md">Estado del Sistema</Heading>
            </HStack>
          </CardHeader>
          <CardBody>
            <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={6}>
              <Stat>
                <StatLabel>Uptime</StatLabel>
                <StatNumber>{systemStats?.uptime || '0h 0m'}</StatNumber>
                <StatHelpText>Tiempo activo</StatHelpText>
              </Stat>
              <Stat>
                <StatLabel>Memoria</StatLabel>
                <StatNumber>{systemStats?.memoryUsage || '0%'}</StatNumber>
                <StatHelpText>Uso de memoria</StatHelpText>
              </Stat>
              <Stat>
                <StatLabel>CPU</StatLabel>
                <StatNumber>{systemStats?.cpuUsage || '0%'}</StatNumber>
                <StatHelpText>Uso de CPU</StatHelpText>
              </Stat>
              <Stat>
                <StatLabel>Versión</StatLabel>
                <StatNumber>{systemStats?.version || '1.0.0'}</StatNumber>
                <StatHelpText>Versión del sistema</StatHelpText>
              </Stat>
            </SimpleGrid>
          </CardBody>
        </Card>

        {/* Tabs de Configuración */}
        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardBody>
            <Tabs index={activeTab} onChange={setActiveTab}>
              <TabList>
                <Tab>
                  <HStack>
                    <Icon as={FaRobot} />
                    <Text>Bot</Text>
                  </HStack>
                </Tab>
                <Tab>
                  <HStack>
                    <Icon as={FaShieldAlt} />
                    <Text>Seguridad</Text>
                  </HStack>
                </Tab>
                <Tab>
                  <HStack>
                    <Icon as={FaBell} />
                    <Text>Notificaciones</Text>
                  </HStack>
                </Tab>
                <Tab>
                  <HStack>
                    <Icon as={FaCog} />
                    <Text>Sistema</Text>
                  </HStack>
                </Tab>
              </TabList>

              <TabPanels>
                {/* Configuración del Bot */}
                <TabPanel>
                  <VStack spacing={6} align="stretch">
                    <Heading size="md">Configuración del Bot de WhatsApp</Heading>
                    
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
                      <FormControl display="flex" alignItems="center">
                        <FormLabel mb="0">
                          <HStack>
                            <FaWifi />
                            <Text>Auto Reconexión</Text>
                          </HStack>
                        </FormLabel>
                        <Switch
                          isChecked={botConfig.autoReconnect}
                          onChange={(e) => setBotConfig({ ...botConfig, autoReconnect: e.target.checked })}
                          colorScheme="green"
                        />
                      </FormControl>

                      <FormControl>
                        <FormLabel>Intentos de Reconexión</FormLabel>
                        <NumberInput
                          value={botConfig.maxReconnectAttempts}
                          onChange={(_, value) => setBotConfig({ ...botConfig, maxReconnectAttempts: value })}
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
                        <FormLabel>Intervalo de Reconexión (segundos)</FormLabel>
                        <NumberInput
                          value={botConfig.reconnectInterval}
                          onChange={(_, value) => setBotConfig({ ...botConfig, reconnectInterval: value })}
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
                        <FormLabel>Nivel de Log</FormLabel>
                        <Select
                          value={botConfig.logLevel}
                          onChange={(e) => setBotConfig({ ...botConfig, logLevel: e.target.value })}
                        >
                          <option value="error">Error</option>
                          <option value="warn">Warning</option>
                          <option value="info">Info</option>
                          <option value="debug">Debug</option>
                        </Select>
                      </FormControl>

                      <FormControl>
                        <FormLabel>Timeout QR (segundos)</FormLabel>
                        <NumberInput
                          value={botConfig.qrTimeout}
                          onChange={(_, value) => setBotConfig({ ...botConfig, qrTimeout: value })}
                          min={30}
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
                        <FormLabel>Timeout de Sesión (segundos)</FormLabel>
                        <NumberInput
                          value={botConfig.sessionTimeout}
                          onChange={(_, value) => setBotConfig({ ...botConfig, sessionTimeout: value })}
                          min={1800}
                          max={86400}
                        >
                          <NumberInputField />
                          <NumberInputStepper>
                            <NumberIncrementStepper />
                            <NumberDecrementStepper />
                          </NumberInputStepper>
                        </NumberInput>
                      </FormControl>
                    </SimpleGrid>

                    <HStack justify="flex-end">
                      <Button
                        colorScheme="blue"
                        onClick={handleSaveBotConfig}
                        isLoading={updateBotConfigMutation.isLoading}
                      >
                        Guardar Configuración del Bot
                      </Button>
                    </HStack>
                  </VStack>
                </TabPanel>

                {/* Configuración de Seguridad */}
                <TabPanel>
                  <VStack spacing={6} align="stretch">
                    <Heading size="md">Configuración de Seguridad</Heading>
                    
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
                      <FormControl>
                        <FormLabel>JWT Secret</FormLabel>
                        <HStack>
                          <Input
                            type={showSecrets ? 'text' : 'password'}
                            value={securityConfig.jwtSecret}
                            onChange={(e) => setSecurityConfig({ ...securityConfig, jwtSecret: e.target.value })}
                            placeholder="Ingresa el JWT secret"
                          />
                          <Button
                            onClick={() => setShowSecrets(!showSecrets)}
                            variant="ghost"
                            size="sm"
                          >
                            <Icon as={showSecrets ? FaEyeSlash : FaEye} />
                          </Button>
                        </HStack>
                      </FormControl>

                      <FormControl>
                        <FormLabel>Expiración JWT (horas)</FormLabel>
                        <NumberInput
                          value={securityConfig.jwtExpiration}
                          onChange={(_, value) => setSecurityConfig({ ...securityConfig, jwtExpiration: value })}
                          min={1}
                          max={168}
                        >
                          <NumberInputField />
                          <NumberInputStepper>
                            <NumberIncrementStepper />
                            <NumberDecrementStepper />
                          </NumberInputStepper>
                        </NumberInput>
                      </FormControl>

                      <FormControl>
                        <FormLabel>Longitud mínima de contraseña</FormLabel>
                        <NumberInput
                          value={securityConfig.passwordMinLength}
                          onChange={(_, value) => setSecurityConfig({ ...securityConfig, passwordMinLength: value })}
                          min={6}
                          max={20}
                        >
                          <NumberInputField />
                          <NumberInputStepper>
                            <NumberIncrementStepper />
                            <NumberDecrementStepper />
                          </NumberInputStepper>
                        </NumberInput>
                      </FormControl>

                      <FormControl display="flex" alignItems="center">
                        <FormLabel mb="0">
                          <HStack>
                            <FaLock />
                            <Text>Requerir caracteres especiales</Text>
                          </HStack>
                        </FormLabel>
                        <Switch
                          isChecked={securityConfig.requireSpecialChars}
                          onChange={(e) => setSecurityConfig({ ...securityConfig, requireSpecialChars: e.target.checked })}
                          colorScheme="green"
                        />
                      </FormControl>

                      <FormControl>
                        <FormLabel>Intentos máximos de login</FormLabel>
                        <NumberInput
                          value={securityConfig.maxLoginAttempts}
                          onChange={(_, value) => setSecurityConfig({ ...securityConfig, maxLoginAttempts: value })}
                          min={3}
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
                        <FormLabel>Duración de bloqueo (minutos)</FormLabel>
                        <NumberInput
                          value={securityConfig.lockoutDuration}
                          onChange={(_, value) => setSecurityConfig({ ...securityConfig, lockoutDuration: value })}
                          min={5}
                          max={60}
                        >
                          <NumberInputField />
                          <NumberInputStepper>
                            <NumberIncrementStepper />
                            <NumberDecrementStepper />
                          </NumberInputStepper>
                        </NumberInput>
                      </FormControl>
                    </SimpleGrid>

                    <HStack justify="flex-end">
                      <Button colorScheme="blue" onClick={handleSaveSecurityConfig}>
                        Guardar Configuración de Seguridad
                      </Button>
                    </HStack>
                  </VStack>
                </TabPanel>

                {/* Configuración de Notificaciones */}
                <TabPanel>
                  <VStack spacing={6} align="stretch">
                    <Heading size="md">Configuración de Notificaciones</Heading>
                    
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
                      <FormControl display="flex" alignItems="center">
                        <FormLabel mb="0">
                          <HStack>
                            <FaBell />
                            <Text>Notificaciones por Email</Text>
                          </HStack>
                        </FormLabel>
                        <Switch
                          isChecked={notificationConfig.emailEnabled}
                          onChange={(e) => setNotificationConfig({ ...notificationConfig, emailEnabled: e.target.checked })}
                          colorScheme="green"
                        />
                      </FormControl>

                      <FormControl display="flex" alignItems="center">
                        <FormLabel mb="0">
                          <HStack>
                            <FaNetworkWired />
                            <Text>Webhooks</Text>
                          </HStack>
                        </FormLabel>
                        <Switch
                          isChecked={notificationConfig.webhookEnabled}
                          onChange={(e) => setNotificationConfig({ ...notificationConfig, webhookEnabled: e.target.checked })}
                          colorScheme="green"
                        />
                      </FormControl>

                      <FormControl>
                        <FormLabel>URL del Webhook</FormLabel>
                        <Input
                          value={notificationConfig.webhookUrl}
                          onChange={(e) => setNotificationConfig({ ...notificationConfig, webhookUrl: e.target.value })}
                          placeholder="https://api.example.com/webhook"
                          isDisabled={!notificationConfig.webhookEnabled}
                        />
                      </FormControl>

                      <FormControl>
                        <FormLabel>Retención de notificaciones (días)</FormLabel>
                        <NumberInput
                          value={notificationConfig.notificationRetention}
                          onChange={(_, value) => setNotificationConfig({ ...notificationConfig, notificationRetention: value })}
                          min={1}
                          max={365}
                        >
                          <NumberInputField />
                          <NumberInputStepper>
                            <NumberIncrementStepper />
                            <NumberDecrementStepper />
                          </NumberInputStepper>
                        </NumberInput>
                      </FormControl>

                      <FormControl display="flex" alignItems="center">
                        <FormLabel mb="0">
                          <HStack>
                            <FaClock />
                            <Text>Limpieza automática</Text>
                          </HStack>
                        </FormLabel>
                        <Switch
                          isChecked={notificationConfig.autoCleanup}
                          onChange={(e) => setNotificationConfig({ ...notificationConfig, autoCleanup: e.target.checked })}
                          colorScheme="green"
                        />
                      </FormControl>
                    </SimpleGrid>

                    <HStack justify="flex-end">
                      <Button colorScheme="blue" onClick={handleSaveNotificationConfig}>
                        Guardar Configuración de Notificaciones
                      </Button>
                    </HStack>
                  </VStack>
                </TabPanel>

                {/* Configuración del Sistema */}
                <TabPanel>
                  <VStack spacing={6} align="stretch">
                    <Heading size="md">Configuración del Sistema</Heading>
                    
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
                      <FormControl display="flex" alignItems="center">
                        <FormLabel mb="0">
                          <HStack>
                            <FaExclamationTriangle />
                            <Text>Modo Mantenimiento</Text>
                          </HStack>
                        </FormLabel>
                        <Switch
                          isChecked={systemConfig.maintenanceMode}
                          onChange={(e) => setSystemConfig({ ...systemConfig, maintenanceMode: e.target.checked })}
                          colorScheme="orange"
                        />
                      </FormControl>

                      <FormControl display="flex" alignItems="center">
                        <FormLabel mb="0">
                          <HStack>
                            <FaCog />
                            <Text>Modo Debug</Text>
                          </HStack>
                        </FormLabel>
                        <Switch
                          isChecked={systemConfig.debugMode}
                          onChange={(e) => setSystemConfig({ ...systemConfig, debugMode: e.target.checked })}
                          colorScheme="purple"
                        />
                      </FormControl>

                      <FormControl>
                        <FormLabel>Rate Limit API (requests/min)</FormLabel>
                        <NumberInput
                          value={systemConfig.apiRateLimit}
                          onChange={(_, value) => setSystemConfig({ ...systemConfig, apiRateLimit: value })}
                          min={10}
                          max={1000}
                        >
                          <NumberInputField />
                          <NumberInputStepper>
                            <NumberIncrementStepper />
                            <NumberDecrementStepper />
                          </NumberInputStepper>
                        </NumberInput>
                      </FormControl>

                      <FormControl>
                        <FormLabel>Límite de subida (MB)</FormLabel>
                        <NumberInput
                          value={systemConfig.fileUploadLimit}
                          onChange={(_, value) => setSystemConfig({ ...systemConfig, fileUploadLimit: value })}
                          min={1}
                          max={100}
                        >
                          <NumberInputField />
                          <NumberInputStepper>
                            <NumberIncrementStepper />
                            <NumberDecrementStepper />
                          </NumberInputStepper>
                        </NumberInput>
                      </FormControl>

                      <FormControl>
                        <FormLabel>Timeout de sesión (segundos)</FormLabel>
                        <NumberInput
                          value={systemConfig.sessionTimeout}
                          onChange={(_, value) => setSystemConfig({ ...systemConfig, sessionTimeout: value })}
                          min={1800}
                          max={86400}
                        >
                          <NumberInputField />
                          <NumberInputStepper>
                            <NumberIncrementStepper />
                            <NumberDecrementStepper />
                          </NumberInputStepper>
                        </NumberInput>
                      </FormControl>
                    </SimpleGrid>

                    <HStack justify="flex-end">
                      <Button
                        colorScheme="blue"
                        onClick={handleSaveSystemConfig}
                        isLoading={updateSystemConfigMutation.isLoading}
                      >
                        Guardar Configuración del Sistema
                      </Button>
                    </HStack>
                  </VStack>
                </TabPanel>
              </TabPanels>
            </Tabs>
          </CardBody>
        </Card>
      </VStack>
    </Box>
  );
};

export default Settings;



