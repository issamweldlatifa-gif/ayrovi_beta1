/**
 * Entrée directe dans une boutique depuis la liste AYWEBs.
 */
import { describe, expect, it } from 'vitest';

import type { AyWebsStore } from '@/api/aywebs';
import { normalizeStoreAddress, storeEntryTarget } from '@/features/aywebs/storeEntry';

const base: AyWebsStore = {
  id: 'amazon',
  name: 'amazon',
  displayName: 'Amazon',
  country: 'US',
  currency: 'USD',
  enabled: true,
  captureSupported: true,
  operational: true,
  operationalReason: '',
  adapter: 'amazon',
  status: 'active',
  integrationType: 'REVIEW',
  capabilities: ['browse', 'search', 'product', 'variants', 'availability'],
  browserMode: 'external',
  homeUrl: 'https://www.amazon.com/',
  logo: '/stores/amazon.png',
  purchaseMode: 'MANUAL_REVIEW',
  popular: true,
};

describe('storeEntryTarget', () => {
  it('une boutique active ouvre sa page d’accueil, sans capture', () => {
    expect(storeEntryTarget(base)).toEqual({
      pathname: '/aywebs/browser',
      params: { url: 'https://www.amazon.com/', storeId: 'amazon', storeName: 'Amazon', capture: '0' },
    });
  });

  it('une boutique pas encore prête reste ouvrable : le verdict ne bloque pas l’entrée', () => {
    expect(storeEntryTarget({ ...base, operational: false })).not.toBeNull();
  });

  it('une boutique désactivée ne s’ouvre pas', () => {
    expect(storeEntryTarget({ ...base, enabled: false })).toBeNull();
  });

  it('sans capacité « browse », pas d’entrée', () => {
    expect(storeEntryTarget({ ...base, capabilities: ['product'] })).toBeNull();
  });

  it('une boutique sans page d’accueil (générique) reste fermée', () => {
    expect(storeEntryTarget({ ...base, id: 'generic', homeUrl: '' })).toBeNull();
  });

  it('une adresse d’accueil non HTTPS ou illisible n’est jamais ouverte', () => {
    expect(storeEntryTarget({ ...base, homeUrl: 'http-not-a-url' })).toBeNull();
    expect(storeEntryTarget({ ...base, homeUrl: 'javascript:alert(1)' })).toBeNull();
    expect(storeEntryTarget({ ...base, homeUrl: 'ftp://files.example.com/' })).toBeNull();
  });
});

describe('normalizeStoreAddress', () => {
  it('un domaine nu reçoit https://', () => {
    expect(normalizeStoreAddress('www.amazon.com')).toBe('https://www.amazon.com/');
    expect(normalizeStoreAddress('  https://www.amazon.com/  ')).toBe('https://www.amazon.com/');
  });

  it('vide, schémas dangereux ou non HTTPS : refusé', () => {
    expect(normalizeStoreAddress('')).toBeNull();
    expect(normalizeStoreAddress('   ')).toBeNull();
    expect(normalizeStoreAddress('javascript:alert(1)')).toBeNull();
    expect(normalizeStoreAddress('ftp://files.example.com/')).toBeNull();
    expect(normalizeStoreAddress('http://localhost:3000/')).toBeNull();
  });
});
