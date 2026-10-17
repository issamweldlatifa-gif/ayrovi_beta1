import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/api/errors';
import { ocerexErrorCode, parseExtraction } from '../src/api/ocerex';

describe('OCEREX — parsing', () => {
  it('extraction valide : champs lus, code inconnu → PROCESSING_ERROR', () => {
    const parsed = parseExtraction({ extractionId: 'x1', code: 'WHATEVER', supportedCurrencies: ['TND', 4] });
    expect(parsed.extractionId).toBe('x1');
    expect(parsed.code).toBe('PROCESSING_ERROR');
    expect(parsed.supportedCurrencies).toEqual(['TND']);
    expect(parsed.referencePrice).toBeNull();
  });
  it('sans identifiant ⇒ erreur, jamais une extraction vide', () => {
    expect(() => parseExtraction({ code: 'OK' })).toThrow(ApiError);
    expect(() => parseExtraction(null)).toThrow(ApiError);
  });
  it('code serveur connu est conservé', () => {
    expect(parseExtraction({ extractionId: 'x2', code: 'LOW_CONFIDENCE' }).code).toBe('LOW_CONFIDENCE');
  });
  it('resolved sans URL est ignoré', () => {
    expect(parseExtraction({ extractionId: 'x3', resolved: { title: 'a' } }).resolved).toBeNull();
  });
  it('code d’erreur: connu passe, inconnu devient PROCESSING_ERROR', () => {
    expect(ocerexErrorCode(new ApiError('http', 'x', { code: 'RESTRICTED' }))).toBe('RESTRICTED');
    expect(ocerexErrorCode(new ApiError('http', 'x', { code: 'AUTRE' }))).toBe('PROCESSING_ERROR');
    expect(ocerexErrorCode(new Error('réseau'))).toBe('PROCESSING_ERROR');
  });
});
