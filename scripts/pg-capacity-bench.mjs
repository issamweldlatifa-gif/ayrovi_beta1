#!/usr/bin/env node
/**
 * AYROVI — analyse PostgreSQL : compatibilité RÉELLE + capacité MESURÉE
 * (audit d'architecture du 12/11/2026, §7 de docs/AYROVI_ARCHITECTURE_SCALABLE_AR_2026-11-12.md).
 *
 *   node scripts/sql-capture.cjs --db data/qatafo.sqlite --out sql-capture.json      # 1. requêtes réelles
 *   node scripts/pg-capacity-bench.mjs --sqlite data/qatafo.sqlite \
 *        --pg-url postgres://user:pass@host:5432/db --capture sql-capture.json --out pg-bench.json
 *
 * Ce que fait le script, dans l'ordre (rien n'est simulé ni réécrit à la main) :
 *  1. AUDIT DU CODE : compte, module par module, les appels synchrones et les
 *     tournures propres à SQLite qu'une migration devra traiter.
 *  2. SCHÉMA : traduit mécaniquement CHAQUE table, contrainte, clé étrangère et
 *     index de la base SQLite vers PostgreSQL et compte ce qui passe / échoue.
 *  3. DONNÉES : copie toutes les lignes (les rejets sont comptés, pas masqués).
 *  4. REQUÊTES : rejoue sur PostgreSQL le SQL EXACT capturé sur le serveur réel
 *     (`scripts/sql-capture.cjs`) — seuls `?`→`$n` et GROUP_CONCAT→string_agg
 *     sont traduits ; tout autre écart est rapporté tel quel.
 *  5. CAPACITÉ LECTURE : rejoue le mélange de l'application (mêmes pondérations
 *     que `scripts/load-test.mjs`) à 1…64 connexions ; mesure le débit, la
 *     latence, le CPU consommé PAR REQUÊTE APPLICATIVE côté PostgreSQL et côté
 *     pilote `pg` (ce dernier s'ajoute au CPU du serveur web après migration).
 *  6. CAPACITÉ ÉCRITURE : la transaction réelle d'une vue de Reel (10 requêtes,
 *     déclencheurs de compteurs portés en PL/pgSQL), contenus répartis et
 *     « Reel viral » (toutes les vues sur le même compteur : contention de ligne).
 *  Les étapes 5–6 tournent aussi sur SQLite (copie de la base) pour comparer
 *  sur le MÊME processeur.
 *
 * Garde-fous : la base PostgreSQL visée est VIDÉE (schéma `public`) — ne jamais
 * pointer vers une base de production. SQLite est ouverte en lecture seule
 * (les écritures se font sur une copie temporaire).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
let pg;
try { pg = require('pg'); } catch { console.error('Le paquet `pg` est requis (npm i -D pg).'); process.exit(2); }

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const SQLITE = arg('sqlite', 'data/qatafo.sqlite');
const PG_URL = arg('pg-url', '');
const CAPTURE = arg('capture', 'sql-capture.json');
const OUT = arg('out', '');
const DURATION = Number(arg('duration', '10'));
const CONCURRENCY = String(arg('concurrency', '1,4,16,64')).split(',').map(Number).filter((n) => n > 0);
const SKIP_LOAD = process.argv.includes('--skip-load');
const SRC = arg('src', 'src');
if (!PG_URL) { console.error('--pg-url requis (base JETABLE : elle est vidée).'); process.exit(2); }

const report = { at: new Date().toISOString(), host: { cpus: os.cpus().length, cpu: os.cpus()[0]?.model, affinity: affinity() }, sqlite: SQLITE };
const log = (...a) => console.log(...a);
const q = (id) => `"${id.replace(/"/g, '""')}"`;
const pct = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function affinity() {
  try { return fs.readFileSync('/proc/self/status', 'utf8').match(/Cpus_allowed_list:\s*(.+)/)?.[1]; } catch { return null; }
}

// ───────────────────────── 1. audit du code ─────────────────────────
function auditSource(root) {
  const patterns = {
    syncCalls: /\b(?:db|this|database|store)\.(?:get|all|run)(?:<[^>]*>)?\(/g,
    transactions: /\.transaction\(/g,
    insertOrIgnore: /INSERT\s+OR\s+IGNORE/gi,
    insertOrReplace: /INSERT\s+OR\s+REPLACE|REPLACE\s+INTO/gi,
    groupConcat: /GROUP_CONCAT\s*\(/gi,
    dateFunctions: /\b(?:datetime|strftime|julianday|date)\s*\(\s*'/gi,
    jsonFunctions: /\bjson_(?:extract|each|object|array|group_array|set)\s*\(/gi,
    instr: /\binstr\s*\(/gi,
    ifnull: /\bIFNULL\s*\(/gi,
    likeOperator: /\sLIKE\s/g, // insensible à la casse en SQLite, SENSIBLE en PostgreSQL (→ ILIKE)
    collateNocase: /COLLATE\s+NOCASE/gi,
    pragma: /\bPRAGMA\b|\.pragma\(/g,
    sqliteMaster: /sqlite_master|sqlite_schema/g,
    rowid: /\browid\b/gi,
    lastInsertRowid: /lastInsertRowid|last_insert_rowid/g,
    isNot: /\bIS\s+NOT\s+(?!NULL\b|DISTINCT\b)[A-Za-z_]/g, // `a IS NOT b` : PostgreSQL exige IS DISTINCT FROM
  };
  const totals = Object.fromEntries(Object.keys(patterns).map((k) => [k, 0]));
  const modules = {};
  let files = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.ts$/.test(entry.name) && !/\.generated\.ts$/.test(entry.name)) {
        files++;
        const text = fs.readFileSync(full, 'utf8');
        const mod = path.relative(root, full).split(path.sep)[0].replace(/\.ts$/, '') || '(racine)';
        for (const [key, re] of Object.entries(patterns)) {
          const n = (text.match(re) || []).length;
          if (!n) continue;
          totals[key] += n;
          modules[mod] = modules[mod] || { syncCalls: 0, dialect: 0 };
          if (key === 'syncCalls') modules[mod].syncCalls += n; else if (key !== 'transactions') modules[mod].dialect += n;
        }
      }
    }
  };
  walk(root);
  const top = Object.entries(modules).sort((a, b) => b[1].syncCalls - a[1].syncCalls).slice(0, 12).map(([module, v]) => ({ module, ...v }));
  return { files, totals, modulesTouched: Object.keys(modules).length, topModules: top };
}

// ───────────────────────── 2. schéma ─────────────────────────
function pgType(declared) {
  const t = String(declared || '').toUpperCase();
  if (t.includes('INT')) return 'BIGINT';
  if (/REAL|FLOA|DOUB/.test(t)) return 'DOUBLE PRECISION';
  if (t.includes('BLOB')) return 'BYTEA';
  if (/NUMERIC|DECIMAL/.test(t)) return 'NUMERIC';
  return 'TEXT';
}
function pgDefault(value) {
  if (value == null) return null;
  const v = String(value).trim();
  if (/^-?\d+(\.\d+)?$/.test(v) || /^'.*'$/s.test(v) || /^NULL$/i.test(v)) return v;
  if (/^CURRENT_TIMESTAMP$/i.test(v)) return "to_char(now() at time zone 'UTC','YYYY-MM-DD HH24:MI:SS')";
  if (/^\(?\s*datetime\s*\(\s*'now'\s*\)\s*\)?$/i.test(v)) return "to_char(now() at time zone 'UTC','YYYY-MM-DD HH24:MI:SS')";
  if (/^\(?\s*strftime\s*\(\s*'%Y-%m-%dT%H:%M:%fZ'\s*,\s*'now'\s*\)\s*\)?$/i.test(v)) return "to_char(now() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')";
  if (/^"(.*)"$/s.test(v)) return `'${v.slice(1, -1).replace(/'/g, "''")}'`;
  return v; // tenté tel quel ; l'échec éventuel est compté
}
/** Extrait les expressions CHECK(...) d'un CREATE TABLE SQLite (parenthèses équilibrées). */
function checkExpressions(sql) {
  const out = [];
  const re = /\bCHECK\s*\(/gi;
  let m;
  while ((m = re.exec(sql))) {
    let depth = 1; let i = re.lastIndex; let quote = null;
    for (; i < sql.length && depth; i++) {
      const c = sql[i];
      if (quote) { if (c === quote) quote = null; continue; }
      if (c === "'" || c === '"') quote = c; else if (c === '(') depth++; else if (c === ')') depth--;
    }
    out.push(sql.slice(re.lastIndex, i - 1));
  }
  return out;
}
/** `?` → `$n` hors chaînes ; GROUP_CONCAT(x) → string_agg((x)::text, ',') ; IFNULL → COALESCE. */
export function translateSql(sql) {
  let n = 0; let out = ''; let quote = null;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (quote) { out += c; if (c === quote) quote = null; continue; }
    if (c === "'" || c === '"') { quote = c; out += c; continue; }
    if (c === '?') { out += `$${++n}`; continue; }
    out += c;
  }
  out = out.replace(/GROUP_CONCAT\s*\(([^()]*)\)/gi, (_, expr) => `string_agg((${expr})::text, ',')`);
  out = out.replace(/\bIFNULL\s*\(/gi, 'COALESCE(');
  return out;
}

async function buildSchema(lite, client) {
  const result = { tables: { ok: 0, failed: [] }, uniques: { ok: 0, failed: [] }, indexes: { ok: 0, failed: [], nocaseDropped: 0 }, checks: { ok: 0, failed: [] }, foreignKeys: { ok: 0, failed: [] }, triggers: { sqlite: 0, portedByHand: 0 } };
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const tables = lite.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const identityTables = new Map();
  for (const { name } of tables) {
    const cols = lite.prepare('SELECT * FROM pragma_table_info(?) ORDER BY cid').all(name);
    const pk = cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk);
    const singleIntPk = pk.length === 1 && /^INTEGER$/i.test(pk[0].type);
    const defs = cols.map((c) => {
      if (singleIntPk && c.name === pk[0].name) { identityTables.set(name, c.name); return `${q(c.name)} BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY`; }
      const d = pgDefault(c.dflt_value);
      return `${q(c.name)} ${pgType(c.type)}${c.notnull ? ' NOT NULL' : ''}${d != null ? ` DEFAULT ${d}` : ''}`;
    });
    if (pk.length && !singleIntPk) defs.push(`PRIMARY KEY (${pk.map((c) => q(c.name)).join(',')})`);
    try { await client.query(`CREATE TABLE ${q(name)} (${defs.join(', ')})`); result.tables.ok++; }
    catch (e) { result.tables.failed.push({ table: name, error: e.message }); }
    for (const ix of lite.prepare('SELECT * FROM pragma_index_list(?)').all(name).filter((i) => i.origin === 'u')) {
      const columns = lite.prepare('SELECT name FROM pragma_index_info(?) ORDER BY seqno').all(ix.name).map((r) => q(r.name));
      try { await client.query(`ALTER TABLE ${q(name)} ADD UNIQUE (${columns.join(',')})`); result.uniques.ok++; }
      catch (e) { result.uniques.failed.push({ table: name, error: e.message }); }
    }
  }
  return { result, tables, identityTables };
}

async function finishSchema(lite, client, tables, identityTables, result) {
  for (const { sql } of lite.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL").all()) {
    let text = sql.replace(/\bIF\s+NOT\s+EXISTS\b/i, '');
    if (/COLLATE\s+NOCASE/i.test(text)) { result.indexes.nocaseDropped++; text = text.replace(/\s+COLLATE\s+NOCASE/gi, ''); }
    try { await client.query(`CREATE ${text.replace(/^\s*CREATE\s+/i, '')}`); result.indexes.ok++; }
    catch (e) { result.indexes.failed.push({ sql: sql.slice(0, 160), error: e.message }); }
  }
  for (const { name, sql } of tables) {
    for (const expr of checkExpressions(sql || '')) {
      try { await client.query(`ALTER TABLE ${q(name)} ADD CHECK (${expr})`); result.checks.ok++; }
      catch (e) { result.checks.failed.push({ table: name, check: expr.slice(0, 120), error: e.message }); }
    }
    const fks = lite.prepare('SELECT * FROM pragma_foreign_key_list(?) ORDER BY id, seq').all(name);
    const byId = new Map();
    for (const fk of fks) { const g = byId.get(fk.id) || { ...fk, from: [], to: [] }; g.from.push(fk.from); g.to.push(fk.to); byId.set(fk.id, g); }
    for (const fk of byId.values()) {
      const to = fk.to.every(Boolean) ? `(${fk.to.map(q).join(',')})` : '';
      const actions = `${fk.on_delete && fk.on_delete !== 'NO ACTION' ? ` ON DELETE ${fk.on_delete}` : ''}${fk.on_update && fk.on_update !== 'NO ACTION' ? ` ON UPDATE ${fk.on_update}` : ''}`;
      try { await client.query(`ALTER TABLE ${q(name)} ADD FOREIGN KEY (${fk.from.map(q).join(',')}) REFERENCES ${q(fk.table)}${to}${actions}`); result.foreignKeys.ok++; }
      catch (e) { result.foreignKeys.failed.push({ table: name, references: fk.table, error: e.message }); }
    }
  }
  for (const [table, column] of identityTables) {
    try { await client.query(`SELECT setval(pg_get_serial_sequence($1,$2), GREATEST(COALESCE((SELECT MAX(${q(column)}) FROM ${q(table)}),0),1))`, [table, column]); } catch { /* table vide ou séquence absente */ }
  }
  result.triggers.sqlite = lite.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger'").get().n;
  // Les 7 déclencheurs des compteurs sociaux (src/db/socialTotals.ts), portés en PL/pgSQL.
  await client.query(`
    CREATE OR REPLACE FUNCTION social_totals_bump(t TEXT, k TEXT, d INT) RETURNS void LANGUAGE plpgsql AS $$
    BEGIN
      IF d > 0 THEN
        INSERT INTO social_interaction_totals(target_id,type,n) VALUES (t,k,1) ON CONFLICT (target_id,type) DO UPDATE SET n = social_interaction_totals.n + 1;
      ELSE
        UPDATE social_interaction_totals SET n = GREATEST(n-1,0) WHERE target_id=t AND type=k;
      END IF;
    END $$;
    CREATE OR REPLACE FUNCTION trg_social_interactions() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP IN ('DELETE','UPDATE') THEN PERFORM social_totals_bump(OLD.target_id, OLD.type, -1); END IF;
      IF TG_OP IN ('INSERT','UPDATE') THEN PERFORM social_totals_bump(NEW.target_id, NEW.type, 1); END IF;
      RETURN NULL;
    END $$;
    CREATE TRIGGER trg_social_totals_interactions AFTER INSERT OR DELETE ON story_interactions FOR EACH ROW EXECUTE FUNCTION trg_social_interactions();
    CREATE TRIGGER trg_social_totals_interactions_upd AFTER UPDATE OF target_id,type ON story_interactions FOR EACH ROW
      WHEN (OLD.target_id IS DISTINCT FROM NEW.target_id OR OLD.type IS DISTINCT FROM NEW.type) EXECUTE FUNCTION trg_social_interactions();
    CREATE OR REPLACE FUNCTION trg_social_kind() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN PERFORM social_totals_bump(NEW.target_id, TG_ARGV[0], 1); ELSE PERFORM social_totals_bump(OLD.target_id, TG_ARGV[0], -1); END IF;
      RETURN NULL;
    END $$;
    CREATE TRIGGER trg_social_totals_loves AFTER INSERT OR DELETE ON social_loves FOR EACH ROW EXECUTE FUNCTION trg_social_kind('love');
    CREATE TRIGGER trg_social_totals_dislikes AFTER INSERT OR DELETE ON publication_dislikes FOR EACH ROW EXECUTE FUNCTION trg_social_kind('dislike');
  `);
  result.triggers.portedByHand = 7;
}

// ───────────────────────── 3. données ─────────────────────────
async function copyData(lite, client, tables) {
  const out = { rows: 0, rejected: [], nulBytesStripped: 0, seconds: 0 };
  const started = Date.now();
  await client.query("SET session_replication_role = 'replica'"); // pas de déclencheurs ni de FK pendant la copie
  for (const { name } of tables) {
    const cols = lite.prepare('SELECT name FROM pragma_table_info(?) ORDER BY cid').all(name).map((c) => c.name);
    if (!cols.length) continue;
    const perBatch = Math.max(1, Math.min(2000, Math.floor(60000 / cols.length)));
    const insertSql = (rows) => `INSERT INTO ${q(name)} (${cols.map(q).join(',')}) VALUES ${rows.map((_, r) => `(${cols.map((__, c) => `$${r * cols.length + c + 1}`).join(',')})`).join(',')}`;
    const clean = (v) => {
      if (typeof v === 'string' && v.includes('\u0000')) { out.nulBytesStripped++; return v.replace(/\u0000/g, ''); }
      if (typeof v === 'bigint') return v.toString();
      return v;
    };
    let batch = []; let rejected = 0; let firstError = '';
    const flush = async () => {
      if (!batch.length) return;
      try { await client.query(insertSql(batch), batch.flat()); out.rows += batch.length; }
      catch {
        for (const row of batch) {
          try { await client.query(insertSql([row]), row); out.rows++; }
          catch (e) { rejected++; firstError = firstError || e.message; }
        }
      }
      batch = [];
    };
    for (const row of lite.prepare(`SELECT * FROM ${q(name)}`).raw(true).iterate()) {
      batch.push(row.map(clean));
      if (batch.length >= perBatch) await flush();
    }
    await flush();
    if (rejected) out.rejected.push({ table: name, rows: rejected, error: firstError });
  }
  await client.query("SET session_replication_role = 'origin'");
  await client.query('ANALYZE');
  out.seconds = round((Date.now() - started) / 1000, 1);
  return out;
}

// ───────────────────────── 4. requêtes capturées ─────────────────────────
async function replayCompat(client, capture) {
  const seen = new Map();
  for (const [endpoint, entry] of Object.entries(capture.endpoints)) {
    for (const query of entry.queries) {
      if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(query.sql.trim())) continue;
      if (seen.has(query.sql)) continue;
      const sql = translateSql(query.sql);
      let status = 'ok'; let error = '';
      try { await client.query('BEGIN'); await client.query(sql, query.params); }
      catch (e) { status = 'failed'; error = e.message; }
      finally { await client.query('ROLLBACK'); }
      seen.set(query.sql, { endpoint, status, error, sql: query.sql.replace(/\s+/g, ' ').slice(0, 140), fullSql: query.sql });
    }
  }
  const all = [...seen.values()];
  return { unique: all.length, ok: all.filter((r) => r.status === 'ok').length, failed: all.filter((r) => r.status !== 'ok') };
}

// ───────────────────────── 5. capacité lecture ─────────────────────────
/** Mélange pondéré, mêmes poids que scripts/load-test.mjs (20 requêtes / cycle). */
function readUnits(capture, incompatible = new Set()) {
  const units = [];
  for (const entry of Object.values(capture.endpoints)) {
    if (!entry.weight) continue;
    // Une requête que PostgreSQL refuse est EXCLUE de la mesure (et listée en [4]) : la garder ferait
    // mesurer des erreurs — et `pg-pool` détruit la connexion après chaque erreur (reconnexion = fork).
    const queries = entry.queries.filter((x) => !/^(BEGIN|COMMIT|ROLLBACK)/i.test(x.sql.trim()) && !incompatible.has(x.sql));
    for (let i = 0; i < entry.weight; i++) units.push(queries);
  }
  return units;
}
function postgresCpuMs() {
  let ticks = 0;
  for (const pid of fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p))) {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const comm = stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')'));
      if (comm !== 'postgres') continue;
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      ticks += Number(fields[11]) + Number(fields[12]); // utime + stime
    } catch { /* processus disparu */ }
  }
  return (ticks * 1000) / 100; // USER_HZ = 100
}
async function pgReadBench(units, concurrency, prepared = false) {
  const pool = new pg.Pool({ connectionString: PG_URL, max: concurrency });
  // prepared=true : requêtes NOMMÉES (analyse + plan mis en cache par connexion), comme le ferait
  // un pilote avec cache d'instructions ; sinon chaque requête est ré-analysée et re-planifiée.
  const sqlNames = new Map();
  const nameOf = (sql) => { if (!sqlNames.has(sql)) sqlNames.set(sql, `ay_${sqlNames.size}`); return sqlNames.get(sql); };
  const statements = units.map((u) => u.map((x) => ({ text: translateSql(x.sql), values: x.params, ...(prepared ? { name: nameOf(x.sql) } : {}) })));
  await Promise.all(Array.from({ length: concurrency }, () => pool.query('SELECT 1')));
  const lat = []; let done = 0; let errors = 0; let index = 0;
  const cpu0 = process.cpuUsage(); const pg0 = postgresCpuMs();
  const end = Date.now() + DURATION * 1000;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    const client = await pool.connect(); // connexion dédiée : comme un pool applicatif chaud
    try {
      while (Date.now() < end) {
        const unit = statements[index++ % statements.length];
        const t = performance.now();
        try { for (const s of unit) await client.query(s); done++; lat.push(performance.now() - t); } catch { errors++; }
      }
    } finally { client.release(); }
  }));
  const cpu = process.cpuUsage(cpu0); const pgCpu = postgresCpuMs() - pg0;
  await pool.end();
  lat.sort((a, b) => a - b);
  return {
    concurrency, prepared, requestsPerSec: Math.round(done / DURATION), p50: round(pct(lat, 50)), p99: round(pct(lat, 99)), errors,
    pgCpuMsPerRequest: done ? round(pgCpu / done, 3) : null,
    driverCpuMsPerRequest: done ? round((cpu.user + cpu.system) / 1000 / done, 3) : null,
  };
}
function sqliteReadBench(lite, units) {
  const statements = units.map((u) => u.map((x) => ({ stmt: lite.prepare(x.sql), m: x.m === 'run' ? 'run' : x.m, params: x.params })));
  const lat = []; let done = 0; let index = 0;
  const cpu0 = process.cpuUsage(); const end = Date.now() + DURATION * 1000;
  while (Date.now() < end) {
    const unit = statements[index++ % statements.length];
    const t = performance.now();
    for (const s of unit) s.stmt[s.m === 'iterate' ? 'all' : s.m](...s.params);
    done++; lat.push(performance.now() - t);
  }
  const cpu = process.cpuUsage(cpu0);
  lat.sort((a, b) => a - b);
  return { requestsPerSec: Math.round(done / DURATION), p50: round(pct(lat, 50), 3), p99: round(pct(lat, 99), 3), cpuMsPerRequest: round((cpu.user + cpu.system) / 1000 / done, 3) };
}

// ───────────────────────── 6. capacité écriture (vue de Reel) ─────────────────────────
const VIEW_SQL = {
  story: "SELECT 1 FROM stories WHERE id=? AND status='PUBLISHED' AND publish_at<=? AND (expires_at IS NULL OR expires_at>?)",
  publication: "SELECT 1 FROM publications WHERE id=? AND status='publie' AND publish_at<=?",
  reel: "SELECT 1 FROM reels WHERE id=? AND status='publie' AND publish_at<=?",
  lookup: "SELECT id FROM story_interactions WHERE target_id=? AND type=? AND guest_hash=? AND type IN ('view','share') AND guest_hash IS NOT NULL",
  insert: "INSERT INTO story_interactions (id,target_id,target_kind,type,account_id,guest_hash,text,created_at) VALUES (?,?,?,?,?,?,NULL,?)",
  totals: 'SELECT type,n FROM social_interaction_totals WHERE target_id=?',
  reelCounters: 'UPDATE reels SET views=?,likes=?,updated_at=? WHERE id=?',
};
function viewParams(target) {
  const now = new Date().toISOString();
  return { now, target, guest: randomBytes(16).toString('hex'), id: `int_${randomUUID()}` };
}
async function pgWriteBench(targets, concurrency, label) {
  const pool = new pg.Pool({ connectionString: PG_URL, max: concurrency });
  const S = Object.fromEntries(Object.entries(VIEW_SQL).map(([k, v]) => [k, translateSql(v)]));
  const lat = []; let done = 0; let errors = 0; let firstError = '';
  const pg0 = postgresCpuMs(); const end = Date.now() + DURATION * 1000;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    const client = await pool.connect();
    try {
      while (Date.now() < end) {
        const p = viewParams(targets[Math.floor(Math.random() * targets.length)]);
        const t = performance.now();
        try {
          await client.query('BEGIN');
          await client.query(S.story, [p.target, p.now, p.now]);
          await client.query(S.publication, [p.target, p.now]);
          await client.query(S.reel, [p.target, p.now]);
          const existing = await client.query(S.lookup, [p.target, 'view', p.guest]);
          if (!existing.rowCount) {
            await client.query(S.insert, [p.id, p.target, 'post', 'view', null, p.guest, p.now]);
            const totals = await client.query(S.totals, [p.target]);
            const views = Number(totals.rows.find((r) => r.type === 'view')?.n || 0);
            await client.query(S.reelCounters, [views, 0, p.now, p.target]);
            await client.query(S.totals, [p.target]);
          }
          await client.query('COMMIT');
          done++; lat.push(performance.now() - t);
        } catch (e) { errors++; firstError = firstError || e.message; await client.query('ROLLBACK').catch(() => {}); }
      }
    } finally { client.release(); }
  }));
  const pgCpu = postgresCpuMs() - pg0;
  await pool.end();
  lat.sort((a, b) => a - b);
  return { engine: 'postgresql', scenario: label, concurrency, viewsPerSec: Math.round(done / DURATION), p50: round(pct(lat, 50)), p99: round(pct(lat, 99)), errors, firstError, pgCpuMsPerView: done ? round(pgCpu / done, 3) : null };
}
function sqliteWriteBench(file, targets, label) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON'); db.pragma('busy_timeout = 5000'); // = src/db/database.ts
  const S = Object.fromEntries(Object.entries(VIEW_SQL).map(([k, v]) => [k, db.prepare(v)]));
  const view = db.transaction((p) => {
    S.story.get(p.target, p.now, p.now); S.publication.get(p.target, p.now); S.reel.get(p.target, p.now);
    if (S.lookup.get(p.target, 'view', p.guest)) return;
    S.insert.run(p.id, p.target, 'post', 'view', null, p.guest, p.now);
    const views = Number(S.totals.all(p.target).find((r) => r.type === 'view')?.n || 0);
    S.reelCounters.run(views, 0, p.now, p.target);
    S.totals.all(p.target);
  });
  const lat = []; let done = 0; const cpu0 = process.cpuUsage(); const end = Date.now() + DURATION * 1000;
  while (Date.now() < end) {
    const p = viewParams(targets[Math.floor(Math.random() * targets.length)]);
    const t = performance.now(); view(p); done++; lat.push(performance.now() - t);
  }
  const cpu = process.cpuUsage(cpu0);
  db.close();
  lat.sort((a, b) => a - b);
  return { engine: 'sqlite', scenario: label, concurrency: 1, viewsPerSec: Math.round(done / DURATION), p50: round(pct(lat, 50), 3), p99: round(pct(lat, 99), 3), cpuMsPerView: round((cpu.user + cpu.system) / 1000 / done, 3) };
}

// ───────────────────────── exécution ─────────────────────────
log(`AYROVI — analyse PostgreSQL · ${report.host.cpu} · affinité CPU ${report.host.affinity}`);
report.source = auditSource(SRC);
log(`\n[1] code : ${report.source.totals.syncCalls} appels DB synchrones, ${report.source.totals.transactions} transactions, ${report.source.modulesTouched} modules`);
log('    dialecte :', JSON.stringify(Object.fromEntries(Object.entries(report.source.totals).filter(([k]) => !['syncCalls', 'transactions'].includes(k)))));

const lite = new Database(SQLITE, { readonly: true, fileMustExist: true });
const client = new pg.Client({ connectionString: PG_URL });
await client.connect();
report.postgres = (await client.query('SHOW server_version')).rows[0].server_version;
const capture = JSON.parse(fs.readFileSync(CAPTURE, 'utf8'));

if (!SKIP_LOAD) {
  const { result, tables, identityTables } = await buildSchema(lite, client);
  report.data = await copyData(lite, client, tables);
  await finishSchema(lite, client, tables, identityTables, result);
  await client.query('ANALYZE');
  report.schema = result;
}
const s = report.schema;
if (s) {
  log(`\n[2] schéma → PostgreSQL ${report.postgres} : tables ${s.tables.ok}/${s.tables.ok + s.tables.failed.length} · UNIQUE ${s.uniques.ok}/${s.uniques.ok + s.uniques.failed.length} · index ${s.indexes.ok}/${s.indexes.ok + s.indexes.failed.length} (COLLATE NOCASE retirés : ${s.indexes.nocaseDropped}) · CHECK ${s.checks.ok}/${s.checks.ok + s.checks.failed.length} · FK ${s.foreignKeys.ok}/${s.foreignKeys.ok + s.foreignKeys.failed.length} · déclencheurs ${s.triggers.sqlite} (portés en PL/pgSQL : ${s.triggers.portedByHand})`);
  for (const f of [...s.tables.failed, ...s.indexes.failed, ...s.checks.failed, ...s.foreignKeys.failed].slice(0, 12)) log('    ✗', JSON.stringify(f).slice(0, 220));
  log(`[3] données : ${report.data.rows} lignes en ${report.data.seconds}s · rejets ${report.data.rejected.reduce((a, r) => a + r.rows, 0)} · NUL retirés ${report.data.nulBytesStripped}`);
  for (const r of report.data.rejected.slice(0, 8)) log('    ✗', JSON.stringify(r).slice(0, 220));
}
report.queries = await replayCompat(client, capture);
log(`[4] requêtes capturées rejouées telles quelles : ${report.queries.ok}/${report.queries.unique} passent`);
for (const f of report.queries.failed) log(`    ✗ [${f.endpoint}] ${f.error} — ${f.sql}`);
await client.end();

const units = readUnits(capture, new Set(report.queries.failed.map((f) => f.fullSql)));
report.read = { sqlite: sqliteReadBench(lite, units), postgresql: [] };
log(`\n[5] lecture — mélange applicatif (${units.length} requêtes HTTP / cycle, ${round(units.reduce((a, u) => a + u.length, 0) / units.length, 1)} requêtes SQL / requête HTTP)`);
log(`    SQLite (dans le processus)  : ${report.read.sqlite.requestsPerSec} req/s · p50 ${report.read.sqlite.p50} ms · p99 ${report.read.sqlite.p99} ms · CPU ${report.read.sqlite.cpuMsPerRequest} ms/req`);
for (const [c, prep] of CONCURRENCY.flatMap((n) => [[n, false], [n, true]])) {
  const r = await pgReadBench(units, c, prep);
  report.read.postgresql.push(r);
  log(`    PostgreSQL ${String(c).padStart(2)} connexions ${prep ? 'préparées' : 'simples  '} : ${r.requestsPerSec} req/s · p50 ${r.p50} ms · p99 ${r.p99} ms · CPU PostgreSQL ${r.pgCpuMsPerRequest} ms/req · CPU pilote pg ${r.driverCpuMsPerRequest} ms/req · erreurs ${r.errors}`);
}

const reels = new Database(SQLITE, { readonly: true }).prepare("SELECT id FROM reels WHERE status='publie' AND publish_at<=?").all(new Date().toISOString()).map((r) => r.id);
const copy = path.join(os.tmpdir(), `ayrovi-pg-bench-${process.pid}.sqlite`);
await lite.backup(copy);
lite.close();
report.write = [];
log('\n[6] écriture — transaction réelle d’une vue de Reel (10 requêtes, compteurs par déclencheurs)');
for (const [label, targets] of [['répartie', reels], ['Reel viral', [reels[0]]]]) {
  const r = sqliteWriteBench(copy, targets, label); report.write.push(r);
  log(`    SQLite        · ${label.padEnd(10)} : ${r.viewsPerSec} vues/s · p50 ${r.p50} ms · p99 ${r.p99} ms`);
  for (const c of CONCURRENCY.filter((n) => n <= 32)) {
    const w = await pgWriteBench(targets, c, label); report.write.push(w);
    log(`    PostgreSQL ${String(c).padStart(2)} · ${label.padEnd(10)} : ${w.viewsPerSec} vues/s · p50 ${w.p50} ms · p99 ${w.p99} ms · CPU ${w.pgCpuMsPerView} ms/vue · erreurs ${w.errors}${w.firstError ? ` (${w.firstError})` : ''}`);
  }
}
for (const f of [copy, `${copy}-wal`, `${copy}-shm`]) fs.rmSync(f, { force: true });
if (OUT) fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
log(OUT ? `\n→ rapport : ${OUT}` : '');
