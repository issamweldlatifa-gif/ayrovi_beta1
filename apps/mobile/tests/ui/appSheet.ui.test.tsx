/**
 * درج موحّد (AppSheet) ودرج المساعدة (زر «؟») — رسم حقيقي بوحدات React Native الأساسية.
 * لا توجد وحدة أصلية إضافية في الدرج، لذلك يُختبر كما هو.
 */
import { Text, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';
import { AppSheet } from '../../src/design/sheet/AppSheet';
import { SheetHeader } from '../../src/design/sheet/SheetHeader';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 24, left: 0, right: 0, bottom: 0 },
};

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <PrefsProvider>
        <I18nProvider>
          <ThemeProvider>
            <View style={{ flex: 1 }}>{children}</View>
          </ThemeProvider>
        </I18nProvider>
      </PrefsProvider>
    </SafeAreaProvider>
  );
}

describe('AppSheet', () => {
  it('يُرسم مفتوحاً بمحتواه دون خطأ', () => {
    render(
      <Providers>
        <AppSheet open onDismiss={() => undefined} header={<SheetHeader title="عنوان" onClose={() => undefined} />}>
          <Text>محتوى الدرج</Text>
        </AppSheet>
      </Providers>,
    );
    expect(screen.getByText('محتوى الدرج')).toBeTruthy();
  });

  it('زر الإغلاق في الرأس يطلب الإغلاق', () => {
    const onDismiss = jest.fn();
    render(
      <Providers>
        <AppSheet open onDismiss={onDismiss} header={<SheetHeader title="عنوان" onClose={onDismiss} />}>
          <Text>محتوى</Text>
        </AppSheet>
      </Providers>,
    );
    const buttons = screen.getAllByRole('button');
    fireEvent.press(buttons[buttons.length - 1]);
    expect(onDismiss).toHaveBeenCalled();
  });
});

