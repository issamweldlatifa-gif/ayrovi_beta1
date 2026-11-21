import { ImageBackground, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppImage } from '@/design/appImage';
import { rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { BRAND } from '@/design/tokens.generated';
import { RADIUS } from '@/design/tokens.mobile';
import { AppText } from '@/design/ui';
import { formatMoney } from '@/format/money';
import { useT } from '@/i18n';

const wave = require('../../../assets/images/account-wallet-wave.webp');
const wallet = require('../../../assets/images/account-wallet-art.webp');

export const WALLET_PREVIEW_BALANCE = formatMoney(0);

/** Opens a read-only wallet screen, not a recharge or payment flow. */
export function WalletCard({ onPress }: { onPress: () => void }) {
  const t = useT();
  const theme = useTheme();
  return <Pressable testID="account-wallet-card" accessibilityRole="link"
    accessibilityLabel={`${t('wallet.title')} · ${WALLET_PREVIEW_BALANCE} · ${t('wallet.inactive')}`}
    onPress={onPress} style={({ pressed }) => [styles.frame, pressed && { opacity: theme.opacity.subtle }]}>
    <ImageBackground source={wave} resizeMode="stretch" style={[styles.card, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
      <View style={styles.illustration} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <AppImage localSource={wallet} contentFit="contain" decorative background={null} style={styles.wallet} />
      </View>
      <View style={styles.details}>
        <AppText variant="bodyStrong" color={BRAND.black}>{t('wallet.title')}</AppText>
        <AppText variant="h2" color={BRAND.black}>{WALLET_PREVIEW_BALANCE}</AppText>
        <AppText variant="caption" color={BRAND.black}>{t('wallet.inactive')}</AppText>
      </View>
      <View style={styles.arrow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Ionicons name={theme.isRTL ? 'chevron-back' : 'chevron-forward'} size={theme.iconSize.sm} color={BRAND.white} />
      </View>
    </ImageBackground>
  </Pressable>;
}

const styles = StyleSheet.create({
  frame: { marginHorizontal: 12, marginBottom: 12, borderRadius: RADIUS.lg, overflow: 'hidden', backgroundColor: BRAND.lightGray },
  card: { padding: 12, minHeight: 100, alignItems: 'center', gap: 8 },
  illustration: { borderEndWidth: StyleSheet.hairlineWidth, borderEndColor: BRAND.black, paddingEnd: 8 },
  wallet: { width: 60, height: 60 },
  details: { flex: 1, minWidth: 0, gap: 4 },
  arrow: { width: 36, height: 36, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND.black },
});
