import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync('client/src/App.tsx', 'utf8');
const navbarSource = readFileSync('client/src/components/Navbar.tsx', 'utf8');
const bottomNavSource = readFileSync('client/src/components/BottomNavBar.tsx', 'utf8');
const footerSource = readFileSync('client/src/components/Footer.tsx', 'utf8');
const aboutSource = readFileSync('client/src/components/AboutSection.tsx', 'utf8');
const announcementSource = readFileSync('client/src/components/TopAnnouncementBar.tsx', 'utf8');
const cartSource = readFileSync('client/src/components/CartDrawer.tsx', 'utf8');
const checkoutCss = readFileSync('client/src/styles/checkout-flow.css', 'utf8');
const runtimeCss = readFileSync('client/src/styles/interface-runtime.css', 'utf8');
const indexCss = readFileSync('client/src/index.css', 'utf8');

describe('homepage close, sticky header and scroll-aware navigation', () => {
  it('closes the customer profile to the homepage instead of treating X as Back', () => {
    expect(appSource).toContain('onClose={() => { navigation.goHome();');
    expect(appSource).toContain("setAccountInitialSection('home')");
  });

  it('keeps the white public header sticky without creating a horizontal scroll container', () => {
    expect(navbarSource).toContain('className="public-site-header"');
    expect(runtimeCss).toMatch(/\.public-site-header\{[^}]*position:sticky!important;[^}]*top:0!important;[^}]*z-index:20!important/);
    expect(indexCss).toMatch(/overflow-x:\s*hidden;\s*overflow-x:\s*clip;/);
  });

  it('keeps every public chrome layer below cart and checkout overlays', () => {
    expect(announcementSource).toContain('relative z-10');
    expect(bottomNavSource).toContain('bottom-0 z-30');
    expect(cartSource).toContain('fixed inset-0 z-50 overflow-hidden');
    expect(checkoutCss).toMatch(/\.checkout-flow-page\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?z-index:\s*50;/);
    expect(runtimeCss).toMatch(/\.ayrovi-app-shell\{[^}]*isolation:isolate/);
  });

  it('keeps all other full-screen experiences in the foreground overlay band', () => {
    const foregroundMarkers = [
      ['client/src/components/PublicCmsSections.tsx', 'fixed inset-0 z-[70]'],
      ['client/src/ayrovix/components/LensLauncher.tsx', 'fixed inset-0 z-[75]'],
      ['client/src/ayrovix/components/LiveCamera.tsx', 'fixed inset-0 z-[76]'],
      ['client/src/components/ProductDrawer.tsx', 'fixed inset-0 z-[80]'],
      ['client/src/components/assistant/AiAssistantDrawer.tsx', 'fixed z-[80]'],
      ['client/src/components/MenuDrawer.tsx', 'fixed inset-0 z-[85]'],
      ['client/src/components/CustomerAccountPage.tsx', 'fixed inset-0 z-[95]'],
    ];
    foregroundMarkers.forEach(([path, marker]) => expect(readFileSync(path, 'utf8')).toContain(marker));
  });

  it('offers three start gates and keeps the three-tool bottom bar', () => {
    expect(appSource).toContain('StartShoppingGates');
    expect(appSource).toContain('onOpenLink={handleToggleProductDrawer}');
    expect(navbarSource).toContain('onLogoClick={onGoHome}');
    expect(navbarSource).toContain('onOpenCart');
    expect(bottomNavSource).toContain('grid-cols-3');
    expect(bottomNavSource).toContain('app:vision');
    expect(bottomNavSource).not.toContain('grid-cols-5');
  });

  it('uses a white glass bottom navigation with black icons that hides down and returns up', () => {
    expect(bottomNavSource).toContain('const [isVisible, setIsVisible] = useState(true)');
    expect(bottomNavSource).toContain("window.addEventListener('scroll', onScroll, { passive: true })");
    expect(bottomNavSource).toContain('else if (delta > 8) setIsVisible(false)');
    expect(bottomNavSource).toContain('else if (delta < -8) setIsVisible(true)');
    expect(runtimeCss).toMatch(/\.ayrovi-glass-bottom-nav\{[^}]*rgba\(255,255,255,\.72\)[^}]*backdrop-filter:blur\(22px\)/);
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
