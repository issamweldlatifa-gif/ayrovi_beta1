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

import { walletArt as wallet, walletWave as wave } from './visuals';

export const WALLET_PREVIEW_BALANCE = formatMoney(0);

/**
 * Carte Wallet du profil — le visuel bleu demandé (portefeuille à deux cartes
 * superposées), posé SUR le bleu de la marque : « Wallet » se lit comme une
 * section à part entre « Mon compte » et « Résumé ».
 *
 * Lecture seule : la carte ouvre l'écran Wallet, elle n'encaisse rien et
 * n'affiche aucun solde inventé — `0.00 TND` tant que le Wallet n'est pas
 * activé.
 */
export function WalletCard({ onPress }: { onPress: () => void }) {
  const t = useT();
  const theme = useTheme();
  return <Pressable testID="account-wallet-card" accessibilityRole="link"
    accessibilityLabel={`${t('wallet.title')} · ${WALLET_PREVIEW_BALANCE} · ${t('wallet.inactive')}`}
    onPress={onPress} style={({ pressed }) => [styles.frame, pressed && { opacity: theme.opacity.subtle }]}>
    <ImageBackground source={wave} resizeMode="cover" style={[styles.card, { flexDirection: rowDirectionFor(theme.isRTL) }]}>
      <View style={styles.illustration} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <AppImage localSource={wallet} contentFit="contain" decorative background={null} style={styles.wallet} />
      </View>
      <View style={styles.details}>
        <AppText variant="bodyStrong" color={BRAND.white}>{t('wallet.title')}</AppText>
        <AppText variant="h2" color={BRAND.white}>{WALLET_PREVIEW_BALANCE}</AppText>
        <AppText variant="caption" color={BRAND.white}>{t('wallet.inactive')}</AppText>
      </View>
      <View style={styles.arrow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Ionicons name={theme.isRTL ? 'chevron-back' : 'chevron-forward'} size={theme.iconSize.sm} color={BRAND.black} />
      </View>
    </ImageBackground>
  </Pressable>;
}

const styles = StyleSheet.create({
  frame: { marginHorizontal: 12, marginBottom: 12, borderRadius: RADIUS.lg, overflow: 'hidden', backgroundColor: BRAND.black },
  card: { padding: 16, minHeight: 132, alignItems: 'center', gap: 12 },
  illustration: { justifyContent: 'center' },
  wallet: { width: 96, height: 77 },
  details: { flex: 1, minWidth: 0, gap: 2 },
  arrow: { width: 36, height: 36, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND.white },
});
