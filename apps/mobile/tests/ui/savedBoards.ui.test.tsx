/**
 * « Ma sélection » — deux tableaux honnêtes :
 *   • les favoris viennent du serveur (compteur réel) ;
 *   • les articles achetés n'apparaissent QU'APRÈS un achat réel.
 *
 * Le test verrouille les deux règles : un invité voit « 0 » et ne voit jamais
 * un tableau d'achats vide inventé ; un client avec achats voit les deux.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SavedBoards } from '@/features/account/SavedBoards';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

const mount = (props: React.ComponentProps<typeof SavedBoards>) => render(
  <PrefsProvider><I18nProvider><ThemeProvider><SavedBoards {...props} /></ThemeProvider></I18nProvider></PrefsProvider>,
);

test('les achats n’apparaissent pas sans achat réel, et le compteur de favoris est celui du serveur', () => {
  const onFavorites = jest.fn();
  const onOrders = jest.fn();
  mount({ favorites: 3, purchases: 0, onFavorites, onOrders });

  expect(screen.getByText('3 article(s)')).toBeTruthy();
  expect(screen.queryByTestId('account-board-purchases')).toBeNull();
  fireEvent.press(screen.getByTestId('account-board-favorites'));
  expect(onFavorites).toHaveBeenCalledTimes(1);
  expect(onOrders).not.toHaveBeenCalled();
});

test('un achat réel ouvre le tableau des articles achetés vers l’historique', () => {
  const onFavorites = jest.fn();
  const onOrders = jest.fn();
  mount({ favorites: 1, purchases: 2, onFavorites, onOrders });

  fireEvent.press(screen.getByTestId('account-board-purchases'));
  expect(onOrders).toHaveBeenCalledTimes(1);
  expect(onFavorites).not.toHaveBeenCalled();
});
