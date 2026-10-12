/**
 * شريط الحالة وشريط التنقل يُخفيان فقط حين تكون Lens معروضة، ويعودان عند مغادرتها.
 */
import { render } from '@testing-library/react-native';

const mockNavBar = jest.fn((props: unknown) => { void props; return null; });
jest.mock('expo-navigation-bar', () => ({
  NavigationBar: (props: unknown) => mockNavBar(props),
}));

import { LensSystemBars } from '../../src/features/lens/LensSystemBars';

describe('LensSystemBars', () => {
  beforeEach(() => mockNavBar.mockClear());

  it('يخفي شريط التنقل حين تكون Lens معروضة', () => {
    render(<LensSystemBars active />);
    expect(mockNavBar).toHaveBeenCalledWith(expect.objectContaining({ hidden: true }));
  });

  it('لا يفعل شيئاً حين تكون Lens مخفية، فيعود النظام إلى حالته', () => {
    render(<LensSystemBars active={false} />);
    expect(mockNavBar).not.toHaveBeenCalled();
  });
});
