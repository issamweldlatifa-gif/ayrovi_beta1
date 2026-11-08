import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { preferenceTiming } from '../src/analytics/preferenceTiming';
import { createCustomerSession } from '../src/customer/auth';
import { writePublicationPreference, writePublisherFollow } from '../src/magazine/publicationPreferences';
const a = 'preference_boundary_a', b = 'preference_boundary_b';
const publication = 'preference_boundary_post';
let publisher: string;
let authA: ReturnType<typeof createCustomerSession>, authB: ReturnType<typeof createCustomerSession>;
beforeAll(() => {
  const now = new Date().toISOString();
  publisher = db.get<any>('SELECT id FROM story_publishers LIMIT 1').id;
  for (const id of [a,b]) db.run("INSERT INTO customer_accounts(id,display_name,status,created_at,updated_at) VALUES (?,?,'ACTIVE',?,?)",id,id,now,now);
  authA = createCustomerSession(db,a,{ip:'127.0.0.1',headers:{}} as any);
  authB = createCustomerSession(db,b,{ip:'127.0.0.1',headers:{}} as any);
  for (const [id,status,date] of [[publication,'publie','2026-01-01'],[publication+'_draft','brouillon','2026-01-01'],[publication+'_future','publie','2099-01-01']])
    db.run("INSERT INTO publications(id,title,channel_id,image_url,publish_at,status,created_at,updated_at) VALUES (?,'Fixture',?,'/media/fixture',?,?,?,?)",id,publisher,date,status,now,now);
});
beforeEach(() => {
  db.run('DELETE FROM publication_preferences WHERE account_id IN (?,?)',a,b);
  db.run('DELETE FROM publication_follows WHERE account_id IN (?,?)',a,b);
});
afterAll(() => {
  db.run('DELETE FROM publications WHERE id IN (?,?,?)',publication,publication+'_draft',publication+'_future');
  db.run('DELETE FROM customer_accounts WHERE id IN (?,?)',a,b);
});
const prefUrl = (id=publication) => `/api/public/social/publications/${id}/preferences`;
const followUrl = () => `/api/public/social/publishers/${publisher}/follow`;
let requestIndex=0;
const mutation=(url: string)=>request(app).put(url).set('x-session-id',`preference-boundary-${++requestIndex}`);
const put = (url: string, body: object, auth=authA) => mutation(url).set('Authorization',`Bearer ${auth.token}`).set('x-csrf-token',auth.csrfToken).send(body);
const rows = () => ({ preferences: db.all('SELECT * FROM publication_preferences WHERE account_id IN (?,?) ORDER BY account_id,publication_id',a,b),
  follows: db.all('SELECT * FROM publication_follows WHERE account_id IN (?,?) ORDER BY account_id,publisher_id',a,b) });
it('keeps ownership in the authenticated context and applies partial updates without overwriting the other field', async () => {
  expect((await put(prefUrl(),{saved:true,account_id:b,accountId:b})).body.data).toEqual({saved:true,feedback:''});
  expect(db.get('SELECT 1 FROM publication_preferences WHERE account_id=?',b)).toBeUndefined();
  expect((await put(prefUrl(),{feedback:'hidden'})).body.data).toEqual({saved:true,feedback:'hidden'});
  expect((await put(prefUrl(),{saved:false})).body.data).toEqual({saved:false,feedback:'hidden'});
  expect((await put(prefUrl(),{saved:null,feedback:null})).body.data).toEqual({saved:false,feedback:'hidden'});
  expect((await put(prefUrl(),{saved:true},authB)).status).toBe(200);
  expect(db.get<any>('SELECT saved,feedback FROM publication_preferences WHERE account_id=?',a)).toEqual({saved:0,feedback:'hidden'});
  expect(db.get<any>('SELECT saved,feedback FROM publication_preferences WHERE account_id=?',b)).toEqual({saved:1,feedback:''});
});
it('writes no preferences/follows for missing auth, invalid CSRF or invalid values', async () => {
  await put(prefUrl(),{saved:true}); await put(followUrl(),{following:true});
  const before=rows();
  for (const [url,body] of [[prefUrl(),{saved:false}],[followUrl(),{following:false}]] as const) {
    expect((await mutation(url).send(body)).status).toBe(401);
    expect((await mutation(url).set('Authorization',`Bearer ${authA.token}`).send(body)).status).toBe(403);
    expect((await mutation(url).set('Authorization',`Bearer ${authA.token}`).set('x-csrf-token',authB.csrfToken).send(body)).status).toBe(403);
  }
  for (const body of [{saved:'yes'},{saved:0},{feedback:'other'},{feedback:[]}]) expect((await put(prefUrl(),body)).status).toBe(400);
  for (const following of [null,'yes',1]) expect((await put(followUrl(),{following})).status).toBe(400);
  expect(rows()).toEqual(before);
});
it('keeps unpublished, future and absent targets unavailable and preserves 404 precedence', async () => {
  const before=rows();
  for (const id of [publication+'_draft',publication+'_future','missing']) expect((await put(prefUrl(id),{saved:'invalid'})).status).toBe(404);
  expect((await put('/api/public/social/publishers/missing/follow',{following:'invalid'})).status).toBe(404);
  expect(rows()).toEqual(before);
});
it('isolates follow reads and writes, preserves the original creation date, and supports idempotent removal', async () => {
  const stamp='2026-01-01T00:00:00.000Z';
  expect(writePublisherFollow(db,a,publisher,{following:true},stamp).status).toBe('ok');
  expect((await put(followUrl(),{following:true,account_id:b})).status).toBe(200);
  expect(db.get<any>('SELECT created_at FROM publication_follows WHERE account_id=?',a).created_at).toBe(stamp);
  const guest=await request(app).get(followUrl());
  expect(guest.body.data).toEqual({following:false}); expect(guest.headers['cache-control']).toBe('private, no-store');
  expect((await request(app).get(followUrl()).set('Authorization',`Bearer ${authA.token}`)).body.data.following).toBe(true);
  expect((await request(app).get(followUrl()).set('Authorization',`Bearer ${authB.token}`)).body.data.following).toBe(false);
  for(let i=0;i<2;i++) expect((await put(followUrl(),{following:false})).body.data.following).toBe(false);
});
it('rolls back when storage fails after a write, rather than committing a partial result', () => {
  writePublicationPreference(db,a,publication,{saved:true},'2026-01-01');
  const before=rows();
  const failing = { get: db.get.bind(db), transaction: db.transaction.bind(db), run: (sql: string,...params: any[]) => {
    db.run(sql,...params); throw Error('simulated storage failure');
  } };
  expect(()=>writePublicationPreference(failing,a,publication,{saved:false,feedback:'hidden'},'2026-01-02')).toThrow('simulated storage failure');
  expect(rows()).toEqual(before);
  expect(()=>writePublisherFollow(failing,a,publisher,{following:true},'2026-01-02')).toThrow('simulated storage failure');
  expect(rows()).toEqual(before);
});

it('counts unauthorized responses at the observer without recording identity or bypassing auth', async () => {
  const before=preferenceTiming.snapshot().publication_preference_write?.http4xx ?? 0;
  expect((await mutation(prefUrl()).send({saved:true})).status).toBe(401);
  expect(preferenceTiming.snapshot().publication_preference_write.http4xx).toBe(before+1);
  expect(rows()).toEqual({preferences:[],follows:[]});
});
