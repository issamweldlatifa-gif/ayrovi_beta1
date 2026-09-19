import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { QatafoDatabase } from '../src/db/database';
import { createCustomerRouter } from '../src/customer/routes';
import { verifyPassword } from '../src/customer/passwords';
let db:QatafoDatabase;let app:express.Express;
const password='Original-password-1!';const updated='New-password-2!';
beforeEach(()=>{db=new QatafoDatabase(':memory:');app=express();app.use(express.json());app.use('/api/customer',createCustomerRouter(db));});
afterEach(()=>{db.close();vi.unstubAllEnvs();});
async function register(email='customer@example.com'){
 const agent=request.agent(app);const result=await agent.post('/api/customer/auth/email/register').send({email,password,displayName:'Test Customer'});expect(result.status).toBe(200);
 return {agent,id:result.body.data.account.id,csrf:result.body.data.csrfToken};
}
const photo=()=>sharp({create:{width:500,height:300,channels:3,background:'#ff7900'}}).png().withMetadata().toBuffer();
describe('Persistent customer account settings',()=>{
 test('avatar and password writes require authentication',async()=>{
  expect((await request(app).post('/api/customer/account/avatar')).status).toBe(401);
  expect((await request(app).delete('/api/customer/account/avatar')).status).toBe(401);
  expect((await request(app).post('/api/customer/account/security/password').send({})).status).toBe(401);
 });
 test('all new writes require CSRF and do not mutate on failure',async()=>{
  const {agent,id}=await register();
  for(const [method,path] of [['post','avatar'],['delete','avatar'],['post','security/password']] as const)expect((await agent[method](`/api/customer/account/${path}`).send({})).status).toBe(403);
  expect(db.get<any>('SELECT avatar_url FROM customer_accounts WHERE id=?',id).avatar_url).toBeFalsy();
 });
 test('photo is decoded, cropped, metadata stripped, persisted and isolated',async()=>{
  const {agent,csrf,id}=await register();const other=await register('other@example.com');
  const result=await agent.post('/api/customer/account/avatar').set('x-csrf-token',csrf).attach('avatar',await photo(),'photo.png');
  expect(result.status).toBe(200);expect(result.body.data.id).toBe(id);const url=result.body.data.avatarUrl;expect(url).toMatch(/^data:image\/jpeg;base64,/);
  const metadata=await sharp(Buffer.from(url.split(',')[1],'base64')).metadata();expect(metadata.width).toBe(256);expect(metadata.height).toBe(256);expect(metadata.exif).toBeUndefined();
  expect((await agent.get('/api/customer/auth/me')).body.data.account.avatarUrl).toBe(url);
  expect((await other.agent.get('/api/customer/auth/me')).body.data.account.avatarUrl).toBeFalsy();
  expect(db.get<any>('SELECT avatar_source FROM customer_accounts WHERE id=?',id).avatar_source).toBe('custom');
  expect(result.headers['cache-control']).toContain('no-store');
 });
 test('removing a provider/custom photo is persistent and explicitly recorded',async()=>{
  const {agent,id,csrf}=await register();db.run("UPDATE customer_accounts SET avatar_url='https://example.com/avatar.jpg' WHERE id=?",id);
  const result=await agent.delete('/api/customer/account/avatar').set('x-csrf-token',csrf);expect(result.status).toBe(200);expect(result.body.data.avatarUrl).toBeFalsy();
  expect(db.get<any>('SELECT avatar_source FROM customer_accounts WHERE id=?',id).avatar_source).toBe('none');
 });
 test.each([['missing',null],['svg',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>')],['fake JPEG',Buffer.from('not a photo')]])('rejects %s image',async(_name,buffer)=>{
  const {agent,csrf}=await register();const req=agent.post('/api/customer/account/avatar').set('x-csrf-token',csrf);const result=buffer?await req.attach('avatar',buffer,'fake.jpg'):await req;
  expect(result.status).toBe(400);expect(result.body.success).toBe(false);
 });
 test('oversized photo is rejected with 413 JSON',async()=>{
  const {agent,csrf}=await register();const result=await agent.post('/api/customer/account/avatar').set('x-csrf-token',csrf).attach('avatar',Buffer.alloc(2*1024*1024+1),'large.png');expect(result.status).toBe(413);expect(result.body.code).toBe('AVATAR_UPLOAD_INVALID');
 });
 test('security summary accurately identifies password/OAuth-only accounts',async()=>{
  const {agent,id}=await register();expect((await agent.get('/api/customer/account/security')).body.data.hasPassword).toBe(true);db.run("UPDATE customer_accounts SET password_hash=NULL WHERE id=?",id);expect((await agent.get('/api/customer/account/security')).body.data.hasPassword).toBe(false);
 });
 test('password change rotates current session, revokes others/resets and queues notification',async()=>{
  vi.stubEnv('PUBLIC_BASE_URL','https://shop.example.com');vi.stubEnv('MAIL_PROVIDER','resend');vi.stubEnv('MAIL_API_KEY','test-only');vi.stubEnv('MAIL_FROM','AYROVI <no-reply@example.com>');
  const {agent,id,csrf}=await register();const other=request.agent(app);await other.post('/api/customer/auth/email/login').send({email:'customer@example.com',password});
  expect((await request(app).post('/api/customer/auth/password/request').send({email:'customer@example.com'})).status).toBe(202);
  const result=await agent.post('/api/customer/account/security/password').set('x-csrf-token',csrf).send({currentPassword:password,newPassword:updated,locale:'ar'});
  expect(result.status).toBe(200);expect(result.body.data.csrfToken).not.toBe(csrf);expect(JSON.stringify(result.body)).not.toContain('password_hash');
  expect((await agent.get('/api/customer/account/security')).status).toBe(200);expect((await other.get('/api/customer/auth/me')).status).toBe(401);
  expect(db.get<any>('SELECT COUNT(*) n FROM customer_sessions WHERE account_id=?',id).n).toBe(1);
  expect(verifyPassword(updated,db.get<any>('SELECT password_hash FROM customer_accounts WHERE id=?',id).password_hash)).toBe(true);
  expect(db.get<any>('SELECT consumed_at FROM customer_password_resets WHERE account_id=?',id).consumed_at).toBeTruthy();
  expect(db.get<any>("SELECT status,payload FROM customer_auth_mail_jobs WHERE kind='PASSWORD_RESET'")).toMatchObject({status:'CANCELLED',payload:''});
  expect(db.get<any>("SELECT count(*) n FROM customer_auth_mail_jobs WHERE kind='PASSWORD_CHANGED'").n).toBe(1);
  expect((await agent.put('/api/customer/account/preferences').set('x-csrf-token',csrf).send({darkMode:true})).status).toBe(403);
  expect((await agent.put('/api/customer/account/preferences').set('x-csrf-token',result.body.data.csrfToken).send({darkMode:true})).status).toBe(200);
  expect((await request(app).post('/api/customer/auth/email/login').send({email:'customer@example.com',password})).status).toBe(401);
  expect((await request(app).post('/api/customer/auth/email/login').send({email:'customer@example.com',password:updated})).status).toBe(200);
 });
 test.each([['wrong',updated,'CURRENT_PASSWORD_INVALID'],[password,'short','PASSWORD_WEAK'],[password,'a'.repeat(101),'PASSWORD_WEAK'],[password,password,'PASSWORD_UNCHANGED']])('rejects invalid password change: %s / %s',async(currentPassword,newPassword,code)=>{
  const {agent,csrf,id}=await register();const result=await agent.post('/api/customer/account/security/password').set('x-csrf-token',csrf).send({currentPassword,newPassword,locale:'ar'});
  expect(result.status).toBe(400);expect(result.body.code).toBe(code);expect(result.body.error).toMatch(/[\u0600-\u06ff]/);expect(verifyPassword(password,db.get<any>('SELECT password_hash FROM customer_accounts WHERE id=?',id).password_hash)).toBe(true);
 });
 test('OAuth-only account cannot set a password through change endpoint',async()=>{
  const {agent,csrf,id}=await register();db.run('UPDATE customer_accounts SET password_hash=NULL WHERE id=?',id);
  const result=await agent.post('/api/customer/account/security/password').set('x-csrf-token',csrf).send({currentPassword:password,newPassword:updated});expect(result.status).toBe(409);expect(result.body.code).toBe('PASSWORD_NOT_SET');
 });
 test('password guessing is rate limited',async()=>{
  const {agent,csrf}=await register();for(let i=0;i<5;i++)expect((await agent.post('/api/customer/account/security/password').set('x-csrf-token',csrf).send({currentPassword:'wrong',newPassword:updated})).status).toBe(400);
  expect((await agent.post('/api/customer/account/security/password').set('x-csrf-token',csrf).send({currentPassword:password,newPassword:updated})).status).toBe(429);
 });
 test('partial preferences preserve omitted values, reject coercions and isolate accounts',async()=>{
  const {agent,csrf}=await register();const other=await register('other@example.com');
  await agent.put('/api/customer/account/preferences').set('x-csrf-token',csrf).send({orderUpdates:false,paymentUpdates:false});
  const result=await agent.put('/api/customer/account/preferences').set('x-csrf-token',csrf).send({darkMode:true});expect(result.body.data).toMatchObject({dark_mode:1,order_updates:0,payment_updates:0,shipping_updates:1,invoice_updates:1});
  expect((await agent.put('/api/customer/account/preferences').set('x-csrf-token',csrf).send({darkMode:'false'})).status).toBe(400);
  expect((await other.agent.get('/api/customer/account/preferences')).body.data).toMatchObject({dark_mode:0,order_updates:1});
 });
 test('password account cannot remove its login email',async()=>{
  const {agent,csrf}=await register();expect((await agent.put('/api/customer/account/profile').set('x-csrf-token',csrf).send({displayName:'Client',email:''})).status).toBe(400);
 });
});
