import React from 'react';
import { useLocale } from '../i18n/LocaleContext';
import { availablePaymentMethods, type PaymentMethodDefinition, type PaymentMethodGlyph } from '../commerce/paymentMethods';
import type { CommercePolicy } from '../commerce/policy';
import { Bank, CreditCard, Mail, Phone } from './QatafoIcons';

/**
 * Bloc « Moyens de paiement » du pied de page.
 *
 * Deux principes, et ils sont non négociables :
 *
 * 1. ON N'ANNONCE QUE CE QU'ON ENCAISSE VRAIMENT.
 *    La liste vient de `availablePaymentMethods()` — la même fonction que la caisse. Aucun moyen
 *    n'apparaît ici parce qu'il est « prévu » ou « bientôt » : il n'apparaît que si sa
 *    configuration officielle existe (passerelle réelle, RIB publié, compte postal publié).
 *    Corollaire : aujourd'hui, zéro moyen n'est opérationnel — donc zéro pastille, et une phrase
 *    qui dit la vérité sur ce qui se passe réellement quand on commande.
 *
 * 2. LES MARQUES SONT LES NÔTRES.
 *    Les visuels tiers (photo de carte bancaire, logo d'opérateur) ne sont jamais imprimés sur la
 *    signature publique : un logo de réseau sur le pied de page est une promesse qu'aucun contrat
 *    ne couvre aujourd'hui. Ici, les glyphes de la famille maison, rendus par le moteur d'icônes
 *    central — deux glyphes manquants (`Bank`, `Mail`) ont été ajoutés au registre, pas dessinés
 *    en local.
 *
 * Le composant est PUR : il reçoit la policy en prop, ne fait aucun appel réseau, et se teste donc
 * directement, sans navigateur ni simulation de chargement.
 */

const MARKS: Record<PaymentMethodGlyph, React.ComponentType<{ size?: number }>> = {
  Card: CreditCard, Phone, Bank, Mail,
};

const PaymentMark: React.FC<{ glyph: PaymentMethodGlyph }> = ({ glyph }) => {
  const Icon = MARKS[glyph];
  return <span className="public-footer-payment-mark"><Icon size={18} /></span>;
};

/**
 * Une ligne du tableau des règles : l'intitulé court, la valeur vient de la configuration.
 * La valeur est un texte publié par l'Admin, souvent latin : `<bdi dir="auto">` l'isole pour que
 * « 20 % » garde son ordre en arabe, tout en l'alignant sur le bord de départ de la page
 * (à droite en arabe, à gauche en français) — sans casser la lecture de la phrase.
 */
const Rule: React.FC<{ term: string; value: string }> = ({ term, value }) => (
  <div><dt>{term}</dt><dd><bdi dir="auto">{value}</bdi></dd></div>
);

export interface FooterPaymentMethodsProps {
  /** `null` tant que la configuration n'est pas connue — on n'invente rien, on patiente. */
  policy: CommercePolicy | null;
  /** La configuration a échoué : on le dit, sans prétendre quoi que ce soit sur les moyens. */
  failed?: boolean;
}

export const FooterPaymentMethods: React.FC<FooterPaymentMethodsProps> = ({ policy, failed = false }) => {
  const { tr } = useLocale();

  if (!policy) {
    return <p className="public-footer-payment-state" role={failed ? 'alert' : undefined}>
      {failed
        ? tr('Moyens de paiement : conditions indisponibles pour l’instant. Écrivez-nous, nous répondons.', 'طرق الدفع: الشروط غير متاحة الآن. راسلنا ونردّ عليك.')
        : tr('Vérification des moyens de paiement…', 'جارٍ التحقق من طرق الدفع…')}
    </p>;
  }

  const live = availablePaymentMethods(policy);
  const { percent, cardDiscountPercent, reviewDelay, unavailableRefundPolicy } = policy.deposit;

  return <>
    {live.length === 0
      ? <>
        {/* Rien n'est encaissable aujourd'hui : le pied de page ne se tait pas et ne ment pas. */}
        <p className="public-footer-payment-state">
          <span className="public-footer-payment-dot" aria-hidden="true" />
          <strong>{tr('Aucun encaissement en ligne n’est ouvert aujourd’hui.', 'ما فمّاش خلاص أونلاين مفتوح اليوم.')}</strong>
        </p>
        <p className="public-footer-payment-note">
          {tr('Vous commandez quand même : la commande est enregistrée et le règlement reste en attente dans votre espace. Rien n’est prélevé avant l’ouverture d’un moyen.', 'تنجّم تكمّل طلبك عادي: الطلب يتسجّل والخلاص يبقى في الانتظار في فضائك. ما يتخصّم شي قبل ما يتحلّ طريقة دفع.')}
        </p>
      </>
      : <ul className="public-footer-payment-list">
        {live.map((method: PaymentMethodDefinition) => <li key={method.id} className="public-footer-payment">
          <PaymentMark glyph={method.glyph} />
          <span><strong>{tr(method.label, method.labelAr)}</strong><small>{tr(method.hint, method.hintAr)}</small></span>
        </li>)}
      </ul>}

    {/* Les seuls chiffres affichés ici sont ceux qui nous engagent, publiés par l'Admin. */}
    <dl className="public-footer-payment-rules">
      <Rule term={tr('Acompte à la commande', 'الدفعة عند الطلب')} value={`${percent} %`} />
      {live.some((method) => method.id === 'CARD') && cardDiscountPercent > 0
        && <Rule term={tr('Remise carte bancaire', 'تخفيض البطاقة البنكية')} value={`${cardDiscountPercent} %`} />}
      {reviewDelay.trim() && <Rule term={tr('Vérification', 'التحقّق')} value={reviewDelay.trim()} />}
      {unavailableRefundPolicy.trim() && <Rule term={tr('Remboursement', 'الترجيع')} value={unavailableRefundPolicy.trim()} />}
    </dl>

    <a className="public-footer-payment-link" href="/terms.html">{tr('Détail dans les conditions d’utilisation', 'التفاصيل في شروط الاستخدام')}</a>
  </>;
};
