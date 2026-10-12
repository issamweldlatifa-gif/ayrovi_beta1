/**
 * الشريط العلوي لـLens: الرجوع يستدعي `onBack`، والفلاش يختفي في وضع الرابط والرمز.
 */
import { View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';
import { LensTopBar } from '../../src/features/lens/LensTopBar';

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrefsProvider>
      <I18nProvider>
        <ThemeProvider>
          <View style={{ flex: 1 }}>{children}</View>
        </ThemeProvider>
      </I18nProvider>
    </PrefsProvider>
  );
}

const base = {
  title: 'AYROVIX Lens',
  onBack: () => undefined,
  onHelp: () => undefined,
  onHistory: () => undefined,
  flashOn: false,
  onToggleFlash: () => undefined,
};

describe('LensTopBar', () => {
  it('يعرض العنوان ويستدعي الرجوع', () => {
    const onBack = jest.fn();
    render(
      <Providers>
        <LensTopBar {...base} onBack={onBack} showFlash />
      </Providers>,
    );
    expect(screen.getByText('AYROVIX Lens')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: /retour|رجوع/i }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('يُخفي الفلاش حين لا توجد كاميرا (وضع الرابط والرمز)', () => {
    render(
      <Providers>
        <LensTopBar {...base} showFlash={false} />
      </Providers>,
    );
    expect(screen.queryByRole('button', { name: /flash/i })).toBeNull();
  });
});
