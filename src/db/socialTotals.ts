/**
 * COMPTEURS SOCIAUX MATÉRIALISÉS — audit d'architecture du 12/11/2026.
 *
 * ── Le problème mesuré ───────────────────────────────────────────────────────
 * Vues, j'aime, partages, commentaires, « j'adore » et « je n'aime pas » étaient
 * recomptés (`COUNT(*)`) à CHAQUE lecture. Avec 1 000 000 d'interactions, une
 * seule requête `/api/public/social/counts` coûtait ~13 ms de CPU synchrone :
 * 87 req/s par vCPU, contre ~1 000 req/s pour les autres lectures. Pire, chaque
 * VUE enregistrée recomptait tout dans la transaction d'écriture — or SQLite
 * n'a qu'un écrivain : le coût d'une vue grandissait avec l'audience.
 *
 * ── La décision ─────────────────────────────────────────────────────────────
 * Une table `social_interaction_totals(target_id, type, n)` tenue à jour par des
 * DÉCLENCHEURS SQLite (AFTER INSERT / AFTER DELETE) sur les trois tables
 * sources. Une lecture devient une recherche par clé primaire : O(1), quel que
 * soit le volume. Les déclencheurs vivent DANS la base, donc :
 *  • aucun chemin d'écriture ne peut l'oublier (route, migration, suppression
 *    de compte en CASCADE, script d'admin) ;
 *  • ils sont dans la même transaction que l'écriture : pas de dérive possible
 *    en cas d'erreur (tout est annulé ensemble).
 *
 * Les tables sources ne sont écrites que par INSERT et DELETE (vérifié le
 * 12/11 : aucun UPDATE, REPLACE ni UPSERT). Un déclencheur AFTER UPDATE couvre
 * malgré tout le cas où une ligne changerait de cible ou de type.
 *
 * Types matérialisés : `like`, `comment`, `view`, `share` (story_interactions),
 * `love` (social_loves), `dislike` (publication_dislikes).
 *
 * ── Installation ────────────────────────────────────────────────────────────
 * Une seule transaction : création de la table, remplissage depuis les tables
 * sources, puis création des déclencheurs. Une écriture concurrente ne peut pas
 * se glisser entre le remplissage et les déclencheurs (SQLite sérialise les
 * écritures). Version dans les noms (`_v1`) : un changement de règle = nouveaux
 * noms + réinstallation propre.
 *
 * Le jour du passage à PostgreSQL (voir docs/AYROVI_ARCHITECTURE_SCALABLE_AR_2026-11-12.md),
 * la même table et les mêmes règles se traduisent en triggers PL/pgSQL.
 */
import type Database from 'better-sqlite3';

export const SOCIAL_TOTAL_TYPES = ['like', 'comment', 'view', 'share', 'love', 'dislike'] as const;
export type SocialTotalType = typeof SOCIAL_TOTAL_TYPES[number];

const TRIGGERS = [
  'trg_social_totals_v1_interaction_insert',
  'trg_social_totals_v1_interaction_delete',
  'trg_social_totals_v1_interaction_update',
  'trg_social_totals_v1_love_insert',
  'trg_social_totals_v1_love_delete',
  'trg_social_totals_v1_dislike_insert',
  'trg_social_totals_v1_dislike_delete',
] as const;

const bump = (target: string, type: string, delta: 1 | -1) => delta > 0
  ? `INSERT INTO social_interaction_totals(target_id,type,n) VALUES (${target},${type},1)
       ON CONFLICT(target_id,type) DO UPDATE SET n=n+1;`
  : `UPDATE social_interaction_totals SET n=MAX(n-1,0) WHERE target_id=${target} AND type=${type};`;

/** Crée (une fois) la table, la remplit et pose les déclencheurs. Idempotent. */
export function ensureSocialTotals(raw: Database.Database): { installed: boolean } {
  const present = raw.prepare(`SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name IN (${TRIGGERS.map(() => '?').join(',')})`)
    .get(...TRIGGERS) as { n: number };
  const table = raw.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='social_interaction_totals'").get();
  if (table && Number(present.n) === TRIGGERS.length) return { installed: false };

  raw.transaction(() => {
    for (const name of TRIGGERS) raw.exec(`DROP TRIGGER IF EXISTS ${name}`);
    raw.exec(`
      CREATE TABLE IF NOT EXISTS social_interaction_totals (
        target_id TEXT NOT NULL,
        type TEXT NOT NULL,
        n INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (target_id, type)
      ) WITHOUT ROWID;
      DELETE FROM social_interaction_totals;
      INSERT INTO social_interaction_totals(target_id,type,n)
        SELECT target_id,type,COUNT(*) FROM story_interactions GROUP BY target_id,type;
      INSERT INTO social_interaction_totals(target_id,type,n)
        SELECT target_id,'love',COUNT(*) FROM social_loves GROUP BY target_id;
      INSERT INTO social_interaction_totals(target_id,type,n)
        SELECT target_id,'dislike',COUNT(*) FROM publication_dislikes GROUP BY target_id;

      CREATE TRIGGER trg_social_totals_v1_interaction_insert AFTER INSERT ON story_interactions BEGIN
        ${bump('NEW.target_id', 'NEW.type', 1)}
      END;
      CREATE TRIGGER trg_social_totals_v1_interaction_delete AFTER DELETE ON story_interactions BEGIN
        ${bump('OLD.target_id', 'OLD.type', -1)}
      END;
      CREATE TRIGGER trg_social_totals_v1_interaction_update AFTER UPDATE OF target_id,type ON story_interactions
        WHEN OLD.target_id IS NOT NEW.target_id OR OLD.type IS NOT NEW.type BEGIN
        ${bump('OLD.target_id', 'OLD.type', -1)}
        ${bump('NEW.target_id', 'NEW.type', 1)}
      END;
      CREATE TRIGGER trg_social_totals_v1_love_insert AFTER INSERT ON social_loves BEGIN
        ${bump('NEW.target_id', "'love'", 1)}
      END;
      CREATE TRIGGER trg_social_totals_v1_love_delete AFTER DELETE ON social_loves BEGIN
        ${bump('OLD.target_id', "'love'", -1)}
      END;
      CREATE TRIGGER trg_social_totals_v1_dislike_insert AFTER INSERT ON publication_dislikes BEGIN
        ${bump('NEW.target_id', "'dislike'", 1)}
      END;
      CREATE TRIGGER trg_social_totals_v1_dislike_delete AFTER DELETE ON publication_dislikes BEGIN
        ${bump('OLD.target_id', "'dislike'", -1)}
      END;
    `);
  })();
  return { installed: true };
}

/**
 * Fragment SQL : le total d'un type pour une cible (0 si aucune ligne).
 * `targetExpr` est une expression SQL de CONFIANCE (ex. `pub.id`), jamais une
 * saisie utilisateur ; `type` vient de la liste fermée ci-dessus.
 */
export function socialTotalSql(targetExpr: string, type: SocialTotalType): string {
  if (!SOCIAL_TOTAL_TYPES.includes(type)) throw new Error(`SOCIAL_TOTAL_TYPE_INVALID:${type}`);
  if (!/^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/.test(targetExpr)) throw new Error('SOCIAL_TOTAL_TARGET_INVALID');
  return `COALESCE((SELECT st.n FROM social_interaction_totals st WHERE st.target_id=${targetExpr} AND st.type='${type}'),0)`;
}

export interface SocialTotalsDrift { target_id: string; type: string; stored: number; actual: number }

/**
 * Contrôle d'exploitation : compare les totaux matérialisés au recomptage réel.
 * Lourd (lit tout) — jamais sur un chemin de requête ; réservé aux tests, à un
 * diagnostic d'admin ou à une tâche nocturne. Une liste vide = aucune dérive.
 */
export function socialTotalsDrift(raw: Database.Database, limit = 50): SocialTotalsDrift[] {
  return raw.prepare(`
    WITH actual AS (
      SELECT target_id,type,COUNT(*) n FROM story_interactions GROUP BY target_id,type
      UNION ALL SELECT target_id,'love',COUNT(*) FROM social_loves GROUP BY target_id
      UNION ALL SELECT target_id,'dislike',COUNT(*) FROM publication_dislikes GROUP BY target_id
    ),
    keys AS (SELECT target_id,type FROM actual UNION SELECT target_id,type FROM social_interaction_totals WHERE n<>0)
    SELECT k.target_id,k.type,COALESCE(s.n,0) stored,COALESCE(a.n,0) actual
    FROM keys k
    LEFT JOIN social_interaction_totals s ON s.target_id=k.target_id AND s.type=k.type
    LEFT JOIN actual a ON a.target_id=k.target_id AND a.type=k.type
    WHERE COALESCE(s.n,0)<>COALESCE(a.n,0)
    LIMIT ?`).all(limit) as SocialTotalsDrift[];
}
