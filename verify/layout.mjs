import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

mkdirSync('verify', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', (response) => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.waitForSelector('.brands-heading__title', { timeout: 15000 });
await page.waitForSelector('.lens-hero', { timeout: 15000 });
await page.waitForTimeout(900);

const measure = await page.evaluate(() => {
  const rect = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return { left: +box.left.toFixed(1), right: +box.right.toFixed(1), width: +box.width.toFixed(1), top: +box.top.toFixed(1) };
  };
  const heading = document.querySelector('.brands-heading');
  const rail = document.querySelector('.brands-rail');
  const tiles = [...document.querySelectorAll('.brand-tile')];
  const marquee = document.querySelector('.brands-marquee');
  const track = document.querySelector('.brands-marquee__track');
  const phone = document.querySelector('.lens-phone');
  const lens = document.querySelector('.lens-hero');
  const style = track ? getComputedStyle(track) : null;
  const marqueeStyle = marquee ? getComputedStyle(marquee) : null;
  return {
    viewport: window.innerWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    headingOutsideRail: Boolean(heading && rail && !rail.contains(heading)),
    headingRect: rect('.brands-heading'),
    railRect: rect('.brands-rail'),
    tileCount: tiles.length,
    tileWidth: tiles[0] ? +tiles[0].getBoundingClientRect().width.toFixed(1) : null,
    gap: style?.gap,
    trackPadding: style?.paddingInlineStart,
    marqueeOverflowX: marqueeStyle?.overflowX,
    marqueeAnimation: marqueeStyle?.animationName,
    lensRect: rect('.lens-hero'),
    phoneRect: rect('.lens-phone'),
    phoneWidthPercent: phone && lens ? +(phone.getBoundingClientRect().width / window.innerWidth * 100).toFixed(1) : null,
    lensInnerPadding: getComputedStyle(document.querySelector('.lens-hero__inner')).paddingInlineStart,
  };
});

console.log(JSON.stringify(measure, null, 2));

// لقطات: قسم الماركات ثم قسم LENS
const brands = await page.$('.brands-section');
await brands.screenshot({ path: 'verify/brands-section-mobile.png' });
const lens = await page.$('.lens-hero');
await lens.screenshot({ path: 'verify/lens-section-mobile.png' });
await page.screenshot({ path: 'verify/home-top-mobile.png', clip: { x: 0, y: 0, width: 390, height: 844 } });

// Desktop — الهوية الحالية (marquee) يجب أن تبقى
const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await desktop.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await desktop.waitForSelector('.brands-rail', { timeout: 15000 });
await desktop.waitForTimeout(700);
const desktopMeasure = await desktop.evaluate(() => {
  const track = document.querySelector('.brands-marquee__track');
  const rail = document.querySelector('.brands-rail');
  return {
    viewport: window.innerWidth,
    tileCount: document.querySelectorAll('.brand-tile').length,
    animationName: track ? getComputedStyle(track).animationName : null,
    railWidth: rail ? +rail.getBoundingClientRect().width.toFixed(1) : null,
    railRadius: rail ? getComputedStyle(rail).borderRadius : null,
  };
});
console.log('DESKTOP', JSON.stringify(desktopMeasure));
await desktop.locator('.brands-section').screenshot({ path: 'verify/brands-section-desktop.png' });

console.log('PAGE_ERRORS', errors.length, errors.slice(0, 5).join(' | '));
await browser.close();
