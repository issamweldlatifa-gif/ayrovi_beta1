import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { BackButton } from '@/design/BackButton';
import { goBack } from '@/design/navigation';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { PUBLICATION_THEME as P } from '@/design/tokens.mobile';
import { useT } from '@/i18n';
import { PublicationIcon, PublicationText } from './publicationDesign';

export function PublicationCampaignHeader({ title, onSearch }: { title: string; onSearch: () => void }) {
  const t = useT();
  const theme = useTheme();
  const ink = P.headerInk;
  const icon = (name: 'search-outline' | 'heart-outline' | 'bag-outline', label: string, press: () => void) =>
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={press} style={styles.icon}>
      <PublicationIcon name={name} size={24} color={ink} />
    </Pressable>;
  return <View testID="publication-campaign-header" style={[styles.header, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
    <BackButton onPress={() => goBack('/(tabs)')} label={t('common.back')} color={ink} />
    <PublicationText variant="bodyStrong" numberOfLines={1} style={styles.title}>{title}</PublicationText>
    {icon('search-outline', t('catalog.search'), onSearch)}
    {icon('heart-outline', t('account.menu.favorites'), () => router.push('/account/favorites'))}
    {icon('bag-outline', t('tabs.cart'), () => router.push('/(tabs)/cart'))}
  </View>;
}

const styles = StyleSheet.create({
  header: { minHeight: 56, paddingHorizontal: 4, alignItems: 'center', backgroundColor: P.paper,
    borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: P.line },
  title: { flex: 1, marginStart: 16 },
  icon: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
