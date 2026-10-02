import React, { useEffect } from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { applyRouteMeta } from './routeMeta';

/**
 * Branche l'identité SEO sur l'état réel de l'application : la langue lue et la route
 * affichée. Sans ce composant, `applyRouteMeta` resterait une fonction jamais appelée —
 * exactement le genre de code mort que l'audit reproche au projet.
 */
export const RouteMeta: React.FC = () => {
  const { locale } = useLocale();

  useEffect(() => {
    const sync = () => { applyRouteMeta(window.location.pathname, locale); };
    sync();
    // Le client navigue sans recharger : chaque retour/avancée doit remettre le `<head>` en accord.
    window.addEventListener('popstate', sync);
    window.addEventListener('ayrovi:urlchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('ayrovi:urlchange', sync);
    };
  }, [locale]);

  return null;
};
