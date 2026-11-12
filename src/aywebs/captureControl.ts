import type { QatafoDatabase } from '../db/database';
import { writeAyWebsAudit } from './events';

/**
 * AYWEBs — pilotage de la capture PAR BOUTIQUE (12/11/2026).
 *
 * Trois leviers, sans redéploiement ni publication d'application :
 *
 *  • `auto`   — comportement normal : script dédié, lot de la boutique ou noyau.
 *  • `core`   — RETOUR ARRIÈRE : la boutique reçoit le cœur partagé complet
 *               (le script historique, celui qui marchait avant le découpage).
 *               Effet sous 5 minutes (cache du script côté application).
 *  • `paused` — COUPE-CIRCUIT : la capture de cette boutique est arrêtée, la
 *               navigation reste ouverte. Même sémantique que le drapeau
 *               d'environnement `AYWEBS_<BOUTIQUE>_CAPTURE_ENABLED=false` : le
 *               client lit « capture désactivée » et peut déposer une demande
 *               d'achat — jamais un prix faux.
 *
 * Et une MESURE durable : compteurs horaires par boutique (validées /
 * acceptées / motifs de refus), pour une alerte « moins de 80 % de réussite
 * sur 24 h » qui survit aux redémarrages (les compteurs de `webviewCapture.ts`
 * sont en mémoire et repartent de zéro à chaque déploiement).
 *
 * Tout ici est « au mieux » : une base indisponible ne casse JAMAIS une
 * capture — on perd la mesure, pas la lecture.
 */

export const AYWEBS_CAPTURE_CONTROL_MODES = ['auto', 'core', 'paused'] as const;
export type AyWebsCaptureControlMode = (typeof AYWEBS_CAPTURE_CONTROL_MODES)[number];

export interface AyWebsCaptureControl {
  storeId: string;
  mode: AyWebsCaptureControlMode;
  note: string;
  updatedBy: string;
  updatedAt: string;
}

/** Seuils de l'alerte de santé — exposés pour l'interface et les tests. */
export const AYWEBS_CAPTURE_HEALTH_DEFAULTS = {
  windowHours: 24,
  /** En dessous de ce taux d'acceptation, la boutique est en alerte. */
  threshold: 0.8,
  /** Pas d'alerte sur trois captures : il faut un échantillon. */
  minSamples: 20,
} as const;

const MAX_REJECTION_KEYS = 12;
/** Conservation des compteurs horaires (jours). */
const HOURLY_RETENTION_DAYS = 30;
/** Plusieurs instances du serveur : on relit la table au plus toutes les 30 s. */
const CONTROL_CACHE_TTL_MS = 30_000;

const STORE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const STORE_KEY_PATTERN = /^[a-z_]{1,20}(:[a-z0-9_-]{1,40})?$/;

const schemaReady = new WeakSet<object>();
const controlCache = new WeakMap<object, { loadedAt: number; byStore: Map<string, AyWebsCaptureControl> }>();
let lastPrune = 0;

export function ensureAyWebsCaptureControlSchema(db: QatafoDatabase): void {
  if (schemaReady.has(db)) return;
  db.run(`CREATE TABLE IF NOT EXISTS ayweb_capture_controls (
    store_id TEXT PRIMARY KEY,
    mode TEXT NOT NULL CHECK(mode IN (${AYWEBS_CAPTURE_CONTROL_MODES.map((mode) => `'${mode}'`).join(',')})),
    note TEXT NOT NULL DEFAULT '',
    updated_by TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS ayweb_capture_hourly (
    store_key TEXT NOT NULL,
    hour TEXT NOT NULL,
    validated INTEGER NOT NULL DEFAULT 0,
    accepted INTEGER NOT NULL DEFAULT 0,
    rejections TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (store_key, hour)
  )`);
  db.run('CREATE INDEX IF NOT EXISTS idx_ayweb_capture_hourly_hour ON ayweb_capture_hourly(hour)');
  schemaReady.add(db);
}

export function isAyWebsCaptureControlMode(value: unknown): value is AyWebsCaptureControlMode {
  return typeof value === 'string' && (AYWEBS_CAPTURE_CONTROL_MODES as readonly string[]).includes(value);
}

function loadControls(db: QatafoDatabase): Map<string, AyWebsCaptureControl> {
  const cached = controlCache.get(db);
  const now = Date.now();
  if (cached && now - cached.loadedAt < CONTROL_CACHE_TTL_MS) return cached.byStore;
  const byStore = new Map<string, AyWebsCaptureControl>();
  ensureAyWebsCaptureControlSchema(db);
  const rows = db.all<{ store_id: string; mode: string; note: string; updated_by: string; updated_at: string }>(
    'SELECT store_id, mode, note, updated_by, updated_at FROM ayweb_capture_controls',
  );
  for (const row of rows) {
    if (!isAyWebsCaptureControlMode(row.mode) || row.mode === 'auto') continue;
    byStore.set(row.store_id, { storeId: row.store_id, mode: row.mode, note: row.note, updatedBy: row.updated_by, updatedAt: row.updated_at });
  }
  controlCache.set(db, { loadedAt: now, byStore });
  return byStore;
}

/** Mode de capture d'une boutique (`auto` si rien n'est posé, ou si la base est indisponible). */
export function ayWebsCaptureControlMode(db: QatafoDatabase | null | undefined, storeId: string | null | undefined): AyWebsCaptureControlMode {
  if (!db || !storeId) return 'auto';
  try {
    return loadControls(db).get(String(storeId).toLowerCase())?.mode ?? 'auto';
  } catch {
    return 'auto';
  }
}

export function listAyWebsCaptureControls(db: QatafoDatabase): AyWebsCaptureControl[] {
  return [...loadControls(db).values()].sort((a, b) => a.storeId.localeCompare(b.storeId));
}

export function setAyWebsCaptureControl(
  db: QatafoDatabase,
  input: { storeId: string; mode: AyWebsCaptureControlMode; note?: string; actorId?: string | null; requestId?: string | null },
): AyWebsCaptureControl {
  const storeId = String(input.storeId || '').trim().toLowerCase();
  if (!STORE_ID_PATTERN.test(storeId)) throw new Error('INVALID_STORE_ID');
  if (!isAyWebsCaptureControlMode(input.mode)) throw new Error('INVALID_CAPTURE_MODE');
  ensureAyWebsCaptureControlSchema(db);
  const before = ayWebsCaptureControlMode(db, storeId);
  const control: AyWebsCaptureControl = {
    storeId,
    mode: input.mode,
    note: String(input.note || '').trim().slice(0, 300),
    updatedBy: String(input.actorId || '').slice(0, 80),
    updatedAt: new Date().toISOString(),
  };
  db.run(
    `INSERT INTO ayweb_capture_controls (store_id, mode, note, updated_by, updated_at) VALUES (?,?,?,?,?)
     ON CONFLICT(store_id) DO UPDATE SET mode=excluded.mode, note=excluded.note, updated_by=excluded.updated_by, updated_at=excluded.updated_at`,
    control.storeId, control.mode, control.note, control.updatedBy, control.updatedAt,
  );
  controlCache.delete(db);
  writeAyWebsAudit(db, {
    actorType: 'admin',
    actorId: input.actorId ?? null,
    action: 'capture_control.set',
    resourceType: 'store',
    resourceId: storeId,
    beforeState: before,
    afterState: control.mode,
    detail: { note: control.note },
    requestId: input.requestId ?? null,
  });
  return control;
}

function hourOf(date: Date): string {
  return `${date.toISOString().slice(0, 13)}:00:00Z`;
}

/**
 * Compte une capture jugée par le serveur. Appelé après
 * `validateAyWebsCapturedPage` ; ne lève jamais.
 */
export function recordAyWebsCaptureOutcome(
  db: QatafoDatabase | null | undefined,
  input: { storeKey: string; accepted: boolean; rejection?: string | null; at?: Date },
): void {
  if (!db) return;
  try {
    const storeKey = STORE_KEY_PATTERN.test(input.storeKey) ? input.storeKey : 'autres';
    ensureAyWebsCaptureControlSchema(db);
    const at = input.at ?? new Date();
    const hour = hourOf(at);
    db.run(
      `INSERT INTO ayweb_capture_hourly (store_key, hour, validated, accepted, rejections) VALUES (?,?,0,0,'{}')
       ON CONFLICT(store_key, hour) DO NOTHING`,
      storeKey, hour,
    );
    if (input.accepted) {
      db.run('UPDATE ayweb_capture_hourly SET validated=validated+1, accepted=accepted+1 WHERE store_key=? AND hour=?', storeKey, hour);
    } else {
      const row = db.get<{ rejections: string }>('SELECT rejections FROM ayweb_capture_hourly WHERE store_key=? AND hour=?', storeKey, hour);
      let rejections: Record<string, number> = {};
      try { rejections = JSON.parse(row?.rejections || '{}') as Record<string, number>; } catch { rejections = {}; }
      const reason = String(input.rejection || 'UNKNOWN').slice(0, 60);
      const key = reason in rejections || Object.keys(rejections).length < MAX_REJECTION_KEYS ? reason : 'autres';
      rejections[key] = (rejections[key] || 0) + 1;
      db.run('UPDATE ayweb_capture_hourly SET validated=validated+1, rejections=? WHERE store_key=? AND hour=?', JSON.stringify(rejections), storeKey, hour);
    }
    const now = at.getTime();
    if (now - lastPrune > 6 * 3_600_000) {
      lastPrune = now;
      db.run('DELETE FROM ayweb_capture_hourly WHERE hour < ?', hourOf(new Date(now - HOURLY_RETENTION_DAYS * 86_400_000)));
    }
  } catch (error) {
    console.warn('[AyWebs Capture] mesure non enregistrée', error instanceof Error ? error.message : error);
  }
}

export interface AyWebsCaptureHealthRow {
  store_key: string;
  /** Identifiant de boutique (registre ou catalogue), null pour `external` / `autres`. */
  store_id: string | null;
  validated: number;
  accepted: number;
  rejected: number;
  acceptance_rate: number | null;
  top_rejections: Array<{ code: string; count: number }>;
  alert: boolean;
  control: AyWebsCaptureControlMode;
}

export interface AyWebsCaptureHealth {
  window_hours: number;
  threshold: number;
  min_samples: number;
  generated_at: string;
  stores: AyWebsCaptureHealthRow[];
  alerts: AyWebsCaptureHealthRow[];
  controls: AyWebsCaptureControl[];
}

/** Santé de la capture par boutique sur une fenêtre glissante (24 h par défaut). */
export function ayWebsCaptureHealth(
  db: QatafoDatabase,
  options: { windowHours?: number; threshold?: number; minSamples?: number; now?: Date } = {},
): AyWebsCaptureHealth {
  ensureAyWebsCaptureControlSchema(db);
  const windowHours = Math.min(24 * 30, Math.max(1, Math.round(options.windowHours ?? AYWEBS_CAPTURE_HEALTH_DEFAULTS.windowHours)));
  const threshold = Math.min(1, Math.max(0, options.threshold ?? AYWEBS_CAPTURE_HEALTH_DEFAULTS.threshold));
  const minSamples = Math.max(1, Math.round(options.minSamples ?? AYWEBS_CAPTURE_HEALTH_DEFAULTS.minSamples));
  const now = options.now ?? new Date();
  /* L'heure courante compte : la fenêtre couvre `windowHours` heures entières, celle-ci comprise. */
  const since = hourOf(new Date(now.getTime() - (windowHours - 1) * 3_600_000));
  const rows = db.all<{ store_key: string; validated: number; accepted: number; rejections: string }>(
    'SELECT store_key, validated, accepted, rejections FROM ayweb_capture_hourly WHERE hour >= ?', since,
  );
  const byKey = new Map<string, { validated: number; accepted: number; rejections: Record<string, number> }>();
  for (const row of rows) {
    const entry = byKey.get(row.store_key) ?? { validated: 0, accepted: 0, rejections: {} };
    entry.validated += Number(row.validated) || 0;
    entry.accepted += Number(row.accepted) || 0;
    try {
      for (const [code, count] of Object.entries(JSON.parse(row.rejections || '{}') as Record<string, number>)) {
        entry.rejections[code] = (entry.rejections[code] || 0) + (Number(count) || 0);
      }
    } catch { /* ligne illisible : on garde les totaux */ }
    byKey.set(row.store_key, entry);
  }
  const stores: AyWebsCaptureHealthRow[] = [...byKey.entries()].map(([storeKey, entry]) => {
    const storeId = storeKey.includes(':') ? storeKey.split(':')[1] : null;
    const rate = entry.validated ? Math.round((entry.accepted / entry.validated) * 1000) / 1000 : null;
    return {
      store_key: storeKey,
      store_id: storeId,
      validated: entry.validated,
      accepted: entry.accepted,
      rejected: entry.validated - entry.accepted,
      acceptance_rate: rate,
      top_rejections: Object.entries(entry.rejections)
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
        .slice(0, 5),
      alert: entry.validated >= minSamples && rate !== null && rate < threshold,
      control: ayWebsCaptureControlMode(db, storeId),
    };
  });
  stores.sort((a, b) => Number(b.alert) - Number(a.alert) || (a.acceptance_rate ?? 1) - (b.acceptance_rate ?? 1) || b.validated - a.validated);
  return {
    window_hours: windowHours,
    threshold,
    min_samples: minSamples,
    generated_at: now.toISOString(),
    stores,
    alerts: stores.filter((row) => row.alert),
    controls: listAyWebsCaptureControls(db),
  };
}

/** Pour les tests : oublie le cache des contrôles (une autre instance a écrit). */
export function resetAyWebsCaptureControlCache(db?: QatafoDatabase): void {
  if (db) controlCache.delete(db);
  lastPrune = 0;
}
