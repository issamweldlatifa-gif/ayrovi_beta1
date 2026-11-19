import { createHash } from 'node:crypto';
import { isSocialId } from '../../shared/socialCommerce';
import { addCatalogueLine, CartCatalogueError } from '../catalogue/cartAdd';
import type { QatafoDatabase } from '../db/database';
import { activeEdition, readEditionState } from './editions';

const WINDOW = 24 * 60 * 60 * 1000;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const invalid = () => new CartCatalogueError(400, 'INVALID_LOOK', 'Sélection de look invalide.');
const changed = () => new CartCatalogueError(409, 'LOOK_CHANGED', 'Le look a changé. Rechargez le fil.');

export function addPublishedLook(db: QatafoDatabase, sessionId: string, resolveAccount: () => string | null, body: unknown, now = new Date().toISOString()) {
  if (!body || typeof body !== 'object') throw invalid();
  const { lookId, editionNumber, requestId, selections } = body as Record<string, unknown>;
  if (!isSocialId(lookId) || !Number.isSafeInteger(editionNumber) || typeof requestId !== 'string'
    || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestId) || !Array.isArray(selections) || selections.length < 1 || selections.length > 6) throw invalid();
  const parsed = new Map<string, { productId: string; requestedColor: string; requestedSize: string; expectedPrice: number }>();
  for (const entry of selections) {
    if (!entry || typeof entry !== 'object') throw invalid();
    const { productId, size, color, price } = entry;
    const validChoice = (value: unknown): value is string => typeof value === 'string' && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value);
    if (!isSocialId(productId) || parsed.has(productId) || !validChoice(size) || !validChoice(color) || typeof price !== 'number' || !Number.isFinite(price) || price <= 0) throw invalid();
    parsed.set(productId, { productId, requestedColor: color.trim(), requestedSize: size.trim(), expectedPrice: price });
  }
  const hash = sha(JSON.stringify([editionNumber, lookId, [...parsed.values()].sort((a, b) => a.productId.localeCompare(b.productId))]));
  return db.transaction(() => {
    const accountId = resolveAccount();
    const owner = sha(accountId ? `account:${accountId}` : `session:${sessionId}`);
    db.run('DELETE FROM social_cart_requests WHERE expires_at<=?', now);
    const existing = db.get<{ input_hash: string }>('SELECT input_hash FROM social_cart_requests WHERE owner_hash=? AND request_id=?', owner, requestId);
    if (existing) {
      if (existing.input_hash !== hash) throw new CartCatalogueError(409, 'LOOK_REQUEST_REUSED', 'Cette confirmation ne correspond plus à la sélection.');
      return { accountId, addedCount: parsed.size, replay: true };
    }
    const edition = activeEdition(readEditionState(db), now);
    const look = edition?.entries.find(entry => entry.kind === 'look' && entry.id === lookId);
    if (edition?.number !== editionNumber || look?.kind !== 'look' || look.pins.length !== parsed.size || look.pins.some(pin => !parsed.has(pin.productId))) throw changed();
    for (const pin of look.pins) addCatalogueLine(db, { ...parsed.get(pin.productId)!, sessionId, accountId, now, quantity: 1, customerNote: '' });
    db.run('INSERT INTO social_cart_requests (owner_hash,request_id,input_hash,expires_at) VALUES (?,?,?,?)',
      owner, requestId, hash, new Date(Date.parse(now) + WINDOW).toISOString());
    return { accountId, addedCount: look.pins.length, replay: false };
  });
}
