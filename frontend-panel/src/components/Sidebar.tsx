import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Icon,
  useColorMode,
  Flex,
  Divider,
  Badge,
} from '@chakra-ui/react';
import {
  PhoneIcon,
  ViewIcon,
  ChatIcon,
  StarIcon,
  TimeIcon,
  SettingsIcon,
  BellIcon,
} from '@chakra-ui/icons';
import { Link, useLocation } from 'react-router-dom';

interface NavItem {
  label: string;
  icon: any;
  path: string;
  color: string;
  badge?: string;
  badgeColor?: string;
}

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    icon: PhoneIcon,
    path: '/',
    color: 'blue',
  },
  {
    label: 'Usuarios',
    icon: ViewIcon,
    path: '/usuarios',
    color: 'green',
    badge: '3',
    badgeColor: 'green',
  },
  {
    label: 'Subbots',
    icon: SettingsIcon,
    path: '/subbots',
    color: 'blue',
    badge: '5',
    badgeColor: 'blue',
  },
  {
    label: 'Grupos',
    icon: ChatIcon,
    path: '/grupos',
    color: 'purple',
    badge: '12',
    badgeColor: 'purple',
  },
  {
    label: 'Gestión Grupos',
    icon: SettingsIcon,
    path: '/grupos-management',
    color: 'orange',
  },
  {
    label: 'Bot',
    icon: SettingsIcon,
    path: '/bot',
    color: 'orange',
  },
  {
    label: 'Aportes',
    icon: StarIcon,
    path: '/aportes',
    color: 'yellow',
    badge: '5',
    badgeColor: 'yellow',
  },
  {
    label: 'Pedidos',
    icon: ViewIcon,
    path: '/pedidos',
    color: 'teal',
    badge: '2',
    badgeColor: 'teal',
  },
  {
    label: 'Proveedores',
    icon: ChatIcon,
    path: '/proveedores',
    color: 'pink',
  },
  {
    label: 'Analytics',
    icon: ChatIcon,
    path: '/analytics',
    color: 'cyan',
  },
  {
    label: 'Logs',
    icon: TimeIcon,
    path: '/logs',
    color: 'gray',
  },
  {
    label: 'Notificaciones',
    icon: BellIcon,
    path: '/notificaciones',
    color: 'gray',
  },
  {
    label: 'AI Chat',
    icon: ChatIcon,
    path: '/ai-chat',
    color: 'purple',
  },
  {
    label: 'Bot Commands',
    icon: SettingsIcon,
    path: '/bot-commands',
    color: 'orange',
  },
  {
    label: 'Multimedia',
    icon: ViewIcon,
    path: '/multimedia',
    color: 'blue',
  },

];

export const Sidebar: React.FC = () => {
  const { colorMode } = useColorMode();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <Box
      bg={colorMode === 'dark' ? 'gray.800' : 'white'}
      borderRight="1px"
      borderColor={colorMode === 'dark' ? 'gray.700' : 'gray.200'}
      w="280px"
      h="100vh"
      position="fixed"
      left={0}
      top={0}
      pt="80px"
      overflowY="auto"
      boxShadow="lg"
    >
      <VStack spacing={2} align="stretch" p={4}>
        {navItems.map((item) => (
          <Link key={item.path} to={item.path}>
            <Box
              p={3}
              borderRadius="lg"
              cursor="pointer"
              transition="all 0.2s"
              bg={isActive(item.path)
                ? `${item.color}.100`
                : 'transparent'
              }
              color={isActive(item.path)
                ? `${item.color}.700`
                : colorMode === 'dark' ? 'gray.300' : 'gray.600'
              }
              _hover={{
                bg: isActive(item.path)
                  ? `${item.color}.200`
                  : colorMode === 'dark' ? 'gray.700' : 'gray.100',
                transform: 'translateX(4px)',
              }}
              borderLeft={isActive(item.path)
                ? `4px solid`
                : '4px solid transparent'
              }
              borderLeftColor={isActive(item.path) ? `${item.color}.500` : 'transparent'}
            >
              <HStack justify="space-between">
                <HStack spacing={3}>
                  <Icon
                    as={item.icon}
                    boxSize={5}
                    color={isActive(item.path) ? `${item.color}.600` : 'inherit'}
                  />
                  <Text fontWeight={isActive(item.path) ? 'semibold' : 'medium'}>
                    {item.label}
                  </Text>
                </HStack>
                {item.badge && (
                  <Badge
                    colorScheme={item.badgeColor || item.color}
                    size="sm"
                    variant="solid"
                    borderRadius="full"
                    px={2}
                  >
                    {item.badge}
                  </Badge>
                )}
              </HStack>
            </Box>
          </Link>
        ))}
      </VStack>

      {/* Información del sistema */}
      <Box p={4} mt="auto">
        <Divider mb={4} />
        <VStack spacing={2} align="stretch">
          <HStack justify="space-between">
            <Text fontSize="sm" color="gray.500">
              Estado del Sistema
            </Text>
            <Badge colorScheme="green" size="sm">
              Activo
            </Badge>
          </HStack>
          <HStack justify="space-between">
            <Text fontSize="sm" color="gray.500">
              Versión
            </Text>
            <Text fontSize="sm" fontWeight="medium">
              v1.0.0
            </Text>
          </HStack>
        </VStack>
      </Box>
    </Box>
  );
};
