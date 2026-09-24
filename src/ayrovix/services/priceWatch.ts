/*
 * VEILLE PRIX — «راقب السعر» (24/09/2026) : le client surveille un produit ;
 * un vérificateur périodique relit la fiche marchand (même scraping que Lens,
 * profils produits en cache) et notifie le compte DÈS QUE le prix baisse —
 * ou quand l'article disparaît durablement. Aucune estimation inventée : une
 * baisse n'est notifiée que sur un prix réellement relut côté marchand.
 */
import { createHash, randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../../db/database';
import type { SmartLinkScraper } from '../../scraper/scraper';
import { estimateWithDb } from './currency';
import { sanitizeProductUrl } from './product';

export interface PriceWatcherInput {
  url: string;
  title: string;
  imageUrl?: string;
  source?: string;
  targetPriceTnd?: number | null;
}

/** Intervalle entre deux relectures D'UN MÊME watcher (6 h par défaut). */
function watcherIntervalMs(): number {
  const configured = Number(process.env.AYROVI_PRICE_WATCH_INTERVAL_MS || 6 * 3_600_000);
  return Number.isFinite(configured) ? Math.min(24 * 3_600_000, Math.max(3_600_000, configured)) : 6 * 3_600_000;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function addPriceWatcher(db: QatafoDatabase, accountId: string, input: PriceWatcherInput): { id: string } | null {
  const url = sanitizeProductUrl(String(input.url || ''));
  const title = String(input.title || '').trim().slice(0, 180);
  if (!url || title.length < 3) return null;
  const target = Number(input.targetPriceTnd);
  const id = `watch_${createWatcherHash(accountId, url)}`;
  db.run(`INSERT INTO price_watchers (id,account_id,url,title,image_url,source,target_price_tnd,created_at)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(account_id,url) DO UPDATE SET title=excluded.title,
      image_url=excluded.image_url, source=excluded.source,
      target_price_tnd=excluded.target_price_tnd, status='ACTIVE', failure_count=0`,
    id, accountId, url, title, String(input.imageUrl || '').slice(0, 1024),
    String(input.source || '').slice(0, 80),
    Number.isFinite(target) && target > 0 ? target : null, nowIso(),
  );
  return { id };
}

export function removePriceWatcher(db: QatafoDatabase, accountId: string, id: string): boolean {
  const row = db.get<{ id: string }>('SELECT id FROM price_watchers WHERE id=? AND account_id=?', String(id), accountId);
  if (!row) return false;
  db.run('DELETE FROM price_watchers WHERE id=? AND account_id=?', String(id), accountId);
  return true;
}

export function listPriceWatchers(db: QatafoDatabase, accountId: string): Array<Record<string, unknown>> {
  return db.all<Record<string, unknown>>(
    `SELECT id,url,title,image_url,source,target_price_tnd targetPriceTnd,last_price_tnd lastPriceTnd,
            last_currency lastCurrency,last_price lastPrice,status,last_checked_at lastCheckedAt,created_at createdAt
     FROM price_watchers WHERE account_id=? ORDER BY created_at DESC LIMIT 100`, accountId,
  );
}

/** Relit AU PLUS `limit` watchers arrivés à échéance. Retourne le nombre relus. */
export async function checkDueWatchers(db: QatafoDatabase, scraper: SmartLinkScraper, limit = 8): Promise<number> {
  const due = db.all<{ id: string; account_id: string; url: string; title: string; last_price_tnd: number | null; failure_count: number }>(
    `SELECT id,account_id,url,title,last_price_tnd,failure_count FROM price_watchers
     WHERE status='ACTIVE' AND (last_checked_at IS NULL OR last_checked_at < ?)
     ORDER BY last_checked_at ASC LIMIT ?`, new Date(Date.now() - watcherIntervalMs()).toISOString(), limit,
  );
  let checked = 0;
  for (const watcher of due) {
    checked += 1;
    try {
      const scraped = await scraper.scrapeProduct(watcher.url);
      const price = Number(scraped?.sourcePrice || 0);
      if (price > 0) {
        const estimate = estimateWithDb(db, price, scraped.sourceCurrency);
        const priceTnd = estimate?.priceTnd ?? null;
        const previous = watcher.last_price_tnd;
        db.run(`UPDATE price_watchers SET last_price_tnd=?,last_currency=?,last_price=?,failure_count=0,
          last_checked_at=? WHERE id=?`,
          priceTnd, scraped.sourceCurrency || '', price, nowIso(), watcher.id,
        );
        if (previous != null && priceTnd != null && priceTnd < previous - 0.009) {
          notifyAccount(db, watcher.account_id, 'PROMOTION', 'Prix en baisse 🎉',
            `${watcher.title} — ${priceTnd.toFixed(2)} DT (avant ${previous.toFixed(2)} DT).`,
            '/compte');
        }
      } else {
        registerFailure(db, watcher);
      }
    } catch {
      registerFailure(db, watcher);
    }
  }
  return checked;
}

function registerFailure(db: QatafoDatabase, watcher: { id: string; account_id: string; title: string; failure_count: number }): void {
  const failures = watcher.failure_count + 1;
  const dead = failures >= 8;
  db.run('UPDATE price_watchers SET failure_count=?,status=?,last_checked_at=? WHERE id=?',
    failures, dead ? 'DEAD' : 'ACTIVE', nowIso(), watcher.id,
  );
  if (dead) {
    notifyAccount(db, watcher.account_id, 'GENERAL', 'Produit introuvable',
      `${watcher.title} — la page marchand n'est plus accessible, la veille est arrêtée.`,
      '/compte');
  }
}

function notifyAccount(db: QatafoDatabase, accountId: string, type: 'PROMOTION' | 'GENERAL', title: string, message: string, actionUrl: string): void {
  try {
    db.run(`INSERT INTO customer_notifications (id,account_id,type,title,message,action_url,created_at)
      VALUES (?,?,?,?,?,?,?)`,
      `notification_${randomUUID()}`, accountId, type, title, message, actionUrl, nowIso(),
    );
  } catch { /* notification best-effort */ }
}

function createWatcherHash(accountId: string, url: string): string {
  return createHash('sha256').update(`${accountId}|${url}`).digest('hex').slice(0, 24);
}
function watcherHashSuffix(): string {
  return randomUUID();
}

/** Planificateur — même gabarit que startFxRatesScheduler (timers unref). */
export function startPriceWatchScheduler(db: QatafoDatabase, scraper: SmartLinkScraper): void {
  if (process.env.AYROVI_PRICE_WATCH === 'false') {
    console.log('[PriceWatch] veille prix désactivée (AYROVI_PRICE_WATCH=false).');
    return;
  }
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const checked = await checkDueWatchers(db, scraper);
      if (checked) console.log(`[PriceWatch] ${checked} veille(s) relue(s).`);
    } catch (error) {
      console.warn('[PriceWatch] tick échoué :', error);
    } finally {
      running = false;
    }
  };
  const boot = setTimeout(() => { void tick(); }, 20_000);
  boot.unref?.();
  const timer = setInterval(() => { void tick(); }, 3_600_000);
  timer.unref?.();
  console.log('[PriceWatch] veille prix active — relecture horaire, watcher toutes les 6 h.');
}
