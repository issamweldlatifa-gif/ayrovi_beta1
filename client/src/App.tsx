import React, { Suspense, lazy, useState, useEffect, useRef } from 'react';
import { TopAnnouncementBar } from './components/TopAnnouncementBar';
import { Navbar } from './components/Navbar';
import { HeroSlider } from './components/HeroSlider';
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

const MenuDrawer = lazy(() => import('./components/MenuDrawer').then((module) => ({ default: module.MenuDrawer })));
const ProductDrawer = lazy(() => import('./components/ProductDrawer').then((module) => ({ default: module.ProductDrawer })));
const LensLauncher = lazy(() => import('./ayrovix/components/LensLauncher').then((module) => ({ default: module.LensLauncher })));
const AiAssistantDrawer = lazy(() => import('./components/assistant/AiAssistantDrawer').then((module) => ({ default: module.AiAssistantDrawer })));
const CartDrawer = lazy(() => import('./components/CartDrawer').then((module) => ({ default: module.CartDrawer })));
const CheckoutModal = lazy(() => import('./components/CheckoutModal').then((module) => ({ default: module.CheckoutModal })));
const OrderSuccessModal = lazy(() => import('./components/OrderSuccessModal').then((module) => ({ default: module.OrderSuccessModal })));
const CustomerAccountPage = lazy(() => import('./components/CustomerAccountPage').then((module) => ({ default: module.CustomerAccountPage })));

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

  // Cart & Checkout State
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);

  // Customer authentication is isolated from the Admin session.
  const [customerSession, setCustomerSession] = useState<CustomerSession | null>(null);
  const [isCustomerSessionLoading, setIsCustomerSessionLoading] = useState(true);
  const [accountInitialSection, setAccountInitialSection] = useState<'home' | 'orders' | 'favorites' | 'cart' | 'addresses'>('home');
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
        const theme = payload?.data?.theme;
        if (!theme || typeof theme !== 'object' || !theme.primary) return;
        const root = document.documentElement;
        root.style.setProperty('--ayrovi-purple', String(theme.primary));
        root.style.setProperty('--ayrovi-purple-dark', String(theme.primaryDark || theme.primary));
        root.style.setProperty('--ayrovi-purple-light', String(theme.primaryLight || theme.primary));
        if (theme.accent) root.style.setProperty('--ayrovi-yellow', String(theme.accent));
        if (theme.gradient) root.style.setProperty('--ayrovi-gradient', String(theme.gradient));
        // AYROVI and AYROVIX intentionally share one typography system.
        root.style.setProperty('--ayrovi-font', "'Plus Jakarta Sans', 'Segoe UI', Helvetica, Arial, sans-serif");
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const restoreCustomer = async () => {
      const customerAuthResult = new URLSearchParams(window.location.search).get('customerAuth');
      try {
        const result = await customerApi<any>('/api/customer/auth/me');
        const restored = result.data as CustomerSession;
        setCustomerSession(restored);
        if (customerAuthResult === 'success' || customerAuthResult === 'facebook_success') {
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
        if (customerAuthResult) {
          const url = new URL(window.location.href);
          url.searchParams.delete('customerAuth');
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
  const handleOpenLens = () => navigation.navigate([
    { id: 'app:lens' },
    { id: typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) ? 'lens:live' : 'lens:home' },
  ]);

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

  return (
    <div className="min-h-screen flex flex-col justify-between text-ink bg-white relative pb-20 sm:pb-24">
      
      {/* Top Yellow Notice Bar */}
      <TopAnnouncementBar onLearnMore={handleToggleProductDrawer} />

      {/* Header: Left Menu, Center Fig Logo + AYROVI, Right Profile */}
      <Navbar
        onOpenMenuDrawer={() => openAppView('app:menu')}
        onOpenAccount={() => {
          setResumeCheckoutAfterAuth(false);
          setAccountInitialSection('home');
          setAccountMessage('');
          openAppView('app:account');
        }}
        isAuthenticated={Boolean(customerSession)}
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

      {/* Full-image fashion hero */}
      <HeroSlider />

      {/* Backend-managed arrivals, stories, products, promotions and news */}
      <PublicCmsSections isAuthenticated={Boolean(customerSession)} onOpenAccount={() => { setAccountInitialSection('home'); openAppView('app:account'); }} />

      {/* Partner Brands Marquee Slider Container with generous spacing */}
      <PartnerBrandsSlider />

      {/* About & Trust Section (3 Value Pillars) */}
      <AboutSection />

      {/* Hostinger-Style Full Footer with Fig Logo, Qui sommes-nous, Payment & Social Icons */}
      <Footer onOpenAccount={() => { setAccountInitialSection('home'); openAppView('app:account'); }} onOpenAssistant={() => openAppView('app:assistant')} />

      {/* Floating Scroll To Top FAB Button */}
      <ScrollToTopButton />

      {/* Compact RTL glass navigation: Ayvisi (left), Ayrovi (center), Ayrovix (right). */}
      <BottomNavBar
        isAiDrawerOpen={isAiDrawerOpen}
        onToggleAiDrawer={handleToggleAiDrawer}
        onOpenLens={handleOpenLens}
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

      {/* AYROVIX Lens — expérience caméra mobile-first. */}
      {isLensOpen && (
        <Suspense fallback={null}>
          <LensLauncher isOpen historyScope={customerSession?.account.id || null} onClose={closeAppView} onOrder={handleAyrovixOrder} />
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
            initialMessage={accountMessage}
            onClose={() => { closeAppView(); setResumeCheckoutAfterAuth(false); setAccountMessage(''); }}
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
            onOpenAccount={() => { setOrderResult(null); setAccountInitialSection('orders'); openAppView('app:account', true); }}
          />
        </Suspense>
      )}

    </div>
  );
};
