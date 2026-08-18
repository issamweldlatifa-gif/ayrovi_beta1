import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { MessageSquare, PackageCheck, Copy, Plus, Share2 as Share } from './QatafoIcons';
import { AppHeader } from '../design/AppHeader';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { OrderResult } from '../types';
import { JourneyProgress } from './JourneyProgress';
import { useLocale } from '../i18n/LocaleContext';
import { CheckoutFlowShell } from './CheckoutFlowShell';

interface OrderSuccessModalProps {
  result: OrderResult | null;
  onClose: () => void;
  onOpenAccount?: () => void;
  onCalculateAnotherProduct: () => void;
}

export const OrderSuccessModal: React.FC<OrderSuccessModalProps> = ({ result, onClose, onOpenAccount, onCalculateAnotherProduct }) => {
  const [copyStatus, setCopyStatus] = useState('');
  const { tr, direction, formatMoney } = useLocale();
  useBodyScrollLock(Boolean(result));

  useEffect(() => {
    setCopyStatus('');
    if (result) {
      try {
        const styles = getComputedStyle(document.documentElement);
        confetti({
          particleCount: 90,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['--ayrovi-primary', '--ayrovi-primary-dark', '--ayrovi-primary-light', '--ayrovi-accent', '--ayrovi-white'].map((token) => styles.getPropertyValue(token).trim()),
        });
      } catch {}
    }
  }, [result]);

  useEffect(() => {
    if (!result) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [result, onClose]);

  if (!result) return null;

  const whatsappMessage = encodeURIComponent(tr(
    `Bonjour AYROVI,\nJe viens d’enregistrer une commande :\n\nRéférence : ${result.orderNumber}\nNom : ${result.customer.name}\nTéléphone : ${result.customer.phone}\nVille/Adresse : ${result.customer.city} - ${result.customer.address}\nMontant total : ${result.totalTND.toFixed(2)} DT\n\nMerci de m’aider pour le paiement et le suivi.`,
    `مرحبًا AYROVI،\nسجلت طلبًا جديدًا:\n\nالمرجع: ${result.orderNumber}\nالاسم: ${result.customer.name}\nالهاتف: ${result.customer.phone}\nالولاية/العنوان: ${result.customer.city} - ${result.customer.address}\nالإجمالي: ${result.totalTND.toFixed(2)} د.ت\n\nيرجى مساعدتي في الدفع والمتابعة.`
  ));

  const whatsappUrl = `https://wa.me/?text=${whatsappMessage}`;
  const manualDeposit = ['BANK_TRANSFER','POSTE'].includes(String(result.deposit?.method || '').toUpperCase());
  const handleCopyOrderNumber = async () => {
    try {
      await navigator.clipboard.writeText(result.orderNumber);
      setCopyStatus(tr('Numéro de commande copié.', 'تم نسخ رقم الطلب.'));
    } catch {
      setCopyStatus(tr('La copie automatique est indisponible dans ce navigateur.', 'النسخ التلقائي غير متاح في هذا المتصفح.'));
    }
  };

  return (
    <CheckoutFlowShell direction={direction} size="confirmation" ariaLabelledBy="order-success-title">
        <AppHeader title={tr('Commande enregistrée', 'تم تسجيل الطلب')} subtitle={tr('Confirmation AYROVI', 'تأكيد AYROVI')} onClose={onClose} actionLabel={tr('Retour à l’accueil', 'العودة إلى الصفحة الرئيسية')} />
        <JourneyProgress active={4} />
        <div className="checkout-flow-content ay-safe-bottom space-y-5 text-center">
        {/* Celebration Icon */}
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand mx-auto shadow-xs">
          <PackageCheck className="w-8 h-8 sm:w-10 sm:h-10" />
        </div>

        {/* Title */}
        <div>
          <h2 id="order-success-title" className="text-xl sm:text-2xl font-bold text-ink mb-1">
            {tr('Commande enregistrée', 'تم تسجيل الطلب')}
          </h2>
          <p className="text-xs text-muted font-medium">
            {tr('Merci pour votre confiance. Suivez le paiement et la livraison depuis votre compte AYROVI.', 'شكرًا لثقتك. تابع الدفع والتوصيل من حسابك في AYROVI.')}
          </p>
        </div>

        {/* Order Number Box */}
        <div className="bg-surface border border-brand/30 rounded-2xl p-4 flex items-center justify-between">
          <div className="text-left">
            <span className="text-[10px] text-muted uppercase font-bold block">{tr('Numéro de commande :', 'رقم الطلب:')}</span>
            <span className="text-lg font-mono font-black text-brand">{result.orderNumber}</span>
          </div>
          <button
            type="button"
            onClick={() => void handleCopyOrderNumber()}
            className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-white text-muted shadow-xs transition-colors hover:text-ink"
            title={tr('Copier le numéro', 'نسخ الرقم')}
            aria-label={tr('Copier le numéro de commande', 'نسخ رقم الطلب')}
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
        {copyStatus && <p className="text-xs font-semibold text-muted" role="status">{copyStatus}</p>}

        {/* Details */}
        <div className="bg-surface border border-line rounded-2xl p-3.5 text-xs text-muted space-y-1.5 text-left">
          <div className="checkout-confirmation-row">
            <span className="text-muted">{tr('Client :', 'الحريف:')}</span>
            <span className="font-bold text-ink">{result.customer.name}</span>
          </div>
          <div className="checkout-confirmation-row">
            <span className="text-muted">{tr('Gouvernorat :', 'الولاية:')}</span>
            <span className="font-bold text-ink">{result.customer.city}</span>
          </div>
          <div className="checkout-confirmation-row"><span>{tr('E-mail :', 'البريد الإلكتروني:')}</span><strong className="text-ink">{result.customer.email}</strong></div>
          {result.breakdown && <>
            <div className="checkout-confirmation-row border-t border-line pt-1.5"><span>{tr('Produits :', 'المنتجات:')}</span><strong>{formatMoney(result.breakdown.subtotalTnd)}</strong></div>
            <div className="checkout-confirmation-row"><span>{tr('Livraison :', 'التوصيل:')}</span><strong>{formatMoney(result.breakdown.shippingTnd)}</strong></div>
            <div className="checkout-confirmation-row"><span>{tr('Service :', 'الخدمة:')}</span><strong>{formatMoney(result.breakdown.serviceTnd)}</strong></div>
          </>}
          <div className="checkout-confirmation-row pt-1.5 border-t border-line font-extrabold">
            <span className="text-ink">{tr('Total de la commande :', 'إجمالي الطلب:')}</span>
            <span className="text-brand text-sm">{formatMoney(result.totalTND)}</span>
          </div>
        </div>

        {/* قسم العربون 20% */}
        {result.deposit && (
          <div className="rounded-2xl border border-accent bg-accent/10 p-4 text-start space-y-2" role="alert">
            <div className="checkout-confirmation-row items-center">
              <span className="text-xs font-black text-ink uppercase tracking-wide">{tr(`Acompte de confirmation (${result.deposit.percent}%) :`, `عربون التأكيد (${result.deposit.percent}%):`)}</span>
              <span className="text-lg font-black text-accent-deep">{result.deposit.amountTnd.toFixed(3)} {tr('DT', 'د.ت')}</span>
            </div>
            <p className="text-[11px] leading-5 text-ink">
              {manualDeposit ? tr(
                'Le moyen manuel est enregistré. Effectuez le virement/versement avec les coordonnées affichées, puis envoyez uniquement son justificatif depuis Mon compte → Mes commandes.',
                'تم حفظ وسيلة الدفع اليدوية. أنجز التحويل/الإيداع بالبيانات المعروضة ثم أرسل إثباته فقط من حسابي ← طلباتي.',
              ) : tr(
                'La commande existe dans Mon compte → Mes commandes. Le paiement carte doit être confirmé par la passerelle avant la validation de la commande.',
                'الطلب موجود في حسابي ← طلباتي. يجب أن تؤكد بوابة الدفع عملية البطاقة قبل تأكيد الطلب.',
              )}
            </p>
            <p className="rounded-full border border-warning/30 bg-warning/10 px-3 py-2 text-center text-[10px] font-black text-warning">
              {tr('Commande en attente d’acompte', 'الطلب في انتظار العربون')}
            </p>
            <ol className="space-y-1 rounded-xl border border-line bg-surface p-3 text-[10px] font-semibold leading-5 text-muted">
              <li>1. {tr('Commande visible immédiatement dans Mes commandes.', 'الطلب ظاهر فورًا في طلباتي.')}</li>
              <li>2. {manualDeposit ? tr('Envoyer le justificatif manuel depuis le profil.', 'إرسال إثبات الدفع اليدوي من الحساب.') : tr('Finaliser la carte sur la page sécurisée.', 'إتمام دفع البطاقة في الصفحة الآمنة.')}</li>
              <li>3. {tr('Paiement vérifié, puis commande confirmée.', 'التحقق من الدفع ثم تأكيد الطلب.')}</li>
              <li>4. {tr('Suivi visible après expédition; facture visible après émission.', 'يظهر التتبع بعد الشحن والفاتورة بعد إصدارها.')}</li>
            </ol>
            <p className="text-[11px] text-ink">{tr('Solde restant à la livraison :', 'المبلغ المتبقي عند التوصيل:')} <strong>{result.deposit.balanceTnd.toFixed(3)} {tr('DT', 'د.ت')}</strong></p>
            {onOpenAccount && (
              <button type="button" onClick={onOpenAccount} className="ay-btn-primary w-full text-xs">
                <Share className="h-4 w-4" />
                {tr('Gérer l’acompte et suivre la commande', 'إدارة العربون ومتابعة الطلب')}
              </button>
            )}
          </div>
        )}

        {!result.deposit && onOpenAccount && <button type="button" onClick={onOpenAccount} className="ay-btn-primary w-full text-xs sm:text-sm"><PackageCheck className="h-4 w-4" />{tr('Suivre la commande dans mon compte', 'متابعة الطلب داخل حسابي')}</button>}

        {/* WhatsApp Button */}
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-control bg-whatsapp px-6 py-3.5 text-xs font-bold text-white shadow-card transition hover:bg-whatsapp-hover active:scale-95 sm:text-sm"
        >
          <MessageSquare className="w-4 h-4" />
          <span>{tr('Contacter AYROVI sur WhatsApp', 'التواصل مع AYROVI عبر واتساب')}</span>
        </a>

        <button type="button" onClick={onCalculateAnotherProduct} className="ay-btn-primary min-h-12 w-full text-xs sm:text-sm">
          <Plus className="h-4 w-4" />
          {tr('Calculer un autre produit', 'حساب منتج آخر')}
        </button>

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="ay-btn-secondary w-full text-xs"
        >
          {tr("Retourner à l'accueil", 'العودة إلى الصفحة الرئيسية')}
        </button>

        </div>
    </CheckoutFlowShell>
  );
};
