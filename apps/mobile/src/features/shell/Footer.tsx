/** Native footer: white payment gallery, black help panel, shared brand identity.
 * Logos are informational, not checkout switches. Checkout availability stays server-owned.
 */
import { PAYMENT_LOGOS } from '@/config/paymentLogos';
import { useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { AppText } from '@/design/ui';
import { FOOTER_THEME as PALETTE, RADIUS, OPACITY } from '@/design/tokens.mobile';
import { BrandMark } from '@/design/BrandMark';
import { responsiveMetricsFor, rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { useT } from '@/i18n';
import { useFooterInfo } from '@/api/hooks';



export interface FooterProps { testID?: string }

export function Footer({ testID = 'app-footer' }: FooterProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const gutter = responsiveMetricsFor(width).gutter;
  const t = useT();
  const footer = useFooterInfo();
  const [panel, setPanel] = useState<'contact' | 'faq' | null>(null);
  const [linkError, setLinkError] = useState(false);
  const direction = rowDirectionFor(theme.isRTL);

  return <View testID={testID}>
    <View style={[styles.payments, { paddingHorizontal: gutter }]}>
      <AppText color={PALETTE.ink} variant="h3">{t('footer.paymentTitle')}</AppText>
      <View style={[styles.badges, { flexDirection: direction }]}>
        {PAYMENT_LOGOS.map(({ name, source }) => <View key={name} style={styles.badge}>
          <Image source={source} resizeMode="contain" accessibilityLabel={name} style={styles.logo} />
        </View>)}
      </View>
      <AppText variant="caption" color={PALETTE.mutedOnPaper}>{t('footer.paymentHint')}</AppText>
    </View>

    <View style={[styles.dark, { paddingHorizontal: gutter }]}>
      <AppText color={PALETTE.paper} variant="h3">{t('footer.help')}</AppText>
      <View style={[styles.row, { flexDirection: direction }]}>
        <FooterLink label={t('footer.contact')} onPress={() => { setLinkError(false); setPanel('contact'); }} />
        <AppText color={PALETTE.muted}>·</AppText>
        <FooterLink label={t('footer.faq')} violet onPress={() => setPanel('faq')} />
      </View>
      <View style={[styles.row, { flexDirection: direction }]}>
        <FooterLink label={t('footer.privacy')} muted onPress={() => router.push('/legal/privacy')} />
        <AppText color={PALETTE.separator}>·</AppText>
        <FooterLink label={t('footer.terms')} muted onPress={() => router.push('/legal/terms')} />
      </View>
      <View style={styles.brand}><BrandMark nameSize={27} color={PALETTE.paper} /></View>
    </View>

    <Modal visible={panel !== null} transparent animationType="fade" onRequestClose={() => setPanel(null)}>
      <View style={styles.scrim}>
        <View style={[styles.dialog, { backgroundColor: theme.colors.canvas }]} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.dialogContent}>
            <AppText variant="h2">{panel === 'faq' ? t('footer.faq') : t('footer.contact')}</AppText>
            {panel === 'contact' ? <>
              {(footer.data?.channels ?? []).map(channel => <Pressable key={channel.id} accessibilityRole="link"
                accessibilityLabel={channel.label} style={styles.dialogLink}
                onPress={() => { Linking.openURL(channel.href).catch(() => setLinkError(true)); }}>
                <AppText>{channel.label}</AppText>
              </Pressable>)}
              {!footer.data?.channels.length ? <AppText>{t('footer.noContact')}</AppText> : null}
              {linkError ? <AppText accessibilityRole="alert">{t('footer.linkError')}</AppText> : null}
            </> : <>
              <AppText variant="bodyStrong">{t('footer.faqOrders')}</AppText>
              <Pressable accessibilityRole="link" style={styles.dialogLink} onPress={() => { setPanel(null); router.push('/orders'); }}>
                <AppText>{t('footer.orders')}</AppText>
              </Pressable>
              <AppText variant="bodyStrong">{t('footer.faqPayment')}</AppText>
              <AppText>{t('footer.paymentHint')}</AppText>
              <AppText variant="bodyStrong">{t('footer.faqTerms')}</AppText>
              <Pressable accessibilityRole="link" style={styles.dialogLink} onPress={() => { setPanel(null); router.push('/legal/terms'); }}>
                <AppText>{t('footer.terms')}</AppText>
              </Pressable>
            </>}
            <Pressable accessibilityRole="button" style={styles.dialogLink} onPress={() => setPanel(null)}>
              <AppText>{t('common.close')}</AppText>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}

function FooterLink({ label, onPress, violet, muted }: { label: string; onPress: () => void; violet?: boolean; muted?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [styles.link, { opacity: pressed ? OPACITY.subtle : 1 }]}>
    <AppText color={violet ? PALETTE.link : muted ? PALETTE.muted : PALETTE.paper} variant={muted ? 'caption' : 'subtitle'}>{label}</AppText>
  </Pressable>;
}

const styles = StyleSheet.create({
  payments: { backgroundColor: PALETTE.paper, paddingTop: 24, paddingBottom: 24, gap: 16 },
  badges: { flexWrap: 'wrap', gap: 8 },
  badge: { width: 60, height: 46, padding: 4, borderWidth: 1, borderColor: PALETTE.line, borderRadius: RADIUS.sm, backgroundColor: PALETTE.paper, alignItems: 'center', justifyContent: 'center' },
  logo: { width: '100%', height: '100%' },
  dark: { backgroundColor: PALETTE.ink, paddingTop: 24, paddingBottom: 32 },
  row: { alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  link: { minHeight: 44, justifyContent: 'center' },
  brand: { alignItems: 'center', paddingTop: 32, paddingBottom: 4 },
  scrim: { flex: 1, backgroundColor: PALETTE.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 440, maxHeight: '80%', borderRadius: RADIUS.lg },
  dialogContent: { padding: 24, gap: 12 },
  dialogLink: { minHeight: 44, justifyContent: 'center' },
});
