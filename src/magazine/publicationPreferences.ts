/** Account-scoped preferences. Caller authenticates accountId; never derive ownership from payload. */
import type { QatafoDatabase } from '../db/database';
type PreferenceStore = Pick<QatafoDatabase, 'get' | 'run' | 'transaction'>;
type Lookup<T> = { status: 'ok'; data: T } | { status: 'not_found' };
type Result<T> = Lookup<T> | { status: 'invalid' };
export interface PublicationPreference { saved: boolean; feedback: string }
function bodyOf(input: unknown): Record<string, unknown> {
  return input !== null && typeof input === 'object' ? input as Record<string, unknown> : {};
}
export function writePublicationPreference(db: PreferenceStore, accountId: string, publicationId: string, input: unknown, now: string): Result<PublicationPreference> {
  if (!accountId) throw new Error('Authenticated account required');
  return db.transaction((): Result<PublicationPreference> => {
    if (!db.get("SELECT id FROM publications WHERE id=? AND status='publie' AND publish_at<=?", publicationId, now)) return { status: 'not_found' };
    const old = db.get<{ saved: number; feedback: string }>('SELECT saved,feedback FROM publication_preferences WHERE account_id=? AND publication_id=?', accountId, publicationId);
    const body = bodyOf(input);
    // Preserve legacy partial-update/null semantics: null and omitted fields retain old values.
    const saved = body.saved ?? !!old?.saved;
    const feedback = body.feedback ?? old?.feedback ?? '';
    if (typeof saved !== 'boolean' || typeof feedback !== 'string' || !['','hidden','not_interested'].includes(feedback)) return { status: 'invalid' };
    db.run(`INSERT INTO publication_preferences(account_id,publication_id,saved,feedback,updated_at) VALUES (?,?,?,?,?)
      ON CONFLICT(account_id,publication_id) DO UPDATE SET saved=excluded.saved,feedback=excluded.feedback,updated_at=excluded.updated_at`,
      accountId, publicationId, saved ? 1 : 0, feedback, now);
    return { status: 'ok', data: { saved, feedback } };
  });
}
export function readPublisherFollow(db: Pick<PreferenceStore, 'get'>, accountId: string, publisherId: string): Lookup<{ following: boolean }> {
  if (!db.get('SELECT id FROM story_publishers WHERE id=?', publisherId)) return { status: 'not_found' };
  return { status: 'ok', data: { following: !!db.get('SELECT 1 FROM publication_follows WHERE account_id=? AND publisher_id=?', accountId, publisherId) } };
}
export function writePublisherFollow(db: PreferenceStore, accountId: string, publisherId: string, input: unknown, now: string): Result<{ following: boolean }> {
  if (!accountId) throw new Error('Authenticated account required');
  return db.transaction((): Result<{ following: boolean }> => {
    if (!db.get('SELECT id FROM story_publishers WHERE id=?', publisherId)) return { status: 'not_found' };
    const following = bodyOf(input).following;
    if (typeof following !== 'boolean') return { status: 'invalid' };
    if (following) db.run('INSERT OR IGNORE INTO publication_follows(account_id,publisher_id,created_at) VALUES (?,?,?)', accountId, publisherId, now);
    else db.run('DELETE FROM publication_follows WHERE account_id=? AND publisher_id=?', accountId, publisherId);
    return { status: 'ok', data: { following } };
  });
}
