#!/usr/bin/env node
/** Low-rate read-only public probe. Explicit target required; no cookies or credentials. */
import fs from 'node:fs';
const args = process.argv.slice(2);
const value = name => args[args.indexOf(name) + 1];
if (args.includes('--help')) {
  console.log('node scripts/performance-probe.mjs --base https://YOUR-SERVICE --runs 3 --output probe.json\nSequential public GETs only; first readiness timeout 90s, others 15s; 750ms spacing. Does not measure server CPU/RAM.');
  process.exit(0);
}
if (!args.includes('--base')) throw Error('--base is required; no production target is assumed');
const base = new URL(value('--base'));
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw Error('Use an HTTP(S) origin without credentials, query or path');
const runs = args.includes('--runs') ? Number(value('--runs')) : 3;
if (!Number.isInteger(runs) || runs < 1 || runs > 10) throw Error('--runs must be between 1 and 10');
const paths = ['/api/ready', '/api/public/home', '/api/public/products?limit=5', '/api/public/social/reels?limit=12'];
const samples = [];
for (let round = 0; round < runs; round++) for (const path of paths) {
  const controller = new AbortController();
  const timeoutMs = round === 0 && path === '/api/ready' ? 90_000 : 15_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();
  const row = { round: round + 1, path, timeoutMs };
  try {
    const res = await fetch(new URL(path, base), { signal: controller.signal, redirect: 'error', headers: { Accept: 'application/json' } });
    row.headersMs = Math.round(performance.now() - start);
    row.status = res.status;
    row.requestId = res.headers.get('x-request-id');
    row.serverTiming = res.headers.get('server-timing');
    let bytes = 0, ready = '', truncated = false;
    if (res.body) {
      const reader = res.body.getReader();
      try {
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 1024 * 1024) { truncated = true; await reader.cancel(); break; }
          if (path === '/api/ready') ready += new TextDecoder().decode(chunk.value, { stream: true });
        }
      } finally { reader.releaseLock(); }
    }
    Object.assign(row, { fullResponseMs: Math.round(performance.now() - start), bytes, truncated });
    if (path === '/api/ready' && !truncated) {
      try { const body = JSON.parse(ready); row.deployment = { status: body.status, commit: body.commit, branch: body.branch }; } catch { row.invalidJson = true; }
    }
  } catch (error) { row.error = controller.signal.aborted ? 'TIMEOUT' : String(error.message).slice(0, 160); row.elapsedMs = Math.round(performance.now() - start); }
  finally { clearTimeout(timer); }
  samples.push(row);
  await new Promise(resolve => setTimeout(resolve, 750));
}
const result = { measuredAt: new Date().toISOString(), origin: base.origin,
  caveats: ['First request is not proof of cold start without correlated platform logs', 'Times include client DNS/TLS/network/server/body; no server CPU/RAM measurement', '1MiB body cap; truncated timings are not complete response durations', 'Sequential low-rate sampling is not a load test'], samples };
const json = JSON.stringify(result, null, 2);
if (args.includes('--output')) fs.writeFileSync(value('--output'), json + '\n');
console.log(json);
if (samples.some(s => s.error || s.status !== 200 || s.truncated || s.invalidJson)) process.exitCode = 1;
