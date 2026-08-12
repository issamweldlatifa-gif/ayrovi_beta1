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
import { AddToCartPayload, AddToCartResult, ScrapedProduct, CartItem, OrderResult } from './types';
import { getSessionId } from './utils/session';

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
    fetchCart();
  }, []);

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
        headers: { 'x-session-id': getSessionId() },
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
    setIsCheckoutOpen(true);
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
        onOrderSuccess={handleOrderSuccess}
      />

      {/* Order Success Confetti Modal */}
      <OrderSuccessModal
        result={orderResult}
        onClose={() => setOrderResult(null)}
      />

    </div>
  );
};
