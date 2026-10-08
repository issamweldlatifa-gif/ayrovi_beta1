/**
 * Accueil — باب الدخول للتطبيق.
 *
 * ── البنية المطلوبة ────────────────────────────────────────────────────────
 *  1. هيدر **شفاف** و**ثابت** فوق المحتوى (الصفحة تمرّ من تحتو): شعار — يرجّع
 *     للرئيسية — وحساب، وسلّة، وقائمة؛
 *  2. **هيرو**: مساحة إشهار (صورة أو فيديو أو كتابة، بحسب ما يبعثو الخادم)؛
 *  3. **ثلاث تبويبات** يفتحو شاشات **جوّا التطبيق**، موش صفحات في المتصفح؛
 *  4. **السكسيونات**، بترتيب الإدارة؛
 *  5. **الفوتر** بخلفية سوداء: الهوية، القنوات الرسمية، ووسائل الخلاص.
 *
 * ── شنوّا يسيّر البار السفلي ──────────────────────────────────────────────
 * تمرير هاذي الشاشة يغذّي `design/chrome`: البار ينسحب نزولاً ويرجع صعوداً.
 * أمّا **الهيدر ما يتحرّكش** — هاذا نصّ الطلب التاني.
 *
 * ── فلوس وتوفّر ────────────────────────────────────────────────────────────
 * حتى سعر ما يتحسب هنا. الأرقام الجاية من الخادم، واللي موش أكيد يتقال،
 * ما يتلزّقش بتقدير من الجهاز.
 */
import { useCallback, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/design/theme';
import { useChromeScroll } from '@/design/chrome';
import { AppHeader } from '@/features/shell/AppHeader';
import { AnnouncementBar } from '@/features/home/AnnouncementBar';
import { HeroSection } from '@/features/home/HeroSection';
import { HomeTabs } from '@/features/home/HomeTabs';
import { PublicSections } from '@/features/sections/PublicSections';
import { Footer } from '@/features/shell/Footer';
import { ErrorBlock, LoadingBlock } from '@/design/states';
import { useAnnouncements, useHeroContent, useHeroVisual } from '@/api/hooks';
import { apiUrl } from '@/api/client';

/**
 * المسافة المحجوزة فوق المحتوى.
 * الهيدر شفاف ومحطوط في `absolute`: بلا هاذي المسافة، راس الهيرو يمرّ **تحت**
 * الأيقونات ويولّي ما يقراش.
 */
const HEADER_RESERVE = 60;

export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  // Le défilement pilote la barre du bas (voir `design/chrome`) : une seule
  // décision, testée, pour tout le produit.
  const onChromeScroll = useChromeScroll();

  const hero = useHeroContent();
  const visual = useHeroVisual();
  const announcements = useAnnouncements();

  const reload = useCallback(() => {
    setRefreshing(true);
    Promise.allSettled([hero.refetch(), visual.refetch(), announcements.refetch()])
      .finally(() => setRefreshing(false));
  }, [hero, visual, announcements]);

  const openLink = useCallback((href: string) => {
    Linking.openURL(apiUrl(href)).catch(() => {});
  }, []);

  const heroLoading = hero.isPending || visual.isPending;

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.canvas }]}>
      {/* شفاف · ثابت · والصفحة تمرّ من تحتو */}
      <AppHeader />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: insets.top + HEADER_RESERVE,
          paddingBottom: theme.space[5],
        }}
        onScroll={onChromeScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={reload}
            tintColor={theme.colors.accent}
            colors={[theme.colors.accent]}
          />
        )}
      >
        <AnnouncementBar messages={announcements.data ?? []} />

        {/* الهيرو — مساحة إشهار يملاها الخادم */}
        {heroLoading ? (
          <LoadingBlock
            label={{ fr: 'Chargement du contenu…', ar: 'جارٍ تحميل المحتوى…' }}
          />
        ) : hero.isError ? (
          <ErrorBlock
            error={hero.error}
            onRetry={() => { hero.refetch(); visual.refetch(); }}
          />
        ) : (
          <HeroSection
            content={hero.data ?? null}
            visual={visual.data ?? null}
            onCta={openLink}
          />
        )}

        {/* التبويبات الثلاث — يفتحو جوّا التطبيق */}
        <HomeTabs />

        {/* أقسام الموقع — الترتيب قرار الإدارة (`home-blocks`)، موش قرارنا. */}
        <PublicSections />

        {/* الفوتر — خلفية سوداء، قنوات رسمية، ووسائل خلاص حقيقية */}
        <Footer />

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
});
