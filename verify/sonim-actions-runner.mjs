import express from 'express';
import { build } from 'esbuild';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
mkdirSync('.cache', { recursive: true });
await build({ entryPoints: ['verify/sonim-actions-fixture.tsx'], outfile: '.cache/sonim-actions.js', bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } });
const styles = [...readFileSync('public/index.html', 'utf8').matchAll(/href="([^\"]+\.css)"/g)].map(m => `<link rel="stylesheet" href="${m[1]}">`).join('');
const app = express();
app.get('/__verify/sonim', (_req, res) => res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><div id="root"></div><script src="/__verify/sonim.js"></script></body></html>`));
app.get('/__verify/sonim.js', (_req, res) => res.sendFile(path.resolve('.cache/sonim-actions.js')));
app.use(express.static('public'));
const server = app.listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
try {
  const child = spawn(process.execPath, [process.argv[2] || 'verify/sonim-actions.mjs'], { env: { ...process.env, AYROVI_BASE_URL: `http://127.0.0.1:${server.address().port}` }, stdio: 'inherit' });
  const timer = setTimeout(() => child.kill('SIGTERM'), 180000);
  try { const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); }); if (code !== 0) throw new Error(`SONIM checks failed: ${code}`); }
  finally { clearTimeout(timer); }
} finally { await new Promise(r => server.close(r)); }
