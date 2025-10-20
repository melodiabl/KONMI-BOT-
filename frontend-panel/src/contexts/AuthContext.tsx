import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiService } from '../services/api';

interface User {
  id: number;
  username: string;
  roles?: string[];
  rol?: string; // compat backend
  wa_jid?: string;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasRole: (role: string) => boolean;
  isOwner: () => boolean;
  clearAuthData: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    console.log('AuthContext: Token encontrado:', !!token);

    if (token) {
      console.log('AuthContext: Verificando token con backend...');
      apiService.getMe()
        .then((response) => {
          // Backend devuelve el usuario directo (no envuelto) en /auth/me
          const backendUser: User = (response && response.user) ? response.user : response;
          const normalized: User = {
            ...backendUser,
            roles: backendUser?.roles && backendUser.roles.length
              ? backendUser.roles
              : (backendUser?.rol ? [backendUser.rol] : []),
          };
          console.log('Usuario obtenido (normalizado):', normalized);
          setUser(normalized);
        })
        .catch((error) => {
          console.error('Error obteniendo usuario:', error);

          // Solo remover token si es un error de autenticación crítico
          if (error.response?.status === 401 || error.response?.status === 403) {
            console.log('AuthContext: Token inválido, removiendo');
            localStorage.removeItem('token');
          } else {
            console.log('AuthContext: Error de red o servidor, manteniendo token');
            // En caso de error de red, mantener el token y intentar más tarde
          }
        })
        .finally(() => {
          console.log('AuthContext: Finalizando verificación de token');
          setIsLoading(false);
        });
    } else {
      console.log('AuthContext: No hay token, usuario no autenticado');
      setIsLoading(false);
    }
  }, []);

  const login = async (username: string, password: string, role?: string) => {
    try {
      console.log('AuthContext: Intentando login con usuario:', username, 'rol:', role);
      const response = await apiService.login(username, password, role);
      console.log('Login exitoso:', response);
      localStorage.setItem('token', response.token);
      const backendUser: User = response.user;
      const normalized: User = {
        ...backendUser,
        roles: backendUser?.roles && backendUser.roles.length
          ? backendUser.roles
          : (backendUser?.rol ? [backendUser.rol] : []),
      };
      setUser(normalized);
      console.log('AuthContext: Usuario establecido:', normalized);
    } catch (error) {
      console.error('AuthContext: Error en login:', error);
      throw error;
    }
  };

  const logout = () => {
    console.log('AuthContext: Cerrando sesión');
    localStorage.removeItem('token');
    setUser(null);
    console.log('AuthContext: Sesión cerrada');
  };

  const hasRole = (role: string) => {
    if (!user) return false;
    return user.rol === role || (user.roles?.includes(role) ?? false);
  };

  const isOwner = () => {
    return hasRole('owner') || hasRole('admin');
  };

  const clearAuthData = () => {
    console.log('AuthContext: Limpiando datos de autenticación');
    localStorage.removeItem('token');
    setUser(null);
    window.location.href = '/login';
  };

  const value: AuthContextType = {
    user,
    login,
    logout,
    isLoading,
    isAuthenticated: !!user,
    hasRole,
    isOwner,
    clearAuthData,
  };

  console.log('AuthContext: Valor del contexto:', {
    user: !!user,
    isLoading,
    isAuthenticated: !!user
  });

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
