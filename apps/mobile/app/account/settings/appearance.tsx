import { View } from 'react-native';
import { usePrefs } from '@/state/prefs';
import { useT } from '@/i18n';
import { PersonalLayout } from '@/features/personal/PersonalLayout';
import { SettingsRow } from '@/features/settings/SettingsRows';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function AppearanceSettings() {
  const t = useT(); const { themeMode, setThemeMode } = usePrefs();
  return <PersonalLayout title={t('settings.appearance')} fallback="/account/settings">
    <View>{(['system', 'light', 'dark'] as const).map(value => <SettingsRow key={value} checked={themeMode === value} title={t(`theme.${value}`)} divided onPress={() => setThemeMode(value)} />)}</View>
  </PersonalLayout>;
}
