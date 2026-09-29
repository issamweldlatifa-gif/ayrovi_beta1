/* Browser verification only. Mount the production components with source-like test
 * records; API calls go to the real server in mobile-purchase.mjs. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import { CustomerIdentity } from '../client/src/design/editorial/CustomerIdentity';
import { NavigationHistoryProvider } from '../client/src/navigation/NavigationHistory';
import { ShopProductScreen } from '../client/src/shop/ShopProductScreen';
import { ShopBagScreen } from '../client/src/shop/ShopBagScreen';
import { ShopCheckoutScreen } from '../client/src/shop/ShopCheckoutScreen';
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
  React.useEffect(() => { (window as any).showPurchaseProduct = (value: AyrovixProduct) => { setCartOpen(false); setCheckoutOpen(false); setProduct({ ...value, availability: 'in_stock', availabilityCheckedAt: new Date().toISOString(), availabilityExpiresAt: new Date(Date.now() + 3600000).toISOString() }); }; }, []);
  const refreshCart = async () => {
    const response = await fetch('/api/cart/items', { headers: { 'x-session-id': getSessionId() } });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Cart unavailable');
    setItems(data.items); setCartTotal(data.totalTND); setDelivery(data.deliveryTND);
  };
  const add = async ({ size, color, quantity, manualUrl, customerNote }: { size: string; color: string; quantity: number; manualUrl: string; customerNote: string }) => {
    if (!product) throw new Error('Missing product');
    const sourcePrice = product.price;
    const sourceCurrency = product.currency;
    if (sourcePrice == null || !sourceCurrency) throw new Error('Incomplete selected quote');
    const response = await fetch('/api/cart/items', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-session-id': getSessionId() }, body: JSON.stringify({
      store: 'generic', externalId: null, url: manualUrl, title: product.title,
      imageUrl: product.image, sourcePrice, sourceCurrency, priceTND: 0,
      variant: size || color || '', requestedSize: size, requestedColor: color,
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
    {product ? <div className="mx-auto max-w-5xl px-4 py-2"><ShopProductScreen key={product.sourceUrl} product={product} onOrder={add}
      onBack={() => setProduct(null)} onCalculateAnother={() => setProduct(null)}
      onOpenCart={() => { void refreshCart().then(() => setCartOpen(true)); }}/></div>
      : <div className="p-5"><h1>Purchase-flow verification</h1><button onClick={() => { void refreshCart().then(() => setCartOpen(true)); }}>Open cart</button></div>}
    {cartOpen && <ShopBagScreen isOpen onClose={() => setCartOpen(false)} items={items} totalTND={cartTotal}
      deliveryTND={delivery} loadError={false} onRetry={() => void refreshCart()} onProceedToCheckout={() => { setCartOpen(false); setCheckoutOpen(true); }}
      onUpdateQuantity={(id, quantity) => { void mutate(id, 'PATCH', quantity); }} onRemoveItem={id => { void mutate(id, 'DELETE'); }}
      onCalculateAnotherProduct={() => setCartOpen(false)}/>}
    {checkoutOpen && <div className="shop-checkout-route" data-app-route="checkout"><ShopCheckoutScreen isOpen onClose={() => { setCheckoutOpen(false); setCartOpen(true); }}
      totalTND={cartTotal} itemCount={items.reduce((sum, item) => sum + item.quantity, 0)} modes={['home']}
      customerSession={demoAccount} onRequireAuthentication={() => { throw new Error('Auth should be supplied in this layout test'); }}
      onOrderSuccess={() => { throw new Error('Do not place a test order in a live database'); }}/></div>
    }
  </main>;
}
createRoot(document.getElementById('root')!).render(<LocaleProvider><CustomerIdentity><NavigationHistoryProvider><TestFlow /></NavigationHistoryProvider></CustomerIdentity></LocaleProvider>);
