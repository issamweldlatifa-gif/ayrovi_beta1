import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { MessageSquare, PackageCheck, Copy } from './QatafoIcons';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { OrderResult } from '../types';

interface OrderSuccessModalProps {
  result: OrderResult | null;
  onClose: () => void;
}

export const OrderSuccessModal: React.FC<OrderSuccessModalProps> = ({ result, onClose }) => {
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
      <div className="relative w-full max-w-md bg-white border border-[#e2e8f0] rounded-3xl p-6 sm:p-8 text-center shadow-2xl space-y-5">
        
        {/* Celebration Icon */}
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto shadow-xs">
          <PackageCheck className="w-8 h-8 sm:w-10 sm:h-10" />
        </div>

        {/* Title */}
        <div>
          <h2 id="order-success-title" className="text-xl sm:text-2xl font-bold text-[#1d2130] mb-1">
            Félicitations ! Commande validée
          </h2>
          <p className="text-xs text-[#6b7280] font-medium">
            Merci de votre confiance chez AYROVI. Notre équipe vous contactera sous peu pour organiser la livraison.
          </p>
        </div>

        {/* Order Number Box */}
        <div className="bg-[#f8f9fe] border border-[#673de6]/30 rounded-2xl p-4 flex items-center justify-between">
          <div className="text-left">
            <span className="text-[10px] text-[#6b7280] uppercase font-bold block">Numéro de Commande :</span>
            <span className="text-lg font-mono font-black text-[#673de6]">{result.orderNumber}</span>
          </div>
          <button
            type="button"
            onClick={() => void handleCopyOrderNumber()}
            className="p-2 rounded-xl bg-white border border-[#e2e8f0] text-[#4b5563] hover:text-[#1d2130] shadow-xs transition-colors"
            title="Copier le numéro"
            aria-label="Copier le numéro de commande"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
        {copyStatus && <p className="text-xs font-semibold text-[#6b7280]" role="status">{copyStatus}</p>}

        {/* Details */}
        <div className="bg-[#f8f9fe] border border-[#eef0f6] rounded-2xl p-3.5 text-xs text-[#374151] space-y-1.5 text-left">
          <div className="flex justify-between">
            <span className="text-[#6b7280]">Client :</span>
            <span className="font-bold text-[#1d2130]">{result.customer.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6b7280]">Gouvernorat :</span>
            <span className="font-bold text-[#1d2130]">{result.customer.city}</span>
          </div>
          <div className="flex justify-between pt-1.5 border-t border-[#e2e8f0] font-extrabold">
            <span className="text-[#1d2130]">Total à régler :</span>
            <span className="text-[#673de6] text-sm">{result.totalTND.toFixed(2)} DT</span>
          </div>
        </div>

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
          className="w-full bg-[#f4f5fa] hover:bg-[#e5e7eb] text-[#1d2130] font-semibold py-3 px-4 rounded-xl text-xs border border-[#e2e8f0] transition-colors"
        >
          Retourner à l'accueil
        </button>

      </div>
    </div>
  );
};
