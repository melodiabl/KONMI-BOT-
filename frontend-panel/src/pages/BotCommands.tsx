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
  useColorModeValue,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Icon,
  Divider,
  Code,
  Wrap,
  WrapItem,
  Tag,
  TagLabel,
  TagCloseButton,
  Input,
  InputGroup,
  InputLeftElement,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Textarea,
  Select,
  Switch,
  Tooltip,
  Progress,
  AlertTitle,
  AlertDescription,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
} from '@chakra-ui/react';
import {
  FaRobot,
  FaCog,
  FaPlus,
  FaEdit,
  FaTrash,
  FaPlay,
  FaStop,
  FaCopy,
  FaDownload,
  FaUpload,
  FaTerminal,
  FaCode,
  FaExclamationTriangle,
  FaCheckCircle,
  FaTimesCircle,
  FaSync,
  FaList,
  FaSearch,
  FaFilter,
} from 'react-icons/fa';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiService } from '../services/api';
import dayjs from 'dayjs';

interface BotCommand {
  id: string;
  command: string;
  description: string;
  response: string;
  category: string;
  enabled: boolean;
  usage_count: number;
  last_used?: string;
  created_at: string;
  updated_at: string;
  permissions: string[];
  aliases: string[];
}

interface CommandCategory {
  id: string;
  name: string;
  description: string;
  color: string;
  command_count: number;
}

export const BotCommands: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedCommand, setSelectedCommand] = useState<BotCommand | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  
  const { isOpen: isCommandModalOpen, onOpen: onCommandModalOpen, onClose: onCommandModalClose } = useDisclosure();
  const { isOpen: isTestModalOpen, onOpen: onTestModalOpen, onClose: onTestModalClose } = useDisclosure();

  const toast = useToast();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Queries
  const { data: commandsData, isLoading: commandsLoading } = useQuery(
    ['botCommands', searchTerm, selectedCategory],
    () => apiService.getBotCommands(searchTerm, selectedCategory)
  );

  const { data: categoriesData } = useQuery('commandCategories', apiService.getCommandCategories);
  const { data: commandStats } = useQuery('commandStats', apiService.getCommandStats);

  // Mutations
  const createCommandMutation = useMutation(
    (command: Partial<BotCommand>) => apiService.createBotCommand(command),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('botCommands');
        queryClient.invalidateQueries('commandStats');
        onCommandModalClose();
        toast({
          title: 'Comando creado',
          description: 'El comando ha sido creado exitosamente',
          status: 'success',
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al crear comando',
          status: 'error',
        });
      },
    }
  );

  const updateCommandMutation = useMutation(
    ({ id, command }: { id: string; command: Partial<BotCommand> }) =>
      apiService.updateBotCommand(id, command),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('botCommands');
        queryClient.invalidateQueries('commandStats');
        onCommandModalClose();
        toast({
          title: 'Comando actualizado',
          description: 'El comando ha sido actualizado exitosamente',
          status: 'success',
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al actualizar comando',
          status: 'error',
        });
      },
    }
  );

  const deleteCommandMutation = useMutation(
    (commandId: string) => apiService.deleteBotCommand(commandId),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('botCommands');
        queryClient.invalidateQueries('commandStats');
        toast({
          title: 'Comando eliminado',
          description: 'El comando ha sido eliminado exitosamente',
          status: 'success',
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al eliminar comando',
          status: 'error',
        });
      },
    }
  );

  const toggleCommandMutation = useMutation(
    ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiService.toggleBotCommand(id, enabled),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('botCommands');
        toast({
          title: 'Estado actualizado',
          description: 'El estado del comando ha sido actualizado',
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

  const testCommandMutation = useMutation(
    ({ command, testMessage }: { command: string; testMessage: string }) =>
      apiService.testBotCommand(command, testMessage),
    {
      onSuccess: (data) => {
        toast({
          title: 'Comando probado',
          description: data.response,
          status: 'success',
          duration: 5000,
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error en prueba',
          description: error.response?.data?.message || 'Error al probar comando',
          status: 'error',
        });
      },
    }
  );

  const handleCreateCommand = () => {
    setSelectedCommand(null);
    setIsEditing(false);
    onCommandModalOpen();
  };

  const handleEditCommand = (command: BotCommand) => {
    setSelectedCommand(command);
    setIsEditing(true);
    onCommandModalOpen();
  };

  const handleDeleteCommand = (commandId: string) => {
    deleteCommandMutation.mutate(commandId);
  };

  const handleToggleCommand = (command: BotCommand) => {
    toggleCommandMutation.mutate({ id: command.id, enabled: !command.enabled });
  };

  const handleTestCommand = (command: BotCommand) => {
    setSelectedCommand(command);
    onTestModalOpen();
  };

  const handleSubmitCommand = (formData: Partial<BotCommand>) => {
    if (isEditing && selectedCommand) {
      updateCommandMutation.mutate({ id: selectedCommand.id, command: formData });
    } else {
      createCommandMutation.mutate(formData);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copiado',
      description: 'Texto copiado al portapapeles',
      status: 'success',
      duration: 2000,
    });
  };

  const commands = commandsData?.commands || [];
  const categories = categoriesData?.categories || [];

  const filteredCommands = commands.filter((command) => {
    const matchesSearch = command.command.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         command.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || command.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (commandsLoading) {
    return (
      <Box textAlign="center" py={10}>
        <Spinner size="xl" />
        <Text mt={4}>Cargando comandos del bot...</Text>
      </Box>
    );
  }

  return (
    <Box>
      <VStack spacing={6} align="stretch">
        {/* Header */}
        <Flex align="center" justify="space-between">
          <Box>
            <Heading size="lg">Comandos del Bot</Heading>
            <Text color="gray.600" mt={1}>
              Gestiona los comandos disponibles para el bot de WhatsApp
            </Text>
          </Box>
          <HStack spacing={3}>
            <Button
              leftIcon={<FaSync />}
              onClick={() => queryClient.invalidateQueries('botCommands')}
              variant="outline"
            >
              Actualizar
            </Button>
            <Button
              leftIcon={<FaPlus />}
              onClick={handleCreateCommand}
              colorScheme="blue"
            >
              Nuevo Comando
            </Button>
          </HStack>
        </Flex>

        {/* Estadísticas */}
        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardBody>
            <HStack spacing={8} justify="center">
              <Stat textAlign="center">
                <StatLabel>Total Comandos</StatLabel>
                <StatNumber>{commandStats?.totalCommands || 0}</StatNumber>
                <StatHelpText>Comandos registrados</StatHelpText>
              </Stat>
              <Stat textAlign="center">
                <StatLabel>Activos</StatLabel>
                <StatNumber color="green.500">{commandStats?.activeCommands || 0}</StatNumber>
                <StatHelpText>Comandos habilitados</StatHelpText>
              </Stat>
              <Stat textAlign="center">
                <StatLabel>Usados Hoy</StatLabel>
                <StatNumber color="blue.500">{commandStats?.todayUsage || 0}</StatNumber>
                <StatHelpText>Veces utilizados</StatHelpText>
              </Stat>
              <Stat textAlign="center">
                <StatLabel>Categorías</StatLabel>
                <StatNumber color="purple.500">{categories.length}</StatNumber>
                <StatHelpText>Categorías disponibles</StatHelpText>
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
                  placeholder="Buscar comandos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </InputGroup>
              <Select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                maxW="200px"
              >
                <option value="all">Todas las categorías</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </HStack>
          </CardBody>
        </Card>

        {/* Lista de Comandos */}
        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardHeader>
            <Heading size="md">Lista de Comandos</Heading>
          </CardHeader>
          <CardBody>
            {filteredCommands.length === 0 ? (
              <Alert status="info">
                <AlertIcon />
                No se encontraron comandos
              </Alert>
            ) : (
              <Table variant="simple">
                <Thead>
                  <Tr>
                    <Th>Comando</Th>
                    <Th>Descripción</Th>
                    <Th>Categoría</Th>
                    <Th>Estado</Th>
                    <Th>Uso</Th>
                    <Th>Último Uso</Th>
                    <Th>Acciones</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {filteredCommands.map((command) => (
                    <Tr key={command.id}>
                      <Td>
                        <VStack align="start" spacing={1}>
                          <Code fontSize="sm">{command.command}</Code>
                          {command.aliases.length > 0 && (
                            <Wrap>
                              {command.aliases.map((alias, index) => (
                                <WrapItem key={index}>
                                  <Tag size="sm" variant="outline">
                                    <TagLabel>{alias}</TagLabel>
                                  </Tag>
                                </WrapItem>
                              ))}
                            </Wrap>
                          )}
                        </VStack>
                      </Td>
                      <Td>
                        <Text fontSize="sm" noOfLines={2}>
                          {command.description}
                        </Text>
                      </Td>
                      <Td>
                        <Badge colorScheme="blue" variant="outline">
                          {command.category}
                        </Badge>
                      </Td>
                      <Td>
                        <HStack>
                          <Badge
                            colorScheme={command.enabled ? 'green' : 'red'}
                            variant="solid"
                          >
                            {command.enabled ? 'Activo' : 'Inactivo'}
                          </Badge>
                          <Switch
                            isChecked={command.enabled}
                            onChange={() => handleToggleCommand(command)}
                            colorScheme="green"
                            size="sm"
                          />
                        </HStack>
                      </Td>
                      <Td>
                        <Text fontSize="sm" fontWeight="bold">
                          {command.usage_count}
                        </Text>
                      </Td>
                      <Td>
                        <Text fontSize="sm">
                          {command.last_used 
                            ? dayjs(command.last_used).format('DD/MM HH:mm')
                            : 'Nunca'
                          }
                        </Text>
                      </Td>
                      <Td>
                        <HStack spacing={2}>
                          <Tooltip label="Probar comando">
                            <Button
                              size="sm"
                              variant="ghost"
                              leftIcon={<FaPlay />}
                              onClick={() => handleTestCommand(command)}
                            >
                              Probar
                            </Button>
                          </Tooltip>
                          <Tooltip label="Editar comando">
                            <Button
                              size="sm"
                              variant="ghost"
                              leftIcon={<FaEdit />}
                              onClick={() => handleEditCommand(command)}
                            >
                              Editar
                            </Button>
                          </Tooltip>
                          <Tooltip label="Eliminar comando">
                            <Button
                              size="sm"
                              variant="ghost"
                              colorScheme="red"
                              leftIcon={<FaTrash />}
                              onClick={() => handleDeleteCommand(command.id)}
                            >
                              Eliminar
                            </Button>
                          </Tooltip>
                        </HStack>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      </VStack>

      {/* Modal Crear/Editar Comando */}
      <Modal isOpen={isCommandModalOpen} onClose={onCommandModalClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            {isEditing ? 'Editar Comando' : 'Nuevo Comando'}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <CommandForm
              command={selectedCommand}
              onSubmit={handleSubmitCommand}
              isLoading={createCommandMutation.isLoading || updateCommandMutation.isLoading}
            />
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Modal Probar Comando */}
      <Modal isOpen={isTestModalOpen} onClose={onTestModalClose} size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Probar Comando</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedCommand && (
              <VStack spacing={4} align="stretch">
                <Box>
                  <Text fontWeight="bold">Comando:</Text>
                  <Code p={2} display="block" mt={1}>
                    {selectedCommand.command}
                  </Code>
                </Box>
                <Box>
                  <Text fontWeight="bold">Descripción:</Text>
                  <Text fontSize="sm" mt={1}>
                    {selectedCommand.description}
                  </Text>
                </Box>
                <FormControl>
                  <FormLabel>Mensaje de prueba</FormLabel>
                  <Textarea
                    placeholder="Escribe un mensaje de prueba..."
                    rows={3}
                  />
                </FormControl>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onTestModalClose}>
              Cancelar
            </Button>
            <Button
              colorScheme="blue"
              onClick={() => {
                // Implementar lógica de prueba
                onTestModalClose();
              }}
              isLoading={testCommandMutation.isLoading}
            >
              Probar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

// Componente de formulario para comandos
const CommandForm: React.FC<{
  command?: BotCommand | null;
  onSubmit: (data: Partial<BotCommand>) => void;
  isLoading: boolean;
}> = ({ command, onSubmit, isLoading }) => {
  const [formData, setFormData] = useState({
    command: command?.command || '',
    description: command?.description || '',
    response: command?.response || '',
    category: command?.category || 'general',
    enabled: command?.enabled ?? true,
    permissions: command?.permissions || [],
    aliases: command?.aliases || [],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <VStack spacing={4} align="stretch">
        <FormControl isRequired>
          <FormLabel>Comando</FormLabel>
          <Input
            value={formData.command}
            onChange={(e) => setFormData({ ...formData, command: e.target.value })}
            placeholder="ej: /help"
          />
        </FormControl>
        <FormControl isRequired>
          <FormLabel>Descripción</FormLabel>
          <Input
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Descripción del comando"
          />
        </FormControl>
        <FormControl isRequired>
          <FormLabel>Respuesta</FormLabel>
          <Textarea
            value={formData.response}
            onChange={(e) => setFormData({ ...formData, response: e.target.value })}
            placeholder="Respuesta del bot"
            rows={4}
          />
        </FormControl>
        <FormControl>
          <FormLabel>Categoría</FormLabel>
          <Select
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          >
            <option value="general">General</option>
            <option value="admin">Administración</option>
            <option value="fun">Diversión</option>
            <option value="utility">Utilidades</option>
            <option value="info">Información</option>
          </Select>
        </FormControl>
        <FormControl display="flex" alignItems="center">
          <FormLabel mb="0">Habilitado</FormLabel>
          <Switch
            isChecked={formData.enabled}
            onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
          />
        </FormControl>
      </VStack>
    </form>
  );
};

export default BotCommands;
