import React, { useState, useEffect } from 'react';
import { TopAnnouncementBar } from './components/TopAnnouncementBar';
import { Navbar } from './components/Navbar';
import { MenuDrawer } from './components/MenuDrawer';
import { HeroSlider } from './components/HeroSlider';
import { PartnerBrandsSlider } from './components/PartnerBrandsSlider';
import { PublicCmsSections } from './components/PublicCmsSections';
import { AboutSection } from './components/AboutSection';
import { BottomNavBar } from './components/BottomNavBar';
import { ProductDrawer } from './components/ProductDrawer';
import { AiAssistantDrawer } from './components/assistant/AiAssistantDrawer';
import { ScrollToTopButton } from './components/ScrollToTopButton';
import { CartDrawer } from './components/CartDrawer';
import { CheckoutModal } from './components/CheckoutModal';
import { OrderSuccessModal } from './components/OrderSuccessModal';
import { Footer } from './components/Footer';
import { CustomerAccountPage } from './components/CustomerAccountPage';
import { AddToCartPayload, AddToCartResult, ScrapedProduct, CartItem, OrderResult, CustomerSession } from './types';
import { getSessionId } from './utils/session';
import { customerApi } from './customer/api';

export const App: React.FC = () => {
  const [extractedProduct, setExtractedProduct] = useState<ScrapedProduct | null>(null);

  // Drawer States (Mutually Exclusive)
  const [isProductDrawerOpen, setIsProductDrawerOpen] = useState(false);
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

  useEffect(() => {
    const restoreCustomer = async () => {
      const customerAuthResult = new URLSearchParams(window.location.search).get('customerAuth');
      try {
        const result = await customerApi<any>('/api/customer/auth/me');
        const restored = result.data as CustomerSession;
        setCustomerSession(restored);
        if (customerAuthResult === 'success') {
          setIsAccountOpen(true);
          setAccountMessage(restored.account.phoneVerified
            ? 'Connexion Google réussie. Votre compte AYROVI est actif.'
            : 'Connexion Google réussie. Vérifiez maintenant votre téléphone avant de commander.');
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
      setAccountMessage('Connectez-vous pour confirmer votre commande. Votre panier est conservé.');
      setIsAccountOpen(true);
      return;
    }
    if (!customerSession.account.phoneVerified) {
      setResumeCheckoutAfterAuth(true);
      setAccountMessage('Vérifiez votre numéro de téléphone pour confirmer la commande.');
      setIsAccountOpen(true);
      return;
    }
    setResumeCheckoutAfterAuth(false);
    setIsCheckoutOpen(true);
  };

  const handleCustomerSession = (nextSession: CustomerSession) => {
    setCustomerSession(nextSession);
    void fetchCart();
    if (nextSession.account.phoneVerified && resumeCheckoutAfterAuth) {
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
    <div className="min-h-screen flex flex-col justify-between text-[#1d2130] bg-white relative pb-20 sm:pb-24">
      
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
          setAccountMessage('');
          setIsAccountOpen(true);
        }}
        isAuthenticated={Boolean(customerSession)}
      />

      {/* Sliding Side Menu Drawer */}
      <MenuDrawer
        isOpen={isMenuDrawerOpen}
        onClose={() => setIsMenuDrawerOpen(false)}
      />

      {/* Full-image fashion hero */}
      <HeroSlider />

      {/* Backend-managed arrivals, stories, products, promotions and news */}
      <PublicCmsSections />

      {/* Partner Brands Marquee Slider Container with generous spacing */}
      <PartnerBrandsSlider />

      {/* About & Trust Section (3 Value Pillars) */}
      <AboutSection />

      {/* Hostinger-Style Full Footer with Fig Logo, Qui sommes-nous, Payment & Social Icons */}
      <Footer />

      {/* Floating Scroll To Top FAB Button */}
      <ScrollToTopButton />

      {/* Instagram-Style Floating Transparent White Glass Bottom Nav Bar (AI Icon on Left, Lens Icon on Right) */}
      <BottomNavBar
        isAiDrawerOpen={isAiDrawerOpen}
        isProductDrawerOpen={isProductDrawerOpen}
        cartCount={totalCartCount}
        onToggleAiDrawer={handleToggleAiDrawer}
        onToggleProductDrawer={handleToggleProductDrawer}
        onScrollToTop={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        onOpenCart={() => {
          setIsProductDrawerOpen(false);
          setIsAiDrawerOpen(false);
          setIsMenuDrawerOpen(false);
          setIsCartOpen(true);
        }}
      />

      {/* DRAWER 1: Complete 100% Height Product Flow Drawer (Lens Button) */}
      <ProductDrawer
        isOpen={isProductDrawerOpen}
        product={extractedProduct}
        onClose={() => setIsProductDrawerOpen(false)}
        onAddToCart={handleAddToCart}
        onExtracted={handleExtracted}
        onNewClientOrder={handleNewClientOrder}
        onOrderComplete={() => setCartItems([])}
        onCheckoutRequested={handleProceedToCheckout}
      />

      {/* Modular AYROVI assistant interface */}
      <AiAssistantDrawer
        isOpen={isAiDrawerOpen}
        onClose={() => setIsAiDrawerOpen(false)}
      />

      {/* Slide-in Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        totalTND={totalCartTND}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onProceedToCheckout={handleProceedToCheckout}
      />

      {/* Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        totalTND={totalCartTND}
        itemCount={totalCartCount}
        customerSession={customerSession}
        onRequireAuthentication={() => {
          setIsCheckoutOpen(false);
          setResumeCheckoutAfterAuth(true);
          setAccountMessage('Connectez-vous et vérifiez votre téléphone pour confirmer la commande.');
          setIsAccountOpen(true);
        }}
        onOrderSuccess={handleOrderSuccess}
      />

      <CustomerAccountPage
        isOpen={isAccountOpen}
        session={customerSession}
        loadingSession={isCustomerSessionLoading}
        initialMessage={accountMessage}
        onClose={() => { setIsAccountOpen(false); setResumeCheckoutAfterAuth(false); setAccountMessage(''); }}
        onSession={handleCustomerSession}
        onLoggedOut={() => { setCustomerSession(null); setResumeCheckoutAfterAuth(false); void fetchCart(); }}
        onCartChanged={() => { void fetchCart(); }}
        onOpenCart={() => { setIsAccountOpen(false); setIsCartOpen(true); }}
      />

      {/* Order Success Confetti Modal */}
      <OrderSuccessModal
        result={orderResult}
        onClose={() => setOrderResult(null)}
      />

    </div>
  );
};
