import type { QatafoDatabase } from '../db/database';
import type { ArrivalSourceType, StoreProfile } from './types';

interface SeedStore {
  id: string;
  code: string;
  name: string;
  profiles: Array<{ sourceType: ArrivalSourceType; strategyKey: string; hints: string[] }>;
}

/**
 * Initial controlled catalogue. Extraction behavior is data-driven through
 * crm_store_source_profiles; a new store/profile does not require a new parser.
 */
export const INITIAL_STORES: readonly SeedStore[] = [
  {
    id: 'crm_store_shein', code: 'SHEIN', name: 'SHEIN', profiles: [
      { sourceType: 'EMAIL', strategyKey: 'shein-email-v1', hints: ['Product blocks may contain an article title, SKU, variant/size, colour and quantity.', 'SHEIN SKU values are evidence only when visibly present; never derive them from an image URL.'] },
      { sourceType: 'PDF', strategyKey: 'shein-pdf-v1', hints: ['Treat every visible order line or product card as a separate record.', 'Associate a nearby product image only when the visual relationship is clear.'] },
      { sourceType: 'IMAGE', strategyKey: 'shein-image-v1', hints: ['Read product cards in visual order and preserve uncertain rows for review.'] },
    ],
  },
  {
    id: 'crm_store_temu', code: 'TEMU', name: 'TEMU', profiles: [
      { sourceType: 'PDF', strategyKey: 'temu-pdf-v1', hints: ['Treat each visibly distinct order item as one record.', 'Do not confuse order numbers, tracking numbers or prices with SKU/reference.'] },
      { sourceType: 'IMAGE', strategyKey: 'temu-image-v1', hints: ['Read all visible product rows; use null for clipped or unreadable values.'] },
    ],
  },
  {
    id: 'crm_store_nike', code: 'NIKE', name: 'NIKE', profiles: [
      { sourceType: 'INVOICE', strategyKey: 'nike-invoice-v1', hints: ['Use invoice line items; preserve style code, size and colour only when explicitly printed.', 'Do not use invoice/order numbers as product references.'] },
      { sourceType: 'IMAGE', strategyKey: 'nike-image-v1', hints: ['Extract visible product labels and style codes without inferring hidden colourways.'] },
    ],
  },
  {
    id: 'crm_store_adidas', code: 'ADIDAS', name: 'ADIDAS', profiles: [
      { sourceType: 'INVOICE', strategyKey: 'adidas-invoice-v1', hints: ['Use invoice line items and explicit article numbers only.', 'Keep size and colour null when not printed.'] },
      { sourceType: 'IMAGE', strategyKey: 'adidas-image-v1', hints: ['Extract only text and products visibly present in the source.'] },
    ],
  },
  {
    id: 'crm_store_zalando', code: 'ZALANDO', name: 'ZALANDO', profiles: [
      { sourceType: 'EMAIL', strategyKey: 'zalando-email-v1', hints: ['Separate each product card/order line and preserve article references when printed.', 'Do not confuse shipment, order or return identifiers with product reference.'] },
      { sourceType: 'PDF', strategyKey: 'zalando-pdf-v1', hints: ['Extract invoice/order line items in source order.', 'Associate product images only when an unambiguous nearby card is visible.'] },
    ],
  },
] as const;

export function seedArrivalStores(db: QatafoDatabase): void {
  const now = new Date().toISOString();
  db.transaction(() => {
    for (const store of INITIAL_STORES) {
      db.run(`INSERT OR IGNORE INTO crm_stores (id,code,name,active,created_at,updated_at)
        VALUES (?,?,?,1,?,?)`, store.id, store.code, store.name, now, now);
      for (const profile of store.profiles) {
        db.run(`INSERT OR IGNORE INTO crm_store_source_profiles
          (id,store_id,source_type,strategy_key,extraction_hints,enabled,created_at,updated_at)
          VALUES (?,?,?,?,?,1,?,?)`,
        `crm_profile_${store.code.toLowerCase()}_${profile.sourceType.toLowerCase()}`,
        store.id,
        profile.sourceType,
        profile.strategyKey,
        JSON.stringify(profile.hints),
        now,
        now);
      }
    }
  });
}

function parseHints(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim().slice(0, 500)).slice(0, 20)
      : [];
  } catch {
    return [];
  }
}

export function loadStoreProfile(
  db: QatafoDatabase,
  storeId: string,
  sourceType: ArrivalSourceType,
): StoreProfile | null {
  const row = db.get<any>(`SELECT s.id,s.code,s.name,s.active,p.source_type,p.strategy_key,p.extraction_hints,p.enabled
    FROM crm_stores s JOIN crm_store_source_profiles p ON p.store_id=s.id
    WHERE s.id=? AND p.source_type=? AND s.active=1 AND p.enabled=1`, storeId, sourceType);
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    active: Boolean(row.active),
    sourceType: row.source_type,
    strategyKey: row.strategy_key,
    extractionHints: parseHints(row.extraction_hints),
  };
}

export function listStoreProfiles(db: QatafoDatabase): Array<{
  id: string;
  code: string;
  name: string;
  active: boolean;
  supportedSources: Array<{ sourceType: ArrivalSourceType; strategyKey: string }>;
}> {
  const stores = db.all<any>('SELECT id,code,name,active FROM crm_stores ORDER BY active DESC,name');
  return stores.map((store) => ({
    id: store.id,
    code: store.code,
    name: store.name,
    active: Boolean(store.active),
    supportedSources: db.all<any>(`SELECT source_type,strategy_key FROM crm_store_source_profiles
      WHERE store_id=? AND enabled=1 ORDER BY source_type`, store.id)
      .map((row) => ({ sourceType: row.source_type as ArrivalSourceType, strategyKey: String(row.strategy_key) })),
  }));
}
