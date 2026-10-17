/**
 * Écran de chargement ZAYROVI et marque (logo du 2026-10-16) :
 *  • l'écran de chargement est une barre de progression qui masque l'image native une fois peint ;
 *  • le Z est au centre de l'anneau, l'arc tourne (ou reste fixe si le système le demande) ;
 *  • la marque affiche le nom ZAYROVI à côté du Z.
 */
import { act, render, screen } from '@testing-library/react-native';
import { BrandMark } from '../../src/design/BrandMark';
import { LoadingScreen, RING, arcPath } from '../../src/design/LoadingScreen';
import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';

function wrap(node: React.ReactNode) {
  return render(
    <PrefsProvider>
      <I18nProvider>
        <ThemeProvider>{node}</ThemeProvider>
      </I18nProvider>
    </PrefsProvider>,
  );
}

describe('écran de chargement ZAYROVI', () => {
  it('se peint comme une barre de progression puis libère l’image native', async () => {
    const onShown = jest.fn();
    wrap(<LoadingScreen onShown={onShown} />);
    await act(async () => {});
    expect(screen.getByTestId('loading-screen').props.accessibilityRole).toBe('progressbar');
    expect(onShown).toHaveBeenCalled();
  });

  it('l’arc part de midi et couvre environ 70° de l’anneau', () => {
    const c = RING.size / 2;
    const r = c - RING.arc / 2;
    const d = arcPath(c, r, RING.arcDegrees);
    expect(d.startsWith(`M ${c} ${c - r} A ${r} ${r} 0 0 1 `)).toBe(true);
    const [x, y] = d.split(' ').slice(-2).map(Number);
    const degrees = (Math.atan2(x - c, c - y) * 180) / Math.PI;
    expect(Math.round(degrees)).toBe(70);
  });
});

describe('marque ZAYROVI', () => {
  it('affiche le nom à côté du Z', async () => {
    wrap(<BrandMark size={30} />);
    await act(async () => {});
    expect(screen.getByText('ZAYROVI')).toBeTruthy();
    expect(screen.queryByText('AYROVI')).toBeNull();
  });
});
