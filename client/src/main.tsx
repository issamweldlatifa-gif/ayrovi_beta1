import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/journey.css';
import { NavigationHistoryProvider } from './navigation/NavigationHistory';
import { CustomerIdentity } from './design/editorial/CustomerIdentity';
import { LocaleProvider } from './i18n/LocaleContext';

const isRecoveryPath = window.location.pathname === '/reset-password';
const PasswordRecovery = lazy(() => import('./components/CustomerPasswordRecovery').then(module => ({ default: module.CustomerPasswordRecovery })));
const isAdminPath = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');
const PublicApp = lazy(() => import('./App').then((module) => ({ default: module.App })));
const AdminApp = lazy(() => import('./admin/AdminApp').then((module) => ({ default: module.AdminApp })));

/**
 * Écran d'amorçage AYROVI — même dessin que le chargeur statique de index.html :
 * l'emblème pulse et une ligne orange balaie pendant que les modules se chargent.
 * React remplace le contenu statique de #root au premier rendu ; ce fallback prend
 * le relais sans page blanche ni saut visuel (les styles vivent dans index.html).
 */
const loading = (
  <div className="ay-boot" role="status" aria-live="polite" aria-label="AYROVI">
    <div className="ay-boot-box">
      <img className="ay-boot-mark" src="/media/logo-ayrovi-mark.svg" alt="" />
      <span className="ay-boot-line" aria-hidden="true" />
    </div>
  </div>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LocaleProvider>
      <NavigationHistoryProvider>
        <Suspense fallback={loading}>
          {isAdminPath ? <AdminApp /> : <CustomerIdentity>{isRecoveryPath ? <PasswordRecovery reset /> : <PublicApp />}</CustomerIdentity>}
        </Suspense>
      </NavigationHistoryProvider>
    </LocaleProvider>
  </React.StrictMode>
);
