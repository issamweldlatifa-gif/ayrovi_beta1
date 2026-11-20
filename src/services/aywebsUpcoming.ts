import type { QatafoDatabase } from '../db/database';
import { AYWEBS_CATALOG_STORES } from '../../shared/aywebsStoreCatalog';
import { AYWEBS_STORES } from '../../shared/aywebsStores';
import { normalizeAywebsUpcoming, UPCOMING_WEEK_MS, type AywebsUpcoming } from '../../shared/aywebsUpcoming';

export const AYWEBS_UPCOMING_KEY = 'mobile_aywebs_upcoming';
const KEY = AYWEBS_UPCOMING_KEY;
const supported = new Set(AYWEBS_STORES.filter(store => store.enabled && store.captureSupported !== false).map(store => store.id));
const planned = new Map(AYWEBS_CATALOG_STORES.filter(store => !supported.has(store.id)).map(store => [store.id, store]));
export function upcomingStoreChoices() {
  return [...planned.values()].map(({ id, displayName }) => ({ id, name: displayName })).sort((a, b) => a.name.localeCompare(b.name));
}
export function seedAywebsUpcoming(db: QatafoDatabase, now: Date) {
  const opensAt = new Date(now.getTime() + UPCOMING_WEEK_MS).toISOString();
  const stores = ['timberland', 'clarks', 'decathlon'].filter(id => planned.has(id)).map(id => ({ id, image: '', opensAt }));
  db.run("INSERT OR IGNORE INTO settings (id,category,setting_key,setting_value,value_type,label,updated_at) VALUES (?, 'INTERFACE', ?, ?, 'JSON', ?, ?)",
    KEY, KEY, JSON.stringify({ enabled: true, stores }), 'AYWEBs Prochainement (mobile)', now.toISOString());
}
export function readAywebsUpcoming(db: QatafoDatabase): AywebsUpcoming {
  const raw = db.get<{ setting_value: string }>('SELECT setting_value FROM settings WHERE setting_key=?', KEY)?.setting_value;
  try { return normalizeAywebsUpcoming(JSON.parse(raw ?? 'null')) ?? { enabled: false, stores: [] }; }
  catch { return { enabled: false, stores: [] }; }
}
export function writeAywebsUpcoming(db: QatafoDatabase, raw: unknown, now: Date) {
  const data = normalizeAywebsUpcoming(raw);
  if (!data || data.stores.some(store => !planned.has(store.id))) return null;
  db.run('UPDATE settings SET setting_value=?, updated_at=? WHERE setting_key=?', JSON.stringify(data), now.toISOString(), KEY);
  return data;
}
export function publicAywebsUpcoming(db: QatafoDatabase, now: Date) {
  const data = readAywebsUpcoming(db);
  return { serverTime: now.toISOString(), stores: data.enabled ? data.stores.flatMap(row => {
    const store = planned.get(row.id);
    return store && Date.parse(row.opensAt) > now.getTime() ? [{ ...row, name: store.displayName, logo: store.logo }] : [];
  }) : [] };
}
