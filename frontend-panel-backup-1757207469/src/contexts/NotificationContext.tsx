import React, { createContext, useContext, useState, ReactNode } from 'react';
import { useToast, UseToastOptions } from '@chakra-ui/react';

type NotificationType = 'info' | 'warning' | 'success' | 'error';

interface NotificationContextType {
  showNotification: (title: string, description?: string, type?: NotificationType, duration?: number) => void;
  showError: (error: any) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const toast = useToast();

  const showNotification = (title: string, description = '', type: NotificationType = 'info', duration = 5000) => {
    const options: UseToastOptions = {
      title,
      description,
      status: type,
      duration,
      isClosable: true,
      position: 'top-right',
    };
    toast(options);
  };

  const showError = (error: any) => {
    let title = 'Error';
    let description = 'Ha ocurrido un error inesperado';

    if (error.response) {
      // Error de respuesta del servidor
      const status = error.response.status;
      if (status === 400) {
        title = 'Error en la solicitud';
        description = error.response.data?.message || 'Los datos enviados no son válidos';
      } else if (status === 401) {
        title = 'No autorizado';
        description = 'Debe iniciar sesión para realizar esta acción';
      } else if (status === 403) {
        title = 'Acceso denegado';
        description = 'No tiene permisos para realizar esta acción';
      } else if (status === 404) {
        title = 'No encontrado';
        description = 'El recurso solicitado no existe';
      } else if (status >= 500) {
        title = 'Error del servidor';
        description = 'Ha ocurrido un error en el servidor';
      }
    } else if (error.request) {
      // Error de red (no se recibió respuesta)
      title = 'Error de conexión';
      description = 'No se pudo conectar con el servidor. Verifique su conexión a internet.';
    }

    showNotification(title, description, 'error', 7000);
  };

  return (
    <NotificationContext.Provider value={{ showNotification, showError }}>
      {children}
    </NotificationContext.Provider>
  );
};