import { describe, expect, it } from 'vitest';
import { emptyDemo, loyaltyProgress, missions, updateDemo } from '../src/features/loyalty/loyaltyDemo';

describe('ZAYROVI Plus preview points', () => {
  it('starts at Light and counts each mission once', () => {
    expect(loyaltyProgress(emptyDemo)).toMatchObject({ points: 0, pending: 0, index: 0, progress: 0 });
    const mission = { type: 'mission', id: 'sizes' } as const;
    const state = updateDemo(emptyDemo, mission);
    expect(updateDemo(state, mission)).toBe(state);
    expect(loyaltyProgress(state)).toMatchObject({ points: 50, progress: 0.5 });
  });

  it('only grants purchase and opted-in booster points once confirmed, and excludes returned orders', () => {
    const booster = updateDemo(emptyDemo, { type: 'booster' });
    expect(updateDemo(booster, { type: 'booster' })).toBe(booster);
    const pending = updateDemo(booster, { type: 'purchase' });
    expect(loyaltyProgress(pending)).toMatchObject({ pending: 60, points: 0 });
    const confirmed = updateDemo(pending, { type: 'confirm' });
    expect(loyaltyProgress(confirmed)).toMatchObject({ pending: 0, points: 60 });
    expect(updateDemo(confirmed, { type: 'confirm' })).toBe(confirmed);
    const returned = updateDemo(pending, { type: 'return' });
    expect(loyaltyProgress(returned)).toMatchObject({ pending: 0, points: 0 });
    expect(updateDemo(returned, { type: 'confirm' })).toBe(returned);
    const withoutBooster = updateDemo(emptyDemo, { type: 'purchase' });
    expect(updateDemo(withoutBooster, { type: 'booster' })).toBe(withoutBooster);
    expect(loyaltyProgress(withoutBooster).pending).toBe(40);
  });

  it('changes tier at the confirmed thresholds and can be reset without side effects', () => {
    const actions = missions.reduce((state, { id }) => updateDemo(state, { type: 'mission', id }), emptyDemo);
    expect(loyaltyProgress(actions)).toMatchObject({ points: 170, index: 1, progress: 0.7 });
    const pending = updateDemo(actions, { type: 'purchase' });
    expect(loyaltyProgress(pending).index).toBe(1);
    const confirmed = updateDemo(pending, { type: 'confirm' });
    expect(loyaltyProgress(confirmed)).toMatchObject({ points: 210, index: 2, progress: 1 });
    expect(updateDemo(confirmed, { type: 'reset' })).toBe(emptyDemo);
  });
});
