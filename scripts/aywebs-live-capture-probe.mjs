#!/usr/bin/env node
/**
 * Live AYWEBs capture probe for the Amazon product the customer reported.
 *
 * This runs the exact public capture script served to the mobile WebView against
 * a live mobile-layout Amazon page, then submits only the bounded text capture
 * to the Beta resolver. It never uploads HTML, cookies, screenshots, or a cart
 * mutation. A green result requires a server-verified price, currency, and a
 * signed quote; merely finding a number in the page is not enough.
 *
 * This is a Chromium mobile-DOM integration check, not a substitute for testing
 * on a physical Android WebView.
 */
import { randomUUID } from 'node:crypto';
import { appendFileSync, writeFileSync } from 'node:fs';
import { chromium, devices } from 'playwright';

const BASE = 'https://ayrovi-beta1-moo8.onrender.com';
const PRODUCT_URL = 'https://www.amazon.com/dp/B0H4KP6ZZT';
const EXPECTED_ASIN = 'B0H4KP6ZZT';
const CAPTURE_SCRIPT_PATH = '/api/v1/aywebs/capture/script.js';
const RESOLVE_PATH = '/api/v1/aywebs/product/resolve';
const RETRIES = 2;
const RETRY_DELAY_MS = 450;

function writeSummary(markdown) {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (path) appendFileSync(path, `${markdown.trim()}\n`, 'utf8');
}

function writeReport(report) {
  writeFileSync('aywebs-live-capture-report.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function fail(message, diagnostic = {}) {
  const detail = Object.entries(diagnostic)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(' ');
  const line = `❌ ${message}${detail ? ` (${detail})` : ''}`;
  console.error(line);
  // Surface the actual reason as a GitHub check annotation (the Actions log
  // download host is not always reachable from the local agent environment).
  const annotation = line.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  console.log(`::error title=AYWEBs live capture::${annotation}`);
  writeReport({ status: 'failed', asin: EXPECTED_ASIN, message, diagnostic });
  writeSummary(`### AYWEBs live capture — ${EXPECTED_ASIN}\n\n${line}`);
  process.exitCode = 1;
}

function extractAsin(value) {
  try {
    const path = new URL(value).pathname;
    return path.match(/\/(?:dp|gp\/(?:product|aw\/d)|product)\/([A-Z0-9]{10})(?:[/?]|$)/i)?.[1]?.toUpperCase() || '';
  } catch {
    return '';
  }
}

function blockedPage(title, body) {
  return /robot\s*check|captcha|automated access|enter the characters|sorry, we just need to make sure/i
    .test(`${title}\n${body}`);
}

async function readCapture(page, script) {
  const serialized = await page.evaluate((source) => (0, eval)(source), script);
  if (typeof serialized !== 'string') throw new Error('Capture script returned a non-string result.');
  const payload = JSON.parse(serialized);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Capture script returned an invalid payload.');
  }
  return payload;
}

/** Small DOM facts only: no page HTML, cookies, screenshots, or form values. */
async function inspectAmazonPage(page) {
  return page.evaluate(() => {
    const productSelectors = [
      '#dp-container', '#dp', '#ppd', '#centerCol', '#buybox', '#desktop_buybox',
      '#apex_desktop', '#corePriceDisplay_desktop_feature_div', '#corePrice_desktop',
      '#corePrice_feature_div', '#corePrice_mobile_feature_div', '#corePriceDisplay_mobile_feature_div',
    ];
    const priceSelectors = [
      '#apex-pricetopay-accessibility-label',
      '#corePriceDisplay_desktop_feature_div .priceToPay',
      '#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price)',
      '#corePrice_feature_div .a-price:not(.a-text-price)',
      '#corePrice_desktop .a-price:not(.a-text-price)',
      '#corePrice_mobile_feature_div .a-price:not(.a-text-price)',
      '#corePriceDisplay_mobile_feature_div .a-price:not(.a-text-price)',
      '.priceToPay', '#price_inside_buybox', '#priceblock_ourprice', '#priceblock_dealprice',
      '#newBuyBoxPrice', '.a-price .a-offscreen',
    ];
    const displayed = (element) => {
      for (let node = element, hops = 0; node && hops < 10; node = node.parentElement, hops += 1) {
        const style = getComputedStyle(node);
        if (node.hidden || node.getAttribute('aria-hidden') === 'true'
          || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      }
      return true;
    };
    const sample = (element) => ({
      tag: element.tagName.toLowerCase(),
      id: String(element.id || '').slice(0, 80),
      className: String(typeof element.className === 'string' ? element.className : '').slice(0, 120),
      visibleByStyle: displayed(element),
      text: String(element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    });
    const rootSelector = productSelectors.find((selector) => document.querySelector(selector)) || 'body';
    const root = document.querySelector(rootSelector) || document.body;
    return {
      readyState: document.readyState,
      productMarkers: Object.fromEntries(productSelectors.map((selector) => [selector, Boolean(document.querySelector(selector))])),
      priceSelectors: priceSelectors.map((selector) => {
        const elements = Array.from(document.querySelectorAll(selector)).slice(0, 3);
        return { selector, matches: document.querySelectorAll(selector).length, samples: elements.map(sample) };
      }),
      productRoot: rootSelector,
      aPriceNodesInRoot: root ? root.querySelectorAll('.a-price').length : 0,
      accessibilityPriceLabel: Boolean(document.querySelector('#apex-pricetopay-accessibility-label')),
    };
  });
}

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
    const context = await browser.newContext({
      ...devices['Pixel 7'],
      locale: 'en-US',
      timezoneId: 'America/New_York',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);

    const pageResponse = await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => undefined);

    const title = (await page.title().catch(() => '')).slice(0, 180);
    const body = (await page.locator('body').innerText({ timeout: 10_000 }).catch(() => '')).slice(0, 2_000);
    if (blockedPage(title, body)) {
      fail('Amazon returned a bot-check page; the product capture was not tested.', {
        http: pageResponse?.status() ?? null,
        title,
        url: page.url().split('?')[0],
      });
      return;
    }

    const pageAsin = extractAsin(page.url());
    if (pageAsin !== EXPECTED_ASIN) {
      fail('Amazon did not leave the browser on the requested ASIN.', {
        expectedAsin: EXPECTED_ASIN,
        observedAsin: pageAsin || null,
        http: pageResponse?.status() ?? null,
        title,
        url: page.url().split('?')[0],
      });
      return;
    }

    const scriptResponse = await fetch(`${BASE}${CAPTURE_SCRIPT_PATH}`, {
      headers: { accept: 'application/javascript' },
      signal: AbortSignal.timeout(30_000),
    });
    const script = await scriptResponse.text();
    if (!scriptResponse.ok || !script.includes('getComputedStyle')) {
      fail('Beta did not serve the expected hidden-element-aware capture script.', {
        http: scriptResponse.status,
        length: script.length,
      });
      return;
    }

    // Match the mobile app's bounded empty-price retry budget (initial capture
    // plus two retries), rather than waiting indefinitely for a later DOM state.
    let capture = await readCapture(page, script);
    for (let retry = 0; retry < RETRIES && !capture.priceCandidates?.length; retry += 1) {
      await page.waitForTimeout(RETRY_DELAY_MS);
      capture = await readCapture(page, script);
    }

    if (capture.priceCandidates?.length) {
      const requestedUrl = typeof capture.url === 'string' ? capture.url : '';
      if (extractAsin(requestedUrl) !== EXPECTED_ASIN) {
        fail('The capture payload URL does not identify the requested ASIN.', {
          expectedAsin: EXPECTED_ASIN,
          observedAsin: extractAsin(requestedUrl) || null,
        });
        return;
      }

      const sessionId = `ci-webview-${randomUUID()}`;
      const resolveResponse = await fetch(`${BASE}${RESOLVE_PATH}`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-session-id': sessionId,
        },
        body: JSON.stringify({ url: requestedUrl, store_id: 'amazon', capture, refresh: true }),
        signal: AbortSignal.timeout(45_000),
      });
      let result = null;
      try { result = await resolveResponse.json(); } catch { result = null; }
      const data = result?.data && typeof result.data === 'object' ? result.data : {};
      const captureResult = result?.capture && typeof result.capture === 'object' ? result.capture : {};
      const price = Number(data.price || 0);
      const currency = String(data.currency || '');
      const verified = data.price_verified === true && data.currency_verified === true;
      const quoteIssued = typeof result?.quote_token === 'string' && result.quote_token.length > 0;

      if (resolveResponse.ok && result?.success === true && captureResult.used === true
        && price > 0 && /^[A-Z]{3}$/.test(currency) && verified && quoteIssued) {
        const line = `✅ Capture and server verification passed: ${price} ${currency}; source=${captureResult.price_source || '—'}; quote issued.`;
        console.log(line);
        console.log(`DOM candidates: ${JSON.stringify(capture.priceCandidates)}`);
        console.log(`Page: ${title}`);
        writeReport({
          status: 'verified',
          asin: EXPECTED_ASIN,
          productUrl: PRODUCT_URL,
          resolvedUrl: requestedUrl.split('?')[0],
          pageStatus: pageResponse?.status() ?? null,
          title,
          candidates: capture.priceCandidates,
          server: {
            status: resolveResponse.status,
            price,
            currency,
            priceVerified: data.price_verified === true,
            currencyVerified: data.currency_verified === true,
            captureUsed: captureResult.used === true,
            priceSource: captureResult.price_source || null,
            corroborated: captureResult.corroborated === true,
            quoteIssued,
          },
        });
        writeSummary([
          `### AYWEBs live capture — ${EXPECTED_ASIN}`,
          '',
          line,
          '',
          `- Mobile-layout page HTTP: ${pageResponse?.status() ?? '—'}`,
          `- Capture sources: ${JSON.stringify(capture.priceCandidates.map((candidate) => candidate.source))}`,
          '- Quote: signed by Beta after price and currency verification',
          '- Scope: Chromium mobile-DOM integration; physical Android WebView remains a separate check.',
        ].join('\n'));
        return;
      }

      fail('The live DOM produced a capture, but Beta did not issue a fully verified quote.', {
        resolveHttp: resolveResponse.status,
        serverSuccess: result?.success === true,
        captureUsed: captureResult.used === true,
        price: price || null,
        currency: currency || null,
        priceVerified: data.price_verified === true,
        currencyVerified: data.currency_verified === true,
        quoteIssued,
        captureRejection: captureResult.rejection || null,
        priceSource: captureResult.price_source || null,
        corroborated: captureResult.corroborated === true,
        candidates: capture.priceCandidates,
      });
      return;
    }

    // Distinguish a late merchant render from a page that never exposed a price;
    // this late read is diagnostic only and is not submitted as an app capture.
    await page.waitForTimeout(4_000);
    const settledCapture = await readCapture(page, script);
    const amazonDom = await inspectAmazonPage(page);
    fail('No price candidate appeared within the mobile retry budget.', {
      http: pageResponse?.status() ?? null,
      title,
      candidateCountAfterRetryBudget: capture.priceCandidates?.length ?? 0,
      candidateCountAfterExtraWait: settledCapture.priceCandidates?.length ?? 0,
      lateCandidates: settledCapture.priceCandidates || [],
      pageUrl: page.url().split('?')[0],
      amazonDom,
    });
  } catch (error) {
    fail('Live capture probe could not complete.', {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

void main();
