import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { LoadingSpinner } from '@/design/LoadingSpinner';
import { userMessage } from '@/api/errors';
import { useI18n } from '@/i18n';
import { PublicationText, PUBLICATION_PALETTE as P } from './publicationDesign';

export function EmptyBlock({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        padding: 20,
        gap: 12,
        alignItems: 'center',
        backgroundColor: P.paper,
      }}
    >
      {children}
    </View>
  );
}
export function LoadingBlock() {
  return (
    <View
      accessibilityRole="progressbar"
      style={{ padding: 20, alignItems: 'center', backgroundColor: P.paper }}
    >
      <LoadingSpinner color={P.icon} testID="loading-spinner" />
    </View>
  );
}
export function ErrorBlock({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const { locale } = useI18n();
  return (
    <View
      accessibilityRole="alert"
      style={{
        padding: 20,
        gap: 12,
        alignItems: 'center',
        backgroundColor: P.paper,
      }}
    >
      <PublicationText color={P.muted}>
        {userMessage(error)[locale]}
      </PublicationText>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <PublicationText variant="label">
            {locale === 'ar' ? 'أعد المحاولة' : 'Réessayer'}
          </PublicationText>
        </Pressable>
      ) : null}
    </View>
  );
}
