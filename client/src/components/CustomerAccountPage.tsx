import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FcGoogle } from 'react-icons/fc';
import { FaFacebookF } from 'react-icons/fa6';
import {
  ArrowLeft, ArrowRight, Bell, Check, CheckCircle2, Heart, Home, Loader2, LogOut,
  MapPin, Package, Pencil, Phone, Plus, ShieldCheck, ShoppingBag, Trash2, User, X, Hourglass, AlertCircle, ArrowDown,
} from './QatafoIcons';

import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { CartItem, CustomerAccount, CustomerAddress, CustomerSession } from '../types';
import { customerApi } from '../customer/api';
import { getSessionId } from '../utils/session';
import { useNavigationHistory } from '../navigation/NavigationHistory';
import { useLocale } from '../i18n/LocaleContext';
import { AppHeader } from '../design/AppHeader';

interface CustomerAccountPageProps {
  isOpen: boolean;
  session: CustomerSession | null;
  initialSection?: Section;
  loadingSession: boolean;
  onClose: () => void;
  onSession: (session: CustomerSession) => void;
  onLoggedOut: () => void;
  onOpenCart: () => void;
  onCartChanged: () => void;
  initialMessage?: string;
}

type Section = 'home' | 'profile' | 'addresses' | 'orders' | 'favorites' | 'cart' | 'notifications';
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
  { id: 'profile', label: 'Profil', labelAr: 'الملف الشخصي', icon: User },
  { id: 'addresses', label: 'Adresses', labelAr: 'العناوين', icon: MapPin },
  { id: 'orders', label: 'Commandes', labelAr: 'الطلبات', icon: Package },
  { id: 'favorites', label: 'Favoris', labelAr: 'المفضلة', icon: Heart },
  { id: 'cart', label: 'Panier', labelAr: 'السلة', icon: ShoppingBag },
  { id: 'notifications', label: 'Notifications', labelAr: 'الإشعارات', icon: Bell },
];

const statusLabels: Record<string, string> = {
  NEW: 'Reçue', CONFIRMED: 'Confirmée', PAYMENT_PENDING: 'Paiement en attente', PAID: 'Payée',
  PURCHASING: 'Achat en cours', PURCHASED: 'Achetée', IN_TRANSIT: 'En transit', ARRIVED: 'Arrivée',
  OUT_FOR_DELIVERY: 'En livraison', DELIVERED: 'Livrée', CANCELLED: 'Annulée', PENDING: 'En attente',
};
const statusLabelsAr: Record<string, string> = {
  NEW: 'تم الاستلام', CONFIRMED: 'مؤكد', PAYMENT_PENDING: 'في انتظار الدفع', PAID: 'مدفوع',
  PURCHASING: 'جارٍ الشراء', PURCHASED: 'تم الشراء', IN_TRANSIT: 'قيد الشحن', ARRIVED: 'وصل',
  OUT_FOR_DELIVERY: 'خرج للتوصيل', DELIVERED: 'تم التسليم', CANCELLED: 'ملغى', PENDING: 'قيد الانتظار',
};


function Status({ value }: { value: string }) {
  const { isArabic } = useLocale();
  const complete = ['DELIVERED', 'PAID', 'ARRIVED'].includes(value);
  const cancelled = value === 'CANCELLED' || value === 'FAILED';
  return <span className={`inline-flex px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${complete ? 'bg-brand/10 text-brand-dark' : cancelled ? 'bg-danger/5 text-danger' : 'bg-accent/15 text-ink'}`}>{(isArabic ? statusLabelsAr[value] : statusLabels[value]) || value.replaceAll('_', ' ')}</span>;
}

function Empty({ icon: Icon, title, text }: { icon: React.ComponentType<any>; title: string; text: string }) {
  return <div className="border border-line bg-white px-6 py-14 text-center"><span className="mx-auto grid h-14 w-14 place-items-center bg-brand/10 text-brand"><Icon className="h-6 w-6" /></span><h3 className="mt-4 text-lg font-black text-ink">{title}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">{text}</p></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-black text-ink">{label}</span>{children}</label>;
}

const AccountTabs: React.FC<{
  section: Section;
  unread: number;
  onOpen: (section: Section) => void;
}> = ({ section, unread, onOpen }) => {
  const { isArabic } = useLocale();
  const navRef = useRef<HTMLElement>(null);
  const [edgeVisible, setEdgeVisible] = useState({ start: false, end: true });
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const first = nav.firstElementChild;
    const last = nav.lastElementChild;
    if (!first || !last) return;
    const visibility = { first: false, last: false };
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === first) visibility.first = entry.isIntersecting;
        if (entry.target === last) visibility.last = entry.isIntersecting;
      }
      setEdgeVisible({ start: !visibility.first, end: !visibility.last });
    }, { root: nav, threshold: 0.98 });
    observer.observe(first); observer.observe(last);
    return () => observer.disconnect();
  }, []);
  return <div className="relative min-w-0">
    <nav ref={navRef} className="flex gap-1 overflow-x-auto no-scrollbar lg:block lg:space-y-1" aria-label={isArabic ? 'أقسام الحساب' : 'Rubriques du compte'}>
      {sectionItems.map(({ id, label, labelAr, icon: Icon }) => <button key={id} onClick={() => onOpen(id)} className={`flex shrink-0 items-center gap-2 rounded-control px-3 py-2.5 text-xs font-black transition lg:w-full lg:text-sm ${section === id ? 'bg-brand text-white' : 'text-muted hover:bg-brand/5 hover:text-brand'}`}><Icon className="h-4 w-4" />{isArabic ? labelAr : label}{id === 'notifications' && unread > 0 && <span className="ms-auto rounded-full bg-accent px-1.5 text-[9px] text-ink">{unread}</span>}</button>)}
    </nav>
    {edgeVisible.start && <span className="ay-tab-edge-start pointer-events-none absolute inset-y-0 start-0 w-8 lg:hidden" />}
    {edgeVisible.end && <span className="ay-tab-edge-end pointer-events-none absolute inset-y-0 end-0 w-8 lg:hidden" />}
  </div>;
};

const inputClass = 'min-h-12 w-full rounded-xl border border-line bg-white px-3.5 py-3 text-sm font-semibold text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:bg-surface disabled:text-muted';

export const CustomerAccountPage: React.FC<CustomerAccountPageProps> = ({
  isOpen, session, loadingSession, onClose, onSession, onLoggedOut, onOpenCart, onCartChanged, initialMessage, initialSection = 'home',
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
  const [overview, setOverview] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState({ displayName: '', email: '', marketingOptIn: false });
  const [addressDraft, setAddressDraft] = useState<AddressDraft | null>(null);
  const [orderDetail, setOrderDetail] = useState<any>(null);
  const [busyId, setBusyId] = useState('');
  const sectionRequestRef = useRef(0);
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
        const result = await customerApi<any>('/api/customer/account/overview');
        if (requestId === sectionRequestRef.current) setOverview(result.data);
      } else if (target === 'addresses') {
        const result = await customerApi<any>('/api/customer/account/addresses');
        if (requestId === sectionRequestRef.current) setRows(result.data);
      } else if (target === 'orders') {
        const result = await customerApi<any>('/api/customer/account/orders');
        if (requestId === sectionRequestRef.current) setRows(result.data);
      } else if (target === 'favorites') {
        const result = await customerApi<any>('/api/customer/account/favorites');
        if (requestId === sectionRequestRef.current) setRows(result.data);
      } else if (target === 'cart') {
        const result = await customerApi<any>('/api/cart/items');
        if (requestId === sectionRequestRef.current) setRows(result.items || []);
      } else if (target === 'notifications') {
        const result = await customerApi<any>('/api/customer/account/notifications');
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
      const result = await customerApi<any>(`/api/customer/account/orders/${id}`);
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
    const address = rows.find((item) => item.id === addressId) as CustomerAddress | undefined;
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
      await customerApi(`/api/customer/account/orders/${orderDetail.id}/deposit-proof`, { method: 'POST', body: form }, session.csrfToken);
      setProofFile(null);
      await loadOrderDetail(orderDetail.id);
      setNotice('Preuve d’acompte envoyée — vérification par notre équipe en cours.');
    } catch (reason: any) { setError(reason.message); }
    finally { setProofBusy(false); }
  };

  const unreadCount = useMemo(() => rows.filter((item) => !item.read_at).length, [rows]);
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
      <div className="mb-8 text-center"><img src="/media/logo-ayrovi-black.png" alt="AYROVI" className="mx-auto h-20 w-20 object-contain" /><h1 className="mt-5 text-3xl font-black tracking-[-0.045em] text-ink">{phoneLinkOpen ? tr('Vérifier mon téléphone', 'توثيق هاتفي') : tr('Bienvenue chez AYROVI', 'مرحبًا بك في AYROVI')}</h1><p className="mt-2 text-sm leading-6 text-muted">{phoneLinkOpen ? (session?.account.emailVerified ? tr('Ajoutez un second canal vérifié pour renforcer votre compte.', 'أضف قناة موثقة ثانية لتعزيز أمان حسابك.') : tr('Un e-mail ou un téléphone vérifié est requis pour confirmer une commande.', 'يلزم بريد إلكتروني أو هاتف موثّق لتأكيد الطلب.')) : tr('Votre panier, vos commandes et vos adresses sur tous vos appareils.', 'سلّتك وطلباتك وعناوينك متاحة على جميع أجهزتك.')}</p></div>
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
    const counts = overview?.counts || {};
    const cards = [
      { label: tr('Commandes', 'الطلبات'), value: counts.orders || 0, icon: Package, section: 'orders' as Section },
      { label: tr('Adresses', 'العناوين'), value: counts.addresses || 0, icon: MapPin, section: 'addresses' as Section },
      { label: tr('Favoris', 'المفضلة'), value: counts.favorites || 0, icon: Heart, section: 'favorites' as Section },
      { label: tr('Dans le panier', 'في السلة'), value: counts.cartItems || 0, icon: ShoppingBag, section: 'cart' as Section },
    ];
    return <div className="space-y-6">
      <section className="relative overflow-hidden bg-brand-gradient p-6 text-white sm:p-8"><div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-brand/70 blur-2xl" /><p className="relative text-xs font-black uppercase tracking-[0.18em] text-accent">{tr('Mon espace AYROVI', 'فضائي في AYROVI')}</p><h2 className="relative mt-2 text-3xl font-black tracking-tight">{tr('Bonjour', 'مرحبًا')}، {session!.account.displayName || tr('Client AYROVI', 'حريف AYROVI')}</h2><p className="relative mt-2 text-sm text-white/65">{tr(`${formatMoney(overview?.totalSpent)} commandés au total`, `إجمالي الطلبات ${formatMoney(overview?.totalSpent)}`)}</p></section>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{cards.map(({ label, value, icon: Icon, section: target }) => <button key={target} onClick={() => openSection(target)} className="border border-line bg-white p-4 text-left transition hover:border-brand"><Icon className="h-5 w-5 text-brand" /><strong className="mt-4 block text-2xl font-black text-ink">{value}</strong><span className="text-xs font-bold text-muted">{label}</span></button>)}</div>
      <section><div className="mb-3 flex items-center justify-between"><h3 className="text-lg font-black text-ink">{tr('Commandes récentes', 'الطلبات الأخيرة')}</h3><button onClick={() => openSection('orders')} className="text-xs font-black text-brand">{tr('Tout voir', 'عرض الكل')}</button></div>{overview?.recentOrders?.length ? <div className="divide-y divide-slate-100 border border-line bg-white">{overview.recentOrders.map((order: any) => <button key={order.id} onClick={() => openOrder(order.id)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-surface"><div className="grid h-12 w-12 shrink-0 place-items-center bg-brand/10 text-brand">{order.image_url ? <img src={order.image_url} alt="" className="h-full w-full object-cover" /> : <Package className="h-5 w-5" />}</div><div className="min-w-0 flex-1"><strong className="block truncate text-sm text-ink">{order.order_number}</strong><span className="text-xs text-muted">{formatDate(order.created_at)} · {order.item_count} {tr('article(s)', 'منتج')}</span></div><div className="text-end"><Status value={order.status} /><strong className="mt-1 block text-sm">{formatMoney(order.total_tnd)}</strong></div></button>)}</div> : <Empty icon={Package} title={tr('Aucune commande', 'لا توجد طلبات')} text={tr('Vos futures commandes apparaîtront ici.', 'ستظهر طلباتك القادمة هنا.')} />}</section>
    </div>;
  };

  const renderProfile = () => (
    <form onSubmit={saveProfile} className="max-w-2xl space-y-5 rounded-[28px] border border-line bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-center gap-4 border-b border-line pb-5">
        <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-brand text-xl font-black text-white shadow-lg shadow-brand/20">
          {session!.account.avatarUrl ? <img src={session!.account.avatarUrl} alt={tr('Photo de profil', 'صورة الحساب')} className="h-full w-full object-cover" /> : (session!.account.displayName || 'AY').slice(0, 2).toUpperCase()}
        </div>
        <div><h3 className="font-black text-ink">{tr('Identité du compte', 'هوية الحساب')}</h3><p className="mt-1 text-xs leading-5 text-muted">{tr('Gérez les informations utilisées pour vos commandes et notifications.', 'أدر البيانات المستخدمة في طلباتك وإشعاراتك.')}</p></div>
      </div>
      <Field label={tr('Nom et prénom', 'الاسم واللقب')}><input className={inputClass} value={profile.displayName} onChange={(event) => setProfile({ ...profile, displayName: event.target.value.slice(0, 120) })} autoComplete="name" minLength={2} maxLength={120} required /></Field>
      <Field label={tr('Adresse e-mail', 'البريد الإلكتروني')}><input type="email" className={inputClass} value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value.slice(0, 180) })} placeholder="vous@exemple.com" autoComplete="email" maxLength={180} inputMode="email" /></Field>
      <Field label={tr('Téléphone de sécurité', 'هاتف الأمان')}>
        <div className="flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm font-bold text-muted"><Phone className="h-4 w-4 text-brand" />{session!.account.phone || tr('Non renseigné', 'غير مسجل')}{session!.account.phoneVerified && <CheckCircle2 className="ms-auto h-4 w-4 text-success" />}</div>
        {!session!.account.phoneVerified && <button type="button" onClick={() => navigation.pushLayer({ id: 'account:phone-link' })} className="ay-btn-secondary mt-2 w-full text-xs"><ShieldCheck className="h-4 w-4" />{session!.account.emailVerified ? tr('Ajouter un téléphone vérifié', 'إضافة هاتف موثّق') : tr('Vérifier mon téléphone pour sécuriser les commandes', 'توثيق هاتفي لتأمين الطلبات')}</button>}
      </Field>
      <label className="flex items-start gap-3 rounded-2xl border border-line p-4"><input type="checkbox" checked={profile.marketingOptIn} onChange={(event) => setProfile({ ...profile, marketingOptIn: event.target.checked })} className="mt-0.5 h-5 w-5 accent-brand" /><span><strong className="block text-sm text-ink">{tr('Magazine et offres AYROVI', 'مجلتي وعروض AYROVI')}</strong><small className="text-xs leading-5 text-muted">{tr('Recevoir les offres et nouveaux arrivages.', 'استلام العروض وأخبار المنتجات الجديدة.')}</small></span></label>
      <button disabled={busyId === 'profile'} className="ay-btn-primary text-sm">{busyId === 'profile' && <Loader2 className="h-4 w-4 animate-spin" />}{tr('Enregistrer le profil', 'حفظ الملف الشخصي')}</button>
      <section className="border-t border-danger/15 pt-5"><h4 className="text-sm font-black text-danger">{tr('Supprimer mon compte', 'حذف حسابي')}</h4><p className="mt-1 text-xs leading-5 text-muted">{tr('Supprime le profil, les connexions, sessions, adresses et favoris. Les documents de commande déjà créés restent archivés sans accès au compte.', 'يحذف الملف الشخصي وبيانات الدخول والجلسات والعناوين والمفضلة. تبقى وثائق الطلبات السابقة مؤرشفة دون ربطها بالحساب.')}</p><button type="button" disabled={busyId === 'delete-account'} onClick={deleteAccount} className="mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-danger/30 px-4 py-2.5 text-xs font-black text-danger disabled:opacity-50">{busyId === 'delete-account' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{tr('Supprimer définitivement le compte', 'حذف الحساب نهائيًا')}</button></section>
    </form>
  );

  const renderAddresses = () => <div className="space-y-4"><button onClick={() => editAddress()} className="ay-btn-primary text-sm"><Plus className="h-4 w-4" />{tr('Ajouter une adresse', 'إضافة عنوان')}</button>{rows.length ? <div className="grid gap-4 lg:grid-cols-2">{rows.map((address: CustomerAddress) => <article key={address.id} className="border border-line bg-white p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-black text-ink">{address.label}</h3>{Boolean(address.is_default) && <span className="bg-brand/10 px-2 py-1 text-[9px] font-black uppercase text-brand">{tr('Par défaut', 'الافتراضي')}</span>}</div><p className="mt-3 text-sm font-bold">{address.recipient_name}</p><p className="mt-1 text-sm leading-6 text-muted">{address.address_line}<br />{address.city ? `${address.city}, ` : ''}{address.governorate}{address.postal_code ? ` ${address.postal_code}` : ''}<br />{address.phone}</p>{address.delivery_notes && <p className="mt-2 text-xs italic text-muted">{address.delivery_notes}</p>}</div><MapPin className="h-5 w-5 shrink-0 text-brand" /></div><div className="mt-5 flex gap-2 border-t border-line pt-4"><button onClick={() => editAddress(address)} className="flex items-center gap-1.5 px-3 py-2 text-xs font-black text-brand"><Pencil className="h-3.5 w-3.5" />{tr('Modifier', 'تعديل')}</button><button disabled={busyId === address.id} onClick={() => deleteAddress(address.id)} className="flex items-center gap-1.5 px-3 py-2 text-xs font-black text-danger"><Trash2 className="h-3.5 w-3.5" />{tr('Supprimer', 'حذف')}</button></div></article>)}</div> : <Empty icon={MapPin} title={tr('Aucune adresse enregistrée', 'لا يوجد عنوان محفوظ')} text={tr('Ajoutez vos adresses de livraison pour accélérer la commande.', 'أضف عناوين التسليم لتسريع الطلب.')} />}</div>;

  const renderOrders = () => rows.length ? <div className="space-y-3">{rows.map((order) => <button key={order.id} onClick={() => openOrder(order.id)} className="grid w-full grid-cols-[56px_1fr_auto] items-center gap-3 border border-line bg-white p-4 text-left hover:border-brand"><div className="grid h-14 w-14 place-items-center overflow-hidden bg-brand/10 text-brand">{order.image_url ? <img src={order.image_url} alt="" className="h-full w-full object-cover" /> : <Package className="h-5 w-5" />}</div><div className="min-w-0"><strong className="block truncate text-sm text-ink">{order.order_number}</strong><span className="mt-1 block text-xs text-muted">{formatDate(order.created_at)} · {order.item_count} {tr('article(s)', 'منتج')}</span><span className="mt-2 block"><Status value={order.status} /></span></div><div className="text-end"><strong className="block text-sm text-ink">{formatMoney(order.total_tnd)}</strong>{busyId === order.id ? <Loader2 className="ms-auto mt-2 h-4 w-4 animate-spin text-brand" /> : <ArrowRight className="ms-auto mt-2 h-4 w-4 text-muted" />}</div></button>)}</div> : <Empty icon={Package} title={tr('Aucune commande', 'لا توجد طلبات')} text={tr('Après votre premier achat, le suivi détaillé apparaîtra ici.', 'بعد أول عملية شراء سيظهر التتبع المفصل هنا.')} />;

  const renderFavorites = () => rows.length ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{rows.map((favorite) => <article key={favorite.id} className="overflow-hidden border border-line bg-white"><a href={favorite.source_url || '#'} target={favorite.source_url ? '_blank' : undefined} rel="noreferrer" className="block aspect-square bg-surface">{favorite.image_url ? <img src={favorite.image_url} alt={favorite.title} className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center"><Heart className="h-7 w-7 text-brand" /></span>}</a><div className="p-3"><h3 className="line-clamp-2 text-sm font-black text-ink">{favorite.title}</h3>{favorite.price_tnd != null && <strong className="mt-2 block text-sm text-brand">{formatMoney(favorite.price_tnd)}</strong>}<button disabled={busyId === favorite.id} onClick={() => removeFavorite(favorite.id)} className="mt-3 flex items-center gap-1 text-[11px] font-black text-danger"><Trash2 className="h-3.5 w-3.5" />{tr('Retirer', 'إزالة')}</button></div></article>)}</div> : <Empty icon={Heart} title={tr('Aucun favori', 'لا توجد مفضلة')} text={tr('Les produits que vous enregistrerez seront conservés ici.', 'ستُحفظ المنتجات التي تضيفها إلى المفضلة هنا.')} />;

  const renderCart = () => rows.length ? <div className="space-y-4"><div className="space-y-3">{rows.map((item: CartItem) => <article key={item.id} className="flex gap-3 border border-line bg-white p-4"><div className="h-16 w-16 shrink-0 overflow-hidden bg-surface">{item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-contain" /> : <ShoppingBag className="m-auto mt-5 h-6 w-6 text-brand" />}</div><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-black text-ink">{item.title}</h3><p className="mt-1 text-xs text-muted">{item.variant || item.store}</p><strong className="mt-2 block text-sm text-brand">{formatMoney(item.lineTotalTND ?? item.priceTND)}</strong></div><div className="flex shrink-0 flex-col items-end justify-between"><button disabled={busyId === item.id} onClick={() => updateCart(item, 0)} aria-label={tr('Supprimer', 'حذف')}><Trash2 className="h-4 w-4 text-danger" /></button><div className="flex items-center border border-line"><button disabled={busyId === item.id} onClick={() => updateCart(item, Math.max(0, item.quantity - 1))} className="h-8 w-8 font-black">−</button><span className="min-w-7 text-center text-xs font-black">{item.quantity}</span><button disabled={busyId === item.id || item.quantity >= 99} onClick={() => updateCart(item, item.quantity + 1)} className="h-8 w-8 font-black">+</button></div></div></article>)}</div><button onClick={onOpenCart} className="ay-btn-primary w-full text-sm">{tr('Ouvrir le panier et commander', 'فتح السلة وإتمام الطلب')}</button></div> : <Empty icon={ShoppingBag} title={tr('Votre panier est vide', 'سلّتك فارغة')} text={tr('Ajoutez un article avec Lens pour le retrouver sur tous vos appareils.', 'أضف منتجًا عبر Lens لتجده على جميع أجهزتك.')} />;

  const renderNotifications = () => <div className="space-y-3">{rows.length > 0 && unreadCount > 0 && <button disabled={busyId === 'notifications'} onClick={markNotificationsRead} className="ay-btn-secondary text-xs"><Check className="h-4 w-4" />{tr('Tout marquer comme lu', 'تحديد الكل كمقروء')}</button>}{rows.length ? rows.map((item) => <article key={item.id} className={`flex gap-3 border p-4 ${item.read_at ? 'border-line bg-white' : 'border-brand/30 bg-brand/5'}`}><span className="grid h-10 w-10 shrink-0 place-items-center bg-brand text-white">{item.type === 'ORDER' ? <Package className="h-4 w-4" /> : <Bell className="h-4 w-4" />}</span><div><div className="flex items-center gap-2"><h3 className="text-sm font-black text-ink">{item.title}</h3>{!item.read_at && <span className="h-2 w-2 rounded-full bg-brand" />}</div><p className="mt-1 text-sm leading-5 text-muted">{item.message}</p><time className="mt-2 block text-[10px] font-bold text-muted">{formatDate(item.created_at, true)}</time></div></article>) : <Empty icon={Bell} title={tr('Aucune notification', 'لا توجد إشعارات')} text={tr('Les confirmations et mises à jour de commande apparaîtront ici.', 'ستظهر تأكيدات الطلب وتحديثاته هنا.')} />}</div>;

  const renderSection = () => {
    if (loading) return <div className="grid min-h-64 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-brand" /></div>;
    if (section === 'home') return renderHome();
    if (section === 'profile') return renderProfile();
    if (section === 'addresses') return renderAddresses();
    if (section === 'orders') return renderOrders();
    if (section === 'favorites') return renderFavorites();
    if (section === 'cart') return renderCart();
    return renderNotifications();
  };

  return <div className="fixed inset-0 z-[95] overflow-hidden bg-surface" dir={direction} role="dialog" aria-modal="true" aria-label={session ? tr('Mon compte AYROVI', 'حسابي في AYROVI') : tr('Connexion client AYROVI', 'تسجيل الدخول إلى AYROVI')}>
    <AppHeader title="AYROVI" subtitle={tr('Espace client', 'فضاء العميل')} onClose={onClose} actionLabel={tr('Fermer mon compte', 'إغلاق حسابي')} />
    <div className="h-[calc(100dvh-4.25rem)] overflow-y-auto sm:h-[calc(100dvh-5.25rem)]">{loadingSession ? <div className="grid h-full place-items-center"><Loader2 className="h-8 w-8 animate-spin text-brand" /></div> : (!session || phoneLinkOpen) ? authPanel : <div className="mx-auto grid min-h-full w-full min-w-0 max-w-7xl grid-cols-[minmax(0,1fr)] lg:grid-cols-[250px_minmax(0,1fr)]"><aside className="min-w-0 border-b border-line bg-white p-3 lg:border-b-0 lg:border-r lg:p-5"><div className="mb-4 hidden items-center gap-3 border-b border-line pb-5 lg:flex"><div className="grid h-11 w-11 place-items-center overflow-hidden bg-brand text-sm font-black text-white">{session.account.avatarUrl ? <img src={session.account.avatarUrl} className="h-full w-full object-cover" alt="" /> : (session.account.displayName || 'AY').slice(0, 2).toUpperCase()}</div><div className="min-w-0"><strong className="block truncate text-sm text-ink">{session.account.displayName}</strong><span className="block truncate text-[10px] text-muted">{session.account.phone || session.account.email}</span></div></div><AccountTabs section={section} unread={Number(overview?.counts?.unreadNotifications || 0)} onOpen={openSection} /><button onClick={logout} className="mt-5 hidden w-full items-center gap-2 border-t border-line px-3 pt-5 text-sm font-black text-danger lg:flex"><LogOut className="h-4 w-4" />{tr('Se déconnecter', 'تسجيل الخروج')}</button></aside><main className="min-w-0 px-4 py-4 sm:px-7 sm:py-5 lg:px-10"><div className="mb-4 flex items-center justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand">{tr('Mon compte', 'حسابي')}</p><h1 className="mt-1 text-2xl font-black tracking-tight text-ink">{(() => { const item = sectionItems.find((entry) => entry.id === section); return item ? (isArabic ? item.labelAr : item.label) : ''; })()}</h1></div><button onClick={logout} className="flex items-center gap-1.5 text-xs font-black text-danger lg:hidden"><LogOut className="h-4 w-4" />{tr('Sortir', 'خروج')}</button></div>{notice && <div className="mb-5 flex items-start gap-2 border border-success/20 bg-success/5 p-3 text-sm font-bold text-success"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{notice}</span><button onClick={() => setNotice('')} className="ms-auto"><X className="h-4 w-4" /></button></div>}{error && <div className="mb-5 border border-danger/20 bg-danger/5 p-3 text-sm font-bold text-danger">{error}</div>}{renderSection()}</main></div>}</div>

    {addressLayer && addressDraft && session && <div className="fixed inset-0 z-[110] grid place-items-end bg-black/45 sm:place-items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) closeAccountLayer(); }}><form onSubmit={saveAddress} className="max-h-[92dvh] w-full overflow-y-auto bg-white p-5 sm:max-w-xl sm:p-7"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black text-ink">{addressDraft.id ? tr('Modifier l’adresse', 'تعديل العنوان') : tr('Nouvelle adresse', 'عنوان جديد')}</h2><button type="button" onClick={closeAccountLayer}><X className="h-5 w-5" /></button></div><div className="grid gap-4 sm:grid-cols-2"><Field label={tr('Libellé', 'التسمية')}><input className={inputClass} value={addressDraft.label} onChange={(e) => setAddressDraft({ ...addressDraft, label: e.target.value })} /></Field><Field label={tr('Destinataire', 'المستلم')}><input className={inputClass} value={addressDraft.recipientName} onChange={(e) => setAddressDraft({ ...addressDraft, recipientName: e.target.value })} required /></Field><Field label={tr('Téléphone', 'الهاتف')}><input type="tel" className={inputClass} value={addressDraft.phone} onChange={(e) => setAddressDraft({ ...addressDraft, phone: e.target.value })} required /></Field><Field label={tr('Gouvernorat', 'الولاية')}><input className={inputClass} value={addressDraft.governorate} onChange={(e) => setAddressDraft({ ...addressDraft, governorate: e.target.value })} required /></Field><Field label={tr('Ville / délégation', 'المدينة / المعتمدية')}><input className={inputClass} value={addressDraft.city} onChange={(e) => setAddressDraft({ ...addressDraft, city: e.target.value })} /></Field><Field label={tr('Code postal', 'الترقيم البريدي')}><input className={inputClass} value={addressDraft.postalCode} onChange={(e) => setAddressDraft({ ...addressDraft, postalCode: e.target.value })} /></Field><div className="sm:col-span-2"><Field label={tr('Adresse complète', 'العنوان الكامل')}><textarea rows={3} className={inputClass} value={addressDraft.addressLine} onChange={(e) => setAddressDraft({ ...addressDraft, addressLine: e.target.value })} required /></Field></div><div className="sm:col-span-2"><Field label={tr('Instructions de livraison', 'تعليمات التسليم')}><textarea rows={2} className={inputClass} value={addressDraft.deliveryNotes} onChange={(e) => setAddressDraft({ ...addressDraft, deliveryNotes: e.target.value })} /></Field></div><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={addressDraft.isDefault} onChange={(e) => setAddressDraft({ ...addressDraft, isDefault: e.target.checked })} className="accent-brand" />{tr('Adresse par défaut', 'العنوان الافتراضي')}</label></div><div className="mt-6 flex gap-3"><button disabled={busyId === 'address'} className="ay-btn-primary flex-1 text-sm">{busyId === 'address' && <Loader2 className="h-4 w-4 animate-spin" />}{tr('Enregistrer', 'حفظ')}</button><button type="button" onClick={closeAccountLayer} className="ay-btn-secondary text-sm">{tr('Annuler', 'إلغاء')}</button></div></form></div>}

    {orderLayer && orderDetail && <div className="fixed inset-0 z-[110] overflow-y-auto bg-surface"><AppHeader sticky title={orderDetail.order_number} subtitle={tr('Détail de la commande', 'تفاصيل الطلب')} onBack={closeAccountLayer} /><main className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-7"><section className="bg-brand-gradient p-6 text-white"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold text-white/55">{tr('Commande du', 'طلب بتاريخ')} {formatDate(orderDetail.created_at)}</p><h2 className="mt-2 text-2xl font-black">{orderDetail.order_number}</h2><div className="mt-3"><Status value={orderDetail.status} /></div></div><strong className="text-2xl font-black text-accent">{formatMoney(orderDetail.total_tnd)}</strong></div></section>{(() => {
      // خط مراحل الطلب: انتظار الدفع ← مراجعة الوصل ← شراء/تأكيد ← قيد الشحن ← تسليم
      const cancelled = orderDetail.status === 'CANCELLED';
      const stage = cancelled ? 0
        : orderDetail.status === 'DELIVERED' ? 5
        : ['IN_TRANSIT','ARRIVED','OUT_FOR_DELIVERY'].includes(orderDetail.status) ? 4
        : ['CONFIRMED','PAID','PURCHASING','PURCHASED'].includes(orderDetail.status) ? 3
        : orderDetail.deposit_status === 'SUBMITTED' ? 2 : 1;
      const steps = [
        { id: 1, label: tr('En attente d’acompte', 'في انتظار العربون') }, { id: 2, label: tr('Vérification du reçu', 'التحقق من الوصل') },
        { id: 3, label: tr('Achat confirmé', 'تم تأكيد الشراء') }, { id: 4, label: tr('En expédition', 'قيد الشحن') }, { id: 5, label: tr('Livrée', 'تم التسليم') },
      ];
      if (cancelled) return <section className="border border-danger/20 bg-danger/5 p-4 text-sm font-black text-danger">{tr('Cette commande a été annulée. Contactez le support AYROVI pour toute question.', 'أُلغي هذا الطلب. تواصل مع دعم AYROVI لأي استفسار.')}</section>;
      return <section className="border border-line bg-white p-5"><h3 className="mb-4 font-black">{tr('Progression de la commande', 'تقدم الطلب')}</h3>
        <ol className="flex items-start">{steps.map((step, index) => {
          const done = stage > step.id; const current = stage === step.id;
          return <li key={step.id} className="relative flex-1 text-center">
            {index > 0 && <span className={`absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2 ${done || current ? 'bg-brand' : 'bg-line'}`} />}
            <span className={`relative z-10 mx-auto grid h-8 w-8 place-items-center rounded-full text-[11px] font-black ${done ? 'bg-brand text-white' : current ? 'bg-white text-brand ring-2 ring-brand' : 'bg-surface text-muted'}`}>{done ? <Check className="h-4 w-4" /> : step.id}</span>
            <span className={`mt-1.5 block px-0.5 text-[9px] font-black leading-tight sm:text-[10px] ${current ? 'text-brand' : done ? 'text-muted' : 'text-muted'}`}>{step.label}</span>
          </li>;
        })}</ol></section>;
    })()}<section className="border border-line bg-white p-5"><h3 className="mb-4 font-black">{tr('Articles', 'المنتجات')}</h3><div className="divide-y divide-slate-100">{orderDetail.items?.map((item: any) => <div key={item.id} className="flex gap-3 py-3"><div className="h-14 w-14 shrink-0 overflow-hidden bg-surface">{item.image_url && <img src={item.image_url} alt="" className="h-full w-full object-contain" />}</div><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{item.product_name}</strong><span className="text-xs text-muted">{item.quantity} × {item.original_price} {item.currency}{item.variant ? ` · ${item.variant}` : ''}</span>{(item.requested_size||item.requested_color)&&<span className="block text-xs text-muted">{[item.requested_size&&`${tr('Taille', 'المقاس')} ${item.requested_size}`,item.requested_color&&`${tr('Couleur', 'اللون')} ${item.requested_color}`].filter(Boolean).join(' · ')}</span>}{item.customer_note&&<span className="block text-xs text-muted">{tr('Note', 'ملاحظة')} : {item.customer_note}</span>}{item.price_verification_status==='PENDING_MANUAL'&&<span className="block text-xs font-bold text-warning">⏳ {tr('Vérification manuelle en cours', 'التحقق اليدوي جارٍ')}</span>}{/^https?:\/\//i.test(item.source_url||'')&&<a href={item.source_url} target="_blank" rel="noreferrer" className="block text-xs font-bold text-brand underline">{tr('Voir le lien fourni', 'عرض الرابط المقدم')}</a>}</div><strong className="text-sm">{formatMoney(item.total_tnd)}</strong></div>)}</div></section><div className="grid gap-5 md:grid-cols-2"><section className="border border-line bg-white p-5"><h3 className="font-black">{tr('Livraison', 'التسليم')}</h3><p className="mt-3 text-sm leading-6 text-muted">{orderDetail.address}<br />{orderDetail.governorate}<br />{orderDetail.phone}</p>{orderDetail.delivery && <div className="mt-3"><Status value={orderDetail.delivery.status} /></div>}</section><section className="border border-line bg-white p-5"><h3 className="font-black">{tr('Paiement & acompte', 'الدفع والعربون')}</h3><p className="mt-3 text-sm text-muted">{tr('Méthode', 'الطريقة')} : <strong>{({ CARD: tr('Carte bancaire', 'بطاقة بنكية'), FLOUCI: 'Flouci', BANK_TRANSFER: tr('Virement bancaire', 'تحويل بنكي'), POSTE: tr('Mandat postal', 'حوالة بريدية'), COD: tr('À la livraison', 'عند التسليم'), D17: 'D17' } as any)[String(orderDetail.payment_method).toUpperCase()] || orderDetail.payment_method}</strong></p>
{orderDetail.deposit_status && orderDetail.deposit_status !== 'NONE' && <div className="mt-3 space-y-3 border-t border-line pt-3">
{Number(orderDetail.deposit_discount_tnd) > 0 && <>
<div className="flex items-center justify-between text-xs"><span className="font-bold text-muted">{tr('Acompte', 'العربون')} ({Number(orderDetail.deposit_percent || 20)}%) {tr('avant remise', 'قبل الخصم')}</span><strong>{formatMoney(Number(orderDetail.deposit_amount_tnd) + Number(orderDetail.deposit_discount_tnd))}</strong></div>
<div className="flex items-center justify-between text-xs"><span className="font-bold text-success">{tr('Remise carte bancaire', 'خصم البطاقة البنكية')}</span><strong className="text-success">−{formatMoney(orderDetail.deposit_discount_tnd)}</strong></div></>}
<div className="flex items-center justify-between text-xs"><span className="font-bold text-muted">{tr('Acompte à payer', 'العربون المطلوب')}</span><strong>{formatMoney(orderDetail.deposit_amount_tnd)}</strong></div>
<div className="flex items-center justify-between text-xs"><span className="font-bold text-muted">{tr('Solde à la livraison', 'الباقي عند التسليم')}</span><strong>{formatMoney(Math.max(0, Number(orderDetail.total_tnd) - Number(orderDetail.deposit_amount_tnd || 0)))}</strong></div>
<div className={`border p-3 text-xs font-bold ${orderDetail.deposit_status === 'PAID' ? 'border-success/20 bg-success/5 text-success' : orderDetail.deposit_status === 'SUBMITTED' ? 'border-brand/20 bg-brand/5 text-brand-dark' : orderDetail.deposit_status === 'REJECTED' ? 'border-danger/20 bg-danger/5 text-danger' : 'border-accent/30 bg-accent/10 text-warning'}`}>
{orderDetail.deposit_status === 'PAID' && <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 shrink-0" />{tr('Acompte confirmé — commande en préparation.', 'تأكّد العربون — الطلب قيد التجهيز.')}</span>}
{orderDetail.deposit_status === 'SUBMITTED' && <span className="flex items-center gap-1.5"><Hourglass className="h-3.5 w-3.5 shrink-0" />{tr('Preuve reçue — vérification par notre équipe en cours.', 'تم استلام الإثبات — فريقنا يتحقق منه الآن.')}</span>}
{orderDetail.deposit_status === 'REJECTED' && <span className="flex items-center gap-1.5"><X className="h-3.5 w-3.5 shrink-0" />{tr('Reçu refusé', 'تم رفض الوصل')}{orderDetail.deposit_review_note ? ` : ${orderDetail.deposit_review_note}` : ''} — {tr('veuillez en téléverser un nouveau.', 'يرجى رفع وصل جديد.')}</span>}
{orderDetail.deposit_status === 'PENDING' && <span className="flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 shrink-0" />{tr('Acompte non réglé — votre commande n’est pas encore confirmée.', 'لم يُدفع العربون — طلبك غير مؤكد بعد.')}</span>}
</div>
{['PENDING','REJECTED'].includes(orderDetail.deposit_status) && orderDetail.payment_method !== 'CARD' && <div className="space-y-2"><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setProofFile(e.target.files?.[0] || null)} className="block w-full text-xs text-muted file:mr-3 file:border-0 file:bg-brand file:px-3 file:py-2 file:text-xs file:font-black file:text-white" /><button disabled={!proofFile || proofBusy} onClick={uploadDepositProof} className="ay-btn-primary w-full text-xs">{proofBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{tr('Envoyer la preuve d’acompte (capture / reçu)', 'إرسال إثبات العربون (صورة / وصل)')}</button></div>}
{orderDetail.deposit_status === 'PENDING' && orderDetail.payment_method === 'CARD' && <p className="text-[11px] leading-5 text-muted">{tr('Paiement carte : notre équipe vous contacte immédiatement pour le règlement sécurisé de l’acompte, ou téléversez le reçu si vous avez déjà payé.', 'الدفع بالبطاقة: يتواصل معك فريقنا فورًا لتسوية العربون بأمان، أو ارفع الوصل إن كنت قد دفعت.')}</p>}
{['PENDING','REJECTED'].includes(orderDetail.deposit_status) && orderDetail.payment_method === 'CARD' && <div className="space-y-2"><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setProofFile(e.target.files?.[0] || null)} className="block w-full text-xs text-muted file:mr-3 file:border-0 file:bg-brand file:px-3 file:py-2 file:text-xs file:font-black file:text-white" /><button disabled={!proofFile || proofBusy} onClick={uploadDepositProof} className="ay-btn-primary w-full text-xs">{proofBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{tr('Envoyer le reçu du paiement carte', 'إرسال وصل الدفع بالبطاقة')}</button></div>}
{orderDetail.tracking_code && <div className="flex items-center justify-between border border-dashed border-brand bg-brand/5 p-3"><span className="text-[10px] font-black uppercase tracking-widest text-brand">{tr('Code de suivi', 'رمز التتبع')}</span><strong className="font-mono text-sm text-brand-dark">{orderDetail.tracking_code}</strong></div>}
{orderDetail.invoice_number && <a href={`/api/customer/account/orders/${orderDetail.id}/invoice`} className="flex w-full items-center justify-center gap-2 border border-success/30 bg-success/5 px-4 py-2.5 text-xs font-black text-success"><ArrowDown className="h-4 w-4" />{tr('Télécharger ma facture', 'تنزيل فاتورتي')} ({orderDetail.invoice_number})</a>}
</div>}
<div className="mt-3"><Status value={orderDetail.payment_status} /></div></section></div><section className="border border-line bg-white p-5"><h3 className="mb-4 font-black">{tr('Suivi', 'التتبع')}</h3><div className="space-y-4">{orderDetail.history?.map((item: any) => <div key={item.id} className="flex gap-3"><span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-brand" /><div><Status value={item.to_status} /><p className="mt-1 text-xs text-muted">{item.note}</p><time className="text-[10px] text-muted">{formatDate(item.created_at, true)}</time></div></div>)}</div></section></main></div>}
  </div>;
};
