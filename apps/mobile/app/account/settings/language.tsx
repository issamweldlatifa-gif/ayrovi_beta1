import { View } from 'react-native';
import { usePrefs } from '@/state/prefs';
import { useT } from '@/i18n';
import { PersonalLayout } from '@/features/personal/PersonalLayout';
import { SettingsRow } from '@/features/settings/SettingsRows';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function LanguageSettings() {
  const t = useT(); const { locale, setLocale } = usePrefs();
  return <PersonalLayout title={t('settings.chooseLanguage')} fallback="/account/settings">
    <View>{(['fr', 'ar'] as const).map(value => <SettingsRow key={value} checked={locale === value} title={t(`language.${value}`)} divided onPress={() => setLocale(value)} />)}</View>
  </PersonalLayout>;
}
