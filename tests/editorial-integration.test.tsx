import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IconFamily } from '../client/src/design/editorial/IconFamily';
import { ArrowLeft, LensBox, Search } from '../client/src/components/QatafoIcons';
import { customerTheme, CUSTOMER_FONTS } from '../client/src/design/editorial/customerTheme';
import { DEFAULT_INTERFACE_CONFIG } from '../client/src/config/interfaceConfig';
import identity from '../client/src/design/editorial/identity.json';
import { safePublicHref } from '../client/src/utils/publicLinks';
import { Price } from '../client/src/design/ui/Price';

describe('customer identity integration, not a reference-only kit', () => {
  it('uses the approved palette and fonts without mutating CMS content/layout', () => {
    const config=structuredClone(DEFAULT_INTERFACE_CONFIG);
    config.colors.accent='#0000ff';config.layout.maxWidth=1100;config.navigation.aiLabel='Mon SONIM';
    const before=JSON.stringify(config);
    const style=customerTheme('ar',config) as Record<string,string>;
    expect(style['--ayrovi-color-brand-orange']).toBe(identity.colors.accent);
    expect(style['--ayrovi-cta']).toBe(identity.colors.action);
    expect(style['--ayrovi-cta-ink']).toBe(identity.colors.onAction);
    expect(style['--font-primary']).toBe(CUSTOMER_FONTS.ar);
    expect(style['--ayrovi-content-max']).toBe('1100px');
    expect(JSON.stringify(config)).toBe(before);
  });
  it('does not publish customer appearance onto html or apply the provider to admin', () => {
    const app=readFileSync('client/src/App.tsx','utf8');
    expect(app).not.toContain('root.style.setProperty');
    expect(app).toContain('style={customerTheme(locale, interfaceConfig)}');
    expect(readFileSync('client/src/main.tsx','utf8')).toContain('isAdminPath ? <AdminApp /> : <CustomerIdentity>');
  });
  it('renders the NEW geometry through existing screen imports, not just the standalone board', () => {
    const html=renderToStaticMarkup(<IconFamily family="editorial"><Search /></IconFamily>);
    expect(html).toContain('data-editorial-icon="Search"');expect(html).toContain('stroke-width="1.3"');
  });
  it('keeps legacy admin/default and an explicit preserved navigation boundary', () => {
    expect(renderToStaticMarkup(<Search />)).not.toContain('data-editorial-icon');
    const html=renderToStaticMarkup(<IconFamily family="editorial"><IconFamily family="legacy"><LensBox /></IconFamily></IconFamily>);
    expect(html).not.toContain('data-editorial-icon');expect(html).toContain('stroke-width="1.5"');
    const app=readFileSync('client/src/App.tsx','utf8');
    expect(app.match(/data-preserved-navigation/g)).toHaveLength(2);
  });
  it('mirrors backward navigation exactly once despite legacy RTL rotate classes', () => {
    const html=renderToStaticMarkup(<IconFamily family="editorial" direction="rtl"><ArrowLeft className="h-5 rotate-180" /></IconFamily>);
    expect(html).toContain('translate(24 0) scale(-1 1)');expect(html).not.toContain('rotate-180');
  });
  it('isolates price numerals without changing currency calculations', () => {
    const html=renderToStaticMarkup(<Price amount={12.5} currencyLabel="د.ت" />);
    expect(html).toContain('<bdi dir="ltr">12,50</bdi>');expect(html).toContain('ms-1');
  });
  it('protects preserved navigation source and existing destinations', () => {
    const bottom=readFileSync('client/src/components/BottomNavBar.tsx','utf8');
    expect(bottom).toContain('grid-cols-3');expect(bottom).toContain('onOpenLens');expect(bottom).toContain('onToggleAiDrawer');expect(bottom).toContain('app:vision');
  });
});

describe('CMS links are actual destinations, never executable schemes', () => {
  it.each(['/terms.html','#home-hero','https://example.com/path?q=a','http://example.com','/'])('accepts %s',url=>expect(safePublicHref(url)).toBe(url));
  it.each(['javascript:alert(1)','data:text/html,hello','//evil.test','/\\evil.test','https://name:password@example.com','java\nscript:alert(1)','mailto:a@b.test','',null,23])('rejects %s',url=>expect(safePublicHref(url)).toBeNull());
  it('retains real internal anchors in Lens and hides invalid hero destinations', () => {
    const lens=readFileSync('client/src/components/LensFeature.tsx','utf8');
    expect(lens).toContain("const Action = href ? 'a' : 'button'");
    expect(lens).not.toContain("if (data.ctaUrl.startsWith('/')) return");
    expect(readFileSync('client/src/components/EvergreenHero.tsx','utf8')).toContain('content.ctaLabel && href ? <a');
  });
});
