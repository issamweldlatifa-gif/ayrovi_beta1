import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './styles/journey.css';
import { installNativeApiOrigin } from './services/nativeApiOrigin';
import { NavigationHistoryProvider } from './navigation/NavigationHistory';
import { CustomerIdentity } from './design/editorial/CustomerIdentity';
import { LocaleProvider } from './i18n/LocaleContext';
import { RouteMeta } from './navigation/RouteMeta';
import { BOOT_Z_TRANSFORM, Z_MARK } from './design/zMark';

// التطبيق الأصلي: سطر واحد يوحّد المسار — كل طلب نسبي يوجّه إلى أصل الـ API.
// على الويب: no-op مطلق (same-origin).
installNativeApiOrigin();

const isRecoveryPath = window.location.pathname === '/reset-password';
const PasswordRecovery = lazy(() => import('./components/CustomerPasswordRecovery').then(module => ({ default: module.CustomerPasswordRecovery })));
const isAdminPath = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');
const PublicApp = lazy(() => import('./App').then((module) => ({ default: module.App })));
const AdminApp = lazy(() => import('./admin/AdminApp').then((module) => ({ default: module.AdminApp })));

/**
 * Écran de chargement ZAYROVI — même dessin que le chargeur statique de index.html :
 * le Z au centre d'un anneau clair, un arc plus foncé tourne pendant que les modules
 * se chargent. React remplace le contenu statique de #root au premier rendu ; ce
 * fallback prend le relais sans page blanche ni saut visuel (les styles vivent dans
 * index.html — couleurs comprises —, le tracé du Z dans `design/zMark`).
 */
const loading = (
  <div className="ay-boot" role="status" aria-live="polite" aria-label="ZAYROVI">
    <svg className="ay-boot-svg" viewBox="0 0 136 136" aria-hidden="true" focusable="false" data-brand="zayrovi-loader">
      <circle className="ay-boot-track" cx="68" cy="68" r="65" />
      <path className="ay-boot-arc" d="M 68 3 A 65 65 0 0 1 129.08 45.77" />
      <path className="ay-boot-z" transform={BOOT_Z_TRANSFORM} d={Z_MARK.d} />
    </svg>
  </div>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LocaleProvider>
      <NavigationHistoryProvider>
        <RouteMeta />
        <Suspense fallback={loading}>
          {isAdminPath ? <AdminApp /> : <CustomerIdentity>{isRecoveryPath ? <PasswordRecovery reset /> : <PublicApp />}</CustomerIdentity>}
        </Suspense>
      </NavigationHistoryProvider>
    </LocaleProvider>
  </React.StrictMode>
);
