import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { MessageSquare, PackageCheck, Copy, CreditCard, Share2 as Share } from './QatafoIcons';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { OrderResult } from '../types';

interface OrderSuccessModalProps {
  result: OrderResult | null;
  onClose: () => void;
  onOpenAccount?: () => void;
}

export const OrderSuccessModal: React.FC<OrderSuccessModalProps> = ({ result, onClose, onOpenAccount }) => {
  const [copyStatus, setCopyStatus] = useState('');
  useBodyScrollLock(Boolean(result));

  useEffect(() => {
    setCopyStatus('');
    if (result) {
      try {
        confetti({
          particleCount: 90,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#673de6', '#5025d1', '#7e57ff', '#10b981', '#f59e0b'],
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

  const whatsappMessage = encodeURIComponent(
    `Bonjour AYROVI,\nJe viens de valider une commande sur votre site :\n\n` +
    `Référence : ${result.orderNumber}\n` +
    `Nom : ${result.customer.name}\n` +
    `Téléphone : ${result.customer.phone}\n` +
    `Ville/Adresse : ${result.customer.city} - ${result.customer.address}\n` +
    `Montant total : ${result.totalTND.toFixed(2)} DT\n\n` +
    `Merci de me confirmer la préparation et l'expédition.`
  );

  const whatsappUrl = `https://wa.me/?text=${whatsappMessage}`;

  const handleCopyOrderNumber = async () => {
    try {
      await navigator.clipboard.writeText(result.orderNumber);
      setCopyStatus('Numéro de commande copié.');
    } catch {
      setCopyStatus('La copie automatique est indisponible dans ce navigateur.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="order-success-title">
      <div className="relative w-full max-w-md bg-white border border-line rounded-3xl p-6 sm:p-8 text-center shadow-2xl space-y-5">
        
        {/* Celebration Icon */}
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto shadow-xs">
          <PackageCheck className="w-8 h-8 sm:w-10 sm:h-10" />
        </div>

        {/* Title */}
        <div>
          <h2 id="order-success-title" className="text-xl sm:text-2xl font-bold text-ink mb-1">
            Félicitations ! Commande validée
          </h2>
          <p className="text-xs text-muted font-medium">
            Merci de votre confiance chez AYROVI. Notre équipe vous contactera sous peu pour organiser la livraison.
          </p>
        </div>

        {/* Order Number Box */}
        <div className="bg-surface border border-brand/30 rounded-2xl p-4 flex items-center justify-between">
          <div className="text-left">
            <span className="text-[10px] text-muted uppercase font-bold block">Numéro de Commande :</span>
            <span className="text-lg font-mono font-black text-brand">{result.orderNumber}</span>
          </div>
          <button
            type="button"
            onClick={() => void handleCopyOrderNumber()}
            className="p-2 rounded-xl bg-white border border-line text-muted hover:text-ink shadow-xs transition-colors"
            title="Copier le numéro"
            aria-label="Copier le numéro de commande"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
        {copyStatus && <p className="text-xs font-semibold text-muted" role="status">{copyStatus}</p>}

        {/* Details */}
        <div className="bg-surface border border-line rounded-2xl p-3.5 text-xs text-muted space-y-1.5 text-left">
          <div className="flex justify-between">
            <span className="text-muted">Client :</span>
            <span className="font-bold text-ink">{result.customer.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Gouvernorat :</span>
            <span className="font-bold text-ink">{result.customer.city}</span>
          </div>
          <div className="flex justify-between pt-1.5 border-t border-line font-extrabold">
            <span className="text-ink">Total à régler :</span>
            <span className="text-brand text-sm">{result.totalTND.toFixed(2)} DT</span>
          </div>
        </div>

        {/* قسم العربون 20% */}
        {result.deposit && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left space-y-2" role="alert">
            <div className="flex justify-between items-center">
              <span className="text-xs font-black text-amber-800 uppercase tracking-wide">Acompte de confirmation ({result.deposit.percent}%) :</span>
              <span className="text-lg font-black text-amber-700">{result.deposit.amountTnd.toFixed(3)} DT</span>
            </div>
            <p className="text-[11px] leading-5 text-amber-800">
              Votre commande est enregistrée mais <strong>pas encore confirmée</strong>. Réglez l’acompte par
              {' '}<strong>{result.deposit.method === 'CARD' ? 'carte bancaire' : result.deposit.method === 'FLOUCI' ? 'Flouci' : result.deposit.method === 'BANK_TRANSFER' ? 'virement bancaire' : 'mandat postal'}</strong>
              {result.deposit.method === 'CARD'
                ? ' : notre équipe transmettra les instructions sécurisées; confirmation, facture et suivi après encaissement.'
                : ' puis envoyez la preuve (capture / reçu) depuis votre espace client pour validation par notre équipe.'}
            </p>
            <p className="text-[11px] text-amber-700">Solde restant à la livraison : <strong>{result.deposit.balanceTnd.toFixed(3)} DT</strong></p>
            {onOpenAccount && (
              <button
                type="button"
                onClick={onOpenAccount}
                className="w-full bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold py-3 px-4 rounded-2xl text-xs transition-all flex items-center justify-center gap-2"
              >
                {result.deposit.method === 'CARD' ? <><CreditCard className="h-4 w-4" />Payer l’acompte par carte</> : <><Share className="h-4 w-4" />Envoyer ma preuve de paiement</>}
              </button>
            )}
          </div>
        )}

        {/* WhatsApp Button */}
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full bg-[#25D366] hover:bg-[#20bd5a] active:scale-95 text-white font-bold py-3.5 px-6 rounded-2xl shadow-md flex items-center justify-center gap-2 text-xs sm:text-sm transition-all"
        >
          <MessageSquare className="w-4 h-4" />
          <span>Suivre ma commande sur WhatsApp</span>
        </a>

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="w-full bg-surface hover:bg-[#e5e7eb] text-ink font-semibold py-3 px-4 rounded-xl text-xs border border-line transition-colors"
        >
          Retourner à l'accueil
        </button>

      </div>
    </div>
  );
};
