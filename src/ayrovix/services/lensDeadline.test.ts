import { describe, expect, it, vi, afterEach } from 'vitest';
import { lensAnalyzeDeadlineMs, armLensDeadline, LENS_ANALYZE_DEADLINE_DEFAULT_MS, LENS_ANALYZE_DEADLINE_MIN_MS, LENS_ANALYZE_DEADLINE_MAX_MS } from './lensDeadline';

describe('lensAnalyzeDeadlineMs', () => {
  it('utilise la valeur par défaut sans variable', () => {
    expect(lensAnalyzeDeadlineMs({} as NodeJS.ProcessEnv)).toBe(LENS_ANALYZE_DEADLINE_DEFAULT_MS);
  });
  it('ignore une valeur invalide', () => {
    expect(lensAnalyzeDeadlineMs({ AYROVI_LENS_ANALYZE_DEADLINE_MS: 'abc' } as any)).toBe(LENS_ANALYZE_DEADLINE_DEFAULT_MS);
    expect(lensAnalyzeDeadlineMs({ AYROVI_LENS_ANALYZE_DEADLINE_MS: '-5' } as any)).toBe(LENS_ANALYZE_DEADLINE_DEFAULT_MS);
  });
  it('borne la valeur entre le minimum et le maximum', () => {
    expect(lensAnalyzeDeadlineMs({ AYROVI_LENS_ANALYZE_DEADLINE_MS: '1000' } as any)).toBe(LENS_ANALYZE_DEADLINE_MIN_MS);
    expect(lensAnalyzeDeadlineMs({ AYROVI_LENS_ANALYZE_DEADLINE_MS: '999999' } as any)).toBe(LENS_ANALYZE_DEADLINE_MAX_MS);
    expect(lensAnalyzeDeadlineMs({ AYROVI_LENS_ANALYZE_DEADLINE_MS: '30000' } as any)).toBe(30000);
  });
});

describe('armLensDeadline', () => {
  afterEach(() => { vi.useRealTimers(); });
  it('déclenche le délai après la durée prévue', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    armLensDeadline(20_000, onTimeout);
    vi.advanceTimersByTime(19_999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
  it('peut être annulé quand la réponse arrive à temps', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const cancel = armLensDeadline(20_000, onTimeout);
    cancel();
    vi.advanceTimersByTime(60_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
