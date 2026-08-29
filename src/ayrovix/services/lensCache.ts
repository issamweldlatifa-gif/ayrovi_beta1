import type { AiExecutionLane } from '../../ai-core/contracts';
import { isCanonicalExecutionLane } from '../../ai-core/execution';
import type { QatafoDatabase } from '../../db/database';

export const LENS_CACHE_TTL_MS = 24 * 3600_000;

/**
 * The canonical Lens cache exists only in the active lane. Non-canonical lanes
 * never read it (which could bias comparisons) and never write or evict it.
 */
export function readCanonicalLensCache<T>(
  db: QatafoDatabase,
  imageHash: string,
  lane: AiExecutionLane,
  now = Date.now(),
): T | null {
  if (!isCanonicalExecutionLane(lane)) return null;
  const cached = db.get<any>(
    'SELECT result_json, created_at FROM lens_analysis_cache WHERE image_hash=?',
    imageHash,
  );
  if (!cached || now - new Date(cached.created_at).getTime() >= LENS_CACHE_TTL_MS) return null;
  try {
    return JSON.parse(cached.result_json) as T;
  } catch {
    return null;
  }
}

export function writeCanonicalLensCache<T>(
  db: QatafoDatabase,
  input: {
    imageHash: string;
    result: T;
    model: string;
    createdAt: string;
    lane: AiExecutionLane;
  },
  now = Date.now(),
): boolean {
  if (!isCanonicalExecutionLane(input.lane)) return false;
  db.run(
    'INSERT OR REPLACE INTO lens_analysis_cache (image_hash,result_json,model,created_at) VALUES (?,?,?,?)',
    input.imageHash,
    JSON.stringify(input.result),
    input.model,
    input.createdAt,
  );
  db.run(
    'DELETE FROM lens_analysis_cache WHERE created_at < ?',
    new Date(now - LENS_CACHE_TTL_MS).toISOString(),
  );
  return true;
}
