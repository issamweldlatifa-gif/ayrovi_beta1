/**
 * Refonte des interactions (14/11/2026, approuvée) — les blocs Publication
 * composés dans le CRM portent J'aime · Commenter · Partager, reliés au serveur.
 *
 *  • un bloc ACTIF et NON sponsorisé est une cible sociale (`source: 'block'`) ;
 *  • un bloc inactif, sponsorisé ou inconnu ne l'est PAS (404, aucune écriture) ;
 *  • réactions, commentaires (et leurs réponses / « j'aime »), partages et
 *    compteurs passent par les tables existantes — aucune DDL nouvelle ;
 *  • visiteur : lecture libre, écriture de réaction/commentaire refusée (401).
 */
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { createCustomerSession } from '../src/customer/auth';
import { publishedSocialTarget, socialInteractionCounts, viewerContentReactions, writeSocialInteraction } from '../src/magazine/socialInteractions';
import { readSocialComments } from '../src/magazine/socialEngagementReads';

const prefix = 'pbengage_';
const live = `${prefix}live`, sponsored = `${prefix}sponsored`, hidden = `${prefix}hidden`;
const now = '2026-11-14T10:00:00.000Z';
const a = { id: `${prefix}a`, displayName: 'Amel' }, b = { id: `${prefix}b`, displayName: 'Bilel' };
let session: ReturnType<typeof createCustomerSession>;

const insertBlock = (id: string, kind: string, sponsoredFlag: number, active: number) => db.run(
  `INSERT INTO publication_blocks(id,kind,title,subtitle,bg_color,panel_color,sponsored,media_type,media_url,poster_url,product_ids,sort_order,active,created_at,updated_at)
   VALUES (?,?,?,'','#FFFFFF','',?,'','','','[]',999,?,?,?)`,
  id, kind, `Bloc ${id}`, sponsoredFlag, active, now, now,
);
const clean = () => {
  db.run("DELETE FROM social_comment_reactions WHERE comment_id IN (SELECT id FROM story_interactions WHERE target_id LIKE ?)", `${prefix}%`);
  db.run("DELETE FROM social_comment_replies WHERE comment_id IN (SELECT id FROM story_interactions WHERE target_id LIKE ?)", `${prefix}%`);
  for (const table of ['story_interactions', 'publication_dislikes', 'social_loves']) db.run(`DELETE FROM ${table} WHERE target_id LIKE ?`, `${prefix}%`);
};

beforeAll(() => {
  for (const actor of [a, b]) db.run("INSERT INTO customer_accounts(id,display_name,status,created_at,updated_at) VALUES (?,?,'ACTIVE',?,?)", actor.id, actor.displayName, now, now);
  insertBlock(live, 'container', 0, 1);
  insertBlock(sponsored, 'sponsored_pair', 1, 1);
  insertBlock(hidden, 'media', 0, 0);
  session = createCustomerSession(db, a.id, { ip: '127.0.0.1', headers: {} } as any);
});
beforeEach(clean);
afterAll(() => {
  clean();
  db.run('DELETE FROM publication_blocks WHERE id LIKE ?', `${prefix}%`);
  db.run('DELETE FROM customer_sessions WHERE account_id IN (?,?)', a.id, b.id);
  db.run('DELETE FROM customer_accounts WHERE id IN (?,?)', a.id, b.id);
});

const write = (input: Record<string, unknown>, actor: typeof a | null = a) => writeSocialInteraction(db, input, actor, actor ? '' : 'guest-session-0001', now);

it('un bloc actif non sponsorisé est une cible ; sponsorisé, inactif ou inconnu ne l’est pas', () => {
  expect(publishedSocialTarget(db, live, now)).toEqual({ kind: 'post', source: 'block' });
  expect(publishedSocialTarget(db, sponsored, now)).toBeNull();
  expect(publishedSocialTarget(db, hidden, now)).toBeNull();
  expect(publishedSocialTarget(db, `${prefix}missing`, now)).toBeNull();
  for (const target of [sponsored, hidden]) {
    expect(write({ type: 'reaction', targetId: target, reaction: 'like' }).outcome).toBe('target_not_found');
    expect(write({ type: 'comment', targetId: target, text: 'Bonjour' }).outcome).toBe('target_not_found');
  }
  expect(db.get<any>('SELECT COUNT(*) n FROM story_interactions WHERE target_id IN (?,?)', sponsored, hidden).n).toBe(0);
});

it('J’aime · J’adore sur un bloc : une réaction par compte, compteurs et « mine » à jour', () => {
  const liked = write({ type: 'reaction', targetId: live, reaction: 'like' });
  expect(liked).toMatchObject({ outcome: 'ok', data: { reaction: 'like', reactionsCount: 1 } });
  write({ type: 'reaction', targetId: live, reaction: 'love' }, b);
  expect(socialInteractionCounts(db, live)).toMatchObject({ likes: 1, loves: 1 });
  expect(viewerContentReactions(db, a.id, [live])).toEqual({ [live]: 'like' });
  expect(viewerContentReactions(db, b.id, [live])).toEqual({ [live]: 'love' });
  // Re-toucher J'aime retire la réaction.
  expect(write({ type: 'like', targetId: live })).toMatchObject({ data: { reaction: null } });
  expect(socialInteractionCounts(db, live)).toMatchObject({ likes: 0, loves: 1 });
});

it('commentaires, réponse et « j’aime » de commentaire sur un bloc', () => {
  const created = write({ type: 'comment', targetId: live, text: 'Très belle sélection' });
  expect(created.outcome).toBe('created');
  const parentId = (created as any).data.id as string;
  expect(write({ type: 'comment', targetId: live, text: 'Merci !', parentId }, b).outcome).toBe('created');
  expect(write({ type: 'reaction', targetId: parentId, reaction: 'like' }, b)).toMatchObject({ data: { reaction: 'like', likesCount: 1 } });
  const read = readSocialComments(db, live, now, b.id);
  expect(read.status).not.toBe('not_found');
  const rows = (read as any).data as Array<{ id: string; parentId: string | null; likesCount: number; myReaction: string | null }>;
  expect(rows).toHaveLength(2);
  expect(rows.find((row) => row.id === parentId)).toMatchObject({ likesCount: 1, myReaction: 'like' });
  expect(rows.filter((row) => row.parentId === parentId)).toHaveLength(1);
  expect(socialInteractionCounts(db, live).comments).toBe(2);
});

it('HTTP : compteurs publics, partage visiteur compté une fois, écriture visiteur refusée', async () => {
  const guestShare = () => request(app).post('/api/public/social/interact').set('x-session-id', 'guest-session-0001').send({ type: 'share', targetId: live });
  expect((await guestShare()).status).toBe(200);
  expect((await guestShare()).body.data.recorded).toBe(false);
  const guestLike = await request(app).post('/api/public/social/interact').set('x-session-id', 'guest-session-0001').send({ type: 'reaction', targetId: live, reaction: 'like' });
  expect(guestLike.status).toBe(401);
  const counts = await request(app).get(`/api/public/social/counts?ids=${live}`);
  expect(counts.status).toBe(200);
  expect(counts.body.data[live]).toMatchObject({ shares: 1, likes: 0 });
  const memberLike = await request(app).post('/api/public/social/interact').set('Authorization', `Bearer ${session.token}`).set('x-csrf-token', session.csrfToken).send({ type: 'reaction', targetId: live, reaction: 'like' });
  expect(memberLike.status).toBe(200);
  const mine = await request(app).get(`/api/public/social/counts?ids=${live}`).set('Authorization', `Bearer ${session.token}`);
  expect(mine.body.mine).toEqual({ [live]: 'like' });
  expect((await request(app).get(`/api/public/social/comments?targetId=${sponsored}`)).status).toBe(404);
  expect((await request(app).get(`/api/public/social/comments?targetId=${live}`)).status).toBe(200);
});
