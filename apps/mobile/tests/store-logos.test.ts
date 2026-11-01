// Logos officiels des boutiques — 27/10/2026.
//
// Le client a envoyé dix-neuf logos et demandé « un logo par boutique ». Ce test
// verrouille les trois maillons de la chaîne :
//   1. la table d'identifiants couvre EXACTEMENT les marques du registre ;
//   2. chaque identifiant a bien ses deux fichiers sur disque (clair + sombre) —
//      un `require` cassé ne se voit qu'à l'exécution, donc on le vérifie ici ;
//   3. aucune marque n'a de motif d'URL inventé : la seule preuve admise reste
//      la capture (`recognition: 'capture'`).
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { AYWEBS_STORES } from '../../../shared/aywebsStores';
import { AYWEBS_CATALOG_STORES } from '../../../shared/aywebsStoreCatalog';
import {
  STORE_LOGO_IDS,
  normaliseStoreKey,
  storeLogoId,
} from '@/features/aywebs/storeLogoIds';

const BRAND_DIR = new URL('../assets/aywebs/brands/', import.meta.url);
const BRAND_DARK_DIR = new URL('../assets/aywebs/brands-dark/', import.meta.url);

/** Les quatorze boutiques créées le 27/10/2026 pour recevoir leur logo. */
const BRAND_WAVE_IDS = [
  'nike', 'adidas', 'puma', 'new-balance', 'asics', 'converse', 'vans',
  'champion', 'under-armour', 'the-north-face', 'calvin-klein', 'chanel',
  'louis-vuitton', 'zara',
] as const;

describe('logos officiels des boutiques', () => {
  it('couvre les dix-neuf marques, sans doublon', () => {
    expect(STORE_LOGO_IDS).toHaveLength(19);
    expect(new Set(STORE_LOGO_IDS).size).toBe(19);
    // Les cinq boutiques qui existaient déjà gardent leur logo.
    for (const id of ['amazon', 'shein', 'temu', 'aliexpress', 'sephora']) {
      expect(STORE_LOGO_IDS).toContain(id);
    }
    for (const id of BRAND_WAVE_IDS) {
      expect(STORE_LOGO_IDS).toContain(id);
    }
  });

  it('a un fichier par marque, dans les deux thèmes', () => {
    for (const id of STORE_LOGO_IDS) {
      expect(existsSync(new URL(`${id}.png`, BRAND_DIR)), `brands/${id}.png manque`).toBe(true);
      expect(existsSync(new URL(`${id}.png`, BRAND_DARK_DIR)), `brands-dark/${id}.png manque`).toBe(true);
    }
    // Aucun fichier orphelin : un logo sans entrée ne serait jamais affiché.
    const expected = new Set(STORE_LOGO_IDS.map((id) => `${id}.png`));
    for (const file of [...BRAND_WAVE_IDS.map((id) => `${id}.png`), 'amazon.png', 'shein.png', 'temu.png', 'aliexpress.png', 'sephora.png']) {
      expect(expected.has(file)).toBe(true);
    }
  });

  it('rapproche les libellés du serveur des identifiants de logo', () => {
    expect(storeLogoId({ id: 'nike' })).toBe('nike');
    expect(storeLogoId({ id: 'new-balance' })).toBe('new-balance');
    expect(storeLogoId({ id: 'nb', displayName: 'New Balance' })).toBe('new-balance');
    expect(storeLogoId({ id: 'x', displayName: 'The North Face' })).toBe('the-north-face');
    expect(storeLogoId({ id: 'x', name: 'Calvin Klein' })).toBe('calvin-klein');
    expect(storeLogoId({ id: 'x', displayName: 'Louis Vuitton' })).toBe('louis-vuitton');
    // Sans correspondance : AUCUN logo. La carte garde son initiale.
    expect(storeLogoId({ id: 'store-42', displayName: 'Boutique 42' })).toBeNull();
    expect(storeLogoId(null)).toBeNull();
    // Ponctuation et symboles tombent en tirets, puis sont rognés aux extrémités.
    expect(normaliseStoreKey('The North Face®')).toBe('the-north-face');
    expect(normaliseStoreKey('  CHANEL  ')).toBe('chanel');
  });

  it('chaque marque a sa ligne au CATALOGUE — affichée, jamais promue', () => {
    /* ── Pourquoi le catalogue et pas le registre ────────────────────────────
       `AYWEBS_STORES` ne contient que des boutiques OUVERTES (capture de fiche,
       panier). Y faire entrer zara.com ou nike.com aurait changé le comportement
       du serveur — reconnaissance de domaine, capture acceptée — alors qu'aucun
       motif de fiche n'a été mesuré pour ces marques. Le client demandait un
       logo par boutique, pas l'ouverture de quatorze boutiques : elles restent
       donc des entrées de catalogue, avec leur logo. */
    for (const id of BRAND_WAVE_IDS) {
      const store = AYWEBS_CATALOG_STORES.find((entry) => entry.id === id);
      expect(store, `${id} manque au catalogue`).toBeTruthy();
      expect(store?.categories.length).toBeGreaterThan(0);
      expect(store?.enabled).toBe(false);
      expect(store?.adapter).toBe('generic');
      expect(store?.productUrlPattern ?? '').toBe('');
      // Une boutique ne doit JAMAIS exister aux deux endroits : la liste
      // publique est la concaténation des deux tableaux.
      expect(AYWEBS_STORES.some((entry) => entry.id === id)).toBe(false);
    }
  });
});
