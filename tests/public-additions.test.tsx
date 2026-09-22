import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { publicPageForPath, PUBLIC_PAGES } from '../client/src/navigation/publicPages';
import { PublicPageLinks } from '../client/src/components/PublicPageLinks';
import { Footer, safeChannelUrl } from '../client/src/components/Footer';
import { publishedCampaign } from '../client/src/components/TopAnnouncementBar';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';

const app = readFileSync('client/src/App.tsx', 'utf8');
const promo = { name: 'Published campaign', description: 'Provider description', status: 'ACTIVE', starts_at: '2026-01-01T00:00:00Z', ends_at: '2027-01-01T00:00:00Z' };
const now = Date.parse('2026-09-22T12:00:00Z');
describe('additions without replacing the homepage', () => {
  it('preserves Hero, both admin-controlled Stories/Lens orders and all existing content hosts', () => {
    expect(app).toContain('<EvergreenHero />');
    expect(app.match(/<StoriesShowcase\s/g)).toHaveLength(2);
    expect(app.match(/<LensFeature onOpenLens=/g)).toHaveLength(2);
    expect(app).toContain('storiesBelowLens ?');
    expect(app).toContain('Number(json.data.sortOrder ?? 1) >= 1');
    expect(app).toContain(': <div className="managed-public-sections">{publicSections}</div>');
    expect(app).toContain('section.visible');
    expect(app).toContain('<BottomNavBar');
  });
  it('places the ad and links after the header and before the existing homepage', () => {
    const header = app.indexOf('<Navbar');
    const ad = app.indexOf('<TopAnnouncementBar');
    const links = app.indexOf('<PublicPageLinks');
    const existing = app.indexOf('<div className="managed-public-sections">');
    expect(header).toBeLessThan(ad); expect(ad).toBeLessThan(links); expect(links).toBeLessThan(existing);
  });
  it.each(PUBLIC_PAGES)('maps $href to a standalone page and accepts a trailing slash', page => {
    expect(publicPageForPath(page.href)).toBe(page.id);
    expect(publicPageForPath(page.href + '/')).toBe(page.id);
  });
  it.each(['/', '/admin', '/reset-password', '/not-a-page', '/arrivage/child'])('does not hijack %s', path => expect(publicPageForPath(path)).toBeUndefined());
  it('uses native links, not tab roles or partial homepage panel controls', () => {
    const html = renderToStaticMarkup(<LocaleProvider><PublicPageLinks /></LocaleProvider>);
    for (const page of PUBLIC_PAGES) expect(html).toContain(`href="${page.href}"`);
    expect(html).not.toContain('role="tab'); expect(html).not.toContain('<button');
  });
  it('renders a footer with official destinations and legal documents, no phantom social accounts or payment badges', () => {
    const html = renderToStaticMarkup(<LocaleProvider><Footer onOpenAccount={() => {}} onOpenAssistant={() => {}} onOpenAbout={() => {}} /></LocaleProvider>);
    for (const href of ['/arrivage', '/gift-cards', '/magazine', '/privacy.html', '/terms.html', '/data-deletion.html']) expect(html).toContain(`href="${href}"`);
    expect(html).not.toContain('href="https://');
    expect(html).not.toContain('VISA'); expect(html).not.toContain('Mastercard');
    expect(html).toContain('public-footer-social-unavailable');
  });
  it('only removes the empty fallback eyebrow, not the title or hero image', () => {
    const hero = readFileSync('client/src/components/EvergreenHero.tsx', 'utf8');
    expect(hero).toContain("if (key === 'eyebrow') return content.eyebrow?.trim()");
    expect(hero).not.toContain("content.eyebrow || 'AYROVI'");
    expect(hero).toContain('titleLines.map'); expect(hero).toContain('visual.imageUrl');
  });
});
describe('truthful campaign and channel data', () => {
  it('uses a currently active published campaign without inventing a discount', () => expect(publishedCampaign([promo], now)).toEqual({ title: promo.name, description: promo.description, href: '/gift-cards' }));
  it.each([
    null, {}, [], [{ ...promo, status: 'DRAFT' }], [{ ...promo, ends_at: '2026-01-02' }],
    [{ ...promo, starts_at: '2027-01-01' }], [{ ...promo, starts_at: 'invalid' }], [{ ...promo, name: ' ' }],
  ])('rejects inactive/missing campaign %j', rows => expect(publishedCampaign(rows, now)).toBeNull());
  it.each(['javascript:alert(1)', 'data:text/html,x', '//example.com', '', 'https://a:b@example.com', 'ftp://example.com', 'https://'])('rejects unsafe social URL %s', value => expect(safeChannelUrl(value)).toBeNull());
  it('accepts a configured public https destination', () => expect(safeChannelUrl(' https://instagram.com/ayrovi ')).toBe('https://instagram.com/ayrovi'));
});
