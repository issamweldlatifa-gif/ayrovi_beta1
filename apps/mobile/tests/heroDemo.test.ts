/**
 * Mode démo du carrousel Hero — isolation des cartes embarquées.
 */
import { describe, expect, it } from 'vitest';
import { HERO_DEMO_ENABLED, isDemoSlide } from '../src/features/home/heroDemo';

describe('mode démo Hero', () => {
  it('est désactivé hors APK de démo (flag absent en test)', () => {
    expect(HERO_DEMO_ENABLED).toBe(false);
  });

  it('reconnaît les cartes embarquées sans toucher aux cartes du serveur', () => {
    expect(isDemoSlide('demo-tech')).toBe(true);
    expect(isDemoSlide('hs_12')).toBe(false);
    expect(isDemoSlide('')).toBe(false);
  });
});
