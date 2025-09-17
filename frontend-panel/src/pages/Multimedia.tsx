import React, { useState, useEffect } from 'react';
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
  Input,
  Select,
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
  Grid,
  Image,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  FormControl,
  FormLabel,
  Textarea,
  Progress,
  Tooltip,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  IconButton,
  AspectRatio,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import {
  FaImage,
  FaVideo,
  FaMusic,
  FaFile,
  FaPlus,
  FaEdit,
  FaTrash,
  FaDownload,
  FaEye,
  FaShare,
  FaUpload,
  FaSearch,
  FaEllipsisV,
  FaImages,
  FaMicrophone,
  FaFileAlt,
} from 'react-icons/fa';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiService } from '../services/api';
import { RUNTIME_CONFIG } from '../config/runtime-config';

interface MultimediaItem {
  id: number;
  name: string;
  description: string;
  type: 'image' | 'video' | 'audio' | 'document';
  format: string;
  size: number;
  url: string;
  thumbnail?: string;
  duration?: number;
  tags: string[];
  category: string;
  uploadedBy: string;
  uploadedAt: string;
  downloads: number;
  views: number;
}

interface MultimediaResponse {
  items: MultimediaItem[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface MultimediaStats {
  total: number;
  totalFiles: number;
  images: number;
  videos: number;
  audio: number;
  documents: number;
}

export const Multimedia: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedItem, setSelectedItem] = useState<MultimediaItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  const { isOpen: isUploadOpen, onOpen: onUploadOpen, onClose: onUploadClose } = useDisclosure();
  const { isOpen: isViewOpen, onOpen: onViewOpen, onClose: onViewClose } = useDisclosure();

  const toast = useToast();
  const queryClient = useQueryClient();
  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Queries
  const { data: multimediaData, isLoading, error } = useQuery<MultimediaResponse>(
    ['multimedia', currentPage, searchTerm, typeFilter],
    () =>
      apiService.getMultimediaItems({
        page: currentPage,
        limit: 12,
        search: searchTerm,
        type: typeFilter === 'all' ? undefined : typeFilter,
      })
  );

  const { data: multimediaStats } = useQuery<MultimediaStats>('multimediaStats', apiService.getMultimediaStats);

  // Mutations
  const deleteMultimediaMutation = useMutation(
    (id: number) => apiService.deleteMultimedia(id),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('multimedia');
        queryClient.invalidateQueries('multimediaStats');
        toast({
          title: 'Archivo eliminado exitosamente',
          status: 'success',
        });
      },
      onError: (error: any) => {
        toast({
          title: 'Error',
          description: error.response?.data?.message || 'Error al eliminar el archivo',
          status: 'error',
        });
      },
    }
  );

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'image': return FaImage;
      case 'video': return FaVideo;
      case 'audio': return FaMusic;
      case 'document': return FaFile;
      default: return FaFile;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'image': return 'blue';
      case 'video': return 'purple';
      case 'audio': return 'green';
      case 'document': return 'orange';
      default: return 'gray';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return null;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  const items = multimediaData?.items || [];
  const pagination = multimediaData?.pagination;

  useEffect(() => {
    if (!RUNTIME_CONFIG.ENABLE_REAL_TIME) {
      return;
    }

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      return;
    }

    const baseUrl = RUNTIME_CONFIG.API_BASE_URL && RUNTIME_CONFIG.API_BASE_URL.trim().length > 0
      ? RUNTIME_CONFIG.API_BASE_URL
      : window.location.origin;

    let eventSource: EventSource | null = null;

    try {
      const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
      const url = new URL('api/aportes/stream', normalizedBase);
      url.searchParams.set('token', token);
      eventSource = new EventSource(url.toString());
    } catch (err) {
      console.error('No se pudo iniciar la sincronización en tiempo real de multimedia', err);
      return;
    }

    eventSource.onmessage = (event) => {
      if (!event.data) return;
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'aporteChanged') {
          queryClient.invalidateQueries('multimedia');
          queryClient.invalidateQueries('multimediaStats');
        }
      } catch (error) {
        console.error('Error procesando actualización de multimedia', error);
      }
    };

    eventSource.onerror = (err) => {
      console.error('Stream de multimedia en tiempo real desconectado', err);
    };

    return () => {
      eventSource?.close();
    };
  }, [queryClient]);

  const handleDeleteItem = (id: number) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar este archivo?')) {
      deleteMultimediaMutation.mutate(id);
    }
  };

  const handleViewItem = (item: MultimediaItem) => {
    setSelectedItem(item);
    onViewOpen();
  };

  const handleDownload = (item: MultimediaItem) => {
    if (!item.url) {
      toast({ title: 'Sin archivo disponible', status: 'warning' });
      return;
    }
    const link = document.createElement('a');
    link.href = item.url;
    link.download = item.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: 'Descarga iniciada',
      description: `Descargando ${item.name}`,
      status: 'info',
    });
  };

  if (isLoading) {
    return (
      <Box textAlign="center" py={10}>
        <Spinner size="xl" />
        <Text mt={4}>Cargando multimedia...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box textAlign="center" py={10}>
        <Alert status="error" maxW="lg" mx="auto">
          <AlertIcon />
          Error al cargar multimedia: {(error as any).message}
        </Alert>
      </Box>
    );
  }

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, typeFilter]);

  useEffect(() => {
    if (!RUNTIME_CONFIG.ENABLE_REAL_TIME) {
      return;
    }

    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      return;
    }

    const baseUrl = RUNTIME_CONFIG.API_BASE_URL && RUNTIME_CONFIG.API_BASE_URL.trim().length > 0
      ? RUNTIME_CONFIG.API_BASE_URL
      : window.location.origin;

    let eventSource: EventSource | null = null;

    try {
      const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
      const url = new URL('api/aportes/stream', normalizedBase);
      url.searchParams.set('token', token);
      eventSource = new EventSource(url.toString());
    } catch (err) {
      console.error('No se pudo iniciar la sincronización en tiempo real de multimedia', err);
      return;
    }

    eventSource.onmessage = (event) => {
      if (!event.data) return;
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'aporteChanged') {
          queryClient.invalidateQueries('multimedia');
          queryClient.invalidateQueries('multimediaStats');
        }
      } catch (error) {
        console.error('Error procesando actualización de multimedia', error);
      }
    };

    eventSource.onerror = (err) => {
      console.error('Stream de multimedia en tiempo real desconectado', err);
    };

    return () => {
      eventSource?.close();
    };
  }, [queryClient]);

  return (
    <Box>
      <VStack spacing={6} align="stretch">
        {/* Header */}
        <Flex align="center" justify="space-between">
          <Box>
            <Heading size="lg">Gestión de Multimedia</Heading>
            <Text color="gray.600" mt={1}>
              Administra archivos multimedia del sistema
            </Text>
          </Box>
          <Button
            leftIcon={<FaUpload />}
            colorScheme="blue"
            onClick={onUploadOpen}
          >
            Subir Archivos
          </Button>
        </Flex>

        {/* Estadísticas */}
        <SimpleGrid columns={{ base: 1, md: 2, lg: 5 }} spacing={6}>
          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardBody>
              <Stat>
                <StatLabel>
                  <HStack>
                    <Icon as={FaImages} color="blue.500" />
                    <Text>Total Archivos</Text>
                  </HStack>
                </StatLabel>
                <StatNumber>{multimediaStats?.totalFiles || 0}</StatNumber>
                <StatHelpText>Archivos en el sistema</StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardBody>
              <Stat>
                <StatLabel>
                  <HStack>
                    <Icon as={FaVideo} color="purple.500" />
                    <Text>Videos</Text>
                  </HStack>
                </StatLabel>
                <StatNumber>{multimediaStats?.videos || 0}</StatNumber>
                <StatHelpText>Archivos de video</StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardBody>
              <Stat>
                <StatLabel>
                  <HStack>
                    <Icon as={FaImage} color="green.500" />
                    <Text>Imágenes</Text>
                  </HStack>
                </StatLabel>
                <StatNumber>{multimediaStats?.images || 0}</StatNumber>
                <StatHelpText>Archivos de imagen</StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardBody>
              <Stat>
                <StatLabel>
                  <HStack>
                    <Icon as={FaMicrophone} color="orange.500" />
                    <Text>Audio</Text>
                  </HStack>
                </StatLabel>
                <StatNumber>{multimediaStats?.audio || 0}</StatNumber>
                <StatHelpText>Archivos de audio</StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardBody>
              <Stat>
                <StatLabel>
                  <HStack>
                    <Icon as={FaFileAlt} color="teal.500" />
                    <Text>Documentos</Text>
                  </HStack>
                </StatLabel>
                <StatNumber>{multimediaStats?.documents || 0}</StatNumber>
                <StatHelpText>Archivos de documentos</StatHelpText>
              </Stat>
            </CardBody>
          </Card>
        </SimpleGrid>

        {/* Filtros */}
        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardBody>
            <HStack spacing={4} wrap="wrap">
              <Input
                placeholder="Buscar archivos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                maxW="300px"
              />
              <Select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                maxW="200px"
              >
                <option value="all">Todos los tipos</option>
                <option value="image">Imágenes</option>
                <option value="video">Videos</option>
                <option value="audio">Audio</option>
                <option value="document">Documentos</option>
              </Select>
            </HStack>
          </CardBody>
        </Card>

        {/* Galería de Multimedia (acepta drag & drop global) */}
        <Wrap
          spacing={4}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const files = Array.from(e.dataTransfer.files || []);
            if (!files.length) return;
            try {
              setUploading(true);
              let done = 0;
              for (const f of files) {
                await apiService.uploadMultimedia(f as File);
                done += 1;
                setUploadCount(done);
              }
              toast({ title: 'Archivos subidos', description: `${done} archivo(s) subidos`, status: 'success' });
              queryClient.invalidateQueries('multimedia');
              queryClient.invalidateQueries('multimediaStats');
            } catch (err: any) {
              toast({ title: 'Error al subir', description: err?.response?.data?.error || err?.message, status: 'error' });
            } finally {
              setUploading(false);
              setUploadCount(0);
            }
          }}
        >
          {items.length === 0 && (
            <WrapItem>
              <Alert status="info" variant="subtle">
                <AlertIcon />
                No se encontraron archivos multimedia.
              </Alert>
            </WrapItem>
          )}
          {items.map((item: MultimediaItem) => (
            <WrapItem key={item.id}>
              <Card
                bg={cardBg}
                border="1px"
                borderColor={borderColor}
                maxW="300px"
                cursor="pointer"
                _hover={{ transform: 'translateY(-2px)', shadow: 'lg' }}
                transition="all 0.2s"
              >
                <CardBody p={0}>
                  <AspectRatio ratio={16 / 9}>
                    {item.type === 'image' ? (
                      <Image
                        src={item.thumbnail || item.url}
                        alt={item.name}
                        objectFit="cover"
                        onClick={() => handleViewItem(item)}
                      />
                    ) : (
                      <Box
                        bg={`${getTypeColor(item.type)}.100`}
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        onClick={() => handleViewItem(item)}
                      >
                        <Icon
                          as={getTypeIcon(item.type)}
                          size="3xl"
                          color={`${getTypeColor(item.type)}.500`}
                        />
                      </Box>
                    )}
                  </AspectRatio>
                  <Box p={4}>
                    <VStack align="start" spacing={2}>
                      <HStack justify="space-between" w="full">
                        <Text fontWeight="semibold" noOfLines={1}>
                          {item.name}
                        </Text>
                        <Badge colorScheme={getTypeColor(item.type)} size="sm">
                          {item.format.toUpperCase()}
                        </Badge>
                      </HStack>
                      <Text fontSize="sm" color="gray.500" noOfLines={2}>
                        {item.description}
                      </Text>
                      <HStack justify="space-between" w="full">
                        <Text fontSize="xs" color="gray.400">
                          {formatFileSize(item.size)}
                        </Text>
                        <Text fontSize="xs" color="gray.400">
                          {item.views} vistas
                        </Text>
                      </HStack>
                      <HStack spacing={1} wrap="wrap">
                        {item.tags.slice(0, 2).map((tag, index) => (
                          <Badge key={index} colorScheme="blue" variant="subtle" fontSize="xs">
                            {tag}
                          </Badge>
                        ))}
                        {item.tags.length > 2 && (
                          <Badge colorScheme="gray" variant="subtle" fontSize="xs">
                            +{item.tags.length - 2}
                          </Badge>
                        )}
                      </HStack>
                      <HStack justify="space-between" w="full">
                        <Text fontSize="xs" color="gray.500">
                          {item.uploadedBy}
                        </Text>
                        <Text fontSize="xs" color="gray.500">
                          {new Date(item.uploadedAt).toLocaleDateString()}
                        </Text>
                      </HStack>
                      <HStack justify="space-between" w="full">
                        <HStack spacing={2}>
                          <Tooltip label="Ver detalles">
                            <IconButton
                              aria-label="Ver archivo"
                              icon={<FaEye />}
                              size="sm"
                              variant="ghost"
                              onClick={() => handleViewItem(item)}
                            />
                          </Tooltip>
                          <Tooltip label="Descargar">
                            <IconButton
                              aria-label="Descargar archivo"
                              icon={<FaDownload />}
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDownload(item)}
                            />
                          </Tooltip>
                        </HStack>
                        <Menu>
                          <MenuButton
                            as={IconButton}
                            aria-label="Más opciones"
                            icon={<FaEllipsisV />}
                            size="sm"
                            variant="ghost"
                          />
                          <MenuList>
                            <MenuItem
                              icon={<FaTrash />}
                              color="red.500"
                              onClick={() => handleDeleteItem(item.id)}
                            >
                              Eliminar
                            </MenuItem>
                          </MenuList>
                        </Menu>
                      </HStack>
                    </VStack>
                  </Box>
                </CardBody>
              </Card>
            </WrapItem>
          ))}
        </Wrap>

        {pagination && pagination.totalPages > 1 && (
          <Flex justify="center" mt={6}>
            <HStack spacing={2}>
              <Button
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                isDisabled={currentPage === 1}
              >
                Anterior
              </Button>
              <Text>
                Página {pagination.page} de {pagination.totalPages}
              </Text>
              <Button
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, pagination.totalPages))}
                isDisabled={currentPage === pagination.totalPages}
              >
                Siguiente
              </Button>
            </HStack>
          </Flex>
        )}
      </VStack>

      {/* Modal Subir Archivos */}
      <Modal isOpen={isUploadOpen} onClose={onUploadClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Subir Archivos Multimedia</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={6}>
              <Box
                border="2px dashed"
                borderColor="gray.300"
                borderRadius="lg"
                p={8}
                textAlign="center"
                w="full"
                _hover={{ borderColor: 'blue.500' }}
                transition="all 0.2s"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const files = Array.from(e.dataTransfer.files || []);
                  if (!files.length) return;
                  try {
                    setUploading(true);
                    let done = 0;
                    for (const f of files) {
                      await apiService.uploadMultimedia(f as File);
                      done += 1;
                      setUploadCount(done);
                    }
                    toast({ title: 'Archivos subidos', description: `${done} archivo(s) subidos`, status: 'success' });
                    queryClient.invalidateQueries('multimedia');
                    queryClient.invalidateQueries('multimediaStats');
                    onUploadClose();
                  } catch (err: any) {
                    toast({ title: 'Error al subir', description: err?.response?.data?.error || err?.message, status: 'error' });
                  } finally {
                    setUploading(false);
                    setUploadCount(0);
                  }
                }}
              >
                <Icon as={FaUpload} boxSize="4xl" color="gray.400" mb={4} />
                <Text fontSize="lg" fontWeight="semibold" mb={2}>
                  Arrastra archivos aquí o haz clic para seleccionar
                </Text>
                <Text fontSize="sm" color="gray.500" mb={4}>
                  Soporta imágenes, videos, audio y documentos
                </Text>
                <Input
                  type="file"
                  multiple
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
                  display="none"
                  id="file-upload"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    if (!files.length) return;
                    try {
                      setUploading(true);
                      let done = 0;
                      for (const f of files) {
                        await apiService.uploadMultimedia(f as File);
                        done += 1;
                        setUploadCount(done);
                      }
                      toast({ title: 'Archivos subidos', description: `${done} archivo(s) subidos`, status: 'success' });
                      queryClient.invalidateQueries('multimedia');
                      queryClient.invalidateQueries('multimediaStats');
                      onUploadClose();
                    } catch (err: any) {
                      toast({ title: 'Error al subir', description: err?.response?.data?.error || err?.message, status: 'error' });
                    } finally {
                      setUploading(false);
                      setUploadCount(0);
                    }
                  }}
                />
                <Button
                  as="label"
                  htmlFor="file-upload"
                  colorScheme="blue"
                  cursor="pointer"
                  isLoading={uploading}
                >
                  Seleccionar Archivos
                </Button>
                {uploading && (
                  <Text mt={3} color="gray.500">Subiendo... {uploadCount}</Text>
                )}
              </Box>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onUploadClose}>
              Cancelar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal Ver Detalles */}
      <Modal isOpen={isViewOpen} onClose={onViewClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Detalles del Archivo</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedItem && (
              <VStack spacing={4} align="stretch">
                <HStack>
                  <Icon
                    as={getTypeIcon(selectedItem.type)}
                    color={`${getTypeColor(selectedItem.type)}.500`}
                    size="lg"
                  />
                  <VStack align="start" spacing={1}>
                    <Heading size="md">{selectedItem.name}</Heading>
                    <Badge colorScheme={getTypeColor(selectedItem.type)}>
                      {selectedItem.format.toUpperCase()}
                    </Badge>
                  </VStack>
                </HStack>

                <Text>{selectedItem.description}</Text>

                <SimpleGrid columns={2} spacing={4}>
                  <Stat>
                    <StatLabel>Tamaño</StatLabel>
                    <StatNumber>{formatFileSize(selectedItem.size)}</StatNumber>
                  </Stat>
                  <Stat>
                    <StatLabel>Descargas</StatLabel>
                    <StatNumber>{selectedItem.downloads}</StatNumber>
                  </Stat>
                  <Stat>
                    <StatLabel>Vistas</StatLabel>
                    <StatNumber>{selectedItem.views}</StatNumber>
                  </Stat>
                  <Stat>
                    <StatLabel>Categoría</StatLabel>
                    <StatNumber>{selectedItem.category}</StatNumber>
                  </Stat>
                </SimpleGrid>

                <Text fontSize="sm" color="gray.500">
                  Subido por: {selectedItem.uploadedBy}
                </Text>
                <Text fontSize="sm" color="gray.500">
                  Fecha: {new Date(selectedItem.uploadedAt).toLocaleDateString()}
                </Text>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onViewClose}>
              Cerrar
            </Button>
            <Button
              colorScheme="blue"
              onClick={() => selectedItem && handleDownload(selectedItem)}
            >
              Descargar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default Multimedia;
