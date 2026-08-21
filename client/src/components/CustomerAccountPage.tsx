import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FcGoogle } from 'react-icons/fc';
import { FaFacebookF } from 'react-icons/fa6';
import {
  ArrowLeft, ArrowRight, Bell, Check, CheckCircle2, Heart, Home, Loader2, LogOut,
  MapPin, Package, Pencil, Phone, Plus, ShieldCheck, ShoppingBag, Trash2, User, X, Hourglass, AlertCircle, ArrowDown,
  CreditCard, ReceiptText, Truck, Moon, Settings, Lock, ScanSearch, FileText, ChevronRight, ExternalLink, RefreshCw,
} from './QatafoIcons';

import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import {
  CartItem,
  CustomerAccount,
  CustomerAccountOverview,
  CustomerAddress,
  CustomerCardInitiation,
  CustomerDelivery,
  CustomerFavorite,
  CustomerInvoice,
  CustomerNotification,
  CustomerOrderDetail,
  CustomerOrderHistoryEntry,
  CustomerOrderItem,
  CustomerOrderSummary,
  CustomerPayment,
  CustomerPaymentsOverview,
  CustomerPaymentProof,
  CustomerPaymentTransaction,
  CustomerPreferences,
  CustomerSecuritySummary,
  CustomerSession,
} from '../types';
import { customerApi } from '../customer/api';
import { getSessionId } from '../utils/session';
import { useNavigationHistory } from '../navigation/NavigationHistory';
import { useLocale } from '../i18n/LocaleContext';
import { AppHeader } from '../design/AppHeader';

interface CustomerAccountPageProps {
  isOpen: boolean;
  session: CustomerSession | null;
  initialSection?: Section;
  initialOrderId?: string;
  loadingSession: boolean;
  onClose: () => void;
  onSession: (session: CustomerSession) => void;
  onLoggedOut: () => void;
  onOpenCart: () => void;
  onCartChanged: () => void;
  initialMessage?: string;
}

type Section = 'home' | 'profile' | 'orders' | 'payments' | 'invoices' | 'tracking' | 'addresses' | 'favorites' | 'cart' | 'notifications' | 'appearance' | 'security' | 'settings' | 'lensHelp' | 'terms';
type AuthConfig = {
  phoneOtp: { enabled: boolean };
  google: { enabled: boolean };
  facebook: { enabled: boolean };
  checkoutRequiresAuthentication: boolean;
};

type AddressDraft = {
  id?: string;
  label: string;
  recipientName: string;
  phone: string;
  governorate: string;
  city: string;
  postalCode: string;
  addressLine: string;
  deliveryNotes: string;
  isDefault: boolean;
};

const emptyAddress: AddressDraft = {
  label: 'Maison', recipientName: '', phone: '', governorate: 'Tunis', city: '', postalCode: '',
  addressLine: '', deliveryNotes: '', isDefault: false,
};

const sectionItems: Array<{ id: Section; label: string; labelAr: string; icon: React.ComponentType<any> }> = [
  { id: 'home', label: 'Aperçu', labelAr: 'نظرة عامة', icon: Home },
  { id: 'profile', label: 'Informations personnelles', labelAr: 'المعلومات الشخصية', icon: User },
  { id: 'orders', label: 'Mes commandes', labelAr: 'طلباتي', icon: Package },
  { id: 'payments', label: 'Paiements & transactions', labelAr: 'المدفوعات والمعاملات', icon: CreditCard },
  { id: 'invoices', label: 'Factures', labelAr: 'الفواتير', icon: ReceiptText },
  { id: 'tracking', label: 'Suivi des colis', labelAr: 'تتبع الشحنات', icon: Truck },
  { id: 'addresses', label: 'Adresses', labelAr: 'العناوين', icon: MapPin },
  { id: 'favorites', label: 'Favoris', labelAr: 'المفضلة', icon: Heart },
  { id: 'cart', label: 'Panier', labelAr: 'السلة', icon: ShoppingBag },
  { id: 'notifications', label: 'Notifications', labelAr: 'الإشعارات', icon: Bell },
  { id: 'appearance', label: 'Mode sombre', labelAr: 'الوضع الداكن', icon: Moon },
  { id: 'security', label: 'Sécurité', labelAr: 'الأمان', icon: Lock },
  { id: 'settings', label: 'Paramètres', labelAr: 'الإعدادات', icon: Settings },
  { id: 'lensHelp', label: 'Aide AYROVIX Lens', labelAr: 'مساعدة عدسة AYROVIX', icon: ScanSearch },
  { id: 'terms', label: 'Conditions & confidentialité', labelAr: 'الشروط والخصوصية', icon: FileText },
];

const statusLabels: Record<string, string> = {
  CREATED: 'Créée', AWAITING_DEPOSIT: 'Acompte attendu', AWAITING_PAYMENT_VERIFICATION: 'Paiement à vérifier',
  CONFIRMED: 'Confirmée', PREPARING: 'En préparation', SHIPPED: 'Expédiée', IN_TRANSIT: 'En transit',
  OUT_FOR_DELIVERY: 'En livraison', DELIVERED: 'Livrée', CANCELLED: 'Annulée', PENDING: 'En attente',
  PENDING_VERIFICATION: 'En vérification', PAID: 'Payé', PARTIALLY_PAID: 'Partiellement payé', FAILED: 'Échec',
  REJECTED: 'Refusé', REFUNDED: 'Remboursé', APPROVED: 'Validé',
};
const statusLabelsAr: Record<string, string> = {
  CREATED: 'تم الإنشاء', AWAITING_DEPOSIT: 'في انتظار العربون', AWAITING_PAYMENT_VERIFICATION: 'التحقق من الدفع',
  CONFIRMED: 'مؤكد', PREPARING: 'قيد التجهيز', SHIPPED: 'تم الشحن', IN_TRANSIT: 'قيد النقل',
  OUT_FOR_DELIVERY: 'خرج للتوصيل', DELIVERED: 'تم التسليم', CANCELLED: 'ملغى', PENDING: 'قيد الانتظار',
  PENDING_VERIFICATION: 'قيد التحقق', PAID: 'مدفوع', PARTIALLY_PAID: 'مدفوع جزئيًا', FAILED: 'فشل',
  REJECTED: 'مرفوض', REFUNDED: 'مسترجع', APPROVED: 'مقبول',
};


function Status({ value }: { value: string }) {
  const { isArabic } = useLocale();
  const complete = ['DELIVERED', 'PAID', 'APPROVED'].includes(value);
  const cancelled = ['CANCELLED','FAILED','REJECTED'].includes(value);
  return <span className={`inline-flex px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${complete ? 'bg-brand/10 text-brand-dark' : cancelled ? 'bg-danger/5 text-danger' : 'bg-accent/15 text-ink'}`}>{(isArabic ? statusLabelsAr[value] : statusLabels[value]) || value.replaceAll('_', ' ')}</span>;
}

function Empty({ title, text }: { title: string; text: string }) {
  return <div className="border border-line bg-white px-6 py-14 text-center"><h3 className="mt-4 text-lg font-black text-ink">{title}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">{text}</p></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-black text-ink">{label}</span>{children}</label>;
}

const AccountTabs: React.FC<{
  section: Section;
  unread: number;
  onOpen: (section: Section) => void;
  onLogout: () => void;
}> = ({ section, unread, onOpen, onLogout }) => {
  const { isArabic, tr } = useLocale();
  return <nav className="grid gap-1" aria-label={isArabic ? 'أقسام الحساب' : 'Rubriques du compte'}>
    {sectionItems.map(({ id, label, labelAr, icon: Icon }) => <button key={id} onClick={() => onOpen(id)} className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3.5 py-3 text-start text-sm font-black transition ${section === id ? 'bg-brand text-white' : 'text-muted hover:bg-brand/5 hover:text-brand'}`}><Icon className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1">{isArabic ? labelAr : label}</span>{id === 'notifications' && unread > 0 ? <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] text-ink">{unread}</span> : <ChevronRight className={`h-4 w-4 opacity-50 ${isArabic ? 'rotate-180' : ''}`} />}</button>)}
    <button onClick={onLogout} className="mt-2 flex min-h-12 w-full items-center gap-3 border-t border-line px-3.5 pt-4 text-start text-sm font-black text-danger"><LogOut className="h-4 w-4" />{tr('Se déconnecter', 'تسجيل الخروج')}</button>
  </nav>;
};

const inputClass = 'min-h-12 w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm font-semibold text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:bg-surface disabled:text-muted';

export const CustomerAccountPage: React.FC<CustomerAccountPageProps> = ({
  isOpen, session, loadingSession, onClose, onSession, onLoggedOut, onOpenCart, onCartChanged, initialMessage, initialSection = 'home', initialOrderId = '',
}) => {
  const { tr, direction, formatDate, formatMoney, isArabic } = useLocale();
  const date = formatDate;
  const money = formatMoney;
  const navigation = useNavigationHistory();
  const sectionLayer = [...navigation.stack].reverse().find((layer) => layer.id === 'account:section');
  const sectionValue = sectionLayer?.payload?.section;
  const section = sectionItems.some((item) => item.id === sectionValue) ? sectionValue as Section : initialSection;
  const addressLayer = navigation.stack.find((layer) => layer.id === 'account:address');
  const orderLayer = navigation.stack.find((layer) => layer.id === 'account:order');
  const phoneLinkOpen = navigation.stack.some((layer) => layer.id === 'account:phone-link');
  const phoneLoginOpen = navigation.stack.some((layer) => layer.id === 'account:phone-login');
  const otpOpen = navigation.stack.some((layer) => layer.id === 'account:otp-code');
  const openSection = (target: Section) => {
    if (target !== section) navigation.pushLayer({ id: 'account:section', payload: { section: target } });
    setOrderDetail(null);
    setAddressDraft(null);
    setError('');
  };
  const closeAccountLayer = () => navigation.back();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [phone, setPhone] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [code, setCode] = useState('');
  const [developmentCode, setDevelopmentCode] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(initialMessage || '');
  const [overview, setOverview] = useState<CustomerAccountOverview | null>(null);
  // A section owns this slot at a time; every endpoint response is typed at its load site.
  const [rows, setRows] = useState<any>([]);
  const [loading, setLoading] = useState(false);
  const [accountDark, setAccountDark] = useState(false);
  const [transferReference, setTransferReference] = useState('');
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [profile, setProfile] = useState({ displayName: '', email: '', marketingOptIn: false });
  const [addressDraft, setAddressDraft] = useState<AddressDraft | null>(null);
  const [orderDetail, setOrderDetail] = useState<CustomerOrderDetail | null>(null);
  const [busyId, setBusyId] = useState('');
  const sectionRequestRef = useRef(0);
  const initialOrderOpenedRef = useRef('');
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  useBodyScrollLock(isOpen);

  useEffect(() => () => { isOpenRef.current = false; }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (initialMessage?.startsWith('Erreur')) {
      setError(initialMessage);
      setNotice('');
    } else {
      setError('');
      setNotice(initialMessage || '');
    }
    customerApi<any>('/api/customer/auth/config').then((result) => setConfig(result.data)).catch(() => setConfig({
      phoneOtp: { enabled: false }, google: { enabled: false }, facebook: { enabled: false }, checkoutRequiresAuthentication: true,
    }));
  }, [isOpen, initialMessage, initialSection]);

  useEffect(() => {
    if (!session) return;
    setProfile({ displayName: session.account.displayName, email: session.account.email || '', marketingOptIn: session.account.marketingOptIn });
    setPhone(session.account.phone || '');
  }, [session]);

  const loadSection = async (target: Section = section) => {
    if (!session) return;
    const requestId = ++sectionRequestRef.current;
    setLoading(true);
    setError('');
    try {
      if (target === 'home') {
        const result = await customerApi<{ data: CustomerAccountOverview }>('/api/customer/account/overview');
        if (requestId === sectionRequestRef.current) setOverview(result.data);
      } else if (target === 'addresses') {
        const result = await customerApi<{ data: CustomerAddress[] }>('/api/customer/account/addresses');
        if (requestId === sectionRequestRef.current) setRows(result.data);
      } else if (target === 'orders') {
        const result = await customerApi<{ data: CustomerOrderSummary[] }>('/api/customer/account/orders');
        if (requestId === sectionRequestRef.current) setRows(result.data);
      } else if (target === 'payments') {
        const result = await customerApi<{ data: CustomerPaymentsOverview }>('/api/customer/account/payments');
        if (requestId === sectionRequestRef.current) setRows(result.data);
      } else if (target === 'invoices') {
        const result = await customerApi<{ data: CustomerInvoice[] }>('/api/customer/account/invoices');
        if (requestId === sectionRequestRef.current) setRows(result.data);
      } else if (target === 'tracking') {
        const result = await customerApi<{ data: CustomerDelivery[] }>('/api/customer/account/tracking');
        if (requestId === sectionRequestRef.current) setRows(result.data);
      } else if (target === 'security') {
        const result = await customerApi<{ data: CustomerSecuritySummary }>('/api/customer/account/security');
        if (requestId === sectionRequestRef.current) setRows(result.data);
      } else if (target === 'settings' || target === 'appearance') {
        const result = await customerApi<{ data: CustomerPreferences }>('/api/customer/account/preferences');
        if (requestId === sectionRequestRef.current) { setRows(result.data); setAccountDark(Boolean(result.data.dark_mode)); }
      } else if (target === 'favorites') {
        const result = await customerApi<{ data: CustomerFavorite[] }>('/api/customer/account/favorites');
        if (requestId === sectionRequestRef.current) setRows(result.data);
      } else if (target === 'cart') {
        const result = await customerApi<{ items: CartItem[] }>('/api/cart/items');
        if (requestId === sectionRequestRef.current) setRows(result.items || []);
      } else if (target === 'notifications') {
        const result = await customerApi<{ data: CustomerNotification[] }>('/api/customer/account/notifications');
        if (requestId === sectionRequestRef.current) setRows(result.data);
      }
    } catch (reason: any) {
      if (requestId === sectionRequestRef.current) setError(reason.message || 'Impossible de charger cette rubrique.');
    } finally {
      if (requestId === sectionRequestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    sectionRequestRef.current += 1;
    if (!isOpen || !session) setLoading(false);
  }, [isOpen, session?.account.id]);

  useEffect(() => {
    if (isOpen && session) void loadSection(section);
  }, [isOpen, session?.account.id, section]);

  useEffect(() => {
    if (!isOpen) {
      setOrderDetail(null);
      setAddressDraft(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!otpOpen) {
      setChallengeId('');
      setCode('');
    }
  }, [otpOpen]);

  const sendCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthBusy(true); setError(''); setNotice('');
    try {
      const result = await customerApi<any>('/api/customer/auth/otp/request', { method: 'POST', body: JSON.stringify({ phone }) });
      setChallengeId(result.data.challengeId);
      setMaskedPhone(result.data.maskedPhone);
      setDevelopmentCode(result.data.developmentCode || '');
      setCode('');
      navigation.pushLayer({ id: 'account:otp-code' });
    } catch (reason: any) { setError(reason.message); }
    finally { setAuthBusy(false); }
  };

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthBusy(true); setError('');
    try {
      const result = await customerApi<any>('/api/customer/auth/otp/verify', {
        method: 'POST', body: JSON.stringify({ challengeId, code, cartSessionId: getSessionId() }),
      });
      onSession({ account: result.data.account, csrfToken: result.data.csrfToken });
      setChallengeId('');
      if (phoneLinkOpen) {
        navigation.navigate(navigation.stack.filter((layer) => !['account:phone-link', 'account:otp-code'].includes(layer.id)), { replace: true });
      }
      const linked = Number(result.data.linkedHistoricalOrders || 0);
      setNotice(linked ? `${linked} ancienne${linked > 1 ? 's' : ''} commande${linked > 1 ? 's' : ''} retrouvée${linked > 1 ? 's' : ''} et ajoutée${linked > 1 ? 's' : ''} à votre compte.` : 'Votre compte AYROVI est maintenant actif.');
      onCartChanged();
    } catch (reason: any) { setError(reason.message); }
    finally { setAuthBusy(false); }
  };

  const logout = async () => {
    try { await customerApi('/api/customer/auth/logout', { method: 'POST' }, session?.csrfToken || ''); } catch {}
    onLoggedOut();
    navigation.navigate([{ id: 'app:account' }], { replace: true }); setRows([]); setOverview(null); setPhone(''); setChallengeId(''); setCode(''); setDevelopmentCode('');
    setNotice('Vous êtes déconnecté.');
  };

  const deleteAccount = async () => {
    if (!session || !confirm('Supprimer définitivement votre compte AYROVI ? Vos commandes comptables déjà créées seront conservées sans accès au compte.')) return;
    setBusyId('delete-account'); setError('');
    try {
      await customerApi('/api/customer/account', {
        method: 'DELETE', body: JSON.stringify({ confirmation: 'SUPPRIMER' }),
      }, session.csrfToken);
      onLoggedOut();
      navigation.navigate([{ id: 'app:account' }], { replace: true }); setRows([]); setOverview(null);
      setNotice('Votre compte et vos données de profil ont été supprimés.');
    } catch (reason: any) { setError(reason.message); }
    finally { setBusyId(''); }
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault(); setBusyId('profile'); setError('');
    try {
      const result = await customerApi<any>('/api/customer/account/profile', { method: 'PUT', body: JSON.stringify(profile) }, session!.csrfToken);
      onSession({ ...session!, account: result.data });
      setNotice('Votre profil a été enregistré.');
    } catch (reason: any) { setError(reason.message); }
    finally { setBusyId(''); }
  };

  const editAddress = (address?: CustomerAddress) => {
    const draft = address ? {
      id: address.id, label: address.label, recipientName: address.recipient_name, phone: address.phone,
      governorate: address.governorate, city: address.city, postalCode: address.postal_code,
      addressLine: address.address_line, deliveryNotes: address.delivery_notes, isDefault: Boolean(address.is_default),
    } : { ...emptyAddress, recipientName: session?.account.displayName || '', phone: session?.account.phone || '' };
    setAddressDraft(draft);
    navigation.pushLayer({ id: 'account:address', payload: { addressId: address?.id || 'new' } });
  };

  const saveAddress = async (event: React.FormEvent) => {
    event.preventDefault(); if (!addressDraft) return; setBusyId('address'); setError('');
    try {
      await customerApi(`/api/customer/account/addresses${addressDraft.id ? `/${addressDraft.id}` : ''}`, {
        method: addressDraft.id ? 'PUT' : 'POST', body: JSON.stringify(addressDraft),
      }, session!.csrfToken);
      setAddressDraft(null); closeAccountLayer(); setNotice('Adresse enregistrée.'); await loadSection('addresses');
    } catch (reason: any) { setError(reason.message); }
    finally { setBusyId(''); }
  };

  const deleteAddress = async (id: string) => {
    if (!confirm('Supprimer cette adresse ?')) return;
    setBusyId(id);
    try { await customerApi(`/api/customer/account/addresses/${id}`, { method: 'DELETE' }, session!.csrfToken); await loadSection('addresses'); }
    catch (reason: any) { setError(reason.message); }
    finally { setBusyId(''); }
  };

  const loadOrderDetail = async (id: string) => {
    setBusyId(id); setError('');
    try {
      const result = await customerApi<{ data: CustomerOrderDetail }>(`/api/customer/account/orders/${id}`);
      setOrderDetail(result.data);
      return result.data;
    } catch (reason: any) {
      setError(reason.message);
      return null;
    } finally { setBusyId(''); }
  };

  const openOrder = async (id: string) => {
    const detail = await loadOrderDetail(id);
    if (detail && isOpenRef.current) navigation.pushLayer({ id: 'account:order', payload: { orderId: id } });
  };

  useEffect(() => {
    if (!isOpen || !session || !initialOrderId || initialOrderOpenedRef.current === initialOrderId) return;
    initialOrderOpenedRef.current = initialOrderId;
    void openOrder(initialOrderId);
  }, [isOpen, session?.account.id, initialOrderId]);

  useEffect(() => {
    const orderId = typeof orderLayer?.payload?.orderId === 'string' ? orderLayer.payload.orderId : '';
    if (!orderId) {
      setOrderDetail(null);
      return;
    }
    if (String(orderDetail?.id || '') !== orderId) void loadOrderDetail(orderId);
  }, [isOpen, orderLayer?.payload?.orderId]);

  useEffect(() => {
    if (!addressLayer) {
      setAddressDraft(null);
      return;
    }
    if (addressDraft) return;
    const addressId = typeof addressLayer.payload?.addressId === 'string' ? addressLayer.payload.addressId : '';
    if (addressId === 'new') {
      setAddressDraft({ ...emptyAddress, recipientName: session?.account.displayName || '', phone: session?.account.phone || '' });
      return;
    }
    const address = Array.isArray(rows) ? rows.find((item: any) => item.id === addressId) as CustomerAddress | undefined : undefined;
    if (address) {
      setAddressDraft({
        id: address.id, label: address.label, recipientName: address.recipient_name, phone: address.phone,
        governorate: address.governorate, city: address.city, postalCode: address.postal_code,
        addressLine: address.address_line, deliveryNotes: address.delivery_notes, isDefault: Boolean(address.is_default),
      });
    }
  }, [isOpen, addressLayer, rows, addressDraft, session?.account.id]);

  const removeFavorite = async (id: string) => {
    setBusyId(id);
    try { await customerApi(`/api/customer/account/favorites/${id}`, { method: 'DELETE' }, session!.csrfToken); await loadSection('favorites'); }
    catch (reason: any) { setError(reason.message); }
    finally { setBusyId(''); }
  };

  const updateCart = async (item: CartItem, quantity: number) => {
    setBusyId(item.id);
    try {
      await customerApi(`/api/cart/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ quantity }) }, session!.csrfToken);
      await loadSection('cart'); onCartChanged();
    } catch (reason: any) { setError(reason.message); }
    finally { setBusyId(''); }
  };

  const markNotificationsRead = async () => {
    setBusyId('notifications');
    try { await customerApi('/api/customer/account/notifications/read', { method: 'PUT', body: '{}' }, session!.csrfToken); await loadSection('notifications'); }
    catch (reason: any) { setError(reason.message); }
    finally { setBusyId(''); }
  };

  // ===== رفع وصل العربون =====
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofBusy, setProofBusy] = useState(false);
  const uploadDepositProof = async () => {
    if (!orderDetail || !proofFile || proofBusy || !session) return;
    setProofBusy(true); setError('');
    try {
      const form = new FormData();
      form.append('proof', proofFile);
      form.append('transferReference', transferReference.trim());
      await customerApi(`/api/customer/account/orders/${orderDetail.id}/deposit-proof`, { method: 'POST', body: form }, session.csrfToken);
      setProofFile(null);
      setTransferReference('');
      await loadOrderDetail(orderDetail.id);
      setNotice('Preuve d’acompte envoyée — vérification par notre équipe en cours.');
    } catch (reason: any) { setError(reason.message); }
    finally { setProofBusy(false); }
  };

  const selectDepositMethod = async (method: 'CARD' | 'BANK_TRANSFER' | 'POSTE') => {
    if (!orderDetail || !session || paymentBusy) return;
    setPaymentBusy(true); setError('');
    try {
      await customerApi(`/api/customer/account/orders/${orderDetail.id}/deposit/method`, { method: 'POST', body: JSON.stringify({ method }) }, session.csrfToken);
      await loadOrderDetail(orderDetail.id);
    } catch (reason: any) { setError(reason.message); }
    finally { setPaymentBusy(false); }
  };

  const startCardPayment = async () => {
    if (!orderDetail || !session || paymentBusy) return;
    setPaymentBusy(true); setError('');
    try {
      const result = await customerApi<{ data: CustomerCardInitiation }>(`/api/customer/account/orders/${orderDetail.id}/payments/card/initiate`, { method: 'POST', body: '{}' }, session.csrfToken);
      if (!/^https:\/\//i.test(String(result.data?.payUrl || ''))) throw new Error(tr('Réponse invalide de la passerelle.', 'استجابة غير صالحة من بوابة الدفع.'));
      window.location.assign(result.data.payUrl);
    } catch (reason: any) { setError(reason.message); setPaymentBusy(false); }
  };

  const savePreferences = async (next: any) => {
    if (!session || busyId === 'preferences') return;
    setBusyId('preferences'); setError('');
    try {
      const payload = {
        darkMode: Boolean(next.dark_mode), orderUpdates: Boolean(next.order_updates), paymentUpdates: Boolean(next.payment_updates),
        shippingUpdates: Boolean(next.shipping_updates), invoiceUpdates: Boolean(next.invoice_updates),
      };
      const result = await customerApi<{ data: CustomerPreferences }>('/api/customer/account/preferences', { method: 'PUT', body: JSON.stringify(payload) }, session.csrfToken);
      setRows(result.data); setAccountDark(Boolean(result.data.dark_mode));
      document.documentElement.dataset.ayrovixTheme = result.data.dark_mode ? 'dark' : 'light';
      setNotice(tr('Préférences enregistrées.', 'تم حفظ الإعدادات.'));
    } catch (reason: any) { setError(reason.message); }
    finally { setBusyId(''); }
  };

  const unreadCount = useMemo(() => Array.isArray(rows) ? rows.filter((item) => !item.read_at).length : 0, [rows]);
  if (!isOpen) return null;

  const googleEnabled = Boolean(config?.google.enabled);
  const facebookEnabled = Boolean(config?.facebook.enabled);
  const socialLoginEnabled = googleEnabled || facebookEnabled;
  const oauthQuery = `cartSessionId=${encodeURIComponent(getSessionId())}&returnTo=${encodeURIComponent('/')}`;
  const googleStartHref = `/api/customer/auth/google/start?${oauthQuery}`;
  const facebookStartHref = `/api/customer/auth/facebook/start?${oauthQuery}`;
  const showPhoneLogin = phoneLinkOpen || phoneLoginOpen || (config !== null && !socialLoginEnabled);

  const authPanel = (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-5 py-10 sm:my-10 sm:min-h-0 sm:rounded-card sm:border sm:border-line sm:bg-white sm:px-10 sm:py-12 sm:shadow-overlay">
      <div className="mb-8 text-center"><img src="/media/logo-ayrovi.png" alt="AYROVI" className="mx-auto h-20 w-20 object-contain" /><h1 className="mt-5 text-3xl font-black tracking-[-0.045em] text-ink">{phoneLinkOpen ? tr('Vérifier mon téléphone', 'توثيق هاتفي') : tr('Bienvenue chez AYROVI', 'مرحبًا بك في AYROVI')}</h1><p className="mt-2 text-sm leading-6 text-muted">{phoneLinkOpen ? (session?.account.emailVerified ? tr('Ajoutez un second canal vérifié pour renforcer votre compte.', 'أضف قناة موثقة ثانية لتعزيز أمان حسابك.') : tr('Un e-mail ou un téléphone vérifié est requis pour confirmer une commande.', 'يلزم بريد إلكتروني أو هاتف موثّق لتأكيد الطلب.')) : tr('Votre panier, vos commandes et vos adresses sur tous vos appareils.', 'سلّتك وطلباتك وعناوينك متاحة على جميع أجهزتك.')}</p></div>
      {error && <div className="mb-4 border border-danger/20 bg-danger/5 px-4 py-3 text-sm font-bold text-danger">{error}</div>}
      {/* Connexions OAuth principales; Facebook reste masqué tant que Meta n'est pas configuré. */}
      {!otpOpen && !phoneLinkOpen && <>
        <a href={googleEnabled ? googleStartHref : undefined} aria-disabled={!googleEnabled} className={`ay-btn-secondary w-full text-sm ${googleEnabled ? '' : 'pointer-events-none opacity-50'}`}><span className="grid h-7 w-7 place-items-center rounded-full bg-white"><FcGoogle size={20} aria-hidden /></span>{tr('Continuer avec Google', 'المتابعة عبر Google')}</a>
        {facebookEnabled && <a href={facebookStartHref} className="ay-btn-secondary mt-3 w-full text-sm"><span className="grid h-7 w-7 place-items-center rounded-full bg-white text-brand"><FaFacebookF size={16} aria-hidden /></span>{tr('Continuer avec Facebook', 'المتابعة عبر Facebook')}</a>}
        {config !== null && !socialLoginEnabled && <p className="mt-2 text-center text-xs text-muted">{tr('La connexion sociale sera disponible après sa configuration.', 'سيتاح تسجيل الدخول الاجتماعي بعد ضبطه.')}</p>}
        {socialLoginEnabled && !showPhoneLogin && <p className="mt-2 text-center text-xs text-muted">{tr('Connexion instantanée et sécurisée, sans partager votre mot de passe avec AYROVI.', 'دخول سريع وآمن دون مشاركة كلمة مرورك مع AYROVI.')}</p>}
      </>}
      {/* Connexion par téléphone : secondaire (optionnelle) */}
      {!otpOpen && showPhoneLogin && <>
        {!phoneLinkOpen && <div className="my-6 flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-muted"><span className="h-px flex-1 bg-line" />{tr('ou', 'أو')}<span className="h-px flex-1 bg-line" /></div>}
        <form onSubmit={sendCode} className="space-y-4">
          <Field label={tr('Numéro de téléphone tunisien', 'رقم هاتف تونسي')}><div className="relative"><Phone className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-brand" /><input autoFocus type="tel" inputMode="tel" autoComplete="tel" maxLength={24} pattern="[+0-9 ()-]{8,24}" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+216 98 123 456" className={`${inputClass} pl-11`} required /></div></Field>
          <button disabled={authBusy || config?.phoneOtp.enabled === false} className="ay-btn-primary w-full text-sm">{authBusy && <Loader2 className="h-4 w-4 animate-spin" />}{tr('Recevoir mon code SMS', 'استلام رمز SMS')}</button>
          {config?.phoneOtp.enabled === false && <p className="text-center text-xs font-semibold text-warning">{tr('L’envoi SMS doit être configuré sur le serveur.', 'يجب ضبط خدمة SMS على الخادم.')}</p>}
        </form>
      </>}
      {!otpOpen && !phoneLinkOpen && socialLoginEnabled && !showPhoneLogin && (
        <button type="button" onClick={() => navigation.pushLayer({ id: 'account:phone-login' })} className="mt-5 w-full py-2 text-xs font-black text-brand">{tr('Utiliser mon numéro de téléphone (SMS)', 'استخدام رقم هاتفي (SMS)')}</button>
      )}
      {otpOpen && challengeId && <form onSubmit={verifyCode} className="space-y-4">
        <div className="border border-brand/20 bg-brand/5 p-4 text-center"><p className="text-xs font-bold text-muted">{tr('Code envoyé au', 'أُرسل الرمز إلى')}</p><strong className="mt-1 block text-base text-ink">{maskedPhone}</strong></div>
        <Field label={tr('Code à 6 chiffres', 'رمز من 6 أرقام')}><input autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" className={`${inputClass} text-center font-mono text-2xl tracking-[0.35em]`} required /></Field>
        {developmentCode && <button type="button" onClick={() => setCode(developmentCode)} className="w-full border border-accent/30 bg-accent/10 p-3 text-xs font-bold text-warning">{tr('Mode développement — utiliser', 'وضع التطوير — استخدم')} {developmentCode}</button>}
        <button disabled={authBusy || code.length !== 6} className="ay-btn-primary w-full text-sm">{authBusy && <Loader2 className="h-4 w-4 animate-spin" />}{tr('Valider et activer mon compte', 'تأكيد حسابي وتفعيله')}</button>
        <button type="button" onClick={() => { closeAccountLayer(); setError(''); }} className="w-full py-2 text-xs font-black text-brand">{tr('Modifier le numéro', 'تغيير الرقم')}</button>
      </form>}
      {phoneLinkOpen && !otpOpen && <button type="button" onClick={() => { closeAccountLayer(); setError(''); }} className="mt-6 flex w-full items-center justify-center gap-2 py-2 text-xs font-black text-muted"><ArrowLeft className={`h-4 w-4 ${isArabic ? 'rotate-180' : ''}`} />{tr('Retour au compte', 'العودة إلى الحساب')}</button>}
      <p className="mt-7 text-center text-[11px] leading-5 text-muted">{tr('Connexion sécurisée. AYROVI ne vous demandera jamais votre code par téléphone ou message.', 'دخول آمن. لن تطلب منك AYROVI رمزك عبر مكالمة أو رسالة.')}</p>
    </div>
  );

  const renderHome = () => {
    const cards = [
      { label: tr('Commandes', 'الطلبات'), value: overview?.counts.orders ?? 0, icon: Package, section: 'orders' as Section },
      { label: tr('Panier', 'السلة'), value: overview?.counts.cartItems ?? 0, icon: ShoppingBag, section: 'cart' as Section },
      { label: tr('Favoris', 'المفضلة'), value: overview?.counts.favorites ?? 0, icon: Heart, section: 'favorites' as Section },
      { label: tr('Notifications', 'الإشعارات'), value: overview?.counts.unreadNotifications ?? 0, icon: Bell, section: 'notifications' as Section },
    ];
    return <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl bg-brand-gradient p-5 text-white sm:p-7"><div className="relative flex items-center gap-4"><div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white/15 text-xl font-black">{session!.account.avatarUrl ? <img src={session!.account.avatarUrl} alt="" className="h-full w-full object-cover" /> : (session!.account.displayName || 'AY').slice(0,2).toUpperCase()}</div><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-accent">{tr('Mon compte', 'حسابي')}</p><h2 className="mt-1 truncate text-2xl font-black">{session!.account.displayName || tr('Client AYROVI', 'حريف AYROVI')}</h2><p className="truncate text-xs text-white/70">{session!.account.email || session!.account.phone}</p></div></div></section>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{cards.map(({label,value,section:target})=><button key={target} onClick={()=>openSection(target)} className="min-w-0 rounded-2xl border border-line bg-white p-4 text-start"><strong className="mt-3 block text-2xl font-black text-ink">{value}</strong><span className="block truncate text-xs font-bold text-muted">{label}</span></button>)}</div>
      <section><div className="mb-3 flex items-center justify-between"><h3 className="text-lg font-black text-ink">{tr('Commandes récentes', 'الطلبات الأخيرة')}</h3><button onClick={()=>openSection('orders')} className="text-xs font-black text-brand">{tr('Tout voir', 'عرض الكل')}</button></div>{overview?.recentOrders?.length?<div className="divide-y divide-line rounded-2xl border border-line bg-white">{overview.recentOrders.map((order: CustomerOrderSummary)=><button key={order.id} onClick={()=>openOrder(order.id)} className="flex w-full min-w-0 items-center gap-3 p-4 text-start"><div className="grid h-12 w-12 shrink-0 place-items-center bg-brand/10">{order.image_url?<img src={order.image_url} alt="" className="h-full w-full object-contain"/>:null}</div><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{order.order_number}</strong><span className="text-xs text-muted">{date(order.created_at)} · {order.item_count} {tr('article(s)','منتج')}</span></div><Status value={order.status}/></button>)}</div>:<Empty title={tr('Aucune commande','لا توجد طلبات')} text={tr('Votre première commande apparaîtra ici dès sa création.','سيظهر طلبك الأول هنا فور إنشائه.')}/>}</section>
    </div>;
  };

  const renderProfile = () => <form onSubmit={saveProfile} className="mx-auto max-w-2xl space-y-5 rounded-3xl border border-line bg-white p-5 sm:p-7">
    <div className="flex items-center gap-4 border-b border-line pb-5"><div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-brand text-xl font-black text-white">{session!.account.avatarUrl?<img src={session!.account.avatarUrl} alt="" className="h-full w-full object-cover"/>:(session!.account.displayName||'AY').slice(0,2).toUpperCase()}</div><div><h3 className="font-black">{tr('Informations personnelles','المعلومات الشخصية')}</h3><p className="text-xs text-muted">{session!.account.email || session!.account.phone}</p></div></div>
    <Field label={tr('Nom et prénom','الاسم واللقب')}><input className={inputClass} value={profile.displayName} onChange={(e)=>setProfile({...profile,displayName:e.target.value.slice(0,120)})} required/></Field>
    <Field label={tr('Adresse e-mail','البريد الإلكتروني')}><input type="email" className={inputClass} value={profile.email} onChange={(e)=>setProfile({...profile,email:e.target.value.slice(0,180)})}/></Field>
    <div className="rounded-2xl border border-line bg-surface p-4 text-sm"><div className="flex items-center gap-2"><Phone className="h-4 w-4 text-brand"/><strong>{session!.account.phone||tr('Téléphone non renseigné','الهاتف غير مسجل')}</strong>{session!.account.phoneVerified&&<CheckCircle2 className="ms-auto h-4 w-4 text-success"/>}</div>{!session!.account.phoneVerified&&<button type="button" onClick={()=>navigation.pushLayer({id:'account:phone-link'})} className="ay-btn-secondary mt-3 w-full text-xs"><ShieldCheck className="h-4 w-4"/>{tr('Vérifier mon téléphone','توثيق هاتفي')}</button>}</div>
    <label className="flex items-start gap-3 rounded-2xl border border-line p-4"><input type="checkbox" checked={profile.marketingOptIn} onChange={(e)=>setProfile({...profile,marketingOptIn:e.target.checked})} className="mt-0.5 h-5 w-5 accent-brand"/><span><strong className="block text-sm">{tr('Magazine et offres AYROVI','مجلتي وعروض AYROVI')}</strong><small className="text-xs text-muted">{tr('Recevoir les nouveaux arrivages et offres.','استلام أخبار المنتجات والعروض.')}</small></span></label>
    <button disabled={busyId==='profile'} className="ay-btn-primary w-full text-sm">{busyId==='profile'&&<Loader2 className="h-4 w-4 animate-spin"/>}{tr('Enregistrer','حفظ')}</button>
    <section className="border-t border-danger/15 pt-5"><h4 className="text-sm font-black text-danger">{tr('Supprimer mon compte','حذف حسابي')}</h4><p className="mt-1 text-xs leading-5 text-muted">{tr('Le profil est supprimé; les documents comptables déjà créés restent archivés.','يُحذف الملف وتبقى الوثائق المحاسبية السابقة مؤرشفة.')}</p><button type="button" onClick={deleteAccount} disabled={busyId==='delete-account'} className="mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-danger/30 px-4 text-xs font-black text-danger"><Trash2 className="h-4 w-4"/>{tr('Supprimer définitivement','حذف نهائي')}</button></section>
  </form>;

  const renderAddresses = () => <div className="space-y-4"><button onClick={()=>editAddress()} className="ay-btn-primary text-sm">{tr('Ajouter une adresse','إضافة عنوان')}</button>{Array.isArray(rows)&&rows.length?<div className="grid gap-4 lg:grid-cols-2">{rows.map((address:CustomerAddress)=><article key={address.id} className="min-w-0 rounded-2xl border border-line bg-white p-5"><div className="flex justify-between gap-3"><div className="min-w-0"><h3 className="font-black">{address.label}{Boolean(address.is_default)&&<span className="ms-2 rounded-full bg-brand/10 px-2 py-1 text-[9px] text-brand">{tr('Par défaut','الافتراضي')}</span>}</h3><p className="mt-3 text-sm font-bold">{address.recipient_name}</p><p className="mt-1 break-words text-sm leading-6 text-muted">{address.address_line}<br/>{address.city?`${address.city}, `:''}{address.governorate}{address.postal_code?` ${address.postal_code}`:''}<br/>{address.phone}</p></div></div><div className="mt-4 flex gap-2 border-t border-line pt-3"><button onClick={()=>editAddress(address)} className="px-3 py-2 text-xs font-black text-brand">{tr('Modifier','تعديل')}</button><button onClick={()=>deleteAddress(address.id)} className="px-3 py-2 text-xs font-black text-danger">{tr('Supprimer','حذف')}</button></div></article>)}</div>:<Empty title={tr('Aucune adresse enregistrée','لا يوجد عنوان محفوظ')} text={tr('Ajoutez une adresse de livraison réelle.','أضف عنوان تسليم حقيقيًا.')}/>}</div>;

  const renderOrders = () => Array.isArray(rows)&&rows.length?<div className="space-y-3">{rows.map((order: CustomerOrderSummary)=><button key={order.id} onClick={()=>openOrder(order.id)} className="grid w-full min-w-0 grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-line bg-white p-3 text-start sm:p-4"><div className="grid h-13 w-13 place-items-center overflow-hidden bg-brand/10">{order.image_url?<img src={order.image_url} alt="" className="h-full w-full object-contain"/>:null}</div><div className="min-w-0"><strong className="block truncate text-sm">{order.order_number}</strong><span className="block text-xs text-muted">{date(order.created_at)} · {order.item_count} {tr('article(s)','منتج')}</span><span className="mt-2 block"><Status value={order.status}/></span></div><div className="text-end"><strong className="block whitespace-nowrap text-sm">{money(order.total_tnd)}</strong><ArrowRight className={`ms-auto mt-2 h-4 w-4 text-muted ${isArabic?'rotate-180':''}`}/></div></button>)}</div>:<Empty title={tr('Aucune commande','لا توجد طلبات')} text={tr('Une commande apparaît ici immédiatement après sa création.','يظهر الطلب هنا فور إنشائه.')}/>;

  const renderFavorites = () => Array.isArray(rows)&&rows.length?<div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{rows.map((favorite: CustomerFavorite)=><article key={favorite.id} className="min-w-0 overflow-hidden rounded-2xl border border-line bg-white"><a href={favorite.source_url||'#'} target={favorite.source_url?'_blank':undefined} rel="noreferrer" className="block aspect-square bg-surface">{favorite.image_url?<img src={favorite.image_url} alt={favorite.title} className="h-full w-full object-contain"/>:null}</a><div className="p-3"><h3 className="line-clamp-2 text-sm font-black">{favorite.title}</h3>{favorite.price_tnd!=null&&<strong className="mt-2 block text-sm text-brand">{money(favorite.price_tnd)}</strong>}<button onClick={()=>removeFavorite(favorite.id)} className="mt-3 text-[11px] font-black text-danger">{tr('Retirer','إزالة')}</button></div></article>)}</div>:<Empty title={tr('Aucun favori','لا توجد مفضلة')} text={tr('Vos favoris réels seront conservés ici.','ستُحفظ مفضلاتك الحقيقية هنا.')}/>;

  const renderCart = () => Array.isArray(rows)&&rows.length?<div className="space-y-3">{rows.map((item:CartItem)=><article key={item.id} className="flex min-w-0 gap-3 rounded-2xl border border-line bg-white p-4"><div className="h-16 w-16 shrink-0 bg-surface">{item.imageUrl?<img src={item.imageUrl} alt="" className="h-full w-full object-contain"/>:<ShoppingBag className="m-5 h-6 w-6 text-brand"/>}</div><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-black">{item.title}</h3><p className="text-xs text-muted">{item.variant||item.store}</p><strong className="text-sm text-brand">{money(item.lineTotalTND??item.priceTND)}</strong></div><div className="flex shrink-0 flex-col items-end justify-between"><button onClick={()=>updateCart(item,0)}><Trash2 className="h-4 w-4 text-danger"/></button><div className="flex border border-line"><button onClick={()=>updateCart(item,Math.max(0,item.quantity-1))} className="h-8 w-8">−</button><span className="grid min-w-7 place-items-center text-xs font-black">{item.quantity}</span><button onClick={()=>updateCart(item,item.quantity+1)} className="h-8 w-8">+</button></div></div></article>)}<button onClick={onOpenCart} className="ay-btn-primary w-full text-sm">{tr('Ouvrir le panier','فتح السلة')}</button></div>:<Empty title={tr('Votre panier est vide','سلّتك فارغة')} text={tr('Les articles ajoutés apparaîtront ici.','ستظهر المنتجات المضافة هنا.')}/>;

  const renderNotifications = () => <div className="space-y-3">{Array.isArray(rows)&&rows.length&&unreadCount>0?<button onClick={markNotificationsRead} className="ay-btn-secondary text-xs"><Check className="h-4 w-4"/>{tr('Tout marquer comme lu','تحديد الكل كمقروء')}</button>:null}{Array.isArray(rows)&&rows.length?rows.map((item: CustomerNotification)=><article key={item.id} className={`flex gap-3 rounded-2xl border p-4 ${item.read_at?'border-line bg-white':'border-brand/30 bg-brand/5'}`}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-white">{item.type==='ORDER'?<Package className="h-4 w-4"/>:<Bell className="h-4 w-4"/>}</span><div className="min-w-0"><h3 className="text-sm font-black">{item.title}</h3><p className="mt-1 break-words text-sm leading-5 text-muted">{item.message}</p><time className="text-[10px] text-muted">{date(item.created_at,true)}</time></div></article>):<Empty title={tr('Aucune notification','لا توجد إشعارات')} text={tr('Les événements de commande, paiement, facture et livraison apparaîtront ici.','ستظهر أحداث الطلب والدفع والفاتورة والتسليم هنا.')}/>}</div>;

  const renderPayments = () => {
    const payments=Array.isArray(rows?.payments)?rows.payments:[]; const transactions=Array.isArray(rows?.transactions)?rows.transactions:[];
    if(!payments.length&&!transactions.length)return <Empty title={tr('Aucun paiement','لا توجد مدفوعات')} text={tr('Les paiements et transactions réels apparaîtront après votre première commande.','ستظهر المدفوعات والمعاملات الحقيقية بعد طلبك الأول.')}/>;
    return <div className="space-y-6"><section><h3 className="mb-3 text-lg font-black">{tr('Paiements','المدفوعات')}</h3><div className="space-y-3">{payments.map((p: CustomerPayment)=><article key={p.id} className="rounded-2xl border border-line bg-white p-4"><div className="flex flex-wrap justify-between gap-2"><div><strong className="block font-mono text-sm">{p.payment_number}</strong><button onClick={()=>openOrder(p.order_id)} className="text-xs font-black text-brand">{p.order_number}</button></div><Status value={p.status}/></div><div className="mt-3 flex justify-between text-sm"><span className="text-muted">{p.method==='PENDING_SELECTION'?tr('À choisir','يُختار لاحقًا'):p.method}</span><strong>{money(p.amount_tnd)}</strong></div></article>)}</div></section><section><h3 className="mb-3 text-lg font-black">{tr('Transactions','المعاملات')}</h3>{transactions.length?<div className="space-y-3">{transactions.map((t: CustomerPaymentTransaction)=><article key={t.id} className="rounded-2xl border border-line bg-white p-4"><div className="flex flex-wrap justify-between gap-2"><strong className="font-mono text-sm">{t.transaction_number}</strong><Status value={t.status}/></div><p className="mt-2 text-xs text-muted">{t.provider} · {t.order_number} · {date(t.created_at,true)}</p><strong className="mt-2 block">{money(t.amount_tnd)}</strong>{t.failure_reason&&<p className="mt-2 text-xs text-danger">{t.failure_reason}</p>}</article>)}</div>:<Empty title={tr('Aucune transaction','لا توجد معاملات')} text={tr('Aucune transaction confirmée ou échouée.','لا توجد معاملات مؤكدة أو فاشلة.')}/>}</section></div>;
  };

  const renderInvoices = () => Array.isArray(rows)&&rows.length?<div className="space-y-3">{rows.map((invoice: CustomerInvoice)=><article key={invoice.id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-white p-4"><div className="min-w-0 flex-1"><strong className="block truncate font-mono text-sm">{invoice.invoice_number}</strong><p className="text-xs text-muted">{invoice.order_number} · {date(invoice.issued_at,true)}</p></div><a href={`/api/customer/account/orders/${invoice.order_id}/invoice`} className="ay-btn-secondary shrink-0 px-3 text-xs">{tr('PDF','PDF')}</a></article>)}</div>:<Empty title={tr('Aucune facture émise','لا توجد فواتير صادرة')} text={tr('Une facture apparaît uniquement après son émission par AYROVI.','تظهر الفاتورة فقط بعد إصدارها من AYROVI.')}/>;

  const renderTracking = () => Array.isArray(rows)&&rows.length?<div className="space-y-3">{rows.map((shipment: CustomerDelivery)=><article key={shipment.id} className="rounded-2xl border border-line bg-white p-5"><div className="flex items-start justify-between gap-3"><div><strong>{shipment.order_number}</strong><div className="mt-2"><Status value={shipment.status}/></div></div></div><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted">{tr('Transporteur','الناقل')}</dt><dd className="font-black">{shipment.carrier}</dd></div><div><dt className="text-xs text-muted">{tr('Numéro de suivi','رقم التتبع')}</dt><dd className="break-all font-mono font-black">{shipment.tracking_number}</dd></div><div><dt className="text-xs text-muted">{tr('Expédié le','تاريخ الشحن')}</dt><dd>{date(shipment.shipped_at,true)}</dd></div></dl>{shipment.tracking_url&&<a href={shipment.tracking_url} target="_blank" rel="noreferrer" className="ay-btn-secondary mt-4 w-full text-xs">{tr('Suivre chez le transporteur','التتبع لدى الناقل')}</a>}</article>)}</div>:<Empty title={tr('Aucun colis expédié','لا توجد شحنة مرسلة')} text={tr('Le suivi apparaît seulement après SHIPPED avec un transporteur et un numéro réels.','يظهر التتبع فقط بعد الشحن برقم وناقل حقيقيين.')}/>;

  const renderSecurity = () => <div className="mx-auto max-w-2xl space-y-4"><article className="rounded-2xl border border-line bg-white p-5"><h3 className="font-black">{tr('Canaux vérifiés','قنوات موثقة')}</h3><div className="mt-4 space-y-3 text-sm"><div className="flex items-center justify-between"><span>{tr('E-mail','البريد الإلكتروني')}</span><Status value={rows?.emailVerified?'APPROVED':'PENDING'}/></div><div className="flex items-center justify-between"><span>{tr('Téléphone','الهاتف')}</span><Status value={rows?.phoneVerified?'APPROVED':'PENDING'}/></div></div></article><article className="rounded-2xl border border-line bg-white p-5"><h3 className="font-black">{tr('Sessions actives','الجلسات النشطة')}</h3><strong className="mt-3 block text-3xl text-brand">{Number(rows?.activeSessions||0)}</strong>{rows?.lastLoginAt&&<p className="mt-2 text-xs text-muted">{tr('Dernière connexion','آخر دخول')} : {date(rows.lastLoginAt,true)}</p>}</article></div>;

  const renderSettings = () => {
    const toggles=[['order_updates',tr('Commandes','الطلبات')],['payment_updates',tr('Paiements','المدفوعات')],['shipping_updates',tr('Livraison','التسليم')],['invoice_updates',tr('Factures','الفواتير')]];
    return <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-white p-5 sm:p-7"><h3 className="font-black">{tr('Préférences de notification','إعدادات الإشعارات')}</h3><div className="mt-5 space-y-3">{toggles.map(([key,label])=><label key={key} className="flex min-h-12 items-center justify-between gap-4 rounded-2xl border border-line px-4"><span className="text-sm font-bold">{label}</span><input type="checkbox" checked={Boolean(rows?.[key])} onChange={(e)=>setRows({...rows,[key]:e.target.checked?1:0})} className="h-5 w-5 accent-brand"/></label>)}</div><button onClick={()=>savePreferences(rows)} disabled={busyId==='preferences'} className="ay-btn-primary mt-5 w-full text-sm">{tr('Enregistrer les paramètres','حفظ الإعدادات')}</button></div>;
  };

  const renderAppearance = () => <div className="mx-auto max-w-xl rounded-3xl border border-line bg-white p-6"><Moon className="h-8 w-8 text-brand"/><h3 className="mt-4 text-xl font-black">{tr('Mode sombre','الوضع الداكن')}</h3><p className="mt-2 text-sm leading-6 text-muted">{tr('Cette préférence est enregistrée dans votre compte et reste après reconnexion.','يُحفظ هذا الخيار في حسابك ويبقى بعد تسجيل الدخول مجددًا.')}</p><button onClick={()=>savePreferences({...rows,dark_mode:accountDark?0:1})} className="ay-btn-primary mt-5 w-full text-sm">{accountDark?tr('Passer au mode clair','الانتقال للوضع الفاتح'):tr('Activer le mode sombre','تفعيل الوضع الداكن')}</button></div>;

  const renderSection = () => {
    if(loading)return <div className="grid min-h-64 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-brand"/></div>;
    if(section==='home')return renderHome(); if(section==='profile')return renderProfile(); if(section==='orders')return renderOrders();
    if(section==='payments')return renderPayments(); if(section==='invoices')return renderInvoices(); if(section==='tracking')return renderTracking();
    if(section==='addresses')return renderAddresses(); if(section==='favorites')return renderFavorites(); if(section==='cart')return renderCart();
    if(section==='notifications')return renderNotifications(); if(section==='appearance')return renderAppearance(); if(section==='security')return renderSecurity(); if(section==='settings')return renderSettings();
    if(section==='lensHelp')return <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-white p-6"><ScanSearch className="h-8 w-8 text-brand"/><h3 className="mt-4 text-xl font-black">{tr('Aide AYROVIX Lens','مساعدة عدسة AYROVIX')}</h3><p className="mt-3 text-sm leading-7 text-muted">{tr('Photographiez le produit entier, gardez le prix et la variante visibles, puis vérifiez le lien source avant de l’ajouter au panier.','صوّر المنتج كاملًا وأبقِ السعر والخصائص ظاهرة ثم تحقق من رابط المصدر قبل إضافته للسلة.')}</p></div>;
    return <div className="mx-auto max-w-2xl space-y-3"><a href="/terms.html" target="_blank" rel="noreferrer" className="flex min-h-14 items-center justify-between rounded-2xl border border-line bg-white px-5 font-black"><span>{tr('Conditions générales','الشروط العامة')}</span><ExternalLink className="h-4 w-4"/></a><a href="/privacy.html" target="_blank" rel="noreferrer" className="flex min-h-14 items-center justify-between rounded-2xl border border-line bg-white px-5 font-black"><span>{tr('Politique de confidentialité','سياسة الخصوصية')}</span><ExternalLink className="h-4 w-4"/></a></div>;
  };

  return <div className="ayrovix-theme-scope fixed inset-0 z-[95] overflow-hidden bg-surface" dir={direction} role="dialog" aria-modal="true" aria-label={session?tr('Mon compte AYROVI','حسابي في AYROVI'):tr('Connexion client AYROVI','تسجيل الدخول إلى AYROVI')}>
    <AppHeader title="AYROVI" subtitle={tr('Espace client','فضاء العميل')} onClose={onClose} actionLabel={tr('Fermer','إغلاق')}/>
    <div className="h-[calc(100dvh-4.25rem)] overflow-y-auto sm:h-[calc(100dvh-5.25rem)]">{loadingSession?<div className="grid h-full place-items-center"><Loader2 className="h-8 w-8 animate-spin text-brand"/></div>:(!session||phoneLinkOpen)?authPanel:<div className="mx-auto grid min-h-full w-full min-w-0 max-w-7xl grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className={`${section==='home'?'block':'hidden'} order-2 min-w-0 border-t border-line bg-white p-4 lg:order-1 lg:block lg:border-e lg:border-t-0 lg:p-5`}><div className="mb-4 hidden items-center gap-3 border-b border-line pb-5 lg:flex"><div className="grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-brand text-sm font-black text-white">{session.account.avatarUrl?<img src={session.account.avatarUrl} alt="" className="h-full w-full object-cover"/>:(session.account.displayName||'AY').slice(0,2).toUpperCase()}</div><div className="min-w-0"><strong className="block truncate text-sm">{session.account.displayName}</strong><span className="block truncate text-[10px] text-muted">{session.account.email||session.account.phone}</span></div></div><AccountTabs section={section} unread={Number(overview?.counts?.unreadNotifications||0)} onOpen={openSection} onLogout={logout}/></aside>
      <main className="order-1 min-w-0 px-4 py-5 sm:px-7 lg:order-2 lg:px-10"><div className="mb-5 flex items-center gap-3">{section!=='home'&&<button onClick={()=>openSection('home')} className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-white lg:hidden"><ArrowLeft className={`h-4 w-4 ${isArabic?'rotate-180':''}`}/></button>}<div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand">{tr('Mon compte','حسابي')}</p><h1 className="truncate text-2xl font-black">{(()=>{const item=sectionItems.find((entry)=>entry.id===section);return item?(isArabic?item.labelAr:item.label):''})()}</h1></div></div>{notice&&<div className="mb-5 flex items-start gap-2 rounded-2xl border border-success/20 bg-success/5 p-3 text-sm font-bold text-success"><CheckCircle2 className="h-4 w-4 shrink-0"/><span>{notice}</span><button onClick={()=>setNotice('')} className="ms-auto"><X className="h-4 w-4"/></button></div>}{error&&<div className="mb-5 rounded-2xl border border-danger/20 bg-danger/5 p-3 text-sm font-bold text-danger">{error}</div>}{renderSection()}</main>
    </div>}</div>

    {addressLayer&&addressDraft&&session&&<div className="fixed inset-0 z-[110] grid place-items-end bg-black/45 sm:place-items-center" onMouseDown={(e)=>{if(e.target===e.currentTarget)closeAccountLayer()}}><form onSubmit={saveAddress} className="max-h-[92dvh] w-full overflow-y-auto bg-white p-5 sm:max-w-xl sm:rounded-3xl sm:p-7"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black">{addressDraft.id?tr('Modifier l’adresse','تعديل العنوان'):tr('Nouvelle adresse','عنوان جديد')}</h2><button type="button" onClick={closeAccountLayer}><X className="h-5 w-5"/></button></div><div className="grid gap-4 sm:grid-cols-2"><Field label={tr('Libellé','التسمية')}><input className={inputClass} value={addressDraft.label} onChange={(e)=>setAddressDraft({...addressDraft,label:e.target.value})}/></Field><Field label={tr('Destinataire','المستلم')}><input className={inputClass} value={addressDraft.recipientName} onChange={(e)=>setAddressDraft({...addressDraft,recipientName:e.target.value})} required/></Field><Field label={tr('Téléphone','الهاتف')}><input className={inputClass} value={addressDraft.phone} onChange={(e)=>setAddressDraft({...addressDraft,phone:e.target.value})} required/></Field><Field label={tr('Gouvernorat','الولاية')}><input className={inputClass} value={addressDraft.governorate} onChange={(e)=>setAddressDraft({...addressDraft,governorate:e.target.value})} required/></Field><Field label={tr('Ville','المدينة')}><input className={inputClass} value={addressDraft.city} onChange={(e)=>setAddressDraft({...addressDraft,city:e.target.value})}/></Field><Field label={tr('Code postal','الترقيم البريدي')}><input className={inputClass} value={addressDraft.postalCode} onChange={(e)=>setAddressDraft({...addressDraft,postalCode:e.target.value})}/></Field><div className="sm:col-span-2"><Field label={tr('Adresse complète','العنوان الكامل')}><textarea rows={3} className={inputClass} value={addressDraft.addressLine} onChange={(e)=>setAddressDraft({...addressDraft,addressLine:e.target.value})} required/></Field></div><div className="sm:col-span-2"><Field label={tr('Instructions','التعليمات')}><textarea rows={2} className={inputClass} value={addressDraft.deliveryNotes} onChange={(e)=>setAddressDraft({...addressDraft,deliveryNotes:e.target.value})}/></Field></div><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={addressDraft.isDefault} onChange={(e)=>setAddressDraft({...addressDraft,isDefault:e.target.checked})}/>{tr('Adresse par défaut','العنوان الافتراضي')}</label></div><div className="mt-6 flex gap-3"><button className="ay-btn-primary flex-1 text-sm">{tr('Enregistrer','حفظ')}</button><button type="button" onClick={closeAccountLayer} className="ay-btn-secondary text-sm">{tr('Annuler','إلغاء')}</button></div></form></div>}

    {orderLayer&&orderDetail&&<div className="fixed inset-0 z-[110] overflow-y-auto bg-surface"><AppHeader sticky title={orderDetail.order_number} subtitle={tr('Détail de la commande','تفاصيل الطلب')} onBack={closeAccountLayer}/><main className="mx-auto max-w-5xl space-y-5 px-4 py-5 sm:px-7">
      <section className="rounded-3xl bg-brand-gradient p-5 text-white"><div className="flex flex-wrap justify-between gap-4"><div><p className="text-xs text-white/65">{date(orderDetail.created_at,true)}</p><h2 className="mt-1 text-2xl font-black">{orderDetail.order_number}</h2><div className="mt-3"><Status value={orderDetail.status}/></div></div><strong className="text-2xl font-black text-accent">{money(orderDetail.total_tnd)}</strong></div></section>
      {(()=>{const map:Record<string,number>={CREATED:0,AWAITING_DEPOSIT:1,AWAITING_PAYMENT_VERIFICATION:2,CONFIRMED:3,PREPARING:4,SHIPPED:5,IN_TRANSIT:5,OUT_FOR_DELIVERY:5,DELIVERED:6};const stage=map[orderDetail.status]??0;const steps=[tr('Acompte','العربون'),tr('Validation','التحقق'),tr('Confirmée','مؤكد'),tr('Préparation','التجهيز'),tr('Expédition','الشحن'),tr('Livraison','التسليم')];if(orderDetail.status==='CANCELLED')return <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4 text-sm font-black text-danger">{tr('Commande annulée.','تم إلغاء الطلب.')}</div>;return <ol className="grid grid-cols-3 gap-2 rounded-2xl border border-line bg-white p-4 sm:grid-cols-6">{steps.map((label,index)=>{const n=index+1;const done=stage>n;const current=stage===n;return <li key={label} className="min-w-0 text-center"><span className={`mx-auto grid h-8 w-8 place-items-center rounded-full text-xs font-black ${done?'bg-brand text-white':current?'border-2 border-brand text-brand':'bg-surface text-muted'}`}>{done?<Check className="h-4 w-4"/>:n}</span><small className="mt-1 block break-words text-[9px] font-black text-muted">{label}</small></li>})}</ol>})()}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)]"><div className="space-y-5">
        <section className="rounded-2xl border border-line bg-white p-5"><h3 className="font-black">{tr('Articles','المنتجات')}</h3><div className="mt-3 divide-y divide-line">{orderDetail.items.map((item: CustomerOrderItem)=><div key={item.id} className="flex min-w-0 gap-3 py-3"><div className="h-14 w-14 shrink-0 bg-surface">{item.image_url&&<img src={item.image_url} alt="" className="h-full w-full object-contain"/>}</div><div className="min-w-0 flex-1"><strong className="block break-words text-sm">{item.product_name}</strong><span className="text-xs text-muted">{item.quantity} × {item.original_price} {item.currency}</span></div><strong className="shrink-0 text-sm">{money(item.total_tnd)}</strong></div>)}</div></section>
        <section className="rounded-2xl border border-line bg-white p-5"><h3 className="font-black">{tr('Historique vérifié','السجل الموثق')}</h3><div className="mt-4 space-y-4">{orderDetail.history.map((item: CustomerOrderHistoryEntry)=><div key={item.id} className="flex gap-3"><span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-brand"/><div className="min-w-0"><Status value={item.to_status}/><p className="mt-1 break-words text-xs text-muted">{item.note}</p><time className="text-[10px] text-muted">{date(item.created_at,true)}</time></div></div>)}</div></section>
      </div><div className="space-y-5">
        <section className="rounded-2xl border border-line bg-white p-5"><h3 className="font-black">{tr('Montants','المبالغ')}</h3><div className="mt-4 space-y-2 text-sm">{[['Sous-total',orderDetail.subtotal_tnd],['Douane',orderDetail.customs_tnd],['Livraison',orderDetail.shipping_tnd],['Service',orderDetail.service_tnd],['Express',orderDetail.express_tnd]].map(([label,value])=>Number(value)>0&&<div key={String(label)} className="flex justify-between gap-3"><span className="text-muted">{label}</span><strong>{money(value as number)}</strong></div>)}{Number(orderDetail.discount_tnd)>0&&<div className="flex justify-between text-success"><span>{tr('Réduction','التخفيض')}</span><strong>−{money(orderDetail.discount_tnd)}</strong></div>}<div className="flex justify-between border-t border-line pt-2 font-black"><span>Total</span><strong>{money(orderDetail.total_tnd)}</strong></div><div className="flex justify-between"><span className="text-muted">{tr('Acompte demandé','العربون المطلوب')} ({orderDetail.deposit_percent}%)</span><strong>{money(orderDetail.deposit_amount_tnd)}</strong></div><div className="flex justify-between text-success"><span>{tr('Payé','المدفوع')}</span><strong>{money(orderDetail.paid_amount_tnd)}</strong></div><div className="flex justify-between text-brand"><span>{tr('Reste à payer','المتبقي')}</span><strong>{money(orderDetail.remainder_tnd)}</strong></div></div></section>
        <section className="rounded-2xl border border-line bg-white p-5"><div className="flex items-center justify-between gap-2"><h3 className="font-black">{tr('Paiement de l’acompte','دفع العربون')}</h3><Status value={orderDetail.payment_status}/></div><p className="mt-2 text-xs text-muted">{tr('Méthode','الطريقة')} : {orderDetail.payment_method==='PENDING_SELECTION'?tr('À choisir','اختر الطريقة'):orderDetail.payment_method}</p>
          {orderDetail.status==='AWAITING_DEPOSIT'&&orderDetail.payment_status!=='PAID'&&<div className="mt-4 grid gap-3">
            <article className={`rounded-2xl border p-4 ${orderDetail.payment_method==='CARD'?'border-brand bg-brand/5':'border-line'}`}><CreditCard className="h-5 w-5 text-brand"/><strong className="mt-2 block text-sm">{tr('Carte bancaire','بطاقة بنكية')}</strong><p className="mt-1 text-[11px] leading-5 text-muted">{orderDetail.paymentOptions?.cardGatewayAvailable?tr('Paiement immédiat sécurisé; seul le serveur confirme le résultat.','دفع فوري آمن ولا يؤكد النتيجة إلا الخادم.'):tr('Passerelle non configurée : aucun paiement carte ne peut être lancé.','بوابة الدفع غير مضبوطة ولا يمكن بدء دفع بالبطاقة.')}</p><button onClick={startCardPayment} disabled={paymentBusy||!orderDetail.paymentOptions?.cardGatewayAvailable} className="ay-btn-primary mt-3 w-full text-xs">{paymentBusy&&<Loader2 className="h-4 w-4 animate-spin"/>}{tr('Payer l’acompte par carte','دفع العربون بالبطاقة')}</button></article>
            <article className={`rounded-2xl border p-4 ${['BANK_TRANSFER','POSTE'].includes(orderDetail.payment_method)?'border-brand bg-brand/5':'border-line'}`}><ReceiptText className="h-5 w-5 text-brand"/><strong className="mt-2 block text-sm">{tr('Virement bancaire / postal','تحويل بنكي / بريدي')}</strong><p className="mt-1 text-[11px] leading-5 text-muted">{tr('Le justificatif sera vérifié par AYROVI; son envoi ne confirme pas le paiement.','تتحقق AYROVI من الإثبات ورفعه لا يعني تأكيد الدفع.')}</p>{!orderDetail.paymentOptions.transfer.bankRib&&!orderDetail.paymentOptions.transfer.posteAccount&&<p className="mt-2 text-[11px] font-bold text-warning">{tr('Indisponible jusqu’à la publication des coordonnées officielles.','غير متاح حتى نشر البيانات الرسمية.')}</p>}{!['BANK_TRANSFER','POSTE'].includes(orderDetail.payment_method)&&<button onClick={()=>selectDepositMethod(orderDetail.paymentOptions.transfer.bankRib?'BANK_TRANSFER':'POSTE')} disabled={paymentBusy||(!orderDetail.paymentOptions.transfer.bankRib&&!orderDetail.paymentOptions.transfer.posteAccount)} className="ay-btn-secondary mt-3 w-full text-xs">{tr('Choisir le virement','اختيار التحويل')}</button>}</article>
          </div>}
          {['BANK_TRANSFER','POSTE'].includes(orderDetail.payment_method)&&orderDetail.status==='AWAITING_DEPOSIT'&&(()=>{
            const isPostal=orderDetail.payment_method==='POSTE';
            const coordinates=isPostal?orderDetail.paymentOptions.transfer.posteAccount:orderDetail.paymentOptions.transfer.bankRib;
            return <div className="mt-4 space-y-3 rounded-2xl border border-brand/20 bg-brand/5 p-4 text-xs">
              <p><strong>{orderDetail.paymentOptions.transfer.companyName}</strong></p>
              {coordinates?<p className="break-all">{isPostal?tr('Compte postal','الحساب البريدي'):'RIB'} : <strong>{coordinates}</strong></p>
                :<p className="font-bold text-warning">{tr('Coordonnées officielles non publiées; l’envoi du justificatif reste bloqué.','البيانات الرسمية غير منشورة؛ إرسال الإثبات معطل.')}</p>}
              {coordinates&&<>
                <Field label={tr('Référence du virement / versement','مرجع التحويل / الإيداع')}><input className={inputClass} value={transferReference} onChange={(e)=>setTransferReference(e.target.value.slice(0,120))} placeholder={tr('Référence réelle','المرجع الحقيقي')}/></Field>
                <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e)=>setProofFile(e.target.files?.[0]||null)} className="block w-full min-w-0 text-xs"/>
                <button onClick={uploadDepositProof} disabled={!proofFile||!transferReference.trim()||proofBusy} className="ay-btn-primary w-full text-xs">{proofBusy&&<Loader2 className="h-4 w-4 animate-spin"/>}{tr('Envoyer le justificatif','إرسال الإثبات')}</button>
              </>}
            </div>;
          })()}
          {orderDetail.proofs?.length>0&&<div className="mt-4 space-y-2 border-t border-line pt-4"><h4 className="text-xs font-black">{tr('Historique des justificatifs','سجل الإثباتات')}</h4>{orderDetail.proofs.map((proof: CustomerPaymentProof)=><div key={proof.id} className="rounded-xl bg-surface p-3 text-xs"><div className="flex justify-between gap-2"><span className="min-w-0 truncate">{proof.original_name}</span><Status value={proof.status}/></div><p className="mt-1 break-all text-muted">{proof.transfer_reference} · {date(proof.submitted_at,true)}</p>{proof.rejection_reason&&<p className="mt-2 font-bold text-danger">{proof.rejection_reason}</p>}</div>)}</div>}
          {orderDetail.transactions?.length>0&&<div className="mt-4 space-y-2 border-t border-line pt-4">{orderDetail.transactions.map((tx: CustomerPaymentTransaction)=><div key={tx.id} className="flex min-w-0 justify-between gap-3 text-xs"><span className="min-w-0 break-all font-mono">{tx.transaction_number}</span><Status value={tx.status}/></div>)}</div>}
        </section>
        <section className="rounded-2xl border border-line bg-white p-5"><h3 className="font-black">{tr('Facture & suivi','الفاتورة والتتبع')}</h3>{orderDetail.invoice?<a href={`/api/customer/account/orders/${orderDetail.id}/invoice`} className="ay-btn-secondary mt-4 w-full text-xs"><ArrowDown className="h-4 w-4"/>{orderDetail.invoice.invoice_number}</a>:<p className="mt-3 text-xs leading-5 text-muted">{tr('Aucune facture émise pour le moment.','لم تصدر فاتورة حتى الآن.')}</p>}{orderDetail.delivery?.tracking_number?<div className="mt-4 rounded-2xl border border-brand/20 bg-brand/5 p-4 text-xs"><strong className="block">{orderDetail.delivery.carrier}</strong><span className="mt-1 block break-all font-mono">{orderDetail.delivery.tracking_number}</span>{orderDetail.delivery.tracking_url&&<a href={orderDetail.delivery.tracking_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 font-black text-brand"><ExternalLink className="h-3.5 w-3.5"/>{tr('Ouvrir le suivi','فتح التتبع')}</a>}</div>:<p className="mt-3 text-xs leading-5 text-muted">{tr('Le suivi apparaîtra après l’expédition réelle.','سيظهر التتبع بعد الشحن الفعلي.')}</p>}</section>
        <section className="rounded-2xl border border-line bg-white p-5"><h3 className="font-black">{tr('Adresse de livraison','عنوان التسليم')}</h3><p className="mt-3 break-words text-sm leading-6 text-muted">{orderDetail.address}<br/>{orderDetail.governorate}<br/>{orderDetail.phone}</p></section>
      </div></div>
    </main></div>}
  </div>;
};
