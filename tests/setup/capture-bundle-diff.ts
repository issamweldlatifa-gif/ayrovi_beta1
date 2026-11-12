/**
 * AYWEBs — MODE DIFFÉRENTIEL DES LOTS DE CAPTURE (12/11/2026).
 *
 * Inactif par défaut. Avec `AYWEBS_BUNDLE_DIFF=1`, chaque exécution du cœur
 * complet faite par un test (`new Function(…, 'return ' + AYWEBS_CAPTURE_SCRIPT)`)
 * est REJOUÉE avec le lot spécialisé que le serveur servirait pour l'hôte de la
 * page (`shein`, `temu`, `aliexpress`, sinon `kernel`), sur le MÊME document.
 * Toute différence de sortie (hors horodatage) fait échouer le test.
 *
 * Toute la suite de capture existante — des centaines de pages construites à la
 * main depuis de vraies captures — devient ainsi la preuve que le découpage par
 * boutique ne change RIEN au résultat.
 *
 *   AYWEBS_BUNDLE_DIFF=1 npx vitest run tests/aywebs-
 *
 * Le cœur est en lecture seule (aucune écriture DOM / window / stockage) : le
 * rejouer sur la même page est sans effet de bord.
 */
import fs from 'node:fs';
import { afterAll, beforeAll, expect } from 'vitest';

const HOST_PREFIX = /^(?:www\d*|m\d*|mobile|wap|touch|smile)\./;

export function bundleForHost(host: string): 'kernel' | 'shein' | 'temu' | 'aliexpress' | null {
  // Amazon et Zalando ont leur script dédié : le cœur n'est jamais leur intégration.
  if (/^amazon\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(host)) return null;
  if (/(?:^|\.)zalando\.[a-z.]{2,6}$/i.test(host)) return null;
  if (/(^|\.)shein\.(com|co\.uk|fr|de|es|it|ca|com\.mx|com\.br)$/.test(host)) return 'shein';
  if (/(^|\.)temu\.com$/.test(host)) return 'temu';
  if (/(^|\.)aliexpress\.(com|us|ru)$/.test(host)) return 'aliexpress';
  return 'kernel';
}

function hostOf(location: unknown): string {
  try {
    const value = location as { hostname?: unknown; href?: unknown } | null;
    const raw = value?.hostname ?? (value?.href ? new URL(String(value.href)).hostname : '');
    return String(raw || '').toLowerCase().replace(HOST_PREFIX, '');
  } catch { return ''; }
}

/** Même adresse, hôte neutre : ni place de marché, ni Amazon, ni Zalando. */
function neutralLocation(location: unknown): Record<string, string> | null {
  try {
    const value = location as { href?: unknown } | null;
    if (!value?.href) return null;
    const url = new URL(String(value.href));
    url.hostname = 'shop.example';
    return { href: url.href, hostname: url.hostname, host: url.host, origin: url.origin, protocol: url.protocol, pathname: url.pathname, search: url.search, hash: url.hash, port: url.port };
  } catch { return null; }
}

function comparable(result: unknown): string {
  if (typeof result !== 'string') return JSON.stringify(result ?? null);
  try {
    const parsed = JSON.parse(result);
    if (parsed && typeof parsed === 'object') delete parsed.capturedAt;
    return JSON.stringify(parsed);
  } catch { return result; }
}

function firstDifference(a: string, b: string): string {
  try {
    const left = JSON.parse(a); const right = JSON.parse(b);
    for (const key of new Set([...Object.keys(left || {}), ...Object.keys(right || {})])) {
      const l = JSON.stringify(left?.[key]); const r = JSON.stringify(right?.[key]);
      if (l !== r) return `${key}: cœur=${String(l).slice(0, 300)} | lot=${String(r).slice(0, 300)}`;
    }
  } catch { /* texte brut */ }
  return `${a.slice(0, 200)} | ${b.slice(0, 200)}`;
}

let restoreDifferential: (() => void) | null = null;
if (process.env.AYWEBS_BUNDLE_DIFF === '1') {
  beforeAll(installDifferential);
  afterAll(() => { restoreDifferential?.(); restoreDifferential = null; });
}

async function installDifferential(): Promise<void> {
  const { AYWEBS_CAPTURE_SCRIPT } = await import('../../src/aywebs/captureScript');
  const { AYWEBS_CAPTURE_BUNDLES } = await import('../../src/aywebs/captureBundles.generated');
  const core = AYWEBS_CAPTURE_SCRIPT.trim().replace(/[\s;]+$/, '');
  const stats: Record<string, number> = {};
  const Original = globalThis.Function;

  const Patched = function (this: unknown, ...args: string[]) {
    const fn = Original(...args) as (...callArgs: unknown[]) => unknown;
    const body = String(args[args.length - 1] ?? '');
    const usedBundle = Object.entries(AYWEBS_CAPTURE_BUNDLES).find(([, bundle]) => body.includes(bundle.text));
    if (usedBundle) {
      const coreFn = Original(...args.slice(0, -1), body.split(usedBundle[1].text).join(core)) as (...callArgs: unknown[]) => unknown;
      return function (this: unknown, ...callArgs: unknown[]) {
        const result = fn.apply(this, callArgs);
        const a = comparable(result); const b = comparable(coreFn.apply(this, callArgs));
        if (a !== b) throw new Error(`Cœur ≠ lot « ${usedBundle[0]} » servi — ${firstDifference(b, a)}`);
        stats[`served_${usedBundle[0]}`] = (stats[`served_${usedBundle[0]}`] || 0) + 1;
        return result;
      };
    }
    if (!body.includes(core)) return fn;
    const params = args.slice(0, -1);
    const locationIndex = params.findIndex((param) => String(param).trim() === 'location');
    const variantOf = (bundle: keyof typeof AYWEBS_CAPTURE_BUNDLES) =>
      Original(...params, body.split(core).join(AYWEBS_CAPTURE_BUNDLES[bundle].text)) as (...callArgs: unknown[]) => unknown;
    return function (this: unknown, ...callArgs: unknown[]) {
      const result = fn.apply(this, callArgs);
      const location = locationIndex >= 0 ? callArgs[locationIndex] : (globalThis as { location?: unknown }).location;
      const host = hostOf(location);
      // 1. Hôte réel : le lot que le serveur servirait pour cette page.
      const bundle = bundleForHost(host);
      if (bundle) {
        const a = comparable(result); const b = comparable(variantOf(bundle).apply(this, callArgs));
        if (a !== b) throw new Error(`Lot « ${bundle} » ≠ cœur sur ${host || '(sans hôte)'} — ${firstDifference(a, b)}`);
        stats[bundle] = (stats[bundle] || 0) + 1;
      } else stats.dedicatedHost = (stats.dedicatedHost || 0) + 1;
      // 2. Hôte neutre, même document : toute la logique commune du noyau, sur chaque page de la suite.
      const neutral = locationIndex >= 0 ? neutralLocation(location) : null;
      if (neutral && bundle !== 'kernel') {
        const args = callArgs.slice(); args[locationIndex] = neutral;
        const a = comparable(fn.apply(this, args)); const b = comparable(variantOf('kernel').apply(this, args));
        if (a !== b) throw new Error(`Lot « kernel » ≠ cœur sur la page de ${host} rejouée en hôte neutre — ${firstDifference(a, b)}`);
        stats.kernelNeutral = (stats.kernelNeutral || 0) + 1;
      }
      return result;
    };
  } as unknown as FunctionConstructor;
  Object.setPrototypeOf(Patched, Original);
  (Patched as unknown as { prototype: unknown }).prototype = Original.prototype;
  globalThis.Function = Patched;

  /* 3. Sens inverse : un test qui exécute un LOT (script servi par
     buildAyWebsCaptureScript, via dom.window.eval) est rejoué avec le cœur complet
     à sa place, dans la même enveloppe et sur la même page. */
  const bundleTexts = Object.entries(AYWEBS_CAPTURE_BUNDLES).map(([id, bundle]) => [id, bundle.text] as const);
  const { JSDOM } = await import('jsdom');
  const descriptor = Object.getOwnPropertyDescriptor(JSDOM.prototype, 'window');
  const patchedWindows = new WeakSet<object>();
  if (descriptor?.get) {
    const getWindow = descriptor.get;
    Object.defineProperty(JSDOM.prototype, 'window', {
      configurable: true,
      get(this: unknown) {
        const win = getWindow.call(this) as { eval: (source: string) => unknown; location?: unknown };
        if (win && !patchedWindows.has(win)) {
          patchedWindows.add(win);
          const originalEval = win.eval;
          win.eval = function (source: string) {
            const result = originalEval.call(win, source);
            if (typeof source !== 'string') return result;
            const used = bundleTexts.find(([, text]) => source.includes(text));
            if (used) {
              const a = comparable(result); const b = comparable(originalEval.call(win, source.split(used[1]).join(core)));
              if (a !== b) throw new Error(`Cœur ≠ lot « ${used[0]} » servi sur ${hostOf(win.location)} — ${firstDifference(b, a)}`);
              stats[`served_${used[0]}`] = (stats[`served_${used[0]}`] || 0) + 1;
            } else if (source.includes(core)) {
              const bundle = bundleForHost(hostOf(win.location));
              if (bundle) {
                const a = comparable(result); const b = comparable(originalEval.call(win, source.split(core).join(AYWEBS_CAPTURE_BUNDLES[bundle].text)));
                if (a !== b) throw new Error(`Lot « ${bundle} » ≠ cœur sur ${hostOf(win.location)} — ${firstDifference(a, b)}`);
                stats[bundle] = (stats[bundle] || 0) + 1;
              }
            }
            return result;
          };
        }
        return win;
      },
    });
  }

  restoreDifferential = () => {
    globalThis.Function = Original;
    if (descriptor) Object.defineProperty(JSDOM.prototype, 'window', descriptor);
    const total = Object.values(stats).reduce((sum, count) => sum + count, 0);
    if (total) fs.appendFileSync(process.env.AYWEBS_BUNDLE_DIFF_LOG || '/tmp/aywebs-bundle-diff.jsonl', `${JSON.stringify({ file: expect.getState().testPath, ...stats })}\n`);
  };
}
