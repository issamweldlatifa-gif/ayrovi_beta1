/** Persistent interaction writes; identity comes only from the authenticated HTTP context. */
import { createHash, randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
type SocialStore = Pick<QatafoDatabase, 'get' | 'all' | 'run' | 'transaction'>;
export type SocialTarget = { kind: 'story' | 'post'; source: 'story' | 'publication' | 'reel' };
export function publishedSocialTarget(db: Pick<SocialStore, 'get'>, targetId: string, now: string): SocialTarget | null {
    if (db.get(`SELECT 1 FROM stories WHERE id=? AND status='PUBLISHED' AND publish_at<=?
      AND (expires_at IS NULL OR expires_at>?)`, targetId, now, now)) return { kind: 'story', source: 'story' };
    if (db.get(`SELECT 1 FROM publications WHERE id=? AND status='publie' AND publish_at<=?`, targetId, now)) {
      return { kind: 'post', source: 'publication' };
    }
    if (db.get(`SELECT 1 FROM reels WHERE id=? AND status='publie' AND publish_at<=?`, targetId, now)) {
      return { kind: 'post', source: 'reel' };
    }
    return null;
  };
export function socialInteractionCounts(db: SocialStore, targetId: string) {
    const result = { likes: 0, comments: 0, views: 0, shares: 0 };
    const rows = db.all<any>(`SELECT type,COUNT(*) n FROM story_interactions WHERE target_id=? GROUP BY type`, targetId);
    for (const row of rows) {
      if (row.type === 'like') result.likes = Number(row.n);
      if (row.type === 'comment') result.comments = Number(row.n);
      if (row.type === 'view') result.views = Number(row.n);
      if (row.type === 'share') result.shares = Number(row.n);
    }
    return result;
  };
function syncReelCounters(db: SocialStore, targetId: string, target: SocialTarget, now: string) {
    if (target.source !== 'reel') return;
    const counts = socialInteractionCounts(db, targetId);
    db.run('UPDATE reels SET views=?,likes=?,updated_at=? WHERE id=?', counts.views, counts.likes, now, targetId);
  };


export type InteractionResult = { outcome: 'invalid_interaction' | 'target_not_found' | 'auth_required' | 'guest_session_required' | 'invalid_reaction' | 'reaction_target_invalid' | 'comment_too_short' | 'comment_parent_invalid' | 'comment_request_invalid' | 'comment_conflict' } | { outcome: 'ok' | 'created'; data: Record<string, unknown> };
export function writeSocialInteraction(db: SocialStore, input: unknown, customer: { id: string; displayName?: string } | null, guestSession: string, now: string): InteractionResult {
  const body = input !== null && typeof input === 'object' ? input as Record<string, unknown> : {};
  // Enclose visibility, validation, deduplication, writes and counters in one atomic unit.
  return db.transaction((): InteractionResult => {
    const type = String(body?.type || '');
    const targetId = String(body?.targetId || '').trim();
    if (!['like', 'reaction', 'comment', 'view', 'share'].includes(type) || !/^[A-Za-z0-9_-]{1,120}$/.test(targetId)) {
      return { outcome: 'invalid_interaction' };
    }
    const target = publishedSocialTarget(db, targetId, now);
    if (!target) return { outcome: 'target_not_found' };

    if ((type === 'like' || type === 'reaction' || type === 'comment') && !customer) {
      return { outcome: 'auth_required' };
    }
    if (!customer && !/^[A-Za-z0-9._:-]{8,160}$/.test(guestSession)) {
      return { outcome: 'guest_session_required' };
    }
    const owner = customer
      ? `account:${customer.id}`
      : `guest:${createHash('sha256').update(guestSession).digest('hex').slice(0, 32)}`;
    const accountId = customer?.id || null;
    const guestHash = accountId ? null : owner;

    if (type === 'like' || type === 'reaction') {
      const requested = body?.reaction;
      if (type === 'reaction' && requested !== 'like' && requested !== 'dislike' && requested !== null) return { outcome: 'invalid_reaction' };
      if (type === 'reaction' && target.source !== 'publication') return { outcome: 'reaction_target_invalid' };
      const reaction = (() => {
        const existing = db.get<any>(`SELECT id FROM story_interactions WHERE target_id=? AND type='like' AND account_id=?`, targetId, accountId);
        const next = type === 'like' ? (existing ? null : 'like') : requested;
        db.run("DELETE FROM story_interactions WHERE target_id=? AND type='like' AND account_id=?",targetId,accountId);
        db.run('DELETE FROM publication_dislikes WHERE target_id=? AND account_id=?',targetId,accountId);
        if (next === 'like') db.run(`INSERT INTO story_interactions (id,target_id,target_kind,type,account_id,created_at) VALUES (?,?,?,?,?,?)`,
          `int_${createHash('sha256').update(`${owner}:${targetId}:like`).digest('hex').slice(0,32)}`,targetId,target.kind,'like',accountId,now);
        if (next === 'dislike') db.run('INSERT INTO publication_dislikes(target_id,account_id,created_at) VALUES (?,?,?)',targetId,accountId,now);
        syncReelCounters(db, targetId,target,now);
        return next;
      })();
      const counts = socialInteractionCounts(db, targetId);
      return { outcome: 'ok', data:{ liked:reaction === 'like', disliked:reaction === 'dislike', reaction, likesCount:counts.likes, counts } };
    }

    if (type === 'comment') {
      const text = String(body?.text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
      if (text.length < 2) return { outcome: 'comment_too_short' };
      const parentId = body?.parentId || null;
      if (parentId && (typeof parentId !== 'string' || !db.get("SELECT id FROM story_interactions WHERE id=? AND target_id=? AND type='comment'", parentId,targetId))) return { outcome: 'comment_parent_invalid' };
      const requestId=body?.clientRequestId;
      if(requestId !== undefined && (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{8,120}$/.test(requestId))) return { outcome: 'comment_request_invalid' };
      const id = requestId ? `int_${createHash('sha256').update(`${owner}:${targetId}:comment:${requestId}`).digest('hex').slice(0,32)}` : `int_${randomUUID()}`;
      const existing=db.get<any>("SELECT text,(SELECT parent_id FROM social_comment_replies WHERE comment_id=story_interactions.id) parent_id,created_at FROM story_interactions WHERE id=?",id);
      if(existing) {
        if(existing.text !== text || (existing.parent_id || null) !== parentId) return { outcome: 'comment_conflict' };
        return { outcome: 'ok', data:{id,author:customer!.displayName || 'Membre ZAYROVI',text:existing.text,createdAt:existing.created_at,parentId}};
      }
      db.run(`INSERT INTO story_interactions (id,target_id,target_kind,type,account_id,guest_hash,text,created_at)
        VALUES (?,?,?,?,?,NULL,?,?)`, id, targetId, target.kind, 'comment', accountId, text, now);
      if (parentId) db.run('INSERT INTO social_comment_replies(comment_id,parent_id) VALUES (?,?)',id,parentId);
      return { outcome: 'created', data: { id, author: customer!.displayName || 'Membre ZAYROVI', text, createdAt: now, parentId } };
    }

    // Les vues et partages sont comptés par propriétaire unique afin d'éviter le gonflement artificiel.
    const ownerColumn = accountId ? 'account_id' : 'guest_hash';
    const ownerValue = accountId || guestHash;
    const inserted = (() => {
      const existing = db.get<any>(`SELECT id FROM story_interactions WHERE target_id=? AND type=? AND ${ownerColumn}=?`, targetId, type, ownerValue);
      if (existing) return false;
      db.run(`INSERT INTO story_interactions (id,target_id,target_kind,type,account_id,guest_hash,text,created_at)
        VALUES (?,?,?,?,?,?,NULL,?)`, `int_${randomUUID()}`, targetId, target.kind, type, accountId, guestHash, now);
      syncReelCounters(db, targetId, target, now);
      return true;
    })();
    return { outcome: 'ok', data: { recorded: inserted, counts: socialInteractionCounts(db, targetId) } };
  });
}
