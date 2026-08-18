import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync('client/src/App.tsx', 'utf8');
const navbarSource = readFileSync('client/src/components/Navbar.tsx', 'utf8');
const bottomNavSource = readFileSync('client/src/components/BottomNavBar.tsx', 'utf8');
const footerSource = readFileSync('client/src/components/Footer.tsx', 'utf8');
const aboutSource = readFileSync('client/src/components/AboutSection.tsx', 'utf8');
const runtimeCss = readFileSync('client/src/styles/interface-runtime.css', 'utf8');
const indexCss = readFileSync('client/src/index.css', 'utf8');

describe('homepage close, sticky header and scroll-aware navigation', () => {
  it('closes the customer profile to the homepage instead of treating X as Back', () => {
    expect(appSource).toContain('onClose={() => { navigation.goHome();');
    expect(appSource).toContain("setAccountInitialSection('home')");
  });

  it('keeps the white public header sticky without creating a horizontal scroll container', () => {
    expect(navbarSource).toContain('className="public-site-header"');
    expect(runtimeCss).toMatch(/\.public-site-header\{[^}]*position:sticky!important;[^}]*top:0!important/);
    expect(indexCss).toMatch(/overflow-x:\s*hidden;\s*overflow-x:\s*clip;/);
  });

  it('uses a white glass bottom navigation with black icons that hides down and returns up', () => {
    expect(bottomNavSource).toContain('const [isVisible, setIsVisible] = useState(true)');
    expect(bottomNavSource).toContain("window.addEventListener('scroll', onScroll, { passive: true })");
    expect(bottomNavSource).toContain('else if (delta > 8) setIsVisible(false)');
    expect(bottomNavSource).toContain('else if (delta < -8) setIsVisible(true)');
    expect(runtimeCss).toMatch(/\.ayrovi-glass-bottom-nav\{[^}]*rgba\(255,255,255,\.78\)[^}]*backdrop-filter:blur\(18px\)/);
    expect(runtimeCss).toMatch(/\.ayrovi-glass-bottom-nav\.is-hidden\{[^}]*translate3d/);
    expect(runtimeCss).toContain('.ayrovi-glass-bottom-nav .interface-runtime-icon{color:#111318!important}');
  });

  it('removes the exchange-rate card and restores the sticky parallax scene', () => {
    expect(footerSource).not.toContain('ratesTransparencyImage');
    expect(footerSource).not.toContain('exchangeRates');
    expect(footerSource).not.toContain('Taux &amp; Transparence');
    expect(footerSource).not.toContain('rates-title');
    expect(footerSource).not.toContain('Code de suivi AYR-TN dès la confirmation');
    expect(aboutSource).toContain('className="ayrovi-parallax relative isolate min-h-[300svh] bg-surface"');
    expect(aboutSource).not.toContain('min-h-[300svh] overflow-clip');
    expect(aboutSource).not.toContain('paiement en espèces à la livraison');
    expect(runtimeCss).toContain('.ayrovi-parallax{overflow:visible!important;contain:none}');
    expect(runtimeCss).toContain('.ayrovi-parallax-media{position:sticky!important;top:0!important;will-change:transform}');
  });
});
