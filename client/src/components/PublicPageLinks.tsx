import React, { useEffect, useState } from 'react';
import { PUBLIC_PAGES } from '../navigation/publicPages';
import { useLocale } from '../i18n/LocaleContext';

export interface PublicNavLink {
  id: string;
  destination: string;
  href: string;
  labelFr: string;
  labelAr: string;
}

/** Rendu immédiat (avant la réponse de l'API) : les trois destinations officielles. */
const fallbackLinks: PublicNavLink[] = PUBLIC_PAGES.map(page => ({
  id: `default-${page.id}`,
  destination: page.id,
  href: page.href,
  labelFr: page.label,
  labelAr: page.labelAr,
}));

/**
 * Barre publique sous l'en-tête — pilotée depuis l'Admin (`Contenu › Barre sous l'en-tête`).
 *
 * L'Admin décide quels onglets existent, leurs libellés FR/AR, leur ordre et leur visibilité ;
 * les liens restent des ancres natives vers les pages plein écran réellement servies. Une liste
 * vide (tout masqué côté Admin) masque la barre entière — jamais une barre fantôme.
 */
export function PublicPageLinks() {
  const { tr, isArabic } = useLocale();
  const [links, setLinks] = useState<PublicNavLink[]>(fallbackLinks);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/public/navigation', { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(payload => {
        if (!payload?.success || !Array.isArray(payload.data)) return;
        setLinks(payload.data.map((row: PublicNavLink) => ({
          id: String(row.id),
          destination: String(row.destination),
          href: String(row.href),
          labelFr: String(row.labelFr || row.labelAr || ''),
          labelAr: String(row.labelAr || row.labelFr || ''),
        })).filter((row: PublicNavLink) => row.href.startsWith('/') && row.labelFr));
      })
      .catch(() => { /* L'API indisponible laisse les destinations officielles en place. */ });
    return () => { controller.abort(); };
  }, []);

  if (!links.length) return null;
  return <nav className="public-page-links" dir="ltr" aria-label={tr('Découvrir AYROVI', 'اكتشف AYROVI')} data-public-page-links={links.length}>
    {links.map(link => <a key={link.id} href={link.href} dir="auto">{isArabic ? link.labelAr : link.labelFr}</a>)}
  </nav>;
}
