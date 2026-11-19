import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { G, Stop } from 'react-native-svg';
import { PrefsProvider } from '@/state/prefs';
import { I18nProvider } from '@/i18n';
import { ThemeProvider } from '@/design/theme';
import { REACTION_COLORS } from '@/design/tokens.mobile';
import { ReactionButton, reactionPickerPosition } from '@/design/reactions/ReactionButton';

jest.mock('@/design/motion', () => ({ ...jest.requireActual('@/design/motion'), useReduceMotion: () => true }));

const renderButton = async (props: Partial<Parameters<typeof ReactionButton>[0]> = {}) => {
  const onTap = jest.fn(), onPick = jest.fn();
  render(<PrefsProvider><I18nProvider><ThemeProvider>
    <ReactionButton testID="reaction-trigger" reaction={null} count="15" ink="#FFFFFF" variant="rail" onTap={onTap} onPick={onPick} {...props} />
  </ThemeProvider></I18nProvider></PrefsProvider>);
  await act(async () => {});
  return { onTap, onPick };
};

it.each(['like', 'love'] as const)('shows the selected %s as a colored disc with a white mark on video', async (reaction) => {
  await renderButton({ reaction });
  const svg = screen.getByTestId(`reaction-mark-${reaction}-disc`, { includeHiddenElements: true });
  expect(svg.findAllByType(Stop).map(stop => stop.props.stopColor)).toEqual(reaction === 'like' ? REACTION_COLORS.likeDisc : REACTION_COLORS.loveDisc);
  expect(svg.findAllByType(G).some(group => group.props.fill === REACTION_COLORS.onDisc)).toBe(true);
  expect(screen.getByText('15')).toBeTruthy();
});

it.each(['like', 'love'] as const)('shows a completely filled %s icon on a publication', async (reaction) => {
  await renderButton({ reaction, variant: 'inline', ink: '#101010' });
  const svg = screen.getByTestId(`reaction-mark-${reaction}-solid`, { includeHiddenElements: true });
  expect(svg.findAllByType(Stop)).toHaveLength(0);
  expect(svg.findAllByType(G).some(group => group.props.fill === REACTION_COLORS[reaction])).toBe(true);
  expect(StyleSheet.flatten(screen.getByText('15').props.style).color).toBe('#101010');
});

it('opens a white icon pill on long press and submits only the chosen reaction', async () => {
  const { onTap, onPick } = await renderButton();
  fireEvent(screen.getByTestId('reaction-trigger'), 'longPress');
  const picker = screen.getByTestId('reaction-picker');
  expect(StyleSheet.flatten(picker.props.style)).toMatchObject({ backgroundColor: '#FFFFFF', flexDirection: 'row-reverse' });
  expect(within(picker).getByTestId('reaction-mark-like-disc', { includeHiddenElements: true })).toBeTruthy();
  expect(within(picker).getByTestId('reaction-mark-love-disc', { includeHiddenElements: true })).toBeTruthy();
  fireEvent.press(within(picker).getByTestId('reaction-pick-love'));
  expect(onPick).toHaveBeenCalledWith('love');
  expect(onTap).not.toHaveBeenCalled();
  expect(screen.queryByTestId('reaction-picker')).toBeNull();
});

it('anchors the rail picker above the button and mirrors the edge in RTL', () => {
  const viewport = { width: 390, height: 844 };
  const ltr = reactionPickerPosition({ x: 336, y: 540, width: 44, height: 44 }, 'rail', viewport, false);
  const rtl = reactionPickerPosition({ x: 10, y: 540, width: 44, height: 44 }, 'rail', viewport, true);
  expect(ltr).toEqual({ left: 228, top: 476 });
  expect(rtl).toEqual({ left: 10, top: 476 });
});
