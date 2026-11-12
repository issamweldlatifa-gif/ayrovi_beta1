/**
 * Compteurs sociaux matérialisés (audit d'architecture 12/11/2026).
 *
 *  • l'installation remplit la table depuis l'existant (aucun compteur remis à 0) ;
 *  • toute écriture — route, suppression directe, CASCADE d'un compte supprimé —
 *    garde les totaux EXACTEMENT égaux au recomptage `COUNT(*)` ;
 *  • l'installation est idempotente et se répare si un déclencheur manque ;
 *  • le contrat public de `/social/counts` est inchangé.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { QatafoDatabase } from '../src/db/database';
import { ensureSocialTotals, socialTotalSql, socialTotalsDrift } from '../src/db/socialTotals';
import { readSocialCounts } from '../src/magazine/socialEngagementReads';
import { socialInteractionCounts, uniqueOwnerLookupSql, writeSocialInteraction } from '../src/magazine/socialInteractions';

/** Les trois tables sources, au schéma de production (sans le reste de la base). */
function bareSchema(): Database.Database {
  const raw = new Database(':memory:');
  raw.exec(`
    CREATE TABLE customer_accounts (id TEXT PRIMARY KEY);
    CREATE TABLE story_interactions (id TEXT PRIMARY KEY, target_id TEXT NOT NULL, target_kind TEXT NOT NULL DEFAULT 'story',
      type TEXT NOT NULL CHECK(type IN ('like','comment','view','share')), account_id TEXT, guest_hash TEXT, text TEXT, created_at TEXT NOT NULL);
    CREATE TABLE social_loves (target_id TEXT NOT NULL, account_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL, PRIMARY KEY(target_id,account_id));
    CREATE TABLE publication_dislikes (target_id TEXT NOT NULL, account_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL, PRIMARY KEY(target_id,account_id));
  `);
  raw.pragma('foreign_keys = ON');
  return raw;
}

/** Générateur déterministe : un échec se rejoue à l'identique. */
function lcg(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; };
}

describe('installation', () => {
  it('remplit la table depuis les interactions EXISTANTES', () => {
    const raw = bareSchema();
    raw.exec("INSERT INTO customer_accounts VALUES ('a1'),('a2')");
    const insert = raw.prepare("INSERT INTO story_interactions (id,target_id,type,created_at) VALUES (?,?,?,'2026-11-12')");
    for (let i = 0; i < 30; i++) insert.run(`i${i}`, `t${i % 3}`, ['view', 'like', 'share', 'comment'][i % 4]);
    raw.exec("INSERT INTO social_loves VALUES ('t0','a1','x'),('t0','a2','x'),('t1','a1','x')");
    raw.exec("INSERT INTO publication_dislikes VALUES ('t2','a1','x')");

    expect(ensureSocialTotals(raw)).toEqual({ installed: true });
    expect(socialTotalsDrift(raw)).toEqual([]);
    expect(raw.prepare("SELECT n FROM social_interaction_totals WHERE target_id='t0' AND type='love'").get()).toEqual({ n: 2 });
    expect(raw.prepare("SELECT n FROM social_interaction_totals WHERE target_id='t2' AND type='dislike'").get()).toEqual({ n: 1 });
  });

  it('est idempotente, et se répare si un déclencheur a disparu', () => {
    const raw = bareSchema();
    expect(ensureSocialTotals(raw).installed).toBe(true);
    expect(ensureSocialTotals(raw).installed).toBe(false);
    // Un déclencheur supprimé à la main : les écritures suivantes ne seraient plus comptées…
    raw.exec('DROP TRIGGER trg_social_totals_v1_interaction_insert');
    raw.prepare("INSERT INTO story_interactions (id,target_id,type,created_at) VALUES ('lost','t9','view','x')").run();
    expect(socialTotalsDrift(raw)).toHaveLength(1);
    // … la réinstallation recompte TOUT et repose les déclencheurs.
    expect(ensureSocialTotals(raw).installed).toBe(true);
    expect(socialTotalsDrift(raw)).toEqual([]);
    raw.prepare("INSERT INTO story_interactions (id,target_id,type,created_at) VALUES ('next','t9','view','x')").run();
    expect(socialTotalsDrift(raw)).toEqual([]);
  });
});

describe('aucune dérive, quelle que soit la suite d’écritures', () => {
  it('3 000 insertions/suppressions aléatoires + CASCADE + changement de cible', () => {
    const raw = bareSchema();
    ensureSocialTotals(raw);
    const random = lcg(20261112);
    const accounts = Array.from({ length: 12 }, (_, i) => `acc${i}`);
    for (const id of accounts) raw.prepare('INSERT INTO customer_accounts VALUES (?)').run(id);
    const targets = ['t0', 't1', 't2', 't3', 't4'];
    const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)];
    let next = 0;
    for (let step = 0; step < 3_000; step++) {
      const roll = random();
      const target = pick(targets);
      if (roll < 0.45) {
        raw.prepare('INSERT INTO story_interactions (id,target_id,type,created_at) VALUES (?,?,?,?)')
          .run(`s${next++}`, target, pick(['view', 'like', 'share', 'comment']), 'x');
      } else if (roll < 0.6) {
        raw.prepare('INSERT OR IGNORE INTO social_loves VALUES (?,?,?)').run(target, pick(accounts), 'x');
      } else if (roll < 0.7) {
        raw.prepare('INSERT OR IGNORE INTO publication_dislikes VALUES (?,?,?)').run(target, pick(accounts), 'x');
      } else if (roll < 0.85) {
        raw.prepare('DELETE FROM story_interactions WHERE id IN (SELECT id FROM story_interactions WHERE target_id=? LIMIT 2)').run(target);
      } else if (roll < 0.93) {
        raw.prepare('DELETE FROM social_loves WHERE target_id=? AND account_id=?').run(target, pick(accounts));
      } else if (roll < 0.97) {
        // Une ligne qui change de cible et de type (aucun chemin du code ne le fait aujourd'hui).
        raw.prepare("UPDATE story_interactions SET target_id=?, type='share' WHERE id=(SELECT id FROM story_interactions ORDER BY random() LIMIT 1)").run(target);
      } else {
        // Suppression d'un compte : ses « j'adore » et « je n'aime pas » partent en CASCADE.
        const account = pick(accounts);
        raw.prepare('DELETE FROM customer_accounts WHERE id=?').run(account);
        raw.prepare('INSERT INTO customer_accounts VALUES (?)').run(account);
      }
    }
    expect(socialTotalsDrift(raw)).toEqual([]);
  });

  it('une transaction annulée n’laisse aucune trace dans les totaux', () => {
    const raw = bareSchema();
    ensureSocialTotals(raw);
    expect(() => raw.transaction(() => {
      raw.prepare("INSERT INTO story_interactions (id,target_id,type,created_at) VALUES ('r1','t0','view','x')").run();
      throw new Error('rollback');
    })()).toThrow('rollback');
    expect(raw.prepare('SELECT COUNT(*) n FROM social_interaction_totals WHERE n>0').get()).toEqual({ n: 0 });
  });
});

describe('dans la vraie base (toutes migrations jouées)', () => {
  let db: QatafoDatabase;
  const now = '2026-11-12T00:00:00.000Z';
  const reel = 'totals_reel';
  beforeAll(() => {
    db = new QatafoDatabase(':memory:');
    const publisher = db.get<any>('SELECT id FROM story_publishers LIMIT 1').id;
    db.run("INSERT INTO reels(id,title,channel_id,video_url,publish_at,status,created_at,updated_at) VALUES (?,'Fixture',?,'/media/test',?,'publie',?,?)", reel, publisher, now, now, now);
    for (const id of ['tot_a', 'tot_b']) db.run("INSERT INTO customer_accounts(id,display_name,status,created_at,updated_at) VALUES (?,?,'ACTIVE',?,?)", id, id, now, now);
  });
  afterAll(() => db.close());

  it('vues, réactions et suppression de compte : compteurs du contrat = recomptage', () => {
    const write = (body: Record<string, unknown>, customer: { id: string } | null, guest = '') => {
      const result = writeSocialInteraction(db, body, customer, guest, now);
      if (!('data' in result)) throw new Error(result.outcome);
      return result.data as any;
    };
    for (let i = 0; i < 5; i++) write({ type: 'view', targetId: reel }, null, `guest-session-${i}-aaaaaaaaaaaa`);
    write({ type: 'view', targetId: reel }, null, 'guest-session-0-aaaaaaaaaaaa'); // doublon : non compté
    write({ type: 'reaction', targetId: reel, reaction: 'love' }, { id: 'tot_a' });
    write({ type: 'reaction', targetId: reel, reaction: 'like' }, { id: 'tot_b' });

    expect(socialInteractionCounts(db, reel)).toMatchObject({ views: 5, loves: 1, likes: 1 });
    expect(readSocialCounts(db, reel)[reel]).toEqual({ likes: 1, loves: 1, dislikes: 0, comments: 0, views: 5, shares: 0 });
    // Le compteur dénormalisé du Reel suit (vues + réactions positives).
    expect(db.get<any>('SELECT views,likes FROM reels WHERE id=?', reel)).toEqual({ views: 5, likes: 2 });

    db.run('DELETE FROM customer_accounts WHERE id=?', 'tot_a'); // CASCADE sur social_loves
    expect(readSocialCounts(db, reel)[reel].loves).toBe(0);
    expect(db.socialTotalsDrift()).toEqual([]);
  });
});

it('le fragment SQL n’accepte que des expressions et des types de confiance', () => {
  expect(socialTotalSql('pub.id', 'view')).toContain("st.type='view'");
  expect(() => socialTotalSql('pub.id; DROP TABLE x', 'view')).toThrow('SOCIAL_TOTAL_TARGET_INVALID');
  expect(() => socialTotalSql('pub.id', 'boost' as never)).toThrow('SOCIAL_TOTAL_TYPE_INVALID');
});

describe('lectures non paginées plafonnées', () => {
  it('renvoie au plus LEGACY_UNPAGED_LIMIT contenus, les plus récents d’abord', async () => {
    const { readPublishedSocial, LEGACY_UNPAGED_LIMIT } = await import('../src/magazine/publicSocialReads');
    const db = new QatafoDatabase(':memory:');
    try {
      const publisher = db.get<any>('SELECT id FROM story_publishers LIMIT 1').id;
      db.transaction(() => {
        for (let i = 0; i < LEGACY_UNPAGED_LIMIT + 25; i++) {
          const at = new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString();
          db.run("INSERT INTO reels(id,title,channel_id,video_url,publish_at,status,created_at,updated_at) VALUES (?,'R',?,'/media/x',?,'publie',?,?)", `cap_${String(i).padStart(4, '0')}`, publisher, at, at, at);
        }
      });
      const { items, nextCursor } = readPublishedSocial(db, 'reel', '2027-01-01T00:00:00.000Z');
      expect(items).toHaveLength(LEGACY_UNPAGED_LIMIT);
      expect(nextCursor).toBeNull();
      // Les plus récents d'abord (la base contient aussi ses Reels d'origine, plus récents).
      expect(items.find((row) => row.id.startsWith('cap_'))?.id).toBe(`cap_${String(LEGACY_UNPAGED_LIMIT + 24).padStart(4, '0')}`);
      expect(items.some((row) => row.id === 'cap_0000')).toBe(false);
      // La pagination, elle, n'est pas plafonnée par cette règle : elle va jusqu'au bout.
      let cursor: string | null = null; let seen = 0;
      do {
        const page = readPublishedSocial(db, 'reel', '2027-01-01T00:00:00.000Z', cursor ? { limit: 30, cursor: JSON.parse(Buffer.from(cursor, 'base64url').toString()) } : { limit: 30 });
        seen += page.items.filter((row) => row.id.startsWith('cap_')).length; cursor = page.nextCursor;
      } while (cursor);
      expect(seen).toBe(LEGACY_UNPAGED_LIMIT + 25);
    } finally { db.close(); }
  });
});

describe('écriture d’une vue : servie par l’index unique partiel (pas de balayage)', () => {
  it('le plan d’exécution utilise idx_social_unique_guest / idx_social_unique_account', () => {
    const db = new QatafoDatabase(':memory:');
    try {
      const plan = (sql: string) => db.all<any>(`EXPLAIN QUERY PLAN ${sql}`, 'r', 'view', 'o').map((row) => row.detail).join(' | ');
      expect(plan(uniqueOwnerLookupSql(false))).toContain('idx_social_unique_guest (target_id=? AND type=? AND guest_hash=?)');
      expect(plan(uniqueOwnerLookupSql(true))).toContain('idx_social_unique_account (target_id=? AND type=? AND account_id=?)');
    } finally { db.close(); }
  });

  it('un Reel très vu : la vue suivante reste dédoublonnée et rapide', () => {
    const db = new QatafoDatabase(':memory:');
    const now = '2026-11-12T00:00:00.000Z';
    try {
      const publisher = db.get<any>('SELECT id FROM story_publishers LIMIT 1').id;
      db.run("INSERT INTO reels(id,title,channel_id,video_url,publish_at,status,created_at,updated_at) VALUES ('hot_reel','Hot',?,'/media/x',?,'publie',?,?)", publisher, now, now, now);
      db.transaction(() => {
        for (let i = 0; i < 20_000; i++) {
          db.run("INSERT INTO story_interactions (id,target_id,target_kind,type,guest_hash,created_at) VALUES (?,'hot_reel','post','view',?,?)", `hv_${i}`, `h_${i}`, now);
        }
      });
      const view = (session: string) => writeSocialInteraction(db, { type: 'view', targetId: 'hot_reel' }, null, session, now) as any;
      const started = performance.now();
      expect(view('guest-session-hot-aaaaaaaaaaaa').data.recorded).toBe(true);
      expect(view('guest-session-hot-aaaaaaaaaaaa').data.recorded).toBe(false); // même visiteur : non compté
      for (let i = 0; i < 200; i++) view(`guest-session-bulk-${i}-aaaaaaaa`);
      const perView = (performance.now() - started) / 202;
      expect(socialInteractionCounts(db, 'hot_reel').views).toBe(20_201);
      // Avant correctif : balayage des 20 000 vues à chaque écriture (~20 ms ici).
      expect(perView).toBeLessThan(5);
      expect(db.socialTotalsDrift()).toEqual([]);
    } finally { db.close(); }
  });
});
