/**
 * Cartes de démonstration embarquées dans l'APK (visuels locaux, 4:5).
 * Voir `heroDemo.ts` pour l'activation et la règle de priorité.
 */
import type { HeroSlide } from '@/api/public';
import { HERO_DEMO_BACKGROUND } from '@/design/tokens.mobile';

export function demoHeroSlides(): HeroSlide[] {
  return [
    {
      id: 'demo-tech',
      image: '',
      localImage: require('../../../assets/hero/hero-tech.jpg'),
      title: 'Tech & gadgets',
      titleAr: 'تكنولوجيا وإكسسوارات',
      subtitle: 'Écouteurs, montres et smartphones',
      subtitleAr: 'سماعات وساعات وهواتف',
      cta: 'Découvrir',
      ctaAr: 'اكتشف',
      href: '/catalog',
      destinationType: 'catalog',
      background: HERO_DEMO_BACKGROUND.tech,
      dominant: HERO_DEMO_BACKGROUND.tech,
    },
    {
      id: 'demo-mode-homme',
      image: '',
      localImage: require('../../../assets/hero/hero-mode-homme.jpg'),
      title: 'Mode homme',
      titleAr: 'موضة رجالية',
      subtitle: 'Vestes, chemises et plus',
      subtitleAr: 'جاكيتات وقمصان والمزيد',
      cta: 'Voir la collection',
      ctaAr: 'شوف المجموعة',
      href: '/catalog',
      destinationType: 'catalog',
      background: HERO_DEMO_BACKGROUND.modeHomme,
      dominant: HERO_DEMO_BACKGROUND.modeHomme,
    },
    {
      id: 'demo-mode-femme',
      image: '',
      localImage: require('../../../assets/hero/hero-mode-femme.jpg'),
      title: 'Mode femme',
      titleAr: 'موضة نسائية',
      subtitle: "Robes et tenues d'été",
      subtitleAr: 'فساتين وإطلالات صيفية',
      cta: 'Voir la collection',
      ctaAr: 'شوف المجموعة',
      href: '/catalog',
      destinationType: 'catalog',
      background: HERO_DEMO_BACKGROUND.modeFemme,
      dominant: HERO_DEMO_BACKGROUND.modeFemme,
    },
    {
      id: 'demo-sport',
      image: '',
      localImage: require('../../../assets/hero/hero-sport.jpg'),
      title: 'Sport & bien-être',
      titleAr: 'رياضة ولياقة',
      subtitle: 'Baskets et équipements',
      subtitleAr: 'أحذية وأدوات رياضية',
      cta: 'Découvrir',
      ctaAr: 'اكتشف',
      href: '/promotions',
      destinationType: 'promotions',
      background: HERO_DEMO_BACKGROUND.sport,
      dominant: HERO_DEMO_BACKGROUND.sport,
    },
  ];
}
