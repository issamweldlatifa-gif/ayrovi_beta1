// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseCommercePolicy } from '../client/src/commerce/policy';
import { CartDrawer } from '../client/src/components/CartDrawer';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import type { CartItem } from '../client/src/types';
const api=vi.hoisted(()=>({getCommerceConfig:vi.fn()}));
vi.mock('../client/src/services/publicApi',()=>api);
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLDivElement;
const valid={deposit:{percent:30,cardDiscountPercent:5}};
const props={isOpen:true,onClose:vi.fn(),items:[{id:'1',title:'Product',quantity:1,priceTND:100,sourceUrl:'javascript:alert(1)',priceVerificationStatus:'PENDING_MANUAL'} as unknown as CartItem],totalTND:100,onUpdateQuantity:vi.fn(),onRemoveItem:vi.fn(),onProceedToCheckout:vi.fn(),onCalculateAnotherProduct:vi.fn()};
beforeEach(()=>{vi.clearAllMocks();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const render=()=>act(async()=>root.render(<LocaleProvider><CartDrawer {...props}/></LocaleProvider>));
const proceed=()=>[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('Commander'))!;
describe('server-owned commerce terms',()=>{
 it.each([undefined,null,'',true,-1,0,101,Infinity,NaN])('rejects missing/invalid deposit %s',percent=>expect(()=>parseCommercePolicy({deposit:{percent,cardDiscountPercent:5}})).toThrow('COMMERCE_TERMS_INVALID'));
 it.each([undefined,null,'',-1,101,Infinity])('does not guess a card discount %s',cardDiscountPercent=>expect(()=>parseCommercePolicy({deposit:{percent:30,cardDiscountPercent}})).toThrow());
 it('accepts an explicit zero discount and server-provided numeric terms',()=>expect(parseCommercePolicy({deposit:{percent:'30',cardDiscountPercent:0}}).deposit).toMatchObject({percent:30,cardDiscountPercent:0}));
 it('does not present a guessed deposit or actionable unsafe product URL while loading',async()=>{
  api.getCommerceConfig.mockReturnValue(new Promise(()=>{}));await render();
  expect(host.textContent).toContain('Chargement des conditions');expect(host.textContent).not.toContain('20%');expect(proceed().disabled).toBe(true);expect(host.querySelector('a')).toBeNull();
 });
 it('blocks checkout on invalid configuration, explicitly refreshes on retry and then uses the confirmed rate',async()=>{
  api.getCommerceConfig.mockResolvedValueOnce({data:{deposit:{percent:20}}}).mockResolvedValueOnce({data:valid});await render();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('indisponibles');expect(proceed().disabled).toBe(true);
  const retry=[...host.querySelectorAll('button')].find(b=>b.textContent==='Réessayer')!;
  await act(async()=>retry.click());expect(api.getCommerceConfig).toHaveBeenLastCalledWith({refresh:true});
  expect(host.textContent).toContain('acompte de 30%');expect(host.textContent).not.toContain('Remboursement de l’acompte');expect(proceed().disabled).toBe(false);
  await act(async()=>proceed().click());expect(props.onProceedToCheckout).toHaveBeenCalledOnce();
 });
 it('reports network failures rather than retaining the old default',async()=>{
  api.getCommerceConfig.mockRejectedValue(new Error('offline'));await render();expect(host.querySelector('[role="alert"]')).not.toBeNull();expect(proceed().disabled).toBe(true);expect(host.textContent).not.toContain('20%');
 });
});
