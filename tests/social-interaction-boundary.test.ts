import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { app, db } from '../src/server';
import request from 'supertest';
import { createCustomerSession } from '../src/customer/auth';
import { writeSocialInteraction, socialInteractionCounts } from '../src/magazine/socialInteractions';
const prefix = 'interaction_boundary_';
const post = prefix+'post', reel = prefix+'reel';
const now = '2026-11-01T00:00:00.000Z';
const a = { id: prefix+'a', displayName: 'A' }, b = { id: prefix+'b', displayName: 'B' };
let session: ReturnType<typeof createCustomerSession>;
beforeAll(() => {
  const publisher = db.get<any>('SELECT id FROM story_publishers LIMIT 1').id;
  for (const actor of [a,b]) db.run("INSERT INTO customer_accounts(id,display_name,status,created_at,updated_at) VALUES (?,?,'ACTIVE',?,?)", actor.id,actor.displayName,now,now);
  for (const [id,status,date] of [[post,'publie',now],[post+'_draft','brouillon',now],[post+'_future','publie','2099-01-01']]) db.run("INSERT INTO publications(id,title,channel_id,image_url,publish_at,status,created_at,updated_at) VALUES (?,'Fixture',?,'/media/test',?,?,?,?)",id,publisher,date,status,now,now);
  db.run("INSERT INTO reels(id,title,channel_id,video_url,publish_at,status,created_at,updated_at) VALUES (?,'Fixture',?,'/media/test',?,'publie',?,?)",reel,publisher,now,now,now);
  for (const [id,status,publish,expires] of [[prefix+'expired','PUBLISHED',now,now],[prefix+'story_future','PUBLISHED','2099-01-01',null],[prefix+'story_draft','DRAFT',now,null]]) db.run("INSERT INTO stories(id,media_url,title,publish_at,expires_at,status,created_at,updated_at) VALUES (?,'/media/test','Fixture',?,?,?,?,?)",id,publish,expires,status,now,now);
  session=createCustomerSession(db,a.id,{ip:'127.0.0.1',headers:{}} as any);
});
beforeEach(() => {
  db.run('DELETE FROM story_interactions WHERE target_id LIKE ?',prefix+'%');
  db.run('DELETE FROM publication_dislikes WHERE target_id LIKE ?',prefix+'%');
  db.run('UPDATE reels SET views=0,likes=0,updated_at=? WHERE id=?',now,reel);
});
afterAll(() => {
  db.run('DELETE FROM story_interactions WHERE target_id LIKE ?',prefix+'%');
  db.run('DELETE FROM publications WHERE id LIKE ?',prefix+'%');
  db.run('DELETE FROM reels WHERE id=?',reel);
  db.run('DELETE FROM stories WHERE id LIKE ?',prefix+'%');
  db.run('DELETE FROM customer_accounts WHERE id IN (?,?)',a.id,b.id);
});
const write=(body: object, actor: typeof a | null=a, guest='boundary-guest-one')=>writeSocialInteraction(db,{targetId:post,...body},actor,guest,now);
const data=(result: ReturnType<typeof write>)=>{if (!('data' in result)) throw new Error(result.outcome); return result.data;};
const state=()=>({rows:db.all('SELECT * FROM story_interactions WHERE target_id LIKE ? ORDER BY id',prefix+'%'), dislikes:db.all('SELECT * FROM publication_dislikes WHERE target_id LIKE ?',prefix+'%'), reel:db.get('SELECT views,likes,updated_at FROM reels WHERE id=?',reel)});
it('preserves toggle likes while explicit reactions are idempotent and account scoped',()=>{
  expect(data(write({type:'reaction',reaction:'like',account_id:b.id})).liked).toBe(true);
  write({type:'reaction',reaction:'like'});
  expect(socialInteractionCounts(db,post).likes).toBe(1);
  expect(db.get<any>('SELECT account_id FROM story_interactions WHERE target_id=?',post).account_id).toBe(a.id);
  write({type:'reaction',reaction:'dislike'});
  expect(socialInteractionCounts(db,post).likes).toBe(0);
  write({type:'reaction',reaction:'like'},b);
  expect(data(write({type:'reaction',reaction:null})).reaction).toBeNull();
  expect(socialInteractionCounts(db,post).likes).toBe(1);
  expect(data(write({type:'like'})).liked).toBe(true);
  expect(data(write({type:'like'})).liked).toBe(false);
  expect(socialInteractionCounts(db,post).likes).toBe(1);
});
it('deduplicates views and shares by trusted account or guest session and synchronizes reels',()=>{
  for (const type of ['view','share']) {
    expect(data(write({type,targetId:reel})).recorded).toBe(true);
    expect(data(write({type,targetId:reel})).recorded).toBe(false);
    expect(data(write({type,targetId:reel},b)).recorded).toBe(true);
    expect(data(write({type,targetId:reel},null)).recorded).toBe(true);
    expect(data(write({type,targetId:reel},null)).recorded).toBe(false);
    expect(data(write({type,targetId:reel},null,'boundary-guest-two')).recorded).toBe(true);
  }
  write({type:'like',targetId:reel});
  expect(db.get('SELECT views,likes FROM reels WHERE id=?',reel)).toEqual({views:4,likes:1});
  write({type:'like',targetId:reel});
  expect(db.get('SELECT views,likes FROM reels WHERE id=?',reel)).toEqual({views:4,likes:0});
});
it('replays comments, rejects conflicting text/parent and isolates client request IDs by account',()=>{
  const parent=data(write({type:'comment',text:'Parent',clientRequestId:'parent_request'}));
  const payload={type:'comment',text:' A\n reply ',parentId:parent.id,clientRequestId:'reply_request'};
  const first=write(payload);
  expect(first.outcome).toBe('created');
  expect(write(payload)).toEqual({outcome:'ok',data:data(first)});
  expect(write({...payload,text:'Changed'}).outcome).toBe('comment_conflict');
  expect(write({...payload,parentId:null}).outcome).toBe('comment_conflict');
  expect(write({...payload,parentId:'missing_parent'}).outcome).toBe('comment_parent_invalid');
  expect(write(payload,b).outcome).toBe('created');
  expect(socialInteractionCounts(db,post).comments).toBe(3);
});
it('leaves business rows unchanged on invalid, unpublished or unauthorized requests',()=>{
  const before=state();
  for(const targetId of [post+'_draft',post+'_future','missing_target',prefix+'expired',prefix+'story_future',prefix+'story_draft']) expect(write({type:'view',targetId}).outcome).toBe('target_not_found');
  for(const type of ['like','reaction','comment']) expect(write({type},null).outcome).toBe('auth_required');
  expect(write({type:'view'},null,'bad').outcome).toBe('guest_session_required');
  expect(write({type:'reaction',reaction:'invalid'}).outcome).toBe('invalid_reaction');
  expect(write({type:'reaction',reaction:'like',targetId:reel}).outcome).toBe('reaction_target_invalid');
  expect(write({type:'comment',text:'x'}).outcome).toBe('comment_too_short');
  expect(write({type:'comment',text:'Valid',clientRequestId:'bad'}).outcome).toBe('comment_request_invalid');
  expect(state()).toEqual(before);
});
it('rolls back interactions, reply links and reel counters when failure follows a SQL write',()=>{
  const parent=data(write({type:'comment',text:'Parent'}));
  for (const [payload,sql] of [
    [{type:'like',targetId:reel},'UPDATE reels SET'],
    [{type:'view',targetId:reel},'UPDATE reels SET'],
    [{type:'comment',targetId:post,text:'Reply',parentId:parent.id},'INSERT INTO social_comment_replies'],
    [{type:'reaction',targetId:post,reaction:'dislike'},'INSERT INTO publication_dislikes'],
  ] as const) {
    const before=state();
    const store={get:db.get.bind(db),all:db.all.bind(db),transaction:db.transaction.bind(db),run:(statement: string,...args: any[])=>{const result=db.run(statement,...args);if(statement.startsWith(sql))throw new Error('simulated failure');return result;}};
    expect(()=>writeSocialInteraction(store,payload,a,'',now)).toThrow('simulated failure');
    expect(state()).toEqual(before);
    expect(db.all('SELECT * FROM social_comment_replies WHERE parent_id=?',parent.id)).toEqual([]);
  }
});
it('keeps HTTP auth and CSRF rejection before business mutation',async()=>{
  const before=state();
  const endpoint='/api/public/social/interact';
  expect((await request(app).post(endpoint).send({type:'like',targetId:post})).status).toBe(401);
  expect((await request(app).post(endpoint).set('Authorization',`Bearer ${session.token}`).send({type:'like',targetId:post})).status).toBe(403);
  expect(state()).toEqual(before);
});
