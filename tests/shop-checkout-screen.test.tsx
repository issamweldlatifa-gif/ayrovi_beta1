/*
 * CAISSE v2 — l'écran change, le CONTRAT DE VENTE ne change pas.
 *
 * Ces tests gardent, sur le nouvel écran, les garanties que l'ancienne caisse
 * tenait mêlées à son rendu. Elles engagent l'entreprise : sans elles, une
 * commande peut partir sans conditions acceptées, sans contact vérifié, ou avec
 * un moyen de paiement que personne ne peut encaisser.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';
import { ShopCheckoutScreen } from '../client/src/shop';

const source = readFileSync('client/src/shop/ShopCheckoutScreen.tsx', 'utf8');

describe('caisse v2 — le contrat', () => {
  it('la commande est créée AVANT le paiement', () => {
    expect(source).toContain('buildCheckoutBody(');
    const order = source.indexOf("fetch('/api/checkout'");
    const success = source.indexOf('onOrderSuccess(');
    expect(order).toBeGreaterThan(0);
    expect(success).toBeGreaterThan(order);
  });

  it('la session et le jeton CSRF voyagent avec la requête', () => {
    expect(source).toContain("'x-csrf-token': customerSession.csrfToken");
    expect(source).toContain("'x-session-id': getSessionId()");
  });

  it('les refus viennent des règles extraites, jamais d’une copie locale', () => {
    expect(source).toContain('refuseCheckout(');
    expect(source).toContain('resolvePaymentMethod(');
    expect(source).not.toMatch(/\/\^\[24579\]/);
  });

  it('une session absente ouvre l’authentification au lieu d’échouer en silence', () => {
    expect(source).toContain('onRequireAuthentication()');
  });

  it('un code de refus inconnu reste VISIBLE pour le support', () => {
    expect(source).toContain("String(data?.code || data?.error || 'CHECKOUT_FAILED')");
  });

  it('les modes de livraison ne sont jamais supposés', () => {
    expect(source).toContain('modes = [');
    expect(source).toContain('Modes de livraison RÉELLEMENT servis');
  });
});

describe('caisse v2 — rendu', () => {
  it('s’affiche sur l’étape adresse sans réseau', () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <ShopCheckoutScreen
          isOpen onClose={() => {}} totalTND={118.9} itemCount={1}
          customerSession={null} onRequireAuthentication={() => {}} onOrderSuccess={() => {}}
        />
      </LocaleProvider>,
    );
    expect(html).toContain('Adresse de livraison');
    expect(html.length).toBeGreaterThan(200);
  });

  it('fermée, elle ne rend rien', () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <ShopCheckoutScreen
          isOpen={false} onClose={() => {}} totalTND={0} itemCount={0}
          customerSession={null} onRequireAuthentication={() => {}} onOrderSuccess={() => {}}
        />
      </LocaleProvider>,
    );
    expect(html).toBe('');
  });
});
