/* Hermetic browser verification of real pricing/cart endpoints plus production
 * product, cart and checkout components. No live merchant credentials needed. */
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';

async function run() {
  Object.assign(process.env, {
    NODE_ENV: 'test', DATABASE_PATH: ':memory:',
    CUSTOMER_AUTH_SECRET: 'purchase-flow-test-only-auth-secret-0123456789',
    AYROVIX_QUOTE_SECRET: 'purchase-flow-test-only-quote-secret-0123456789',
    ADMIN_EMAIL: 'purchase-test@example.test', ADMIN_PASSWORD: 'Purchase-test-only-123!',
    MAIL_PROVIDER: '', MAIL_API_KEY: '', MAIL_FROM: '',
    GOOGLE_CLIENT_ID: '', FACEBOOK_APP_ID: '', APPLE_CLIENT_ID: '',
    CUSTOMER_OTP_PROVIDER: 'console', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '',
    GROQ_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '',
    SERPAPI_KEY: '', SCRAPERAPI_KEY: '', AYROVIX_AI_WEB_SEARCH: 'false',
  });
  const { app, db } = await import('../src/server');
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const scripts = [
    ['verify/purchase-parents.mjs', 'verify/purchase-parents-fixture.tsx'],
    ['verify/mobile-purchase.mjs', 'verify/mobile-purchase-fixture.tsx'],
    ['verify/lens-enrichment.mjs', 'verify/purchase-parents-fixture.tsx'],
  ];
  try {
    for (const [test, fixture] of scripts) {
      const child = spawn(process.execPath, ['verify/sonim-actions-runner.mjs', test, fixture], {
        env: { ...process.env, AYROVI_API_URL: api }, stdio: 'inherit',
      });
      const exitCode = await new Promise<number>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', code => resolve(code ?? 1));
      });
      if (exitCode !== 0) throw new Error(`Purchase-flow browser checks failed: ${test} (exit ${exitCode})`);
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    db.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
