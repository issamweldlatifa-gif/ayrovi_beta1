import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Footer } from '@/features/shell/Footer';
import { fr } from '@/i18n/fr';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/api/hooks', () => ({ useFooterInfo: () => ({ data: { channels: [], paymentMethods: [] } }) }));
jest.mock('@/design/theme', () => ({ useTheme: () => ({ isRTL: false, colors: { canvas: '#fff', ink: '#000' } }) }));
jest.mock('@/i18n', () => ({ useT: () => (key: string) => require('@/i18n/fr').fr[key] }));
jest.mock('@/design/ui', () => ({ AppText: ({ children }: { children: React.ReactNode }) => {
  const { Text } = require('react-native'); return <Text>{children}</Text>;
} }));

describe('native footer', () => {
  it('shows five local payment logos without the old oversized link list', () => {
    render(<Footer />);
    for (const label of ['Mastercard', 'Visa', 'D17', 'Virement bancaire', 'Flouci']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.queryByLabelText('ZAYROVI')).toBeNull();
    expect(screen.queryByText('Accès utiles')).toBeNull();
    expect(screen.getByText(fr['footer.paymentHint'])).toBeTruthy();
  });
  it('opens existing legal routes', () => {
    render(<Footer />);
    fireEvent.press(screen.getByLabelText(fr['footer.privacy']));
    expect(router.push).toHaveBeenCalledWith('/legal/privacy');
    fireEvent.press(screen.getByLabelText(fr['footer.terms']));
    expect(router.push).toHaveBeenCalledWith('/legal/terms');
  });
  it('contact has an honest empty state and FAQ links to orders', () => {
    render(<Footer />);
    fireEvent.press(screen.getByLabelText(fr['footer.contact']));
    expect(screen.getByText(fr['footer.noContact'])).toBeTruthy();
    fireEvent.press(screen.getByText(fr['common.close']));
    fireEvent.press(screen.getByLabelText(fr['footer.faq']));
    fireEvent.press(screen.getByText(fr['footer.orders']));
    expect(router.push).toHaveBeenCalledWith('/orders');
  });
});
