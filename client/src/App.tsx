import React, { Suspense, lazy, useState, useEffect, useRef } from 'react';
import { TopAnnouncementBar } from './components/TopAnnouncementBar';
import { Navbar } from './components/Navbar';
import { EvergreenHero } from './components/EvergreenHero';
import { TrustBar } from './components/TrustBar';
import { TransitionCard } from './components/TransitionCard';
import { DiscoveryHub } from './components/DiscoveryHub';
import { BrandsShowcase } from './components/BrandsShowcase';
import { LensHero } from './components/LensHero';
import { PartnerBrandsSlider } from './components/PartnerBrandsSlider';
import { PublicCmsSections } from './components/PublicCmsSections';
import { AboutSection } from './components/AboutSection';
import { BottomNavBar } from './components/BottomNavBar';
import type { AyrovixOrderPayload } from './ayrovix/types';
import { ScrollToTopButton } from './components/ScrollToTopButton';
import { Footer } from './components/Footer';
import { AddToCartPayload, AddToCartResult, ScrapedProduct, CartItem, OrderResult, CustomerSession } from './types';
import { getSessionId } from './utils/session';
import { configureSocial } from './social/storyService';
import { customerApi } from './customer/api';
import { getCommerceConfig } from './services/publicApi';
import { replaceUrlPreservingNavigation, useNavigationHistory } from './navigation/NavigationHistory';
import { useLocale } from './i18n/LocaleContext';
import { DEFAULT_INTERFACE_CONFIG, normalizeInterfaceConfig, type InterfaceSectionConfig, type PublicInterfaceConfig } from './config/interfaceConfig';

const MenuDrawer = lazy(() => import('./components/MenuDrawer').then((module) => ({ default: module.MenuDrawer })));
const ProductDrawer = lazy(() => import('./components/ProductDrawer').then((module) => ({ default: module.ProductDrawer })));
const LensLauncher = lazy(() => import('./ayrovix/components/LensLauncher').then((module) => ({ default: module.LensLauncher })));
const AiAssistantDrawer = lazy(() => import('./components/assistant/AiAssistantDrawer').then((module) => ({ default: module.AiAssistantDrawer })));
const CartDrawer = lazy(() => import('./components/CartDrawer').then((module) => ({ default: module.CartDrawer })));
const CheckoutModal = lazy(() => import('./components/CheckoutModal').then((module) => ({ default: module.CheckoutModal })));
const OrderSuccessModal = lazy(() => import('./components/OrderSuccessModal').then((module) => ({ default: module.OrderSuccessModal })));
const CustomerAccountPage = lazy(() => import('./components/CustomerAccountPage').then((module) => ({ default: module.CustomerAccountPage })));

/** كتل الصفحة الرئيسية — الترتيب الافتراضي حتى وصول إعداد الـ Dashboard */
export const DEFAULT_HOME_BLOCKS = ['transition', 'discovery', 'brands', 'lens'];

const ManagedSectionFrame: React.FC<{ section: InterfaceSectionConfig; children: React.ReactNode }> = ({ section, children }) => {
  const style = {
    '--ayrovi-section-background': section.backgroundColor,
    '--ayrovi-section-text': section.textColor,
    backgroundColor: section.backgroundColor,
    color: section.textColor,
    paddingBlock: `${section.paddingY}px`,
  } as React.CSSProperties;
  return <div className="managed-public-section" data-public-section={section.id} style={style}>
    <div className={`managed-public-section-inner ${section.contained ? 'is-contained' : ''}`}>
      {section.id === 'cms' && (section.image || section.title || section.subtitle) && (
        <header className="relative isolate overflow-hidden border-y border-line bg-surface px-5 py-12 text-center sm:py-16">
          {section.image && <><img src={section.image} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover" /><span className="absolute inset-0 -z-10 bg-white/85" /></>}
          {section.title && <h2 className="font-display text-3xl font-black text-ink sm:text-5xl">{section.title}</h2>}
          {section.subtitle && <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-muted sm:text-base">{section.subtitle}</p>}
        </header>
      )}
      {children}
    </div>
  </div>;
};

export const App: React.FC = () => {
  const navigation = useNavigationHistory();
  const { tr } = useLocale();
  const appView = navigation.stack[0]?.id || 'home';
  const isProductDrawerOpen = appView === 'app:product';
  const isLensOpen = appView === 'app:lens';
  const isAiDrawerOpen = appView === 'app:assistant';
  const isMenuDrawerOpen = appView === 'app:menu';
  const isCartOpen = appView === 'app:cart';
  const isCheckoutOpen = appView === 'app:checkout';
  const isAccountOpen = appView === 'app:account';
  const isOrderSuccessOpen = appView === 'app:order-success';
  const openAppView = (id: string, replace = false) => navigation.navigate([{ id }], { replace });
  const closeAppView = () => navigation.back();

  const [extractedProduct, setExtractedProduct] = useState<ScrapedProduct | null>(null);
  const [interfaceConfig, setInterfaceConfig] = useState<PublicInterfaceConfig>(() => structuredClone(DEFAULT_INTERFACE_CONFIG));
  // ترتيب كتل الصفحة الرئيسية (transition/discovery/brands/lens) — يُدار من Admin → Sections
  const [homeBlocks, setHomeBlocks] = useState<string[]>(DEFAULT_HOME_BLOCKS);

  // Cart & Checkout State
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);
  // Keep the Lens component mounted while Panier/Checkout is in front so its current result survives Back.
  const [lensSessionActive, setLensSessionActive] = useState(false);
  const [lensDarkMode, setLensDarkMode] = useState(() => {
    try { return typeof window !== 'undefined' && window.localStorage.getItem('ayrovix-theme') === 'dark'; }
    catch { return false; }
  });

  // Customer authentication is isolated from the Admin session.
  const [customerSession, setCustomerSession] = useState<CustomerSession | null>(null);
  const [isCustomerSessionLoading, setIsCustomerSessionLoading] = useState(true);
  const [accountInitialSection, setAccountInitialSection] = useState<'home' | 'orders' | 'favorites' | 'cart' | 'addresses'>('home');
  const [accountInitialOrderId, setAccountInitialOrderId] = useState('');
  const [accountMessage, setAccountMessage] = useState('');
  const [resumeCheckoutAfterAuth, setResumeCheckoutAfterAuth] = useState(false);
  const resumeCheckoutDepthRef = useRef(0);

  // Fetch Cart Items
  const fetchCart = async () => {
    try {
      const sessionId = getSessionId();
      const res = await fetch('/api/cart/items', {
        headers: { 'x-session-id': sessionId },
      });
      const data = await res.json();
      if (!res.ok || !data.success || !Array.isArray(data.items)) {
        throw new Error(data.error || 'Impossible de charger le panier.');
      }
      setCartItems(data.items);
    } catch (err) {
      console.warn('[Cart Fetch Error]', err);
    }
  };

  // تطبيق ثيم المنصة من طلب configuration مشترك واحد.
  useEffect(() => {
    let active = true;
    getCommerceConfig()
      .then((payload) => {
        if (!active) return;
        const root = document.documentElement;
        const theme = payload?.data?.theme;
        if (theme && typeof theme === 'object' && theme.primary) {
          root.style.setProperty('--ayrovi-primary', String(theme.primary));
          root.style.setProperty('--ayrovi-primary-dark', String(theme.primaryDark || theme.primary));
          root.style.setProperty('--ayrovi-primary-light', String(theme.primaryLight || theme.primary));
          if (theme.accent) root.style.setProperty('--ayrovi-accent', String(theme.accent));
          if (theme.gradient) root.style.setProperty('--ayrovi-gradient', String(theme.gradient));
        }
        const visual = normalizeInterfaceConfig(payload?.data?.interfaceConfig);
        setInterfaceConfig(visual);
        const { colors, typography, buttons, icons, navigation, layout } = visual;
        root.style.setProperty('--ayrovi-font-body', typography.body);
        root.style.setProperty('--ayrovi-font-display', typography.display);
        root.style.setProperty('--font-primary', typography.body);
        root.style.setProperty('--ayrovi-base-font-size', `${typography.baseSize}px`);
        root.style.setProperty('--ayrovi-body-line-height', String(typography.lineHeight));
        root.style.setProperty('--ayrovi-letter-spacing', `${typography.letterSpacing}em`);
        root.style.setProperty('--ayrovi-heading-scale', String(typography.headingScale));
        ([['--text-xl', 1.25], ['--text-2xl', 1.5], ['--text-3xl', 1.875], ['--text-4xl', 2.25], ['--text-5xl', 3], ['--text-6xl', 3.75], ['--text-7xl', 4.5]] as const)
          .forEach(([token, rem]) => root.style.setProperty(token, `${rem * typography.headingScale}rem`));
        root.style.setProperty('--ayrovi-heading-color', typography.headingColor);
        root.style.setProperty('--ayrovi-text-color', typography.textColor);
        root.style.setProperty('--ayrovi-neutral-900', typography.headingColor);
        root.style.setProperty('--ayrovi-neutral-500', typography.textColor);
        root.style.setProperty('--ayrovi-page-bg', colors.pageBackground);
        root.style.setProperty('--ayrovi-surface-raised', colors.surfaceBackground);
        root.style.setProperty('--ayrovi-neutral-50', colors.surfaceAlt);
        root.style.setProperty('--ayrovi-neutral-200', colors.borderColor);
        root.style.setProperty('--ayrovi-primary', colors.primary);
        root.style.setProperty('--ayrovi-primary-dark', colors.primaryDark);
        root.style.setProperty('--ayrovi-primary-light', colors.primaryLight);
        root.style.setProperty('--ayrovi-accent', colors.accent);
        root.style.setProperty('--ayrovi-cta', '#fe7003');
        root.style.setProperty('--ayrovi-cta-dark', '#e05f00');
        root.style.setProperty('--ayrovi-orange', '#fe7003');
        root.style.setProperty('--ayrovi-accent-soft', '#ffb070');
        root.style.setProperty('--ayrovi-neutral-950', colors.heroBackground);
        root.style.setProperty('--ayrovi-success', colors.success);
        root.style.setProperty('--ayrovi-warning', colors.warning);
        root.style.setProperty('--ayrovi-danger', colors.danger);
        root.style.setProperty('--ayrovi-header-bg', colors.headerBackground);
        root.style.setProperty('--ayrovi-header-text', colors.headerText);
        root.style.setProperty('--ayrovi-announcement-bg', colors.announcementBackground);
        root.style.setProperty('--ayrovi-announcement-text', colors.announcementText);
        root.style.setProperty('--ayrovi-hero-bg', colors.heroBackground);
        root.style.setProperty('--ayrovi-hero-text', colors.heroText);
        root.style.setProperty('--ayrovi-footer-bg', colors.footerBackground);
        root.style.setProperty('--ayrovi-footer-text', colors.footerText);
        root.style.setProperty('--ayrovi-gradient', `linear-gradient(135deg, ${colors.heroBackground} 0%, ${colors.primary} 100%)`);
        root.style.setProperty('--ayrovi-button-bg', buttons.background);
        root.style.setProperty('--ayrovi-button-color', buttons.color);
        root.style.setProperty('--ayrovi-button-secondary-bg', buttons.secondaryBackground);
        root.style.setProperty('--ayrovi-button-secondary-color', buttons.secondaryColor);
        root.style.setProperty('--ayrovi-button-border', buttons.borderColor);
        root.style.setProperty('--ayrovi-button-border-width', `${buttons.borderWidth}px`);
        root.style.setProperty('--ayrovi-button-height', `${buttons.height}px`);
        root.style.setProperty('--ayrovi-radius-control', `${buttons.shape === 'pill' ? 999 : buttons.shape === 'square' ? 0 : buttons.radius}px`);
        root.style.setProperty('--ayrovi-icon-color', icons.color);
        root.style.setProperty('--ayrovi-icon-active-color', icons.activeColor);
        root.style.setProperty('--ayrovi-icon-size', `${icons.size}px`);
        root.dataset.ayroviIconStyle = icons.style;
        root.dataset.ayroviIconLibrary = icons.library;
        root.style.setProperty('--ayrovi-bottom-nav-height', `${navigation.height}px`);
        root.style.setProperty('--ayrovi-section-gap', `${layout.sectionGap}px`);
        root.style.setProperty('--ayrovi-content-max', `${layout.maxWidth}px`);
        root.style.setProperty('--ayrovi-page-padding', `${layout.pagePadding}px`);
        root.style.setProperty('--ayrovi-radius-card', `${layout.cardRadius}px`);
        root.style.setProperty('--ayrovi-card-border-width', `${layout.cardBorderWidth}px`);
        root.style.setProperty('--ayrovi-text-align', typography.align);
        root.dataset.ayroviShadow = layout.shadow;
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (isLensOpen && !lensSessionActive) setLensSessionActive(true);
  }, [isLensOpen, lensSessionActive]);

  // ترتيب وإظهار كتل الصفحة الرئيسية — من الـ Dashboard (Admin → Sections)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/home-blocks')
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (cancelled || !Array.isArray(result?.data) || !result.data.length) return;
        const ordered = result.data
          .filter((block: any) => block?.visible !== false && DEFAULT_HOME_BLOCKS.includes(String(block.id)))
          .sort((a: any, b: any) => Number(a.sortOrder) - Number(b.sortOrder))
          .map((block: any) => String(block.id));
        if (ordered.length) setHomeBlocks(ordered);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.ayrovixTheme = lensDarkMode ? 'dark' : 'light';
    try { window.localStorage.setItem('ayrovix-theme', lensDarkMode ? 'dark' : 'light'); }
    catch { /* Storage can be blocked without disabling Lens. */ }
  }, [lensDarkMode]);

  useEffect(() => {
    const restoreCustomer = async () => {
      const returnParams = new URLSearchParams(window.location.search);
      const customerAuthResult = returnParams.get('customerAuth');
      const cardPaymentReturn = returnParams.get('cardPayment');
      const cardOrderId = returnParams.get('orderId') || '';
      const cardTransaction = returnParams.get('transaction') || '';
      try {
        const result = await customerApi<any>('/api/customer/auth/me');
        const restored = result.data as CustomerSession;
        setCustomerSession(restored);
        if (cardPaymentReturn === 'verify' && cardOrderId && cardTransaction) {
          setAccountInitialSection('orders');
          setAccountInitialOrderId(cardOrderId);
          openAppView('app:account', true);
          try {
            const verification = await customerApi<any>(`/api/customer/account/orders/${encodeURIComponent(cardOrderId)}/payments/card/verify?transaction=${encodeURIComponent(cardTransaction)}`);
            setAccountMessage(verification.data?.status === 'PAID'
              ? tr('Paiement carte vérifié — votre commande est confirmée.', 'تم التحقق من الدفع بالبطاقة وتأكيد طلبك.')
              : verification.data?.status === 'FAILED'
                ? tr('Le paiement carte a échoué. Votre commande reste en attente d’acompte.', 'فشل الدفع بالبطاقة ويبقى طلبك في انتظار العربون.')
                : tr('Le paiement est encore en attente de confirmation bancaire.', 'لا يزال الدفع في انتظار تأكيد البنك.'));
          } catch (reason: any) {
            setAccountMessage(tr(`Erreur : ${reason.message || 'vérification bancaire indisponible'}`, `خطأ: ${reason.message || 'تعذر التحقق البنكي'}`));
          }
        } else if (customerAuthResult === 'success' || customerAuthResult === 'facebook_success') {
          openAppView('app:account', true);
          // Le téléphone est une seconde option de vérification; un e-mail vérifié suffit également.
          setAccountMessage(customerAuthResult === 'facebook_success'
            ? tr('Connexion Facebook réussie. Bienvenue sur AYROVI !', 'تم تسجيل الدخول عبر Facebook. مرحبًا بك في AYROVI!')
            : tr('Connexion Google réussie. Bienvenue sur AYROVI !', 'تم تسجيل الدخول عبر Google. مرحبًا بك في AYROVI!'));
        } else if (customerAuthResult === 'error' || customerAuthResult === 'facebook_error') {
          openAppView('app:account', true);
          setAccountMessage(tr(`Erreur : la connexion ${customerAuthResult === 'facebook_error' ? 'Facebook' : 'Google'} n’a pas abouti. Réessayez ou utilisez le code SMS.`, `تعذر تسجيل الدخول عبر ${customerAuthResult === 'facebook_error' ? 'Facebook' : 'Google'}. أعد المحاولة أو استخدم رمز SMS.`));
        }
      } catch {
        setCustomerSession(null);
        if (customerAuthResult === 'error' || customerAuthResult === 'facebook_error') {
          openAppView('app:account', true);
          setAccountMessage(tr(`Erreur : la connexion ${customerAuthResult === 'facebook_error' ? 'Facebook' : 'Google'} n’a pas abouti. Réessayez ou utilisez le code SMS.`, `تعذر تسجيل الدخول عبر ${customerAuthResult === 'facebook_error' ? 'Facebook' : 'Google'}. أعد المحاولة أو استخدم رمز SMS.`));
        }
      } finally {
        if (customerAuthResult || cardPaymentReturn) {
          const url = new URL(window.location.href);
          ['customerAuth','cardPayment','orderId','transaction'].forEach((key) => url.searchParams.delete(key));
          replaceUrlPreservingNavigation(`${url.pathname}${url.search}${url.hash}`);
        }
        setIsCustomerSessionLoading(false);
      }
    };
    void restoreCustomer();
  }, []);

  useEffect(() => {
    if (!isCustomerSessionLoading) void fetchCart();
  }, [isCustomerSessionLoading, customerSession?.account.id]);

  // Jeton CSRF pour les interactions sociales authentifiées (likes/comments/vues).
  useEffect(() => { configureSocial({ csrfToken: customerSession?.csrfToken || '' }); }, [customerSession?.csrfToken]);

  const totalCartTND = cartItems.reduce((sum, item) => sum + (item.lineTotalTND ?? item.priceTND * item.quantity), 0);
  const totalCartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartBreakdown = cartItems.reduce((totals, item) => ({
    subtotal: totals.subtotal + Number(item.convertedPriceTND || 0),
    customs: totals.customs + Number(item.customsFeeTND || 0),
    shipping: totals.shipping + Number(item.shippingFeeTND || 0),
    service: totals.service + Number(item.serviceFeeTND || 0),
    express: totals.express + Number(item.expressFeeTND || 0),
    discount: totals.discount + Number(item.discountTND || 0),
  }), { subtotal: 0, customs: 0, shipping: 0, service: 0, express: 0, discount: 0 });

  const handleExtracted = (product: ScrapedProduct) => {
    setExtractedProduct(product);
    if (isProductDrawerOpen) navigation.pushLayer({ id: 'product:details' });
    else navigation.navigate([{ id: 'app:product' }, { id: 'product:details' }]);
  };

  const handleToggleProductDrawer = () => {
    if (isProductDrawerOpen) closeAppView();
    else navigation.navigate([{ id: 'app:product' }, { id: extractedProduct ? 'product:details' : 'product:input' }]);
  };

  // AYROVIX Lens — nouvelle expérience (caméra / galerie / lien / QR) branchée sur le flux panier existant.
  const handleOpenLens = () => {
    setLensSessionActive(true);
    navigation.navigate([
      { id: 'app:lens' },
      { id: typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) ? 'lens:live' : 'lens:home' },
    ]);
  };

  const handleCloseLens = () => {
    setLensSessionActive(false);
    closeAppView();
  };

  const handleAyrovixOrder = async (payload: AyrovixOrderPayload) => {
    const summary = await handleAddToCart({ ...payload, priceTND: payload.priceTND ?? 0 });
    if (!summary) throw new Error('AYROVIX_ADD_TO_CART_FAILED');
    openAppView('app:cart');
  };

  const handleToggleAiDrawer = () => {
    if (isAiDrawerOpen) closeAppView();
    else openAppView('app:assistant');
  };

  const handleAddToCart = async (itemData: AddToCartPayload): Promise<AddToCartResult | null> => {
    try {
      const res = await fetch('/api/cart/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': getSessionId(),
          ...(customerSession?.csrfToken ? { 'x-csrf-token': customerSession.csrfToken } : {}),
        },
        body: JSON.stringify(itemData),
      });
      const data = await res.json();
      if (
        !res.ok || !data.success ||
        !Number.isFinite(data.totalTND) || !Number.isInteger(data.totalItemsCount)
      ) {
        throw new Error(data.error || "Impossible d'ajouter l'article au panier.");
      }
      await fetchCart();
      return { totalTND: data.totalTND, itemCount: data.totalItemsCount };
    } catch (err) {
      console.error('[Add to Cart Error]', err);
      return null;
    }
  };

  const handleNewClientOrder = () => {
    setExtractedProduct(null);
  };

  const handleUpdateQuantity = async (id: string, newQty: number) => {
    try {
      const response = await fetch(`/api/cart/items/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': getSessionId(),
          ...(customerSession?.csrfToken ? { 'x-csrf-token': customerSession.csrfToken } : {}),
        },
        body: JSON.stringify({ quantity: newQty }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Mise à jour impossible.');
      await fetchCart();
    } catch (err) {
      console.error('[Update Qty Error]', err);
    }
  };

  const handleRemoveItem = async (id: string) => {
    try {
      const response = await fetch(`/api/cart/items/${id}`, {
        method: 'DELETE',
        headers: {
          'x-session-id': getSessionId(),
          ...(customerSession?.csrfToken ? { 'x-csrf-token': customerSession.csrfToken } : {}),
        },
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Suppression impossible.');
      await fetchCart();
    } catch (err) {
      console.error('[Remove Item Error]', err);
    }
  };

  const handleProceedToCheckout = () => {
    if (!customerSession) {
      resumeCheckoutDepthRef.current = navigation.entry.depth;
      setResumeCheckoutAfterAuth(true);
      setAccountInitialSection('home');
      setAccountMessage(tr('Connectez-vous pour confirmer votre commande. Votre panier est conservé.', 'سجّل الدخول لتأكيد طلبك. ستبقى سلّتك محفوظة.'));
      openAppView('app:account');
      return;
    }
    // Aucun préalable de vérification téléphonique : le numéro de livraison est saisi au checkout.
    setResumeCheckoutAfterAuth(false);
    openAppView('app:checkout');
  };

  const handleCustomerSession = (nextSession: CustomerSession) => {
    setCustomerSession(nextSession);
    void fetchCart();
    if (resumeCheckoutAfterAuth) {
      setResumeCheckoutAfterAuth(false);
      navigation.rewindAndNavigate(resumeCheckoutDepthRef.current, [{ id: 'app:checkout' }]);
      setAccountMessage('');
    }
  };

  const handleOrderSuccess = (result: OrderResult) => {
    setOrderResult(result);
    setCartItems([]);
    // Le formulaire soumis ne doit jamais redevenir actif via Back.
    openAppView('app:order-success', true);
  };

  // HOMEPAGE CLEANUP: عرض الـHero والفوتر فقط مؤقتاً — الأقسام القديمة (brands/about)
  // محذوفة من العرض لا من المشروع، وكتل cms مخفية عبر homepageVisible={false}
  const publicSections = [...interfaceConfig.sections]
    .filter((section) => section.visible && !['brands', 'about'].includes(section.id))
    .sort((a, b) => a.order - b.order)
    .map((section) => {
      let content: React.ReactNode;
      // كتل الصفحة الرئيسية تُرتَّب وتُخفى من الـ Dashboard (Admin → Sections)
      if (section.id === 'hero') content = (
        <>
          <EvergreenHero />
          <TrustBar />
          <div className="bg-white pt-8 pb-14">
            {homeBlocks.map((block) => {
              if (block === 'transition') return <TransitionCard key="transition" />;
              if (block === 'discovery') return <DiscoveryHub key="discovery" />;
              if (block === 'brands') return <BrandsShowcase key="brands" />;
              if (block === 'lens') return <LensHero key="lens" onOpenLens={handleOpenLens} />;
              return null;
            })}
          </div>
        </>
      );
      else if (section.id === 'cms') content = <PublicCmsSections isAuthenticated={Boolean(customerSession)} onOpenAccount={() => { setAccountInitialSection('home'); openAppView('app:account'); }} homepageVisible={false} />;
      else if (section.id === 'brands') content = <PartnerBrandsSlider title={section.title} subtitle={section.subtitle} coverImage={section.image} />;
      else if (section.id === 'about') content = <AboutSection coverImage={section.image} title={section.title} subtitle={section.subtitle} />;
      else content = <Footer logoUrl={interfaceConfig.logoUrl} introTitle={section.title} introText={section.subtitle} onOpenAccount={() => { setAccountInitialSection('home'); openAppView('app:account'); }} onOpenAssistant={() => openAppView('app:assistant')} />;
      return <ManagedSectionFrame key={section.id} section={section}>{content}</ManagedSectionFrame>;
    });

  return (
    <div className="ayrovi-app-shell interface-page-shell min-h-screen flex flex-col text-ink relative">
      
      {/* Top Yellow Notice Bar */}
      <TopAnnouncementBar onLearnMore={handleToggleProductDrawer} />

      {/* Header: Left Menu, Center Fig Logo + AYROVI, Right Profile */}
      <Navbar
        onOpenMenuDrawer={() => openAppView('app:menu')}
        onGoHome={() => {
          navigation.goHome();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenCart={() => openAppView('app:cart')}
        cartCount={totalCartCount}
        onOpenAccount={() => {
          setResumeCheckoutAfterAuth(false);
          setAccountInitialSection('home');
          setAccountMessage('');
          openAppView('app:account');
        }}
        isAuthenticated={Boolean(customerSession)}
        logoUrl={interfaceConfig.logoUrl}
      />

      {/* Sliding Side Menu Drawer */}
      {isMenuDrawerOpen && (
        <Suspense fallback={null}>
          <MenuDrawer
            isOpen
            onClose={closeAppView}
            session={customerSession}
            onOpenAccount={(section = 'home') => {
              setAccountInitialSection(section);
              setAccountMessage('');
              openAppView('app:account');
            }}
            onOpenAssistant={() => openAppView('app:assistant')}
            onOpenLens={handleOpenLens}
          />
        </Suspense>
      )}

      {/* Sections publiques — visibilité, ordre, médias et contenu pilotés depuis Admin → واجهتي. */}
      <div className="managed-public-sections">{publicSections}</div>

      {/* Floating Scroll To Top FAB Button */}
      <ScrollToTopButton />

      {/* Compact RTL glass navigation: Ayvisi (left), Ayrovi (center), Ayrovix (right). */}
      <BottomNavBar
        isAiDrawerOpen={isAiDrawerOpen}
        onToggleAiDrawer={handleToggleAiDrawer}
        onOpenLens={handleOpenLens}
        config={interfaceConfig.navigation}
        iconConfig={interfaceConfig.icons}
      />

      {/* DRAWER 1: Complete 100% Height Product Flow Drawer (Lens Button) */}
      {isProductDrawerOpen && (
        <Suspense fallback={null}>
          <ProductDrawer
            isOpen
            product={extractedProduct}
            onClose={closeAppView}
            onAddToCart={handleAddToCart}
            onExtracted={handleExtracted}
            onNewClientOrder={handleNewClientOrder}
            onCheckoutRequested={handleProceedToCheckout}
          />
        </Suspense>
      )}

      {/* Modular AYROVI assistant interface */}
      {isAiDrawerOpen && (
        <Suspense fallback={null}>
          <AiAssistantDrawer
            isOpen
            historyScope={customerSession?.account.id || null}
            customerCsrfToken={customerSession?.csrfToken || ''}
            isAuthenticated={Boolean(customerSession)}
            customerFirstName={customerSession?.account.displayName?.split(/\s+/)[0] || ''}
            onClose={closeAppView}
            onOpenLens={handleOpenLens}
            onOrder={handleAyrovixOrder}
            onOpenOrders={() => {
              setAccountInitialSection('orders');
              setAccountMessage(customerSession ? '' : tr('Connectez-vous pour consulter vos commandes.', 'سجّل الدخول للاطلاع على طلباتك.'));
              openAppView('app:account');
            }}
            onOpenAccount={() => {
              setAccountInitialSection('home');
              setAccountMessage('');
              openAppView('app:account');
            }}
          />
        </Suspense>
      )}

      {/* AYROVIX Lens stays mounted behind commerce layers so Result/Product can be restored intact. */}
      {lensSessionActive && (
        <Suspense fallback={null}>
          <LensLauncher
            isOpen={isLensOpen}
            historyScope={customerSession?.account.id || null}
            onClose={handleCloseLens}
            onOrder={handleAyrovixOrder}
            cartCount={totalCartCount}
            onOpenCart={() => openAppView('app:cart')}
            darkMode={lensDarkMode}
            onToggleDarkMode={() => setLensDarkMode((current) => !current)}
          />
        </Suspense>
      )}

      {isCartOpen && (
        <Suspense fallback={null}>
          <CartDrawer
            isOpen
            onClose={closeAppView}
            items={cartItems}
            totalTND={totalCartTND}
            onUpdateQuantity={handleUpdateQuantity}
            onRemoveItem={handleRemoveItem}
            onProceedToCheckout={handleProceedToCheckout}
            onCalculateAnotherProduct={handleOpenLens}
          />
        </Suspense>
      )}

      {/* Checkout Modal */}
      {isCheckoutOpen && (
        <Suspense fallback={null}>
          <CheckoutModal
            isOpen
            onClose={closeAppView}
            totalTND={totalCartTND}
            itemCount={totalCartCount}
            breakdown={cartBreakdown}
            customerSession={customerSession}
            onRequireAuthentication={() => {
              resumeCheckoutDepthRef.current = Math.max(0, navigation.entry.depth - 1);
              setResumeCheckoutAfterAuth(true);
              setAccountInitialSection('home');
              setAccountMessage(tr('Connectez-vous pour confirmer la commande.', 'سجّل الدخول لتأكيد الطلب.'));
              openAppView('app:account', true);
            }}
            onOrderSuccess={handleOrderSuccess}
          />
        </Suspense>
      )}

      {isAccountOpen && (
        <Suspense fallback={null}>
          <CustomerAccountPage
            isOpen
            session={customerSession}
            loadingSession={isCustomerSessionLoading}
            initialSection={accountInitialSection}
            initialOrderId={accountInitialOrderId}
            initialMessage={accountMessage}
            onClose={() => { navigation.goHome(); setResumeCheckoutAfterAuth(false); setAccountMessage(''); setAccountInitialOrderId(''); setAccountInitialSection('home'); }}
            onSession={handleCustomerSession}
            onLoggedOut={() => { setCustomerSession(null); setResumeCheckoutAfterAuth(false); void fetchCart(); }}
            onCartChanged={() => { void fetchCart(); }}
            onOpenCart={() => openAppView('app:cart')}
          />
        </Suspense>
      )}

      {/* Order Success Confetti Modal */}
      {isOrderSuccessOpen && orderResult && (
        <Suspense fallback={null}>
          <OrderSuccessModal
            result={orderResult}
            onClose={() => { setOrderResult(null); navigation.goHome(); }}
            onOpenAccount={() => { setAccountInitialOrderId(orderResult.orderId || ''); setOrderResult(null); setAccountInitialSection('orders'); openAppView('app:account', true); }}
            onCalculateAnotherProduct={handleOpenLens}
          />
        </Suspense>
      )}

    </div>
  );
};
