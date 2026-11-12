/**
 * Z-Reactions (11/11) — J'aime · J'adore · Je n'aime pas : une famille, partout.
 *  • « love » est accepté sur publications, Reels ET stories ;
 *  • une seule réaction par compte (exclusivité dans la même transaction) ;
 *  • compteurs : `loves`, `dislikes`, `reactionsCount` (= positifs) ;
 *  • le feed Reels porte la réaction du compte connecté (`my_reaction`).
 */
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { createCustomerSession } from '../src/customer/auth';
import { socialInteractionCounts, viewerContentReactions, writeSocialInteraction } from '../src/magazine/socialInteractions';
import { readSocialCounts } from '../src/magazine/socialEngagementReads';

const prefix = 'zreact_';
const post = `${prefix}post`, reel = `${prefix}reel`, story = `${prefix}story`;
const now = '2026-11-01T00:00:00.000Z';
const a = { id: `${prefix}a`, displayName: 'A' }, b = { id: `${prefix}b`, displayName: 'B' };
let session: ReturnType<typeof createCustomerSession>;

const clean = () => {
  for (const table of ['story_interactions', 'publication_dislikes', 'social_loves']) db.run(`DELETE FROM ${table} WHERE target_id LIKE ?`, `${prefix}%`);
};
beforeAll(() => {
  const publisher = db.get<any>('SELECT id FROM story_publishers LIMIT 1').id;
  for (const actor of [a, b]) db.run("INSERT INTO customer_accounts(id,display_name,status,created_at,updated_at) VALUES (?,?,'ACTIVE',?,?)", actor.id, actor.displayName, now, now);
  db.run("INSERT INTO publications(id,title,channel_id,image_url,publish_at,status,created_at,updated_at) VALUES (?,'Fixture',?,'/media/test',?,'publie',?,?)", post, publisher, now, now, now);
  db.run("INSERT INTO reels(id,title,channel_id,video_url,publish_at,status,created_at,updated_at) VALUES (?,'Fixture',?,'/media/test',?,'publie',?,?)", reel, publisher, now, now, now);
  db.run("INSERT INTO stories(id,media_url,title,publish_at,expires_at,status,created_at,updated_at) VALUES (?,'/media/test','Fixture',?,NULL,'PUBLISHED',?,?)", story, now, now, now);
  session = createCustomerSession(db, a.id, { ip: '127.0.0.1', headers: {} } as any);
});
beforeEach(clean);
afterAll(() => {
  clean();
  db.run('DELETE FROM publications WHERE id=?', post);
  db.run('DELETE FROM reels WHERE id=?', reel);
  db.run('DELETE FROM stories WHERE id=?', story);
  db.run('DELETE FROM customer_sessions WHERE account_id IN (?,?)', a.id, b.id);
  db.run('DELETE FROM customer_accounts WHERE id IN (?,?)', a.id, b.id);
});

const react = (targetId: string, reaction: unknown, actor = a) => {
  const result = writeSocialInteraction(db, { type: 'reaction', targetId, reaction }, actor, '', now);
  if (!('data' in result)) throw new Error(result.outcome);
  return result.data as any;
};

it('accepts « love » on publications, Reels and stories', () => {
  for (const target of [post, reel, story]) {
    const result = react(target, 'love');
    expect(result).toMatchObject({ reaction: 'love', loved: true, liked: false, disliked: false, lovesCount: 1, reactionsCount: 1 });
  }
});

it('keeps exactly one reaction per account and moves the counters with it', () => {
  react(post, 'like', b);
  react(post, 'love');
  expect(socialInteractionCounts(db, post)).toMatchObject({ likes: 1, loves: 1, dislikes: 0 });
  const toDislike = react(post, 'dislike');
  expect(toDislike).toMatchObject({ reaction: 'dislike', lovesCount: 0, reactionsCount: 1 });
  expect(socialInteractionCounts(db, post)).toMatchObject({ likes: 1, loves: 0, dislikes: 1 });
  react(post, 'like');
  expect(socialInteractionCounts(db, post)).toMatchObject({ likes: 2, loves: 0, dislikes: 0 });
  expect(react(post, null).reaction).toBeNull();
  expect(socialInteractionCounts(db, post)).toMatchObject({ likes: 1, loves: 0, dislikes: 0 });
});

it('rejects unknown reactions without writing', () => {
  expect(writeSocialInteraction(db, { type: 'reaction', targetId: post, reaction: 'wow' }, a, '', now).outcome).toBe('invalid_reaction');
  expect(socialInteractionCounts(db, post)).toMatchObject({ likes: 0, loves: 0, dislikes: 0 });
});

it('counts positive reactions on the Reel row (like + love)', () => {
  react(reel, 'love');
  react(reel, 'like', b);
  expect(db.get<any>('SELECT likes FROM reels WHERE id=?', reel).likes).toBe(2);
  react(reel, 'dislike');
  expect(db.get<any>('SELECT likes FROM reels WHERE id=?', reel).likes).toBe(1);
});

it('exposes loves/dislikes in batched counts and the viewer reaction per content', () => {
  react(post, 'love');
  react(reel, 'dislike');
  react(story, 'like');
  const counts = readSocialCounts(db, [post, reel, story].join(','));
  expect(counts[post]).toMatchObject({ likes: 0, loves: 1, dislikes: 0 });
  expect(counts[reel]).toMatchObject({ dislikes: 1 });
  expect(viewerContentReactions(db, a.id, [post, reel, story, 'missing'])).toEqual({ [post]: 'love', [reel]: 'dislike', [story]: 'like' });
  expect(viewerContentReactions(db, null, [post])).toEqual({});
  expect(viewerContentReactions(db, b.id, [post])).toEqual({});
});

it('ships `my_reaction` with the Reel feed only for the signed-in account', async () => {
  react(reel, 'love');
  const url = `/api/public/social/reels?limit=12&anchor=${reel}`;
  const signed = await request(app).get(url).set('Authorization', `Bearer ${session.token}`);
  expect(signed.status).toBe(200);
  const mine = (signed.body.data.items as any[]).find((row) => row.id === reel);
  expect(mine?.my_reaction).toBe('love');
  expect(signed.headers['cache-control']).toBe('private, no-store');
  const guest = await request(app).get(url);
  const anonymous = (guest.body.data.items as any[]).find((row) => row.id === reel);
  expect(anonymous).toBeTruthy();
  expect(anonymous.my_reaction).toBeUndefined();
});

it('ships the viewer reaction (`mine`) with batch counts only for the signed-in account (stories)', async () => {
  react(story, 'like');
  const url = `/api/public/social/counts?ids=${story},${post}`;
  const signed = await request(app).get(url).set('Authorization', `Bearer ${session.token}`);
  expect(signed.status).toBe(200);
  expect(signed.body.mine).toEqual({ [story]: 'like' });
  expect(signed.body.data[story]).toMatchObject({ likes: 1 });
  expect(signed.headers['cache-control']).toBe('private, no-store');
  const guest = await request(app).get(url);
  expect(guest.body.mine).toBeUndefined();
  expect(Object.keys(guest.body)).toEqual(['success', 'data']);
});
