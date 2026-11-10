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
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from 'expo-router';

import { AppScreen, FullBleed } from '@/design/layout';
import { AppHeader } from '@/features/shell/AppHeader';
import { HeroCarousel } from '@/features/home/HeroCarousel';
import { HomeTabs } from '@/features/home/HomeTabs';
import { HomeCover } from '@/features/home/HomeCover';
import { StoriesSection } from '@/features/home/StoriesSection';
import { useStories, useStoriesShowcase } from '@/api/hooks';
import { LensHomeBlock } from '@/features/home/LensHomeBlock';
import { ReelsShopSection } from '@/features/home/ReelsShopSection';
import { SectionRule } from '@/design/SectionRule';
import { Footer } from '@/features/shell/Footer';
import { registerScrollToTopHandler } from '@/features/shell/scrollToTop';
import {
  useHeroCarouselSettings, useHeroSlides,
} from '@/api/hooks';
import { luminanceOfHex } from '@/features/home/heroPalette';

/**
 * Barre d'état lisible sur le fond de la photo Hero active : le header prend la
 * couleur exacte du haut de la photo, parfois sombre ⇒ icônes système claires.
 * Seulement quand l'accueil est affiché et le header au sommet ; sinon la barre
 * d'état de l'application (thème) reprend la main.
 */
function HeroStatusBar({ background }: { background: string | null }) {
  const focused = useIsFocused();
  if (!focused || background === null) return null;
  return <StatusBar style={luminanceOfHex(background) > 0.5 ? 'dark' : 'light'} />;
}

/**
 * La géométrie n'est plus calculée ici : `AppScreen` possède la zone sûre, le
 * défilement et les marges (§18.2). L'écran ne décrit plus QUE son contenu.
 *
 * La réserve haute est `insets.top + theme.chrome.header`, appliquée par la
 * primitive : l'en-tête transparent se superpose sans rien décaler.
 */
/**
 * Filet de sécurité de l'écran : si le rendu lève, expo-router affiche le repli
 * (arabe + français, bouton « عاود ») à la place de l'écran — l'application
 * reste ouverte, l'utilisateur peut revenir. Voir `src/design/AppErrorBoundary.tsx`
 * et la cause du 25/10/2026 (ordre des hooks). Toute route en a un : c'est
 * vérifié par `tests/error-boundary-coverage.test.ts`.
 */
export { RouteErrorBoundary as ErrorBoundary } from '@/design/AppErrorBoundary';

export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false);
  // Couleur de la carte Hero active : le header la reprend (en haut de page).
  const [heroBackground, setHeroBackground] = useState<string | null>(null);
  /**
   * Remontée en haut de page (re-tap sur l'onglet Accueil, mot-symbole de
   * l'en-tête) : l'écran prête sa `ScrollView` à `AppScreen` et se déclare
   * une fois au montage — l'accueil reste monté sous les onglets, la
   * déclaration vit donc tout le long de la session.
   */
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    registerScrollToTopHandler(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
    return () => registerScrollToTopHandler(null);
  }, []);

  const stories = useStories();
  const storiesShowcase = useStoriesShowcase();
  const heroSlides = useHeroSlides();
  const heroCarouselSettings = useHeroCarouselSettings();

  const reload = useCallback(() => {
    setRefreshing(true);
    Promise.allSettled([
      heroSlides.refetch(), heroCarouselSettings.refetch(), stories.refetch(), storiesShowcase.refetch(),
    ]).finally(() => setRefreshing(false));
  }, [heroSlides, heroCarouselSettings, stories, storiesShowcase]);

  return (
    <AppScreen
      // شفاف · ثابت · والصفحة تمرّ من تحتو — الـ`absolute` الوحيد المسموح (§3)
      overlayHeader={({ scrolled }) => (
        <>
          <HeroStatusBar background={scrolled ? null : heroBackground} />
          <AppHeader scrolled={scrolled} heroBackground={heroBackground} />
        </>
      )}
      // البار السفلي يضيف منطقته الآمنة لنفسو، والمحتوى ما يضيفهاش (§4.3-3)
      hasBottomBar
      // تمرير الشاشة يسيّر انسحاب البار (Q8)
      chrome
      onRefresh={reload}
      refreshing={refreshing}
      scrollRef={scrollRef}
      testID="home"
    >
      {/* الهيرو الوحيد والديناميكي : يُدار كله من Admin → Hero (بطاقات + إعدادات). */}
      <View testID="home-hero-tabs">
        <HeroCarousel
          settings={heroCarouselSettings}
          slides={heroSlides}
          onActiveBackgroundChange={setHeroBackground}
        />

        {/* التبويبات تظهر على نفس لون نهاية تدرّج الهيرو لانتقال بصري متصل. */}
        {/* التبويبات الثلاث — يفتحو جوّا التطبيق */}
        <HomeTabs />
      </View>

      {/* Cover d'accueil — médias CRM plein écran, texte et bouton posés dessus. */}
      <HomeCover />

      <SectionRule />

      <StoriesSection />

      <SectionRule />

      {/* Lens — même contenu que le site (Admin → LENS) ; le bouton ouvre Lens dans l'app. */}
      <LensHomeBlock />

      <SectionRule />

      {/* Reels • Shop — vignettes verticales ; un toucher ouvre la visionneuse plein écran. */}
      <ReelsShopSection />

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
