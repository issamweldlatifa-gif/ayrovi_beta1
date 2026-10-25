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
  it('يُرسم مفتوحاً بمحتواه دون خطأ', async () => {
    await render(
      <Providers>
        <AppSheet open onDismiss={() => undefined} header={<SheetHeader title="عنوان" onClose={() => undefined} />}>
          <Text>محتوى الدرج</Text>
        </AppSheet>
      </Providers>,
    );
    expect(screen.getByText('محتوى الدرج')).toBeTruthy();
  });

  it('زر الإغلاق في الرأس يطلب الإغلاق', async () => {
    const onDismiss = jest.fn();
    await render(
      <Providers>
        <AppSheet open onDismiss={onDismiss} header={<SheetHeader title="عنوان" onClose={onDismiss} />}>
          <Text>محتوى</Text>
        </AppSheet>
      </Providers>,
    );
    const buttons = screen.getAllByRole('button');
    await fireEvent.press(buttons[buttons.length - 1]);
    expect(onDismiss).toHaveBeenCalled();
  });
});


/** Premier `pointerEvents` rencontré dans l'arbre rendu (la racine du tiroir). */
function firstPointerEvents(node: unknown): string | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const n = node as { props?: { pointerEvents?: string }; children?: unknown[] };
  if (n.props?.pointerEvents) return n.props.pointerEvents;
  for (const child of n.children ?? []) {
    const found = firstPointerEvents(child);
    if (found) return found;
  }
  return undefined;
}

describe('AppSheet fermé ne bloque pas la page dessous', () => {
  it('fermé : la racine ne reçoit plus de toucher (sinon le voile couvre la page)', async () => {
    const { toJSON, rerender } = await render(
      <Providers>
        <AppSheet open={false} onDismiss={() => undefined}>
          <Text>contenu</Text>
        </AppSheet>
      </Providers>,
    );
    expect(firstPointerEvents(toJSON())).toBe('none');

    await rerender(
      <Providers>
        <AppSheet open onDismiss={() => undefined}>
          <Text>contenu</Text>
        </AppSheet>
      </Providers>,
    );
    expect(firstPointerEvents(toJSON())).toBe('box-none');
  });
});
