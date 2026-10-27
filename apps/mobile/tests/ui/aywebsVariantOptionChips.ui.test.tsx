import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { I18nProvider } from '@/i18n';
import { ThemeProvider } from '@/design/theme';
import { PrefsProvider } from '@/state/prefs';
import { VariantOptionChips } from '@/features/aywebs/VariantOptionChips';

function wrap(node: React.ReactNode) {
  return <PrefsProvider><I18nProvider><ThemeProvider>{node}</ThemeProvider></I18nProvider></PrefsProvider>;
}

describe('AYWEBs product variant controls', () => {
  it('selects a named color swatch and exposes its state accessibly', () => {
    const onSelect = jest.fn();
    render(wrap(
      <VariantOptionChips
        kind="color"
        label="Couleur"
        value="Noir"
        options={[{ value: 'Noir', image: 'https://images.example/noir-product.jpg' }, { value: 'Rose', unavailable: true }]}
        onSelect={onSelect}
      />,
    ));
    expect(screen.getByRole('button', { name: 'Couleur: Noir' }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('aywebs-variant-selected-0')).toBeTruthy();
    expect(screen.UNSAFE_getByType(require('expo-image').Image).props.testID).toBe('aywebs-color-image-0');
    expect(screen.getByRole('button', { name: 'Couleur: Rose' }).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Couleur: Noir' }));
    expect(onSelect).toHaveBeenCalledWith('Noir');
  });

  it('renders size values as selectable pills', () => {
    const onSelect = jest.fn();
    render(wrap(
      <VariantOptionChips
        kind="size"
        label="Taille"
        value="M"
        options={[{ value: 'S' }, { value: 'M' }, { value: 'L', unavailable: true }]}
        onSelect={onSelect}
      />,
    ));
    expect(screen.getByRole('button', { name: 'Taille: M' }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('aywebs-variant-selected-1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Taille: L' }).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Taille: S' }));
    expect(onSelect).toHaveBeenCalledWith('S');
  });
});
