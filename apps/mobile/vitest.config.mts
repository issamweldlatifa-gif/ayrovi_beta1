import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Tests de l'APPLICATION, isolés de la suite du site (vitest.config.mts à la
 * racine exclut `apps/**`). Aucun test ici n'importe du code de `client/`.
 */
export default defineConfig({
  resolve: {
    // Même alias que tsconfig.json (`@/*` → `src/*`).
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
