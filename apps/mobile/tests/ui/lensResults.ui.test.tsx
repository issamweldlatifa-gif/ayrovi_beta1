import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { parseCandidate } from '@/api/lens';
import { LensResultsGrid } from '@/features/lens/LensResultsGrid';
import { LensResultMedia } from '@/features/lens/LensResultMedia';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

jest.mock('@/design/appImage', () => ({ AppImage: (props: any) => { const { View } = require('react-native'); return <View {...props} testID={`image-${props.accessibilityLabel}`} />; } }));
const candidate = parseCandidate({ id: 'lens-ready', title: 'Sweat bleu', brand: 'Marque', source: 'Boutique', sourceUrl: 'https://www.zalando.fr/product.html', image: '/photo.jpg' });
async function mount(node: React.ReactNode) { const result = render(<PrefsProvider><I18nProvider><ThemeProvider>{node}</ThemeProvider></I18nProvider></PrefsProvider>); await act(async () => {}); return result; }
describe('Lens progressive reference grid', () => {
  it('shows a real ready card alongside pending slots, without explanatory prose or image dots', async () => {
    await mount(<LensResultsGrid candidates={[candidate]} loading favorited={{}} favoriteNote={null} onOpen={() => undefined} onFavorite={() => undefined} onNewSearch={() => undefined} />);
    expect(screen.getByTestId('lens-result-lens-ready')).toBeTruthy();
    expect(screen.getByTestId('lens-stream-pending')).toBeTruthy();
    expect(screen.queryByTestId('lens-open-hint')).toBeNull();
    expect(screen.queryByPlaceholderText('Filtrer par titre de produit')).toBeNull();
    fireEvent.press(screen.getByTestId('lens-toggle-filter'));
    expect(screen.getAllByLabelText('Filtrer par titre de produit').length).toBeGreaterThan(1);
  });
  it('settles thumbnails independently and permits retry after failure', async () => {
    await mount(<><LensResultMedia sources={['/one.jpg']} title="First" /><LensResultMedia sources={['/two.jpg']} title="Second" /></>);
    expect(screen.getAllByTestId('lens-thumbnail-loading', { includeHiddenElements: true })).toHaveLength(2);
    fireEvent(screen.getByTestId('image-First'), 'settled');
    expect(screen.getAllByTestId('lens-thumbnail-loading', { includeHiddenElements: true })).toHaveLength(1);
    fireEvent(screen.getByTestId('image-Second'), 'error');
    expect(screen.queryByTestId('lens-thumbnail-loading', { includeHiddenElements: true })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Réessayer' }), { stopPropagation: jest.fn() });
    expect(screen.getAllByTestId('lens-thumbnail-loading', { includeHiddenElements: true })).toHaveLength(1);
  });
});
