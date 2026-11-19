import '@fontsource/noto-sans-thai/400.css';
import '@fontsource/noto-sans-thai/500.css';
import '@fontsource/noto-sans-thai/600.css';
import '@fontsource/noto-sans-thai/700.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { ErrorBoundary } from './app/ErrorBoundary';
import { AuthProvider } from './features/auth/AuthProvider';
import { ThemeProvider } from './features/settings/ThemeProvider';
import { CartProvider } from './features/cart/CartProvider';
import { GuestMigrationDialog } from './features/guest/GuestMigrationDialog';
import { ToastProvider } from './components/ui/Toast';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider>
          <ToastProvider>
            <CartProvider>
              <RouterProvider router={router} />
              <GuestMigrationDialog />
            </CartProvider>
          </ToastProvider>
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
