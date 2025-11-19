import React, { createContext, useContext, useState, useEffect } from 'react';
import { ChakraProvider, ColorModeScript, useColorMode } from '@chakra-ui/react';
import theme from '../theme';

interface ThemeContextType {
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { colorMode, toggleColorMode } = useColorMode();

  return (
    <ThemeContext.Provider value={{ isDarkMode: colorMode === 'dark', toggleTheme: toggleColorMode }}>
      <ChakraProvider theme={theme}>
        <ColorModeScript initialColorMode="dark" />
        {children}
      </ChakraProvider>
    </ThemeContext.Provider>
  );
};
