import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { MessageSquare, PackageCheck, Copy, CreditCard, FileText, Share2 as Share, Truck } from './QatafoIcons';
import { AppHeader } from '../design/AppHeader';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { OrderResult } from '../types';
import { JourneyProgress } from './JourneyProgress';
import { useLocale } from '../i18n/LocaleContext';

interface OrderSuccessModalProps {
  result: OrderResult | null;
  onClose: () => void;
  onOpenAccount?: () => void;
}

export const OrderSuccessModal: React.FC<OrderSuccessModalProps> = ({ result, onClose, onOpenAccount }) => {
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

  const handleCopyOrderNumber = async () => {
    try {
      await navigator.clipboard.writeText(result.orderNumber);
      setCopyStatus(tr('Numéro de commande copié.', 'تم نسخ رقم الطلب.'));
    } catch {
      setCopyStatus(tr('La copie automatique est indisponible dans ce navigateur.', 'النسخ التلقائي غير متاح في هذا المتصفح.'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/50 backdrop-blur-xs flex items-center justify-center p-4" dir={direction} role="dialog" aria-modal="true" aria-labelledby="order-success-title">
      <div className="relative w-full max-w-md overflow-hidden bg-white border border-line rounded-3xl text-center shadow-2xl">
        <AppHeader title={tr('Commande enregistrée', 'تم تسجيل الطلب')} subtitle={tr('Confirmation AYROVI', 'تأكيد AYROVI')} onClose={onClose} actionLabel={tr('Retour à l’accueil', 'العودة إلى الصفحة الرئيسية')} />
        <JourneyProgress active={4} />
        <div className="ay-safe-bottom space-y-5 p-6 sm:p-8">
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
            className="p-2 rounded-xl bg-white border border-line text-muted hover:text-ink shadow-xs transition-colors"
            title={tr('Copier le numéro', 'نسخ الرقم')}
            aria-label={tr('Copier le numéro de commande', 'نسخ رقم الطلب')}
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
        {copyStatus && <p className="text-xs font-semibold text-muted" role="status">{copyStatus}</p>}

        {(result.trackingCode || result.invoice?.number) && <div className="grid gap-2 text-start sm:grid-cols-2">
          {result.trackingCode && <div className="border border-line bg-surface-base p-3"><span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-brand"><Truck className="h-3.5 w-3.5" />{tr('Suivi activé', 'تم تفعيل التتبع')}</span><strong className="mt-1 block font-mono text-xs text-ink">{result.trackingCode}</strong></div>}
          {result.invoice?.number && <div className="border border-line bg-surface-base p-3"><span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-brand"><FileText className="h-3.5 w-3.5" />{tr('Facture créée', 'تم إنشاء الفاتورة')}</span><strong className="mt-1 block font-mono text-xs text-ink">{result.invoice.number}</strong></div>}
        </div>}
        {result.orderId && result.invoice?.number && <a href={`/api/customer/account/orders/${result.orderId}/invoice`} className="flex min-h-12 w-full items-center justify-center gap-2 border border-interactive-primary bg-transparent px-4 text-xs font-black text-interactive-primary transition hover:bg-interactive-primary/5"><FileText className="h-4 w-4" />{tr('Télécharger la facture électronique', 'تنزيل الفاتورة الإلكترونية')}</a>}

        {/* Details */}
        <div className="bg-surface border border-line rounded-2xl p-3.5 text-xs text-muted space-y-1.5 text-left">
          <div className="flex justify-between">
            <span className="text-muted">{tr('Client :', 'الحريف:')}</span>
            <span className="font-bold text-ink">{result.customer.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">{tr('Gouvernorat :', 'الولاية:')}</span>
            <span className="font-bold text-ink">{result.customer.city}</span>
          </div>
          <div className="flex justify-between"><span>{tr('E-mail :', 'البريد الإلكتروني:')}</span><strong className="max-w-[60%] truncate text-ink">{result.customer.email}</strong></div>
          {result.breakdown && <>
            <div className="flex justify-between border-t border-line pt-1.5"><span>{tr('Produits :', 'المنتجات:')}</span><strong>{formatMoney(result.breakdown.subtotalTnd)}</strong></div>
            <div className="flex justify-between"><span>{tr('Livraison :', 'التوصيل:')}</span><strong>{formatMoney(result.breakdown.shippingTnd)}</strong></div>
            <div className="flex justify-between"><span>{tr('Service :', 'الخدمة:')}</span><strong>{formatMoney(result.breakdown.serviceTnd)}</strong></div>
          </>}
          <div className="flex justify-between pt-1.5 border-t border-line font-extrabold">
            <span className="text-ink">{tr('Total de la commande :', 'إجمالي الطلب:')}</span>
            <span className="text-brand text-sm">{formatMoney(result.totalTND)}</span>
          </div>
        </div>

        {/* قسم العربون 20% */}
        {result.deposit && (
          <div className="rounded-2xl border border-accent bg-accent/10 p-4 text-start space-y-2" role="alert">
            <div className="flex justify-between items-center gap-3">
              <span className="text-xs font-black text-ink uppercase tracking-wide">{tr(`Acompte de confirmation (${result.deposit.percent}%) :`, `عربون التأكيد (${result.deposit.percent}%):`)}</span>
              <span className="text-lg font-black text-accent-deep">{result.deposit.amountTnd.toFixed(3)} {tr('DT', 'د.ت')}</span>
            </div>
            <p className="text-[11px] leading-5 text-ink">
              {tr(
                `Votre commande est enregistrée mais pas encore confirmée. La facture électronique et le suivi sont déjà disponibles. ${result.deposit.method === 'CARD' ? 'Notre équipe vous transmettra les instructions de collecte sécurisée.' : 'Réglez l’acompte puis envoyez la preuve depuis votre compte pour validation.'}`,
                `تم تسجيل طلبك لكنه غير مؤكّد بعد. الفاتورة الإلكترونية والتتبع متاحان الآن. ${result.deposit.method === 'CARD' ? 'سيرسل لك فريقنا تعليمات التحصيل الآمن.' : 'ادفع العربون ثم أرسل الإثبات من حسابك للتحقق.'}`
              )}
            </p>
            <p className="text-[11px] text-ink">{tr('Solde restant à la livraison :', 'المبلغ المتبقي عند التوصيل:')} <strong>{result.deposit.balanceTnd.toFixed(3)} {tr('DT', 'د.ت')}</strong></p>
            {onOpenAccount && (
              <button type="button" onClick={onOpenAccount} className="ay-btn-primary w-full text-xs">
                {result.deposit.method === 'CARD'
                  ? <><CreditCard className="h-4 w-4" />{tr('Gérer l’acompte et suivre la commande', 'إدارة العربون ومتابعة الطلب')}</>
                  : <><Share className="h-4 w-4" />{tr('Envoyer la preuve et suivre la commande', 'إرسال الإثبات ومتابعة الطلب')}</>}
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
          className="flex w-full items-center justify-center gap-2 rounded-control border border-whatsapp bg-transparent px-6 py-3.5 text-xs font-bold text-whatsapp transition hover:bg-whatsapp/5 active:scale-95 sm:text-sm"
        >
          <MessageSquare className="w-4 h-4" />
          <span>{tr('Contacter AYROVI sur WhatsApp', 'التواصل مع AYROVI عبر واتساب')}</span>
        </a>

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="ay-btn-secondary w-full text-xs"
        >
          {tr("Retourner à l'accueil", 'العودة إلى الصفحة الرئيسية')}
        </button>

        </div>
      </div>
    </div>
  );
};
