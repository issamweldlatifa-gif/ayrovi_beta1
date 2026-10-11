/**
 * الفوتر (الذيْل) — بناء أصلي (08/10/2026).
 *
 * المرجع **خاصية**: الموقع يعرض تذييلاً فيه هوية العلامة، قنواتها الرسمية،
 * ووسائل الخلاص اللي تقبلها الخزينة. الشكل **أصلي React Native** بأيقونات
 * التطبيق، موش نسخة من `client/src/components/Footer.tsx`.
 *
 * ثلاث قواعد أمان/صدق نقلناها من الموقع بالحرف:
 *   • قناة غير صالحة ⇒ **ما تبانتش** (موّش حساب مزيّف).
 *   • وسائل الخلاص = قائمة الخزينة (ما نوعدوش بوسيلة تترفض في آخر خطوة).
 *   • والفوتر **ما يطيّحش الشاشة**: يصغر، ما يقصفش.
 */
import { useCallback } from 'react';
import { Linking, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/design/ui';
import { responsiveMetricsFor, rowDirectionFor } from '@/design/layoutLogic';
import { useTheme } from '@/design/theme';
import { COLORS } from '@/design/tokens.generated';
import { useT } from '@/i18n';
import { APP_VERSION } from '@/config/app';
import { useFooterInfo } from '@/api/hooks';
import type { FooterChannelId } from '@/api/footer';

/** أيقونة العلامة لكل قناة — من مجموعة الأيقونات الرسمية للتطبيق. */
const CHANNEL_ICON: Record<FooterChannelId, keyof typeof Ionicons.glyphMap> = {
  facebook: 'logo-facebook',
  instagram: 'logo-instagram',
  tiktok: 'logo-tiktok',
  whatsapp: 'logo-whatsapp',
};

/** The footer intentionally uses the dark identity palette in both app themes. */
const FOOTER_COLORS = COLORS.dark;

export interface FooterProps {
  /** معرّف اختبار — الفوتر عنصر مشترك، والاختبارات تعرّفو باسم. */
  testID?: string;
}

export function Footer({ testID = 'app-footer' }: FooterProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const gutter = responsiveMetricsFor(width).gutter;
  const t = useT();
  const footer = useFooterInfo();

  const openChannel = useCallback((href: string) => {
    Linking.openURL(href).catch(() => null);
  }, []);

  const channels = footer.data?.channels ?? [];
  const methods = footer.data?.paymentMethods ?? [];
  const about = footer.data?.about ?? '';
  const year = new Date().getFullYear();

  return (
    <View
      testID={testID}
      style={[
        styles.wrap,
        {
          backgroundColor: FOOTER_COLORS.canvas,
          borderTopColor: FOOTER_COLORS.line,
          paddingHorizontal: gutter,
          paddingTop: theme.space[4],
          paddingBottom: theme.space[5],
        },
      ]}
    >
      {/* 1) الهوية */}
      <AppText variant="display" weight="semibold" color={FOOTER_COLORS.accentText} style={styles.wordmark}>
        AYROVI
      </AppText>
      <AppText variant="caption" color={FOOTER_COLORS.muted}>
        {`v${APP_VERSION} · ${t('footer.rights', { year: String(year) })}`}
      </AppText>

      {/* 2) «من نحن» — محرَّر من الإدارة؛ فارغ ⇒ القسم ما يبانش */}
      {about ? (
        <View style={styles.block}>
          <AppText variant="caption" weight="bold" color={FOOTER_COLORS.ink}>{t('footer.about')}</AppText>
          <AppText variant="caption" color={FOOTER_COLORS.muted}>{about}</AppText>
        </View>
      ) : null}

      {/* 3) القنوات الرسمية — الصالحة فقط */}
      {channels.length > 0 ? (
        <View style={styles.block}>
          <AppText variant="caption" weight="bold" color={FOOTER_COLORS.ink}>{t('footer.channels')}</AppText>
          <View style={styles.channels}>
            {channels.map((channel) => (
              <Pressable
                key={channel.id}
                accessibilityRole="button"
                accessibilityLabel={channel.label}
                onPress={() => openChannel(channel.href)}
                style={({ pressed }) => [
                  styles.channel,
                  {
                    borderColor: FOOTER_COLORS.line,
                    backgroundColor: FOOTER_COLORS.surface,
                    minWidth: theme.geometry.minTarget,
                    minHeight: theme.geometry.minTarget,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Ionicons name={CHANNEL_ICON[channel.id]} size={20} color={FOOTER_COLORS.accentText} accessibilityElementsHidden />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* 4) وسائل الخلاص: ما تقبله الخزينة؛ وما فمّاش ⇒ يُقال */}
      <View style={styles.block}>
        <AppText variant="caption" weight="bold" color={FOOTER_COLORS.ink}>{t('footer.payment')}</AppText>
        {methods.length > 0 ? (
          <View style={styles.methods}>
            {methods.map((method) => (
              <View key={method} style={[styles.method, { borderColor: FOOTER_COLORS.line }]}>
                <Ionicons name="card-outline" size={12} color={FOOTER_COLORS.muted} accessibilityElementsHidden />
                <AppText variant="caption" color={FOOTER_COLORS.muted}>{method}</AppText>
              </View>
            ))}
          </View>
        ) : (
          <AppText variant="caption" color={FOOTER_COLORS.muted}>{t('footer.noPayment')}</AppText>
        )}
      </View>

      {/* 5) وصولات نافعة — كلها شاشات موجودة فعلاً */}
      <View style={styles.block}>
        <AppText variant="caption" weight="bold" color={FOOTER_COLORS.ink}>{t('footer.useful')}</AppText>
        <View style={styles.links}>
          <FooterLink icon="person-outline" label={t('footer.account')} onPress={() => router.push('/(tabs)/account')} />
          <FooterLink icon="chatbubble-ellipses-outline" label={t('footer.assistant')} onPress={() => router.push('/assistant')} />
          <FooterLink icon="bag-outline" label={t('footer.orders')} onPress={() => router.push('/orders')} />
          <FooterLink icon="play-outline" label={t('social.reels')} onPress={() => router.push('/reels')} />
          <FooterLink icon="images-outline" label={t('social.publications')} onPress={() => router.push('/publications')} />
          <FooterLink icon="play-circle-outline" label={t('sections.stories')} onPress={() => router.push('/stories')} />
        </View>
      </View>
    </View>
  );
}

function FooterLink({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.footerLink,
        { flexDirection: rowDirectionFor(theme.isRTL), minHeight: theme.geometry.minTarget, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Ionicons name={icon} size={16} color={FOOTER_COLORS.accentText} accessibilityElementsHidden />
      <AppText variant="caption" color={FOOTER_COLORS.ink}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { borderTopWidth: 1, gap: 2 },
  wordmark: { letterSpacing: 2, marginBottom: 2 },
  block: { marginTop: 16, gap: 6 },
  channels: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  channel: {
    borderWidth: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  methods: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  method: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  links: { gap: 2 },
  footerLink: { alignItems: 'center', gap: 8 },
});
