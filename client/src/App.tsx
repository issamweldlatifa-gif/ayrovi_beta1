import React, { Suspense, lazy, useState, useEffect } from 'react';
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
import { customerApi } from './customer/api';
import { getCommerceConfig } from './services/publicApi';

const MenuDrawer = lazy(() => import('./components/MenuDrawer').then((module) => ({ default: module.MenuDrawer })));
const ProductDrawer = lazy(() => import('./components/ProductDrawer').then((module) => ({ default: module.ProductDrawer })));
const LensLauncher = lazy(() => import('./ayrovix/components/LensLauncher').then((module) => ({ default: module.LensLauncher })));
const AiAssistantDrawer = lazy(() => import('./components/assistant/AiAssistantDrawer').then((module) => ({ default: module.AiAssistantDrawer })));
const CartDrawer = lazy(() => import('./components/CartDrawer').then((module) => ({ default: module.CartDrawer })));
const CheckoutModal = lazy(() => import('./components/CheckoutModal').then((module) => ({ default: module.CheckoutModal })));
const OrderSuccessModal = lazy(() => import('./components/OrderSuccessModal').then((module) => ({ default: module.OrderSuccessModal })));
const CustomerAccountPage = lazy(() => import('./components/CustomerAccountPage').then((module) => ({ default: module.CustomerAccountPage })));

export const App: React.FC = () => {
  const [extractedProduct, setExtractedProduct] = useState<ScrapedProduct | null>(null);

  // Drawer States (Mutually Exclusive)
  const [isProductDrawerOpen, setIsProductDrawerOpen] = useState(false);
  const [isLensOpen, setIsLensOpen] = useState(false);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [isMenuDrawerOpen, setIsMenuDrawerOpen] = useState(false);

  // Cart & Checkout State
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);

  // Customer authentication is isolated from the Admin session.
  const [customerSession, setCustomerSession] = useState<CustomerSession | null>(null);
  const [isCustomerSessionLoading, setIsCustomerSessionLoading] = useState(true);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [accountInitialSection, setAccountInitialSection] = useState<'home' | 'orders'>('home');
  const [accountMessage, setAccountMessage] = useState('');
  const [resumeCheckoutAfterAuth, setResumeCheckoutAfterAuth] = useState(false);

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
        const fonts: Record<string, string> = {
          jakarta: "'Plus Jakarta Sans', 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif",
          inter: "'Inter', 'Segoe UI', Helvetica, Arial, sans-serif",
          system: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        };
        root.style.setProperty('--ayrovi-font', fonts[String(theme.font)] || fonts.jakarta);
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
        if (customerAuthResult === 'success') {
          setIsAccountOpen(true);
          // La vérification du téléphone est OPTIONNELLE (Profil du compte) — jamais un préalable à la commande.
          setAccountMessage('Connexion Google réussie. Bienvenue sur AYROVI !');
        } else if (customerAuthResult === 'error') {
          setIsAccountOpen(true);
          setAccountMessage('Erreur : la connexion Google n’a pas abouti. Réessayez ou utilisez le code SMS.');
        }
      } catch {
        setCustomerSession(null);
        if (customerAuthResult === 'error') {
          setIsAccountOpen(true);
          setAccountMessage('Erreur : la connexion Google n’a pas abouti. Réessayez ou utilisez le code SMS.');
        }
      } finally {
        if (customerAuthResult) {
          const url = new URL(window.location.href);
          url.searchParams.delete('customerAuth');
          window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        }
        setIsCustomerSessionLoading(false);
      }
    };
    void restoreCustomer();
  }, []);

  useEffect(() => {
    if (!isCustomerSessionLoading) void fetchCart();
  }, [isCustomerSessionLoading, customerSession?.account.id]);

  const totalCartTND = cartItems.reduce((sum, item) => sum + (item.lineTotalTND ?? item.priceTND * item.quantity), 0);
  const totalCartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const handleExtracted = (product: ScrapedProduct) => {
    setExtractedProduct(product);
    setIsAiDrawerOpen(false);
    setIsMenuDrawerOpen(false);
    setIsProductDrawerOpen(true);
  };

  const handleToggleProductDrawer = () => {
    if (isProductDrawerOpen) {
      setIsProductDrawerOpen(false);
    } else {
      setIsAiDrawerOpen(false);
      setIsMenuDrawerOpen(false);
      setIsProductDrawerOpen(true);
    }
  };

  // AYROVIX Lens — nouvelle expérience (caméra / galerie / lien / QR) branchée sur le flux panier existant.
  const handleOpenLens = () => {
    setIsProductDrawerOpen(false);
    setIsAiDrawerOpen(false);
    setIsMenuDrawerOpen(false);
    setIsCartOpen(false);
    setIsLensOpen(true);
  };

  const handleAyrovixOrder = async (payload: AyrovixOrderPayload) => {
    const summary = await handleAddToCart({ ...payload, priceTND: payload.priceTND ?? 0 });
    if (!summary) throw new Error('AYROVIX_ADD_TO_CART_FAILED');
    setIsLensOpen(false);
    setIsCartOpen(true);
  };

  const handleToggleAiDrawer = () => {
    if (isAiDrawerOpen) {
      setIsAiDrawerOpen(false);
    } else {
      setIsProductDrawerOpen(false);
      setIsMenuDrawerOpen(false);
      setIsAiDrawerOpen(true);
    }
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
    setIsCartOpen(false);
    setIsProductDrawerOpen(false);
    if (!customerSession) {
      setResumeCheckoutAfterAuth(true);
      setAccountInitialSection('home');
      setAccountMessage('Connectez-vous pour confirmer votre commande. Votre panier est conservé.');
      setIsAccountOpen(true);
      return;
    }
    // Aucun préalable de vérification téléphonique : le numéro de livraison est saisi au checkout.
    setResumeCheckoutAfterAuth(false);
    setIsCheckoutOpen(true);
  };

  const handleCustomerSession = (nextSession: CustomerSession) => {
    setCustomerSession(nextSession);
    void fetchCart();
    if (resumeCheckoutAfterAuth) {
      setResumeCheckoutAfterAuth(false);
      setIsAccountOpen(false);
      setIsCheckoutOpen(true);
      setAccountMessage('');
    }
  };

  const handleOrderSuccess = (result: OrderResult) => {
    setIsCheckoutOpen(false);
    setOrderResult(result);
    setCartItems([]);
  };

  return (
    <div className="min-h-screen flex flex-col justify-between text-ink bg-white relative pb-20 sm:pb-24">
      
      {/* Top Yellow Notice Bar */}
      <TopAnnouncementBar onLearnMore={handleToggleProductDrawer} />

      {/* Header: Left Menu, Center Fig Logo + AYROVI, Right Profile */}
      <Navbar
        onOpenMenuDrawer={() => {
          setIsProductDrawerOpen(false);
          setIsAiDrawerOpen(false);
          setIsCartOpen(false);
          setIsMenuDrawerOpen(true);
        }}
        onOpenAccount={() => {
          setIsProductDrawerOpen(false);
          setIsAiDrawerOpen(false);
          setIsMenuDrawerOpen(false);
          setIsCartOpen(false);
          setResumeCheckoutAfterAuth(false);
          setAccountInitialSection('home');
          setAccountMessage('');
          setIsAccountOpen(true);
        }}
        isAuthenticated={Boolean(customerSession)}
      />

      {/* Sliding Side Menu Drawer */}
      {isMenuDrawerOpen && (
        <Suspense fallback={null}>
          <MenuDrawer isOpen onClose={() => setIsMenuDrawerOpen(false)} />
        </Suspense>
      )}

      {/* Full-image fashion hero */}
      <HeroSlider />

      {/* Backend-managed arrivals, stories, products, promotions and news */}
      <PublicCmsSections />

      {/* Partner Brands Marquee Slider Container with generous spacing */}
      <PartnerBrandsSlider />

      {/* About & Trust Section (3 Value Pillars) */}
      <AboutSection />

      {/* Hostinger-Style Full Footer with Fig Logo, Qui sommes-nous, Payment & Social Icons */}
      <Footer onOpenAccount={() => { setAccountInitialSection('home'); setIsAccountOpen(true); }} onOpenAssistant={() => setIsAiDrawerOpen(true)} />

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
            onClose={() => setIsProductDrawerOpen(false)}
            onAddToCart={handleAddToCart}
            onExtracted={handleExtracted}
            onNewClientOrder={handleNewClientOrder}
            onOrderComplete={() => setCartItems([])}
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
            onClose={() => setIsAiDrawerOpen(false)}
            onOpenLens={handleOpenLens}
            onOrder={handleAyrovixOrder}
            onOpenOrders={() => {
              setIsAiDrawerOpen(false);
              setAccountInitialSection('orders');
              setAccountMessage(customerSession ? '' : 'Connectez-vous pour consulter vos commandes.');
              setIsAccountOpen(true);
            }}
            onOpenAccount={() => {
              setIsAiDrawerOpen(false);
              setAccountInitialSection('home');
              setAccountMessage('');
              setIsAccountOpen(true);
            }}
          />
        </Suspense>
      )}

      {/* Slide-in Cart Drawer */}
      {/* AYROVIX Lens — expérience caméra mobile-first (au-dessus du système existant) */}
      {isLensOpen && (
        <Suspense fallback={null}>
          <LensLauncher isOpen historyScope={customerSession?.account.id || null} onClose={() => setIsLensOpen(false)} onOrder={handleAyrovixOrder} />
        </Suspense>
      )}

      {isCartOpen && (
        <Suspense fallback={null}>
          <CartDrawer
            isOpen
            onClose={() => setIsCartOpen(false)}
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
            onClose={() => setIsCheckoutOpen(false)}
            totalTND={totalCartTND}
            itemCount={totalCartCount}
            customerSession={customerSession}
            onRequireAuthentication={() => {
              setIsCheckoutOpen(false);
              setResumeCheckoutAfterAuth(true);
              setAccountInitialSection('home');
              setAccountMessage('Connectez-vous pour confirmer la commande.');
              setIsAccountOpen(true);
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
            onClose={() => { setIsAccountOpen(false); setResumeCheckoutAfterAuth(false); setAccountMessage(''); }}
            onSession={handleCustomerSession}
            onLoggedOut={() => { setCustomerSession(null); setResumeCheckoutAfterAuth(false); void fetchCart(); }}
            onCartChanged={() => { void fetchCart(); }}
            onOpenCart={() => { setIsAccountOpen(false); setIsCartOpen(true); }}
          />
        </Suspense>
      )}

      {/* Order Success Confetti Modal */}
      {orderResult && (
        <Suspense fallback={null}>
          <OrderSuccessModal
            result={orderResult}
            onClose={() => setOrderResult(null)}
            onOpenAccount={() => { setOrderResult(null); setAccountInitialSection('home'); setIsAccountOpen(true); }}
          />
        </Suspense>
      )}

    </div>
  );
};
