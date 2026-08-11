import React, { useEffect, useState } from 'react';
import { X, AlertCircle, CheckCircle2, Truck, Loader2, Phone, MapPin, User, CreditCard } from './QatafoIcons';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { CustomerInfo, OrderResult } from '../types';
import { getSessionId } from '../utils/session';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalTND: number;
  itemCount: number;
  onOrderSuccess: (result: OrderResult) => void;
}

const TUNISIAN_GOVERNORATES_FR = [
  'Tunis',
  'Ariana',
  'Ben Arous',
  'Manouba',
  'Nabeul',
  'Zaghouan',
  'Bizerte',
  'Béja',
  'Jendouba',
  'Le Kef',
  'Siliana',
  'Sousse',
  'Monastir',
  'Mahdia',
  'Sfax',
  'Kairouan',
  'Kasserine',
  'Sidi Bouzid',
  'Gabès',
  'Médenine',
  'Tataouine',
  'Gafsa',
  'Tozeur',
  'Kébili',
];

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  totalTND,
  itemCount,
  onOrderSuccess,
}) => {
  const [formData, setFormData] = useState<CustomerInfo>({
    name: '',
    phone: '',
    city: TUNISIAN_GOVERNORATES_FR[0],
    address: '',
    paymentMethod: 'cod',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isLoading) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim() || !formData.phone.trim() || !formData.address.trim()) {
      setError('Veuillez remplir tous les champs obligatoires pour assurer une livraison rapide.');
      return;
    }

    if (formData.phone.replace(/\D/g, '').length < 8) {
      setError('Veuillez renseigner un numéro de téléphone tunisien valide (8 chiffres).');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': getSessionId(),
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Une erreur est survenue lors de la validation.');
      }

      onOrderSuccess({
        orderNumber: data.orderNumber,
        customer: formData,
        totalTND: data.totalTND || totalTND,
        itemCount,
        message: data.message || 'Votre commande a été enregistrée avec succès chez AYROVI !',
      });
    } catch (err: any) {
      console.error('[Checkout Error]', err);
      setError(err.message || 'Une erreur est survenue lors de la validation de la commande.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
      <div className="relative w-full max-w-lg bg-white border border-[#e2e8f0] rounded-3xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-[#eef0f6] flex items-center justify-between bg-[#f8f9fe]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#673de6]/10 border border-[#673de6]/20 flex items-center justify-center text-[#673de6]">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 id="checkout-title" className="text-base sm:text-lg font-bold text-[#1d2130]">Finaliser la Commande</h3>
              <p className="text-xs text-[#6b7280] font-medium">Livraison express dans toute la Tunisie</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-2 rounded-xl text-[#6b7280] hover:text-[#1d2130] hover:bg-[#eef0f6] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Fermer la validation de commande"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-bold text-[#374151] mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#673de6]" />
              <span>Nom et Prénom :</span>
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex : Anis Ben Ammar"
              className="w-full bg-[#f8f9fe] border border-[#e2e8f0] focus:border-[#673de6] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[#1d2130] focus:outline-none placeholder:text-[#9ca3af] font-semibold"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-bold text-[#374151] mb-1.5 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-[#673de6]" />
              <span>Numéro de Téléphone (pour la livraison) :</span>
            </label>
            <input
              type="tel"
              required
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+216 98 123 456"
              className="w-full bg-[#f8f9fe] border border-[#e2e8f0] focus:border-[#673de6] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[#1d2130] focus:outline-none placeholder:text-[#9ca3af] font-mono font-semibold"
            />
          </div>

          {/* Governorate */}
          <div>
            <label className="block text-xs font-bold text-[#374151] mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#673de6]" />
              <span>Gouvernorat :</span>
            </label>
            <select
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              className="w-full bg-[#f8f9fe] border border-[#e2e8f0] focus:border-[#673de6] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[#1d2130] focus:outline-none font-semibold"
            >
              {TUNISIAN_GOVERNORATES_FR.map((gov) => (
                <option key={gov} value={gov}>
                  {gov}
                </option>
              ))}
            </select>
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-bold text-[#374151] mb-1.5">
              Adresse complète, Ville et Code Postal :
            </label>
            <textarea
              required
              rows={2}
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Ex : Ennasr 2, Rue Hédi Nouira, Résidence l'Espoir Apt 4"
              className="w-full bg-[#f8f9fe] border border-[#e2e8f0] focus:border-[#673de6] rounded-xl px-3.5 py-2 text-xs sm:text-sm text-[#1d2130] focus:outline-none placeholder:text-[#9ca3af] font-semibold resize-none"
            />
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-xs font-bold text-[#374151] mb-1.5 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-[#673de6]" />
              <span>Mode de paiement :</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, paymentMethod: 'cod' })}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  formData.paymentMethod === 'cod'
                    ? 'border-[#673de6] bg-[#673de6]/10 text-[#673de6]'
                    : 'border-[#e2e8f0] bg-[#f8f9fe] text-[#6b7280]'
                }`}
              >
                <span>À la livraison</span>
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, paymentMethod: 'd17' })}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  formData.paymentMethod === 'd17'
                    ? 'border-[#673de6] bg-[#673de6]/10 text-[#673de6]'
                    : 'border-[#e2e8f0] bg-[#f8f9fe] text-[#6b7280]'
                }`}
              >
                <span>D17 / Virement / Flouci</span>
              </button>
            </div>
          </div>

          {/* Summary Box */}
          <div className="bg-[#f8f9fe] border border-[#eef0f6] rounded-xl p-3.5 flex justify-between items-center text-xs">
            <span className="text-[#6b7280] font-semibold">Montant total dû à la réception :</span>
            <span className="text-base font-extrabold text-[#673de6]">{totalTND.toFixed(2)} DT</span>
          </div>

          {/* Submit CTA */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full hostinger-btn disabled:opacity-50 text-white font-bold py-3.5 px-6 rounded-2xl shadow-md flex items-center justify-center gap-2 text-xs sm:text-sm transition-all"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Confirmation de votre commande en cours...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirmer ma commande ({totalTND.toFixed(2)} DT)</span>
              </>
            )}
          </button>
        </form>

      </div>
    </div>
  );
};
