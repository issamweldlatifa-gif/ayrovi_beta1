import { render } from '@testing-library/react-native';
import Svg, { Path } from 'react-native-svg';
import { TabHomeIcon, TabLensIcon, TabAyWebsIcon, TabProfileIcon, TabCleanIcon, TAB_ICON_STROKE } from '@/design/TabNavIcons';
import palette from '../../../../assets/brand/navigation-palette.json';
let mockMode = 'light';
jest.mock('@/design/theme', () => ({ useTheme: () => ({ mode: mockMode, iconSize: { md: 24 } }) }));
afterEach(() => { mockMode = 'light'; });
for (const mode of ['light', 'dark']) {
  it(`keeps all four navigation icons monochrome before and after selection in ${mode}`, () => {
    mockMode = mode;
    const ink = mode === 'dark' ? '#FFFFFF' : '#0A0A0A';
    for (const Icon of [TabHomeIcon, TabLensIcon, TabAyWebsIcon, TabProfileIcon]) {
      for (const focused of [false, true]) {
        const tree = render(<Icon color="#0095F6" focused={focused} />);
        const svg = tree.UNSAFE_getByType(Svg);
        expect(svg.props.width).toBe(24); expect(svg.props.height).toBeLessThanOrEqual(24);
        if (Icon === TabHomeIcon) expect(tree.UNSAFE_getByType(Path).props.fill).toBe(ink);
        else { expect(svg.props.stroke).toBe(ink); expect(svg.props.strokeWidth).toBe(TAB_ICON_STROKE); expect(svg.props.strokeLinecap).toBe('round'); }
        tree.unmount();
      }
    }
  });
}
it('keeps the Clean turquoise/orange message and white sparkle in both themes', () => {
  for (const mode of ['light', 'dark']) {
    mockMode = mode;
    const tree = render(<TabCleanIcon color="black" />);
    const fills = tree.UNSAFE_getAllByType(Path).map(p => p.props.fill);
    expect(fills).toContain(palette.cleanTurquoise); expect(fills).toContain(palette.cleanOrange); expect(fills).toContain('#FFFFFF');
    tree.unmount();
  }
});
