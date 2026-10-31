import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ChoiceField, type ChoiceOption } from '@/features/aywebs/ChoiceField';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

function TestChoice({ options, initial = '' }: { options: ChoiceOption[]; initial?: string }) {
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  return <ChoiceField label="Contenance" value={value} options={options} open={open} placeholder="Choisir"
    onToggle={() => setOpen((v) => !v)} onSelect={(v) => { setValue(v); setOpen(false); }} testID="capacity" />;
}
function mount(options: ChoiceOption[], initial = '') {
  render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
    <PrefsProvider><I18nProvider><ThemeProvider><TestChoice options={options} initial={initial} /></ThemeProvider></I18nProvider></PrefsProvider>
  </SafeAreaProvider>);
}

test('capacity button opens a sheet with the published prices, stock and disabled options', () => {
  mount([{ value: '100 ml', price: '97,95 €', stock: 2 }, { value: '50 ml', price: '74,95 €', unavailable: true }]);
  expect(screen.queryByTestId('capacity-100 ml')).toBeNull();
  fireEvent.press(screen.getByTestId('capacity'));
  expect(screen.getByText('97,95 €')).toBeTruthy();
  expect(screen.getByText('74,95 €')).toBeTruthy();
  expect(screen.getByTestId('capacity-50 ml').props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByTestId('capacity-100 ml'));
  expect(screen.getByText('100 ml')).toBeTruthy();
  expect(screen.queryByTestId('capacity-50 ml')).toBeNull();
});

test('a selected standard value is disabled, but an unselected value is not fabricated', () => {
  const options = [{ value: 'One Size' }];
  mount(options, 'One Size');
  expect(screen.getByTestId('capacity').props.accessibilityState.disabled).toBe(true);
});

test('a standard value that the merchant did not select remains selectable', () => {
  mount([{ value: 'One Size' }]);
  expect(screen.getByTestId('capacity').props.accessibilityState.disabled).toBe(false);
  fireEvent.press(screen.getByTestId('capacity'));
  expect(screen.getByTestId('capacity-One Size')).toBeTruthy();
});
