/**
 * Accueil — باب الدخول للتطبيق.
 *
 * ── البنية المطلوبة ────────────────────────────────────────────────────────
 *  1. هيدر **ثابت**، شفاف عند الأعلى ويأخذ سطح الثيم بعد التمرير؛ فيه شعار
 *     يرجّع للرئيسية، وحساب وسلّة وقائمة؛
 *  2. **هيرو**: مساحة إشهار (صورة أو فيديو أو كتابة، بحسب ما يبعثو الخادم)؛
 *  3. **ثلاث تبويبات** يفتحو شاشات **جوّا التطبيق**، موش صفحات في المتصفح؛
 *  4. **الفوتر** بخلفية سوداء: الهوية، القنوات الرسمية، ووسائل الخلاص.
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

import { AppScreen, FullBleed } from '@/design/layout';
import { AppHeader } from '@/features/shell/AppHeader';
import { HeroCarousel } from '@/features/home/HeroCarousel';
import { HomeTabs } from '@/features/home/HomeTabs';
import { Footer } from '@/features/shell/Footer';
import {
  useHeroCarouselSettings, useHeroSlides,
} from '@/api/hooks';

/**
 * La géométrie n'est plus calculée ici : `AppScreen` possède la zone sûre, le
 * défilement et les marges (§18.2). L'écran ne décrit plus QUE son contenu.
 *
 * La réserve haute est `insets.top + theme.chrome.header`, appliquée par la
 * primitive : l'en-tête transparent se superpose sans rien décaler.
 */
export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false);
  // Couleur de la carte Hero active : le header la reprend (en haut de page).
  const [heroBackground, setHeroBackground] = useState<string | null>(null);

  const heroSlides = useHeroSlides();
  const heroCarouselSettings = useHeroCarouselSettings();

  const reload = useCallback(() => {
    setRefreshing(true);
    Promise.allSettled([
      heroSlides.refetch(), heroCarouselSettings.refetch(),
    ]).finally(() => setRefreshing(false));
  }, [heroSlides, heroCarouselSettings]);

  return (
    <AppScreen
      // شفاف · ثابت · والصفحة تمرّ من تحتو — الـ`absolute` الوحيد المسموح (§3)
      overlayHeader={({ scrolled }) => <AppHeader scrolled={scrolled} heroBackground={heroBackground} />}
      // البار السفلي يضيف منطقته الآمنة لنفسو، والمحتوى ما يضيفهاش (§4.3-3)
      hasBottomBar
      // تمرير الشاشة يسيّر انسحاب البار (Q8)
      chrome
      onRefresh={reload}
      refreshing={refreshing}
      testID="home"
    >
      {/* الهيرو الوحيد والديناميكي : يُدار كله من Admin → Hero (بطاقات + إعدادات). */}
      <HeroCarousel
        settings={heroCarouselSettings}
        slides={heroSlides}
        onActiveBackgroundChange={setHeroBackground}
      />

      {/* التبويبات الثلاث — يفتحو جوّا التطبيق */}
      <HomeTabs />

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
