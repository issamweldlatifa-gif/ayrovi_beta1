/** Reproducible browser verification: isolated SQLite and disabled external providers. */
import { spawn } from 'node:child_process';
async function run() {
  Object.assign(process.env, {
    NODE_ENV: 'test', DATABASE_PATH: ':memory:',
    CUSTOMER_AUTH_SECRET: 'editorial-browser-isolated-test-secret-0123456789abcdef',
    ADMIN_EMAIL: 'editorial-admin@example.test', ADMIN_PASSWORD: 'Local-test-password-only-123!',
    MAIL_PROVIDER: '', MAIL_API_KEY: '', MAIL_FROM: '',
    GOOGLE_CLIENT_ID: '', FACEBOOK_APP_ID: '', APPLE_CLIENT_ID: '', CUSTOMER_OTP_PROVIDER: 'console',
    ANTHROPIC_API_KEY: '', OPENAI_API_KEY: '', GROQ_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '',
    SERPAPI_KEY: '', SCRAPERAPI_KEY: '', AYROVIX_AI_WEB_SEARCH: 'false',
  });
  const { app, db } = await import('../src/server');
  // Hero d'accueil : une carte PUBLIÉE est nécessaire (sans carte, le Hero ne s'affiche pas — règle produit).
  { const t = new Date().toISOString(); const cols = ['id','image','video','title','subtitle','cta','target_url','display_order','active','created_at','updated_at','title_ar','subtitle_ar','cta_ar','destination_type','destination_value']; const vals: any[] = ['editorial-hero-1','/media/hero-default.jpg','','Nouvelle collection','Sélection AYROVI de la saison','Découvrir','',0,1,t,t,'مجموعة جديدة','اختيارات AYROVI لهذا الموسم','اكتشف','STORIES','']; db.run(`INSERT INTO hero_slides(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`, ...vals); }
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as { port: number };
  try {
    const child = spawn(process.execPath, ['verify/editorial-customer.mjs'], {
      env: { ...process.env, AYROVI_BASE_URL: `http://127.0.0.1:${address.port}` }, stdio: 'inherit',
    });
    const timer = setTimeout(() => child.kill('SIGTERM'), 150_000);
    try {
      const code = await new Promise<number>((resolve, reject) => {
        child.once('error', reject); child.once('exit', code => resolve(code ?? 1));
      });
      if (code) throw new Error(`Customer browser checks failed (${code})`);
    } finally { clearTimeout(timer); }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); db.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
