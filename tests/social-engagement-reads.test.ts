import { beforeAll, afterAll, expect, it } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { readSocialComments, readSocialCounts } from '../src/magazine/socialEngagementReads';
const prefix='engagement_read_', target=prefix+'post', now='2026-11-01T00:00:00.000Z';
beforeAll(()=>{
  const publisher=db.get<any>('SELECT id FROM story_publishers LIMIT 1').id;
  db.run("INSERT INTO customer_accounts(id,display_name,status,created_at,updated_at) VALUES (?,'Reader','ACTIVE',?,?)",prefix+'account',now,now);
  for(const [id,status,publish] of [[target,'publie',now],[target+'_draft','brouillon',now],[target+'_future','publie','2099-01-01']]) db.run("INSERT INTO publications(id,title,channel_id,image_url,publish_at,status,created_at,updated_at) VALUES (?,'Fixture',?,'/media/test',?,?,?,?)",id,publisher,publish,status,now,now);
  for(let i=0;i<105;i++) db.run("INSERT INTO story_interactions(id,target_id,target_kind,type,account_id,text,created_at) VALUES (?,?,'post','comment',?,?,?)",prefix+i,target,i===104?null:prefix+'account',`Comment ${i}`,new Date(Date.parse(now)+i*1000).toISOString());
  db.run('INSERT INTO social_comment_replies(comment_id,parent_id) VALUES (?,?)',prefix+104,prefix+103);
  for(const type of ['like','view','share']) db.run("INSERT INTO story_interactions(id,target_id,target_kind,type,created_at) VALUES (?,?,'post',?,?)",prefix+type,target,type,now);
});
afterAll(()=>{
  db.run('DELETE FROM story_interactions WHERE target_id=?',target);
  db.run('DELETE FROM publications WHERE id LIKE ?',prefix+'%');
  db.run('DELETE FROM customer_accounts WHERE id=?',prefix+'account');
});
it('returns the last 100 comments in chronological order, preserving author fallback and reply mapping',async()=>{
  const result=readSocialComments(db,target,'2026-11-02');
  expect(result.status).toBe('ok');
  if(result.status!=='ok') throw new Error('missing fixture');
  expect(result.data).toHaveLength(100);
  expect(result.data[0]).toMatchObject({id:prefix+5,author:'Reader',text:'Comment 5',parentId:null});
  expect(result.data[99]).toMatchObject({id:prefix+104,author:'Membre ZAYROVI',parentId:prefix+103});
  const old=db.all<any>(`SELECT i.id,i.text,i.created_at,c.display_name author,(SELECT parent_id FROM social_comment_replies r WHERE r.comment_id=i.id) parent_id,
      (SELECT COUNT(*) FROM social_comment_reactions x WHERE x.comment_id=i.id AND x.reaction='like') likes_count
    FROM story_interactions i LEFT JOIN customer_accounts c ON c.id=i.account_id WHERE i.target_id=? AND i.type='comment' ORDER BY i.created_at DESC LIMIT 100`,target).reverse().map(row=>({id:row.id,author:row.author||'Membre ZAYROVI',text:row.text,createdAt:row.created_at,parentId:row.parent_id||null,likesCount:Number(row.likes_count||0),myReaction:null}));
  expect(result.data).toEqual(old);
  expect((await request(app).get('/api/public/social/comments').query({targetId:target})).body).toEqual({success:true,data:old});
});
it('keeps target validation and visibility responses without leaking unpublished comments',async()=>{
  expect((await request(app).get('/api/public/social/comments').query({targetId:'bad id'})).status).toBe(400);
  for(const id of [target+'_draft',target+'_future','missing_target']) {
    expect(readSocialComments(db,id,now)).toEqual({status:'not_found'});
    expect((await request(app).get('/api/public/social/comments').query({targetId:id})).status).toBe(404);
  }
});
it('aggregates actual types, returns zero for unknown IDs and preserves the public counts contract',async()=>{
  const expected={likes:1,comments:105,views:1,shares:1};
  expect(readSocialCounts(db,target)[target]).toEqual(expected);
  const response=await request(app).get('/api/public/social/counts').query({ids:`${target},missing_target,${target}`});
  expect(response.body).toEqual({success:true,data:{[target]:expected,missing_target:{likes:0,comments:0,views:0,shares:0}}});
});
it('bounds the SQL batch, retains slice-before-dedup semantics and skips SQL for empty input',()=>{
  let calls=0;let params: unknown[]=[];
  const store={all:((sql: string,...values: unknown[])=>{calls++;params=values;return [];}) as typeof db.all};
  expect(readSocialCounts(store,undefined)).toEqual({});
  expect(readSocialCounts(store,'bad id,!,')).toEqual({});
  expect(calls).toBe(0);
  const input=Array.from({length:65},(_,i)=>`id_${i}`).join(',');
  expect(Object.keys(readSocialCounts(store,input))).toHaveLength(60);
  expect(params).toHaveLength(60);
  expect(Object.keys(readSocialCounts(store,Array(60).fill('same').concat('outside').join(',')))).toEqual(['same']);
});
it('treats prototype-like valid IDs as ordinary JSON keys without changing object prototypes',async()=>{
  const result=readSocialCounts(db,'__proto__,constructor,toString');
  expect(Object.getPrototypeOf(result)).toBeNull();
  expect(Object.keys(result)).toEqual(['__proto__','constructor','toString']);
  for(const id of Object.keys(result)) expect(result[id]).toEqual({likes:0,comments:0,views:0,shares:0});
  const response=await request(app).get('/api/public/social/counts').query({ids:'__proto__,constructor,toString'});
  expect(Object.keys(response.body.data)).toEqual(['__proto__','constructor','toString']);
});
