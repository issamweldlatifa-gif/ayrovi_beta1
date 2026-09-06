/**
 * AYROVI — transaction imbriquable (extrait du module Stock, P2.2 → P2.3).
 *
 * `QatafoDatabase` n'expose pas de transaction publique. Un `SAVEPOINT` est l'idiome SQLite
 * qui fonctionne aussi bien au niveau racine qu'imbriqué dans une transaction déjà ouverte
 * (appel depuis un job, ou depuis un module qui écrit plusieurs tables d'un coup), contrairement
 * à `BEGIN`. Le module Achats en a eu besoin pour poster une réception — mouvement + statuts —
 * sans écrire un second exemplaire de ce gabarit : une seule implémentation dans le dépôt.
 */
import type { QatafoDatabase } from './database';

export function withSavepoint<T>(db: QatafoDatabase, label: string, body: () => T): T {
  const name = `sp_${label.replace(/[^a-z0-9_]/gi, '')}_${Date.now().toString(36)}`;
  db.run(`SAVEPOINT ${name}`);
  try {
    const value = body();
    db.run(`RELEASE ${name}`);
    return value;
  } catch (error) {
    try { db.run(`ROLLBACK TO ${name}`); db.run(`RELEASE ${name}`); } catch { /* la cause d'origine prime */ }
    throw error;
  }
}
