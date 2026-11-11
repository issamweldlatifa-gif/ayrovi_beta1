/**
 * Clavier (11/11/2026) — rendu réel : le conteneur ajoute en bas EXACTEMENT la
 * part recouverte, la feuille remonte, et tout revient à zéro à la fermeture.
 */
import { Text, View, Keyboard, type KeyboardEvent } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';
import { KeyboardAvoider } from '../../src/design/keyboard';
import { AppSheet } from '../../src/design/sheet/AppSheet';

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 34 } };

let events: Record<string, (event: KeyboardEvent) => void>;
let listener: jest.SpyInstance;
let measureSpy: jest.SpyInstance;

beforeEach(() => {
  events = {};
  listener = jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, callback: (event: KeyboardEvent) => void) => {
    events[name] = callback;
    return { remove: jest.fn() };
  }) as never);
  // Toute vue mesurée occupe l'écran entier (390 × 844), comme en edge-to-edge.
  measureSpy = jest.spyOn(View.prototype as never, 'measureInWindow' as never).mockImplementation(((cb: (x: number, y: number, w: number, h: number) => void) => cb(0, 0, 390, 844)) as never);
});
afterEach(() => { listener.mockRestore(); measureSpy.mockRestore(); });

const show = (screenY: number) => act(() => { (events.keyboardDidShow ?? events.keyboardWillChangeFrame)({ endCoordinates: { screenY, height: 844 - screenY, screenX: 0, width: 390 } } as KeyboardEvent); });
const hide = () => act(() => { (events.keyboardDidHide ?? events.keyboardWillHide)({} as KeyboardEvent); });
const flatStyle = (node: { props: { [key: string]: any } }) => Object.assign({}, ...([node.props.style].flat(Infinity).filter(Boolean) as object[]));

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <PrefsProvider><I18nProvider><ThemeProvider>
        <View style={{ flex: 1 }}>{children}</View>
      </ThemeProvider></I18nProvider></PrefsProvider>
    </SafeAreaProvider>
  );
}

it('KeyboardAvoider : padding bas = recouvrement réel, puis 0', () => {
  render(<KeyboardAvoider testID="avoider" style={{ flex: 1 }}><Text>champ</Text></KeyboardAvoider>);
  expect(flatStyle(screen.getByTestId('avoider')).paddingBottom).toBeUndefined();
  show(524);
  expect(flatStyle(screen.getByTestId('avoider')).paddingBottom).toBe(320);
  hide();
  expect(flatStyle(screen.getByTestId('avoider')).paddingBottom).toBeUndefined();
});

it('AppSheet : la feuille remonte au-dessus du clavier et réduit sa hauteur', () => {
  render(
    <Providers>
      <AppSheet open presentation="bottom" onDismiss={() => undefined} footer={<Text testID="composer">Partager votre avis</Text>}>
        <Text>commentaires</Text>
      </AppSheet>
    </Providers>,
  );
  const findPanel = () => {
    let node: any = screen.getByTestId('composer');
    while (node && flatStyle(node).position !== 'absolute') node = node.parent;
    return node;
  };
  // Racine de la feuille = l'écran entier (844), comme sur l'appareil.
  let root: any = findPanel();
  while (root.parent && !root.props.onLayout) root = root.parent;
  act(() => root.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } } }));
  expect(flatStyle(findPanel()).bottom).toBe(0);
  const restingMax = flatStyle(findPanel()).maxHeight;
  show(524);
  const lifted = flatStyle(findPanel());
  expect(lifted.bottom).toBe(320);
  // 844 − 320 (clavier) − 24 (zone sûre haute) − 8 = 492 : l'en-tête reste visible.
  expect(lifted.maxHeight).toBe(492);
  hide();
  expect(flatStyle(findPanel()).bottom).toBe(0);
  expect(flatStyle(findPanel()).maxHeight).toBe(restingMax);
});
