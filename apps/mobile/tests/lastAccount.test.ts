/**
 * Compte mémorisé (« Continuer avec ce compte ») — logique pure.
 *
 *  • seul un fournisseur, une adresse et un nom sont rangés : jamais de jeton ;
 *  • un contenu illisible ou incomplet ne produit AUCUN compte (rien n'est deviné) ;
 *  • oublier le compte le retire réellement du coffre.
 */
import { describe, expect, it } from 'vitest';
import {
  LAST_ACCOUNT_KEY, forgetLastAccount, loadLastAccount, parseLastAccount, rememberLastAccount,
} from '../src/features/auth/lastAccount';
import { memoryBackend } from '../src/state/sessionStore';

describe('parseLastAccount', () => {
  it('relit un compte Google avec son nom', () => {
    expect(parseLastAccount(JSON.stringify({ provider: 'google', email: 'a@gmail.com', name: 'Issa' })))
      .toEqual({ provider: 'google', email: 'a@gmail.com', name: 'Issa' });
  });

  it('relit un compte par code e-mail', () => {
    expect(parseLastAccount(JSON.stringify({ provider: 'email', email: 'a@ex.tn' })))
      .toEqual({ provider: 'email', email: 'a@ex.tn' });
  });

  it('rejette ce qui n’est pas exactement attendu', () => {
    expect(parseLastAccount(null)).toBeNull();
    expect(parseLastAccount('pas du json')).toBeNull();
    expect(parseLastAccount(JSON.stringify({ provider: 'google', email: 'pas-une-adresse' }))).toBeNull();
    expect(parseLastAccount(JSON.stringify({ provider: 'facebook', email: 'a@b.tn' }))).toBeNull();
    expect(parseLastAccount(JSON.stringify({ provider: 'email' }))).toBeNull();
  });
});

describe('rememberLastAccount / loadLastAccount / forgetLastAccount', () => {
  it('range puis relit le dernier compte, adresse nettoyée', async () => {
    const backend = memoryBackend();
    await rememberLastAccount(backend, { provider: 'google', email: ' essam@gmail.com ', name: 'Essam' });
    expect(await loadLastAccount(backend)).toEqual({ provider: 'google', email: 'essam@gmail.com', name: 'Essam' });
  });

  it('ne range jamais de jeton : seuls fournisseur, adresse et nom sortent du coffre', async () => {
    const backend = memoryBackend();
    await rememberLastAccount(backend, { provider: 'google', email: 'a@gmail.com', name: 'A' });
    const stored = backend.values.get(LAST_ACCOUNT_KEY) ?? '';
    expect(Object.keys(JSON.parse(stored)).sort()).toEqual(['email', 'name', 'provider']);
    expect(stored).not.toMatch(/token|idToken/i);
  });

  it('n’enregistre pas une adresse invalide', async () => {
    const backend = memoryBackend();
    await rememberLastAccount(backend, { provider: 'email', email: 'nope' });
    expect(backend.values.has(LAST_ACCOUNT_KEY)).toBe(false);
  });

  it('oublier retire réellement le compte', async () => {
    const backend = memoryBackend();
    await rememberLastAccount(backend, { provider: 'email', email: 'a@ex.tn' });
    await forgetLastAccount(backend);
    expect(await loadLastAccount(backend)).toBeNull();
  });
});
