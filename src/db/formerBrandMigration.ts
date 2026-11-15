/**
 * MIGRATION DE MARQUE — identifiants enregistrés (16/11/2026).
 *
 * Le code dit désormais ZAYROVI partout : tables `zayrovix_*`, colonne
 * `zayrovi_cart_item_id`, codes `ZAYROVI_ORDER`, éditeur `pub_zayrovi`, catégorie
 * de news `ZAYROVI`, domaine `zayrovi.com`… Une base créée avant ce jour porte
 * encore l'ancien nom (voir `shared/formerBrand.ts`). Cette migration la remet
 * d'accord avec le code, AVANT que le schéma ne soit initialisé — sinon
 * `CREATE TABLE IF NOT EXISTS zayrovix_events` créerait une table vide à côté de
 * l'ancienne et l'historique disparaîtrait de l'interface.
 *
 * Garanties :
 *  • UNE transaction : tout passe, ou rien ne change (aucun état à moitié migré).
 *  • Aucune ligne perdue : chaque table est reconstruite (procédure officielle
 *    SQLite : créer, copier, supprimer, renommer), index et déclencheurs recréés,
 *    compteur AUTOINCREMENT conservé ; le nombre de lignes est vérifié table par
 *    table et toute nouvelle violation de clé étrangère annule l'ensemble.
 *  • Rejouable : une base déjà migrée ne contient plus rien à renommer ; un
 *    marqueur évite de relire les données à chaque démarrage.
 *  • Prudente avec le texte : seules les valeurs qui sont des IDENTIFIANTS (sans
 *    espace : `pub_…`, `…_ORDER`, `cart.bridge_to_…`), les chemins de fichiers du
 *    site (`/media/logo-….png`) et les adresses web du domaine sont renommés. Un texte écrit par une personne n'est pas réécrit ;
 *    les adresses e-mail de CONNEXION (`email`) ne sont jamais modifiées — changer
 *    l'identifiant de quelqu'un dans son dos le bloquerait dehors.
 *  • Sauvegarde vérifiée avant toute modification, quand le disque a la place.
 */
import type Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { FORMER_BRAND, FORMER_EXACT_TEXT_VALUES, FORMER_TECHNICAL_PHRASES, mentionsFormerBrand, renameFormerBrand } from '../../shared/formerBrand';

const MARKER_TABLE = 'brand_migrations';
const DATA_MARKER = 'former_brand_identifiers_v1';
const IDENTIFIER = /^[A-Za-z0-9_.:-]+$/;
/** Chemin du site (`/media/logo-….png`) : les fichiers publics ont été renommés. */
const SITE_PATH = /^\/[A-Za-z0-9_.\/-]+$/;
const FORMER_HOST = new RegExp(String.raw`(https?:\/\/)(www\.|test\.)?${FORMER_BRAND}\.(?:tn|com)\b`, 'gi');
const FORMER_MAIL = new RegExp(String.raw`@(test\.)?${FORMER_BRAND}\.(?:tn|com)\b`, 'gi');
/** Colonnes d'identité de connexion : jamais réécrites (voir l'en-tête). */
const LOGIN_COLUMN = /(^|_)(email|login|username)$/i;

export interface FormerBrandMigrationReport {
  tables: Array<{ from: string; to: string; rows: number }>;
  objects: string[];
  values: number;
  backup: string | null;
}

type SchemaRow = { type: string; name: string; tbl_name: string; sql: string | null };

const q = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
const lit = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** Valeur stockée → valeur renommée, ou `null` si elle doit rester telle quelle. */
export function renameStoredValue(value: string, column: string): string | null {
  const exact = FORMER_EXACT_TEXT_VALUES.find(([before]) => before === value);
  if (exact) return exact[1];
  if ((IDENTIFIER.test(value) || SITE_PATH.test(value)) && mentionsFormerBrand(value) && !value.includes('@')) return renameFormerBrand(value);
  const trimmed = value.trimStart();
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && mentionsFormerBrand(value)) {
    try {
      let changed = false;
      const walk = (node: unknown): unknown => {
        if (typeof node === 'string') {
          const next = renameStoredValue(node, column);
          if (next !== null && next !== node) { changed = true; return next; }
          return node;
        }
        if (Array.isArray(node)) return node.map(walk);
        if (node && typeof node === 'object') {
          return Object.fromEntries(Object.entries(node).map(([key, item]) => {
            const renamedKey = IDENTIFIER.test(key) && mentionsFormerBrand(key) ? renameFormerBrand(key) : key;
            if (renamedKey !== key) changed = true;
            return [renamedKey, walk(item)];
          }));
        }
        return node;
      };
      const next = walk(JSON.parse(value));
      if (changed) return JSON.stringify(next);
    } catch { /* texte qui ressemble à du JSON sans en être : on passe aux adresses */ }
  }
  let next = FORMER_TECHNICAL_PHRASES.reduce((text, [before, after]) => text.split(before).join(after), value);
  next = next.replace(FORMER_HOST, (_m, scheme: string, sub: string | undefined) => `${scheme}${sub ?? ''}zayrovi.com`);
  if (!LOGIN_COLUMN.test(column)) next = next.replace(FORMER_MAIL, (_m, sub: string | undefined) => `@${sub ?? ''}zayrovi.com`);
  return next !== value ? next : null;
}

function schema(db: Database.Database): SchemaRow[] {
  return db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all() as SchemaRow[];
}

function needsSchemaWork(rows: SchemaRow[]): boolean {
  return rows.some((row) => mentionsFormerBrand(row.name) || mentionsFormerBrand(row.sql ?? ''));
}

function hasMarker(db: Database.Database): boolean {
  const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(MARKER_TABLE);
  return Boolean(table && db.prepare(`SELECT 1 FROM ${MARKER_TABLE} WHERE key=?`).get(DATA_MARKER));
}

function backupFirst(db: Database.Database, databasePath: string | null): string | null {
  if (!databasePath || databasePath === ':memory:' || !fs.existsSync(databasePath)) return null;
  const directory = path.join(path.dirname(path.resolve(databasePath)), 'backups');
  try {
    const size = fs.statSync(databasePath).size;
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const free = (() => { try { const s = fs.statfsSync(directory); return Number(s.bavail) * Number(s.bsize); } catch { return Infinity; } })();
    // Un disque plein empêche SQLite d'écrire : sans place pour une copie ET la
    // marge de la transaction, on migre sans copie (la transaction reste atomique).
    if (free < size * 3) {
      console.warn('[database] migration de marque : place insuffisante pour une sauvegarde, migration atomique sans copie.');
      return null;
    }
    const destination = path.join(directory, `pre-brand-rename-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.exec(`VACUUM INTO ${lit(destination)}`);
    fs.chmodSync(destination, 0o600);
    return path.basename(destination);
  } catch (error) {
    console.warn(`[database] migration de marque : sauvegarde impossible (${String((error as Error)?.message || error)}), migration atomique sans copie.`);
    return null;
  }
}

/** Remplace le nom dans l'en-tête `CREATE TABLE <nom>` d'une définition stockée. */
function withTableName(sql: string, name: string): string {
  return sql.replace(/^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"(?:[^"]|"")+"|`[^`]+`|\[[^\]]+\]|'[^']+'|[^\s(]+)/i, `CREATE TABLE ${q(name)}`);
}

function rebuildTable(db: Database.Database, table: SchemaRow, report: FormerBrandMigrationReport): void {
  const target = renameFormerBrand(table.name);
  const existing = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(target);
  if (existing && target !== table.name) {
    const rows = (db.prepare(`SELECT COUNT(*) AS n FROM ${q(target)}`).get() as { n: number }).n;
    // Une table neuve et vide a pu être créée par un démarrage interrompu : elle cède la place.
    if (rows > 0) throw new Error(`BRAND_MIGRATION_CONFLICT:${table.name}->${target} (${rows} lignes des deux côtés)`);
    db.exec(`DROP TABLE ${q(target)}`);
  }
  const temporary = `__brand_rename_${target}`;
  const attached = schema(db).filter((row) => row.tbl_name === table.name && row.type !== 'table' && row.sql);
  const before = (db.prepare(`SELECT COUNT(*) AS n FROM ${q(table.name)}`).get() as { n: number }).n;
  const sequence = (() => {
    try { return (db.prepare('SELECT seq FROM sqlite_sequence WHERE name=?').get(table.name) as { seq: number } | undefined)?.seq; } catch { return undefined; }
  })();

  db.exec(withTableName(renameFormerBrand(table.sql!), temporary));
  // Codes d'énumération cités par la définition (CHECK, DEFAULT) : les lignes suivent.
  const codes = [...new Set([...table.sql!.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'")))]
    .filter(mentionsFormerBrand);
  const oldColumns = (db.prepare(`PRAGMA table_xinfo(${q(table.name)})`).all() as Array<{ name: string; hidden: number }>)
    .filter((column) => column.hidden === 0);
  const newColumns = new Set((db.prepare(`PRAGMA table_xinfo(${q(temporary)})`).all() as Array<{ name: string; hidden: number }>)
    .filter((column) => column.hidden === 0).map((column) => column.name));
  const pairs = oldColumns
    .map((column) => ({ from: column.name, to: renameFormerBrand(column.name) }))
    .filter((pair) => newColumns.has(pair.to));
  const select = pairs.map(({ from }) => {
    if (!codes.length) return q(from);
    return `CASE ${q(from)} ${codes.map((code) => `WHEN ${lit(code)} THEN ${lit(renameFormerBrand(code))}`).join(' ')} ELSE ${q(from)} END`;
  });
  db.exec(`INSERT INTO ${q(temporary)} (${pairs.map(({ to }) => q(to)).join(',')}) SELECT ${select.join(',')} FROM ${q(table.name)}`);
  const after = (db.prepare(`SELECT COUNT(*) AS n FROM ${q(temporary)}`).get() as { n: number }).n;
  if (after !== before) throw new Error(`BRAND_MIGRATION_ROWCOUNT:${table.name} ${before}->${after}`);

  db.exec(`DROP TABLE ${q(table.name)}`);
  db.exec(`ALTER TABLE ${q(temporary)} RENAME TO ${q(target)}`);
  if (sequence !== undefined) db.prepare('UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name=?').run(sequence, target);
  for (const object of attached) db.exec(renameFormerBrand(object.sql!));
  report.tables.push({ from: table.name, to: target, rows: after });
}

function foreignKeyViolations(db: Database.Database): number {
  return (db.pragma('foreign_key_check') as unknown[]).length;
}

function renameIdentifierValues(db: Database.Database): number {
  let changed = 0;
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>)
    .map((row) => row.name).filter((name) => name !== MARKER_TABLE && !name.startsWith('__brand_rename_'));
  for (const table of tables) {
    let columns: Array<{ name: string; type: string; hidden: number }>;
    try { columns = db.prepare(`PRAGMA table_xinfo(${q(table)})`).all() as typeof columns; } catch { continue; }
    for (const column of columns) {
      if (column.hidden !== 0 || /BLOB|INT|REAL|NUM|FLOA|DOUB|BOOL|DATE/i.test(column.type || '') && !/CHAR|TEXT|CLOB/i.test(column.type || '')) continue;
      const values = db.prepare(`SELECT DISTINCT ${q(column.name)} AS v FROM ${q(table)} WHERE typeof(${q(column.name)})='text' AND instr(lower(${q(column.name)}),?)>0`)
        .all(FORMER_BRAND) as Array<{ v: string }>;
      const update = db.prepare(`UPDATE OR IGNORE ${q(table)} SET ${q(column.name)}=? WHERE ${q(column.name)}=?`);
      for (const { v } of values) {
        const next = renameStoredValue(v, column.name);
        if (next !== null && next !== v) changed += update.run(next, v).changes;
      }
    }
  }
  return changed;
}

/** Base créée aujourd'hui avec les noms ZAYROVI : rien à migrer, jamais. */
export function markFormerBrandMigrated(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS ${MARKER_TABLE} (key TEXT PRIMARY KEY, applied_at TEXT NOT NULL, report TEXT NOT NULL DEFAULT '')`);
  db.prepare(`INSERT OR IGNORE INTO ${MARKER_TABLE} (key,applied_at,report) VALUES (?,?,'fresh')`).run(DATA_MARKER, new Date().toISOString());
}

/**
 * Point d'entrée, appelé à l'ouverture de la base, avant `initSchema`.
 * Ne fait rien (lecture de `sqlite_master` + marqueur) sur une base déjà à jour.
 */
export function migrateFormerBrandIdentifiers(db: Database.Database, databasePath: string | null = null): FormerBrandMigrationReport | null {
  const rows = schema(db);
  const schemaWork = needsSchemaWork(rows);
  const userTables = rows.filter((row) => row.type === 'table' && row.name !== MARKER_TABLE);
  const markerPresent = hasMarker(db);
  if (!schemaWork && markerPresent) return null;

  const report: FormerBrandMigrationReport = { tables: [], objects: [], values: 0, backup: null };
  // Base neuve : rien à lire, seulement le marqueur.
  if (userTables.length && (schemaWork || !markerPresent)) report.backup = backupFirst(db, databasePath);

  const foreignKeys = db.pragma('foreign_keys', { simple: true });
  db.pragma('foreign_keys = OFF');
  // Renommer sans réécrire les références ailleurs : chaque objet concerné est
  // lui-même recréé avec sa définition renommée.
  db.pragma('legacy_alter_table = ON');
  try {
    db.transaction(() => {
      const violationsBefore = foreignKeyViolations(db);
      const current = schema(db);
      const views = current.filter((row) => row.type === 'view' && (mentionsFormerBrand(row.name) || mentionsFormerBrand(row.sql ?? '')));
      for (const view of views) db.exec(`DROP VIEW ${q(view.name)}`);
      for (const table of current.filter((row) => row.type === 'table' && row.sql && !row.sql.startsWith('CREATE VIRTUAL'))) {
        if (mentionsFormerBrand(table.name) || mentionsFormerBrand(table.sql)) rebuildTable(db, table, report);
      }
      // Index et déclencheurs renommés sur des tables qui, elles, ne changent pas.
      for (const object of schema(db).filter((row) => (row.type === 'index' || row.type === 'trigger') && row.sql)) {
        if (!mentionsFormerBrand(object.name) && !mentionsFormerBrand(object.sql!)) continue;
        db.exec(`DROP ${object.type.toUpperCase()} ${q(object.name)}`);
        db.exec(renameFormerBrand(object.sql!));
        report.objects.push(`${object.type}:${object.name}`);
      }
      for (const view of views) {
        db.exec(renameFormerBrand(view.sql!));
        report.objects.push(`view:${view.name}`);
      }
      if (!markerPresent) report.values = renameIdentifierValues(db);
      const violationsAfter = foreignKeyViolations(db);
      if (violationsAfter > violationsBefore) throw new Error(`BRAND_MIGRATION_FOREIGN_KEYS:${violationsBefore}->${violationsAfter}`);
      db.exec(`CREATE TABLE IF NOT EXISTS ${MARKER_TABLE} (key TEXT PRIMARY KEY, applied_at TEXT NOT NULL, report TEXT NOT NULL DEFAULT '')`);
      db.prepare(`INSERT OR REPLACE INTO ${MARKER_TABLE} (key,applied_at,report) VALUES (?,?,?)`)
        .run(DATA_MARKER, new Date().toISOString(), JSON.stringify({ ...report, tables: report.tables.length }));
    })();
  } finally {
    db.pragma('legacy_alter_table = OFF');
    db.pragma(`foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`);
  }
  if (report.tables.length || report.objects.length || report.values) {
    console.info(`[database] migration de marque : ${report.tables.length} table(s), ${report.objects.length} objet(s), ${report.values} valeur(s)`
      + (report.backup ? ` — sauvegarde ${report.backup}` : ''));
  }
  return report;
}
