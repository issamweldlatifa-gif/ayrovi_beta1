import { chromium } from 'playwright';
import fs from 'node:fs';
const output = 'screenshots/editorial/sonim-actions'; fs.mkdirSync(output, { recursive: true });
const checks = [], errors = [];
function check(label, pass, details) { checks.push({ label, pass: Boolean(pass), details }); if (!pass) throw new Error(label + ': ' + JSON.stringify(details)); }
const browser = await chromium.launch({ headless: true });
let page;
try {
  for (const locale of ['fr', 'ar']) for (const width of [320, 390]) {
    const key = `${locale}/${width}`, ar = locale === 'ar';
    const text = ar ? 'فقرة كاملة {30 TND}\n\nhttps://example.test/item#size' : 'Paragraphe complet {30 TND}\n\nhttps://example.test/item#size';
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    await ctx.addInitScript(({ locale, text }) => {
      localStorage.setItem('ayrovi.locale.v1', locale);
      localStorage.setItem('ayrovi_assistant_conversations_v1_guest', JSON.stringify([{ id: 'conversation-fixture', title: 'Titre complet / عنوان كامل pour vérifier le retour au menu et la lisibilité de toutes les conversations', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [
        { id: 'first', role: 'assistant', text: text + ' [[OPEN_LENS]]' },
        { id: 'second', role: 'assistant', text: locale === 'ar' ? 'رد ثان كامل' : 'Deuxième réponse complète' },
        { id: 'tool', role: 'assistant', text: '[[OPEN_LENS]]', priceBreakdown: { originalPrice: 20, currency: 'TND', exchangeRate: 1, pricingVersion: 1, totalTND: 30, convertedPriceTND: 20, customsFeeTND: 2, shippingFeeTND: 4, serviceFeeTND: 4, expressFeeTND: 0 } },
      ] }]));
      window.actionTest = { copied: [], shares: [], mode: 'native', clipboardError: false, resolveShare: null };
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { if (window.actionTest.clipboardError) throw new Error('denied'); window.actionTest.copied.push(text); } } });
      Object.defineProperty(navigator, 'share', { configurable: true, writable: true, value: async data => {
        window.actionTest.shares.push(data);
        if (window.actionTest.mode === 'cancel') throw new DOMException('cancelled', 'AbortError');
        if (window.actionTest.mode === 'error') throw new DOMException('denied', 'NotAllowedError');
        if (window.actionTest.mode === 'pending') await new Promise(resolve => window.actionTest.resolveShare = resolve);
      } });
      window.speechTest = { items: [], cancelled: 0 };
      window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, writable: true, value: { paused: false, getVoices: () => [], resume: () => {}, cancel: () => { window.speechTest.cancelled++; }, speak: utterance => window.speechTest.items.push(utterance) } });
    }, { locale, text });
    page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/assistant/status', r => r.fulfill({ json: { success: true, data: { voiceReady: false } } }));
    const pending = [], writes = [], waiting = [];
    const takeRequest = () => pending.length ? Promise.resolve(pending.shift()) : new Promise(resolve => waiting.push(resolve));
    await page.route('**/api/public/assistant-feedback', r => { writes.push(r.request().postDataJSON()); if (waiting.length) waiting.shift()(r); else pending.push(r); });
    await page.goto(process.env.AYROVI_BASE_URL + '/__verify/sonim');
    await page.locator('[data-open]').click();
    const rows = page.locator('.assistant-message-actions'); await rows.nth(2).waitFor();
    const first = rows.nth(0), second = rows.nth(1), tool = rows.nth(2);
    const button = (row, fr, arabic) => row.getByRole('button', { name: ar ? arabic : fr, exact: true });
    const copy = button(first, 'Copier', 'نسخ'), share = button(first, 'Partager', 'مشاركة');
    await copy.evaluate(el => { el.click(); el.click(); });
    await page.waitForFunction(() => window.actionTest.copied.length === 1);
    check(`${key}: duplicate copy is admitted once`, await page.evaluate(() => window.actionTest.copied.length === 1));
    check(`${key}: copy uses complete displayed prose`, await page.evaluate(text => window.actionTest.copied.at(-1) === text, text));
    check(`${key}: textless tool actions disabled`, await button(tool, 'Copier', 'نسخ').isDisabled() && await button(tool, 'Partager', 'مشاركة').isDisabled() && await button(tool, 'Lire', 'استماع').isDisabled());
    await page.evaluate(() => { window.actionTest.clipboardError = true; }); await copy.click();
    await page.getByRole('status').filter({ hasText: ar ? 'تعذّر تنفيذ' : 'Action impossible' }).waitFor();
    check(`${key}: failed copy is reported in the selected locale`, await page.evaluate(() => window.actionTest.copied.length === 1));
    await page.evaluate(() => { window.actionTest.clipboardError = false; window.actionTest.mode = 'pending'; });
    await share.evaluate(el => { el.click(); el.click(); });
    await page.waitForFunction(() => window.actionTest.resolveShare);
    check(`${key}: double share is admitted once and is visibly busy`, await page.evaluate(() => window.actionTest.shares.length === 1) && await share.isDisabled() && await share.getAttribute('aria-busy') === 'true');
    await page.evaluate(() => window.actionTest.resolveShare());
    await first.getByRole('status').filter({ hasText: ar ? 'تمت مشاركة' : 'Texte partagé' }).waitFor();
    check(`${key}: native share payload matches display`, await page.evaluate(text => window.actionTest.shares[0].text === text, text));
    for (const mode of ['cancel', 'error']) {
      await page.evaluate(mode => window.actionTest.mode = mode, mode); await share.click();
      await first.getByRole('status').filter({ hasText: mode === 'cancel' ? (ar ? 'أُلغيت' : 'annulé') : (ar ? 'تعذّر تنفيذ' : 'impossible') }).waitFor();
      check(`${key}: ${mode} is distinct and never writes clipboard`, await page.evaluate(() => window.actionTest.copied.length === 1));
    }
    await page.evaluate(() => navigator.share = undefined); await share.click();
    await first.getByRole('status').filter({ hasText: ar ? 'تم نسخ' : 'Texte copié' }).waitFor();
    check(`${key}: unsupported native share explicitly reports clipboard fallback`, await page.evaluate(() => window.actionTest.copied.length === 2));

    await button(first, 'Lire', 'استماع').click();
    check(`${key}: speech stays pending until actual engine start`, (await first.innerText()).includes(ar ? 'تجهيز' : 'Préparation'));
    check(`${key}: speech preserves exact text and correct language`, await page.evaluate(({ text, ar }) => { const u = window.speechTest.items.at(-1); return u.text === text && u.lang === (ar ? 'ar-SA' : 'fr-FR'); }, { text, ar }));
    await page.evaluate(() => window.speechTest.items.at(-1).onstart());
    await first.getByRole('status').filter({ hasText: ar ? 'القراءة جارية' : 'Lecture en cours' }).waitFor();
    await button(second, 'Lire', 'استماع').click();
    check(`${key}: switching cancels old read rather than queuing`, await page.evaluate(() => window.speechTest.cancelled === 1 && window.speechTest.items.length === 2));
    await page.evaluate(() => { window.speechTest.items[0].onstart(); window.speechTest.items[0].onend(); });
    check(`${key}: stale engine callbacks do not stop new read`, await button(second, 'Arrêter la lecture', 'إيقاف القراءة').count() === 1);
    await button(second, 'Arrêter la lecture', 'إيقاف القراءة').click();
    check(`${key}: explicit stop releases owned playback`, await page.evaluate(() => window.speechTest.cancelled === 2));
    await button(first, 'Lire', 'استماع').click();
    await page.evaluate(() => window.speechTest.items.at(-1).onerror({ error: 'not-allowed' }));
    await first.getByRole('status').filter({ hasText: ar ? 'تعذّرت القراءة' : 'Lecture indisponible' }).waitFor();
    check(`${key}: device errors are visible`, true);
    await page.evaluate(() => { window.savedSpeech = window.speechSynthesis; window.speechSynthesis = undefined; });
    await button(first, 'Lire', 'استماع').click();
    await first.getByRole('status').filter({ hasText: ar ? 'تعذّرت القراءة' : 'Lecture indisponible' }).waitFor();
    check(`${key}: missing speech API is visible`, true);
    await page.evaluate(() => window.speechSynthesis = window.savedSpeech);

    const attach = page.getByRole('button', { name: ar ? 'إضافة إلى المحادثة' : 'Ajouter au chat', exact: true });
    const menuButton = page.getByRole('button', { name: ar ? 'القائمة' : 'Menu', exact: true });
    const comment = button(first, 'Commenter', 'تعليق');
    for (const [trigger, label] of [[attach, ar ? 'إضافة إلى المحادثة' : 'Ajouter au chat'], [menuButton, ar ? 'قائمة SONIM' : 'Menu SONIM'], [comment, ar ? 'التعليق على الرد' : 'Commenter la réponse']]) {
      await trigger.click(); const dialog = page.getByRole('dialog', { name: label, exact: true }); await dialog.waitFor();
      check(`${key}/${label}: focus enters only the top layer`, await dialog.evaluate(el => el.contains(document.activeElement)));
      const targets = dialog.locator('button:not(:disabled),textarea:not(:disabled),[role="switch"]');
      // Feedback backdrop belongs to the dialog wrapper, not its focus-owning panel.
      const panel = dialog.locator('section').first();
      const boundary = await panel.count() ? panel : dialog;
      const focusable = boundary.locator('button:not(:disabled),textarea:not(:disabled)');
      await focusable.last().focus(); await page.keyboard.press('Tab');
      check(`${key}/${label}: Tab wraps inside panel`, await focusable.first().evaluate(el => el === document.activeElement));
      await page.keyboard.press('Shift+Tab');
      check(`${key}/${label}: Shift+Tab wraps inside panel`, await focusable.last().evaluate(el => el === document.activeElement));
      check(`${key}/${label}: background controls inert`, await attach.evaluate(el => Boolean(el.closest('[inert]'))));
      if (trigger === attach) {
        const toggle = dialog.getByRole('switch'); const before = await toggle.getAttribute('aria-checked'); await toggle.click();
        check(`${key}: web search exposes changed state`, await toggle.getAttribute('aria-checked') !== before);
        const fits = await toggle.evaluate(el => { const track = el.children[1].getBoundingClientRect(), thumb = el.children[1].children[0].getBoundingClientRect(); return thumb.left >= track.left && thumb.right <= track.right && thumb.top >= track.top && thumb.bottom <= track.bottom; });
        check(`${key}: switch thumb fits track`, fits);
      }
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
      check(`${key}/${label}: Escape restores trigger without closing SONIM`, await trigger.evaluate(el => el === document.activeElement));
    }

    // Do not change optimistic feedback while its server write is unconfirmed.
    const up = button(first, 'Utile', 'مفيد'); await up.click();
    await page.waitForFunction(() => document.querySelector('.assistant-message-actions button[aria-busy="true"]'));
    check(`${key}: pending rating is disabled and not falsely confirmed`, await up.isDisabled() && await up.getAttribute('aria-pressed') === 'false' && writes.length === 1);
    await (await takeRequest()).fulfill({ status: 503, json: { success: false } });
    await page.waitForFunction(() => !document.querySelector('.assistant-message-actions button[aria-busy="true"]'));
    check(`${key}: failed rating remains unselected`, await up.getAttribute('aria-pressed') === 'false');

    const feedbackName = ar ? 'التعليق على الرد' : 'Commenter la réponse';
    const feedback = page.getByRole('dialog', { name: feedbackName, exact: true });
    const save = () => feedback.getByRole('button', { name: ar ? 'إرسال رأيي' : 'Envoyer mon avis', exact: true });
    await comment.click(); await feedback.getByRole('button', { name: ar ? 'مفيد' : 'Utile', exact: true }).click();
    await feedback.locator('textarea').fill('Original draft'); await save().click();
    await page.keyboard.press('Escape'); await feedback.waitFor({ state: 'hidden' });
    await menuButton.click();
    await (await takeRequest()).fulfill({ json: { success: true } });
    const menu = page.getByRole('dialog', { name: ar ? 'قائمة SONIM' : 'Menu SONIM', exact: true });
    await page.waitForFunction(() => !document.querySelector('.assistant-message-actions button[aria-busy="true"]'));
    check(`${key}: late save cannot close a different layer`, await menu.isVisible());
    await page.keyboard.press('Escape'); await menu.waitFor({ state: 'hidden' });
    await comment.click(); await feedback.getByRole('button', { name: ar ? 'مفيد' : 'Utile', exact: true }).click();
    await feedback.locator('textarea').fill('First opening'); await save().click();
    await page.keyboard.press('Escape'); await feedback.waitFor({ state: 'hidden' });
    await comment.click();
    await (await takeRequest()).fulfill({ json: { success: true } });
    await feedback.locator('textarea').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('textarea:disabled'));
    check(`${key}: late save cannot close same-message reopened layer or replace its draft`, await feedback.isVisible() && await feedback.locator('textarea').inputValue() !== 'First opening');
    await feedback.getByRole('button', { name: ar ? 'مفيد' : 'Utile', exact: true }).click();
    await feedback.locator('textarea').fill('Confirmed current draft'); await save().click();
    await (await takeRequest()).fulfill({ status: 503, json: { success: false } });
    await page.waitForFunction(() => !document.querySelector('textarea:disabled'));
    check(`${key}: failed comment preserves editable draft and open layer`, await feedback.isVisible() && await feedback.locator('textarea').inputValue() === 'Confirmed current draft');
    await save().click();
    await (await takeRequest()).fulfill({ json: { success: true } });
    await feedback.waitFor({ state: 'hidden' });
    check(`${key}: confirmed current save closes only its own sheet and restores focus`, await comment.evaluate(el => el === document.activeElement));
    check(`${key}: confirmed feedback is selected`, await up.getAttribute('aria-pressed') === 'true');

    await comment.click(); await feedback.waitFor();
    await page.locator('.pointer-events-none[role=status]').waitFor({ state: 'hidden' });
    check(`${key}: stale toast leaves no empty visible overlay on the new form`, !(await page.locator('.pointer-events-none[role=status]').isVisible()));
    await page.screenshot({ path: `${output}/feedback-normal-${locale}-${width}.png` });
    await page.keyboard.press('Escape'); await feedback.waitFor({ state: 'hidden' });
    await page.evaluate(() => document.documentElement.style.fontSize = '200%');
    await comment.click();
    const geometry = await feedback.evaluate(el => { const panel = el.querySelector('section'), r = panel.getBoundingClientRect(); return { width: innerWidth, scroll: panel.scrollWidth, client: panel.clientWidth, top: r.top, bottom: r.bottom, height: innerHeight }; });
    check(`${key}: enlarged feedback fits phone without clipped controls`, geometry.scroll <= geometry.client + 1 && geometry.top >= 0 && geometry.bottom <= geometry.height + 1, geometry);
    await save().focus();
    const lastControl = await save().boundingBox();
    check(`${key}: enlarged form last action can be scrolled into view`, lastControl && lastControl.y >= 0 && lastControl.y + lastControl.height <= 845, lastControl);
    await page.screenshot({ path: `${output}/feedback-${locale}-${width}.png` });
    await page.keyboard.press('Escape'); await feedback.waitFor({ state: 'hidden' });
    await page.evaluate(() => document.documentElement.style.fontSize = '100%');
    await button(first, 'Lire', 'استماع').click();
    const beforeClose = await page.evaluate(() => window.speechTest.cancelled);
    await page.getByRole('button', { name: ar ? 'إغلاق SONIM' : 'Fermer SONIM', exact: true }).click();
    await page.getByRole('dialog', { name: 'SONIM', exact: true }).waitFor({ state: 'hidden' });
    check(`${key}: closing view cancels its reader`, await page.evaluate(before => window.speechTest.cancelled === before + 1, beforeClose));
    await page.locator('[data-open]').click(); await rows.nth(2).waitFor();
    await button(first, 'Lire', 'استماع').click();
    const before = await page.evaluate(() => window.speechTest.cancelled);
    await menuButton.click(); await menu.getByRole('button', { name: ar ? 'محادثة جديدة' : 'Nouvelle conversation', exact: true }).click();
    await rows.first().waitFor({ state: 'hidden' });
    check(`${key}: changing conversation cancels reader`, await page.evaluate(before => window.speechTest.cancelled === before + 1, before));
    await page.getByRole('button', { name: ar ? 'إغلاق SONIM' : 'Fermer SONIM', exact: true }).click();
    await page.getByRole('dialog', { name: 'SONIM', exact: true }).waitFor({ state: 'hidden' });
    check(`${key}: closing SONIM restores its external opener`, await page.locator('[data-open]').evaluate(el => el === document.activeElement));
    await ctx.close();
  }
  check('No uncaught browser errors', errors.length === 0, errors);
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  throw error;
} finally {
  fs.writeFileSync(`${output}/checks.json`, JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
  console.log(`${checks.filter(c => c.pass).length}/${checks.length} SONIM browser assertions passed`);
}
