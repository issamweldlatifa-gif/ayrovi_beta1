/**
 * درج موحّد (AppSheet) — رسم JavaScript فقط.
 *
 * Reanimated و Gesture Handler يحملان وحداتهما الأصلية عند الاستيراد، وهذه غير موجودة
 * في Jest. لذلك نستبدلهما بمحاكاة صغيرة: الإيماءات تُبنى ولا تُنفَّذ، والقيم تُقرأ فوراً.
 * الهدف هنا: أن شجرة الدرج (الخلفية، الرأس، المحتوى، زر الإغلاق) تُرسم دون خطأ.
 * سلوك السحب نفسه مختبر منطقياً في `tests/sheet-physics.test.ts`.
 */
import { Text, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('react-native-gesture-handler', () => {
  const { View: RNView } = require('react-native');
  const builder = () => {
    const api: Record<string, unknown> = {};
    const self = () => api;
    for (const name of ['simultaneousWithExternalGesture', 'activeOffsetY', 'failOffsetX', 'onStart', 'onChange', 'onEnd']) {
      api[name] = self;
    }
    return api;
  };
  return {
    Gesture: { Pan: builder, Native: builder },
    GestureDetector: ({ children }: { children: unknown }) => children,
    GestureHandlerRootView: ({ children, style }: { children: unknown; style?: unknown }) =>
      require('react').createElement(RNView, { style }, children),
  };
});

jest.mock('react-native-reanimated', () => {
  const { ScrollView: RNScrollView, View: RNView } = require('react-native');
  return {
    __esModule: true,
    default: { View: RNView, ScrollView: RNScrollView },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: (fn: () => object) => fn(),
    useAnimatedScrollHandler: () => ({}),
    withSpring: (v: unknown) => v,
    withTiming: (v: unknown) => v,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  };
});

import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppSheet } from '../../src/design/sheet/AppSheet';
import { SheetHeader } from '../../src/design/sheet/SheetHeader';
import { LensHelp } from '../../src/features/lens/LensHelp';


function Harness({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  return (
    <View style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } }}>
      <PrefsProvider>
        <I18nProvider>
          <ThemeProvider>
            <AppSheet open={open} onDismiss={onDismiss} header={<SheetHeader title="عنوان" onClose={onDismiss} />}>
              <Text>محتوى الدرج</Text>
            </AppSheet>
          </ThemeProvider>
        </I18nProvider>
      </PrefsProvider>
      </SafeAreaProvider>
    </View>
  );
}

describe('AppSheet (رسم JavaScript)', () => {
  it('يُرسم مفتوحاً بمحتواه دون خطأ', () => {
    render(<Harness open onDismiss={() => undefined} />);
    expect(screen.getByText('محتوى الدرج')).toBeTruthy();
  });

  it('زر الإغلاق في الرأس يطلب الإغلاق', () => {
    const onDismiss = jest.fn();
    render(<Harness open onDismiss={onDismiss} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.press(buttons[buttons.length - 1]);
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe('مسار زر «?» داخل Lens (الدرج الفعلي)', () => {
  it('درج المساعدة يُرسم بمحتواه دون خطأ', () => {
    render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } }}>
        <PrefsProvider>
          <I18nProvider>
            <ThemeProvider>
              <View style={{ flex: 1 }}>
                <LensHelp open onClose={() => undefined} onClosed={() => undefined} />
              </View>
            </ThemeProvider>
          </I18nProvider>
        </PrefsProvider>
      </SafeAreaProvider>,
    );
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });
});
