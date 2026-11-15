/**
 * Favoris client — correctif du 16/11/2026 (bug « un seul cœur marche »).
 *
 * La table portait `UNIQUE(account_id, source_url)`. Les produits du catalogue
 * officiel n'ont PAS d'adresse source (`''`) : le premier favori prenait la valeur
 * vide et CHAQUE favori suivant heurtait la contrainte (erreur 500 avalée par
 * l'appli) — un seul cœur restait « cliquable ».
 *
 * L'unicité par adresse ne vaut que pour une adresse réelle (favori externe) :
 * index unique PARTIEL `WHERE source_url <> ''`. SQLite ne sait pas retirer une
 * contrainte de table : la table est reconstruite une fois, dans une transaction,
 * lignes et identifiants intacts. Idempotent : relu à chaque démarrage.
 */
import type Database from 'better-sqlite3';

export const CUSTOMER_FAVORITES_SOURCE_INDEX_SQL =
  "CREATE UNIQUE INDEX IF NOT EXISTS ux_customer_favorites_source ON customer_favorites(account_id, source_url) WHERE source_url <> ''";

const OLD_CONSTRAINT = /UNIQUE\s*\(\s*account_id\s*,\s*source_url\s*\)/i;

/** Renvoie `true` si la table a dû être reconstruite. */
export function relaxCustomerFavoritesSourceUnique(db: Database.Database): boolean {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='customer_favorites'").get() as { sql?: string } | undefined;
  if (!row?.sql) return false;
  if (!OLD_CONSTRAINT.test(row.sql)) {
    db.exec(CUSTOMER_FAVORITES_SOURCE_INDEX_SQL);
    return false;
  }
  const rebuiltSql = row.sql
    .replace(/,\s*UNIQUE\s*\(\s*account_id\s*,\s*source_url\s*\)/i, '')
    .replace(/CREATE TABLE\s+(IF NOT EXISTS\s+)?"?customer_favorites"?/i, 'CREATE TABLE customer_favorites_relaxed');
  const foreignKeys = db.pragma('foreign_keys', { simple: true });
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(rebuiltSql);
      db.exec('INSERT INTO customer_favorites_relaxed SELECT * FROM customer_favorites');
      db.exec('DROP TABLE customer_favorites');
      db.exec('ALTER TABLE customer_favorites_relaxed RENAME TO customer_favorites');
      db.exec('CREATE INDEX IF NOT EXISTS idx_customer_favorites_account ON customer_favorites(account_id, created_at DESC)');
      db.exec(CUSTOMER_FAVORITES_SOURCE_INDEX_SQL);
    })();
  } finally {
    if (foreignKeys) db.pragma('foreign_keys = ON');
  }
  return true;
}
