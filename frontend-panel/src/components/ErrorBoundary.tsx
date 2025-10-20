import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Box, Button, Heading, Text, VStack } from '@chakra-ui/react';
import { WarningIcon } from '@chakra-ui/icons';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Error capturado en ErrorBoundary:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          height="100%"
          minHeight="300px"
          width="100%"
          p={5}
        >
          <VStack spacing={4} textAlign="center">
            <WarningIcon boxSize={10} color="red.500" />
            <Heading size="md">Algo salió mal</Heading>
            <Text>Ha ocurrido un error al cargar esta página.</Text>
            <Text fontSize="sm" color="gray.500">
              {this.state.error?.message}
            </Text>
            <Button
              colorScheme="blue"
              onClick={() => window.location.reload()}
            >
              Recargar página
            </Button>
          </VStack>
        </Box>
      );
    }

    return this.props.children;
  }
}