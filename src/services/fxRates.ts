/**
 * AYROVI · Taux de change LIVE (audit pricing 23/09/2026 — décision Issam).
 *
 * Pourquoi : les taux étaient des graines d'installation (EUR=4 → effectif 4.12)
 * jamais rafraîchies alors que le marché cotait ~3.38 TND/€, soit ~+20 % sur
 * chaque devis client. Ce service aligne pricing_config sur le marché :
 *
 *   1. Source par défaut : ExchangeRate-API (endpoint ouvert, sans clé, base EUR)
 *      — https://open.er-api.com/v6/latest/EUR — surchargeable via FX_RATES_URL.
 *   2. La marge change (exchangeBufferPercent, 3 %) reste LE seul markup appliqué
 *      au-dessus du taux de marché : aucun gonflement caché.
 *   3. `fx_source='manual'` (saisie admin d'un taux) SUSPEND la synchronisation
 *      automatique — les taux saisis à la main ne sont pas écrasés en silence.
 *   4. Bandes de sanité : une réponse API aberrante (TND à 50) est rejetée,
 *      les taux en place restent en vigueur. Le marché ne casse jamais la vente.
 *   5. Chaque application : version++ (les commandes passées gardent leur
 *      snapshot), re-tarification des produits en base, ligne d'audit ERP.
 *
 * Aucune clé par défaut n'est requise ; pour un fournisseur à clé (Fixer…),
 * intégrer la clé dans FX_RATES_URL.
 */
import type { QatafoDatabase } from '../db/database';
import { writeAuditEvent } from '../erp-core/audit';
import type { AdminAuditActor } from '../admin/audit';

export interface FxSnapshot {
  rateEUR: number;
  rateUSD: number;
  rateGBP: number;
  rateJPY: number;
  provider: string;
  fetchedAt: string;
}

export type FxFetcher = () => Promise<unknown>;

export interface FxRefreshOutcome {
  applied: boolean;
  reason?: 'disabled' | 'manual' | 'fresh' | 'invalid' | 'error';
  provider?: string;
  repriced?: number;
  error?: string;
}

const DEFAULT_FX_URL = 'https://open.er-api.com/v6/latest/EUR';

/** Bandes de sanité par devise (TND par unité) — au-delà, la réponse API est jugée aberrante. */
const SANITY_BANDS: Array<[keyof Pick<FxSnapshot, 'rateEUR' | 'rateUSD' | 'rateGBP' | 'rateJPY'>, number, number]> = [
  ['rateEUR', 2, 6],
  ['rateUSD', 2, 6],
  ['rateGBP', 2, 7],
  ['rateJPY', 0.005, 0.1],
];

const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * Convertit une réponse `{"result":"success","rates":{"TND":…,"USD":…,…}}` (base EUR)
 * en snapshot TND par devise. Pur et synchrone → testable sans réseau.
 */
export function parseFxSnapshot(payload: unknown): FxSnapshot | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as Record<string, unknown>;
  const rates = body.rates as Record<string, unknown> | undefined;
  if (!rates || typeof rates !== 'object') return null;
  const tnd = Number(rates.TND);
  const usd = Number(rates.USD);
  const gbp = Number(rates.GBP);
  const jpy = Number(rates.JPY);
  if (![tnd, usd, gbp, jpy].every((value) => Number.isFinite(value) && value > 0)) return null;
  const snapshot: FxSnapshot = {
    rateEUR: round6(tnd),
    rateUSD: round6(tnd / usd),
    rateGBP: round6(tnd / gbp),
    rateJPY: round6(tnd / jpy),
    provider: String(body.provider || 'exchange-rate-api').slice(0, 120),
    fetchedAt: new Date().toISOString(),
  };
  for (const [key, min, max] of SANITY_BANDS) {
    if (!(snapshot[key] >= min && snapshot[key] <= max)) return null;
  }
  return snapshot;
}

export function fxEnabled(): boolean {
  return String(process.env.FX_RATES_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
}

export function fxUrl(): string {
  return String(process.env.FX_RATES_URL || DEFAULT_FX_URL).trim();
}

export function fxIntervalMs(): number {
  const hours = Math.max(1, Number(process.env.FX_RATES_INTERVAL_HOURS) || 24);
  return hours * 3_600_000;
}

async function defaultFetcher(): Promise<unknown> {
  const timeoutMs = Math.max(2_000, Number(process.env.FX_RATES_TIMEOUT_MS) || 10_000);
  const response = await fetch(fxUrl(), { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`FX_HTTP_${response.status}`);
  return response.json();
}

const SYSTEM_ACTOR: AdminAuditActor = { id: null, name: 'FX Live (auto)', ipAddress: null };

/**
 * Applique un snapshot live : version++, re-tarification des produits, audit.
 * Respecte `fx_source='manual'` sauf `force` (bouton admin explicite).
 */
export async function refreshFxRates(
  db: QatafoDatabase,
  options: { force?: boolean; fetcher?: FxFetcher; actor?: AdminAuditActor } = {},
): Promise<FxRefreshOutcome> {
  if (!fxEnabled() && !options.force) return { applied: false, reason: 'disabled' };
  const rules = db.getPricingRules();
  if (rules.fxSource === 'manual' && !options.force) {
    return { applied: false, reason: 'manual' };
  }
  if (!options.force && rules.fxUpdatedAt) {
    const age = Date.now() - Date.parse(rules.fxUpdatedAt);
    if (Number.isFinite(age) && age >= 0 && age < fxIntervalMs()) return { applied: false, reason: 'fresh' };
  }
  let snapshot: FxSnapshot | null;
  try {
    const fetcher = options.fetcher ?? defaultFetcher;
    snapshot = parseFxSnapshot(await fetcher());
  } catch (error: any) {
    console.warn('[FX Rates] récupération impossible :', error?.message || error);
    return { applied: false, reason: 'error', error: String(error?.message || error) };
  }
  if (!snapshot) {
    console.warn('[FX Rates] réponse rejetée par les bandes de sanité — taux en place conservés.');
    return { applied: false, reason: 'invalid' };
  }
  const actor = options.actor ?? SYSTEM_ACTOR;
  const applied = db.applyLiveFxRates(snapshot, actor.name);
  writeAuditEvent(db, {
    actor,
    action: 'UPDATE',
    module: 'PRICING',
    resource: { type: 'pricing_config', id: 'default' },
    oldValues: {
      rateEUR: applied.before.rateEUR, rateUSD: applied.before.rateUSD,
      rateGBP: applied.before.rateGBP, rateJPY: applied.before.rateJPY,
      fxSource: applied.before.fxSource ?? null,
    },
    newValues: {
      rateEUR: snapshot.rateEUR, rateUSD: snapshot.rateUSD,
      rateGBP: snapshot.rateGBP, rateJPY: snapshot.rateJPY,
      fxSource: 'live', provider: snapshot.provider, repriced: applied.repriced,
    },
    context: { requestId: null, sessionId: `fx:${actor.name}`.slice(0, 80), userAgent: null, employee: null },
  });
  console.log(
    `[FX Rates] ${snapshot.provider} appliqué (EUR=${snapshot.rateEUR}, USD=${snapshot.rateUSD}, ` +
    `GBP=${snapshot.rateGBP}, JPY=${snapshot.rateJPY}) — ${applied.repriced} produit(s) re-tarifié(s).`,
  );
  return { applied: true, provider: snapshot.provider, repriced: applied.repriced };
}

/**
 * Planificateur : tick de vérification toutes les 6 h ; le rafraîchissement réel
 * n'a lieu que si les taux ont l'âge de l'intervalle (24 h par défaut).
 * Démarré uniquement hors environnement de test (voir src/server.ts).
 */
export function startFxRatesScheduler(db: QatafoDatabase): void {
  if (!fxEnabled()) {
    console.log('[FX Rates] synchronisation automatique désactivée (FX_RATES_ENABLED=false).');
    return;
  }
  const tick = () => { void refreshFxRates(db).catch((error) => console.warn('[FX Rates] tick échoué :', error)); };
  const boot = setTimeout(tick, 15_000);
  boot.unref?.();
  const timer = setInterval(tick, 6 * 3_600_000);
  timer.unref?.();
  console.log(`[FX Rates] synchronisation active — ${fxUrl()} (vérification toutes les 6 h, rafraîchissement ≥ ${fxIntervalMs() / 3_600_000} h).`);
}
