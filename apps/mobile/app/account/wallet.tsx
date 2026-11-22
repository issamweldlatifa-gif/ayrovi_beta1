import { ImageBackground, StyleSheet } from 'react-native';
import { AppText } from '@/design/ui';
import { AppImage } from '@/design/appImage';
import { BRAND } from '@/design/tokens.generated';
import { RADIUS } from '@/design/tokens.mobile';
import { PersonalGuest, PersonalLayout } from '@/features/personal/PersonalLayout';
import { WALLET_PREVIEW_BALANCE } from '@/features/wallet/WalletCard';
import { walletArt, walletWave } from '@/features/wallet/visuals';
import { useT } from '@/i18n';
import { useSession } from '@/state/session';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

/**
 * Wallet — lecture seule. Le solde reste à `0.00 TND` tant que le Wallet n'est
 * pas activé : aucun montant n'est inventé, aucun bouton de recharge n'est
 * proposé (la recharge viendra quand le branchement sera décidé).
 */
export default function WalletScreen() {
  const t = useT();
  const { status } = useSession();
  return <PersonalLayout title={t('wallet.title')} fallback="/(tabs)/account">
    {status === 'signedIn' ? <>
      <ImageBackground source={walletWave} resizeMode="cover" style={styles.hero}>
        <AppImage localSource={walletArt} contentFit="contain" decorative background={null} style={styles.art} />
        <AppText variant="bodyStrong" color={BRAND.white}>{t('wallet.balance')}</AppText>
        <AppText variant="h2" color={BRAND.white}>{WALLET_PREVIEW_BALANCE}</AppText>
        <AppText variant="caption" color={BRAND.white}>{t('wallet.inactive')}</AppText>
      </ImageBackground>
      <AppText variant="body">{t('wallet.description')}</AppText>
    </> : <PersonalGuest loading={status === 'loading'} />}
  </PersonalLayout>;
}

const styles = StyleSheet.create({
  hero: { padding: 20, borderRadius: RADIUS.lg, overflow: 'hidden', alignItems: 'center', gap: 6 },
  art: { width: 180, height: 144, marginBottom: 6 },
});
