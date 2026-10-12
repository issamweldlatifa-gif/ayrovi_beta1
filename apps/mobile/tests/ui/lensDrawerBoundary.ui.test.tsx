/**
 * حدّ الخطأ لدرج Lens: خطأ الرسم لا يُسقط الشاشة، ويظهر زر إغلاق يعمل.
 */
import { Text, View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';
import { LensDrawerBoundary } from '../../src/features/lens/LensDrawerBoundary';

function Broken(): never {
  throw new Error('rendu cassé (test)');
}

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <PrefsProvider>
        <I18nProvider>
          <ThemeProvider>
            <View>{children}</View>
          </ThemeProvider>
        </I18nProvider>
      </PrefsProvider>
    </SafeAreaProvider>
  );
}

describe('LensDrawerBoundary', () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => errorSpy.mockRestore());

  it('يعرض المحتوى السليم كما هو', () => {
    render(<Providers><LensDrawerBoundary onClose={() => undefined}><Text>سليم</Text></LensDrawerBoundary></Providers>);
    expect(screen.getByText('سليم')).toBeTruthy();
  });

  it('عند خطأ الرسم: رسالة واضحة، ويُسجَّل الخطأ، وزر الإغلاق يعمل', () => {
    const onClose = jest.fn();
    render(<Providers><LensDrawerBoundary onClose={onClose}><Broken /></LensDrawerBoundary></Providers>);
    expect(errorSpy).toHaveBeenCalled();
    const buttons = screen.getAllByRole('button');
    fireEvent.press(buttons[buttons.length - 1]);
    expect(onClose).toHaveBeenCalled();
  });
});
