import React from 'react';
import { useLocale } from '../i18n/LocaleContext';

/**
 * Page introuvable — l'écran qui manquait.
 *
 * Avant, une adresse inventée recevait `200 OK` et la page d'accueil : le visiteur ne
 * comprenait pas pourquoi il ne trouvait pas ce qu'il cherchait, et les moteurs de recherche
 * indexaient du vide. Le serveur répond désormais `404` (voir `src/server.ts`) et cette page
 * dit la vérité au visiteur, avec une seule action utile : revenir à l'accueil.
 */
export const NotFoundPage: React.FC = () => {
  const { tr } = useLocale();
  return (
    <main className="relative flex min-h-[52vh] flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <span className="font-display text-5xl font-black tracking-tight text-ink">404</span>
      <h1 className="font-display text-2xl font-black text-ink">
        {tr('Cette page n’existe pas', 'هذه الصفحة غير موجودة')}
      </h1>
      <p className="max-w-md text-sm leading-7 text-muted">
        {tr(
          'Le lien est peut-être ancien ou mal orthographié. Tout le reste du site est intact.',
          'قد يكون الرابط قديمًا أو مكتوبًا بشكل خاطئ. بقية الموقع بخير.',
        )}
      </p>
      <a
        href="/"
        className="mt-2 inline-flex items-center justify-center rounded-card bg-ink px-6 py-3 text-xs font-bold uppercase tracking-wider text-white transition hover:opacity-90"
      >
        {tr('Revenir à l’accueil', 'العودة إلى الصفحة الرئيسية')}
      </a>
    </main>
  );
};
