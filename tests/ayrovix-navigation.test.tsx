import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import { LensContextHeader, LensMoreMenu } from '../client/src/ayrovix/components/LensNavigation';

function withLocale(node: React.ReactNode) {
  return renderToStaticMarkup(<LocaleProvider>{node}</LocaleProvider>);
}

describe('AYROVIX contextual navigation', () => {
  it('keeps Camera contextual: exit, title, flash and menu without cart or standalone history', () => {
    const markup = withLocale(
      <LensContextHeader mode="camera" onExit={vi.fn()} onMenu={vi.fn()} flashControl={<button>Flash</button>} />,
    );
    expect(markup).toContain('data-lens-header="camera"');
    expect(markup).toContain('Quitter AYROVIX Lens');
    expect(markup).toContain('AYROVIX Lens');
    expect(markup).toContain('Flash');
    expect(markup).toContain('Menu AYROVIX Lens');
    expect(markup).not.toContain('Panier');
    expect(markup).not.toContain('Historique Lens');
  });

  it('shows Back, the live shared-cart badge and menu on Result/Product headers', () => {
    const result = withLocale(
      <LensContextHeader mode="result" onBack={vi.fn()} onMenu={vi.fn()} onCart={vi.fn()} cartCount={3} />,
    );
    expect(result).toContain('data-lens-header="result"');
    expect(result).toContain('aria-label="Retour"');
    expect(result).toContain('Panier, 3 article(s)');
    expect(result).toMatch(/>3<\/span>/);
    expect(result).toContain('Menu AYROVIX Lens');
  });

  it('provides one complete non-destructive Lens menu', () => {
    const markup = withLocale(
      <LensMoreMenu open dark={false} onToggleDark={vi.fn()} onHistory={vi.fn()} onClose={vi.fn()} />,
    );
    for (const label of [
      'Historique',
      'Mode sombre',
      'Comment utiliser Lens',
      'Conditions d’utilisation de Lens',
      'Service AYROVIX',
      'Informations légales',
      'Fermer',
    ]) expect(markup).toContain(label);
    expect(markup).toContain('role="switch"');
    expect(markup).toContain('aria-checked="false"');
  });

  it('keeps Lens mounted behind Panier/Checkout and does not clear its result after add-to-cart', () => {
    const app = readFileSync('client/src/App.tsx', 'utf8');
    const launcher = readFileSync('client/src/ayrovix/components/LensLauncher.tsx', 'utf8');
    expect(app).toContain('{lensSessionActive && (');
    expect(app).toContain('isOpen={isLensOpen}');
    expect(app).toContain('cartCount={totalCartCount}');
    expect(launcher).toContain("Le panier s'ouvre, mais le résultat Lens reste monté");
    expect(launcher).not.toMatch(/await onOrder\([\s\S]*?\);\s*clearRuntime\(\)/);
  });

  it('keeps each commerce Back target contextual and adds a direct new-scan CTA', () => {
    const cart = readFileSync('client/src/components/CartDrawer.tsx', 'utf8');
    const checkout = readFileSync('client/src/components/CheckoutModal.tsx', 'utf8');
    const confirmation = readFileSync('client/src/components/OrderSuccessModal.tsx', 'utf8');
    expect(cart).toContain('onBack={onClose}');
    expect(cart).toContain("Calculer un autre produit");
    expect(checkout).toContain("title={isPaymentStage ? tr('Paiement', 'الدفع') : tr('Livraison', 'التوصيل')}");
    expect(checkout).toContain("navigation.pushLayer({ id: 'checkout:payment' })");
    expect(confirmation).toContain('onCalculateAnotherProduct');
    expect(confirmation).toContain("Calculer un autre produit");
  });
});
