/**
 * Cover de démo : dans l'APK de démonstration, le bloc d'entrée embarque ses
 * visuels quand le CRM n'a rien publié — et une cover CRM publiée gagne.
 */
process.env.EXPO_PUBLIC_HERO_DEMO = '1';
const { COVER_DEMO_ENABLED } = require('../../src/features/home/heroDemo');
const { demoHomeCover } = require('../../src/features/home/homeCoverDemo');

describe('cover de démo (APK démonstration)', () => {
  it('fanion actif et visuels embarqués avec le titre de référence', () => {
    expect(COVER_DEMO_ENABLED).toBe(true);
    const demo = demoHomeCover();
    expect(demo.enabled).toBe(true);
    expect(demo.title).toBe('NOUVEAUTÉS\nVOTRE DOSE HEBDOMADAIRE');
    expect(demo.ctaLabel).toBe('Je découvre');
    expect(demo.slides).toHaveLength(2);
    for (const slide of demo.slides) {
      expect(slide.id.startsWith('demo-')).toBe(true);
      // Le registre d'assets renvoie un objet sous Jest, un numéro en build Expo.
      expect(slide.localImage).toBeTruthy();
      expect(slide.url).toBe('');
    }
  });
});
