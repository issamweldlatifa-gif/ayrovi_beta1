/**
 * حدّ الخطأ لمحتوى درج Lens: إذا انكسر رسم المحتوى، يظهر سبب مفهوم وزر إغلاق،
 * ولا يُسقط التطبيق كله. الخطأ يُسجَّل في الطرفية (لا يُبتلع)، والكاميرا تبقى في مكانها.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { useI18n } from '@/i18n';

interface BoundaryProps {
  onClose: () => void;
  children: ReactNode;
}

interface BoundaryState {
  failed: boolean;
}

export class LensDrawerBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[Lens drawer]', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <DrawerFailure onClose={this.props.onClose} />;
  }
}

function DrawerFailure({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.box}>
      <AppText variant="body" color={theme.colors.muted}>{t('lens.drawerFailed')}</AppText>
      <Button label={t('lens.close')} tone="quiet" block onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 12, paddingVertical: 8 },
});
