/** The demo delegates its artwork and localized copy to the Social Shopping card. */
process.env.EXPO_PUBLIC_HERO_DEMO = '1';
const { COVER_DEMO_ENABLED } = require('../../src/features/home/heroDemo');
const { demoHomeCover } = require('../../src/features/home/homeCoverDemo');

describe('cover de démo (APK démonstration)', () => {
  it('active le fallback Social Shopping sans imposer de texte ni de média distant', () => {
    expect(COVER_DEMO_ENABLED).toBe(true);
    expect(demoHomeCover()).toMatchObject({
      enabled: true,
      destination: 'social',
      title: '', // Laisser le composant utiliser la langue de l’application.
      ctaLabel: '',
      slides: [], // Laisser le composant choisir le visuel embarqué.
    });
  });
});
