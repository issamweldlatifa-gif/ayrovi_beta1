import { describe, expect, it, vi } from 'vitest';
import { SmartLinkScraper } from '../src/scraper/scraper';

/**
 * Régression — identité d'un produit quand AUCUN identifiant marchand n'est extractible.
 *
 * Avant le 2026-10-03, `extractDeepUrlInfo` terminait par :
 *     externalId: 'ITEM-' + Math.floor(Math.random() * 899999 + 100000)
 * ce qui produisait deux défauts réels :
 *   1. ré-analyser la MÊME url créait une nouvelle identité, donc une nouvelle ligne
 *      au lieu de rapprocher la même (la déduplication s'appuie sur cette clé) ;
 *   2. un numéro inventé était indiscernable d'un identifiant marchand authentique.
 *
 * Le contrat verrouillé ici : identité DÉTERMINISTE, rejouable, et qui dit la vérité
 * (préfixe UNRESOLVED-). Ce test échouera si quelqu'un réintroduit de l'aléatoire.
 */
const scraper = new SmartLinkScraper();

/** La méthode est privée : on l'atteint par réflexion pour tester le contrat exact. */
function extract(rawUrl: string, store: 'unknown' = 'unknown'): { externalId: string; title: string } {
  return (scraper as unknown as {
    extractDeepUrlInfo: (u: string, s: string) => { externalId: string; title: string };
  }).extractDeepUrlInfo(rawUrl, store);
}

describe('SmartLinkScraper — identité de repli quand aucun identifiant marchand n’existe', () => {
  it('produit la MÊME identité pour la même url (réanalyser ne duplique plus)', () => {
    const url = 'https://boutique-inconnue.example/produit/sans-identifiant';
    const first = extract(url).externalId;
    const second = extract(url).externalId;
    expect(first).toBe(second);
  });

  it('produit des identités DIFFÉRENTES pour des urls différentes', () => {
    const a = extract('https://boutique-inconnue.example/produit/a').externalId;
    const b = extract('https://boutique-inconnue.example/produit/b').externalId;
    expect(a).not.toBe(b);
  });

  it('annonce la vérité : préfixe UNRESOLVED- et jamais un faux identifiant marchand', () => {
    const id = extract('https://boutique-inconnue.example/produit/sans-identifiant').externalId;
    expect(id).toMatch(/^UNRESOLVED-[0-9a-f]{12}$/);
    expect(id).not.toMatch(/^ITEM-/);
    expect(id).not.toMatch(/^AE-/);
  });

  it('ne dépend d’aucun aléatoire (Math.random interdit sur ce chemin)', () => {
    const spy = vi.spyOn(Math, 'random');
    const url = 'https://boutique-inconnue.example/produit/sans-identifiant';
    extract(url);
    extract(url);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
