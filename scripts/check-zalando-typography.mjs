#!/usr/bin/env node
/**
 * Browser audit for the app's Zalando typography profile.
 * Usage: node scripts/check-zalando-typography.mjs [base-url]
 * Optional: AYROVI_ADMIN_EMAIL, AYROVI_ADMIN_PASSWORD, TYPOGRAPHY_ROUTES, TYPOGRAPHY_MAX_PAGES.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.argv[2] || process.env.AYROVI_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const MAX_PAGES = Math.max(1, Number(process.env.TYPOGRAPHY_MAX_PAGES || 120));
const allowedWeights = new Set([400, 520, 650, 700]);
const failures = [];
const visited = new Set();
const queued = new Set();
const routes = [];
const stats = { pages: 0, desktop: 0, mobile: 0, textNodes: 0, fontLoads: 0 };

function fail(route, viewport, message, detail = '') {
  failures.push({ route, viewport, message, detail });
}

function seedRoutes() {
  const source = fs.readFileSync(path.join(ROOT, 'shared/publicSeo.ts'), 'utf8');
  const listed = [...source.matchAll(/^\s*path:\s*'([^']+)'/gm)].map((match) => match[1]);
  const extra = (process.env.TYPOGRAPHY_ROUTES || '').split(',').map((value) => value.trim()).filter(Boolean);
  return [...new Set(['/', ...listed, '/?customerAuth=login', '/?customerAuth=password_reset', ...extra])];
}

function normalizeRoute(href, origin) {
  try {
    const url = new URL(href, origin);
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) return null;
    if (/^\/(api|assets|media|fonts)\//i.test(url.pathname)) return null;
    if (/\.(?:png|jpe?g|webp|gif|svg|pdf|zip|woff2?|ttf|otf|mp4|webm)$/i.test(url.pathname)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function metricClose(actual, expected, tolerance = 0.15) {
  const value = Number.parseFloat(actual);
  return Number.isFinite(value) && Math.abs(value - expected) <= tolerance;
}

async function inspectPage(page, route, viewportName, expectedTitleSize) {
  const errors = [];
  let response;
  try {
    response = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => {
      const root = document.querySelector('#root');
      return !root || Boolean(root.innerText?.trim());
    }, undefined, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(200);
    await page.evaluate(async () => {
      await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 4000))]);
      await document.fonts.load('400 16px "Zalando Sans"', 'Zalando 0123456789');
    });
  } catch (error) {
    fail(route, viewportName, 'navigation/settling failed', String(error?.message || error));
    return [];
  }

  if (!response || response.status() >= 400) {
    fail(route, viewportName, 'HTTP status is not successful', String(response?.status() ?? 'no response'));
  }

  const result = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rects = element.getClientRects();
      return rects.length > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0;
    };
    const describe = (element) => {
      const style = getComputedStyle(element);
      return {
        tag: element.tagName.toLowerCase(),
        id: element.id || '',
        className: typeof element.className === 'string' ? element.className.trim().split(/\s+/).slice(0, 3).join('.') : '',
        text: (element.innerText || element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.value || '').trim().slice(0, 72),
        family: style.fontFamily,
        weight: Number.parseInt(style.fontWeight, 10),
        size: style.fontSize,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
      };
    };
    const textSelector = 'h1,h2,h3,h4,p,a,button,label,input,textarea,select,li,td,th,strong,b,small,span,summary,dt,dd';
    const text = [...document.querySelectorAll(textSelector)].filter((element) => {
      const content = (element.innerText || element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.value || '').trim();
      return content && visible(element) && !element.closest('svg,[aria-hidden="true"]');
    }).map(describe);
    const roles = (selector) => [...document.querySelectorAll(selector)].filter(visible).map(describe);
    return {
      title: document.title,
      appRoot: Boolean(document.querySelector('#root')),
      rootHasText: Boolean(document.querySelector('#root')?.innerText?.trim()),
      body: describe(document.body),
      fontLoaded: document.fonts.check('400 16px "Zalando Sans"'),
      text,
      h1: roles('h1,.ay-text-h1'),
      h2: roles('h2,.ay-text-h2'),
      navLinks: roles('nav a,.ay-text-nav'),
      labels: roles('.ay-e-label'),
      buttons: roles('.ay-e-button,.ay-text-button,.ay-btn-primary,.ay-btn-secondary,.ay-btn-cta'),
    };
  });

  if (!result.body.family.includes('Zalando Sans')) {
    fail(route, viewportName, 'body font stack does not include Zalando Sans', result.body.family);
  }
  if (result.appRoot && !result.rootHasText) fail(route, viewportName, 'React root rendered no visible content');
  if (!result.fontLoaded) fail(route, viewportName, 'local Zalando Sans face did not load');
  else stats.fontLoads += 1;

  const badFontNodes = result.text.filter((item) => !item.family.includes('Zalando Sans'));
  if (badFontNodes.length) fail(route, viewportName, 'visible text falls outside the Zalando font stack', JSON.stringify(badFontNodes.slice(0, 8)));
  const badWeightNodes = result.text.filter((item) => !allowedWeights.has(item.weight));
  if (badWeightNodes.length) fail(route, viewportName, 'visible text uses a non-standard weight (allowed: 400, 520, 650, 700)', JSON.stringify(badWeightNodes.slice(0, 10)));
  stats.textNodes += result.text.length;

  const checkRole = (items, role, expected) => {
    for (const item of items) {
      const checks = [
        ['font-family', item.family.includes('Zalando Sans')],
        ['font-weight', item.weight === expected.weight],
        ['font-size', metricClose(item.size, expected.size)],
      ];
      if (expected.lineHeight !== undefined) checks.push(['line-height', metricClose(item.lineHeight, expected.lineHeight, 0.2)]);
      if (expected.letterSpacing !== undefined) checks.push(['letter-spacing', (expected.letterSpacing === 0 && item.letterSpacing === 'normal') || metricClose(item.letterSpacing, expected.letterSpacing, 0.03)]);
      for (const [name, pass] of checks) if (!pass) fail(route, viewportName, `${role} ${name} differs from reference`, `${item.tag}${item.className ? `.${item.className}` : ''} «${item.text}»: ${name}=${name === 'font-family' ? item.family : item[name === 'font-weight' ? 'weight' : name === 'font-size' ? 'size' : name === 'line-height' ? 'lineHeight' : 'letterSpacing']}`);
    }
  };

  if (result.appRoot) {
    checkRole([result.body], 'body', { size: 16, weight: 400, lineHeight: 24, letterSpacing: 0 });
    checkRole(result.h1, 'h1', { size: expectedTitleSize, weight: 520, lineHeight: expectedTitleSize * (viewportName === 'mobile' ? 1.16 : 1.158), letterSpacing: -0.2 });
    checkRole(result.h2, 'h2', { size: 24, weight: 520, lineHeight: 30, letterSpacing: -0.08 });
    checkRole(result.navLinks, 'navigation link', { size: 16, weight: 400 });
    checkRole(result.labels, 'editorial label', { size: 14, weight: 650, lineHeight: 20 });
    checkRole(result.buttons, 'editorial button', { size: 14, weight: 650, lineHeight: 20 });
  }

  return await page.evaluate((origin) => [...document.querySelectorAll('a[href]')]
    .map((anchor) => anchor.href)
    .filter((href) => href && new URL(href).origin === origin), new URL(BASE).origin);
}

const baseUrl = new URL(BASE);
const seeds = seedRoutes();
for (const href of seeds) {
  const route = normalizeRoute(href, baseUrl.origin);
  if (route && !queued.has(route)) { queued.add(route); routes.push(route); }
}

const executablePath = process.env.CHROMIUM_PATH || process.env.CHROME_BIN || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const adminEmail = process.env.AYROVI_ADMIN_EMAIL;
  const adminPassword = process.env.AYROVI_ADMIN_PASSWORD;

  for (let cursor = 0; cursor < routes.length && visited.size < MAX_PAGES; cursor += 1) {
    const route = routes[cursor];
    if (visited.has(route)) continue;
    visited.add(route);
    const desktopLinks = await inspectPage(page, route, 'desktop', 38);

    if (route.startsWith('/admin') && adminEmail && adminPassword) {
      try {
        const emailInput = page.locator('input[type="email"]').first();
        if (await emailInput.count()) {
          await emailInput.fill(adminEmail);
          await page.locator('input[type="password"]').first().fill(adminPassword);
          await page.getByRole('button', { name: /se connecter|log in/i }).first().click();
          await page.waitForTimeout(800);
          desktopLinks.push(...await page.locator('a[href]').evaluateAll((anchors) => anchors.map((anchor) => anchor.href)));
        }
      } catch (error) {
        fail(route, 'desktop', 'admin route discovery failed after optional login', String(error?.message || error));
      }
    }

    for (const href of desktopLinks) {
      const next = normalizeRoute(href, baseUrl.origin);
      if (next && !queued.has(next) && routes.length < MAX_PAGES) { queued.add(next); routes.push(next); }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await inspectPage(page, route, 'mobile', 32);
    await page.setViewportSize({ width: 1440, height: 900 });
    stats.pages += 1;
    stats.desktop += 1;
    stats.mobile += 1;
  }
} finally {
  await browser.close();
}

console.log(`Zalando typography audit: ${stats.pages} routes; ${stats.desktop} desktop + ${stats.mobile} mobile views; ${stats.textNodes} visible text elements; ${stats.fontLoads} font loads.`);
console.log(`Discovered ${routes.length} same-origin route(s); visited ${visited.size} (limit ${MAX_PAGES}).`);
console.log(`Visited routes: ${[...visited].join(', ')}`);
if (failures.length) {
  console.error(`FAILED: ${failures.length} typography issue(s).`);
  for (const issue of failures.slice(0, 100)) console.error(`- ${issue.route} [${issue.viewport}] ${issue.message}${issue.detail ? ` — ${issue.detail}` : ''}`);
  if (failures.length > 100) console.error(`... ${failures.length - 100} additional issue(s) omitted.`);
  process.exitCode = 1;
} else {
  console.log('PASS: all discovered routes use the local Zalando Sans stack, approved weights and matching role metrics.');
}
