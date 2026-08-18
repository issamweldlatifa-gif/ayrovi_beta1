import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Phone, MapPin, User, CreditCard, Mail, LocateFixed } from './QatafoIcons';
import { AppHeader } from '../design/AppHeader';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { CustomerAddress, CustomerInfo, CustomerSession, OrderResult } from '../types';
import { getSessionId } from '../utils/session';
import { customerApi } from '../customer/api';
import { getCommerceConfig } from '../services/publicApi';
import { JourneyProgress } from './JourneyProgress';
import { useLocale } from '../i18n/LocaleContext';
import { useNavigationHistory } from '../navigation/NavigationHistory';
import { CheckoutFlowShell } from './CheckoutFlowShell';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalTND: number;
  itemCount: number;
  breakdown: { subtotal: number; customs: number; shipping: number; service: number; express: number; discount: number };
  customerSession: CustomerSession | null;
  onRequireAuthentication: () => void;
  onOrderSuccess: (result: OrderResult) => void;
}

type CheckoutPaymentMethod = 'CARD' | 'FLOUCI' | 'BANK_TRANSFER' | 'POSTE';

const PAYMENT_METHODS: CheckoutPaymentMethod[] = ['CARD', 'FLOUCI', 'BANK_TRANSFER', 'POSTE'];
const AVAILABLE_PAYMENT_METHODS = new Set<CheckoutPaymentMethod>(['BANK_TRANSFER', 'POSTE']);
const PAYMENT_METHOD_IMAGES: Record<CheckoutPaymentMethod, string> = {
  CARD: '/media/payments/card.png',
  FLOUCI: '/media/payments/flouci.png',
  BANK_TRANSFER: '/media/payments/bank-transfer.png',
  POSTE: '/media/payments/poste.png',
};

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
  breakdown,
  customerSession,
  onRequireAuthentication,
  onOrderSuccess,
}) => {
  const { tr, direction, locale, formatMoney } = useLocale();
  const navigation = useNavigationHistory();
  const isPaymentStage = navigation.stack.some((layer) => layer.id === 'checkout:payment');
  const [formData, setFormData] = useState<CustomerInfo>({
    name: '',
    email: '',
    phone: '',
    city: TUNISIAN_GOVERNORATES_FR[0],
    address: '',
    paymentMethod: 'pending_selection',
    latitude: null,
    longitude: null,
    termsAccepted: false,
    locale: locale === 'ar' ? 'ar-TN' : 'fr-TN',
  });
  const [governorates, setGovernorates] = useState(TUNISIAN_GOVERNORATES_FR);
  const [depositInfo, setDepositInfo] = useState({ percent: 20, cardDiscountPercent: 5, companyName: 'AYROVI', bankRib: '', posteAccount: '', flouciNumber: '', reviewDelay: '', unavailableRefundPolicy: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [paymentAvailabilityNotice, setPaymentAvailabilityNotice] = useState('');
  const [locating, setLocating] = useState(false);
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
        if (payload.data?.deposit && typeof payload.data.deposit === 'object') {
          const d = payload.data.deposit;
          setDepositInfo({
            percent: Number(d.percent) > 0 ? Number(d.percent) : 20,
            cardDiscountPercent: Number.isFinite(Number(d.cardDiscountPercent)) ? Number(d.cardDiscountPercent) : 5,
            companyName: String(d.companyName || 'AYROVI'),
            bankRib: String(d.bankRib || ''),
            posteAccount: String(d.posteAccount || ''),
            flouciNumber: String(d.flouciNumber || ''),
            reviewDelay: String(d.reviewDelay || ''),
            unavailableRefundPolicy: String(d.unavailableRefundPolicy || ''),
          });
        }
        setGovernorates(configuredGovernorates);
        setFormData((current) => ({
          ...current,
          city: configuredGovernorates.includes(current.city) ? current.city : configuredGovernorates[0],
          paymentMethod: 'pending_selection',
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
    setPaymentAvailabilityNotice('');
    setAddresses([]);
    setSelectedAddressId('');
    setFormData((current) => ({
      name: customerSession.account.displayName,
      email: customerSession.account.email || '',
      phone: customerSession.account.phone || '',
      city: governorates.includes(current.city) ? current.city : governorates[0],
      address: '',
      paymentMethod: current.paymentMethod,
      latitude: null,
      longitude: null,
      termsAccepted: false,
      locale: locale === 'ar' ? 'ar-TN' : 'fr-TN',
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
  }, [isOpen, customerSession?.account.id, locale]);

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

  const locateDelivery = () => {
    if (!navigator.geolocation) {
      setError(tr('La géolocalisation n’est pas prise en charge par ce navigateur.', 'المتصفح لا يدعم تحديد الموقع.'));
      return;
    }
    setLocating(true); setError(null);
    navigator.geolocation.getCurrentPosition((position) => {
      setFormData((current) => ({ ...current, latitude: position.coords.latitude, longitude: position.coords.longitude }));
      setLocating(false);
    }, () => {
      setError(tr('Impossible d’obtenir la position. Autorisez la localisation ou saisissez l’adresse manuellement.', 'تعذر تحديد الموقع. اسمح بالوصول إلى الموقع أو أدخل العنوان يدويًا.'));
      setLocating(false);
    }, { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 });
  };

  if (!isOpen) return null;

  const validateDelivery = () => {
    setError(null);
    if (!customerSession) {
      onRequireAuthentication();
      return false;
    }
    if (!customerSession.account.emailVerified && !customerSession.account.phoneVerified) {
      setError(tr('Vérifiez votre e-mail ou votre téléphone depuis votre compte avant de commander.', 'وثّق بريدك الإلكتروني أو هاتفك من الحساب قبل تأكيد الطلب.'));
      return false;
    }
    if (!formData.name.trim() || !formData.email.trim() || !formData.phone.trim() || !formData.address.trim()) {
      setError(tr('Veuillez remplir tous les champs obligatoires pour assurer une livraison rapide.', 'يرجى ملء جميع الحقول المطلوبة لضمان التوصيل.'));
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError(tr('Adresse e-mail invalide.', 'عنوان البريد الإلكتروني غير صالح.'));
      return false;
    }
    let phoneDigits = formData.phone.replace(/\D/g, '');
    if (phoneDigits.startsWith('00216')) phoneDigits = phoneDigits.slice(5);
    else if (phoneDigits.startsWith('216') && phoneDigits.length === 11) phoneDigits = phoneDigits.slice(3);
    if (!/^[24579]\d{7}$/.test(phoneDigits)) {
      setError(tr('Numéro tunisien invalide : 8 chiffres commençant par 2, 4, 5, 7 ou 9 (ex. 98 123 456).', 'رقم الهاتف التونسي غير صالح: 8 أرقام تبدأ بـ2 أو 4 أو 5 أو 7 أو 9 (مثال: 98 123 456).'));
      return false;
    }
    return true;
  };

  const handleDeliveryContinue = () => {
    if (validateDelivery()) navigation.pushLayer({ id: 'checkout:payment' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateDelivery() || !customerSession) return;
    if (!formData.termsAccepted) {
      setError(tr('Vous devez accepter les conditions de vente et la politique de retour.', 'يجب قبول شروط البيع وسياسة الإرجاع.'));
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
        body: JSON.stringify({ ...formData, paymentMethod: 'PENDING_SELECTION', locale: locale === 'ar' ? 'ar-TN' : 'fr-TN' }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        const localizedErrors: Record<string, string> = {
          CHECKOUT_EMAIL_INVALID: tr('Adresse e-mail de facturation invalide.', 'البريد الإلكتروني للفاتورة غير صالح.'),
          TERMS_REQUIRED: tr('Acceptez les conditions de vente et la politique de retour.', 'وافق على شروط البيع وسياسة الإرجاع.'),
          CONTACT_VERIFICATION_REQUIRED: tr('Vérifiez votre e-mail ou votre téléphone avant de confirmer.', 'وثّق بريدك الإلكتروني أو هاتفك قبل التأكيد.'),
          VERIFIED_EMAIL_REQUIRED: tr('Utilisez votre e-mail vérifié ou vérifiez votre téléphone.', 'استخدم بريدك الموثّق أو وثّق هاتفك.'),
          DELIVERY_LOCATION_INVALID: tr('La position de livraison est invalide.', 'موقع التوصيل غير صالح.'),
        };
        throw new Error(localizedErrors[String(data.code || '')] || data.error || tr('Une erreur est survenue lors de la validation.', 'حدث خطأ أثناء تأكيد الطلب.'));
      }

      onOrderSuccess({
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        customer: { ...formData, locale: locale === 'ar' ? 'ar-TN' : 'fr-TN' },
        totalTND: data.totalTND || totalTND,
        itemCount,
        breakdown: data.breakdown,
        deposit: data.deposit,
        message: data.message || tr('Votre commande a été enregistrée avec succès chez AYROVI !', 'تم تسجيل طلبك بنجاح لدى AYROVI!'),
      });
    } catch (err: any) {
      console.error('[Checkout Error]', err);
      setError(err.message || 'Une erreur est survenue lors de la validation de la commande.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <CheckoutFlowShell
      direction={direction}
      size="form"
      ariaLabel={isPaymentStage ? tr('Récapitulatif', 'المراجعة') : tr('Livraison', 'التوصيل')}
    >
        <AppHeader
          title={isPaymentStage ? tr('Récapitulatif', 'مراجعة الطلب') : tr('Livraison', 'التوصيل')}
          subtitle={isPaymentStage ? tr('La commande sera créée avant tout paiement', 'سيتم إنشاء الطلب قبل أي دفع') : tr('Livraison dans toute la Tunisie', 'توصيل إلى كامل تونس')}
          onBack={isPaymentStage ? () => navigation.back() : onClose}
          actionDisabled={isLoading}
          actionLabel={isPaymentStage ? tr('Revenir à la livraison', 'العودة إلى بيانات التوصيل') : tr('Revenir au panier', 'العودة إلى السلة')}
        />

        <JourneyProgress active={isPaymentStage ? 3 : 2} />

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="checkout-flow-content ay-safe-bottom space-y-4">
          {error && (
            <div className="bg-danger/5 border border-danger/20 rounded-xl p-3 text-xs text-danger font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!isPaymentStage && <>
          <div className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-bold ${customerSession?.account.emailVerified || customerSession?.account.phoneVerified ? 'border-brand/25 bg-brand/5 text-brand-dark' : 'border-accent bg-accent/10 text-ink'}`}>
            {customerSession?.account.emailVerified || customerSession?.account.phoneVerified ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            {customerSession?.account.emailVerified || customerSession?.account.phoneVerified
              ? tr(`Compte sécurisé par ${customerSession.account.phoneVerified ? 'téléphone vérifié' : 'e-mail vérifié'}.`, `الحساب مؤمّن عبر ${customerSession.account.phoneVerified ? 'هاتف موثّق' : 'بريد إلكتروني موثّق'}.`)
              : tr('Vérifiez votre e-mail ou votre téléphone avant de confirmer.', 'وثّق البريد الإلكتروني أو الهاتف قبل تأكيد الطلب.')}
          </div>

          {addresses.length > 0 && (
            <div>
              <label className="mb-2 block text-xs font-bold text-muted">{tr('Choisir une adresse enregistrée :', 'اختيار عنوان محفوظ:')}</label>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {addresses.map((address) => (
                  <button key={address.id} type="button" onClick={() => chooseAddress(address)} className={`min-w-[160px] border p-3 text-left text-xs transition ${selectedAddressId === address.id ? 'border-brand bg-brand/5 text-brand-dark' : 'border-line bg-white text-muted'}`}>
                    <strong className="block">{address.label}{address.is_default ? ` · ${tr('Par défaut', 'الافتراضي')}` : ''}</strong>
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
              <span>{tr('Nom et prénom :', 'الاسم واللقب:')}</span>
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={tr('Ex. Anis Ben Ammar', 'مثال: أنيس بن عمار')}
              className="w-full bg-surface border border-line focus:border-brand rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-ink focus:outline-none placeholder:text-muted font-semibold"
            />
          </div>

          {/* Invoice e-mail */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-muted">
              <Mail className="h-3.5 w-3.5 text-brand" />
              <span>{tr('E-mail de facturation :', 'البريد الإلكتروني للفاتورة:')}</span>
            </label>
            <input
              type="email"
              required
              value={formData.email}
              readOnly={Boolean(customerSession?.account.emailVerified && !customerSession?.account.phoneVerified)}
              onChange={(e) => setFormData({ ...formData, email: e.target.value.slice(0, 254) })}
              autoComplete="email"
              inputMode="email"
              placeholder="vous@exemple.com"
              className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-xs font-semibold text-ink outline-none focus:border-brand read-only:bg-brand/5 sm:text-sm"
            />
            <p className="mt-1 text-[10px] font-semibold text-muted">{tr('La confirmation et la facture seront envoyées à cette adresse.', 'سيُرسل تأكيد الطلب والفاتورة إلى هذا العنوان.')}</p>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-bold text-muted mb-1.5 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-brand" />
              <span>{tr('Téléphone de livraison :', 'هاتف التوصيل:')}</span>
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
              {tr('Utilisé pour cette livraison uniquement — 8 chiffres, ex. 98 123 456.', 'يُستخدم لهذا التوصيل فقط — 8 أرقام، مثال: 98 123 456.')}
            </p>
          </div>

          {/* Governorate */}
          <div>
            <label className="block text-xs font-bold text-muted mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-brand" />
              <span>{tr('Gouvernorat :', 'الولاية:')}</span>
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
              {tr('Adresse complète, ville et code postal :', 'العنوان الكامل والمدينة والترقيم البريدي:')}
            </label>
            <textarea
              required
              rows={2}
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder={tr("Ex. Ennasr 2, rue Hédi Nouira, résidence l'Espoir, apt. 4", 'مثال: النصر 2، شارع الهادي نويرة، الإقامة، الشقة 4')}
              className="w-full bg-surface border border-line focus:border-brand rounded-xl px-3.5 py-2 text-xs sm:text-sm text-ink focus:outline-none placeholder:text-muted font-semibold resize-none"
            />
          </div>

          <button type="button" onClick={locateDelivery} disabled={locating} className="ay-btn-secondary w-full text-xs">
            {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
            {formData.latitude != null ? tr('Position ajoutée à la livraison', 'تمت إضافة الموقع إلى بيانات التوصيل') : tr('Ajouter ma position (optionnel)', 'إضافة موقعي (اختياري)')}
          </button>
          {formData.latitude != null && <p className="text-center text-[10px] font-bold text-brand">{formData.latitude.toFixed(5)}, {Number(formData.longitude).toFixed(5)}</p>}

          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onClose} className="ay-btn-secondary min-w-0 px-2 text-xs">{tr('Retour au panier', 'العودة إلى السلة')}</button>
            <button type="button" onClick={handleDeliveryContinue} className="ay-btn-primary min-w-0 px-2 text-xs">{tr('Vérifier la commande', 'مراجعة الطلب')}</button>
          </div>
          </>}

          {isPaymentStage && <>
          <section className="rounded-2xl border border-brand/20 bg-brand/5 p-4 text-xs leading-6 text-brand-dark">
            <CheckCircle2 className="mb-2 h-5 w-5 text-brand" />
            <strong className="block text-sm text-ink">{tr('Commande créée d’abord, paiement ensuite', 'إنشاء الطلب أولًا ثم الدفع')}</strong>
            <p>{tr('Après confirmation, la commande apparaît immédiatement dans Mon compte → Mes commandes avec son acompte calculé par le serveur. Vous choisirez alors carte bancaire ou virement bancaire/postal.', 'بعد التأكيد يظهر الطلب فورًا في حسابي ← طلباتي مع العربون المحسوب من الخادم. عندها تختار البطاقة البنكية أو التحويل البنكي/البريدي.')}</p>
          </section>
          <div className="checkout-payment-summary rounded-xl border border-line bg-surface p-3.5 text-xs space-y-1.5">
            <div className="flex justify-between"><span className="text-muted">{tr('Produits convertis', 'قيمة المنتجات')}</span><strong>{formatMoney(breakdown.subtotal)}</strong></div>
            {breakdown.customs > 0 && <div className="flex justify-between"><span className="text-muted">{tr('Douane', 'المعاليم الديوانية')}</span><strong>{formatMoney(breakdown.customs)}</strong></div>}
            <div className="flex justify-between"><span className="text-muted">{tr('Livraison', 'التوصيل')}</span><strong>{formatMoney(breakdown.shipping)}</strong></div>
            <div className="flex justify-between"><span className="text-muted">{tr('Service AYROVI', 'خدمة AYROVI')}</span><strong>{formatMoney(breakdown.service)}</strong></div>
            {breakdown.express > 0 && <div className="flex justify-between"><span className="text-muted">{tr('Express', 'السريع')}</span><strong>{formatMoney(breakdown.express)}</strong></div>}
            {breakdown.discount > 0 && <div className="flex justify-between text-success"><span>{tr('Réduction', 'التخفيض')}</span><strong>−{formatMoney(breakdown.discount)}</strong></div>}
            <div className="flex justify-between border-t border-line pt-2 text-sm font-black"><span>{tr('Total de la commande', 'إجمالي الطلب')}</span><strong className="text-brand">{formatMoney(totalTND)}</strong></div>
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-line bg-white p-3 text-xs leading-5 text-ink">
            <input type="checkbox" required checked={formData.termsAccepted} onChange={(event) => setFormData({ ...formData, termsAccepted: event.target.checked })} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
            <span>{tr("J’accepte les ", 'أوافق على ')}<a href="/terms.html" target="_blank" rel="noopener noreferrer" className="font-black text-brand underline">{tr('conditions générales de vente et la politique de retour', 'شروط البيع وسياسة الإرجاع')}</a>.</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => navigation.back()} disabled={isLoading} className="ay-btn-secondary min-w-0 px-2 text-xs">{tr('Retour', 'رجوع')}</button>
            <button type="submit" disabled={isLoading || !formData.termsAccepted || !(customerSession?.account.emailVerified || customerSession?.account.phoneVerified)} className="ay-btn-primary min-w-0 px-2 text-xs sm:text-sm">
              {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" />{tr('Création…', 'جارٍ الإنشاء…')}</> : <><CheckCircle2 className="h-4 w-4" />{tr('Créer la commande', 'إنشاء الطلب')}</>}
            </button>
          </div>
          </>}
        </form>
    </CheckoutFlowShell>
  );
};
