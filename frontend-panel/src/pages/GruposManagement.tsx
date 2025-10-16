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
  useToast,
  Spinner,
  Alert,
  AlertIcon,
  Flex,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Badge,
  Icon,
  useColorModeValue,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  Switch,
  Tooltip,
  Divider,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Progress,
  AlertTitle,
  AlertDescription,
  Code,
  Wrap,
  WrapItem,
  Tag,
  TagLabel,
  TagCloseButton,
} from '@chakra-ui/react';
import {
  FaUsers,
  FaPowerOff,
  FaGlobe,
  FaBell,
  FaCheckCircle,
  FaTimesCircle,
  FaExclamationTriangle,
  FaEye,
  FaHistory,
  FaChartBar,
  FaCog,
  FaRobot,
  FaToggleOn,
  FaToggleOff,
  FaSync,
} from 'react-icons/fa';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiService } from '../services/api';
import dayjs from 'dayjs';

interface Group {
  id: string;
  jid: string;
  nombre: string;
  descripcion?: string;
  bot_activo: boolean;
  desactivado_por?: string;
  fecha_desactivacion?: string;
  created_at?: string;
}

interface GlobalNotification {
  id: number;
  grupo_jid: string;
  grupo_nombre: string;
  tipo: string;
  mensaje: string;
  enviado_por: string;
  fecha_envio: string;
  estado: 'enviado' | 'error';
  error_message?: string;
}

export const GruposManagement: React.FC = () => {
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [selectedNotification, setSelectedNotification] = useState<GlobalNotification | null>(null);

  const { isOpen: isGroupModalOpen, onOpen: onGroupModalOpen, onClose: onGroupModalClose } = useDisclosure();
  const { isOpen: isNotificationModalOpen, onOpen: onNotificationModalOpen, onClose: onNotificationModalClose } = useDisclosure();
  const { isOpen: isShutdownModalOpen, onOpen: onShutdownModalOpen, onClose: onShutdownModalClose } = useDisclosure();

  const toast = useToast();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Queries
  const { data: groupsData, isLoading: groupsLoading, refetch: refetchGroups } = useQuery('groupsManagement', apiService.getGroupsManagement);
  const { data: notificationsData, isLoading: notificationsLoading } = useQuery('globalNotifications', () => apiService.getGlobalNotifications(1, 50));
  const { data: notificationStats } = useQuery('globalNotificationStats', apiService.getGlobalNotificationStats);

  // Mutations
  const toggleGroupMutation = useMutation(
    ({ groupId, action }: { groupId: string; action: 'on' | 'off' }) =>
      apiService.toggleGroupBot(groupId, action),
    {
      onSuccess: (data, variables) => {
        queryClient.invalidateQueries('groupsManagement');
        toast({
          title: 'Estado actualizado',
          description: `Bot ${variables.action === 'on' ? 'activado' : 'desactivado'} en el grupo`,
          status: 'success',
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al actualizar el estado del grupo',
          status: 'error',
        });
      },
    }
  );

  const shutdownBotMutation = useMutation(
    () => apiService.shutdownBotGlobally(),
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries('groupsManagement');
        queryClient.invalidateQueries('globalNotifications');
        queryClient.invalidateQueries('globalNotificationStats');
        onShutdownModalClose();
        toast({
          title: 'Bot desactivado globalmente',
          description: data.message,
          status: 'success',
          duration: 5000,
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al desactivar el bot globalmente',
          status: 'error',
        });
      },
    }
  );

  const startupBotMutation = useMutation(
    () => apiService.startupBotGlobally(),
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries('groupsManagement');
        queryClient.invalidateQueries('globalNotifications');
        queryClient.invalidateQueries('globalNotificationStats');
        toast({
          title: 'Bot activado globalmente',
          description: data.message,
          status: 'success',
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al activar el bot globalmente',
          status: 'error',
        });
      },
    }
  );

  const handleToggleGroup = (group: Group) => {
    const action = group.bot_activo ? 'off' : 'on';
    toggleGroupMutation.mutate({ groupId: group.jid, action });
  };

  const handleViewGroup = (group: Group) => {
    setSelectedGroup(group);
    onGroupModalOpen();
  };

  const handleViewNotification = (notification: GlobalNotification) => {
    setSelectedNotification(notification);
    onNotificationModalOpen();
  };

  const handleGlobalShutdown = () => {
    shutdownBotMutation.mutate();
  };

  const handleGlobalStartup = () => {
    startupBotMutation.mutate();
  };

  const groups = groupsData?.grupos || [];
  const notifications = notificationsData?.notificaciones || [];

  const activeGroups = groups.filter(g => g.bot_activo).length;
  const inactiveGroups = groups.filter(g => !g.bot_activo).length;

  if (groupsLoading) {
    return (
      <Box textAlign="center" py={10}>
        <Spinner size="xl" />
        <Text mt={4}>Cargando gestión de grupos...</Text>
      </Box>
    );
  }

  return (
    <Box>
      <VStack spacing={6} align="stretch">
        {/* Header */}
        <Flex align="center" justify="space-between">
          <Box>
            <Heading size="lg">Gestión de Grupos</Heading>
            <Text color="gray.600" mt={1}>
              Administra el estado del bot en cada grupo
            </Text>
          </Box>
          <HStack spacing={3}>
            <Button
              leftIcon={<FaSync />}
              onClick={() => refetchGroups()}
              variant="outline"
            >
              Actualizar
            </Button>
            <Button
              leftIcon={<FaPowerOff />}
              colorScheme="red"
              onClick={onShutdownModalOpen}
              isLoading={shutdownBotMutation.isLoading}
            >
              Apagar Globalmente
            </Button>
            <Button
              leftIcon={<FaToggleOn />}
              colorScheme="green"
              onClick={handleGlobalStartup}
              isLoading={startupBotMutation.isLoading}
            >
              Encender Globalmente
            </Button>
          </HStack>
        </Flex>

        {/* Estadísticas */}
        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardBody>
            <HStack spacing={8} justify="center">
              <Stat textAlign="center">
                <StatLabel>Total Grupos</StatLabel>
                <StatNumber>{groups.length}</StatNumber>
                <StatHelpText>Grupos registrados</StatHelpText>
              </Stat>
              <Stat textAlign="center">
                <StatLabel>Bot Activo</StatLabel>
                <StatNumber color="green.500">{activeGroups}</StatNumber>
                <StatHelpText>Grupos con bot activo</StatHelpText>
              </Stat>
              <Stat textAlign="center">
                <StatLabel>Bot Inactivo</StatLabel>
                <StatNumber color="red.500">{inactiveGroups}</StatNumber>
                <StatHelpText>Grupos con bot inactivo</StatHelpText>
              </Stat>
              <Stat textAlign="center">
                <StatLabel>Notificaciones</StatLabel>
                <StatNumber>{notificationStats?.total || 0}</StatNumber>
                <StatHelpText>Notificaciones enviadas</StatHelpText>
              </Stat>
            </HStack>
          </CardBody>
        </Card>

        {/* Tabs */}
        <Tabs>
          <TabList>
            <Tab>Grupos</Tab>
            <Tab>Notificaciones Globales</Tab>
          </TabList>

          <TabPanels>
            {/* Tab Grupos */}
            <TabPanel px={0}>
              <Card bg={cardBg} border="1px" borderColor={borderColor}>
                <CardHeader>
                  <Heading size="md">Lista de Grupos</Heading>
                </CardHeader>
                <CardBody>
                  {groups.length === 0 ? (
                    <Alert status="info">
                      <AlertIcon />
                      No hay grupos registrados
                    </Alert>
                  ) : (
                    <Table variant="simple">
                      <Thead>
                        <Tr>
                          <Th>Grupo</Th>
                          <Th>Estado Bot</Th>
                          <Th>Última Actividad</Th>
                          <Th>Acciones</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {groups.map((group) => (
                          <Tr key={group.jid}>
                            <Td>
                              <VStack align="start" spacing={1}>
                                <Text fontWeight="bold">{group.nombre}</Text>
                                <Text fontSize="sm" color="gray.500">
                                  {group.jid}
                                </Text>
                                {group.descripcion && (
                                  <Text fontSize="xs" color="gray.400">
                                    {group.descripcion}
                                  </Text>
                                )}
                              </VStack>
                            </Td>
                            <Td>
                              <HStack>
                                <Badge
                                  colorScheme={group.bot_activo ? 'green' : 'red'}
                                  variant="solid"
                                >
                                  {group.bot_activo ? 'Activo' : 'Inactivo'}
                                </Badge>
                                {!group.bot_activo && group.desactivado_por && (
                                  <Text fontSize="xs" color="gray.500">
                                    por {group.desactivado_por}
                                  </Text>
                                )}
                              </HStack>
                            </Td>
                            <Td>
                              <Text fontSize="sm">
                                {group.fecha_desactivacion
                                  ? dayjs(group.fecha_desactivacion).format('DD/MM/YYYY HH:mm')
                                  : 'N/A'
                                }
                              </Text>
                            </Td>
                            <Td>
                              <HStack spacing={2}>
                                <Tooltip label={group.bot_activo ? 'Desactivar bot' : 'Activar bot'}>
                                  <Switch
                                    isChecked={group.bot_activo}
                                    onChange={() => handleToggleGroup(group)}
                                    colorScheme="green"
                                    isDisabled={toggleGroupMutation.isLoading}
                                  />
                                </Tooltip>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  leftIcon={<FaEye />}
                                  onClick={() => handleViewGroup(group)}
                                >
                                  Ver
                                </Button>
                              </HStack>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  )}
                </CardBody>
              </Card>
            </TabPanel>

            {/* Tab Notificaciones */}
            <TabPanel px={0}>
              <Card bg={cardBg} border="1px" borderColor={borderColor}>
                <CardHeader>
                  <Heading size="md">Historial de Notificaciones Globales</Heading>
                </CardHeader>
                <CardBody>
                  {notificationsLoading ? (
                    <Spinner />
                  ) : notifications.length === 0 ? (
                    <Alert status="info">
                      <AlertIcon />
                      No hay notificaciones globales
                    </Alert>
                  ) : (
                    <Table variant="simple">
                      <Thead>
                        <Tr>
                          <Th>Grupo</Th>
                          <Th>Tipo</Th>
                          <Th>Estado</Th>
                          <Th>Fecha</Th>
                          <Th>Acciones</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {notifications.map((notification) => (
                          <Tr key={notification.id}>
                            <Td>
                              <Text fontWeight="bold">{notification.grupo_nombre}</Text>
                              <Text fontSize="xs" color="gray.500">
                                {notification.grupo_jid}
                              </Text>
                            </Td>
                            <Td>
                              <Badge colorScheme="blue" variant="outline">
                                {notification.tipo}
                              </Badge>
                            </Td>
                            <Td>
                              <HStack>
                                <Icon
                                  as={notification.estado === 'enviado' ? FaCheckCircle : FaTimesCircle}
                                  color={notification.estado === 'enviado' ? 'green.500' : 'red.500'}
                                />
                                <Text fontSize="sm">
                                  {notification.estado === 'enviado' ? 'Enviado' : 'Error'}
                                </Text>
                              </HStack>
                            </Td>
                            <Td>
                              <Text fontSize="sm">
                                {dayjs(notification.fecha_envio).format('DD/MM/YYYY HH:mm')}
                              </Text>
                            </Td>
                            <Td>
                              <Button
                                size="sm"
                                variant="ghost"
                                leftIcon={<FaEye />}
                                onClick={() => handleViewNotification(notification)}
                              >
                                Ver
                              </Button>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  )}
                </CardBody>
              </Card>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </VStack>

      {/* Modal Detalles del Grupo */}
      <Modal isOpen={isGroupModalOpen} onClose={onGroupModalClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Detalles del Grupo</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedGroup && (
              <VStack spacing={4} align="stretch">
                <HStack>
                  <Icon as={FaUsers} size="lg" color="blue.500" />
                  <Box>
                    <Heading size="md">{selectedGroup.nombre}</Heading>
                    <Text color="gray.500">{selectedGroup.jid}</Text>
                  </Box>
                </HStack>

                <Divider />

                <SimpleGrid columns={2} spacing={4}>
                  <Box>
                    <Text fontWeight="bold">Estado del Bot</Text>
                    <HStack mt={2}>
                      <Badge
                        colorScheme={selectedGroup.bot_activo ? 'green' : 'red'}
                        variant="solid"
                      >
                        {selectedGroup.bot_activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                      <Switch
                        isChecked={selectedGroup.bot_activo}
                        onChange={() => handleToggleGroup(selectedGroup)}
                        colorScheme="green"
                        isDisabled={toggleGroupMutation.isLoading}
                      />
                    </HStack>
                  </Box>
                  <Box>
                    <Text fontWeight="bold">Última Actividad</Text>
                    <Text fontSize="sm" mt={2}>
                      {selectedGroup.fecha_desactivacion
                        ? dayjs(selectedGroup.fecha_desactivacion).format('DD/MM/YYYY HH:mm')
                        : 'N/A'
                      }
                    </Text>
                  </Box>
                </SimpleGrid>

                {selectedGroup.descripcion && (
                  <>
                    <Divider />
                    <Box>
                      <Text fontWeight="bold">Descripción</Text>
                      <Text fontSize="sm" mt={2}>
                        {selectedGroup.descripcion}
                      </Text>
                    </Box>
                  </>
                )}

                {!selectedGroup.bot_activo && selectedGroup.desactivado_por && (
                  <>
                    <Divider />
                    <Box>
                      <Text fontWeight="bold">Desactivado por</Text>
                      <Text fontSize="sm" mt={2}>
                        {selectedGroup.desactivado_por}
                      </Text>
                    </Box>
                  </>
                )}
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onGroupModalClose}>
              Cerrar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal Detalles de Notificación */}
      <Modal isOpen={isNotificationModalOpen} onClose={onNotificationModalClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Detalles de Notificación</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedNotification && (
              <VStack spacing={4} align="stretch">
                <HStack>
                  <Icon as={FaBell} size="lg" color="blue.500" />
                  <Box>
                    <Heading size="md">{selectedNotification.grupo_nombre}</Heading>
                    <Text color="gray.500">{selectedNotification.grupo_jid}</Text>
                  </Box>
                </HStack>

                <Divider />

                <SimpleGrid columns={2} spacing={4}>
                  <Box>
                    <Text fontWeight="bold">Estado</Text>
                    <HStack mt={2}>
                      <Icon
                        as={selectedNotification.estado === 'enviado' ? FaCheckCircle : FaTimesCircle}
                        color={selectedNotification.estado === 'enviado' ? 'green.500' : 'red.500'}
                      />
                      <Text fontSize="sm">
                        {selectedNotification.estado === 'enviado' ? 'Enviado' : 'Error'}
                      </Text>
                    </HStack>
                  </Box>
                  <Box>
                    <Text fontWeight="bold">Fecha</Text>
                    <Text fontSize="sm" mt={2}>
                      {dayjs(selectedNotification.fecha_envio).format('DD/MM/YYYY HH:mm')}
                    </Text>
                  </Box>
                </SimpleGrid>

                <Divider />

                <Box>
                  <Text fontWeight="bold">Mensaje Enviado</Text>
                  <Code p={3} mt={2} display="block" whiteSpace="pre-wrap">
                    {selectedNotification.mensaje}
                  </Code>
                </Box>

                {selectedNotification.error_message && (
                  <>
                    <Divider />
                    <Box>
                      <Text fontWeight="bold" color="red.500">Error</Text>
                      <Text fontSize="sm" mt={2} color="red.500">
                        {selectedNotification.error_message}
                      </Text>
                    </Box>
                  </>
                )}
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onNotificationModalClose}>
              Cerrar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal Confirmación Apagado Global */}
      <Modal isOpen={isShutdownModalOpen} onClose={onShutdownModalClose} size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Confirmar Apagado Global</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Alert status="warning" mb={4}>
              <AlertIcon />
              <Box>
                <AlertTitle>¡Atención!</AlertTitle>
                <AlertDescription>
                  Esta acción desactivará el bot en TODOS los grupos y enviará una notificación global.
                  Solo el administrador podrá reactivarlo.
                </AlertDescription>
              </Box>
            </Alert>
            <Text>
              ¿Estás seguro de que quieres desactivar el bot globalmente?
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onShutdownModalClose}>
              Cancelar
            </Button>
            <Button
              colorScheme="red"
              onClick={handleGlobalShutdown}
              isLoading={shutdownBotMutation.isLoading}
            >
              Desactivar Globalmente
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default GruposManagement;

