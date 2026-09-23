import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Tests must be hermetic: pin the env BEFORE any module loads so a local
    // .env (dotenv n'écrase pas les variables déjà définies) cannot leak into the suite.
    env: {
      NODE_ENV: 'test',
      MAIL_PROVIDER: '',
      MAIL_API_KEY: '',
      MAIL_FROM: '',
      DATABASE_PATH: ':memory:',
      ADMIN_EMAIL: 'admin@ayrovi.tn',
      ADMIN_PASSWORD: 'AyroviBeta2026!',
      CUSTOMER_AUTH_SECRET: 'test-customer-auth-secret-0123456789abcdef0123456789abcdef',
      // OTP hermétique : un .env avec webhook placeholder ne doit pas casser la suite.
      CUSTOMER_OTP_PROVIDER: 'console',
      // Moteur de promotions : la grille DAY est semée inactive pour que les
      // montants des tests historiques restent sans remise (tests/promo-engine
      // l'active explicitement). Production : env absent = actif.
      PROMO_ENGINE_ENABLED: 'false',
      // AYROVIX : hermétique — aucune clé IA ne fuit dans la suite ; les tests la simulent.
      ANTHROPIC_API_KEY: '',
      SERPAPI_KEY: '',
      SCRAPERAPI_KEY: '',
      GROQ_API_KEY: '',
      GEMINI_API_KEY: '',
      GOOGLE_API_KEY: '',
      OPENAI_API_KEY: '',
      AYROVIX_AI_WEB_SEARCH: 'false',
    },
  },
});
