/**
 * جهوزية الإصدار — يشغّله المالك قبل بناء AAB.
 *
 * الاختبار يشغّل السكريبت الحقيقي (spawn) على خادم وهمي محلي: ما فماش شبكة
 * خارجية، وما فماش مفتاح حقيقي. اللي كنتحقّقوا فيه: **الحكم** — نجاح، فشل
 * بسبب معيّن، وما ينّجّم ينجح كان الحاجة ناقصة (assetlinks، versionCode، خادم).
 */
import { createServer, type Server } from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../scripts/release-preflight.mjs', import.meta.url));

/** خادم وهمي: مسار ⇒ (كود، جسم). */
async function startStub(routes: Record<string, { status?: number; body: unknown }>): Promise<{ url: string; close: () => Promise<void>; server: Server }> {
  const server = createServer((request, response) => {
    const route = routes[String(request.url || '')];
    if (!route) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end('{"error":"not found"}');
      return;
    }
    response.writeHead(route.status ?? 200, { 'content-type': 'application/json' });
    response.end(typeof route.body === 'string' ? route.body : JSON.stringify(route.body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    server,
    close: () => new Promise<void>((resolve) => { server.close(() => resolve()); }),
  };
}

interface Report {
  ok: boolean;
  summary: { pass: number; warn: number; fail: number; skip: number };
  checks: Array<{ id: string; status: string; detail: string }>;
}

function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, [SCRIPT, ...args], { timeout: 20_000 }, (error, stdout, stderr) => {
      const code = error && typeof (error as { code?: number }).code === 'number' ? Number((error as { code?: number }).code) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

const openStubs: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(openStubs.splice(0).map((close) => close()));
});

const READY = { status: 'ready', database: 'ok', version: '3.10.4', commit: '4ae6c0d24e70' };
const CONFIG = {
  paymentMethods: ['COD', 'BANK_TRANSFER'],
  capabilities: { cardGateway: false },
  deposit: { percent: 20, bankRib: '12 345 6789012345678 90', posteAccount: '' },
};
const LINKS = [{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: {
    namespace: 'android_app',
    package_name: 'app.ayrovi.mobile',
    sha256_cert_fingerprints: [
      'C0:4A:9F:31:7B:2D:88:E4:5A:16:0C:D3:71:BE:42:9A:64:1F:07:B5:AE:38:D2:96:4C:81:F3:5E:20:79:AB:6D',
      '1D:33:88:07:F1:52:B9:6C:2E:0A:44:7F:C5:19:E3:8B:27:60:DA:14:9C:35:82:4E:A1:6B:00:7D:F8:22:59:C7',
    ],
  },
}];
const ALL_SECRETS = 'ANDROID_KEYSTORE_BASE64,ANDROID_KEYSTORE_PASSWORD,ANDROID_KEY_ALIAS,ANDROID_KEY_PASSWORD';

const baseRoutes = (links: Record<string, { status?: number; body: unknown }> = {}) => ({
  '/api/health': { body: { status: 'ok', version: '3.10.4' } },
  '/api/ready': { body: READY },
  '/api/public/commerce-config': { body: CONFIG },
  '/.well-known/assetlinks.json': { body: LINKS },
  ...links,
});

function parse(report: string): Report {
  return JSON.parse(report) as Report;
}

describe('جهوزية الإصدار — الحكم', () => {
  it('كل شي جاهز ⇒ نجاح بلا فشل', async () => {
    const stub = await startStub(baseRoutes());
    openStubs.push(stub.close);

    const { code, stdout } = await run([
      '--api-base', stub.url, '--origin', stub.url, '--json',
      '--version-name', '2.0.1', '--version-code', '8',
      '--branch-commit', '4ae6c0d24e70', '--secrets', ALL_SECRETS,
    ]);
    const report = parse(stdout);

    expect(code).toBe(0);
    expect(report.ok).toBe(true);
    expect(report.summary.fail).toBe(0);
    const byId = Object.fromEntries(report.checks.map((check) => [check.id, check]));
    expect(byId['app-json'].status).toBe('pass');
    expect(byId['version-code'].detail).toContain('8 > 7');
    expect(byId['server-health'].status).toBe('pass');
    expect(byId['server-deploy'].status).toBe('pass');
    expect(byId['assetlinks'].detail).toContain('2 بصمة');
    expect(byId['secrets'].status).toBe('pass');
  });

  it('بصمة واحدة ⇒ تحذير (Play يعيد التوقيع) بلا فشل', async () => {
    const stub = await startStub(baseRoutes({
      '/.well-known/assetlinks.json': {
        body: [{ relation: ['x'], target: { namespace: 'android_app', package_name: 'app.ayrovi.mobile', sha256_cert_fingerprints: ['C0:4A:9F:31:7B:2D:88:E4:5A:16:0C:D3:71:BE:42:9A:64:1F:07:B5:AE:38:D2:96:4C:81:F3:5E:20:79:AB:6D'] } }],
      },
    }));
    openStubs.push(stub.close);

    const { code, stdout } = await run([
      '--api-base', stub.url, '--origin', stub.url, '--json',
      '--version-code', '8', '--branch-commit', '4ae6c0d24e70', '--secrets', ALL_SECRETS,
    ]);
    const report = parse(stdout);
    const byId = Object.fromEntries(report.checks.map((check) => [check.id, check]));

    expect(code).toBe(0);
    expect(byId['assetlinks'].status).toBe('pass');
    expect(byId['assetlinks-play'].status).toBe('warn');
  });

  it('assetlinks فيه حزمة أخرى ⇒ فشل صريح', async () => {
    const stub = await startStub(baseRoutes({
      '/.well-known/assetlinks.json': {
        body: [{ relation: ['x'], target: { namespace: 'android_app', package_name: 'app.autre.app', sha256_cert_fingerprints: ['C0:4A:9F:31:7B:2D:88:E4:5A:16:0C:D3:71:BE:42:9A:64:1F:07:B5:AE:38:D2:96:4C:81:F3:5E:20:79:AB:6D'] } }],
      },
    }));
    openStubs.push(stub.close);

    const { code, stdout } = await run([
      '--api-base', stub.url, '--origin', stub.url, '--json',
      '--version-code', '8', '--branch-commit', '4ae6c0d24e70', '--secrets', ALL_SECRETS,
    ]);
    const report = parse(stdout);
    const byId = Object.fromEntries(report.checks.map((check) => [check.id, check]));

    expect(code).toBe(1);
    expect(report.ok).toBe(false);
    expect(byId['assetlinks'].status).toBe('fail');
    expect(byId['assetlinks'].detail).toContain('app.ayrovi.mobile');
  });

  it('بلا بصمة في الخادم (404) ⇒ الفشل يسمّي المتغيّر', async () => {
    const stub = await startStub(baseRoutes({
      '/.well-known/assetlinks.json': { status: 404, body: { error: 'APP_LINK_FINGERPRINT_NOT_CONFIGURED' } },
    }));
    openStubs.push(stub.close);

    const { code, stdout } = await run([
      '--api-base', stub.url, '--origin', stub.url, '--json',
      '--version-code', '8', '--branch-commit', '4ae6c0d24e70', '--secrets', ALL_SECRETS,
    ]);
    const report = parse(stdout);
    const byId = Object.fromEntries(report.checks.map((check) => [check.id, check]));

    expect(code).toBe(1);
    expect(byId['assetlinks'].status).toBe('fail');
    expect(byId['assetlinks'].detail).toContain('ANDROID_APP_LINK_SHA256');
  });

  it('كود إصدار معاد ⇒ فشل قبل أي حاجة أخرى', async () => {
    const stub = await startStub(baseRoutes());
    openStubs.push(stub.close);

    const { code, stdout } = await run([
      '--api-base', stub.url, '--origin', stub.url, '--json',
      '--version-code', '7', '--branch-commit', '4ae6c0d24e70', '--secrets', ALL_SECRETS,
    ]);
    const report = parse(stdout);
    const byId = Object.fromEntries(report.checks.map((check) => [check.id, check]));

    expect(code).toBe(1);
    expect(byId['version-code'].status).toBe('fail');
    expect(byId['version-code'].detail).toContain('Play يرفض');
  });

  it('خادم مطفي ⇒ فشل واضح بلا رمي استثناء', async () => {
    const stub = await startStub(baseRoutes());
    await stub.close(); // المنفذ ولّى مسكّراً: نفس ما يصير كان الخادم طايح.

    const { code, stdout } = await run([
      '--api-base', stub.url, '--origin', stub.url, '--json', '--timeout', '800',
      '--version-code', '8', '--branch-commit', '4ae6c0d24e70', '--secrets', ALL_SECRETS,
    ]);
    const report = parse(stdout);
    const byId = Object.fromEntries(report.checks.map((check) => [check.id, check]));

    expect(code).toBe(1);
    expect(byId['server-health'].status).toBe('fail');
  });

  it('أسرار ناقصة ⇒ الفشل يقول شنوّة ناقص بالاسم', async () => {
    const stub = await startStub(baseRoutes());
    openStubs.push(stub.close);

    const { code, stdout } = await run([
      '--api-base', stub.url, '--origin', stub.url, '--json',
      '--version-code', '8', '--branch-commit', '4ae6c0d24e70', '--secrets', 'ANDROID_KEYSTORE_BASE64',
    ]);
    const report = parse(stdout);
    const byId = Object.fromEntries(report.checks.map((check) => [check.id, check]));

    expect(code).toBe(1);
    expect(byId['secrets'].status).toBe('fail');
    expect(byId['secrets'].detail).toContain('ANDROID_KEY_ALIAS');
    expect(byId['secrets'].detail).toContain('ANDROID_KEY_PASSWORD');
  });

  it('الطبع العادي يشرح بالعربي، و`--help` يخرج بنجاح', async () => {
    const help = await run(['--help']);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('release-preflight');

    const stub = await startStub(baseRoutes({ '/.well-known/assetlinks.json': { status: 404, body: {} } }));
    openStubs.push(stub.close);
    const { code, stdout } = await run([
      '--api-base', stub.url, '--origin', stub.url,
      '--version-code', '8', '--branch-commit', '4ae6c0d24e70', '--secrets', ALL_SECRETS,
    ]);
    expect(code).toBe(1);
    expect(stdout).toContain('[FAIL]');
    expect(stdout).toContain('ما تبنِش توّا');
  });
});
