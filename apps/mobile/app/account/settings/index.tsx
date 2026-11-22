import { useState } from 'react';
import { Linking, Platform, Share } from 'react-native';
import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import { AppText } from '@/design/ui';
import { useTheme } from '@/design/theme';
import { APP_VERSION } from '@/config/app';
import { useT } from '@/i18n';
import { usePrefs } from '@/state/prefs';
import { useSession } from '@/state/session';
import { PersonalLayout } from '@/features/personal/PersonalLayout';
import { SettingsGroup, SettingsRow, SettingsSwitch } from '@/features/settings/SettingsRows';
import { notificationChannels, useNotificationSettings } from '@/features/settings/notificationSettings';
import { storeListing } from '@/features/settings/listing';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function AppSettings() {
  const t = useT(); const theme = useTheme();
  const { status, account } = useSession();
  const { locale, themeMode, videoAutoplay, setVideoAutoplay, autoplayWifiOnly, setAutoplayWifiOnly } = usePrefs();
  const owner = status === 'signedIn' ? account?.id : undefined;
  const notifications = useNotificationSettings(owner);
  const [failed, setFailed] = useState(false);
  const listing = storeListing(process.env.EXPO_PUBLIC_APP_STORE_URL, Platform.OS);
  const build = Platform.OS === 'android' ? Constants.expoConfig?.android?.versionCode : Constants.expoConfig?.ios?.buildNumber;
  const count = notifications.data && notificationChannels.filter(channel => notifications.data[channel.key]).length;
  const go = (path: string) => () => router.push(path as Href);
  const external = (action: () => Promise<unknown>) => { setFailed(false); void action().catch(() => setFailed(true)); };
  return <PersonalLayout title={t('settings.title')} fallback="/(tabs)/account">
    <SettingsGroup title={t('settings.deviceGroup')}>
      <SettingsRow title={t('addresses.tunisia')} description={t('settings.market')} icon="globe-outline" divided />
      <SettingsRow title={t('common.language')} description={t(`language.${locale}`)} icon="language-outline" onPress={go('/account/settings/language')} divided />
      <SettingsRow title={t('settings.appearance')} description={t(`theme.${themeMode}`)} icon="contrast-outline" onPress={go('/account/settings/appearance')} divided />
      <SettingsSwitch title={t('settings.autoplay')} description={t('settings.autoplayHint')} icon="play-circle-outline" value={videoAutoplay} onChange={setVideoAutoplay} divided={videoAutoplay} />
      {videoAutoplay ? <SettingsSwitch title={t('settings.wifiOnly')} description={t('settings.wifiOnlyHint')} icon="wifi-outline" value={autoplayWifiOnly} onChange={setAutoplayWifiOnly} /> : null}
    </SettingsGroup>
    <SettingsGroup title={t('settings.communicationGroup')}>
      <SettingsRow title={t('settings.notifications')} icon="notifications-outline"
        description={typeof count === 'number' ? t('settings.channelCount', { count, total: notificationChannels.length }) : undefined}
        onPress={go('/account/preferences')} divided />
      <SettingsRow title={t('settings.newsletter')} icon="mail-outline" onPress={go('/account/settings/newsletter')} />
    </SettingsGroup>
    <SettingsGroup title={t('account.hub.privacy')}>
      <SettingsRow title={t('auth.legal.privacy')} icon="shield-checkmark-outline" onPress={go('/legal/privacy')} divided />
      <SettingsRow title={t('settings.tracking')} icon="analytics-outline" onPress={go('/account/settings/tracking')} />
    </SettingsGroup>
    <SettingsGroup title={t('settings.helpGroup')}>
      {listing ? <SettingsRow title={t('settings.rate')} icon="star-outline" onPress={() => external(() => Linking.openURL(listing))} divided /> : null}
      <SettingsRow title={t(listing ? 'settings.shareApp' : 'settings.shareBrand')} icon="share-social-outline" onPress={() => external(() => Share.share({ message: `ZAYROVI\n${listing ?? 'https://zayrovi.com/'}` }))} divided />
      <SettingsRow title={t('settings.feedback')} icon="chatbubble-ellipses-outline" onPress={go('/account/settings/support')} />
    </SettingsGroup>
    {failed ? <AppText accessibilityRole="alert" color={theme.status.danger.fg}>{t('settings.actionFailed')}</AppText> : null}
    <AppText variant="caption" align="center" color={theme.colors.muted}>{t('settings.version', { version: build ? `${APP_VERSION} (${build})` : APP_VERSION })}</AppText>
  </PersonalLayout>;
}
