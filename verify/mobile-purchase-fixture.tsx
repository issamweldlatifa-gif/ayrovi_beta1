/* Browser verification only. Mount the production components with source-like test
 * records; API calls go to the real server in mobile-purchase.mjs. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import { CustomerIdentity } from '../client/src/design/editorial/CustomerIdentity';
import { NavigationHistoryProvider } from '../client/src/navigation/NavigationHistory';
import { ProductResult, type AyrovixOrderSelection } from '../client/src/ayrovix/components/ProductResult';
import { resolveProductSelection } from '../client/src/ayrovix/services/productSelection';
import { CartDrawer } from '../client/src/components/CartDrawer';
import { CheckoutModal } from '../client/src/components/CheckoutModal';
import type { AyrovixProduct } from '../client/src/ayrovix/types';
import type { CartItem, CustomerSession } from '../client/src/types';
import { getSessionId } from '../client/src/utils/session';

const demoAccount = { account: { id: 'verification-only', displayName: 'Test Browser', email: 'buyer@example.org', phone: '98123456', emailVerified: true, phoneVerified: false }, csrfToken: '' } as CustomerSession;
function TestFlow() {
  const [product, setProduct] = useState<AyrovixProduct | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [cartTotal, setCartTotal] = useState(0);
  const [delivery, setDelivery] = useState(0);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  React.useEffect(() => { (window as any).showPurchaseProduct = (value: AyrovixProduct) => { setCartOpen(false); setCheckoutOpen(false); setProduct(value); }; }, []);
  const refreshCart = async () => {
    const response = await fetch('/api/cart/items', { headers: { 'x-session-id': getSessionId() } });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Cart unavailable');
    setItems(data.items); setCartTotal(data.totalTND); setDelivery(data.deliveryTND);
  };
  const add = async ({ option, size, color, quantity, manualUrl, customerNote }: AyrovixOrderSelection) => {
    if (!product) throw new Error('Missing product');
    const { offer } = resolveProductSelection(product, size, color);
    if (offer.price == null || !offer.currency) throw new Error('Incomplete selected quote');
    const response = await fetch('/api/cart/items', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-session-id': getSessionId() }, body: JSON.stringify({
      store: 'generic', externalId: option?.id || null, url: manualUrl, title: product.title,
      imageUrl: product.image, sourcePrice: offer.price,
      sourceCurrency: offer.currency, priceTND: 0,
      variant: option?.label || size || color || '', requestedSize: size, requestedColor: color,
      customerNote, quantity,
    }) });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Cannot add product');
    await refreshCart();
  };
  const mutate = async (id: string, method: 'DELETE' | 'PATCH', quantity?: number) => {
    const response = await fetch(`/api/cart/items/${id}`, { method, headers: { 'x-session-id': getSessionId(), 'Content-Type': 'application/json' }, body: method === 'PATCH' ? JSON.stringify({ quantity }) : undefined });
    if (!response.ok) throw new Error('Cart update failed');
    await refreshCart();
  };
  return <main className="ayrovix-theme-scope min-h-screen bg-white">
    {product ? <div className="mx-auto max-w-5xl px-4 py-2"><ProductResult key={product.sourceUrl} product={product} onOrder={add}
      onBack={() => setProduct(null)} onCalculateAnother={() => setProduct(null)}
      onOpenCart={() => { void refreshCart().then(() => setCartOpen(true)); }}/></div>
      : <div className="p-5"><h1>Purchase-flow verification</h1><button onClick={() => { void refreshCart().then(() => setCartOpen(true)); }}>Open cart</button></div>}
    {cartOpen && <CartDrawer isOpen onClose={() => setCartOpen(false)} items={items} totalTND={cartTotal}
      deliveryTND={delivery} loadError={false} onRetry={() => void refreshCart()} onProceedToCheckout={() => { setCartOpen(false); setCheckoutOpen(true); }}
      onUpdateQuantity={(id, quantity) => { void mutate(id, 'PATCH', quantity); }} onRemoveItem={id => { void mutate(id, 'DELETE'); }}
      onCalculateAnotherProduct={() => setCartOpen(false)}/>}
    {checkoutOpen && <CheckoutModal isOpen onClose={() => { setCheckoutOpen(false); setCartOpen(true); }}
      totalTND={cartTotal} itemCount={items.reduce((sum, item) => sum + item.quantity, 0)}
      breakdown={{ subtotal: 0, customs: 0, shipping: delivery, service: 0, express: 0, discount: 0 }}
      customerSession={demoAccount} onRequireAuthentication={() => { throw new Error('Auth should be supplied in this layout test'); }}
      onOrderSuccess={() => { throw new Error('Do not place a test order in a live database'); }}/>
    }
  </main>;
}
createRoot(document.getElementById('root')!).render(<LocaleProvider><CustomerIdentity><NavigationHistoryProvider><TestFlow /></NavigationHistoryProvider></CustomerIdentity></LocaleProvider>);
