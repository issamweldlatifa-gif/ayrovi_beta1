/* Browser verification only: exercise both production Lens/SONIM parent callbacks
 * against the real cart and pricing endpoints; never ship test products. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import { CustomerIdentity } from '../client/src/design/editorial/CustomerIdentity';
import { NavigationHistoryProvider, useNavigationHistory } from '../client/src/navigation/NavigationHistory';
import { LensLauncher } from '../client/src/ayrovix/components/LensLauncher';
import { AiAssistantDrawer } from '../client/src/components/assistant/AiAssistantDrawer';
import { CartDrawer } from '../client/src/components/CartDrawer';
import type { AyrovixOrderPayload } from '../client/src/ayrovix/types';
import type { CartItem } from '../client/src/types';
import { getSessionId } from '../client/src/utils/session';

const lens = new URLSearchParams(location.search).get('mode') === 'lens';
function PurchaseParents() {
  const nav = useNavigationHistory();
  const [cartOpen, setCartOpen] = useState(false);
  const [items, setItems] = useState<CartItem[]>([]);
  const [totalTND, setTotalTND] = useState(0);
  const [deliveryTND, setDeliveryTND] = useState(0);
  const refresh = async () => {
    const response = await fetch('/api/cart/items', { headers: { 'x-session-id': getSessionId() } });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Cart unavailable');
    setItems(data.items); setTotalTND(data.totalTND); setDeliveryTND(data.deliveryTND);
  };
  const onOrder = async (payload: AyrovixOrderPayload) => {
    const response = await fetch('/api/cart/items', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-session-id': getSessionId() },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Cannot add to cart');
    await refresh();
  };
  const onOpenCart = () => { void refresh().then(() => setCartOpen(true)); };
  return <main className="ayrovix-theme-scope">
    <button data-open onClick={() => nav.pushLayer({ id: lens ? 'app:lens' : 'app:assistant' })}>Open purchase parent</button>
    {lens && nav.has('app:lens') && <LensLauncher isOpen onClose={() => nav.back()} onOrder={onOrder}
      onOpenCart={onOpenCart} cartCount={items.length} darkMode={false} onToggleDarkMode={() => {}}/>}
    {!lens && nav.has('app:assistant') && <AiAssistantDrawer isOpen onClose={() => nav.back()}
      onOpenLens={() => {}} onOpenOrders={() => {}} onOpenAccount={() => {}}
      onOrder={onOrder} onOpenCart={onOpenCart}/>}
    {cartOpen && <CartDrawer isOpen onClose={() => setCartOpen(false)} items={items} totalTND={totalTND}
      deliveryTND={deliveryTND} onRetry={() => void refresh()}
      onUpdateQuantity={() => {}} onRemoveItem={() => {}}
      onProceedToCheckout={() => {}} onCalculateAnotherProduct={() => setCartOpen(false)}/>}
  </main>;
}
createRoot(document.getElementById('root')!).render(
  <LocaleProvider><CustomerIdentity><NavigationHistoryProvider><PurchaseParents /></NavigationHistoryProvider></CustomerIdentity></LocaleProvider>,
);
