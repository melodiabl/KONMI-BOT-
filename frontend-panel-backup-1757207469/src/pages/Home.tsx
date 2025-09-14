import React, { useEffect, useState } from 'react';
import { Box, Heading, SimpleGrid, Stat, StatLabel, StatNumber, StatHelpText, StatArrow, Spinner, VStack, useColorModeValue } from '@chakra-ui/react';
import { useQuery } from 'react-query';
import { apiService } from '../services/api';

export const Home: React.FC = () => {
  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Estado del bot
  const { data: botStatus, isLoading: botLoading } = useQuery('botStatus', apiService.getBotStatus);
  // Estadísticas
  const { data: stats, isLoading: statsLoading } = useQuery('dashboardStats', async () => {
    try {
      return await apiService.getStats();
    } catch {
      return { totalGrupos: 0, totalUsuarios: 0, totalAportes: 0 };
    }
  });

  if (botLoading || statsLoading) {
    return <Box textAlign="center" py={10}><Spinner size="xl" /><Heading mt={4}>Cargando panel...</Heading></Box>;
  }

  return (
    <Box>
      <Heading mb={6}>Panel Principal</Heading>
      <VStack spacing={6} align="stretch">
        <Box bg={cardBg} border="1px" borderColor={borderColor} borderRadius="md" p={6}>
          <Heading size="md" mb={4}>Estado del Bot</Heading>
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6}>
            <Stat>
              <StatLabel>Estado</StatLabel>
              <StatNumber color={botStatus?.connected ? 'green.400' : 'red.400'}>
                {botStatus?.connected ? 'Conectado' : 'Desconectado'}
              </StatNumber>
              <StatHelpText>{botStatus?.phone || 'No disponible'}</StatHelpText>
            </Stat>
            <Stat>
              <StatLabel>Uptime</StatLabel>
              <StatNumber>{botStatus?.uptime || '0h 0m'}</StatNumber>
              <StatHelpText>Tiempo activo</StatHelpText>
            </Stat>
            <Stat>
              <StatLabel>Última actividad</StatLabel>
              <StatNumber>{botStatus?.lastSeen ? new Date(botStatus.lastSeen).toLocaleString() : 'N/A'}</StatNumber>
              <StatHelpText>Última vez activo</StatHelpText>
            </Stat>
          </SimpleGrid>
        </Box>
        <Box bg={cardBg} border="1px" borderColor={borderColor} borderRadius="md" p={6}>
          <Heading size="md" mb={4}>Resumen General</Heading>
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6}>
            <Stat>
              <StatLabel>Usuarios</StatLabel>
              <StatNumber>{stats?.totalUsuarios || 0}</StatNumber>
              <StatHelpText>Total registrados</StatHelpText>
            </Stat>
            <Stat>
              <StatLabel>Grupos</StatLabel>
              <StatNumber>{stats?.totalGrupos || 0}</StatNumber>
              <StatHelpText>Total de grupos</StatHelpText>
            </Stat>
            <Stat>
              <StatLabel>Aportes</StatLabel>
              <StatNumber>{stats?.totalAportes || 0}</StatNumber>
              <StatHelpText>Total de aportes</StatHelpText>
            </Stat>
          </SimpleGrid>
        </Box>
      </VStack>
    </Box>
  );
};

export default Home;
