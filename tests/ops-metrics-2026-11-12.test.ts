/**
 * Métriques d'exploitation (audit d'architecture 12/11/2026).
 *
 * La règle d'or de l'audit : on n'ajoute pas un serveur au nombre d'utilisateurs,
 * on l'ajoute sur une mesure SOUTENUE. Ces tests verrouillent :
 *  • la part de CPU/mémoire ALLOUÉE (quota cgroup — 0,5 vCPU sur Render Starter) ;
 *  • les fenêtres glissantes et les percentiles ;
 *  • la grille de signaux, dont la distinction « boucle bloquée » (CPU/base)
 *    contre « boucle libre » (attente externe : un serveur de plus n'aide pas) ;
 *  • l'historique horaire persistant ;
 *  • les deux points d'accès : CRM (permission) et Prometheus (jeton, sinon 404).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import request from 'supertest';
import {
  OPS_THRESHOLDS, backgroundJobsEnabled, createOpsMetrics, detectLimits, ensureOpsMetricsSchema,
  evaluateSignals, histogramPercentile, routeGroup, type WindowSummary,
} from '../src/services/opsMetrics';

const limits = { cpu: 0.5, memoryBytes: 512 * 1024 * 1024, source: { cpu: 'test', memory: 'test' } };

describe('limites allouées', () => {
  it('lit le quota cgroup v2 (Render Starter : 0,5 vCPU / 512 Mo)', () => {
    const files: Record<string, string> = { '/sys/fs/cgroup/cpu.max': '50000 100000', '/sys/fs/cgroup/memory.max': String(512 * 1024 * 1024) };
    const detected = detectLimits({}, (file) => files[file] ?? null);
    expect(detected.cpu).toBe(0.5);
    expect(detected.source.cpu).toBe('cgroup2');
    // La mémoire n'est retenue que si elle est sous la RAM de la machine de test.
    if (512 * 1024 * 1024 < require('node:os').totalmem()) expect(detected.memoryBytes).toBe(512 * 1024 * 1024);
  });
  it('« max » = pas de quota : on retombe sur la machine ; une variable explicite prime', () => {
    expect(detectLimits({}, (file) => (file.endsWith('cpu.max') ? 'max 100000' : null)).source.cpu).toBe('machine');
    const explicit = detectLimits({ AYROVI_CPU_LIMIT: '0.5', AYROVI_MEMORY_LIMIT_MB: '512' }, () => null);
    expect(explicit).toMatchObject({ cpu: 0.5, memoryBytes: 512 * 1024 * 1024, source: { cpu: 'env', memory: 'env' } });
  });
});

describe('familles de routes (cardinalité bornée, aucun identifiant)', () => {
  it.each([
    ['/api/public/social/counts?ids=a,b', '/api/public/social'],
    ['/api/public/products/prd_abc123', '/api/public/products'],
    ['/api/customer/account/orders/ORD-1/payments', '/api/customer/account'],
    ['/api/v1/aywebs/product/resolve', '/api/v1/aywebs/product'],
    ['/api/admin/orders/9f8e7d6c5b4a3f2e', '/api/admin/orders'],
    ['/uploads/lens/x.mp4', 'uploads'],
    ['/media/reels-owned/a.mp4', 'media'],
    ['/fr/produit/abc', 'pages'],
  ])('%s → %s', (url, group) => {
    expect(routeGroup(url)).toBe(group);
  });
});

it('percentiles depuis l’histogramme', () => {
  // seaux : ≤5, ≤10, ≤25, ≤50, ≤100, ≤250 …
  const counts = [50, 30, 10, 5, 3, 2, 0, 0, 0, 0, 0, 0];
  expect(histogramPercentile(counts, 0.5)).toBe(5);
  expect(histogramPercentile(counts, 0.95)).toBe(50);
  expect(histogramPercentile(counts, 0.98)).toBe(100);
  expect(histogramPercentile(counts, 0.99)).toBe(250); // rang 99/100 : dans le seau ≤ 250
  expect(histogramPercentile(new Array(12).fill(0), 0.5)).toBeNull();
});

describe('fenêtres glissantes', () => {
  it('compte, classe par part du temps et oublie au-delà de 60 min', () => {
    let clock = Date.UTC(2026, 10, 12, 10, 0, 0);
    const metrics = createOpsMetrics({ dataRoot: '/nonexistent', now: () => clock, limits, sampleMs: 0 });
    for (let i = 0; i < 90; i++) metrics.record('/api/public/products', 200, 4);
    for (let i = 0; i < 10; i++) metrics.record('/api/public/social', i < 2 ? 503 : 200, 120);
    metrics.sample({ cpuPercent: 40, rssBytes: 200 * 1024 * 1024, heapBytes: 90 * 1024 * 1024, loopP99Ms: 12 });

    const w = metrics.summarize(5);
    expect(w).toMatchObject({ requests: 100, errors5xx: 2, errorRate: 0.02, cpuAvg: 40, rssMaxMb: 200, eventLoopP99Ms: 12 });
    expect(w.p50).toBe(5);
    // 10 % du trafic mais 77 % du temps : c'est elle qu'on optimise d'abord.
    const [top] = metrics.topGroups(5);
    expect(top).toMatchObject({ group: '/api/public/social', requests: 10, errors5xx: 2, avgMs: 120 });
    expect(top.shareOfTime).toBeGreaterThan(70);

    clock += 61 * 60_000;
    metrics.record('/api/ready', 200, 1);
    expect(metrics.summarize(60).requests).toBe(1);
  });
});

describe('fenêtre lue juste après un changement de minute', () => {
  it('ne retombe pas à zéro et divise par la durée réellement couverte', () => {
    let clock = Date.UTC(2026, 10, 12, 10, 0, 0);
    const metrics = createOpsMetrics({ dataRoot: '/nonexistent', now: () => clock, limits, sampleMs: 0 });
    clock += 30_000; // 10:00:30
    for (let i = 0; i < 600; i++) metrics.record('/api/public/products', 200, 4);
    metrics.sample({ cpuPercent: 90, rssBytes: 300 * 1024 * 1024, heapBytes: 100 * 1024 * 1024, loopP99Ms: 40 });
    clock = Date.UTC(2026, 10, 12, 10, 1, 2); // 2 s après le changement de minute
    const w = metrics.summarize(1);
    expect(w.requests).toBe(600);
    expect(w.rps).toBeCloseTo(600 / 62, 1); // couvert : 10:00:00 → 10:01:02
    expect(w.cpuAvg).toBe(90);
    expect(metrics.prometheus()).toContain('ayrovi_cpu_percent 90');
    // Deux minutes plus tard, la fenêtre d'une minute a bien oublié ce pic.
    clock = Date.UTC(2026, 10, 12, 10, 3, 0);
    expect(metrics.summarize(1).requests).toBe(0);
  });
});

describe('grille de signaux (audit §5)', () => {
  const calm: WindowSummary = { minutes: 5, requests: 1000, rps: 3.3, errors5xx: 0, errorRate: 0, p50: 10, p95: 50, p99: 100,
    cpuAvg: 30, cpuMax: 50, rssMaxMb: 200, heapMaxMb: 100, eventLoopP99Ms: 20 };
  const memory = 512 * 1024 * 1024;

  it('aucun signal quand tout est calme', () => {
    expect(evaluateSignals(calm, memory, { usedPercent: 40 })).toEqual([]);
  });
  it('CPU soutenu ≥ 85 % (critique ≥ 95 %), mémoire ≥ 85 %, disque ≥ 80 %', () => {
    const codes = evaluateSignals({ ...calm, cpuAvg: 96, rssMaxMb: 470 }, memory, { usedPercent: 91 });
    expect(codes.map((s) => [s.code, s.level])).toEqual([
      ['CPU_SATURATED', 'critical'], ['MEMORY_PRESSURE', 'warning'], ['DISK_FILLING', 'critical'],
    ]);
  });
  it('latence haute + boucle BLOQUÉE ⇒ CPU/base ; boucle LIBRE ⇒ attente externe', () => {
    const blocked = evaluateSignals({ ...calm, p95: 1000, eventLoopP99Ms: 450 }, memory, { usedPercent: null });
    expect(blocked.map((s) => s.code)).toEqual(['EVENT_LOOP_BLOCKED', 'LATENCY_HIGH']);
    expect(blocked[1].hint).toMatch(/CPU ou la base/);
    const external = evaluateSignals({ ...calm, p95: 2500, eventLoopP99Ms: 15 }, memory, { usedPercent: null });
    expect(external.map((s) => s.code)).toEqual(['LATENCY_HIGH']);
    expect(external[0].hint).toMatch(/un serveur de plus n’y changera rien/);
  });
  it('latence et erreurs ne se jugent pas sur une poignée de requêtes', () => {
    const few = { ...calm, requests: OPS_THRESHOLDS.minRequests - 1, p95: 5000, errorRate: 0.5 };
    expect(evaluateSignals(few, memory, { usedPercent: null })).toEqual([]);
    expect(evaluateSignals({ ...calm, errorRate: 0.02 }, memory, { usedPercent: null }).map((s) => s.code)).toEqual(['ERRORS_HIGH']);
  });
});

it('historique horaire : une ligne par heure écoulée, idempotente', () => {
  const raw = new Database(':memory:');
  ensureOpsMetricsSchema(raw);
  ensureOpsMetricsSchema(raw);
  const store = { run: (sql: string, ...p: unknown[]) => raw.prepare(sql).run(...p), all: <T>(sql: string, ...p: unknown[]) => raw.prepare(sql).all(...p) as T[] };
  let clock = Date.UTC(2026, 10, 12, 10, 30, 0);
  const metrics = createOpsMetrics({ dataRoot: '/nonexistent', now: () => clock, limits, store, sampleMs: 0 });
  for (let i = 0; i < 20; i++) metrics.record('/api/public/products', 200, 30);
  metrics.sample({ cpuPercent: 60, rssBytes: 300 * 1024 * 1024, heapBytes: 1, loopP99Ms: 30 });
  expect(raw.prepare('SELECT COUNT(*) n FROM ops_metrics_hourly').get()).toEqual({ n: 0 });
  clock = Date.UTC(2026, 10, 12, 11, 0, 5);
  metrics.sample({ cpuPercent: 10, rssBytes: 1, heapBytes: 1, loopP99Ms: 1 });
  const rows = metrics.history(48) as any[];
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ hour: '2026-11-12T10:00:00.000Z', requests: 20, cpu_avg: 60, rss_max_mb: 300, p95_ms: 50 });
});

it('rôle du processus : tâches planifiées actives par défaut, coupées sur demande', () => {
  expect(backgroundJobsEnabled({})).toBe(true);
  expect(backgroundJobsEnabled({ AYROVI_BACKGROUND_JOBS: 'on' })).toBe(true);
  expect(backgroundJobsEnabled({ AYROVI_BACKGROUND_JOBS: 'off' })).toBe(false);
  expect(backgroundJobsEnabled({ AYROVI_BACKGROUND_JOBS: 'false' })).toBe(false);
});

describe('points d’accès HTTP', () => {
  let app: any;
  let agent: any;
  beforeAll(async () => {
    ({ app } = await import('../src/server'));
    agent = request.agent(app);
    const login = await agent.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
  });
  afterAll(() => { delete process.env.OPS_METRICS_TOKEN; });

  it('CRM : fermé sans session, instantané complet pour un administrateur', async () => {
    expect((await request(app).get('/api/admin/ops/metrics')).status).toBe(401);
    await request(app).get('/api/public/navigation');
    const response = await agent.get('/api/admin/ops/metrics');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(Object.keys(response.body.data)).toEqual(expect.arrayContaining(['limits', 'windows', 'routes', 'disk', 'signals', 'thresholds', 'history', 'backgroundJobs']));
    expect(response.body.data.windows['5m'].requests).toBeGreaterThan(0);
  });

  it('Prometheus : 404 sans jeton configuré, 404 avec un mauvais jeton, texte avec le bon', async () => {
    expect((await request(app).get('/api/ops/metrics')).status).toBe(404);
    process.env.OPS_METRICS_TOKEN = 'token-de-supervision-assez-long-2026';
    expect((await request(app).get('/api/ops/metrics').set('authorization', 'Bearer faux')).status).toBe(404);
    const ok = await request(app).get('/api/ops/metrics').set('authorization', 'Bearer token-de-supervision-assez-long-2026');
    expect(ok.status).toBe(200);
    expect(ok.text).toContain('ayrovi_requests_per_second');
    expect(ok.text).toContain('ayrovi_event_loop_p99_ms');
  });
});
