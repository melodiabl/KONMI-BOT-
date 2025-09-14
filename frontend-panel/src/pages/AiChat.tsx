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
  Textarea,
  Icon,
  Badge,
  Divider,
  Code,
  Wrap,
  WrapItem,
  Tag,
  TagLabel,
  TagCloseButton,
  Input,
  InputGroup,
  InputRightElement,
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
  Select,
  Switch,
  Tooltip,
  Progress,
  AlertTitle,
  AlertDescription,
} from '@chakra-ui/react';
import {
  FaRobot,
  FaUser,
  FaPaperPlane,
  FaCog,
  FaHistory,
  FaTrash,
  FaCopy,
  FaDownload,
  FaUpload,
  FaBrain,
  FaLightbulb,
  FaQuestionCircle,
  FaExclamationTriangle,
  FaCheckCircle,
  FaTimesCircle,
  FaSync,
  FaPlus,
} from 'react-icons/fa';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiService } from '../services/api';
import dayjs from 'dayjs';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tokens_used?: number;
  model?: string;
}

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  last_message: string;
  message_count: number;
}

export const AiChat: React.FC = () => {
  const [currentMessage, setCurrentMessage] = useState('');
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  
  const { isOpen: isSettingsOpen, onOpen: onSettingsOpen, onClose: onSettingsClose } = useDisclosure();
  const { isOpen: isHistoryOpen, onOpen: onHistoryOpen, onClose: onHistoryClose } = useDisclosure();

  const toast = useToast();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const messageBg = useColorModeValue('gray.50', 'gray.600');
  const userMessageBg = useColorModeValue('blue.50', 'blue.900');

  // Queries
  const { data: messages, isLoading: messagesLoading } = useQuery(
    ['chatMessages', selectedSession],
    () => apiService.getChatMessages(selectedSession || ''),
    {
      enabled: !!selectedSession,
      refetchInterval: 1000,
    }
  );

  const { data: sessions, isLoading: sessionsLoading } = useQuery(
    'chatSessions',
    apiService.getChatSessions
  );

  const { data: aiStats } = useQuery('aiStats', apiService.getAiStats);

  // Mutations
  const sendMessageMutation = useMutation(
    (message: string) => apiService.sendChatMessage(selectedSession || '', message),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['chatMessages', selectedSession]);
        queryClient.invalidateQueries('chatSessions');
        setCurrentMessage('');
        setIsTyping(false);
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al enviar mensaje',
          status: 'error',
        });
        setIsTyping(false);
      },
    }
  );

  const createSessionMutation = useMutation(
    (title: string) => apiService.createChatSession(title),
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries('chatSessions');
        setSelectedSession(data.id);
        toast({
          title: 'Nueva sesión creada',
          description: 'Se ha creado una nueva sesión de chat',
          status: 'success',
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al crear sesión',
          status: 'error',
        });
      },
    }
  );

  const deleteSessionMutation = useMutation(
    (sessionId: string) => apiService.deleteChatSession(sessionId),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('chatSessions');
        if (selectedSession === selectedSession) {
          setSelectedSession(null);
        }
        toast({
          title: 'Sesión eliminada',
          description: 'La sesión ha sido eliminada exitosamente',
          status: 'success',
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al eliminar sesión',
          status: 'error',
        });
      },
    }
  );

  const handleSendMessage = () => {
    if (!currentMessage.trim() || !selectedSession) return;
    
    setIsTyping(true);
    sendMessageMutation.mutate(currentMessage);
  };

  const handleCreateSession = () => {
    const title = `Chat ${dayjs().format('DD/MM/YYYY HH:mm')}`;
    createSessionMutation.mutate(title);
  };

  const handleDeleteSession = (sessionId: string) => {
    deleteSessionMutation.mutate(sessionId);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
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

  const chatMessages = messages || [];
  const chatSessions = sessions || [];

  if (messagesLoading || sessionsLoading) {
    return (
      <Box textAlign="center" py={10}>
        <Spinner size="xl" />
        <Text mt={4}>Cargando chat AI...</Text>
      </Box>
    );
  }

  return (
    <Box>
      <VStack spacing={6} align="stretch">
        {/* Header */}
        <Flex align="center" justify="space-between">
          <Box>
            <Heading size="lg">AI Chat</Heading>
            <Text color="gray.600" mt={1}>
              Conversa con la inteligencia artificial del bot
            </Text>
          </Box>
          <HStack spacing={3}>
            <Button
              leftIcon={<FaHistory />}
              onClick={onHistoryOpen}
              variant="outline"
            >
              Historial
            </Button>
            <Button
              leftIcon={<FaCog />}
              onClick={onSettingsOpen}
              variant="outline"
            >
              Configuración
            </Button>
            <Button
              leftIcon={<FaPlus />}
              onClick={handleCreateSession}
              colorScheme="blue"
              isLoading={createSessionMutation.isLoading}
            >
              Nueva Sesión
            </Button>
          </HStack>
        </Flex>

        {/* Estadísticas */}
        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardBody>
            <HStack spacing={8} justify="center">
              <Flex align="center" gap={2}>
                <Icon as={FaBrain} color="purple.500" />
                <Text fontWeight="bold">Sesiones Activas</Text>
                <Badge colorScheme="purple">{chatSessions.length}</Badge>
              </Flex>
              <Flex align="center" gap={2}>
                <Icon as={FaPaperPlane} color="blue.500" />
                <Text fontWeight="bold">Mensajes Enviados</Text>
                <Badge colorScheme="blue">{aiStats?.totalMessages || 0}</Badge>
              </Flex>
              <Flex align="center" gap={2}>
                <Icon as={FaCog} color="green.500" />
                <Text fontWeight="bold">Tokens Usados</Text>
                <Badge colorScheme="green">{aiStats?.totalTokens || 0}</Badge>
              </Flex>
            </HStack>
          </CardBody>
        </Card>

        <HStack spacing={6} align="start">
          {/* Lista de Sesiones */}
          <Card bg={cardBg} border="1px" borderColor={borderColor} w="300px">
            <CardHeader>
              <Heading size="sm">Sesiones de Chat</Heading>
            </CardHeader>
            <CardBody>
              {chatSessions.length === 0 ? (
                <Alert status="info">
                  <AlertIcon />
                  No hay sesiones de chat
                </Alert>
              ) : (
                <VStack spacing={2} align="stretch">
                  {chatSessions.map((session) => (
                    <Box
                      key={session.id}
                      p={3}
                      borderRadius="md"
                      bg={selectedSession === session.id ? 'blue.50' : 'transparent'}
                      border="1px"
                      borderColor={selectedSession === session.id ? 'blue.200' : 'transparent'}
                      cursor="pointer"
                      onClick={() => setSelectedSession(session.id)}
                      _hover={{ bg: 'gray.50' }}
                    >
                      <VStack align="start" spacing={1}>
                        <Text fontWeight="bold" fontSize="sm" noOfLines={1}>
                          {session.title}
                        </Text>
                        <Text fontSize="xs" color="gray.500">
                          {session.message_count} mensajes
                        </Text>
                        <Text fontSize="xs" color="gray.400">
                          {dayjs(session.last_message).format('DD/MM HH:mm')}
                        </Text>
                      </VStack>
                      <HStack justify="end" mt={2}>
                        <Button
                          size="xs"
                          variant="ghost"
                          colorScheme="red"
                          leftIcon={<FaTrash />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSession(session.id);
                          }}
                        >
                          Eliminar
                        </Button>
                      </HStack>
                    </Box>
                  ))}
                </VStack>
              )}
            </CardBody>
          </Card>

          {/* Chat Principal */}
          <Card bg={cardBg} border="1px" borderColor={borderColor} flex={1}>
            <CardHeader>
              <Heading size="sm">
                {selectedSession ? `Sesión: ${chatSessions.find(s => s.id === selectedSession)?.title}` : 'Selecciona una sesión'}
              </Heading>
            </CardHeader>
            <CardBody>
              {!selectedSession ? (
                <Alert status="info">
                  <AlertIcon />
                  Selecciona una sesión de chat para comenzar
                </Alert>
              ) : (
                <VStack spacing={4} align="stretch" h="500px">
                  {/* Mensajes */}
                  <Box
                    flex={1}
                    overflowY="auto"
                    p={4}
                    bg={messageBg}
                    borderRadius="md"
                    maxH="400px"
                  >
                    {chatMessages.length === 0 ? (
                      <Text color="gray.500" textAlign="center" py={8}>
                        No hay mensajes en esta sesión
                      </Text>
                    ) : (
                      <VStack spacing={3} align="stretch">
                        {chatMessages.map((message) => (
                          <Box
                            key={message.id}
                            alignSelf={message.role === 'user' ? 'flex-end' : 'flex-start'}
                            maxW="80%"
                          >
                            <HStack
                              spacing={3}
                              p={3}
                              borderRadius="lg"
                              bg={message.role === 'user' ? userMessageBg : 'white'}
                              border="1px"
                              borderColor={borderColor}
                            >
                              <Icon
                                as={message.role === 'user' ? FaUser : FaRobot}
                                color={message.role === 'user' ? 'blue.500' : 'purple.500'}
                              />
                              <VStack align="start" spacing={1} flex={1}>
                                <Text fontSize="sm" whiteSpace="pre-wrap">
                                  {message.content}
                                </Text>
                                <HStack spacing={2} fontSize="xs" color="gray.500">
                                  <Text>{dayjs(message.timestamp).format('HH:mm')}</Text>
                                  {message.tokens_used && (
                                    <Text>• {message.tokens_used} tokens</Text>
                                  )}
                                  {message.model && (
                                    <Text>• {message.model}</Text>
                                  )}
                                </HStack>
                              </VStack>
                              <Button
                                size="xs"
                                variant="ghost"
                                leftIcon={<FaCopy />}
                                onClick={() => copyToClipboard(message.content)}
                              >
                                Copiar
                              </Button>
                            </HStack>
                          </Box>
                        ))}
                        {isTyping && (
                          <Box alignSelf="flex-start">
                            <HStack spacing={3} p={3} borderRadius="lg" bg="white" border="1px" borderColor={borderColor}>
                              <Icon as={FaRobot} color="purple.500" />
                              <HStack spacing={1}>
                                <Text>AI está escribiendo</Text>
                                <Spinner size="xs" />
                              </HStack>
                            </HStack>
                          </Box>
                        )}
                      </VStack>
                    )}
                  </Box>

                  {/* Input de mensaje */}
                  <HStack spacing={3}>
                    <Textarea
                      value={currentMessage}
                      onChange={(e) => setCurrentMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Escribe tu mensaje aquí..."
                      resize="none"
                      rows={2}
                    />
                    <Button
                      onClick={handleSendMessage}
                      leftIcon={<FaPaperPlane />}
                      colorScheme="blue"
                      isLoading={sendMessageMutation.isLoading}
                      isDisabled={!currentMessage.trim()}
                    >
                      Enviar
                    </Button>
                  </HStack>
                </VStack>
              )}
            </CardBody>
          </Card>
        </HStack>
      </VStack>

      {/* Modal Configuración */}
      <Modal isOpen={isSettingsOpen} onClose={onSettingsClose} size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Configuración de AI Chat</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <FormControl>
                <FormLabel>Modelo de IA</FormLabel>
                <Select defaultValue="gpt-3.5-turbo">
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  <option value="gpt-4">GPT-4</option>
                  <option value="claude-3">Claude 3</option>
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Temperatura</FormLabel>
                <Input type="number" min="0" max="2" step="0.1" defaultValue="0.7" />
              </FormControl>
              <FormControl>
                <FormLabel>Máximo de tokens</FormLabel>
                <Input type="number" defaultValue="1000" />
              </FormControl>
              <FormControl display="flex" alignItems="center">
                <FormLabel mb="0">Modo creativo</FormLabel>
                <Switch defaultChecked />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onSettingsClose}>
              Cancelar
            </Button>
            <Button colorScheme="blue" onClick={onSettingsClose}>
              Guardar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal Historial */}
      <Modal isOpen={isHistoryOpen} onClose={onHistoryClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Historial de Conversaciones</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={3} align="stretch">
              {chatSessions.map((session) => (
                <Box
                  key={session.id}
                  p={3}
                  borderRadius="md"
                  border="1px"
                  borderColor={borderColor}
                  cursor="pointer"
                  onClick={() => {
                    setSelectedSession(session.id);
                    onHistoryClose();
                  }}
                  _hover={{ bg: 'gray.50' }}
                >
                  <HStack justify="space-between">
                    <VStack align="start" spacing={1}>
                      <Text fontWeight="bold">{session.title}</Text>
                      <Text fontSize="sm" color="gray.500">
                        {session.message_count} mensajes • {dayjs(session.created_at).format('DD/MM/YYYY HH:mm')}
                      </Text>
                    </VStack>
                    <Badge colorScheme="blue">{session.message_count}</Badge>
                  </HStack>
                </Box>
              ))}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={onHistoryClose}>
              Cerrar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default AiChat;
