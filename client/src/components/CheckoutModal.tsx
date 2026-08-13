import React, { useEffect, useState } from 'react';
import { X, AlertCircle, CheckCircle2, Truck, Loader2, Phone, MapPin, User, CreditCard } from './QatafoIcons';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { CustomerAddress, CustomerInfo, CustomerSession, OrderResult } from '../types';
import { getSessionId } from '../utils/session';
import { customerApi } from '../customer/api';
import { getCommerceConfig } from '../services/publicApi';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalTND: number;
  itemCount: number;
  customerSession: CustomerSession | null;
  onRequireAuthentication: () => void;
  onOrderSuccess: (result: OrderResult) => void;
}

const TUNISIAN_GOVERNORATES_FR = [
  'Tunis',
  'Ariana',
  'Ben Arous',
  'La Manouba',
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
  customerSession,
  onRequireAuthentication,
  onOrderSuccess,
}) => {
  const [formData, setFormData] = useState<CustomerInfo>({
    name: '',
    phone: '',
    city: TUNISIAN_GOVERNORATES_FR[0],
    address: '',
    paymentMethod: 'card',
  });
  const [governorates, setGovernorates] = useState(TUNISIAN_GOVERNORATES_FR);
  const [paymentMethods, setPaymentMethods] = useState(['CARD', 'FLOUCI', 'BANK_TRANSFER', 'POSTE']);
  const [depositInfo, setDepositInfo] = useState({ percent: 20, cardDiscountPercent: 5, companyName: 'AYROVI', bankRib: '', posteAccount: '', flouciNumber: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isLoading) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    getCommerceConfig()
      .then((payload) => {
        if (!active) return;
        const configuredGovernorates = Array.isArray(payload.data?.governorates) && payload.data.governorates.length
          ? payload.data.governorates.map(String)
          : TUNISIAN_GOVERNORATES_FR;
        const configuredMethods = Array.isArray(payload.data?.paymentMethods)
          ? payload.data.paymentMethods.map((method: unknown) => String(method).toUpperCase()).filter((method: string) => ['CARD', 'FLOUCI', 'BANK_TRANSFER', 'POSTE'].includes(method))
          : [];
        const methods = configuredMethods.length ? configuredMethods : ['CARD', 'FLOUCI', 'BANK_TRANSFER', 'POSTE'];
        if (payload.data?.deposit && typeof payload.data.deposit === 'object') {
          const d = payload.data.deposit;
          setDepositInfo({
            percent: Number(d.percent) > 0 ? Number(d.percent) : 20,
            cardDiscountPercent: Number.isFinite(Number(d.cardDiscountPercent)) ? Number(d.cardDiscountPercent) : 5,
            companyName: String(d.companyName || 'AYROVI'),
            bankRib: String(d.bankRib || ''),
            posteAccount: String(d.posteAccount || ''),
            flouciNumber: String(d.flouciNumber || ''),
          });
        }
        setGovernorates(configuredGovernorates);
        setPaymentMethods(methods);
        setFormData((current) => ({
          ...current,
          city: configuredGovernorates.includes(current.city) ? current.city : configuredGovernorates[0],
          paymentMethod: methods.includes(current.paymentMethod.toUpperCase()) ? current.paymentMethod : methods[0].toLowerCase(),
        }));
      })
      .catch((fetchError) => {
        if (fetchError?.name !== 'AbortError') console.warn('[Checkout Config Error]', fetchError);
      });
    return () => {
      active = false;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isLoading, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    if (!customerSession) {
      setAddresses([]);
      setSelectedAddressId('');
      onRequireAuthentication();
      return;
    }
    let active = true;
    setError(null);
    setAddresses([]);
    setSelectedAddressId('');
    setFormData((current) => ({
      name: customerSession.account.displayName,
      phone: customerSession.account.phone || '',
      city: governorates.includes(current.city) ? current.city : governorates[0],
      address: '',
      paymentMethod: current.paymentMethod,
    }));
    customerApi<any>('/api/customer/account/addresses')
      .then((result) => {
        if (!active) return;
        const nextAddresses = Array.isArray(result.data) ? result.data : [];
        setAddresses(nextAddresses);
        const preferred = nextAddresses.find((address: CustomerAddress) => Boolean(address.is_default)) || nextAddresses[0];
        if (preferred) {
          setSelectedAddressId(preferred.id);
          setFormData((current) => ({
            ...current,
            name: preferred.recipient_name || current.name,
            phone: preferred.phone || current.phone || customerSession.account.phone || '',
            city: preferred.governorate || current.city,
            address: [preferred.address_line, preferred.city, preferred.postal_code].filter(Boolean).join(', '),
          }));
        }
      })
      .catch(() => { if (active) setAddresses([]); });
    return () => { active = false; };
  }, [isOpen, customerSession?.account.id]);

  const chooseAddress = (address: CustomerAddress) => {
    setSelectedAddressId(address.id);
    setFormData((current) => ({
      ...current,
      name: address.recipient_name || current.name,
      phone: address.phone || current.phone || customerSession?.account.phone || '',
      city: address.governorate || current.city,
      address: [address.address_line, address.city, address.postal_code].filter(Boolean).join(', '),
    }));
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!customerSession) {
      onRequireAuthentication();
      return;
    }

    if (!formData.name.trim() || !formData.phone.trim() || !formData.address.trim()) {
      setError('Veuillez remplir tous les champs obligatoires pour assurer une livraison rapide.');
      return;
    }

    let phoneDigits = formData.phone.replace(/\D/g, '');
    if (phoneDigits.startsWith('00216')) phoneDigits = phoneDigits.slice(5);
    else if (phoneDigits.startsWith('216') && phoneDigits.length === 11) phoneDigits = phoneDigits.slice(3);
    if (!/^[24579]\d{7}$/.test(phoneDigits)) {
      setError('Numéro tunisien invalide : 8 chiffres commençant par 2, 4, 5, 7 ou 9 (ex : 98 123 456).');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': getSessionId(),
          'x-csrf-token': customerSession.csrfToken,
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-xs sm:p-6" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
      <div className="relative w-full max-w-lg bg-white border border-line rounded-3xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-line flex items-center justify-between bg-surface">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 id="checkout-title" className="text-base sm:text-lg font-bold text-ink">Finaliser la Commande</h3>
              <p className="text-xs text-muted font-medium">Livraison express dans toute la Tunisie</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-2 rounded-xl text-muted hover:text-ink hover:bg-line transition-colors disabled:cursor-not-allowed disabled:opacity-40"
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

          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Commande liée au compte {customerSession?.account.displayName}. Aucune vérification SMS n’est requise.
          </div>

          {addresses.length > 0 && (
            <div>
              <label className="mb-2 block text-xs font-bold text-muted">Choisir une adresse enregistrée :</label>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {addresses.map((address) => (
                  <button key={address.id} type="button" onClick={() => chooseAddress(address)} className={`min-w-[160px] border p-3 text-left text-xs transition ${selectedAddressId === address.id ? 'border-brand bg-[#f2eeff] text-brand-dark' : 'border-slate-200 bg-white text-slate-600'}`}>
                    <strong className="block">{address.label}{address.is_default ? ' · Par défaut' : ''}</strong>
                    <span className="mt-1 block truncate">{address.address_line}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-bold text-muted mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-brand" />
              <span>Nom et Prénom :</span>
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex : Anis Ben Ammar"
              className="w-full bg-surface border border-line focus:border-brand rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-ink focus:outline-none placeholder:text-muted font-semibold"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-bold text-muted mb-1.5 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-brand" />
              <span>Numéro de Téléphone (pour la livraison) :</span>
            </label>
            <input
              type="tel"
              required
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/[^\d+\s]/g, '').slice(0, 17) })}
              inputMode="tel"
              autoComplete="tel"
              placeholder="+216 98 123 456"
              className="w-full bg-surface border border-line focus:border-brand rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-ink focus:outline-none placeholder:text-muted font-mono font-semibold"
            />
            <p className="mt-1 text-[10px] text-muted font-semibold">
              Utilisé pour cette livraison uniquement — vous pouvez le modifier (8 chiffres, ex : 98 123 456).
            </p>
          </div>

          {/* Governorate */}
          <div>
            <label className="block text-xs font-bold text-muted mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-brand" />
              <span>Gouvernorat :</span>
            </label>
            <select
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              className="w-full bg-surface border border-line focus:border-brand rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-ink focus:outline-none font-semibold"
            >
              {governorates.map((gov) => (
                <option key={gov} value={gov}>
                  {gov}
                </option>
              ))}
            </select>
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-bold text-muted mb-1.5">
              Adresse complète, Ville et Code Postal :
            </label>
            <textarea
              required
              rows={2}
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Ex : Ennasr 2, Rue Hédi Nouira, Résidence l'Espoir Apt 4"
              className="w-full bg-surface border border-line focus:border-brand rounded-xl px-3.5 py-2 text-xs sm:text-sm text-ink focus:outline-none placeholder:text-muted font-semibold resize-none"
            />
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-xs font-bold text-muted mb-1.5 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-brand" />
              <span>Mode de paiement de l’acompte :</span>
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {paymentMethods.map((method) => {
                const value = method.toLowerCase();
                const META: Record<string, { label: string; hint: string }> = {
                  CARD: { label: 'Carte bancaire', hint: `−${depositInfo.cardDiscountPercent}% · confirmation immédiate` },
                  FLOUCI: { label: 'Flouci / D17', hint: 'Puis envoyez la capture' },
                  BANK_TRANSFER: { label: 'Virement', hint: 'Puis envoyez le reçu' },
                  POSTE: { label: 'Mandat poste', hint: 'Puis envoyez le reçu' },
                };
                const meta = META[method] || { label: method, hint: '' };
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setFormData({ ...formData, paymentMethod: value })}
                    className={`py-2.5 px-2 rounded-xl border text-center transition-all ${
                      formData.paymentMethod === value
                        ? 'border-brand bg-brand/10 text-brand'
                        : 'border-line bg-surface text-muted'
                    }`}
                  >
                    <span className="block text-xs font-bold">{meta.label}</span>
                    <span className="mt-0.5 block text-[9px] font-semibold opacity-75">{meta.hint}</span>
                  </button>
                );
              })}
            </div>
            {/* تعليمات الطريقة المختارة + العربون (خصم البطاقة مُطبَّق) */}
            {(() => {
              const base = Math.round(((totalTND * depositInfo.percent) / 100) * 1000) / 1000;
              const method = formData.paymentMethod.toUpperCase();
              const discount = method === 'CARD' ? Math.round((base * depositInfo.cardDiscountPercent) / 100 * 1000) / 1000 : 0;
              const deposit = Math.round((base - discount) * 1000) / 1000;
              const instructions: Record<string, string> = {
                CARD: `Payez ${deposit.toFixed(3)} DT par carte bancaire (remise −${depositInfo.cardDiscountPercent}% : −${discount.toFixed(3)} DT) : votre commande est confirmée immédiatement, avec facture électronique (e-mail + téléchargement) et code de suivi.`,
                FLOUCI: `Envoyez ${deposit.toFixed(3)} DT via Flouci / D17 au ${depositInfo.flouciNumber || 'numéro communiqué par AYROVI'}, puis téléversez la capture d’écran depuis votre espace client.`,
                BANK_TRANSFER: `Effectuez un virement de ${deposit.toFixed(3)} DT au nom de ${depositInfo.companyName}${depositInfo.bankRib ? ` — RIB : ${depositInfo.bankRib}` : ''}, puis téléversez le reçu depuis votre espace client.`,
                POSTE: `Versez ${deposit.toFixed(3)} DT par mandat postal au nom de ${depositInfo.companyName}${depositInfo.posteAccount ? ` — compte : ${depositInfo.posteAccount}` : ''}, puis téléversez le reçu depuis votre espace client.`,
              };
              return (
                <p className="mt-2 rounded-xl border border-brand/20 bg-brand/5 p-3 text-[11px] leading-5 text-brand-dark">
                  {instructions[method] || ''} <strong>Votre commande n’est confirmée qu’après réception de l’acompte.</strong>
                </p>
              );
            })()}
          </div>

          {/* Summary Box */}
          <div className="bg-surface border border-line rounded-xl p-3.5 text-xs space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-muted font-semibold">Montant total de la commande :</span>
              <span className="text-base font-extrabold text-brand">{totalTND.toFixed(2)} DT</span>
            </div>
            {(() => {
              const isCard = formData.paymentMethod.toUpperCase() === 'CARD';
              const base = Math.round(((totalTND * depositInfo.percent) / 100) * 1000) / 1000;
              const discount = isCard ? Math.round((base * depositInfo.cardDiscountPercent) / 100 * 1000) / 1000 : 0;
              const deposit = Math.round((base - discount) * 1000) / 1000;
              const balance = Math.round((totalTND - deposit) * 1000) / 1000;
              return (<>
                <div className="flex justify-between items-center border-t border-line pt-1.5">
                  <span className="text-[#b45309] font-bold">Acompte à régler maintenant ({depositInfo.percent}%) :</span>
                  <span className="text-base font-extrabold text-[#b45309]">{deposit.toFixed(3)} DT</span>
                </div>
                {discount > 0 && <div className="flex justify-between items-center">
                  <span className="font-bold text-emerald-700">Remise carte bancaire (−{depositInfo.cardDiscountPercent}%) :</span>
                  <span className="font-extrabold text-emerald-700">−{discount.toFixed(3)} DT</span>
                </div>}
                <div className="flex justify-between items-center">
                  <span className="text-muted font-semibold">Solde restant à la livraison :</span>
                  <span className="font-extrabold text-ink">{balance.toFixed(3)} DT</span>
                </div>
              </>);
            })()}
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
