/**
 * Écrire un commentaire sur un Reel faisait tomber l'écran (11/11/2026) :
 * « undefined cannot be used as a constructor ».
 *
 * Cause : `new Intl.RelativeTimeFormat(...)` — API ABSENTE de Hermes (moteur
 * Android). Node l'a : les tests passaient, l'appareil tombait. Ces tests
 * rejouent donc la fonction AVEC l'API retirée, comme sur le téléphone, et
 * interdisent dans toute l'application les API Intl que Hermes ne fournit pas.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { relativeTimeLabel } from '@/format/relativeTime';

const NOW = Date.parse('2026-11-11T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('comme sur Hermes : Intl.RelativeTimeFormat absent', () => {
  const saved = (Intl as any).RelativeTimeFormat;
  beforeEach(() => { delete (Intl as any).RelativeTimeFormat; });
  afterEach(() => { (Intl as any).RelativeTimeFormat = saved; });

  test('ne lève plus « undefined cannot be used as a constructor »', () => {
    expect((Intl as any).RelativeTimeFormat).toBeUndefined();
    expect(() => relativeTimeLabel(ago(3 * DAY), 'fr', NOW)).not.toThrow();
    expect(() => relativeTimeLabel(ago(5 * MIN), 'ar', NOW)).not.toThrow();
    expect(() => relativeTimeLabel(ago(0), 'ar', NOW)).not.toThrow();
  });

  test('français — libellés de la référence', () => {
    expect(relativeTimeLabel(ago(10_000), 'fr', NOW)).toBe('à l’instant');
    expect(relativeTimeLabel(ago(MIN), 'fr', NOW)).toBe('il y a 1 minute');
    expect(relativeTimeLabel(ago(5 * MIN), 'fr', NOW)).toBe('il y a 5 minutes');
    expect(relativeTimeLabel(ago(3 * DAY), 'fr', NOW)).toBe('il y a 3 jours');
    expect(relativeTimeLabel(ago(7 * DAY), 'fr', NOW)).toBe('il y a 1 semaine');
    expect(relativeTimeLabel(ago(60 * DAY), 'fr', NOW)).toBe('il y a 2 mois');
    expect(relativeTimeLabel(ago(400 * DAY), 'fr', NOW)).toBe('il y a 1 an');
  });

  test('arabe — singulier, duel, pluriel, 11+', () => {
    expect(relativeTimeLabel(ago(10_000), 'ar', NOW)).toBe('الآن');
    expect(relativeTimeLabel(ago(MIN), 'ar', NOW)).toBe('منذ دقيقة');
    expect(relativeTimeLabel(ago(2 * HOUR), 'ar', NOW)).toBe('منذ ساعتين');
    expect(relativeTimeLabel(ago(3 * DAY), 'ar', NOW)).toBe('منذ 3 أيام');
    expect(relativeTimeLabel(ago(14 * DAY), 'ar', NOW)).toBe('منذ أسبوعين');
    expect(relativeTimeLabel(ago(15 * MIN), 'ar', NOW)).toBe('منذ 15 دقيقة');
    expect(relativeTimeLabel(ago(11 * 30 * DAY), 'ar', NOW)).toBe('منذ 11 شهرًا');
    expect(relativeTimeLabel(ago(800 * DAY), 'ar-TN', NOW)).toBe('منذ سنتين');
  });

  test('date future (horloge du téléphone en retard) → « maintenant », date invalide → vide', () => {
    expect(relativeTimeLabel(new Date(NOW + 5 * MIN).toISOString(), 'fr', NOW)).toBe('à l’instant');
    expect(relativeTimeLabel('pas-une-date', 'fr', NOW)).toBe('');
  });
});

describe('garde-fou : aucune API Intl absente de Hermes dans l’application', () => {
  // Hermes (Android) fournit Collator, DateTimeFormat, NumberFormat — pas le reste.
  const FORBIDDEN = /\bIntl\.(RelativeTimeFormat|PluralRules|ListFormat|Segmenter|DisplayNames|Locale)\b/;

  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return files(full);
      return /\.(ts|tsx)$/.test(name) ? [full] : [];
    });
  }

  test('src/ n’instancie aucune de ces API', () => {
    const offenders = files(join(__dirname, '..', 'src'))
      .filter((file) => readFileSync(file, 'utf8')
        .split('\n')
        .some((line) => !/^\s*(\*|\/\/)/.test(line) && FORBIDDEN.test(line)));
    expect(offenders).toEqual([]);
  });
});
