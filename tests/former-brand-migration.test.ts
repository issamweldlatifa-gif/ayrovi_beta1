/**
 * Migration des identifiants enregistrés à l'ancien nom (16/11/2026).
 * L'ancien nom n'est jamais écrit en clair : il vient de `shared/formerBrand.ts`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, test } from 'vitest';
import { FORMER_BRAND, FROZEN_CRYPTO_LABELS, mentionsFormerBrand, renameFormerBrand } from '../shared/formerBrand';
import { migrateFormerBrandIdentifiers, renameStoredValue } from '../src/db/formerBrandMigration';
import { adoptFormerBrandEnv } from '../src/config/formerBrandEnv';
import { QatafoDatabase } from '../src/db/database';

const old = FORMER_BRAND;
const OLD = FORMER_BRAND.toUpperCase();
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

function legacyDatabase(): { db: Database.Database; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'former-brand-'));
  dirs.push(dir);
  const file = path.join(dir, 'legacy.sqlite');
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${old}x_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, payload TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_${old}x_events_kind ON ${old}x_events(kind);
    CREATE TABLE ayweb_cart_${old}_links (
      id TEXT PRIMARY KEY,
      ${old}_cart_item_id TEXT NOT NULL UNIQUE,
      link_type TEXT NOT NULL DEFAULT '${OLD}_ORDER' CHECK(link_type IN ('${OLD}_ORDER','${OLD}_CART_ITEM','WORKER_PACKAGE')),
      event_id INTEGER REFERENCES ${old}x_events(id)
    );
    CREATE TABLE story_publishers (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE publications (id TEXT PRIMARY KEY, channel_id TEXT REFERENCES story_publishers(id), title TEXT NOT NULL);
    CREATE TABLE settings (setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL);
    CREATE TABLE customer_accounts (id TEXT PRIMARY KEY, email TEXT, display_name TEXT NOT NULL);
    CREATE TRIGGER trg_${old}_touch AFTER INSERT ON ${old}x_events BEGIN SELECT 1; END;
    CREATE VIEW v_${old}_links AS SELECT id, ${old}_cart_item_id FROM ayweb_cart_${old}_links;
  `);
  for (let i = 0; i < 5; i += 1) db.prepare(`INSERT INTO ${old}x_events (kind,payload) VALUES (?,?)`).run(`cart.bridge_to_${old}`, JSON.stringify({ [`${old}_pricing`]: { total: i }, source: old, url: `https://${old}.tn/p/${i}` }));
  db.prepare(`DELETE FROM ${old}x_events WHERE id=5`).run(); // le compteur AUTOINCREMENT doit rester à 5
  db.prepare(`INSERT INTO ayweb_cart_${old}_links VALUES ('l1','c1','${OLD}_CART_ITEM',1), ('l2','c2','WORKER_PACKAGE',2), ('l3','c3','${OLD}_ORDER',NULL)`).run();
  db.prepare(`INSERT INTO story_publishers VALUES ('pub_${old}','Zayrovi Team')`).run();
  db.prepare(`INSERT INTO publications VALUES ('p1','pub_${old}','Arrivage')`).run();
  db.prepare(`INSERT INTO settings VALUES ('contact_email','contact@${old}.tn'), ('site','https://www.${old}.tn/boutique'),
    ('slogan','La sélection ${OLD} de la semaine'), ('warehouse','${OLD}-WH-TN')`).run();
  db.prepare(`INSERT INTO customer_accounts VALUES ('a1','admin@${old}.tn','Client ${OLD}'), ('a2','x@example.com','Nadia')`).run();
  return { db, file };
}

describe('règles de renommage', () => {
  test('casse respectée, « zayrovi » jamais doublé, ancien domaine → zayrovi.com', () => {
    expect(renameFormerBrand(`${OLD} ${old[0].toUpperCase()}${old.slice(1)} ${old}`)).toBe('ZAYROVI Zayrovi zayrovi');
    expect(renameFormerBrand('zayrovi ZAYROVI')).toBe('zayrovi ZAYROVI');
    expect(renameFormerBrand(`https://www.${old}.tn/x contact@${old}.com`)).toBe('https://www.zayrovi.com/x contact@zayrovi.com');
    expect(mentionsFormerBrand('pub_zayrovi')).toBe(false);
    expect(mentionsFormerBrand(`pub_${old}`)).toBe(true);
    // nom technique du dépôt et des services Render : jamais touché (l'API des apps installées en dépend)
    expect(mentionsFormerBrand(`https://${old}-beta1-moo8.onrender.com`)).toBe(false);
    expect(renameFormerBrand(`${old}-beta1-1.onrender.com ${old}_beta1 ${old}-x`)).toBe(`${old}-beta1-1.onrender.com ${old}_beta1 zayrovi-x`);
  });

  test('valeurs stockées : identifiants et adresses web oui ; texte libre et e-mail de connexion non', () => {
    expect(renameStoredValue(`pub_${old}`, 'channel_id')).toBe('pub_zayrovi');
    expect(renameStoredValue(`${OLD}-WH-TN`, 'setting_value')).toBe('ZAYROVI-WH-TN');
    expect(renameStoredValue(`La sélection ${OLD}`, 'setting_value')).toBeNull();
    expect(renameStoredValue(`admin@${old}.tn`, 'email')).toBeNull();
    expect(renameStoredValue(`contact@${old}.tn`, 'setting_value')).toBe('contact@zayrovi.com');
    expect(renameStoredValue(`Client ${OLD}`, 'display_name')).toBe('Client ZAYROVI');
    expect(renameStoredValue(`/media/logo-${old}.png`, 'setting_value')).toBe('/media/logo-zayrovi.png');
    expect(renameStoredValue(`${old}-beta1-moo8.onrender.com`, 'api_host')).toBeNull();
    const Old = `${old[0].toUpperCase()}${old.slice(1)}`;
    expect(renameStoredValue(JSON.stringify({ font: `'${Old} Extracted Sans', sans-serif` }), 'setting_value'))
      .toBe(JSON.stringify({ font: "'Zayrovi Extracted Sans', sans-serif" }));
    expect(renameStoredValue(JSON.stringify({ logoUrl: `/media/logo-${old}.png`, title: `Mode ${OLD}` }), 'setting_value'))
      .toBe(JSON.stringify({ logoUrl: '/media/logo-zayrovi.png', title: `Mode ${OLD}` }));
  });

  test('les étiquettes cryptographiques restent figées octet pour octet', () => {
    // Elles protègent des données déjà chiffrées : les changer bloquerait les administrateurs.
    expect(Object.values(FROZEN_CRYPTO_LABELS).every((label) => label.startsWith(old))).toBe(true);
    expect(FROZEN_CRYPTO_LABELS.adminTotp).toBe(`${old}-admin-totp:v1:`);
    expect(FROZEN_CRYPTO_LABELS.authMail).toBe(`${old}-auth-mail-v1`);
  });
});

describe('migration d’une base existante', () => {
  test('tables, colonnes, codes, index, déclencheurs, vues et valeurs passent à ZAYROVI sans perte', () => {
    const { db, file } = legacyDatabase();
    const report = migrateFormerBrandIdentifiers(db, file)!;
    expect(report.tables.map((t) => t.to).sort()).toEqual(['ayweb_cart_zayrovi_links', 'zayrovix_events']);
    expect(report.backup).toMatch(/^pre-brand-rename-.*\.sqlite$/);
    expect(fs.existsSync(path.join(path.dirname(file), 'backups', report.backup!))).toBe(true);

    const names = (db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>).map((r) => r.name);
    expect(names.filter(mentionsFormerBrand)).toEqual([]);
    expect(names).toEqual(expect.arrayContaining(['zayrovix_events', 'idx_zayrovix_events_kind', 'trg_zayrovi_touch', 'v_zayrovi_links']));
    const schemaSql = (db.prepare('SELECT group_concat(sql, char(10)) AS s FROM sqlite_master').get() as { s: string }).s;
    expect(mentionsFormerBrand(schemaSql)).toBe(false);

    // lignes et codes d'énumération
    expect(db.prepare('SELECT COUNT(*) n FROM zayrovix_events').get()).toEqual({ n: 4 });
    expect(db.prepare('SELECT id, zayrovi_cart_item_id AS c, link_type FROM ayweb_cart_zayrovi_links ORDER BY id').all()).toEqual([
      { id: 'l1', c: 'c1', link_type: 'ZAYROVI_CART_ITEM' },
      { id: 'l2', c: 'c2', link_type: 'WORKER_PACKAGE' },
      { id: 'l3', c: 'c3', link_type: 'ZAYROVI_ORDER' },
    ]);
    // la contrainte suit : l'ancien code est refusé, le nouveau accepté
    expect(() => db.prepare(`INSERT INTO ayweb_cart_zayrovi_links (id,zayrovi_cart_item_id,link_type) VALUES ('x','cx','${OLD}_ORDER')`).run()).toThrow();
    db.prepare("INSERT INTO ayweb_cart_zayrovi_links (id,zayrovi_cart_item_id) VALUES ('l4','c4')").run();
    expect(db.prepare("SELECT link_type FROM ayweb_cart_zayrovi_links WHERE id='l4'").get()).toEqual({ link_type: 'ZAYROVI_ORDER' });
    // compteur AUTOINCREMENT conservé : l'identifiant 5 supprimé n'est jamais réattribué
    expect(db.prepare("INSERT INTO zayrovix_events (kind) VALUES ('k')").run().lastInsertRowid).toBe(6);

    // valeurs : identifiants, JSON, adresses web ; clés étrangères intactes
    const event = db.prepare('SELECT kind, payload FROM zayrovix_events WHERE id=1').get() as { kind: string; payload: string };
    expect(event.kind).toBe('cart.bridge_to_zayrovi');
    expect(JSON.parse(event.payload)).toEqual({ zayrovi_pricing: { total: 0 }, source: 'zayrovi', url: 'https://zayrovi.com/p/0' });
    expect(db.prepare('SELECT id FROM story_publishers').all()).toEqual([{ id: 'pub_zayrovi' }]);
    expect(db.prepare('SELECT channel_id FROM publications').get()).toEqual({ channel_id: 'pub_zayrovi' });
    expect(db.pragma('foreign_key_check')).toEqual([]);
    const setting = (key: string) => (db.prepare('SELECT setting_value v FROM settings WHERE setting_key=?').get(key) as { v: string }).v;
    expect(setting('contact_email')).toBe('contact@zayrovi.com');
    expect(setting('site')).toBe('https://www.zayrovi.com/boutique');
    expect(setting('warehouse')).toBe('ZAYROVI-WH-TN');
    expect(setting('slogan')).toBe(`La sélection ${OLD} de la semaine`); // texte écrit par une personne
    // identité de connexion jamais modifiée ; nom provisoire comparé par le code : renommé
    expect(db.prepare("SELECT email, display_name FROM customer_accounts WHERE id='a1'").get()).toEqual({ email: `admin@${old}.tn`, display_name: 'Client ZAYROVI' });

    // rejouable : rien à faire la deuxième fois
    expect(migrateFormerBrandIdentifiers(db, file)).toBeNull();
    db.close();
  });

  test('une table neuve et vide créée par un démarrage interrompu cède la place à l’historique', () => {
    const { db, file } = legacyDatabase();
    db.exec('CREATE TABLE zayrovix_events (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, payload TEXT)');
    migrateFormerBrandIdentifiers(db, file);
    expect(db.prepare('SELECT COUNT(*) n FROM zayrovix_events').get()).toEqual({ n: 4 });
    db.close();
  });

  test('si les deux tables ont des lignes, rien ne change (transaction annulée, aucune perte)', () => {
    const { db, file } = legacyDatabase();
    db.exec("CREATE TABLE zayrovix_events (id INTEGER PRIMARY KEY, kind TEXT); INSERT INTO zayrovix_events VALUES (1,'neuf')");
    expect(() => migrateFormerBrandIdentifiers(db, file)).toThrow(/BRAND_MIGRATION_CONFLICT/);
    expect(db.prepare(`SELECT COUNT(*) n FROM ${old}x_events`).get()).toEqual({ n: 4 });
    expect(db.prepare(`SELECT id FROM story_publishers`).get()).toEqual({ id: `pub_${old}` });
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    db.close();
  });

  test('une base neuve de l’application est marquée migrée et ne contient aucun ancien identifiant', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'former-brand-fresh-'));
    dirs.push(dir);
    const file = path.join(dir, 'fresh.sqlite');
    const fresh = new QatafoDatabase(file);
    expect(fresh.get<any>("SELECT key FROM brand_migrations WHERE key='former_brand_identifiers_v1'")).toBeTruthy();
    const names = fresh.all<any>("SELECT name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'");
    expect(names.filter((row: any) => mentionsFormerBrand(row.name) || mentionsFormerBrand(row.sql ?? ''))).toEqual([]);
    fresh.close?.();
    // réouverture : aucune sauvegarde, aucun travail
    const again = new QatafoDatabase(file);
    expect(fs.existsSync(path.join(dir, 'backups')) ? fs.readdirSync(path.join(dir, 'backups')).filter((f) => f.startsWith('pre-brand')) : []).toEqual([]);
    again.close?.();
  });
});

describe('anciennes variables d’environnement', () => {
  test('adoptées sous le nouveau nom sans jamais écraser une valeur nouvelle', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', [`${OLD}_CACHE_ROOT`]: '/old', [`${OLD}X_QUOTE_SECRET`]: 's1', ZAYROVI_BASE_URL: 'new', [`${OLD}_BASE_URL`]: 'old' };
    expect(adoptFormerBrandEnv(env).sort()).toEqual(['ZAYROVIX_QUOTE_SECRET', 'ZAYROVI_CACHE_ROOT']);
    expect(env.ZAYROVI_CACHE_ROOT).toBe('/old');
    expect(env.ZAYROVIX_QUOTE_SECRET).toBe('s1');
    expect(env.ZAYROVI_BASE_URL).toBe('new');
  });
});

describe('passerelle HTTP pour l’ancien nom', () => {
  test('chemin → 308 vers le nom ZAYROVI ; en-têtes et cookies recopiés, session conservée', async () => {
    const { formerBrandCompat, renameCookieHeader } = await import('../src/services/formerBrandCompat');
    let redirected: [number, string] | null = null;
    const res = { redirect: (status: number, url: string) => { redirected = [status, url]; } } as any;
    let passed = false;
    formerBrandCompat({ path: `/api/${old}x/detect`, originalUrl: `/api/${old}x/detect?x=1`, headers: {} } as any, res, () => { passed = true; });
    expect(redirected).toEqual([308, '/api/zayrovix/detect?x=1']);
    expect(passed).toBe(false);

    const req = { path: '/api/cart', originalUrl: '/api/cart', headers: { [`x-${old}-client`]: 'mobile/2.0.8', cookie: `${old}_customer_session=tok; other=1` } } as any;
    formerBrandCompat(req, res, () => { passed = true; });
    expect(passed).toBe(true);
    expect(req.headers['x-zayrovi-client']).toBe('mobile/2.0.8');
    expect(req.headers.cookie).toBe(`${old}_customer_session=tok; other=1; zayrovi_customer_session=tok`);
    // un cookie au nouveau nom déjà présent gagne toujours
    expect(renameCookieHeader(`${old}_s=a; zayrovi_s=b`)).toBe(`${old}_s=a; zayrovi_s=b`);
  });
});

describe('préférences du navigateur à l’ancien nom', () => {
  test('recopiées sous le nouveau nom, sans écraser une valeur nouvelle, puis effacées', async () => {
    const memory = () => {
      const map = new Map<string, string>();
      return {
        get length() { return map.size; },
        key: (i: number) => [...map.keys()][i] ?? null,
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => { map.set(k, v); },
        removeItem: (k: string) => { map.delete(k); },
        clear: () => map.clear(),
        dump: () => Object.fromEntries(map),
      };
    };
    const local = memory();
    const session = memory();
    local.setItem(`${old}_session_id`, 'guest-1');
    local.setItem(`${old}.locale.v1`, 'ar');
    local.setItem(`${old}_saved`, 'old');
    local.setItem('zayrovi_saved', 'new');
    session.setItem(`${old}x-theme`, 'dark');
    (globalThis as any).window = { localStorage: local, sessionStorage: session };
    try {
      const { migrateFormerBrandStorage } = await import('../client/src/services/formerBrandStorage');
      expect(local.dump()).toEqual({ zayrovi_session_id: 'guest-1', 'zayrovi.locale.v1': 'ar', zayrovi_saved: 'new' });
      expect(session.dump()).toEqual({ 'zayrovix-theme': 'dark' });
      expect(migrateFormerBrandStorage()).toBe(0);
    } finally {
      delete (globalThis as any).window;
    }
  });
});
