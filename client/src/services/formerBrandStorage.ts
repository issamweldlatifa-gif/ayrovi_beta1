/**
 * Préférences du navigateur à l'ancien nom (16/11/2026).
 *
 * Les clés de stockage local s'appellent désormais `zayrovi…` (session invité et
 * son panier, favoris, langue, thème, consentements…). Sans ce passage, un client
 * qui revient perdrait tout cela au premier chargement. Chaque ancienne clé est
 * recopiée sous son nouveau nom — sans écraser une valeur nouvelle — puis effacée.
 * Une fois fait, la boucle ne trouve plus rien.
 */
import { mentionsFormerBrand, renameFormerBrand } from '../../../shared/formerBrand';

function migrate(storage: Storage | undefined): number {
  if (!storage) return 0;
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && mentionsFormerBrand(key)) keys.push(key);
  }
  for (const key of keys) {
    const next = renameFormerBrand(key);
    const value = storage.getItem(key);
    if (value !== null && storage.getItem(next) === null) storage.setItem(next, value);
    storage.removeItem(key);
  }
  return keys.length;
}

export function migrateFormerBrandStorage(): number {
  let moved = 0;
  try { moved += migrate(typeof window !== 'undefined' ? window.localStorage : undefined); } catch { /* stockage indisponible */ }
  try { moved += migrate(typeof window !== 'undefined' ? window.sessionStorage : undefined); } catch { /* stockage indisponible */ }
  return moved;
}

migrateFormerBrandStorage();
