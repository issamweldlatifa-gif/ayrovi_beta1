import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const fromProjectRoot = (relativePath: string) => fileURLToPath(new URL(relativePath, import.meta.url));

// ختم البناء المرئي (04/10/2026) : اختصار كوميت GitHub في CI، تاريخ البناء
// محليًا — يُعرض في واجهة AyWebs لتمييز النسخ الجديدة من القديمة بصريًا.
const buildStamp = (process.env.GITHUB_SHA || '').slice(0, 7)
  || new Date().toISOString().slice(0, 10);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __AYROVI_BUILD_STAMP__: JSON.stringify(buildStamp),
    /* Origine de l'API injectée à la construction (04/10/2026) : le paquet
     * Android embarque la valeur, on ne peut donc pas la changer après coup.
     *   VITE_AYROVI_API_ORIGIN=https://mon-serveur.example npx vite build
     * Vide ⇒ repli sur l'origine de production (apiOrigin.ts). */
    __AYROVI_API_ORIGIN__: JSON.stringify(String(process.env.VITE_AYROVI_API_ORIGIN || '').trim()),
  },
  root: fromProjectRoot('./client'),
  build: {
    outDir: fromProjectRoot('./public'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
  },
});
