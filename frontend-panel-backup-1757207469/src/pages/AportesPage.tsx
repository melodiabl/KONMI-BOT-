import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Textarea,
  VStack,
  HStack,
  IconButton,
  useToast,
  Select,
  Text,
  Input,
} from '@chakra-ui/react';
import { AddIcon, DeleteIcon } from '@chakra-ui/icons';
import api, { aportesService } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface Aporte {
  id: number;
  contenido: string;
  tipo: string;
  usuario: string;
  grupo: string;
  fecha: string;
  manhwa_titulo?: string;
  archivo_path?: string;
  estado?: string;
  procesado_por?: string;
  fecha_procesado?: string;
}

interface Grupo {
  jid: string;
  nombre: string;
}

const AportesPage: React.FC = () => {
  const [aportes, setAportes] = useState<Aporte[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [formData, setFormData] = useState({
    contenido: '',
    tipo: 'texto',
    grupo: '',
    manhwa_titulo: '',
    archivo_path: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchAportes();
    fetchGrupos();
  }, []);

  const fetchAportes = async () => {
    try {
      const response = await api.get('/aportes');
      setAportes(response.data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los aportes',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const fetchGrupos = async () => {
    try {
      const response = await api.get('/grupos');
      setGrupos(response.data);
    } catch (error) {
      console.error('Error fetching grupos:', error);
    }
  };

  const handleSubmit = async () => {
    try {
      let archivo_path = formData.archivo_path;
      if (formData.tipo === 'documento' && file) {
        const uploadRes = await aportesService.upload(file);
        archivo_path = uploadRes.archivo_path;
      }
      await api.post('/aportes', { ...formData, archivo_path });
      toast({
        title: 'Éxito',
        description: 'Aporte creado correctamente',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      fetchAportes();
      handleClose();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo crear el aporte',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar este aporte?')) {
      try {
        await api.delete(`/aportes/${id}`);
        toast({
          title: 'Éxito',
          description: 'Aporte eliminado correctamente',
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
        fetchAportes();
      } catch (error) {
        toast({
          title: 'Error',
          description: 'No se pudo eliminar el aporte',
          status: 'error',
          duration: 3000,
          isClosable: true,
        });
      }
    }
  };

  const handleClose = () => {
    setFormData({
      contenido: '',
      tipo: 'texto',
      grupo: '',
      manhwa_titulo: '',
      archivo_path: '',
    });
    setFile(null);
    onClose();
  };

  const getTipoBadge = (tipo: string) => {
    const color = tipo === 'imagen' ? 'purple' : tipo === 'video' ? 'orange' : 'blue';
    return <Badge colorScheme={color}>{tipo.toUpperCase()}</Badge>;
  };

  return (
    <Box p={6}>
      <HStack justify="space-between" mb={6}>
        <Text fontSize="2xl" fontWeight="bold">Aportes</Text>
        <Button leftIcon={<AddIcon />} colorScheme="purple" onClick={onOpen}>
          Nuevo Aporte
        </Button>
      </HStack>

      <Table variant="simple">
        <Thead>
          <Tr>
            <Th>Contenido</Th>
            <Th>Tipo</Th>
            <Th>Manhwa</Th>
            <Th>Archivo</Th>
            <Th>Usuario</Th>
            <Th>Grupo</Th>
            <Th>Fecha</Th>
            <Th>Estado</Th>
            <Th>Acciones</Th>
          </Tr>
        </Thead>
        <Tbody>
          {aportes.map((aporte) => (
            <Tr key={aporte.id}>
              <Td maxW="300px" isTruncated>{aporte.contenido}</Td>
              <Td>{getTipoBadge(aporte.tipo)}</Td>
              <Td>{aporte.manhwa_titulo || '-'}</Td>
              <Td>{aporte.archivo_path ? <a href={aporte.archivo_path} target="_blank" rel="noreferrer">Descargar</a> : '-'}</Td>
              <Td>{aporte.usuario}</Td>
              <Td>{aporte.grupo}</Td>
              <Td>{new Date(aporte.fecha).toLocaleDateString()}</Td>
              <Td>
                {aporte.estado ? <Badge colorScheme={aporte.estado === 'completado' ? 'green' : aporte.estado === 'en_revision' ? 'yellow' : 'gray'}>{aporte.estado}</Badge> : '-'}
              </Td>
              <Td>
                <HStack spacing={2}>
                  {(user?.rol === 'admin' || user?.rol === 'owner' || user?.rol === 'colaborador') && (
                    <>
                      <Button size="xs" onClick={async () => { await aportesService.updateStatus(aporte.id, 'pendiente'); fetchAportes(); }}>Pendiente</Button>
                      <Button size="xs" colorScheme="yellow" onClick={async () => { await aportesService.updateStatus(aporte.id, 'en_revision'); fetchAportes(); }}>En revisión</Button>
                      <Button size="xs" colorScheme="green" onClick={async () => { await aportesService.updateStatus(aporte.id, 'completado'); fetchAportes(); }}>Completado</Button>
                    </>
                  )}
                  <IconButton aria-label="Eliminar" icon={<DeleteIcon />} size="sm" colorScheme="red" onClick={() => handleDelete(aporte.id)} />
                </HStack>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>

      <Modal isOpen={isOpen} onClose={handleClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Nuevo Aporte</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <FormControl isRequired>
                <FormLabel>Contenido</FormLabel>
                <Textarea value={formData.contenido} onChange={(e) => setFormData({ ...formData, contenido: e.target.value })} placeholder="Describe tu aporte..." rows={4} />
              </FormControl>

              <FormControl isRequired>
                <FormLabel>Tipo</FormLabel>
                <Select value={formData.tipo} onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}>
                  <option value="texto">Texto</option>
                  <option value="documento">Documento (PDF)</option>
                  <option value="imagen">Imagen</option>
                  <option value="video">Video</option>
                  <option value="enlace">Enlace</option>
                </Select>
              </FormControl>

              <FormControl isRequired={formData.tipo === 'documento'}>
                <FormLabel>Título del Manhwa</FormLabel>
                <Textarea value={formData.manhwa_titulo} onChange={(e) => setFormData({ ...formData, manhwa_titulo: e.target.value })} placeholder="Ej: Jinx, Painter of the Night..." rows={2} />
              </FormControl>

              {formData.tipo === 'documento' ? (
                <FormControl isRequired>
                  <FormLabel>Archivo (subir o pegar URL)</FormLabel>
                  <VStack align="stretch" spacing={2}>
                    <Input type="file" accept=".pdf,image/*,video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                    <Textarea value={formData.archivo_path} onChange={(e) => setFormData({ ...formData, archivo_path: e.target.value })} placeholder="Opcional: https://.../archivo.pdf" rows={2} />
                  </VStack>
                </FormControl>
              ) : null}

              <FormControl>
                <FormLabel>Grupo (Opcional)</FormLabel>
                <Select value={formData.grupo} onChange={(e) => setFormData({ ...formData, grupo: e.target.value })} placeholder="Seleccionar grupo">
                  {grupos.map((grupo) => (
                    <option key={grupo.jid} value={grupo.nombre}>{grupo.nombre}</option>
                  ))}
                </Select>
              </FormControl>
            </VStack>
          </ModalBody>

          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={handleClose}>
              Cancelar
            </Button>
            <Button colorScheme="purple" onClick={handleSubmit}>
              Crear Aporte
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default AportesPage;
