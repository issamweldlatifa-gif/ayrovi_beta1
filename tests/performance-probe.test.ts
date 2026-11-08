import { expect, it } from 'vitest';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
it('requires an explicit target and does not infer a production URL', async () => {
  await expect(execute(process.execPath, ['scripts/performance-probe.mjs'])).rejects.toMatchObject({ code: 1 });
});
it('samples only sequential public GETs without credentials and records deployment identity', async () => {
  const seen: string[] = [];
  const server = createServer((req, res) => {
    seen.push(req.url!);
    expect(req.method).toBe('GET'); expect(req.headers.authorization).toBeUndefined(); expect(req.headers.cookie).toBeUndefined();
    res.setHeader('Content-Type', 'application/json'); res.setHeader('x-request-id', 'fixture-request');
    res.end(JSON.stringify({ status: 'ready', commit: 'abc1234', branch: 'fixture' }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = (server.address() as { port: number }).port;
    const { stdout } = await execute(process.execPath, ['scripts/performance-probe.mjs', '--base', `http://127.0.0.1:${port}`, '--runs', '1'], { timeout: 15_000 });
    const report = JSON.parse(stdout);
    expect(seen).toHaveLength(4);
    expect(report.samples[0].deployment.commit).toBe('abc1234');
    expect(report.samples.every((s: any) => s.status === 200 && !s.truncated && s.requestId === 'fixture-request')).toBe(true);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}, 20_000);
