import React from 'react';
import { AlertCircle, Globe2, Loader2, RefreshCw } from '../../../components/QatafoIcons';
import { EmptyState } from '../../../design/ui';
import { useLocale } from '../../../i18n/LocaleContext';
import { AyWebsRequestError, type AyWebsErrorContract } from '../api';

/**
 * AYWEBs — vocabulaire commun des états d'écran (§49-§52).
 *
 * Un écran AYWEBs n'a jamais un état implicite : chargement, vide, erreur,
 * hors-ligne et succès sont rendus par les mêmes composants, avec la même
 * honnêteté — une erreur affiche le contrat serveur (§44) et la sortie qu'il
 * recommande, jamais un message générique inventé côté client.
 */

export const AyWebsLoading: React.FC<{ label?: string }> = ({ label }) => {
  const { tr } = useLocale();
  return (
    <div className="grid min-h-40 place-items-center text-center" role="status" aria-live="polite">
      <div>
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-ink" />
        <strong className="mt-3 block text-sm font-black text-ink">{label || tr('Chargement…', 'جارٍ التحميل…')}</strong>
      </div>
    </div>
  );
};

export const AyWebsOffline: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => {
  const { tr } = useLocale();
  return (
    <EmptyState
      icon={<Globe2 className="h-7 w-7" />}
      title={tr('Connexion indisponible', 'لا يوجد اتصال')}
      text={tr(
        'Aucune donnée n’est inventée hors-ligne : votre panier et vos commandes seront relus dès le retour du réseau.',
        'لا نعرض أي بيانات غير حقيقية دون اتصال: ستُقرأ سلّتك وطلباتك مجددًا فور عودة الشبكة.',
      )}
      action={onRetry ? (
        <button type="button" onClick={onRetry} className="ay-btn-secondary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">
          <RefreshCw className="h-4 w-4" />
          {tr('Réessayer', 'إعادة المحاولة')}
        </button>
      ) : undefined}
    />
  );
};

export interface AyWebsErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  /** Sorties proposées par l’écran en plus de celles du contrat serveur. */
  actions?: React.ReactNode;
}

/** Traduit un refus serveur en écran lisible, avec la sortie recommandée (§44). */
export const AyWebsErrorState: React.FC<AyWebsErrorStateProps> = ({ error, onRetry, actions }) => {
  const { tr } = useLocale();
  const contract: AyWebsErrorContract | null = error instanceof AyWebsRequestError ? error.contract : null;
  const code = error instanceof AyWebsRequestError ? error.code : 'NETWORK_OR_CLIENT_ERROR';
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const message = contract?.userMessage
    || (error instanceof Error ? error.message : '')
    || tr('Nous n’avons pas pu terminer cette action.', 'لم نتمكن من إتمام هذا الإجراء.');

  const actionLabel = contract ? requiredActionLabel(contract.requiredAction, tr) : '';

  return (
    <EmptyState
      tone="danger"
      icon={<AlertCircle className="h-7 w-7" />}
      title={offline ? tr('Connexion indisponible', 'لا يوجد اتصال') : tr('Action interrompue', 'تم إيقاف الإجراء')}
      text={message}
      action={(
        <div className="grid gap-2 sm:min-w-56">
          {contract?.retryAllowed !== false && onRetry && (
            <button type="button" onClick={onRetry} className="ay-btn-primary flex min-h-11 items-center justify-center gap-2 px-4 text-xs font-black">
              <RefreshCw className="h-4 w-4" />
              {tr('Réessayer', 'إعادة المحاولة')}
            </button>
          )}
          {actions}
          <p className="text-micro font-bold uppercase tracking-[0.12em] text-muted">
            {code}{actionLabel ? ` · ${actionLabel}` : ''}
          </p>
        </div>
      )}
    />
  );
};

function requiredActionLabel(action: string, tr: (fr: string, ar: string) => string): string {
  switch (action) {
    case 'SELECT_VARIANT':
    case 'CHOOSE_ANOTHER_VARIANT': return tr('Choisissez une version', 'اختر نسخة');
    case 'PROVIDE_PRODUCT_URL': return tr('Collez le lien du produit', 'الصق رابط المنتج');
    case 'SUBMIT_PURCHASE_REQUEST': return tr('Demande d’achat avec URL', 'طلب شراء بالرابط');
    case 'ACCEPT_NEW_PRICE': return tr('Acceptez ou refusez le nouveau prix', 'اقبل السعر الجديد أو ارفضه');
    case 'CUSTOMER_BROWSER_ACTION': return tr('Action requise dans la boutique', 'إجراء مطلوب داخل المتجر');
    case 'AUTHENTICATE': return tr('Connectez-vous à votre compte', 'سجّل الدخول إلى حسابك');
    case 'CHOOSE_PAYMENT': return tr('Choisissez un moyen de paiement', 'اختر طريقة الدفع');
    case 'WAIT_FOR_REVIEW': return tr('En attente de revue AYROVI', 'بانتظار مراجعة AYROVI');
    case 'CONTACT_SUPPORT': return tr('Contactez le support', 'تواصل مع الدعم');
    default: return '';
  }
}

/** Bandeau d’état réutilisable (succès discret, information, blocage). */
export const AyWebsNotice: React.FC<{ tone?: 'info' | 'success' | 'warning' | 'danger'; children: React.ReactNode }> = ({ tone = 'info', children }) => {
  const tones: Record<string, string> = {
    info: 'border-line bg-surface text-ink',
    success: 'border-success/30 bg-success/5 text-ink',
    warning: 'border-ink/20 bg-ink/5 text-ink',
    danger: 'border-danger/30 bg-danger/5 text-ink',
  };
  return (
    <p className={`rounded-control border px-3 py-2 text-xs font-semibold leading-6 ${tones[tone]}`} role="status">
      {children}
    </p>
  );
};

/** Prix affiché : toujours la devise source + le devis AYROVI en dinars. */
export const AyWebsPrice: React.FC<{ amount: number; currency: string; tnd?: number | null; className?: string }> = ({ amount, currency, tnd, className }) => (
  <span className={className}>
    <strong className="font-black text-ink">{amount.toFixed(2)} {currency}</strong>
    {typeof tnd === 'number' && tnd > 0 && (
      <span className="ms-2 text-xs font-bold text-muted">≈ {tnd.toFixed(2)} TND</span>
    )}
  </span>
);
