import React, { useState } from 'react';
import {
  Box,
  Flex,
  IconButton,
  useColorModeValue,
  useDisclosure,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  DrawerHeader,
  DrawerBody,
} from '@chakra-ui/react';
import { HamburgerIcon } from '@chakra-ui/icons';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { ErrorBoundary } from './ErrorBoundary';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const bg = useColorModeValue('gray.50', 'gray.900');

  return (
    <Box minH="100vh" bg={bg}>
      {/* Header */}
      <Header onMenuClick={onOpen} />

      {/* Sidebar para desktop */}
      <Box display={{ base: 'none', md: 'block' }}>
        <Sidebar />
      </Box>

      {/* Contenido principal */}
      <Box
        ml={{ base: 0, md: '280px' }}
        pt="80px"
        transition="margin-left 0.3s ease"
      >
        {/* Header móvil */}
        <Flex
          as="header"
          align="center"
          justify="space-between"
          p={4}
          bg={useColorModeValue('white', 'gray.800')}
          borderBottom="1px"
          borderColor={useColorModeValue('gray.200', 'gray.700')}
          display={{ base: 'flex', md: 'none' }}
        >
          <IconButton
            aria-label="Abrir menú"
            icon={<HamburgerIcon />}
            onClick={onOpen}
            variant="ghost"
            colorScheme="brand"
          />
        </Flex>

        {/* Contenido */}
        <Box p={4} minH="calc(100vh - 80px)">
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </Box>
      </Box>

      {/* Drawer móvil */}
      <Drawer isOpen={isOpen} placement="left" onClose={onClose}>
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader bg="brand.500" color="white">
            WhatsApp Bot
          </DrawerHeader>
          <DrawerBody p={0}>
            <Sidebar />
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </Box>
  );
};
