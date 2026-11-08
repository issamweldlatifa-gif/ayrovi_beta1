/** Sparse main identity. LegacyMainMenu and all destinations remain available in source, unmounted. */
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BrandWordmark } from '@/design/BrandMark';
import { AppImage } from '@/design/appImage';
import { RADIUS } from '@/design/tokens.mobile';
import { AYWEBS_WORDMARK_TINT } from '@/design/tokens.mobile';
import { AppText } from '@/design/ui';
import { useSession } from '@/state/session';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { adaptiveInk } from '@/features/home/heroPalette';

export function AppHeader({ scrolled, heroBackground = null, brand = 'zayrovi', showNotifications = true }: {
  scrolled: boolean; heroBackground?: string | null; brand?: 'zayrovi' | 'aywebs'; showNotifications?: boolean;
}) {
  const theme = useTheme(), t = useT(), insets = useSafeAreaInsets();
  const { status } = useSession();
  const onHero = !scrolled && heroBackground !== null;
  const ink = onHero ? adaptiveInk(heroBackground, theme.colors) : theme.colors.ink;
  const row = theme.isRTL ? 'row-reverse' : 'row';
  const icon = (name: keyof typeof Ionicons.glyphMap, label: string, href: string) => <Pressable
    accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push(href as never)} style={styles.hit}>
    <Ionicons name={name} size={theme.iconSize.md} color={ink} />
  </Pressable>;
  return <View testID="main-app-header" pointerEvents="box-none" style={[styles.bar, {
    height: insets.top + theme.chrome.header, paddingTop: insets.top, flexDirection: row,
    backgroundColor: onHero ? heroBackground : theme.colors.canvas,
    borderBottomColor: scrolled ? theme.colors.line : 'transparent',
  }]}>
    <Pressable testID={brand === 'aywebs' ? 'aywebs-header-wordmark' : 'main-header-wordmark'} accessibilityRole="button" accessibilityLabel={t('nav.home')} onPress={() => router.push('/')} style={styles.wordmark}>
      {brand === 'aywebs' ? <AppImage localSource={theme.mode === 'dark' ? require('../../../assets/aywebs/aywebs-wordmark-white.png') : require('../../../assets/aywebs/aywebs-wordmark-violet.png')}
        contentFit="contain" tintColor={AYWEBS_WORDMARK_TINT[theme.mode]} decorative background={null} style={styles.aywebsWordmark} />
        : <BrandWordmark height={25} color={ink} />}
    </Pressable>
    <View style={{ flexDirection: row, alignItems: 'center', gap: 0 }}>
      {brand === 'zayrovi' ? <Pressable testID="plus-light" accessibilityRole="button" accessibilityLabel={t('brand.plusLight')} accessibilityState={{ disabled: true }} disabled
        style={[styles.plus, { borderColor: ink }]}><AppText variant="captionStrong" color={ink}>Plus</AppText><Ionicons name="star" size={theme.iconSize.xs} color={ink} /><AppText variant="caption" color={ink}>Light</AppText></Pressable> : null}
      {showNotifications ? icon('notifications-outline', t('account.menu.notifications'), status === 'signedIn' ? '/account/notifications' : '/sign-in') : null}
      {brand === 'aywebs' ? icon('heart-outline', t('account.menu.favorites'), '/account/favorites') : null}
      {icon('bag-outline', t('cart.title'), '/panier')}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  aywebsWordmark: { width: 121, height: 42 },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  hit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  wordmark: { minHeight: 44, justifyContent: 'center', flexShrink: 1 },
  plus: { minHeight: 44, paddingHorizontal: 8, borderWidth: 1, borderRadius: RADIUS.full, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center' },
});
