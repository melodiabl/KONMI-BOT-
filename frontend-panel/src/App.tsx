import React, { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { Layout } from './components/Layout';
import { LoadingFallback } from './components/LoadingFallback';
import { ErrorBoundary } from './components/ErrorBoundary';

// Importar componentes con lazy loading
const Login = lazy(() => import('./pages/Login').then(module => ({ default: module.Login })));
const Dashboard = lazy(() => import('./pages/Dashboard').then(module => ({ default: module.Dashboard })));
const BotStatus = lazy(() => import('./pages/BotStatus').then(module => ({ default: module.BotStatus })));
const Grupos = lazy(() => import('./pages/Grupos').then(module => ({ default: module.Grupos })));
const GruposManagement = lazy(() => import('./pages/GruposManagement').then(module => ({ default: module.GruposManagement })));
const Aportes = lazy(() => import('./pages/Aportes').then(module => ({ default: module.Aportes })));
const Pedidos = lazy(() => import('./pages/Pedidos').then(module => ({ default: module.Pedidos })));
const Settings = lazy(() => import('./pages/Settings').then(module => ({ default: module.Settings })));
const Proveedores = lazy(() => import('./pages/Proveedores').then(module => ({ default: module.Proveedores })));
const Usuarios = lazy(() => import('./pages/Usuarios').then(module => ({ default: module.Usuarios })));
const Subbots = lazy(() => import('./pages/Subbots'));
const Logs = lazy(() => import('./pages/Logs').then(module => ({ default: module.Logs })));
const Notificaciones = lazy(() => import('./pages/Notificaciones').then(module => ({ default: module.Notificaciones })));
const Analytics = lazy(() => import('./pages/Analytics').then(module => ({ default: module.Analytics })));
const Multimedia = lazy(() => import('./pages/Multimedia').then(module => ({ default: module.Multimedia })));
const AiChat = lazy(() => import('./pages/AiChat').then(module => ({ default: module.AiChat })));
const BotCommands = lazy(() => import('./pages/BotCommands').then(module => ({ default: module.BotCommands })));

// Crear cliente de React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Componente para rutas protegidas
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingFallback message="Verificando autenticación..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingFallback />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
};

// Componente para rutas públicas
const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingFallback message="Verificando autenticación..." />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingFallback />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
};

const AppRoutes: React.FC = () => {
  return (
    <Router>
      <Routes>
        {/* Ruta pública */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />

        {/* Rutas protegidas */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/bot"
          element={
            <ProtectedRoute>
              <Layout>
                <BotStatus />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/usuarios"
          element={
            <ProtectedRoute>
              <Layout>
                <Usuarios />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/subbots"
          element={
            <ProtectedRoute>
              <Layout>
                <Subbots />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/grupos"
          element={
            <ProtectedRoute>
              <Layout>
                <Grupos />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/grupos-management"
          element={
            <ProtectedRoute>
              <Layout>
                <GruposManagement />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/aportes"
          element={
            <ProtectedRoute>
              <Layout>
                <Aportes />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/pedidos"
          element={
            <ProtectedRoute>
              <Layout>
                <Pedidos />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/proveedores"
          element={
            <ProtectedRoute>
              <Layout>
                <Proveedores />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/logs"
          element={
            <ProtectedRoute>
              <Layout>
                <Logs />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/notificaciones"
          element={
            <ProtectedRoute>
              <Layout>
                <Notificaciones />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <Layout>
                <Analytics />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/multimedia"
          element={
            <ProtectedRoute>
              <Layout>
                <Multimedia />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Layout>
                <Settings />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/ai-chat"
          element={
            <ProtectedRoute>
              <Layout>
                <AiChat />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/bot-commands"
          element={
            <ProtectedRoute>
              <Layout>
                <BotCommands />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Redirección por defecto */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <NotificationProvider>
            <ErrorBoundary>
              <Suspense fallback={<LoadingFallback message="Cargando aplicación..." />}>
                <AppRoutes />
              </Suspense>
            </ErrorBoundary>
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#363636',
                  color: '#fff',
                },
              }}
            />
          </NotificationProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;
