import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, LocateFixed } from './QatafoIcons';
import { AppHeader } from '../design/AppHeader';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { CustomerAddress, CustomerCardInitiation, CustomerInfo, CustomerSession, OrderResult } from '../types';
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
const PAYMENT_METHOD_IMAGES: Record<CheckoutPaymentMethod, string> = {
  CARD: '/media/payments/card.png',
  FLOUCI: '/media/payments/flouci.png',
  BANK_TRANSFER: '/media/payments/bank-transfer.png',
  POSTE: '/media/payments/poste.png',
};

const GOVERNORATES_AR: Record<string, string> = {
  Tunis: 'تونس',
  Ariana: 'أريانة',
  'Ben Arous': 'بن عروس',
  'La Manouba': 'منوبة',
  Nabeul: 'نابل',
  Zaghouan: 'زغوان',
  Bizerte: 'بنزرت',
  Béja: 'باجة',
  Jendouba: 'جندوبة',
  'Le Kef': 'الكاف',
  Siliana: 'سليانة',
  Sousse: 'سوسة',
  Monastir: 'المنستير',
  Mahdia: 'المهدية',
  Sfax: 'صفاقس',
  Kairouan: 'القيروان',
  Kasserine: 'القصرين',
  'Sidi Bouzid': 'سيدي بوزيد',
  Gabès: 'قابس',
  Médenine: 'مدنين',
  Tataouine: 'تطاوين',
  Gafsa: 'قفصة',
  Tozeur: 'توزر',
  Kébili: 'قبلي',
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
    paymentMethod: '',
    latitude: null,
    longitude: null,
    termsAccepted: false,
    locale: locale === 'ar' ? 'ar-TN' : 'fr-TN',
  });
  const [governorates, setGovernorates] = useState(TUNISIAN_GOVERNORATES_FR);
  const [depositInfo, setDepositInfo] = useState({ percent: 20, cardDiscountPercent: 5, companyName: 'AYROVI', bankRib: '', posteAccount: '', flouciNumber: '', reviewDelay: '', unavailableRefundPolicy: '', cardGatewayAvailable: false });
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
            cardGatewayAvailable: Boolean(payload.data?.capabilities?.cardGateway),
          });
        }
        const cardReady = Boolean(payload.data?.capabilities?.cardGateway);
        const bankReady = Boolean(String(payload.data?.deposit?.bankRib || '').trim());
        const posteReady = Boolean(String(payload.data?.deposit?.posteAccount || '').trim());
        setGovernorates(configuredGovernorates);
        setFormData((current) => {
          const currentMethod = current.paymentMethod.toUpperCase();
          const currentReady = (currentMethod === 'CARD' && cardReady)
            || (currentMethod === 'BANK_TRANSFER' && bankReady)
            || (currentMethod === 'POSTE' && posteReady);
          return {
            ...current,
            city: configuredGovernorates.includes(current.city) ? current.city : configuredGovernorates[0],
            paymentMethod: currentReady ? current.paymentMethod : cardReady ? 'card' : bankReady ? 'bank_transfer' : posteReady ? 'poste' : '',
          };
        });
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

  const isPaymentMethodAvailable = (method: CheckoutPaymentMethod) => method === 'CARD'
    ? depositInfo.cardGatewayAvailable
    : method === 'BANK_TRANSFER'
      ? Boolean(depositInfo.bankRib.trim())
      : method === 'POSTE'
        ? Boolean(depositInfo.posteAccount.trim())
        : false; // Flouci/D17 stays visible but cannot be selected without a real gateway.
  const hasAvailablePaymentMethod = PAYMENT_METHODS.some((method) => isPaymentMethodAvailable(method));
  const depositBase = Math.round(totalTND * depositInfo.percent / 100 * 1000) / 1000;
  const depositDiscount = formData.paymentMethod.toUpperCase() === 'CARD' && isPaymentMethodAvailable('CARD')
    ? Math.round(depositBase * depositInfo.cardDiscountPercent / 100 * 1000) / 1000
    : 0;
  const selectedDepositAmount = Math.max(0, Math.round((depositBase - depositDiscount) * 1000) / 1000);

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
    const selectedPaymentCode = formData.paymentMethod.toUpperCase();
    const paymentDeferred = !hasAvailablePaymentMethod;
    const selectedMethod: CheckoutPaymentMethod | 'PENDING_SELECTION' = paymentDeferred
      ? 'PENDING_SELECTION'
      : selectedPaymentCode as CheckoutPaymentMethod;
    if (!paymentDeferred && (!PAYMENT_METHODS.includes(selectedMethod as CheckoutPaymentMethod) || !isPaymentMethodAvailable(selectedMethod as CheckoutPaymentMethod))) {
      setPaymentAvailabilityNotice(tr(
        'Choisissez un moyen de paiement réellement disponible. Flouci/D17 reste désactivé tant qu’aucune passerelle réelle n’est configurée.',
        'اختر وسيلة دفع متاحة فعليًا. تبقى Flouci/D17 معطلة إلى حين ضبط بوابة دفع حقيقية.',
      ));
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      // The order remains the payment authority: create it first, then bind the
      // method/transaction to its backend ID from this payment step.
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

      const orderResult: OrderResult = {
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        customer: { ...formData, paymentMethod: selectedMethod.toLowerCase(), locale: locale === 'ar' ? 'ar-TN' : 'fr-TN' },
        totalTND: data.totalTND || totalTND,
        itemCount,
        breakdown: data.breakdown,
        deposit: data.deposit ? { ...data.deposit, method: selectedMethod } : null,
        message: data.message || tr('Votre commande a été enregistrée avec succès chez AYROVI !', 'تم تسجيل طلبك بنجاح لدى AYROVI!'),
      };

      if (selectedMethod === 'PENDING_SELECTION') {
        orderResult.message = tr(
          'Commande créée. Aucun moyen réel n’est configuré actuellement; vous pourrez régler l’acompte depuis Mes commandes dès son activation.',
          'تم إنشاء الطلب. لا توجد وسيلة دفع حقيقية مضبوطة حاليًا؛ يمكنك دفع العربون من طلباتي بعد تفعيلها.',
        );
        onOrderSuccess(orderResult);
        return;
      }

      try {
        if (selectedMethod === 'CARD') {
          const initiated = await customerApi<{ data: CustomerCardInitiation }>(
            `/api/customer/account/orders/${encodeURIComponent(data.orderId)}/payments/card/initiate`,
            { method: 'POST', body: '{}' }, customerSession.csrfToken,
          );
          orderResult.deposit = {
            ...(orderResult.deposit || { percent: depositInfo.percent, status: 'PENDING' }),
            amountTnd: initiated.data.amountTnd,
            balanceTnd: Math.max(0, Number(orderResult.totalTND) - initiated.data.amountTnd),
            method: 'CARD',
          };
          onOrderSuccess(orderResult);
          window.location.assign(initiated.data.payUrl);
          return;
        }

        const selected = await customerApi<{ data: { method: CheckoutPaymentMethod; quote: { percent: number; amountTnd: number; balanceTnd: number } } }>(
          `/api/customer/account/orders/${encodeURIComponent(data.orderId)}/deposit/method`,
          { method: 'POST', body: JSON.stringify({ method: selectedMethod }) }, customerSession.csrfToken,
        );
        orderResult.deposit = {
          ...(orderResult.deposit || { status: 'PENDING' }),
          percent: selected.data.quote.percent,
          amountTnd: selected.data.quote.amountTnd,
          balanceTnd: selected.data.quote.balanceTnd,
          method: selectedMethod,
        };
        orderResult.message = tr(
          'Commande créée. Envoyez maintenant le justificatif du paiement manuel depuis Mon compte → Mes commandes.',
          'تم إنشاء الطلب. أرسل الآن إثبات الدفع اليدوي من حسابي ← طلباتي.',
        );
        onOrderSuccess(orderResult);
      } catch (paymentError: any) {
        // Checkout is never repeated after the cart was consumed. The persisted
        // order stays accessible so the customer can safely retry from the profile.
        orderResult.message = tr(
          `Commande créée, mais le paiement n’a pas démarré : ${paymentError.message || 'service indisponible'}. Réessayez depuis Mes commandes.`,
          `تم إنشاء الطلب لكن الدفع لم يبدأ: ${paymentError.message || 'الخدمة غير متاحة'}. أعد المحاولة من طلباتي.`,
        );
        onOrderSuccess(orderResult);
      }
    } catch (err: any) {
      console.error('[Checkout Error]', err);
      setError(err.message || tr('Une erreur est survenue lors de la création de la commande.', 'حدث خطأ أثناء إنشاء الطلب.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <CheckoutFlowShell
      direction={direction}
      size="form"
      ariaLabel={isPaymentStage ? tr('Paiement', 'الدفع') : tr('Livraison', 'التوصيل')}
    >
        <AppHeader
          title={isPaymentStage ? tr('Paiement', 'الدفع') : tr('Livraison', 'التوصيل')}
          subtitle={isPaymentStage ? tr('Choisissez comment régler l’acompte', 'اختر طريقة دفع العربون') : tr('Livraison dans toute la Tunisie', 'توصيل إلى كامل تونس')}
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
              
              <span>{tr('Gouvernorat :', 'الولاية:')}</span>
            </label>
            <select
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              className="w-full bg-surface border border-line focus:border-brand rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-ink focus:outline-none font-semibold"
            >
              {governorates.map((gov) => (
                <option key={gov} value={gov}>
                  {locale === 'ar' ? (GOVERNORATES_AR[gov] || gov) : gov}
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

          <div className="checkout-flow-actions grid grid-cols-2 gap-2">
            <button type="button" onClick={onClose} className="ay-btn-secondary min-w-0 px-2 text-xs">{tr('Retour au panier', 'العودة إلى السلة')}</button>
            <button type="button" onClick={handleDeliveryContinue} className="ay-btn-cta min-w-0 px-2 text-xs">{tr('Continuer vers le paiement', 'المتابعة إلى الدفع')}</button>
          </div>
          </>}

          {isPaymentStage && <>
          <section>
            <label className="mb-2 flex items-center gap-1.5 text-xs font-bold text-muted">
              
              <span>{tr('Mode de paiement de l’acompte', 'طريقة دفع العربون')}</span>
            </label>
            <div className="checkout-payment-grid">
              {PAYMENT_METHODS.map((method) => {
                const available = isPaymentMethodAvailable(method);
                const selected = formData.paymentMethod.toUpperCase() === method;
                const meta: Record<CheckoutPaymentMethod, { label: string; hint: string }> = {
                  CARD: {
                    label: tr('Visa / Mastercard', 'Visa / Mastercard'),
                    hint: available ? tr('Paiement immédiat sécurisé', 'دفع فوري وآمن') : tr('Passerelle non configurée', 'بوابة الدفع غير مضبوطة'),
                  },
                  FLOUCI: { label: 'Flouci / D17', hint: tr('En attente d’une passerelle réelle', 'في انتظار بوابة دفع حقيقية') },
                  BANK_TRANSFER: {
                    label: tr('Virement bancaire', 'تحويل بنكي'),
                    hint: available ? tr('Justificatif depuis le profil', 'الإثبات من الحساب') : tr('RIB non publié', 'لم يتم نشر RIB'),
                  },
                  POSTE: {
                    label: tr('Transfert postal', 'تحويل بريدي'),
                    hint: available ? tr('Justificatif depuis le profil', 'الإثبات من الحساب') : tr('Compte postal non publié', 'الحساب البريدي غير منشور'),
                  },
                };
                return <button key={method} type="button" aria-disabled={!available} aria-pressed={selected} onClick={() => {
                  if (!available) {
                    setPaymentAvailabilityNotice(method === 'FLOUCI'
                      ? tr('Flouci / D17 reste visible mais désactivé : aucune transaction ne sera simulée sans passerelle réelle.', 'Flouci / D17 ظاهرة لكنها معطلة: لن يتم إنشاء دفع وهمي دون بوابة حقيقية.')
                      : tr('Ce moyen sera activé dès que sa configuration officielle sera disponible.', 'ستُفعّل هذه الوسيلة عند توفر إعداداتها الرسمية.'));
                    return;
                  }
                  setPaymentAvailabilityNotice(''); setError(null);
                  setFormData({ ...formData, paymentMethod: method.toLowerCase() });
                }} className={`checkout-payment-option rounded-xl border transition-all ${selected ? 'border-brand bg-brand/10 text-brand' : available ? 'border-line bg-surface text-muted hover:border-brand/50' : 'border-line bg-surface text-muted'}`}>
                  <span className="checkout-payment-logo-frame"><img src={PAYMENT_METHOD_IMAGES[method]} alt="" className="checkout-payment-logo" /></span>
                  <span className="block text-xs font-black leading-tight">{meta[method].label}</span>
                  {!available&&<span className="checkout-payment-badge">{tr('Indisponible', 'غير متاح')}</span>}
                  <span className="block text-[9px] font-semibold leading-tight opacity-80">{meta[method].hint}</span>
                </button>;
              })}
            </div>
            {!hasAvailablePaymentMethod&&<p className="mt-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-[11px] font-bold leading-5 text-warning">{tr('Aucun moyen réel n’est configuré. Vous pouvez quand même créer la commande; le paiement restera en attente dans votre profil.', 'لا توجد وسيلة دفع حقيقية مضبوطة. يمكنك إنشاء الطلب وسيبقى الدفع في الانتظار داخل حسابك.')}</p>}
            {paymentAvailabilityNotice&&<p className="mt-2 flex items-start gap-2 rounded-xl border border-accent bg-accent/10 p-3 text-[11px] font-bold leading-5 text-ink" role="status"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning"/><span>{paymentAvailabilityNotice}</span></p>}
            {formData.paymentMethod.toUpperCase()==='CARD'&&<p className="mt-2 rounded-xl border border-brand/20 bg-brand/5 p-3 text-[11px] leading-5 text-brand-dark">{tr('La commande est créée puis la page sécurisée Visa/Mastercard s’ouvre. AYROVI confirme le paiement uniquement après vérification serveur de Konnect.', 'يُنشأ الطلب ثم تُفتح صفحة Visa/Mastercard الآمنة. لا تؤكد AYROVI الدفع إلا بعد تحقق الخادم من Konnect.')}</p>}
            {formData.paymentMethod.toUpperCase()==='BANK_TRANSFER'&&<p className="mt-2 rounded-xl border border-brand/20 bg-brand/5 p-3 text-[11px] leading-5 text-brand-dark"><strong>{depositInfo.companyName}</strong><span className="mt-1 block break-all">RIB : {depositInfo.bankRib}</span><span className="mt-1 block">{tr('Après le virement, téléversez le justificatif depuis Mon compte → Mes commandes. Le téléversement ne confirme pas le paiement.', 'بعد التحويل ارفع الإثبات من حسابي ← طلباتي. رفع الإثبات لا يعني تأكيد الدفع.')}</span></p>}
            {formData.paymentMethod.toUpperCase()==='POSTE'&&<p className="mt-2 rounded-xl border border-brand/20 bg-brand/5 p-3 text-[11px] leading-5 text-brand-dark"><strong>{depositInfo.companyName}</strong><span className="mt-1 block break-all">{tr('Compte postal', 'الحساب البريدي')} : {depositInfo.posteAccount}</span><span className="mt-1 block">{tr('Après le versement, téléversez le justificatif depuis Mon compte → Mes commandes. Le téléversement ne confirme pas le paiement.', 'بعد الإيداع ارفع الإثبات من حسابي ← طلباتي. رفع الإثبات لا يعني تأكيد الدفع.')}</span></p>}
          </section>
          <div className="checkout-payment-summary rounded-xl border border-line bg-surface p-3.5 text-xs space-y-1.5">
            <div className="flex justify-between"><span className="text-muted">{tr('Produits convertis', 'قيمة المنتجات')}</span><strong>{formatMoney(breakdown.subtotal)}</strong></div>
            {breakdown.customs > 0 && <div className="flex justify-between"><span className="text-muted">{tr('Douane', 'المعاليم الديوانية')}</span><strong>{formatMoney(breakdown.customs)}</strong></div>}
            <div className="flex justify-between"><span className="text-muted">{tr('Livraison', 'التوصيل')}</span><strong>{formatMoney(breakdown.shipping)}</strong></div>
            <div className="flex justify-between"><span className="text-muted">{tr('Service AYROVI', 'خدمة AYROVI')}</span><strong>{formatMoney(breakdown.service)}</strong></div>
            {breakdown.express > 0 && <div className="flex justify-between"><span className="text-muted">{tr('Express', 'السريع')}</span><strong>{formatMoney(breakdown.express)}</strong></div>}
            {breakdown.discount > 0 && <div className="flex justify-between text-success"><span>{tr('Réduction', 'التخفيض')}</span><strong>−{formatMoney(breakdown.discount)}</strong></div>}
            <div className="flex justify-between border-t border-line pt-2 text-sm font-black"><span>{tr('Total de la commande', 'إجمالي الطلب')}</span><strong className="text-brand">{formatMoney(totalTND)}</strong></div>
            <div className="flex justify-between border-t border-line pt-2"><span className="font-bold text-accent-deep">{tr(`Acompte (${depositInfo.percent}%)`, `العربون (${depositInfo.percent}%)`)}</span><strong className="text-accent-deep">{formatMoney(selectedDepositAmount)}</strong></div>
            {depositDiscount>0&&<div className="flex justify-between text-success"><span>{tr('Remise carte sur l’acompte', 'تخفيض البطاقة على العربون')}</span><strong>−{formatMoney(depositDiscount)}</strong></div>}
            <div className="flex justify-between"><span className="text-muted">{tr('Solde restant après acompte', 'المتبقي بعد العربون')}</span><strong>{formatMoney(Math.max(0,totalTND-selectedDepositAmount))}</strong></div>
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-line bg-white p-3 text-xs leading-5 text-ink">
            <input type="checkbox" required checked={formData.termsAccepted} onChange={(event) => setFormData({ ...formData, termsAccepted: event.target.checked })} className="mt-0.5 h-5 w-5 shrink-0 accent-brand" />
            <span>{tr("J’accepte les ", 'أوافق على ')}<a href="/terms.html" target="_blank" rel="noopener noreferrer" className="font-black text-brand underline">{tr('conditions générales de vente et la politique de retour', 'شروط البيع وسياسة الإرجاع')}</a>.</span>
          </label>
          <div className="checkout-flow-actions grid grid-cols-2 gap-2">
            <button type="button" onClick={() => navigation.back()} disabled={isLoading} className="ay-btn-secondary min-w-0 px-2 text-xs">{tr('Retour', 'رجوع')}</button>
            <button type="submit" disabled={isLoading || !formData.termsAccepted || (hasAvailablePaymentMethod&&!isPaymentMethodAvailable(formData.paymentMethod.toUpperCase() as CheckoutPaymentMethod)) || !(customerSession?.account.emailVerified || customerSession?.account.phoneVerified)} className="ay-btn-cta min-w-0 px-2 text-xs sm:text-sm">
              {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" />{tr('Création…', 'جارٍ الإنشاء…')}</> : <><CheckCircle2 className="h-4 w-4" />{!hasAvailablePaymentMethod?tr('Créer la commande','إنشاء الطلب'):formData.paymentMethod.toUpperCase()==='CARD'?tr('Créer et payer','إنشاء ودفع'):tr('Créer puis continuer','إنشاء ثم متابعة')}</>}
            </button>
          </div>
          </>}
        </form>
    </CheckoutFlowShell>
  );
};
