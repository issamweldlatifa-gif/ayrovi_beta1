import React from 'react';
import { AppHeader } from '../../design/AppHeader';
import { Hourglass } from '../../components/QatafoIcons';
import { useLocale } from '../../i18n/LocaleContext';

/**
 * AyWebs — état transitoire honeste (2026-10-03).
 *
 * Les anciens écrans AyWebs ont été supprimés pour reconstruction complète
 * (parcours proxy-shopping type Add-to-Buyee : navigation marchande interne,
 * barre flottante, feuille de variantes par-dessus le marchand, panier réel).
 * Cet écran temporaire ne prétend rien : pas de boutique fantôme, pas de
 * bouton mort. L'icône de navigation reste vivante et annonce l'état vrai.
 * Le backend `/api/v1/aywebs` reste opérationnel pour la reprise.
 */
export const AyWebsPlaceholder: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { tr, direction } = useLocale();
  return (
    <section
      className="fixed inset-0 z-[25] overflow-y-auto bg-surface pb-[calc(5rem+env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      aria-label="AyWebs"
      data-app-route="aywebs"
      dir={direction}
    >
      <AppHeader
        title="AyWebs"
        subtitle={tr('Reconstruction en cours', 'قيد إعادة البناء')}
        onClose={onClose}
      />
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-16 text-center">
        <Hourglass size={40} className="text-cta" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-ink">
          {tr('Le shopping proxy arrive', 'التسوق بالوكالة قادم')}
        </h2>
        <p className="text-sm leading-6 text-ink-secondary">
          {tr(
            'L’espace AyWebs est en cours de reconstruction : navigation marchande داخل التطبيق، ' +
              'bouton Add to Cart flottant, feuille de variantes par-dessus le marchand et panier ' +
              'proxy réel. Aucune boutique n’est affichée tant que le parcours complet n’est pas vérifié.',
            'فضاء AyWebs قيد إعادة البناء: تصفح المتاجر داخل التطبيق، زر Add to Cart عائم، ورقة ' +
              'الخيارات فوق صفحة التاجر وسلة وكالة حقيقية. لا تُعرض أي متاجر قبل اكتمال الرحلة وتحقيقها.',
          )}
        </p>
      </div>
    </section>
  );
};
