/**
 * Carte « produit lié » (Reel, Publication, Story) — rendu et navigation.
 *  • nom, prix (avec la devise renvoyée par le serveur) et bouton « Découvrir » ;
 *  • « Découvrir » ouvre la page produit DE L'APPLICATION (/product/[id]) ;
 *  • produit indisponible : libellé visible, carte toujours utilisable ;
 *  • un produit incomplet ou sans prix n'est jamais affiché (parseLinkedProduct ⇒ null).
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';
import { LinkedProductCard } from '../../src/features/shopping/LinkedProductCard';
import { parseLinkedProduct, type LinkedProduct } from '../../src/api/linkedProduct';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
}));

function wrap(node: React.ReactNode) {
  return (
    <PrefsProvider>
      <I18nProvider>
        <ThemeProvider>{node}</ThemeProvider>
      </I18nProvider>
    </PrefsProvider>
  );
}

const product = (over: Partial<LinkedProduct> = {}): LinkedProduct => ({
  id: 'prod_1', name: 'Pantalon taille haute', image: '/m/p.jpg', price: 89, currency: 'TND',
  stockStatus: 'AVAILABLE', available: true, ...over,
});

beforeEach(() => {
  (router.push as jest.Mock).mockClear();
});

describe('LinkedProductCard', () => {
  it('affiche le nom, le prix avec sa devise et le bouton Découvrir', () => {
    render(wrap(<LinkedProductCard product={product()} />));
    expect(screen.getByText('Pantalon taille haute')).toBeTruthy();
    expect(screen.getByText('89.00 TND')).toBeTruthy();
    expect(screen.getByText('Découvrir')).toBeTruthy();
  });

  it('Découvrir ouvre la page produit interne, jamais un lien externe', () => {
    render(wrap(<LinkedProductCard product={product()} />));
    fireEvent.press(screen.getByTestId('linked-product-cta-prod_1'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/product/[id]', params: { id: 'prod_1' } });
  });

  it('onOpen remplace la navigation par défaut (ex. story : même chemin que le CTA)', () => {
    const onOpen = jest.fn();
    render(wrap(<LinkedProductCard product={product()} onOpen={onOpen} />));
    fireEvent.press(screen.getByTestId('linked-product-cta-prod_1'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'prod_1' }));
    expect(router.push).not.toHaveBeenCalled();
  });

  it('produit en rupture : libellé « indisponible », carte toujours cliquable', () => {
    render(wrap(<LinkedProductCard product={product({ available: false, stockStatus: 'OUT_OF_STOCK' })} />));
    expect(screen.getByText('Actuellement indisponible')).toBeTruthy();
    fireEvent.press(screen.getByTestId('linked-product-cta-prod_1'));
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('variante overlay (Reels plein écran) rend la même carte', () => {
    render(wrap(<LinkedProductCard product={product()} variant="overlay" testID="reel-card-product" />));
    expect(screen.getByTestId('reel-card-product')).toBeTruthy();
    expect(screen.getByText('89.00 TND')).toBeTruthy();
  });
});

describe('parseLinkedProduct — ce que l’application accepte', () => {
  it('sans produit ou réponse vide ⇒ null (aucune carte)', () => {
    expect(parseLinkedProduct(null)).toBeNull();
    expect(parseLinkedProduct(undefined)).toBeNull();
    expect(parseLinkedProduct('texte')).toBeNull();
  });

  it('prix nul ou nom manquant ⇒ null (jamais de carte cassée)', () => {
    expect(parseLinkedProduct({ id: 'p', name: 'X', price: 0 })).toBeNull();
    expect(parseLinkedProduct({ id: 'p', name: '', price: 10 })).toBeNull();
    expect(parseLinkedProduct({ id: '', name: 'X', price: 10 })).toBeNull();
  });

  it('produit complet ⇒ objet typé, devise par défaut TND, disponible par défaut', () => {
    expect(parseLinkedProduct({ id: 'p', name: 'X', price: '12.5', image: '/i.jpg' })).toEqual({
      id: 'p', name: 'X', image: '/i.jpg', price: 12.5, currency: 'TND', stockStatus: 'AVAILABLE', available: true,
    });
  });
});
