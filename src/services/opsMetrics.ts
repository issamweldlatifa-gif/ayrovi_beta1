/**
 * MÉTRIQUES D'EXPLOITATION — « quand faut-il un serveur de plus ? » (12/11/2026).
 *
 * La question ne se tranche pas au nombre d'utilisateurs : elle se tranche sur
 * des MESURES soutenues. Ce module les produit, sans dépendance et sans service
 * externe :
 *
 *  • CPU du processus en % de la part ALLOUÉE (quota cgroup : 0,5 vCPU sur le
 *    plan Starter de Render, pas les cœurs de la machine hôte) ;
 *  • mémoire RSS / tas V8 en % de la limite du conteneur ;
 *  • retard de la boucle d'événements (p99) — LE signal propre à Node :
 *    SQLite (better-sqlite3), sharp en mode synchrone, JSDOM… bloquent tout le
 *    processus. Boucle bloquée = CPU/base ; boucle libre mais latence haute =
 *    attente d'un fournisseur externe ou du réseau (ajouter un serveur n'y
 *    changera RIEN) ;
 *  • débit, erreurs 5xx et latence p50/p95/p99 par famille de routes ;
 *  • disque : occupation du volume de données (base, médias, sauvegardes, caches).
 *
 * Fenêtres glissantes 1 / 5 / 15 / 60 min (seaux d'une minute en mémoire) et un
 * historique horaire persistant (`ops_metrics_hourly`, 90 jours) pour juger du
 * « soutenu » : un pic de 2 minutes ne justifie aucun achat.
 *
 * Les SIGNAUX appliquent la grille de l'audit d'architecture
 * (docs/AYROVI_ARCHITECTURE_SCALABLE_AR_2026-11-12.md, §5). Chaque signal dit
 * quoi CHERCHER avant de payer : la première réponse à une saturation est la
 * route qui la cause, pas une machine de plus.
 *
 * Plusieurs instances un jour : chaque instance publie ses propres chiffres
 * (`instance`) ; l'agrégation se fera dans l'outil de supervision (Prometheus :
 * `/api/ops/metrics`, protégé par `OPS_METRICS_TOKEN`).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { NextFunction, Request, Response } from 'express';

/** Bornes des seaux de latence (ms). Le dernier attrape tout le reste. */
export const LATENCY_BOUNDS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, Number.POSITIVE_INFINITY] as const;

/** Grille de décision (audit §5). Exportée pour les tests et l'écran CRM. */
export const OPS_THRESHOLDS = {
  cpuWarning: 85,
  cpuCritical: 95,
  memoryWarning: 85,
  memoryCritical: 95,
  latencyP95Ms: 800,
  eventLoopP99Ms: 200,
  errorRate: 0.01,
  diskWarning: 80,
  diskCritical: 90,
  /** En dessous, une fenêtre n'a pas assez de requêtes pour juger latence et erreurs. */
  minRequests: 50,
} as const;

const MAX_GROUPS = 60;
const WINDOW_MINUTES = 60;

interface GroupStat { requests: number; errors5xx: number; totalMs: number }
interface MinuteBucket {
  minute: number;
  requests: number;
  errors5xx: number;
  latency: number[];
  groups: Map<string, GroupStat>;
  cpuSum: number;
  cpuMax: number;
  cpuSamples: number;
  rssMax: number;
  heapMax: number;
  loopP99Max: number;
}

export interface OpsLimits { cpu: number; memoryBytes: number; source: { cpu: string; memory: string } }

function readText(file: string): string | null {
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { return null; }
}

/**
 * Part de CPU et mémoire réellement ALLOUÉE au conteneur. Ordre : variable
 * explicite → cgroup v2 → cgroup v1 → machine. Render, Fly, Docker, Kubernetes
 * posent tous un quota cgroup : c'est lui qui compte, pas `os.cpus()`.
 */
export function detectLimits(env: NodeJS.ProcessEnv = process.env, read: (file: string) => string | null = readText): OpsLimits {
  const machineCpu = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  let cpu = machineCpu; let cpuSource = 'machine';
  const explicitCpu = Number(env.AYROVI_CPU_LIMIT);
  if (Number.isFinite(explicitCpu) && explicitCpu > 0) { cpu = explicitCpu; cpuSource = 'env'; }
  else {
    const v2 = read('/sys/fs/cgroup/cpu.max');
    const [quota, period] = (v2 || '').split(/\s+/);
    if (v2 && quota !== 'max' && Number(quota) > 0 && Number(period) > 0) { cpu = Number(quota) / Number(period); cpuSource = 'cgroup2'; }
    else {
      const q1 = Number(read('/sys/fs/cgroup/cpu/cpu.cfs_quota_us'));
      const p1 = Number(read('/sys/fs/cgroup/cpu/cpu.cfs_period_us'));
      if (q1 > 0 && p1 > 0) { cpu = q1 / p1; cpuSource = 'cgroup1'; }
    }
  }
  let memoryBytes = os.totalmem(); let memorySource = 'machine';
  const explicitMem = Number(env.AYROVI_MEMORY_LIMIT_MB);
  if (Number.isFinite(explicitMem) && explicitMem > 0) { memoryBytes = explicitMem * 1024 * 1024; memorySource = 'env'; }
  else {
    const v2 = read('/sys/fs/cgroup/memory.max');
    const v1 = read('/sys/fs/cgroup/memory/memory.limit_in_bytes');
    const candidate = v2 && v2 !== 'max' ? Number(v2) : Number(v1);
    // cgroup v1 « sans limite » vaut ~9,2e18 : on ne retient qu'une limite plus petite que la machine.
    if (Number.isFinite(candidate) && candidate > 0 && candidate < os.totalmem()) { memoryBytes = candidate; memorySource = v2 && v2 !== 'max' ? 'cgroup2' : 'cgroup1'; }
  }
  return { cpu: Math.max(0.05, Math.min(cpu, machineCpu)), memoryBytes, source: { cpu: cpuSource, memory: memorySource } };
}

/**
 * Famille de routes : `/api/<zone>/<ressource>`, sans identifiant ni requête —
 * cardinalité bornée, aucune donnée personnelle dans les métriques.
 */
export function routeGroup(url: string): string {
  const pathname = String(url || '').split('?')[0];
  if (!pathname.startsWith('/api/')) {
    if (pathname.startsWith('/uploads/')) return 'uploads';
    if (pathname.startsWith('/media/')) return 'media';
    if (pathname.startsWith('/assets/')) return 'assets';
    return 'pages';
  }
  const parts = pathname.split('/').filter(Boolean).slice(1, 4)
    .filter((part) => (/^[a-z][a-z-]{1,40}$/.test(part) || /^v\d{1,2}$/.test(part)) && !/^(?:[0-9a-f]{8,}|[a-z]+_[A-Za-z0-9]+)$/.test(part));
  return `/api/${parts.slice(0, parts[0] === 'v1' ? 3 : 2).join('/')}`;
}

/** Percentile approché depuis l'histogramme : borne haute du seau atteint. */
export function histogramPercentile(counts: number[], q: number): number | null {
  const total = counts.reduce((sum, value) => sum + value, 0);
  if (!total) return null;
  const rank = Math.ceil(total * q);
  let seen = 0;
  for (let i = 0; i < counts.length; i++) {
    seen += counts[i];
    if (seen >= rank) return Number.isFinite(LATENCY_BOUNDS_MS[i]) ? LATENCY_BOUNDS_MS[i] : LATENCY_BOUNDS_MS[LATENCY_BOUNDS_MS.length - 2] * 2;
  }
  return null;
}

export interface WindowSummary {
  minutes: number;
  requests: number;
  rps: number;
  errors5xx: number;
  errorRate: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  cpuAvg: number | null;
  cpuMax: number | null;
  rssMaxMb: number | null;
  heapMaxMb: number | null;
  eventLoopP99Ms: number | null;
}

export interface DiskSummary {
  root: string;
  totalBytes: number | null;
  usedBytes: number | null;
  usedPercent: number | null;
  breakdown: Array<{ name: string; bytes: number; files: number; truncated: boolean }>;
}

export type OpsSignalCode = 'CPU_SATURATED' | 'MEMORY_PRESSURE' | 'LATENCY_HIGH' | 'EVENT_LOOP_BLOCKED' | 'ERRORS_HIGH' | 'DISK_FILLING';
export interface OpsSignal { code: OpsSignalCode; level: 'warning' | 'critical'; value: number; threshold: number; hint: string }

/**
 * La grille de l'audit, appliquée à la fenêtre de 5 minutes (le « soutenu ») et
 * au disque. Pure : testable sans horloge ni processus.
 */
export function evaluateSignals(window: WindowSummary, memoryLimitBytes: number, disk: Pick<DiskSummary, 'usedPercent'>): OpsSignal[] {
  const t = OPS_THRESHOLDS;
  const out: OpsSignal[] = [];
  if (window.cpuAvg !== null && window.cpuAvg >= t.cpuWarning) out.push({
    code: 'CPU_SATURATED', level: window.cpuAvg >= t.cpuCritical ? 'critical' : 'warning', value: window.cpuAvg, threshold: t.cpuWarning,
    hint: 'Identifier la famille de routes qui consomme le plus de temps (tableau « routes ») et l’optimiser AVANT d’ajouter des vCPU.',
  });
  const memoryPercent = window.rssMaxMb !== null ? (window.rssMaxMb * 1024 * 1024 * 100) / memoryLimitBytes : null;
  if (memoryPercent !== null && memoryPercent >= t.memoryWarning) out.push({
    code: 'MEMORY_PRESSURE', level: memoryPercent >= t.memoryCritical ? 'critical' : 'warning', value: Math.round(memoryPercent), threshold: t.memoryWarning,
    hint: 'Chercher la fuite ou le pic (téléversements en mémoire, OCR, images) ; si la base de travail est saine, passer au palier de RAM supérieur.',
  });
  const blocked = window.eventLoopP99Ms !== null && window.eventLoopP99Ms > t.eventLoopP99Ms;
  if (blocked) out.push({
    code: 'EVENT_LOOP_BLOCKED', level: window.eventLoopP99Ms! > t.eventLoopP99Ms * 3 ? 'critical' : 'warning', value: window.eventLoopP99Ms!, threshold: t.eventLoopP99Ms,
    hint: 'Travail synchrone sur le processus web (requête SQLite lente, traitement d’image, analyse HTML) : le déplacer vers un worker ou l’indexer.',
  });
  if (window.requests >= t.minRequests && window.p95 !== null && window.p95 > t.latencyP95Ms) out.push({
    code: 'LATENCY_HIGH', level: window.p95 > t.latencyP95Ms * 3 ? 'critical' : 'warning', value: window.p95, threshold: t.latencyP95Ms,
    hint: blocked
      ? 'Latence ET boucle bloquée : le goulot est le CPU ou la base sur ce serveur.'
      : 'Latence haute mais boucle libre : attente d’un fournisseur externe ou du réseau — un serveur de plus n’y changera rien.',
  });
  if (window.requests >= t.minRequests && window.errorRate > t.errorRate) out.push({
    code: 'ERRORS_HIGH', level: window.errorRate > t.errorRate * 5 ? 'critical' : 'warning', value: +(window.errorRate * 100).toFixed(2), threshold: t.errorRate * 100,
    hint: 'Lire les journaux par identifiant de requête (X-Request-ID) : panne d’un fournisseur, base verrouillée ou saturation.',
  });
  if (disk.usedPercent !== null && disk.usedPercent >= t.diskWarning) out.push({
    code: 'DISK_FILLING', level: disk.usedPercent >= t.diskCritical ? 'critical' : 'warning', value: disk.usedPercent, threshold: t.diskWarning,
    hint: 'Volume de données presque plein : une base SQLite qui ne peut plus écrire arrête tout le service. Agrandir le disque ou sortir caches et médias.',
  });
  return out;
}

export interface HourlyStore {
  run(sql: string, ...params: unknown[]): unknown;
  all<T = unknown>(sql: string, ...params: unknown[]): T[];
}

export interface OpsMetricsOptions {
  dataRoot: string;
  databasePath?: string;
  store?: HourlyStore | null;
  now?: () => number;
  limits?: OpsLimits;
  /** Intervalle d'échantillonnage CPU/mémoire/boucle (ms). 0 = pas de minuterie (tests). */
  sampleMs?: number;
}

/** Sous-dossiers du volume de données suivis un par un (les autres vont dans « autres »). */
const DISK_DIRS = ['uploads', 'backups', 'media-proxy', 'media-native', 'media-composed', 'media-isolated',
  'lens-recognition', 'lens-live-stock', 'variant-availability', 'product-enrichment', 'private'];

function directorySize(root: string, limit = 25_000): { bytes: number; files: number; truncated: boolean } {
  let bytes = 0; let files = 0; let truncated = false;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (files >= limit) { truncated = true; return { bytes, files, truncated }; }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) { try { bytes += fs.statSync(full).size; files++; } catch { /* supprimé entre-temps */ } }
    }
  }
  return { bytes, files, truncated };
}

export function createOpsMetrics(options: OpsMetricsOptions) {
  const now = options.now || Date.now;
  const limits = options.limits || detectLimits();
  const buckets: MinuteBucket[] = [];
  let inFlight = 0;
  let lastFlushedMinute = Math.floor(now() / 60_000);
  let diskCache: { at: number; value: DiskSummary } | null = null;

  const bucket = (): MinuteBucket => {
    const minute = Math.floor(now() / 60_000);
    let current = buckets[buckets.length - 1];
    if (!current || current.minute !== minute) {
      current = { minute, requests: 0, errors5xx: 0, latency: new Array(LATENCY_BOUNDS_MS.length).fill(0), groups: new Map(),
        cpuSum: 0, cpuMax: 0, cpuSamples: 0, rssMax: 0, heapMax: 0, loopP99Max: 0 };
      buckets.push(current);
      while (buckets.length && buckets[0].minute <= minute - WINDOW_MINUTES) buckets.shift();
    }
    return current;
  };

  /** Une requête terminée. Exporté pour les tests ; le middleware l'appelle. */
  function record(group: string, status: number, durationMs: number) {
    const current = bucket();
    current.requests++;
    if (status >= 500) current.errors5xx++;
    const index = LATENCY_BOUNDS_MS.findIndex((bound) => durationMs <= bound);
    current.latency[index === -1 ? LATENCY_BOUNDS_MS.length - 1 : index]++;
    const key = current.groups.has(group) || current.groups.size < MAX_GROUPS ? group : 'other';
    const stat = current.groups.get(key) || { requests: 0, errors5xx: 0, totalMs: 0 };
    stat.requests++; stat.totalMs += durationMs; if (status >= 500) stat.errors5xx++;
    current.groups.set(key, stat);
  }

  /** Un échantillon processus (CPU en % de la part allouée, mémoire, boucle). */
  function sample(input: { cpuPercent: number; rssBytes: number; heapBytes: number; loopP99Ms: number }) {
    const current = bucket();
    current.cpuSum += input.cpuPercent; current.cpuSamples++;
    current.cpuMax = Math.max(current.cpuMax, input.cpuPercent);
    current.rssMax = Math.max(current.rssMax, input.rssBytes);
    current.heapMax = Math.max(current.heapMax, input.heapBytes);
    current.loopP99Max = Math.max(current.loopP99Max, input.loopP99Ms);
    flushHourly();
  }

  function summarize(minutes: number): WindowSummary {
    const from = Math.floor(now() / 60_000) - minutes + 1;
    const selected = buckets.filter((entry) => entry.minute >= from);
    const latency = new Array(LATENCY_BOUNDS_MS.length).fill(0);
    let requests = 0; let errors = 0; let cpuSum = 0; let cpuSamples = 0; let cpuMax = 0; let rss = 0; let heap = 0; let loop = 0;
    for (const entry of selected) {
      requests += entry.requests; errors += entry.errors5xx;
      entry.latency.forEach((count, i) => { latency[i] += count; });
      cpuSum += entry.cpuSum; cpuSamples += entry.cpuSamples; cpuMax = Math.max(cpuMax, entry.cpuMax);
      rss = Math.max(rss, entry.rssMax); heap = Math.max(heap, entry.heapMax); loop = Math.max(loop, entry.loopP99Max);
    }
    const mb = (value: number) => (value ? Math.round(value / (1024 * 1024)) : null);
    return {
      minutes, requests, rps: +(requests / (minutes * 60)).toFixed(2), errors5xx: errors,
      errorRate: requests ? errors / requests : 0,
      p50: histogramPercentile(latency, 0.5), p95: histogramPercentile(latency, 0.95), p99: histogramPercentile(latency, 0.99),
      cpuAvg: cpuSamples ? Math.round(cpuSum / cpuSamples) : null, cpuMax: cpuSamples ? Math.round(cpuMax) : null,
      rssMaxMb: mb(rss), heapMaxMb: mb(heap), eventLoopP99Ms: cpuSamples ? Math.round(loop) : null,
    };
  }

  function topGroups(minutes = 5, limit = 12) {
    const from = Math.floor(now() / 60_000) - minutes + 1;
    const merged = new Map<string, GroupStat>();
    for (const entry of buckets) {
      if (entry.minute < from) continue;
      for (const [group, stat] of entry.groups) {
        const target = merged.get(group) || { requests: 0, errors5xx: 0, totalMs: 0 };
        target.requests += stat.requests; target.errors5xx += stat.errors5xx; target.totalMs += stat.totalMs;
        merged.set(group, target);
      }
    }
    const totalMs = [...merged.values()].reduce((sum, stat) => sum + stat.totalMs, 0) || 1;
    return [...merged.entries()]
      .map(([group, stat]) => ({ group, requests: stat.requests, errors5xx: stat.errors5xx,
        avgMs: Math.round(stat.totalMs / stat.requests), shareOfTime: +((stat.totalMs / totalMs) * 100).toFixed(1) }))
      .sort((a, b) => b.shareOfTime - a.shareOfTime)
      .slice(0, limit);
  }

  function disk(): DiskSummary {
    if (diskCache && now() - diskCache.at < 5 * 60_000) return diskCache.value;
    const root = path.resolve(options.dataRoot);
    let totalBytes: number | null = null; let usedBytes: number | null = null;
    try {
      const stat = fs.statfsSync(root);
      totalBytes = stat.blocks * stat.bsize;
      usedBytes = (stat.blocks - stat.bfree) * stat.bsize;
    } catch { /* plateforme sans statfs */ }
    const breakdown: DiskSummary['breakdown'] = [];
    if (options.databasePath && options.databasePath !== ':memory:') {
      let bytes = 0; let files = 0;
      for (const suffix of ['', '-wal', '-shm']) {
        try { bytes += fs.statSync(`${options.databasePath}${suffix}`).size; files++; } catch { /* absent */ }
      }
      breakdown.push({ name: 'database', bytes, files, truncated: false });
    }
    for (const name of DISK_DIRS) {
      const size = directorySize(path.join(root, name));
      if (size.files) breakdown.push({ name, ...size });
    }
    breakdown.sort((a, b) => b.bytes - a.bytes);
    const value: DiskSummary = {
      root, totalBytes, usedBytes,
      usedPercent: totalBytes && usedBytes !== null ? Math.round((usedBytes / totalBytes) * 100) : null,
      breakdown,
    };
    diskCache = { at: now(), value };
    return value;
  }

  /** Agrège chaque heure ÉCOULÉE dans `ops_metrics_hourly` (une écriture par heure). */
  function flushHourly() {
    if (!options.store) return;
    const minute = Math.floor(now() / 60_000);
    const hourStart = Math.floor(minute / 60) * 60;
    if (Math.floor(lastFlushedMinute / 60) * 60 === hourStart) return;
    const previousHour = Math.floor(lastFlushedMinute / 60) * 60;
    lastFlushedMinute = minute;
    const inHour = buckets.filter((entry) => entry.minute >= previousHour && entry.minute < previousHour + 60);
    if (!inHour.length) return;
    const latency = new Array(LATENCY_BOUNDS_MS.length).fill(0);
    let requests = 0; let errors = 0; let cpuSum = 0; let cpuSamples = 0; let cpuMax = 0; let rss = 0; let loop = 0;
    for (const entry of inHour) {
      requests += entry.requests; errors += entry.errors5xx; entry.latency.forEach((count, i) => { latency[i] += count; });
      cpuSum += entry.cpuSum; cpuSamples += entry.cpuSamples; cpuMax = Math.max(cpuMax, entry.cpuMax);
      rss = Math.max(rss, entry.rssMax); loop = Math.max(loop, entry.loopP99Max);
    }
    try {
      options.store.run(`INSERT INTO ops_metrics_hourly (hour,instance,requests,errors_5xx,p95_ms,cpu_avg,cpu_max,rss_max_mb,event_loop_p99_ms,disk_used_pct)
        VALUES (?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(hour,instance) DO UPDATE SET requests=excluded.requests,errors_5xx=excluded.errors_5xx,p95_ms=excluded.p95_ms,
          cpu_avg=excluded.cpu_avg,cpu_max=excluded.cpu_max,rss_max_mb=excluded.rss_max_mb,event_loop_p99_ms=excluded.event_loop_p99_ms,disk_used_pct=excluded.disk_used_pct`,
        new Date(previousHour * 60_000).toISOString(), instanceId(), requests, errors, histogramPercentile(latency, 0.95),
        cpuSamples ? Math.round(cpuSum / cpuSamples) : null, cpuSamples ? Math.round(cpuMax) : null,
        rss ? Math.round(rss / (1024 * 1024)) : null, cpuSamples ? Math.round(loop) : null, disk().usedPercent);
      options.store.run("DELETE FROM ops_metrics_hourly WHERE hour < ?", new Date(now() - 90 * 86_400_000).toISOString());
    } catch (error: any) {
      console.warn('[ops-metrics] historique horaire indisponible:', error?.message || error);
    }
  }

  function history(hours = 48) {
    if (!options.store) return [];
    try {
      return options.store.all(`SELECT hour,instance,requests,errors_5xx,p95_ms,cpu_avg,cpu_max,rss_max_mb,event_loop_p99_ms,disk_used_pct
        FROM ops_metrics_hourly WHERE hour >= ? ORDER BY hour DESC LIMIT 500`, new Date(now() - hours * 3_600_000).toISOString());
    } catch { return []; }
  }

  function snapshot() {
    const window5 = summarize(5);
    const diskSummary = disk();
    return {
      instance: instanceId(),
      at: new Date(now()).toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
      backgroundJobs: backgroundJobsEnabled(),
      limits: { cpu: limits.cpu, memoryMb: Math.round(limits.memoryBytes / (1024 * 1024)), source: limits.source },
      inFlight,
      windows: { '1m': summarize(1), '5m': window5, '15m': summarize(15), '60m': summarize(60) },
      routes: topGroups(5),
      disk: diskSummary,
      thresholds: OPS_THRESHOLDS,
      signals: evaluateSignals(window5, limits.memoryBytes, diskSummary),
      history: history(48),
    };
  }

  /** Format texte Prometheus (supervision externe : Grafana Cloud, Better Stack…). */
  function prometheus(): string {
    const w = summarize(1);
    const d = disk();
    const lines = [
      '# HELP ayrovi_requests_per_second Requêtes HTTP par seconde (moyenne 1 min).',
      '# TYPE ayrovi_requests_per_second gauge',
      `ayrovi_requests_per_second ${w.rps}`,
      '# TYPE ayrovi_http_error_rate gauge', `ayrovi_http_error_rate ${w.errorRate}`,
      '# TYPE ayrovi_latency_p95_ms gauge', `ayrovi_latency_p95_ms ${w.p95 ?? 0}`,
      '# TYPE ayrovi_latency_p99_ms gauge', `ayrovi_latency_p99_ms ${w.p99 ?? 0}`,
      '# TYPE ayrovi_cpu_percent gauge', `ayrovi_cpu_percent ${w.cpuAvg ?? 0}`,
      '# TYPE ayrovi_rss_mb gauge', `ayrovi_rss_mb ${w.rssMaxMb ?? 0}`,
      '# TYPE ayrovi_memory_limit_mb gauge', `ayrovi_memory_limit_mb ${Math.round(limits.memoryBytes / (1024 * 1024))}`,
      '# TYPE ayrovi_event_loop_p99_ms gauge', `ayrovi_event_loop_p99_ms ${w.eventLoopP99Ms ?? 0}`,
      '# TYPE ayrovi_in_flight gauge', `ayrovi_in_flight ${inFlight}`,
      '# TYPE ayrovi_disk_used_percent gauge', `ayrovi_disk_used_percent ${d.usedPercent ?? 0}`,
    ];
    return `${lines.join('\n')}\n`;
  }

  function middleware(req: Request, res: Response, next: NextFunction) {
    const started = process.hrtime.bigint();
    inFlight++;
    let done = false;
    const finish = () => {
      if (done) return; done = true; inFlight--;
      record(routeGroup(req.originalUrl || req.url), res.statusCode, Number(process.hrtime.bigint() - started) / 1e6);
    };
    res.once('finish', finish);
    res.once('close', finish);
    next();
  }

  let timer: NodeJS.Timeout | null = null;
  function start() {
    const every = options.sampleMs ?? 5_000;
    if (!every || timer) return;
    const loop = monitorEventLoopDelay({ resolution: 20 });
    loop.enable();
    let lastCpu = process.cpuUsage();
    let lastAt = process.hrtime.bigint();
    timer = setInterval(() => {
      const cpu = process.cpuUsage(lastCpu);
      const at = process.hrtime.bigint();
      const elapsedUs = Number(at - lastAt) / 1000;
      lastCpu = process.cpuUsage(); lastAt = at;
      const memory = process.memoryUsage();
      sample({
        cpuPercent: elapsedUs > 0 ? Math.min(100, ((cpu.user + cpu.system) / (elapsedUs * limits.cpu)) * 100) : 0,
        rssBytes: memory.rss,
        heapBytes: memory.heapUsed,
        loopP99Ms: loop.percentile(99) / 1e6,
      });
      loop.reset();
    }, every);
    timer.unref?.();
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }

  /** La base n'existe qu'après les middlewares : l'historique s'y branche ensuite. */
  function attachStore(store: HourlyStore | null) { options.store = store; }

  return { middleware, record, sample, summarize, topGroups, disk, snapshot, prometheus, history, start, stop, attachStore, limits };
}

export type OpsMetrics = ReturnType<typeof createOpsMetrics>;

/** Schéma de l'historique horaire. Idempotent. */
export function ensureOpsMetricsSchema(db: { exec(sql: string): unknown }) {
  db.exec(`CREATE TABLE IF NOT EXISTS ops_metrics_hourly (
    hour TEXT NOT NULL,
    instance TEXT NOT NULL,
    requests INTEGER NOT NULL DEFAULT 0,
    errors_5xx INTEGER NOT NULL DEFAULT 0,
    p95_ms INTEGER,
    cpu_avg INTEGER,
    cpu_max INTEGER,
    rss_max_mb INTEGER,
    event_loop_p99_ms INTEGER,
    disk_used_pct INTEGER,
    PRIMARY KEY (hour, instance)
  )`);
}

/** Identité d'instance (Render : RENDER_INSTANCE_ID ; ailleurs : nom d'hôte). */
export function instanceId(env: NodeJS.ProcessEnv = process.env): string {
  return String(env.RENDER_INSTANCE_ID || env.HOSTNAME || os.hostname() || 'local').slice(0, 80);
}

/**
 * Rôle du processus — préparation du passage à plusieurs instances.
 *  • `AYROVI_BACKGROUND_JOBS=off` : instance web pure (aucune tâche planifiée) ;
 *  • absent / `on` : comportement historique (le processus fait tout).
 * Avec SQLite il n'y a qu'UNE instance : la valeur par défaut ne change rien.
 * Après le passage à PostgreSQL, une seule instance garde les tâches (le worker).
 */
export function backgroundJobsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return !/^(off|false|0|no)$/i.test(String(env.AYROVI_BACKGROUND_JOBS || '').trim());
}
