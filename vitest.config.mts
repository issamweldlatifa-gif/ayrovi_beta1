import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Tests must be hermetic: pin the env BEFORE any module loads so a local
    // .env (dotenv n'écrase pas les variables déjà définies) cannot leak into the suite.
    env: {
      NODE_ENV: 'test',
      DATABASE_PATH: ':memory:',
      ADMIN_EMAIL: 'admin@ayrovi.tn',
      ADMIN_PASSWORD: 'AyroviBeta2026!',
      CUSTOMER_AUTH_SECRET: 'test-customer-auth-secret-0123456789abcdef0123456789abcdef',
      // AYROVIX : hermétique — aucune clé IA ne fuit dans la suite ; les tests la simulent.
      ANTHROPIC_API_KEY: '',
      SERPAPI_KEY: '',
    },
  },
});
