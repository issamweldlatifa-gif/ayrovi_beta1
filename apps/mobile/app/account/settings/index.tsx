import { useState } from 'react';
import { Linking, Platform, Share, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { APP_VERSION } from '@/config/app';
import { useT } from '@/i18n';
import { usePrefs } from '@/state/prefs';
import { useSession } from '@/state/session';
import { PersonalLayout } from '@/features/personal/PersonalLayout';
import { OrderHelp } from '@/features/orders/OrderLayout';
import { SettingsRow, SettingsSwitch } from '@/features/settings/SettingsRows';
import { notificationChannels, useNotificationSettings } from '@/features/settings/notificationSettings';
import { storeListing } from '@/features/settings/listing';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function AppSettings() {
  const t = useT(); const theme = useTheme();
  const { status, account } = useSession();
  const { locale, themeMode, videoAutoplay, setVideoAutoplay, autoplayWifiOnly, setAutoplayWifiOnly } = usePrefs();
  const owner = status === 'signedIn' ? account?.id : undefined;
  const notifications = useNotificationSettings(owner);
  const [feedback, setFeedback] = useState(false);
  const [failed, setFailed] = useState(false);
  const listing = storeListing(process.env.EXPO_PUBLIC_APP_STORE_URL, Platform.OS);
  const build = Platform.OS === 'android' ? Constants.expoConfig?.android?.versionCode : Constants.expoConfig?.ios?.buildNumber;
  const count = notifications.data && notificationChannels.filter(channel => notifications.data[channel.key]).length;
  const go = (path: string) => () => router.push(path as Href);
  const external = (action: () => Promise<unknown>) => { setFailed(false); void action().catch(() => setFailed(true)); };
  return <PersonalLayout title={t('settings.title')} fallback="/(tabs)/account">
    <View>
      <SettingsRow title={t('addresses.tunisia')} description={t('settings.market')} icon="globe-outline" />
      <SettingsRow title={t('common.language')} description={t(`language.${locale}`)} onPress={go('/account/settings/language')} />
      <SettingsRow title={t('settings.appearance')} description={t(`theme.${themeMode}`)} onPress={go('/account/settings/appearance')} />
      <SettingsRow title={t('settings.notifications')}
        description={typeof count === 'number' ? t('settings.channelCount', { count, total: notificationChannels.length }) : undefined}
        onPress={go('/account/preferences')} />
      <SettingsSwitch title={t('settings.autoplay')} description={t('settings.autoplayHint')} value={videoAutoplay} onChange={setVideoAutoplay} />
      {videoAutoplay ? <SettingsSwitch title={t('settings.wifiOnly')} description={t('settings.wifiOnlyHint')} value={autoplayWifiOnly} onChange={setAutoplayWifiOnly} /> : null}
    </View>
    <View style={[styles.group, { borderColor: theme.colors.line }]}>
      <SettingsRow title={t('settings.newsletter')} onPress={go('/account/settings/newsletter')} divided />
      <SettingsRow title={t('auth.legal.privacy')} onPress={go('/legal/privacy')} />
      <SettingsRow title={t('settings.tracking')} onPress={go('/account/settings/tracking')} />
    </View>
    <View style={[styles.group, { borderColor: theme.colors.line }]}>
      {listing ? <SettingsRow title={t('settings.rate')} onPress={() => external(() => Linking.openURL(listing))} /> : null}
      <SettingsRow title={t(listing ? 'settings.shareApp' : 'settings.shareBrand')} onPress={() => external(() => Share.share({ message: `ZAYROVI\n${listing ?? 'https://zayrovi.com/'}` }))} />
      <SettingsRow title={t('settings.feedback')} onPress={() => setFeedback(true)} />
    </View>
    {failed ? <AppText accessibilityRole="alert" color={theme.status.danger.fg}>{t('settings.actionFailed')}</AppText> : null}
    <AppText variant="caption" align="center" color={theme.colors.muted}>{t('settings.version', { version: build ? `${APP_VERSION} (${build})` : APP_VERSION })}</AppText>
    {feedback ? <OrderHelp title={t('settings.feedback')} hint={t('settings.feedbackHint')} showPolicy={false} onClose={() => setFeedback(false)} /> : null}
  </PersonalLayout>;
}

const styles = StyleSheet.create({ group: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth } });
