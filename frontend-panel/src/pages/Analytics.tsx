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
  StatArrow,
  Progress,
  Badge,
  Icon,
  useColorModeValue,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Divider,
  Grid,
  GridItem,
} from '@chakra-ui/react';
import {
  FaChartLine,
  FaUsers,
  FaWhatsapp,
  FaFileAlt,
  FaClock,
  FaDownload,
  FaCalendar,
  FaArrowUp,
  FaArrowDown,
  FaExclamationTriangle,
  FaCheckCircle,
  FaEye,
  FaServer,
  FaDatabase,
  FaNetworkWired,
  FaMobile,
  FaDesktop,
} from 'react-icons/fa';
import { useQuery } from 'react-query';
import { apiService, getUsuarioStats, getGroupStats, getAporteStats, getPedidoStats, getStats } from '../services/api';

interface AnalyticsData {
  overview: {
    totalUsers: number;
    totalGroups: number;
    totalAportes: number;
    totalPedidos: number;
    activeUsers: number;
    botUptime: string;
  };
  trends: {
    usersGrowth: number;
    groupsGrowth: number;
    aportesGrowth: number;
    pedidosGrowth: number;
  };
  engagement: {
    dailyActiveUsers: number;
    weeklyActiveUsers: number;
    monthlyActiveUsers: number;
    averageSessionTime: string;
    bounceRate: number;
  };
  performance: {
    responseTime: number;
    uptime: number;
    errorRate: number;
    throughput: number;
  };
  topContent: Array<{
    id: number;
    title: string;
    views: number;
    likes: number;
    shares: number;
    type: string;
  }>;
  userActivity: Array<{
    date: string;
    users: number;
    sessions: number;
    pageViews: number;
  }>;
}

export const Analytics: React.FC = () => {
  const [timeRange, setTimeRange] = useState('7d');
  const [activeTab, setActiveTab] = useState(0);

  const toast = useToast();
  const cardBg = useColorModeValue('white', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Queries
  const { data: analyticsData, isLoading, error } = useQuery(
    ['analytics', timeRange],
    () => apiService.getAnalytics(timeRange)
  );

  const { data: userStats } = useQuery('userStats', getUsuarioStats);
  const { data: groupStats } = useQuery('groupStats', getGroupStats);
  const { data: aporteStats } = useQuery('aporteStats', getAporteStats);
  const { data: pedidoStats } = useQuery('pedidoStats', getPedidoStats);


  const getGrowthColor = (growth: number) => {
    if (growth > 0) return 'green';
    if (growth < 0) return 'red';
    return 'gray';
  };

  const getGrowthIcon = (growth: number) => {
    if (growth > 0) return FaArrowUp;
    if (growth < 0) return FaArrowDown;
    return FaClock;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatPercentage = (num: number) => {
    return `${num.toFixed(1)}%`;
  };

  if (error) {
    return (
      <Alert status="error">
        <AlertIcon />
        Error al cargar analíticas: {(error as any).message}
      </Alert>
    );
  }

  return (
    <Box>
      <VStack spacing={6} align="stretch">
        {/* Header */}
        <Flex align="center" justify="space-between">
          <Box>
            <Heading size="lg">Analíticas del Sistema</Heading>
            <Text color="gray.600" mt={1}>
              Métricas y estadísticas detalladas del sistema
            </Text>
          </Box>
          <HStack spacing={3}>
            <Select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              maxW="200px"
            >
              <option value="1d">Último día</option>
              <option value="7d">Últimos 7 días</option>
              <option value="30d">Últimos 30 días</option>
              <option value="90d">Últimos 90 días</option>
            </Select>
            <Button
              leftIcon={<FaDownload />}
              colorScheme="blue"
              variant="outline"
            >
              Exportar
            </Button>
          </HStack>
        </Flex>

        {/* Métricas Principales */}
        <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={6}>
          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardBody>
              <Stat>
                <StatLabel>
                  <HStack>
                    <Icon as={FaUsers} color="blue.500" />
                    <Text>Usuarios Totales</Text>
                  </HStack>
                </StatLabel>
                <StatNumber>{formatNumber(userStats?.totalUsuarios || 0)}</StatNumber>
                <StatHelpText>
                  <StatArrow type="increase" />
                  {analyticsData?.trends?.usersGrowth || 0}% vs período anterior
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardBody>
              <Stat>
                <StatLabel>
                  <HStack>
                    <Icon as={FaWhatsapp} color="green.500" />
                    <Text>Grupos Activos</Text>
                  </HStack>
                </StatLabel>
                <StatNumber>{formatNumber(groupStats?.totalGrupos || 0)}</StatNumber>
                <StatHelpText>
                  <StatArrow type="increase" />
                  {analyticsData?.trends?.groupsGrowth || 0}% vs período anterior
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardBody>
              <Stat>
                <StatLabel>
                  <HStack>
                    <Icon as={FaFileAlt} color="purple.500" />
                    <Text>Aportes</Text>
                  </HStack>
                </StatLabel>
                <StatNumber>{formatNumber(aporteStats?.totalAportes || 0)}</StatNumber>
                <StatHelpText>
                  <StatArrow type="increase" />
                  {analyticsData?.trends?.aportesGrowth || 0}% vs período anterior
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>

          <Card bg={cardBg} border="1px" borderColor={borderColor}>
            <CardBody>
              <Stat>
                <StatLabel>
                  <HStack>
                    <Icon as={FaClock} color="orange.500" />
                    <Text>Pedidos</Text>
                  </HStack>
                </StatLabel>
                <StatNumber>{formatNumber(pedidoStats?.totalPedidos || 0)}</StatNumber>
                <StatHelpText>
                  <StatArrow type="increase" />
                  {analyticsData?.trends?.pedidosGrowth || 0}% vs período anterior
                </StatHelpText>
              </Stat>
            </CardBody>
          </Card>
        </SimpleGrid>

        {/* Tabs de Análisis Detallado */}
        <Card bg={cardBg} border="1px" borderColor={borderColor}>
          <CardBody>
            <Tabs index={activeTab} onChange={setActiveTab}>
              <TabList>
                <Tab>
                  <HStack>
                    <Icon as={FaChartLine} />
                    <Text>Resumen</Text>
                  </HStack>
                </Tab>
                <Tab>
                  <HStack>
                    <Icon as={FaUsers} />
                    <Text>Usuarios</Text>
                  </HStack>
                </Tab>
                <Tab>
                  <HStack>
                    <Icon as={FaFileAlt} />
                    <Text>Contenido</Text>
                  </HStack>
                </Tab>
                <Tab>
                  <HStack>
                    <Icon as={FaServer} />
                    <Text>Rendimiento</Text>
                  </HStack>
                </Tab>
              </TabList>

              <TabPanels>
                {/* Resumen General */}
                <TabPanel>
                  <VStack spacing={6} align="stretch">
                    <Heading size="md">Resumen General</Heading>
                    
                    <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
                      {/* Engagement */}
                      <Card bg={cardBg} border="1px" borderColor={borderColor}>
                        <CardHeader>
                          <Heading size="sm">Engagement</Heading>
                        </CardHeader>
                        <CardBody>
                          <VStack spacing={4} align="stretch">
                            <HStack justify="space-between">
                              <Text fontSize="sm">Usuarios Activos Diarios</Text>
                              <Text fontWeight="semibold">
                                {formatNumber(analyticsData?.engagement?.dailyActiveUsers || 0)}
                              </Text>
                            </HStack>
                            <Progress 
                              value={(analyticsData?.engagement?.dailyActiveUsers || 0) / (userStats?.totalUsuarios || 1) * 100} 
                              colorScheme="blue" 
                            />
                            
                            <HStack justify="space-between">
                              <Text fontSize="sm">Usuarios Activos Semanales</Text>
                              <Text fontWeight="semibold">
                                {formatNumber(analyticsData?.engagement?.weeklyActiveUsers || 0)}
                              </Text>
                            </HStack>
                            <Progress 
                              value={(analyticsData?.engagement?.weeklyActiveUsers || 0) / (userStats?.totalUsuarios || 1) * 100} 
                              colorScheme="green" 
                            />
                            
                            <HStack justify="space-between">
                              <Text fontSize="sm">Usuarios Activos Mensuales</Text>
                              <Text fontWeight="semibold">
                                {formatNumber(analyticsData?.engagement?.monthlyActiveUsers || 0)}
                              </Text>
                            </HStack>
                            <Progress 
                              value={(analyticsData?.engagement?.monthlyActiveUsers || 0) / (userStats?.totalUsuarios || 1) * 100} 
                              colorScheme="purple" 
                            />
                          </VStack>
                        </CardBody>
                      </Card>

                      {/* Tendencias */}
                      <Card bg={cardBg} border="1px" borderColor={borderColor}>
                        <CardHeader>
                          <Heading size="sm">Tendencias</Heading>
                        </CardHeader>
                        <CardBody>
                          <VStack spacing={4} align="stretch">
                            {analyticsData?.trends && Object.entries(analyticsData.trends).map(([key, value]) => (
                              <HStack key={key} justify="space-between">
                                <Text fontSize="sm" textTransform="capitalize">
                                  {key.replace('Growth', '')}
                                </Text>
                                <HStack>
                                  <Icon 
                                    as={getGrowthIcon(value as number)} 
                                    color={`${getGrowthColor(value as number)}.500`} 
                                  />
                                  <Text 
                                    fontWeight="semibold" 
                                    color={`${getGrowthColor(value as number)}.500`}
                                  >
                                    {(value as number) > 0 ? '+' : ''}{(value as number)}%
                                  </Text>
                                </HStack>
                              </HStack>
                            ))}
                          </VStack>
                        </CardBody>
                      </Card>
                    </SimpleGrid>

                    {/* Top Content */}
                    <Card bg={cardBg} border="1px" borderColor={borderColor}>
                      <CardHeader>
                        <Heading size="sm">Contenido Más Popular</Heading>
                      </CardHeader>
                      <CardBody>
                        <Table variant="simple" size="sm">
                          <Thead>
                            <Tr>
                              <Th>Título</Th>
                              <Th>Tipo</Th>
                              <Th>Vistas</Th>
                              <Th>Me gusta</Th>
                              <Th>Compartidos</Th>
                            </Tr>
                          </Thead>
                          <Tbody>
                            {analyticsData?.topContent?.slice(0, 5).map((content) => (
                              <Tr key={content.id}>
                                <Td>
                                  <Text fontWeight="medium">{content.title}</Text>
                                </Td>
                                <Td>
                                  <Badge colorScheme="blue" variant="subtle">
                                    {content.type}
                                  </Badge>
                                </Td>
                                <Td>{formatNumber(content.views)}</Td>
                                <Td>{formatNumber(content.likes)}</Td>
                                <Td>{formatNumber(content.shares)}</Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                      </CardBody>
                    </Card>
                  </VStack>
                </TabPanel>

                {/* Análisis de Usuarios */}
                <TabPanel>
                  <VStack spacing={6} align="stretch">
                    <Heading size="md">Análisis de Usuarios</Heading>
                    
                    <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
                      <Card bg={cardBg} border="1px" borderColor={borderColor}>
                        <CardHeader>
                          <Heading size="sm">Distribución por Rol</Heading>
                        </CardHeader>
                        <CardBody>
                          <VStack spacing={4} align="stretch">
                            <HStack justify="space-between">
                              <HStack>
                                <Badge colorScheme="red">Admin</Badge>
                                <Text fontSize="sm">Administradores</Text>
                              </HStack>
                              <Text fontWeight="semibold">{userStats?.totalAdmins || 0}</Text>
                            </HStack>
                            <Progress value={(userStats?.totalAdmins || 0) / (userStats?.totalUsuarios || 1) * 100} colorScheme="red" />
                            
                            <HStack justify="space-between">
                              <HStack>
                                <Badge colorScheme="blue">Creador</Badge>
                                <Text fontSize="sm">Creadores</Text>
                              </HStack>
                              <Text fontWeight="semibold">{userStats?.totalCreadores || 0}</Text>
                            </HStack>
                            <Progress value={(userStats?.totalCreadores || 0) / (userStats?.totalUsuarios || 1) * 100} colorScheme="blue" />
                            
                            <HStack justify="space-between">
                              <HStack>
                                <Badge colorScheme="green">Moderador</Badge>
                                <Text fontSize="sm">Moderadores</Text>
                              </HStack>
                              <Text fontWeight="semibold">{userStats?.totalModeradores || 0}</Text>
                            </HStack>
                            <Progress value={(userStats?.totalModeradores || 0) / (userStats?.totalUsuarios || 1) * 100} colorScheme="green" />
                            
                            <HStack justify="space-between">
                              <HStack>
                                <Badge colorScheme="gray">Usuario</Badge>
                                <Text fontSize="sm">Usuarios</Text>
                              </HStack>
                              <Text fontWeight="semibold">
                                {(userStats?.totalUsuarios || 0) - (userStats?.totalAdmins || 0) - (userStats?.totalCreadores || 0) - (userStats?.totalModeradores || 0)}
                              </Text>
                            </HStack>
                            <Progress 
                              value={((userStats?.totalUsuarios || 0) - (userStats?.totalAdmins || 0) - (userStats?.totalCreadores || 0) - (userStats?.totalModeradores || 0)) / (userStats?.totalUsuarios || 1) * 100} 
                              colorScheme="gray" 
                            />
                          </VStack>
                        </CardBody>
                      </Card>

                      <Card bg={cardBg} border="1px" borderColor={borderColor}>
                        <CardHeader>
                          <Heading size="sm">Actividad de Usuarios</Heading>
                        </CardHeader>
                        <CardBody>
                          <VStack spacing={4} align="stretch">
                            <HStack justify="space-between">
                              <Text fontSize="sm">Tiempo Promedio de Sesión</Text>
                              <Text fontWeight="semibold">
                                {analyticsData?.engagement?.averageSessionTime || '0m'}
                              </Text>
                            </HStack>
                            
                            <HStack justify="space-between">
                              <Text fontSize="sm">Tasa de Rebote</Text>
                              <Text fontWeight="semibold">
                                {formatPercentage(analyticsData?.engagement?.bounceRate || 0)}
                              </Text>
                            </HStack>
                            
                            <HStack justify="space-between">
                              <Text fontSize="sm">Usuarios Activos</Text>
                              <Text fontWeight="semibold">
                                {formatNumber(analyticsData?.overview?.activeUsers || 0)}
                              </Text>
                            </HStack>
                          </VStack>
                        </CardBody>
                      </Card>
                    </SimpleGrid>
                  </VStack>
                </TabPanel>

                {/* Análisis de Contenido */}
                <TabPanel>
                  <VStack spacing={6} align="stretch">
                    <Heading size="md">Análisis de Contenido</Heading>
                    
                    <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
                      <Card bg={cardBg} border="1px" borderColor={borderColor}>
                        <CardHeader>
                          <Heading size="sm">Estados de Aportes</Heading>
                        </CardHeader>
                        <CardBody>
                          <VStack spacing={4} align="stretch">
                            <HStack justify="space-between">
                              <HStack>
                                <Badge colorScheme="green">Aprobados</Badge>
                                <Text fontSize="sm">Aportes aprobados</Text>
                              </HStack>
                              <Text fontWeight="semibold">{aporteStats?.aportesAprobados || 0}</Text>
                            </HStack>
                            <Progress value={(aporteStats?.aportesAprobados || 0) / (aporteStats?.totalAportes || 1) * 100} colorScheme="green" />
                            
                            <HStack justify="space-between">
                              <HStack>
                                <Badge colorScheme="yellow">Pendientes</Badge>
                                <Text fontSize="sm">En revisión</Text>
                              </HStack>
                              <Text fontWeight="semibold">{aporteStats?.aportesPendientes || 0}</Text>
                            </HStack>
                            <Progress value={(aporteStats?.aportesPendientes || 0) / (aporteStats?.totalAportes || 1) * 100} colorScheme="yellow" />
                            
                            <HStack justify="space-between">
                              <HStack>
                                <Badge colorScheme="red">Rechazados</Badge>
                                <Text fontSize="sm">Aportes rechazados</Text>
                              </HStack>
                              <Text fontWeight="semibold">{aporteStats?.aportesRechazados || 0}</Text>
                            </HStack>
                            <Progress value={(aporteStats?.aportesRechazados || 0) / (aporteStats?.totalAportes || 1) * 100} colorScheme="red" />
                          </VStack>
                        </CardBody>
                      </Card>

                      <Card bg={cardBg} border="1px" borderColor={borderColor}>
                        <CardHeader>
                          <Heading size="sm">Estados de Pedidos</Heading>
                        </CardHeader>
                        <CardBody>
                          <VStack spacing={4} align="stretch">
                            <HStack justify="space-between">
                              <HStack>
                                <Badge colorScheme="green">Completados</Badge>
                                <Text fontSize="sm">Pedidos finalizados</Text>
                              </HStack>
                              <Text fontWeight="semibold">{pedidoStats?.pedidosCompletados || 0}</Text>
                            </HStack>
                            <Progress value={(pedidoStats?.pedidosCompletados || 0) / (pedidoStats?.totalPedidos || 1) * 100} colorScheme="green" />
                            
                            <HStack justify="space-between">
                              <HStack>
                                <Badge colorScheme="yellow">Pendientes</Badge>
                                <Text fontSize="sm">En espera</Text>
                              </HStack>
                              <Text fontWeight="semibold">{pedidoStats?.pedidosPendientes || 0}</Text>
                            </HStack>
                            <Progress value={(pedidoStats?.pedidosPendientes || 0) / (pedidoStats?.totalPedidos || 1) * 100} colorScheme="yellow" />
                            
                            <HStack justify="space-between">
                              <HStack>
                                <Badge colorScheme="blue">En Proceso</Badge>
                                <Text fontSize="sm">En desarrollo</Text>
                              </HStack>
                              <Text fontWeight="semibold">{pedidoStats?.pedidosEnProceso || 0}</Text>
                            </HStack>
                            <Progress value={(pedidoStats?.pedidosEnProceso || 0) / (pedidoStats?.totalPedidos || 1) * 100} colorScheme="blue" />
                          </VStack>
                        </CardBody>
                      </Card>
                    </SimpleGrid>
                  </VStack>
                </TabPanel>

                {/* Análisis de Rendimiento */}
                <TabPanel>
                  <VStack spacing={6} align="stretch">
                    <Heading size="md">Análisis de Rendimiento</Heading>
                    
                    <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
                      <Card bg={cardBg} border="1px" borderColor={borderColor}>
                        <CardHeader>
                          <Heading size="sm">Métricas del Sistema</Heading>
                        </CardHeader>
                        <CardBody>
                          <VStack spacing={4} align="stretch">
                            <HStack justify="space-between">
                              <Text fontSize="sm">Tiempo de Respuesta</Text>
                              <Text fontWeight="semibold">
                                {analyticsData?.performance?.responseTime || 0}ms
                              </Text>
                            </HStack>
                            <Progress 
                              value={Math.min((analyticsData?.performance?.responseTime || 0) / 1000 * 100, 100)} 
                              colorScheme={analyticsData?.performance?.responseTime < 500 ? 'green' : 'orange'} 
                            />
                            
                            <HStack justify="space-between">
                              <Text fontSize="sm">Uptime</Text>
                              <Text fontWeight="semibold">
                                {formatPercentage(analyticsData?.performance?.uptime || 0)}
                              </Text>
                            </HStack>
                            <Progress value={analyticsData?.performance?.uptime || 0} colorScheme="green" />
                            
                            <HStack justify="space-between">
                              <Text fontSize="sm">Tasa de Error</Text>
                              <Text fontWeight="semibold">
                                {formatPercentage(analyticsData?.performance?.errorRate || 0)}
                              </Text>
                            </HStack>
                            <Progress 
                              value={analyticsData?.performance?.errorRate || 0} 
                              colorScheme={analyticsData?.performance?.errorRate < 5 ? 'green' : 'red'} 
                            />
                          </VStack>
                        </CardBody>
                      </Card>

                      <Card bg={cardBg} border="1px" borderColor={borderColor}>
                        <CardHeader>
                          <Heading size="sm">Throughput</Heading>
                        </CardHeader>
                        <CardBody>
                          <VStack spacing={4} align="stretch">
                            <HStack justify="space-between">
                              <Text fontSize="sm">Requests/min</Text>
                              <Text fontWeight="semibold">
                                {formatNumber(analyticsData?.performance?.throughput || 0)}
                              </Text>
                            </HStack>
                            <Progress 
                              value={Math.min((analyticsData?.performance?.throughput || 0) / 1000 * 100, 100)} 
                              colorScheme="blue" 
                            />
                            
                            <HStack justify="space-between">
                              <Text fontSize="sm">Bot Uptime</Text>
                              <Text fontWeight="semibold">
                                {analyticsData?.overview?.botUptime || '0h 0m'}
                              </Text>
                            </HStack>
                            
                            <HStack justify="space-between">
                              <Text fontSize="sm">Grupos Autorizados</Text>
                              <Text fontWeight="semibold">
                                {groupStats?.gruposAutorizados || 0} / {groupStats?.totalGrupos || 0}
                              </Text>
                            </HStack>
                            <Progress 
                              value={(groupStats?.gruposAutorizados || 0) / (groupStats?.totalGrupos || 1) * 100} 
                              colorScheme="green" 
                            />
                          </VStack>
                        </CardBody>
                      </Card>
                    </SimpleGrid>
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

export default Analytics;



