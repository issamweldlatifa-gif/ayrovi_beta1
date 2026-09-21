import { customerTheme } from './design/editorial/customerTheme';
import React, { Suspense, lazy, useState, useEffect, useRef } from 'react';
import { TopAnnouncementBar } from './components/TopAnnouncementBar';
import { Navbar } from './components/Navbar';
import { EvergreenHero } from './components/EvergreenHero';
import { StoriesShowcase } from './components/StoriesShowcase';
import { LensFeature } from './components/LensFeature';
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

const AboutPage = lazy(() => import('./components/AboutPage').then(module => ({ default: module.AboutPage })));
const MenuDrawer = lazy(() => import('./components/MenuDrawer').then((module) => ({ default: module.MenuDrawer })));
const ProductDrawer = lazy(() => import('./components/ProductDrawer').then((module) => ({ default: module.ProductDrawer })));
const LensLauncher = lazy(() => import('./ayrovix/components/LensLauncher').then((module) => ({ default: module.LensLauncher })));
const AiAssistantDrawer = lazy(() => import('./components/assistant/AiAssistantDrawer').then((module) => ({ default: module.AiAssistantDrawer })));
const CartDrawer = lazy(() => import('./components/CartDrawer').then((module) => ({ default: module.CartDrawer })));
const CheckoutModal = lazy(() => import('./components/CheckoutModal').then((module) => ({ default: module.CheckoutModal })));
const OrderSuccessModal = lazy(() => import('./components/OrderSuccessModal').then((module) => ({ default: module.OrderSuccessModal })));
const CustomerAccountPage = lazy(() => import('./components/CustomerAccountPage').then((module) => ({ default: module.CustomerAccountPage })));

/** كتل الصفحة الرئيسية — الترتيب الافتراضي حتى وصول إعداد الـ Dashboard */
/**
 * Blocs de la page d'accueil — VOLONTAIREMENT VIDE.
 * La page se limite désormais au Hero + Trust Bar (décision produit du 2026-09-14).
 * Le mécanisme reste branché : l'endpoint public et l'écran Admin → Sections
 * continuent de fonctionner, et réinscrire un identifiant ici réactive le bloc
 * correspondant (les composants supprimés sont dans l'historique Git).
 */
export const DEFAULT_HOME_BLOCKS: string[] = [];

const ManagedSectionFrame: React.FC<{ section: InterfaceSectionConfig; children: React.ReactNode }> = ({ section, children }) => {
  const style = {
    '--ayrovi-section-background': 'var(--ayrovi-bg-main)',
    '--ayrovi-section-text': 'var(--ayrovi-text-primary)',
    backgroundColor: 'var(--ayrovi-bg-main)',
    color: 'var(--ayrovi-text-primary)',
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
  const { tr, locale } = useLocale();
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
        // CMS retains content/layout/navigation. Customer presentation is isolated below.
        setInterfaceConfig(normalizeInterfaceConfig(payload?.data?.interfaceConfig));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (isLensOpen && !lensSessionActive) setLensSessionActive(true);
  }, [isLensOpen, lensSessionActive]);

  // ترتيب وإظهار كتل الصفحة الرئيسية — من الـ Dashboard (Admin → Sections)
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.ayrovixTheme = lensDarkMode ? 'dark' : 'light';
    try { window.localStorage.setItem('ayrovix-theme', lensDarkMode ? 'dark' : 'light'); }
    catch { /* Storage can be blocked without disabling Lens. */ }
  }, [lensDarkMode]);

  // Account preferences are authoritative; ignore a late response from a previous identity.
  useEffect(() => {
    let cancelled = false;
    if (customerSession) {
      setLensDarkMode(false);
      customerApi<{data:{dark_mode:number}}>('/api/customer/account/preferences')
        .then(result => { if (!cancelled) setLensDarkMode(Boolean(result.data.dark_mode)); })
        .catch(() => { /* Account preferences screen exposes loading failures and retry. */ });
    }
    return () => { cancelled = true; };
  }, [customerSession?.account.id]);

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
        if (customerAuthResult === 'password_reset' || customerAuthResult === 'login') {
          setAccountInitialSection('home');
          openAppView('app:account', true);
          setAccountMessage(customerAuthResult === 'password_reset' ? tr('Mot de passe modifié. Connectez-vous avec le nouveau mot de passe.', 'تم تغيير كلمة المرور. سجّل دخولك بكلمة المرور الجديدة.') : '');
        }
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
  /**
   * Position de la section Stories par rapport au bloc LENS.
   * Pilotée depuis Admin → Contenu → Social → onglet Story → « Bloc d'accueil »
   * (champ « Position » : 1 = sous LENS, 0 = au-dessus). Défaut : sous LENS.
   */
  const [storiesBelowLens, setStoriesBelowLens] = useState(true);
  useEffect(() => {
    let alive = true;
    fetch('/api/public/stories-showcase')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (alive && json?.success && json.data) setStoriesBelowLens(Number(json.data.sortOrder ?? 1) >= 1);
      })
      .catch(() => { /* on garde l'ordre par défaut */ });
    return () => { alive = false; };
  }, []);

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

  // HOMEPAGE CLEANUP: الصفحة تنتهي عند الـ Trust Bar — لا فوتر ولا أي محتوى تحته.
  // الأقسام القديمة (brands/about) والفوتر محذوفة من العرض لا من المشروع،
  // مع إبقاء cms لأنها تستضيف صفحات CMS بملء الشاشة (تُفتح من Discovery/Menu).
  const publicSections = [...interfaceConfig.sections]
    .filter((section) => section.visible && !['brands', 'about', 'footer'].includes(section.id))
    .sort((a, b) => a.order - b.order)
    .map((section) => {
      let content: React.ReactNode;
      // كتل الصفحة الرئيسية تُرتَّب وتُخفى من الـ Dashboard (Admin → Sections)
      if (section.id === 'hero') content = (
        <>
          <EvergreenHero />
          {/*
            Ordre piloté par le Dashboard : par défaut le bloc LENS d'abord, la
            section Stories ENSUITE. Mettre « Position = au-dessus du bloc LENS »
            dans le Dashboard inverse les deux — sans toucher au code.
          */}
          {storiesBelowLens ? (
            <>
              <LensFeature onOpenLens={handleOpenLens} />
              <StoriesShowcase
                isAuthenticated={Boolean(customerSession)}
                onRequireAuth={() => { setAccountInitialSection('home'); openAppView('app:account'); }}
              />
            </>
          ) : (
            <>
              <StoriesShowcase
                isAuthenticated={Boolean(customerSession)}
                onRequireAuth={() => { setAccountInitialSection('home'); openAppView('app:account'); }}
              />
              <LensFeature onOpenLens={handleOpenLens} />
            </>
          )}
        </>
      );
      else if (section.id === 'cms') content = <PublicCmsSections isAuthenticated={Boolean(customerSession)} onOpenAccount={() => { setAccountInitialSection('home'); openAppView('app:account'); }} homepageVisible={false} />;
      else if (section.id === 'brands') content = <PartnerBrandsSlider title={section.title} subtitle={section.subtitle} coverImage={section.image} />;
      else if (section.id === 'about') content = <AboutSection coverImage={section.image} title={section.title} subtitle={section.subtitle} />;
      else content = <Footer logoUrl={interfaceConfig.logoUrl} introTitle={section.title} introText={section.subtitle} onOpenAccount={() => { setAccountInitialSection('home'); openAppView('app:account'); }} onOpenAssistant={() => openAppView('app:assistant')} />;
      return <ManagedSectionFrame key={section.id} section={section}>{content}</ManagedSectionFrame>;
    });

  return (
    <div className="ayrovi-app-shell interface-page-shell min-h-screen flex flex-col text-ink relative" style={customerTheme(locale, interfaceConfig)}>
      
      {/* Top Yellow Notice Bar */}
      <TopAnnouncementBar onLearnMore={handleToggleProductDrawer} />

      {/* Header: Left Menu, Center Fig Logo + AYROVI, Right Profile */}
      <div data-preserved-navigation style={{ display: 'contents' }}>
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
      </div>

      {appView === 'app:about' && <Suspense fallback={null}><AboutPage section={interfaceConfig.sections.find(section => section.id === 'about')} onClose={closeAppView} /></Suspense>}

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
      <ScrollToTopButton hidden={navigation.stack.length > 0} />

      {/* Compact RTL glass navigation: Ayvisi (left), Ayrovi (center), Ayrovix (right). */}
      <div data-preserved-navigation style={{ display: 'contents' }}>
      <BottomNavBar
        isAiDrawerOpen={isAiDrawerOpen}
        onToggleAiDrawer={handleToggleAiDrawer}
        onOpenLens={handleOpenLens}
        config={interfaceConfig.navigation}
        iconConfig={interfaceConfig.icons}
      />
      </div>

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
            customerSession={customerSession}
            onOpenFavorites={() => { setAccountInitialSection('favorites'); setAccountMessage(''); openAppView('app:account'); }}
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
            key={customerSession?.account.id || 'guest'}
            onThemeChange={setLensDarkMode}
            isOpen
            session={customerSession}
            loadingSession={isCustomerSessionLoading}
            initialSection={accountInitialSection}
            initialOrderId={accountInitialOrderId}
            initialMessage={accountMessage}
            onClose={() => { navigation.goHome(); setResumeCheckoutAfterAuth(false); setAccountMessage(''); setAccountInitialOrderId(''); setAccountInitialSection('home'); }}
            onSession={handleCustomerSession}
            onLoggedOut={() => { setLensDarkMode(false); setCustomerSession(null); setResumeCheckoutAfterAuth(false); void fetchCart(); }}
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
