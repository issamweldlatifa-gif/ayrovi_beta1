// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { decodeConversation, type AssistantConversation } from '../client/src/components/assistant/conversationCodec';
import { readAssistantHistory, saveAssistantConversation, deleteAssistantConversation, MAX_HISTORY_CHARACTERS } from '../client/src/components/assistant/conversationHistory';
import type { AssistantMessage } from '../client/src/components/assistant/types';
import type { AyrovixProduct } from '../client/src/ayrovix/types';
const key = 'ayrovi_assistant_conversations_v1_guest';
const at = '2026-09-20T10:00:00.000Z';
const breakdown = { originalPrice: 20, currency: 'EUR', exchangeRate: 3, convertedPriceTND: 60, customsFeeTND: 2, shippingFeeTND: 4, serviceFeeTND: 4, expressFeeTND: 0, totalTND: 70, pricingVersion: 1 };
const product: AyrovixProduct = { title: 'Produit / منتج', brand: 'Brand', model: 'Model', description: 'Description كاملة', source: 'Merchant', sourceUrl: 'https://example.test/product', image: '/media/test.png', images: ['https://example.test/image.png'], price: 20, currency: 'EUR', priceTnd: 70, exchangeRate: 3, colors: ['أسود'], sizes: ['M'], availability: 'in_stock', priceVerified: true, priceVerificationStatus: 'VERIFIED', priceToken: 'SIGNED_QUOTE_FIXTURE', verificationProvider: 'fixture', verificationMethod: 'fixture', verificationFailureCode: null, rating: 4.5, ratingCount: 80, ratingKind: 'merchant', variantOptions: [{ id: 'v1', label: 'M — أسود', size: 'M', color: 'أسود', available: true, price: 22, currency: 'EUR', priceTnd: 76, priceToken: 'VARIANT_QUOTE_FIXTURE' }] };
const conversation = (messages: AssistantMessage[] = [{ id: 'assistant', role: 'assistant', text: 'Bonjour\n\nمرحبًا ✅' }]): AssistantConversation => ({ id: 'conversation', title: 'Question / سؤال', messages, createdAt: at, updatedAt: at });
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());
describe('complete, validated local conversation snapshots', () => {
  it('preserves all tool-only messages, warnings and suggested actions', () => {
    const input = conversation([
      { id: 'price', role: 'assistant', text: '', priceBreakdown: breakdown },
      { id: 'lens', role: 'assistant', text: '', lensSummary: { confidence: .7, verified: true, warnings: ['أول', 'آخر'] }, suggestedActions: [{ label: 'Continuer', prompt: 'السؤال الكامل' }] },
      { id: 'support', role: 'assistant', text: '', supportTicket: { id: 'ticket', status: 'OPEN', priority: 'normal', createdAt: at } },
      { id: 'image', role: 'user', text: '', attachments: [{ id: 'image-1', name: 'صورة.png', type: 'image/png', preview: 'data:image/png;base64,PRIVATE_IMAGE' }] },
    ]);
    expect(saveAssistantConversation(null, input).status).toBe('ready');
    const restored = readAssistantHistory().conversations[0];
    expect(restored.messages).toHaveLength(4);
    expect(restored.messages[0].priceBreakdown).toEqual(breakdown);
    expect(restored.messages[1].lensSummary).toEqual(input.messages[1].lensSummary);
    expect(restored.messages[1].suggestedActions).toEqual(input.messages[1].suggestedActions);
    expect(restored.messages[2].supportTicket?.id).toBe('ticket');
    expect(restored.messages[3].attachments?.[0]).toEqual({ id: 'image-1', name: 'صورة.png', type: 'image/png' });
    expect(localStorage.getItem(key)).not.toContain('PRIVATE_IMAGE');
  });
  it('preserves long AR/FR text, paragraphs, complete titles and more than sixty messages', () => {
    const full = ('Texte complet — النص الكامل ✅\n\n').repeat(500);
    const input = conversation(Array.from({ length: 72 }, (_, i) => ({ id: 'm'+i, role: 'assistant', text: i === 0 ? full : 'Message '+i })));
    input.title = 'Question complète / سؤال كامل '.repeat(20);
    saveAssistantConversation(null, input);
    const restored = readAssistantHistory().conversations[0];
    expect(restored.messages).toHaveLength(72); expect(restored.messages[0].text).toBe(full); expect(restored.title).toBe(input.title);
  });
  it('retains product metadata, full variant collections, ratings and verification reason without claiming a fresh verification', () => {
    const input = conversation();
    input.selectedProduct = { messageId: 'assistant', priceVerified: true, product: { ...product, title: 'Titre '.repeat(80), description: 'Description '.repeat(200), variantOptions: Array.from({ length: 95 }, (_, i) => ({ ...product.variantOptions![0], id: String(i), label: 'Variante '+i })) } };
    saveAssistantConversation(null, input);
    const restored = readAssistantHistory().conversations[0];
    expect(restored.selectedProduct?.product).toEqual(input.selectedProduct.product);
    expect(restored.selectedProduct?.priceVerified).toBe(true); // Historical data, not a newly minted quote.
    expect(decodeConversation(restored)).toEqual(restored);
  });
  it('retains all candidates and order history instead of slicing presentation arrays', () => {
    const input = conversation([{ id: 'tools', role: 'assistant', text: '', products: Array.from({ length: 12 }, (_, i) => ({ ...product, id: 'p'+i, kind: 'external', match: 80, ratingKind: 'merchant' })), orderStatuses: Array.from({ length: 7 }, (_, i) => ({ orderId: 'o'+i, status: 'SHIPPED', statusLabel: 'En route', paymentStatus: 'PAID', depositStatus: 'PAID', trackingCode: 'T', carrier: 'Carrier', expectedAt: null, updatedAt: at, history: Array.from({ length: 9 }, (_, j) => ({ status: 's'+j, label: 'Étape '+j, at })) })) }]);
    saveAssistantConversation(null, input);
    const restored = readAssistantHistory().conversations[0].messages[0];
    expect(restored.products).toHaveLength(12); expect(restored.orderStatuses).toHaveLength(7); expect(restored.orderStatuses![6].history).toHaveLength(9);
  });
  it.each([
    { products: [null] }, { products: [{ id: 'p', title: 'P', sourceUrl: {} }] },
    { priceBreakdown: { ...breakdown, totalTND: '70' } },
    { orderStatuses: [{ orderId: 'x', updatedAt: at, history: 'not-an-array' }] },
    { lensSummary: { confidence: .8, warnings: {} } },
    { suggestedActions: [{ label: 'Test', prompt: {} }] },
    { supportTicket: { id: 'x', createdAt: 'invalid-date' } },
  ])('rejects malformed nested data without erasing the previous stored conversation: %j', fragment => {
    saveAssistantConversation(null, conversation()); const original = localStorage.getItem(key);
    const result = saveAssistantConversation(null, conversation([{ id: 'broken', role: 'assistant', text: 'Body', ...fragment } as AssistantMessage]));
    expect(result.status).toBe('invalid'); expect(localStorage.getItem(key)).toBe(original);
  });
  it('does not let executable/data/blob image schemes survive persistence', () => {
    const input = conversation(); input.selectedProduct = { messageId: 'assistant', priceVerified: false, product: { ...product, image: 'javascript:alert(1)', images: ['data:image/svg+xml,SECRET', 'blob:private', '/media/valid.png'] } };
    saveAssistantConversation(null, input); const stored = localStorage.getItem(key)!;
    expect(stored).not.toMatch(/javascript:|data:image|blob:private|SECRET/); expect(stored).toContain('/media/valid.png');
  });
  it('detects duplicate identifiers and an orphan selected product', () => {
    const input = conversation(); input.messages.push(input.messages[0]);
    expect(saveAssistantConversation(null, input).status).toBe('invalid');
    const orphan = conversation(); orphan.selectedProduct = { messageId: 'missing', product, priceVerified: true };
    expect(saveAssistantConversation(null, orphan).status).toBe('invalid');
  });
  it('reads legacy arrays without rewriting timestamps or mutating storage', () => {
    const raw = JSON.stringify([conversation()]); localStorage.setItem(key, raw);
    expect(readAssistantHistory().status).toBe('ready'); expect(localStorage.getItem(key)).toBe(raw);
    expect(readAssistantHistory().conversations[0].updatedAt).toBe(at);
  });
  it('recovers readable conversations from a corrupt collection without allowing automatic data destruction', () => {
    const raw = JSON.stringify([conversation(), { id: 'broken' }]); localStorage.setItem(key, raw);
    const result = readAssistantHistory(); expect(result.status).toBe('corrupt'); expect(result.conversations).toHaveLength(1);
    expect(saveAssistantConversation(null, conversation()).status).toBe('corrupt');
    expect(deleteAssistantConversation(null, 'conversation').status).toBe('corrupt'); expect(localStorage.getItem(key)).toBe(raw);
  });
  it.each(['{broken', '{}', '[null]', JSON.stringify([conversation(), conversation()])])('preserves damaged raw history: %s', raw => {
    localStorage.setItem(key, raw); expect(readAssistantHistory().status).toBe('corrupt');
    saveAssistantConversation(null, conversation()); expect(localStorage.getItem(key)).toBe(raw);
  });
  it('reports failed save and failed deletion without returning an invented persistent list', () => {
    saveAssistantConversation(null, conversation()); const old = localStorage.getItem(key);
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    const next = { ...conversation(), id: 'new' };
    const result = saveAssistantConversation(null, next); expect(result.status).toBe('quota'); expect(result.conversations.map(c => c.id)).toEqual(['conversation']);
    expect(deleteAssistantConversation(null, 'conversation').status).toBe('quota'); expect(localStorage.getItem(key)).toBe(old);
    write.mockRestore(); expect(saveAssistantConversation(null, next).status).toBe('ready'); expect(readAssistantHistory().conversations).toHaveLength(2);
  });
  it('handles read denial and generic write denial without throwing', () => {
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    expect(readAssistantHistory().status).toBe('unavailable'); expect(saveAssistantConversation(null, conversation()).status).toBe('unavailable');
    read.mockRestore(); vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(saveAssistantConversation(null, conversation()).status).toBe('unavailable');
  });
  it('reports the whole-document size limit without truncating the new text or replacing the old data', () => {
    saveAssistantConversation(null, conversation()); const old = localStorage.getItem(key);
    const huge = conversation([{ id: 'large', role: 'assistant', text: 'x'.repeat(MAX_HISTORY_CHARACTERS) }]);
    expect(saveAssistantConversation(null, huge).status).toBe('limit'); expect(huge.messages[0].text.length).toBe(MAX_HISTORY_CHARACTERS); expect(localStorage.getItem(key)).toBe(old);
    localStorage.setItem(key, ' '.repeat(MAX_HISTORY_CHARACTERS+1)); expect(readAssistantHistory().status).toBe('limit');
  });
  it('retains twenty newest conversations and keeps guest/account scopes separate', () => {
    for (let i=0; i<22; i++) saveAssistantConversation(null, { ...conversation(), id: 'c'+i, updatedAt: new Date(Date.parse(at)+i*1000).toISOString() });
    const items = readAssistantHistory().conversations; expect(items).toHaveLength(20); expect(items[0].id).toBe('c21'); expect(items.at(-1)?.id).toBe('c2');
    saveAssistantConversation('customer-A', { ...conversation(), id: 'private-A' }); saveAssistantConversation('customer-B', { ...conversation(), id: 'private-B' });
    expect(readAssistantHistory('customer-A').conversations.map(c => c.id)).toEqual(['private-A']); expect(readAssistantHistory('customer-B').conversations.map(c => c.id)).toEqual(['private-B']); expect(readAssistantHistory().conversations).toHaveLength(20);
  });
});

describe('historical variant eligibility is not coerced from untrusted values',()=>{
  it.each([undefined,null,'false',0,{},[]].map(available=>({available})))('does not enable an option from %j',({available})=>{
    const input=conversation();
    input.selectedProduct={messageId:'assistant',priceVerified:true,product:{...product,variantOptions:[{...product.variantOptions![0],available:available as any}]}};
    const restored=decodeConversation(input);
    expect(restored.selectedProduct?.product.variantOptions?.[0].available).not.toBe(true);
    expect(restored.messages).toMatchObject(input.messages);
    expect(restored.messages).toHaveLength(input.messages.length);
    expect(restored.selectedProduct?.product.variantOptions?.[0].label).toBe(product.variantOptions![0].label);
  });
});

it('canonicalizes invalid eligibility without deleting text/options or rewriting raw history on read',()=>{
 const input=conversation();input.selectedProduct={messageId:'assistant',priceVerified:false,product:{...product,availability:'unknown',variantOptions:[{...product.variantOptions![0],available:'false' as any}]}};
 const raw=JSON.stringify([input]);localStorage.setItem(key,raw);
 const result=readAssistantHistory();expect(result.status).toBe('ready');expect(localStorage.getItem(key)).toBe(raw);
 const restored=result.conversations[0];expect(restored.messages[0].text).toBe(input.messages[0].text);
 expect(restored.selectedProduct?.product.variantOptions).toHaveLength(1);
 expect(restored.selectedProduct?.product.variantOptions?.[0]).toEqual({...input.selectedProduct.product.variantOptions![0],available:false});
 expect(restored.selectedProduct?.product.availability).toBe('unknown');
});
