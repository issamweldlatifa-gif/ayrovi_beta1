import React from 'react';
import { PUBLIC_PAGES } from '../navigation/publicPages';
import { useLocale } from '../i18n/LocaleContext';

export function PublicPageLinks() {
  const { tr } = useLocale();
  return <nav className="public-page-links" dir="ltr" aria-label={tr('Découvrir AYROVI', 'اكتشف AYROVI')}>
    {PUBLIC_PAGES.map(page => <a key={page.id} href={page.href}>{page.label}</a>)}
  </nav>;
}
