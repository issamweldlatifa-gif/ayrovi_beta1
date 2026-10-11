/**
 * Connexion Google native — logique pure (sans module natif).
 *
 *  • un succès rend le jeton d'identité ; une annulation n'est PAS une panne ;
 *  • un succès SANS jeton est une panne de configuration, signalée (pas devinée) ;
 *  • le code 12501 (fermeture du sélecteur) est reconnu comme annulation.
 */
import { describe, expect, it } from 'vitest';
import { GoogleConfigError, GOOGLE_CODES, isCancelCode, outcomeFromResponse } from '../src/features/auth/googleOutcome';

describe('outcomeFromResponse', () => {
  it('un succès avec jeton rend le jeton', () => {
    expect(outcomeFromResponse({ type: 'success', data: { idToken: 'a.b.c' } })).toEqual({ kind: 'token', idToken: 'a.b.c' });
  });

  it('une réponse « annulée » ne rend aucun jeton', () => {
    expect(outcomeFromResponse({ type: 'cancelled' })).toEqual({ kind: 'cancelled' });
  });

  it('transmet l’adresse et le nom du compte choisi (pour le mémoriser), sans jamais les inventer', () => {
    expect(outcomeFromResponse({
      type: 'success',
      data: { idToken: 'a.b.c', user: { email: ' essam@gmail.com ', name: 'Essam Tauatii' } },
    })).toEqual({ kind: 'token', idToken: 'a.b.c', email: 'essam@gmail.com', name: 'Essam Tauatii' });
    expect(outcomeFromResponse({ type: 'success', data: { idToken: 'a.b.c' } })).toEqual({ kind: 'token', idToken: 'a.b.c' });
  });

  it('« aucun compte mémorisé » est un résultat distinct : l’appelant ouvre alors le sélecteur', () => {
    expect(outcomeFromResponse({ type: 'noSavedCredentialFound', data: null })).toEqual({ kind: 'none' });
  });

  it('un succès sans jeton est une erreur de configuration, jamais un faux succès', () => {
    expect(() => outcomeFromResponse({ type: 'success', data: { idToken: null } })).toThrow(GoogleConfigError);
    expect(() => outcomeFromResponse({ type: 'success', data: { idToken: '   ' } })).toThrow(GoogleConfigError);
    expect(() => outcomeFromResponse({ type: 'success' })).toThrow(GoogleConfigError);
  });
});

describe('isCancelCode', () => {
  it('reconnaît 12501 comme annulation, et rien d’autre', () => {
    expect(isCancelCode(GOOGLE_CODES.cancelled)).toBe(true);
    expect(isCancelCode('12501')).toBe(true);
    expect(isCancelCode('10')).toBe(false);
    expect(isCancelCode(undefined)).toBe(false);
  });
});
