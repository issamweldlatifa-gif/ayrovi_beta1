import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/journey.css';
import { NavigationHistoryProvider } from './navigation/NavigationHistory';
import { LocaleProvider } from './i18n/LocaleContext';

const isAdminPath = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');
const PublicApp = lazy(() => import('./App').then((module) => ({ default: module.App })));
const AdminApp = lazy(() => import('./admin/AdminApp').then((module) => ({ default: module.AdminApp })));

const loading = (
  <div className="grid min-h-screen place-items-center bg-white text-sm font-bold text-ink" role="status" aria-live="polite">
    Chargement d’AYROVI…
  </div>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LocaleProvider>
      <NavigationHistoryProvider>
        <Suspense fallback={loading}>
          {isAdminPath ? <AdminApp /> : <PublicApp />}
        </Suspense>
      </NavigationHistoryProvider>
    </LocaleProvider>
  </React.StrictMode>
);
