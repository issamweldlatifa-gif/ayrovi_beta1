import { Pressable, View } from 'react-native';
import { AppText } from '@/design/ui';
import { useI18n } from '@/i18n';
import { useTheme } from '@/design/theme';
/** Explicit recovery remains available when loading the next page fails. */
export function ReelPageFooter({ query, onMedia = false }: { onMedia?: boolean; query: {
  hasNextPage?: boolean; isFetchingNextPage?: boolean; isFetchNextPageError?: boolean;
  fetchNextPage: () => Promise<unknown>;
} }) {
  const { locale } = useI18n();
  const theme = useTheme();
  if (!query.hasNextPage) return null;
  return <View style={{ minWidth: 120, padding: 12, justifyContent: 'center' }}>
    <Pressable accessibilityRole="button" disabled={query.isFetchingNextPage}
      style={{ minHeight: 44, padding: 12, alignItems: 'center', justifyContent: 'center' }}
      onPress={() => { void query.fetchNextPage(); }}>
      <AppText color={onMedia ? theme.colors.onMedia : theme.colors.ink}>{query.isFetchingNextPage
        ? (locale === 'ar' ? 'جارٍ التحميل…' : 'Chargement…')
        : query.isFetchNextPageError ? (locale === 'ar' ? 'إعادة المحاولة' : 'Réessayer')
        : (locale === 'ar' ? 'عرض المزيد' : 'Voir plus')}</AppText>
    </Pressable>
  </View>;
}
