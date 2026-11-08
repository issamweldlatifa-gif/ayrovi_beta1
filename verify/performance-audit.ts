import { publicProductQuery } from '../src/catalogue/publicProducts';
/** Local diagnostic only. Always creates an in-memory database; never accepts a remote target. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import request from 'supertest';
import sharp from 'sharp';

const quick = process.argv.includes('--quick');
const output = path.resolve('.cache', quick ? 'performance-audit-quick.json' : 'performance-audit.json');
const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'zayrovi-performance-'));
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_PATH: ':memory:', ADMIN_EMAIL: 'performance@localhost',
  ADMIN_PASSWORD: 'LocalPerformanceFixtureOnly123!', CUSTOMER_AUTH_SECRET: 'performance-local-only-0123456789abcdef0123456789',
  FX_RATES_ENABLED: 'false', BACKUP_INTERVAL_HOURS: '0', AYROVI_LENS_LIVE_STOCK: 'false',
  AYROVIX_AI_WEB_SEARCH: 'false', CUSTOMER_OTP_PROVIDER: 'console', MAIL_PROVIDER: '',
  AYROVI_NATIVE_CARD_CACHE_DIR: cache,
  FIREBASE_PROJECT_ID: '', FIREBASE_CLIENT_EMAIL: '', FIREBASE_PRIVATE_KEY: '',
});
for (const key of ['ANTHROPIC_API_KEY','SERPAPI_KEY','SCRAPERAPI_KEY','GROQ_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY']) process.env[key] = '';
const rounded = (n: number) => Math.round(n * 100) / 100;
const percentile = (values: number[], fraction: number) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * fraction) - 1)] ?? 0;
async function main() {
  const start = performance.now();
  const { app, db } = await import('../src/server');
  const importMs = performance.now() - start;
  const sql = { calls: 0, ms: 0 };
  for (const name of ['all', 'get'] as const) {
    const original = db[name].bind(db);
    (db as any)[name] = (...args: any[]) => {
      const start = performance.now();
      try { return (original as any)(...args); }
      finally { sql.calls++; sql.ms += performance.now() - start; }
    };
  }
  const publisher = db.get<any>('SELECT id FROM story_publishers LIMIT 1').id;
  const phases: any[] = [];
  async function measure(label: string, tasks: (() => Promise<unknown>)[], concurrency = 1) {
    const delays = monitorEventLoopDelay({ resolution: 10 });
    delays.enable();
    await new Promise(r => setTimeout(r, 20));
    delays.reset();
    const baseline = process.memoryUsage();
    let rssMax = baseline.rss;
    const sample = setInterval(() => { rssMax = Math.max(rssMax, process.memoryUsage().rss); }, 5);
    const times: number[] = [];
    const beforeSql = { ...sql }, cpu = process.cpuUsage(), start = performance.now();
    let position = 0;
    try {
      await Promise.all(Array.from({ length: concurrency }, async () => {
        while (position < tasks.length) {
          const job = tasks[position++], start = performance.now();
          await job(); times.push(performance.now() - start);
        }
      }));
    } finally { clearInterval(sample); }
    const wallMs = performance.now() - start, used = process.cpuUsage(cpu);
    const memory = process.memoryUsage(); rssMax = Math.max(rssMax, memory.rss);
    delays.disable();
    return { label, requests: tasks.length, concurrency, wallMs: rounded(wallMs),
      p50Ms: rounded(percentile(times, .5)), p95Ms: rounded(percentile(times, .95)), maxMs: rounded(Math.max(...times)),
      cpuMs: rounded((used.user + used.system) / 1000), cpuOneCorePercent: rounded((used.user + used.system) / (wallMs * 10)),
      rssBaselineMiB: rounded(baseline.rss / 1048576), rssSampledMaxMiB: rounded(rssMax / 1048576),
      heapUsedMiB: rounded(memory.heapUsed / 1048576), externalMiB: rounded(memory.external / 1048576),
      eventLoopP95Ms: rounded(delays.percentile(95) / 1e6), eventLoopMaxMs: rounded(delays.max / 1e6),
      sqlCalls: sql.calls - beforeSql.calls, sqlMs: rounded(sql.ms - beforeSql.ms) };
  }
  let populated = 0;
  try {
    for (const size of quick ? [100, 1000] : [1000, 10000]) {
      db.run('BEGIN');
      try {
        // Set-based fixture loading avoids inflating RSS with 100,000 short-lived prepared statements.
        const range = 'WITH RECURSIVE n(i) AS (SELECT ? UNION ALL SELECT i+1 FROM n WHERE i+1 < ?)';
        db.run(`${range} INSERT INTO reels(id,title,channel_id,video_url,publish_at,status,created_at,updated_at)
          SELECT 'perf_reel_'||printf('%06d',i),'Performance fixture',?, '/media/fixture.mp4',
          '2026-01-01T00:00:00.000Z','publie','2026-01-01','2026-01-01' FROM n`, populated, size, publisher);
        db.run(`${range} INSERT INTO story_interactions(id,target_id,target_kind,type,created_at)
          SELECT 'perf_interaction_'||i,'perf_reel_'||printf('%06d',i/10),'post',
          CASE WHEN (i%10)%3=0 THEN 'like' ELSE 'view' END,'2026-01-01' FROM n`, populated * 10, size * 10);
        db.run(`${range} INSERT INTO products(id,name,status,visibility,created_at,updated_at)
          SELECT 'perf_product_'||i,'Performance fixture','ACTIVE','CATALOG','2026-01-01','2026-01-01'
          FROM n WHERE i%2=0`, populated, size);
        db.run('COMMIT');
      } catch (e) { db.run('ROLLBACK'); throw e; }
      populated = size;
      const endpoints = ['/api/ready', '/api/public/home', '/api/public/products?limit=50', '/api/public/social/reels?limit=12', '/api/public/social/reels'];
      const cases = [];
      for (const endpoint of endpoints) {
        const call = async () => {
          const response = await request(app).get(endpoint);
          if (response.status !== 200) throw Error(`${endpoint}: HTTP ${response.status}`);
          return response;
        };
        const firstStart = performance.now(), first = await call();
        const firstMs = performance.now() - firstStart;
        await call(); await call();
        const bytes = Buffer.byteLength(first.text);
        for (const concurrency of [1, 4]) cases.push({ endpoint, responseBytes: bytes, firstRequestMs: rounded(firstMs),
          ...await measure(endpoint, Array.from({ length: quick ? 4 : 12 }, () => call), concurrency) });
      }
      phases.push({ syntheticReels: size, syntheticInteractions: size * 10, syntheticProducts: size / 2, cases });
    }
    const plans = {
      reels: db.all('EXPLAIN QUERY PLAN SELECT id,publish_at FROM reels WHERE status=? AND publish_at<=? ORDER BY publish_at DESC,id DESC LIMIT 13', 'publie', '2026-11-05'),
      counts: db.all('EXPLAIN QUERY PLAN SELECT COUNT(*) FROM story_interactions WHERE target_id=? AND type=?', 'perf_reel_000001', 'view'),
      catalog: db.all('EXPLAIN QUERY PLAN ' + publicProductQuery({ scope: 'catalog', limit: 50 }).sql, 50),
    };
    const { getNativeCard } = await import('../src/services/cardNative');
    const image = await sharp({ create: { width: 1600, height: 2400, channels: 3, background: 'white' } })
      .composite([{ input: await sharp({ create: { width: 600, height: 1400, channels: 3, background: '#9a243c' } }).png().toBuffer(), left: 500, top: 500 }]).jpeg().toBuffer();
    let fetchCalls = 0;
    const fetcher = async () => { fetchCalls++; return image; };
    const same = await measure('8 identical cold native cards, synthetic 3.84MP image, no remote HTTP', Array.from({ length: 8 }, () => () => getNativeCard('https://cdn.example.com/perf-same.jpg', 600, { fetcher })), 8);
    const sameFetchCalls = fetchCalls;
    const distinct = await measure('8 distinct cold native cards, source scheduler behavior, no remote HTTP', Array.from({ length: 8 }, (_, i) => () => getNativeCard(`https://cdn.example.com/perf-${i}.jpg`, 600, { fetcher })), 8);
    const assets = fs.existsSync('public/assets') ? fs.readdirSync('public/assets').filter(n => n.endsWith('.js')).map(name => {
      const bytes = fs.readFileSync(path.join('public/assets', name));
      return { name, bytes: bytes.length, gzipBytes: gzipSync(bytes).length };
    }).sort((a, b) => b.bytes - a.bytes) : [];
    const report = { generatedAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      environment: { node: process.version, platform: process.platform, arch: process.arch, cpuModel: os.cpus()[0]?.model, logicalCpus: os.availableParallelism(), hostMemoryMiB: rounded(os.totalmem() / 1048576), mode: 'NODE_ENV=test, in-memory SQLite; local HTTP client and server in same Node process; no production traffic or background workers' },
      caveats: ['Not Render metrics or mobile FPS', 'No claim of production cold-start: importMs covers local module import and empty-database bootstrap only', 'CPU includes benchmark client, SQL instrumentation and JSON parsing', 'RSS samples can miss short-lived peaks; allocator retains earlier allocations', '12 requests/case is diagnostic, not a sustained capacity or p95 SLO study', 'Synthetic data and no network image fetching; SQLite in-memory omits production disk latency'],
      importMs: rounded(importMs), phases, plans, images: { same: { ...same, fetchCalls: sameFetchCalls }, distinct: { ...distinct, fetchCalls: fetchCalls - sameFetchCalls } },
      webAssets: { count: assets.length, largest: assets.slice(0, 10) } };
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(`Performance diagnostic written to ${output}`);
  } finally { db.close(); fs.rmSync(cache, { recursive: true, force: true }); }
}
main().then(() => process.exit(0), error => { console.error(error); fs.rmSync(cache, { recursive: true, force: true }); process.exit(1); });
