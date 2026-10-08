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
import { Linking } from 'react-native';

import { AppScreen, FullBleed } from '@/design/layout';
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
 * La géométrie n'est plus calculée ici : `AppScreen` possède la zone sûre, le
 * défilement et les marges (§18.2). L'écran ne décrit plus QUE son contenu.
 *
 * La réserve haute est `insets.top + theme.chrome.header`, appliquée par la
 * primitive : l'en-tête transparent se superpose sans rien décaler.
 */
export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false);

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
    <AppScreen
      // شفاف · ثابت · والصفحة تمرّ من تحتو — الـ`absolute` الوحيد المسموح (§3)
      overlayHeader={<AppHeader />}
      // البار السفلي يضيف منطقته الآمنة لنفسو، والمحتوى ما يضيفهاش (§4.3-3)
      hasBottomBar
      // تمرير الشاشة يسيّر انسحاب البار (Q8)
      chrome
      onRefresh={reload}
      refreshing={refreshing}
      testID="home"
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

      {/*
        الفوتر — خلفية سوداء عرض كامل.
        `FullBleed` يلغي هامش الشاشة بنفس القيمة اللي خلقـتو، على أي مقاس؛
        موش `marginHorizontal: -16` مكتوب باليد اللي يولّي غالط على اللوحي.
      */}
      <FullBleed>
        <Footer />
      </FullBleed>
    </AppScreen>
  );
}
