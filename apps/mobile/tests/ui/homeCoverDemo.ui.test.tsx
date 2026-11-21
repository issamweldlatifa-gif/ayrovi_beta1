/** The APK demo should restore the Publications carousel without CRM media. */
process.env.EXPO_PUBLIC_HERO_DEMO = '1';
const { COVER_DEMO_ENABLED } = require('../../src/features/home/heroDemo');
const { demoHomeCover } = require('../../src/features/home/homeCoverDemo');

test('uses the two bundled Publications covers and the original headline', () => {
  expect(COVER_DEMO_ENABLED).toBe(true);
  const demo = demoHomeCover();
  expect(demo).toMatchObject({ enabled: true, destination: 'publications',
    title: 'NOUVEAUTÉS\nVOTRE DOSE HEBDOMADAIRE', ctaLabel: 'Je découvre' });
  expect(demo.slides).toHaveLength(2);
  for (const slide of demo.slides) {
    expect(slide.localImage).toBeTruthy();
    expect(slide.url).toBe('');
  }
});
