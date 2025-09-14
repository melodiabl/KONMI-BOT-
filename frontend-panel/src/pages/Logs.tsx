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
  useToast,
  Spinner,
  Alert,
  AlertIcon,
  Flex,
  Card,
  CardBody,
  Select,
  useColorModeValue,
  Tooltip,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  Switch,
  FormControl,
  FormLabel,
  Textarea,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Code,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
} from '@chakra-ui/react';
import {
  FaSearch,
  FaDownload,
  FaTrash,
  FaEye,
  FaEllipsisV,
  FaSync,
  FaFilter,
  FaExclamationTriangle,
  FaInfoCircle,
  FaBug,
  FaTimes,
  FaCheck,
  FaClock,
  FaServer,
  FaUser,
  FaFileAlt,
} from 'react-icons/fa';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiService } from '../services/api';

interface LogEntry {
  id: number;
  level: string;
  message: string;
  timestamp: string;
  service?: string;
  user_id?: number;
  metadata?: any;
  stack_trace?: string;
}

const levelColors = {
  error: 'red',
  warn: 'orange',
  info: 'blue',
  debug: 'gray',
  trace: 'purple',
};

const levelIcons = {
  error: FaExclamationTriangle,
  warn: FaExclamationTriangle,
  info: FaInfoCircle,
  debug: FaBug,
  trace: FaServer,
};

export const Logs: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(5000); // 5 segundos

  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();
  const queryClient = useQueryClient();

  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Queries
  const { data: logsData, isLoading, error } = useQuery(
    ['logs', currentPage, searchTerm, levelFilter, serviceFilter],
    () => apiService.getLogs(currentPage, 50, levelFilter),
    {
      refetchInterval: autoRefresh ? refreshInterval : false,
    }
  );

  // Mutations
  const clearLogsMutation = useMutation(
    () => apiService.clearLogs(),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('logs');
        toast({
          title: 'Logs limpiados',
          description: 'Los logs han sido limpiados exitosamente',
          status: 'success',
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al limpiar logs',
          status: 'error',
        });
      },
    }
  );

  const exportLogsMutation = useMutation(
    () => apiService.exportLogs(),
    {
      onSuccess: (data) => {
        // Crear y descargar archivo
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `logs-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast({
          title: 'Logs exportados',
          description: 'Los logs han sido exportados exitosamente',
          status: 'success',
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al exportar logs',
          status: 'error',
        });
      },
    }
  );

  const handleClearLogs = () => {
    if (window.confirm('¿Estás seguro de que quieres limpiar todos los logs? Esta acción no se puede deshacer.')) {
      clearLogsMutation.mutate();
    }
  };

  const handleExportLogs = () => {
    exportLogsMutation.mutate();
  };

  const handleViewLog = (log: LogEntry) => {
    setSelectedLog(log);
    onOpen();
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString(),
      full: date.toLocaleString(),
    };
  };

  const truncateMessage = (message: string, maxLength: number = 100) => {
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + '...';
  };

  const getLogLevelStats = () => {
    if (!logsData?.logs) return {};
    
    const stats = { error: 0, warn: 0, info: 0, debug: 0, trace: 0 };
    logsData.logs.forEach((log: LogEntry) => {
      if (stats[log.level as keyof typeof stats] !== undefined) {
        stats[log.level as keyof typeof stats]++;
      }
    });
    return stats;
  };

  const levelStats = getLogLevelStats();

  if (error) {
    return (
      <Alert status="error">
        <AlertIcon />
        Error al cargar logs: {(error as any).message}
      </Alert>
    );
  }

  return (
    <Box>
      <VStack spacing={6} align="stretch">
        {/* Header */}
        <Flex align="center" justify="space-between">
          <Box>
            <Heading size="lg">Logs del Sistema</Heading>
            <Text color="gray.600" mt={1}>
              Monitoreo y gestión de logs del sistema
            </Text>
          </Box>
          <HStack spacing={3}>
            <Button
              leftIcon={<FaSync />}
              colorScheme="blue"
              variant="outline"
              onClick={() => queryClient.invalidateQueries('logs')}
              isLoading={isLoading}
            >
              Actualizar
            </Button>
            <Button
              leftIcon={<FaDownload />}
              colorScheme="green"
              variant="outline"
              onClick={handleExportLogs}
              isLoading={exportLogsMutation.isLoading}
            >
              Exportar
            </Button>
            <Button
              leftIcon={<FaTrash />}
              colorScheme="red"
              variant="outline"
              onClick={handleClearLogs}
              isLoading={clearLogsMutation.isLoading}
            >
              Limpiar
            </Button>
          </HStack>
        </Flex>

        {/* Estadísticas de Niveles */}
        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardBody>
            <HStack spacing={8} justify="center">
              <VStack>
                <Badge colorScheme="red" size="lg">
                  {(levelStats as any).error || 0}
                </Badge>
                <Text fontSize="sm" fontWeight="semibold">Error</Text>
              </VStack>
              <VStack>
                <Badge colorScheme="orange" size="lg">
                  {(levelStats as any).warn || 0}
                </Badge>
                <Text fontSize="sm" fontWeight="semibold">Warning</Text>
              </VStack>
              <VStack>
                <Badge colorScheme="blue" size="lg">
                  {(levelStats as any).info || 0}
                </Badge>
                <Text fontSize="sm" fontWeight="semibold">Info</Text>
              </VStack>
              <VStack>
                <Badge colorScheme="gray" size="lg">
                  {(levelStats as any).debug || 0}
                </Badge>
                <Text fontSize="sm" fontWeight="semibold">Debug</Text>
              </VStack>
              <VStack>
                <Badge colorScheme="purple" size="lg">
                  {(levelStats as any).trace || 0}
                </Badge>
                <Text fontSize="sm" fontWeight="semibold">Trace</Text>
              </VStack>
            </HStack>
          </CardBody>
        </Card>

        {/* Filtros */}
        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardBody>
            <HStack spacing={4} wrap="wrap">
              <InputGroup maxW="300px">
                <InputLeftElement pointerEvents="none">
                  <FaSearch color="gray.300" />
                </InputLeftElement>
                <Input
                  placeholder="Buscar en logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </InputGroup>
              <Select
                placeholder="Filtrar por nivel"
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                maxW="200px"
              >
                <option value="error">Error</option>
                <option value="warn">Warning</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
                <option value="trace">Trace</option>
              </Select>
              <Select
                placeholder="Filtrar por servicio"
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
                maxW="200px"
              >
                <option value="api">API</option>
                <option value="bot">Bot</option>
                <option value="database">Database</option>
                <option value="auth">Auth</option>
              </Select>
              <FormControl display="flex" alignItems="center" maxW="200px">
                <FormLabel mb="0" fontSize="sm">
                  Auto-refresh
                </FormLabel>
                <Switch
                  isChecked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  colorScheme="blue"
                />
              </FormControl>
            </HStack>
          </CardBody>
        </Card>

        {/* Tabla de Logs */}
        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardBody>
            {isLoading ? (
              <Box textAlign="center" py={8}>
                <Spinner size="xl" />
                <Text mt={4}>Cargando logs...</Text>
              </Box>
            ) : (
              <Box overflowX="auto">
                <Table variant="simple" size="sm">
                  <Thead>
                    <Tr>
                      <Th>Nivel</Th>
                      <Th>Mensaje</Th>
                      <Th>Servicio</Th>
                      <Th>Timestamp</Th>
                      <Th>Acciones</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {logsData?.logs?.map((log: LogEntry) => {
                      const IconComponent = levelIcons[log.level as keyof typeof levelIcons] || FaInfoCircle;
                      const timestamp = formatTimestamp(log.timestamp);
                      
                      return (
                        <Tr key={log.id}>
                          <Td>
                            <HStack>
                              <Box as={IconComponent} color={`${levelColors[log.level as keyof typeof levelColors]}.500`} />
                              <Badge
                                colorScheme={levelColors[log.level as keyof typeof levelColors] || 'gray'}
                                variant="subtle"
                              >
                                {log.level.toUpperCase()}
                              </Badge>
                            </HStack>
                          </Td>
                          <Td>
                            <VStack align="start" spacing={1}>
                              <Text fontSize="sm" fontWeight="medium">
                                {truncateMessage(log.message)}
                              </Text>
                              {log.metadata && (
                                <Text fontSize="xs" color="gray.500">
                                  {JSON.stringify(log.metadata).substring(0, 50)}...
                                </Text>
                              )}
                            </VStack>
                          </Td>
                          <Td>
                            <Text fontSize="sm" color="gray.600">
                              {log.service || 'N/A'}
                            </Text>
                          </Td>
                          <Td>
                            <VStack align="start" spacing={0}>
                              <Text fontSize="sm">{timestamp.date}</Text>
                              <Text fontSize="xs" color="gray.500">{timestamp.time}</Text>
                            </VStack>
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
                                  onClick={() => handleViewLog(log)}
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
                                  <MenuItem icon={<FaFileAlt />}>
                                    Copiar mensaje
                                  </MenuItem>
                                  <MenuItem icon={<FaUser />}>
                                    Ver usuario
                                  </MenuItem>
                                  <MenuDivider />
                                  <MenuItem icon={<FaTrash />} color="red.500">
                                    Eliminar log
                                  </MenuItem>
                                </MenuList>
                              </Menu>
                            </HStack>
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              </Box>
            )}

            {/* Paginación */}
            {logsData?.pagination && (
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
                    Página {currentPage} de {logsData.pagination.totalPages}
                  </Text>
                  <Button
                    size="sm"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    isDisabled={currentPage === logsData.pagination.totalPages}
                  >
                    Siguiente
                  </Button>
                </HStack>
              </Flex>
            )}
          </CardBody>
        </Card>
      </VStack>

      {/* Modal de Detalles del Log */}
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack>
              <Box 
                as={levelIcons[selectedLog?.level as keyof typeof levelIcons] || FaInfoCircle} 
                color={`${levelColors[selectedLog?.level as keyof typeof levelColors]}.500`} 
              />
              <Text>Detalles del Log</Text>
            </HStack>
          </ModalHeader>
          <ModalBody>
            {selectedLog && (
              <VStack spacing={4} align="stretch">
                <Box>
                  <Text fontWeight="semibold" mb={2}>Información General</Text>
                  <HStack justify="space-between">
                    <Text fontSize="sm">ID: {selectedLog.id}</Text>
                    <Badge colorScheme={levelColors[selectedLog.level as keyof typeof levelColors]}>
                      {selectedLog.level.toUpperCase()}
                    </Badge>
                  </HStack>
                  <Text fontSize="sm">Servicio: {selectedLog.service || 'N/A'}</Text>
                  <Text fontSize="sm">Timestamp: {formatTimestamp(selectedLog.timestamp).full}</Text>
                </Box>

                <Box>
                  <Text fontWeight="semibold" mb={2}>Mensaje</Text>
                  <Code p={3} borderRadius="md" display="block" whiteSpace="pre-wrap">
                    {selectedLog.message}
                  </Code>
                </Box>

                {selectedLog.metadata && (
                  <Box>
                    <Text fontWeight="semibold" mb={2}>Metadatos</Text>
                    <Code p={3} borderRadius="md" display="block">
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </Code>
                  </Box>
                )}

                {selectedLog.stack_trace && (
                  <Accordion allowToggle>
                    <AccordionItem>
                      <AccordionButton>
                        <Box flex="1" textAlign="left">
                          <Text fontWeight="semibold">Stack Trace</Text>
                        </Box>
                        <AccordionIcon />
                      </AccordionButton>
                      <AccordionPanel>
                        <Code p={3} borderRadius="md" display="block" whiteSpace="pre-wrap" fontSize="xs">
                          {selectedLog.stack_trace}
                        </Code>
                      </AccordionPanel>
                    </AccordionItem>
                  </Accordion>
                )}
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button onClick={onClose}>Cerrar</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default Logs;



