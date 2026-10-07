/**
 * Accueil — contenu réel du serveur (phase P1).
 *
 * Trois sections, chacune avec son propre état : une section qui échoue ne fait
 * pas tomber les autres, et le tirer-pour-rafraîchir relance l'ensemble.
 *
 * Le diagnostic de construction reste en bas : c'est le repère qui permet de
 * savoir quelle version tourne réellement sur l'appareil.
 */
import { useCallback, useState } from 'react';
import { Linking } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, KeyValue, Screen } from '@/design/ui';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/design/states';
import { AnnouncementBar } from '@/features/home/AnnouncementBar';
import { HeroSection } from '@/features/home/HeroSection';
import { NavStrip } from '@/features/home/NavStrip';
import { useAnnouncements, useHeroContent, useHeroVisual, useNavigation } from '@/api/hooks';
import { apiUrl } from '@/api/client';
import { useI18n, useT } from '@/i18n';
import { useTheme } from '@/design/theme';
import { usePrefs } from '@/state/prefs';
import { APP_IDENTIFIER, APP_VERSION, APP_VERSION_CODE, BUILD_STAMP } from '@/config/app';

export default function HomeScreen() {
  const theme = useTheme();
  const t = useT();
  const { locale } = useI18n();
  const { themeMode } = usePrefs();
  const [refreshing, setRefreshing] = useState(false);

  const hero = useHeroContent();
  const visual = useHeroVisual();
  const navigation = useNavigation();
  const announcements = useAnnouncements();

  const reload = useCallback(() => {
    setRefreshing(true);
    Promise.allSettled([
      hero.refetch(), visual.refetch(), navigation.refetch(), announcements.refetch(),
    ]).finally(() => setRefreshing(false));
  }, [hero, visual, navigation, announcements]);

  const openLink = useCallback((href: string) => {
    Linking.openURL(apiUrl(href)).catch(() => {});
  }, []);

  // Les routes du site (`/arrivage`, `/lens`…) n'ont pas d'écran natif en P1 :
  // on ouvre le site, jamais une page blanche dans l'application.
  const heroLoading = hero.isPending || visual.isPending;

  return (
    <Screen tab="home" phase="P1" onRefresh={reload} refreshing={refreshing}>
      <AnnouncementBar messages={announcements.data ?? []} />

      {heroLoading ? (
        <LoadingBlock label={{ fr: 'Chargement du contenu…', ar: 'جارٍ تحميل المحتوى…' }} />
      ) : hero.isError ? (
        <ErrorBlock error={hero.error} onRetry={() => { hero.refetch(); visual.refetch(); }} />
      ) : (
        <HeroSection content={hero.data ?? null} visual={visual.data ?? null} onCta={openLink} />
      )}

      {/* Barre de navigation publique : masquée si l'Admin a tout désactivé. */}
      {navigation.isError ? (
        <EmptyBlock>
          {locale === 'ar' ? 'شريط التنقّل غير متوفّر توّا.' : 'La barre de navigation est indisponible.'}
        </EmptyBlock>
      ) : (
        <NavStrip links={navigation.data ?? []} />
      )}

      {/* المساعد: باب حقيقي من الرئيسية — والجاهزية تتقال داخل الشاشة. */}
      <Card title={t('assistant.title')} hint={t('assistant.hint')}>
        <Button label={t('assistant.open')} onPress={() => router.push('/assistant')} />
      </Card>

      <Card title={t('home.diagnostics')} hint={t('home.diagnostics.body')}>
        <KeyValue label={t('common.version')} value={`${APP_VERSION} (${APP_VERSION_CODE})`} />
        <KeyValue label={t('common.build')} value={BUILD_STAMP} />
        <KeyValue label={t('common.identity')} value={`${theme.identity.name} · ${theme.identity.version}`} />
        <KeyValue label="ID" value={APP_IDENTIFIER} />
        <KeyValue label={t('common.language')} value={locale} />
        <KeyValue label={t('common.theme')} value={`${theme.mode} · ${themeMode}`} />
      </Card>

    </Screen>
  );
}
