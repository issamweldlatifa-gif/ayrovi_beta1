import { useState } from 'react';
import { goBack } from '@/design/navigation';
import { AppText, Button } from '@/design/ui';
import { useT } from '@/i18n';
import { usePrefs } from '@/state/prefs';
import { PersonalLayout } from '@/features/personal/PersonalLayout';
import { SettingsRow, SettingsSwitch } from '@/features/settings/SettingsRows';

export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function TrackingSettings() {
  const t = useT(); const { optionalAnalytics, setOptionalAnalytics } = usePrefs();
  const [draft, setDraft] = useState<boolean | null>(null);
  return <PersonalLayout title={t('settings.tracking')} fallback="/account/settings"
    footer={<Button size="lg" block label={t('settings.save')} onPress={() => { if (draft !== null) setOptionalAnalytics(draft); goBack('/account/settings'); }} />}>
    <AppText>{t('settings.trackingIntro')}</AppText>
    <SettingsRow title={t('settings.essential')} description={t('settings.essentialHint')} divided />
    <SettingsSwitch title={t('settings.analytics')} description={t('settings.analyticsHint')} value={draft ?? optionalAnalytics} onChange={setDraft} />
    <SettingsRow title={t('settings.ads')} description={t('settings.adsHint')} />
  </PersonalLayout>;
}
