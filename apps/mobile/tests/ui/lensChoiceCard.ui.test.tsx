/**
 * بطاقة الاختيار في «Lien / code»: الضغط يستدعي الإجراء مرة واحدة.
 */
import { View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';
import { LensChoiceCard } from '../../src/features/lens/LensChoiceCard';

describe('LensChoiceCard', () => {
  it('يعرض العنوان والوصف ويستدعي الضغط مرة واحدة', () => {
    const onPress = jest.fn();
    render(
      <PrefsProvider>
        <I18nProvider>
          <ThemeProvider>
            <View>
              <LensChoiceCard icon="qr-code-outline" title="Ouvrir le scanner QR" subtitle="Scannez un QR code" onPress={onPress} />
            </View>
          </ThemeProvider>
        </I18nProvider>
      </PrefsProvider>,
    );
    expect(screen.getByText('Ouvrir le scanner QR')).toBeTruthy();
    expect(screen.getByText('Scannez un QR code')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Ouvrir le scanner QR' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
