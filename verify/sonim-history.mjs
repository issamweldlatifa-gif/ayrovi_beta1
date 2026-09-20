import { chromium } from 'playwright';
import fs from 'node:fs';
const output = 'screenshots/editorial/sonim-history'; fs.mkdirSync(output, { recursive: true });
const checks = [], errors = [];
function check(label, pass, details) { checks.push({ label, pass: Boolean(pass), details }); if (!pass) throw new Error(label + ': ' + JSON.stringify(details)); }
const storageKey = 'ayrovi_assistant_conversations_v1_guest';
const at = '2026-09-20T10:00:00.000Z';
const price = { originalPrice: 20, currency: 'EUR', exchangeRate: 3, convertedPriceTND: 60, customsFeeTND: 2, shippingFeeTND: 4, serviceFeeTND: 4, expressFeeTND: 0, totalTND: 70, pricingVersion: 1 };
const storedProduct = { title: 'STORED_PRODUCT / المنتج المحفوظ', brand: null, model: null, description: 'Description historique / وصف محفوظ', image: '', images: [], source: 'Test merchant', sourceUrl: 'https://example.test/product', price: 20, currency: 'EUR', priceTnd: 70, exchangeRate: 3, colors: ['Noir'], sizes: ['M'], availability: 'in_stock', priceVerificationStatus: 'VERIFIED', priceVerified: true, priceToken: 'OLD_TEST_QUOTE', rating: 4.8, ratingCount: 19, ratingKind: 'merchant' };
const freshProduct = { ...storedProduct, title: 'CURRENT_PRODUCT / المنتج الحالي', price: 40, priceTnd: 140, priceToken: 'FRESH_TEST_QUOTE', colors: [], sizes: [], sourceUrl: 'https://example.test/current-product' };
const browser = await chromium.launch({ headless: true }); let page;
try {
  for (const locale of ['fr', 'ar']) for (const width of [320, 390]) {
    const ar = locale === 'ar', key = `${locale}/${width}`;
    const longText = (ar ? 'فقرة عربية كاملة لا يجوز حذف نهايتها.\n\n' : 'Paragraphe français complet, sans mots supprimés.\n\n').repeat(220) + 'LAST_PARAGRAPH';
    const title = (ar ? 'السؤال الكامل دون اقتطاع العنوان ' : 'La question complète sans tronquer son titre ').repeat(5) + 'TITLE_END';
    const initial = [{ id: 'history-fixture', title, createdAt: at, updatedAt: at, messages: [
      { id: 'long', role: 'assistant', text: longText },
      { id: 'price', role: 'assistant', text: '', priceBreakdown: price },
      { id: 'lens', role: 'assistant', text: '', lensSummary: { confidence: .81, verified: true, warnings: ['WARNING_FIRST', 'WARNING_LAST'] }, suggestedActions: [{ label: 'ACTION_LAST', prompt: 'PROMPT_FROM_HISTORY' }] },
      { id: 'support', role: 'assistant', text: '', supportTicket: { id: 'TICKET_LAST', status: 'OPEN', createdAt: at } },
      { id: 'order', role: 'assistant', text: '', orderStatuses: [{ orderId: 'ORDER_LAST', status: 'SHIPPED', statusLabel: 'Historical state', paymentStatus: 'PAID', depositStatus: 'PAID', trackingCode: 'TRACK_LAST', carrier: 'Fixture', expectedAt: null, updatedAt: at, history: Array.from({ length: 8 }, (_, i) => ({ status: 's'+i, label: 'HISTORY_'+i, at })) }] },
      { id: 'attachment', role: 'user', text: '', attachments: [{ id: 'photo', name: 'ATTACHMENT_LAST.png', type: 'image/png' }] },
      { id: 'selected-only', role: 'assistant', text: '' },
      { id: 'candidates', role: 'assistant', text: '', products: [{ ...storedProduct, id: 'candidate', kind: 'catalog', match: 80 }] },
    ], selectedProduct: { messageId: 'selected-only', product: storedProduct, priceVerified: true } }];
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    await ctx.addInitScript(({ locale, storageKey, initial }) => {
      localStorage.setItem('ayrovi.locale.v1', locale);
      if (!sessionStorage.getItem('history-fixture-seeded')) { localStorage.setItem(storageKey, JSON.stringify(initial)); sessionStorage.setItem('history-fixture-seeded', 'yes'); }
      window.historyWriteFailure = false;
      window.holdHistoryStream = false;
      const fetchOriginal = window.fetch.bind(window);
      window.fetch = (url, options) => {
        if (String(url) !== '/api/assistant/chat' || !window.holdHistoryStream) return fetchOriginal(url, options);
        const body = new ReadableStream({ start(controller) {
          controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify({ type: 'delta', text: 'PARTIAL_REPLY_PRESERVED' })+'\n\n'));
          options.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
        } });
        return Promise.resolve(new Response(body, { headers: { 'content-type': 'text/event-stream' } }));
      };
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (window.historyWriteFailure && key === storageKey) throw new DOMException('Test quota', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    }, { locale, storageKey, initial });
    page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/assistant/status', route => route.fulfill({ json: { success: true, data: { voiceReady: false } } }));
    let replyNumber = 0; const chatInputs = [];
    await page.route('**/api/assistant/chat', route => {
      chatInputs.push(route.request().postDataJSON());
      replyNumber++;
      return route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ type: 'delta', text: 'LIVE_REPLY_'+replyNumber })}\n\ndata: ${JSON.stringify({ type: 'done', model: 'fixture' })}\n\n` });
    });
    let resolutionMode = 'success', heldRoute = null;
    await page.route('**/api/ayrovix/analyze-url', route => {
      if (resolutionMode === 'pending') { heldRoute = route; return; }
      return resolutionMode === 'error' ? route.fulfill({ status: 503, json: { success: false, error: 'Test failure' } }) : route.fulfill({ json: { success: true, data: { product: freshProduct, alternates: [], eventId: '' } } });
    });
    const open = async () => { await page.locator('[data-open]').waitFor(); if (!(await page.getByRole('dialog', { name: 'SONIM', exact: true }).count())) await page.locator('[data-open]').click(); await page.locator('[data-assistant-messages]').waitFor(); };
    const menuButton = () => page.getByRole('button', { name: ar ? 'القائمة' : 'Menu', exact: true });
    const menu = () => page.getByRole('dialog', { name: ar ? 'قائمة SONIM' : 'Menu SONIM', exact: true });
    const closeMenu = async () => { await page.keyboard.press('Escape'); await menu().waitFor({ state: 'hidden' }); };
    const send = async text => { const expected = replyNumber + 1; await page.getByRole('textbox', { name: ar ? 'رسالتك' : 'Votre message', exact: true }).fill(text); await page.getByRole('button', { name: ar ? 'إرسال' : 'Envoyer', exact: true }).click(); await page.getByText('LIVE_REPLY_'+expected, { exact: true }).waitFor(); };
    const persisted = () => page.evaluate(key => localStorage.getItem(key), storageKey);
    await page.goto(process.env.AYROVI_BASE_URL + '/__verify/sonim'); await open();
    const prose = page.locator('p.whitespace-pre-wrap').filter({ hasText: 'LAST_PARAGRAPH' });
    check(`${key}: initial legacy long text is complete`, await prose.textContent() === longText);
    for (const marker of ['WARNING_LAST', 'ACTION_LAST', 'TICKET_LAST', 'ORDER_LAST', 'HISTORY_7', 'ATTACHMENT_LAST.png']) check(`${key}: restores ${marker} without prose`, (await page.locator('[data-assistant-messages]').innerText()).includes(marker));
    check(`${key}: historical price card is present`, (await page.locator('[data-assistant-messages]').innerText()).includes('70.00 TND'));
    check(`${key}: selected-only message has a recovery action`, await page.locator('[data-restored-product]').isVisible());
    check(`${key}: restored prices are explicitly historical`, (await page.locator('[data-history-notice]').innerText()).includes(ar ? 'بيانات سابقة' : 'données historiques'));
    check(`${key}: loading a snapshot does not mint a new save timestamp`, JSON.parse(await persisted())[0].updatedAt === at);
    await menuButton().click();
    check(`${key}: entire stored title is displayed`, await menu().getByText(title, { exact: true }).count() === 1);
    check(`${key}: retention and attachment policy is visible`, (await menu().innerText()).includes(ar ? 'أحدث 20' : '20 conversations'));
    await closeMenu();
    await send('SAVE_ROUND_TRIP');
    await page.waitForFunction(key => localStorage.getItem(key).includes('LIVE_REPLY_1'), storageKey);
    check(`${key}: historical selection is not sent as a currently configured product`, chatInputs[0].state.activeProduct === null && chatInputs[0].state.orderStage === 'CONVERSATION');
    const saved = JSON.parse(await persisted())[0];
    check(`${key}: persistence retains paragraphs and full title`, saved.messages.find(m => m.id === 'long').text === longText && saved.title === title);
    check(`${key}: completed server turn is not labelled partial`, saved.messages.find(m => m.text === 'LIVE_REPLY_1').incomplete === false);
    check(`${key}: persistence retains all tool-only IDs`, ['price','lens','support','order','attachment','selected-only','candidates'].every(id => saved.messages.some(m => m.id === id)));
    check(`${key}: selected-product metadata round-trips`, saved.selectedProduct.product.priceToken === 'OLD_TEST_QUOTE' && saved.selectedProduct.product.rating === 4.8);
    await page.reload(); await open();
    check(`${key}: actual browser reload preserves the full response`, await prose.textContent() === longText);
    check(`${key}: actual browser reload preserves Lens warnings and actions`, await page.getByText('WARNING_LAST', { exact: true }).count() === 1 && await page.getByRole('button', { name: 'ACTION_LAST', exact: true }).count() === 1);
    const refresh = page.getByRole('button', { name: ar ? 'تحديث المنتج وفتحه' : 'Actualiser et ouvrir le produit', exact: true });
    resolutionMode = 'error'; await refresh.click();
    await page.getByRole('status').filter({ hasText: ar ? 'تعذّر التحديث' : 'Actualisation impossible' }).waitFor();
    check(`${key}: failed refresh preserves full stored product and allows retry`, await refresh.isEnabled() && JSON.parse(await persisted())[0].selectedProduct.product.priceToken === 'OLD_TEST_QUOTE');
    resolutionMode = 'success'; await refresh.click(); await page.locator('.flow-product').waitFor();
    check(`${key}: refresh adopts authoritative current title and price together`, (await page.locator('.flow-product').innerText()).includes(freshProduct.title) && (await page.locator('.flow-product').innerText()).includes('140.00'));
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key))[0].selectedProduct.product.priceToken === 'FRESH_TEST_QUOTE', storageKey);
    await page.reload(); await open();
    check(`${key}: reload with a product navigation layer still requires fresh verification`, await page.locator('.flow-product').count() === 0 && await refresh.isVisible());
    await refresh.click(); await page.locator('.flow-product').waitFor();
    check(`${key}: refreshing restored product layer opens without duplicating navigation`, await page.locator('.flow-product').count() === 1);
    const quote = JSON.parse(await persisted())[0].selectedProduct.product;
    check(`${key}: quote-bound fields are never overwritten by stale candidate data`, quote.price === 40 && quote.currency === 'EUR' && quote.priceToken === 'FRESH_TEST_QUOTE' && quote.title === freshProduct.title && quote.sourceUrl === freshProduct.sourceUrl);
    await page.keyboard.press('Escape'); await page.locator('.flow-product').waitFor({ state: 'hidden' });
    // Normal candidate selection must obey the same fresh-quote contract.
    await page.getByRole('button', { name: ar ? 'اختيار' : 'Choisir', exact: true }).click(); await page.locator('.flow-product').waitFor();
    check(`${key}: candidate resolution does not restore its stale price/title`, (await page.locator('.flow-product').innerText()).includes(freshProduct.title) && (await page.locator('.flow-product').innerText()).includes('140.00'));
    await page.keyboard.press('Escape'); await page.locator('.flow-product').waitFor({ state: 'hidden' });

    await page.evaluate(() => window.historyWriteFailure = true);
    const beforeFailure = await persisted(); await send('UNSAVED_REQUEST');
    await page.locator('[data-history-notice] [role=status]').filter({ hasText: ar ? 'مساحة التخزين' : 'espace de stockage' }).waitFor();
    check(`${key}: failed save is visible while current content remains`, await page.getByText('LIVE_REPLY_2', { exact: true }).count() === 1 && await persisted() === beforeFailure);
    await menuButton().click(); const deletion = menu().getByRole('button', { name: (ar ? 'حذف ' : 'Supprimer ') + title, exact: true });
    await deletion.click();
    check(`${key}: failed deletion retains the item and active conversation`, await deletion.count() === 1 && await persisted() === beforeFailure);
    await closeMenu();
    await page.evaluate(() => window.historyWriteFailure = false);
    await page.getByRole('button', { name: ar ? 'إعادة محاولة الحفظ' : 'Réessayer l’enregistrement', exact: true }).click();
    await page.waitForFunction(key => localStorage.getItem(key).includes('LIVE_REPLY_2'), storageKey);
    check(`${key}: retry stores the untruncated active conversation`, JSON.parse(await persisted())[0].messages.find(m => m.id === 'long').text === longText);

    // A response arriving after navigation is ignored, not applied to a new conversation.
    resolutionMode = 'pending'; await page.getByRole('button', { name: ar ? 'اختيار' : 'Choisir', exact: true }).click();
    await menuButton().click(); await menu().getByRole('button', { name: ar ? 'محادثة جديدة' : 'Nouvelle conversation', exact: true }).click();
    await page.locator('[data-restored-product]').waitFor({ state: 'hidden' });
    if (!heldRoute) throw new Error('Expected held product request');
    await heldRoute.fulfill({ json: { success: true, data: { product: freshProduct, eventId: '', alternates: [] } } }).catch(() => {});
    check(`${key}: old product result cannot reopen in new conversation`, await page.locator('.flow-product').count() === 0 && await page.locator('[data-restored-product]').count() === 0);
    await menuButton().click(); await menu().getByText(title, { exact: true }).click(); await menu().waitFor({ state: 'hidden' });
    check(`${key}: selecting saved conversation restores full text`, await prose.textContent() === longText);
    const snapshotBeforeSelect = JSON.parse(await persisted())[0].updatedAt;
    await menuButton().click(); await menu().getByText(title, { exact: true }).click(); await menu().waitFor({ state: 'hidden' });
    check(`${key}: selecting active history neither rolls back nor retimestamps`, JSON.parse(await persisted())[0].updatedAt === snapshotBeforeSelect && await page.getByText('LIVE_REPLY_2', { exact: true }).count() === 1);
    await page.evaluate(() => window.holdHistoryStream = true);
    await page.getByRole('textbox', { name: ar ? 'رسالتك' : 'Votre message', exact: true }).fill('PARTIAL_QUESTION');
    await page.getByRole('button', { name: ar ? 'إرسال' : 'Envoyer', exact: true }).click();
    await page.getByText('PARTIAL_REPLY_PRESERVED', { exact: true }).waitFor();
    // Browser Back unmounts the production drawer, not just its close button.
    await page.goBack(); await page.getByRole('dialog', { name: 'SONIM', exact: true }).waitFor({ state: 'hidden' });
    check(`${key}: browser-back unmount persists the partial response and its question`, (await persisted()).includes('PARTIAL_REPLY_PRESERVED') && (await persisted()).includes('PARTIAL_QUESTION'));
    await page.evaluate(() => window.holdHistoryStream = false); await open();
    check(`${key}: partial response is identified, not presented as a completed answer`, await page.locator('[data-incomplete-response]').count() === 1 && JSON.parse(await persisted())[0].messages.find(m => m.text === 'PARTIAL_REPLY_PRESERVED').incomplete === true);
    check(`${key}: partial turn can actually be reopened`, await page.getByText('PARTIAL_REPLY_PRESERVED', { exact: true }).count() === 1);
    await page.evaluate(key => localStorage.setItem(key, '{damaged-history'), storageKey);
    await send('DO_NOT_OVERWRITE_DAMAGED_STORAGE');
    await page.locator('[data-history-notice] [role=status]').filter({ hasText: ar ? 'تعذّرت قراءة' : 'illisible' }).waitFor();
    check(`${key}: damaged raw data is protected from autosave`, await persisted() === '{damaged-history');
    await page.locator('[data-assistant-messages]').evaluate(el => el.scrollTop = 0);
    const geometry = await page.locator('[data-assistant-messages]').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
    check(`${key}: history notices and content do not overflow phone`, geometry.scroll <= geometry.width+1, geometry);
    await page.screenshot({ path: `${output}/history-${locale}-${width}.png` });
    await page.reload(); await open();
    check(`${key}: malformed JSON cannot crash reopening`, await page.locator('[data-history-notice] [role=status]').count() === 1 && await page.getByRole('textbox', { name: ar ? 'رسالتك' : 'Votre message', exact: true }).isVisible());
    await menuButton().click();
    check(`${key}: unreadable history is not presented as an empty successful history`, !(await menu().innerText()).includes(ar ? 'ستظهر محادثتك الأولى' : 'Votre première conversation'));
    await ctx.close();
  }
  check('No uncaught browser errors', errors.length === 0, errors);
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  throw error;
} finally {
  fs.writeFileSync(`${output}/checks.json`, JSON.stringify({ checks, errors }, null, 2));
  await browser.close(); console.log(`${checks.filter(c => c.pass).length}/${checks.length} SONIM history assertions passed`);
}
