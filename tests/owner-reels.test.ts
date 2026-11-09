import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { QatafoDatabase } from '../src/db/database';
import { installOwnerReels, OWNER_REELS_MIGRATION } from '../src/magazine/installOwnerReels';
import { readPublishedSocial } from '../src/magazine/publicSocialReads';
import manifest from '../assets/media/reels-owned/manifest.json';
it('ships exactly five hashed full-duration owner clips with posters, faststart and byte ranges',async()=>{
  expect(manifest.entries).toHaveLength(5);
  const directory=path.resolve('assets/media/reels-owned');const app=express().use('/media/reels-owned',express.static(directory));
  expect(fs.readdirSync(directory).filter(name=>name.endsWith('.mp4'))).toHaveLength(5);
  for(const entry of manifest.entries) {
    const bytes=fs.readFileSync(path.join(directory,entry.file));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
    expect(createHash('sha256').update(fs.readFileSync(path.join(directory,entry.poster))).digest('hex')).toBe(entry.posterSha256);
    const atoms:string[]=[];let offset=0;
    while(offset+8<=bytes.length) {const size=bytes.readUInt32BE(offset);expect(size).toBeGreaterThanOrEqual(8);atoms.push(bytes.toString('ascii',offset+4,offset+8));offset+=size;}
    expect(offset).toBe(bytes.length);expect(atoms.indexOf('moov')).toBeGreaterThanOrEqual(0);expect(atoms.indexOf('moov')).toBeLessThan(atoms.indexOf('mdat'));
    const result=await request(app).get(entry.videoUrl).set('Range','bytes=0-127');
    expect(result.status).toBe(206);expect(result.headers['content-type']).toContain('video/mp4');expect(result.body).toEqual(bytes.subarray(0,128));
    expect(result.headers['content-range']).toBe(`bytes 0-127/${bytes.length}`);
  }
});
it('replaces the collection on an existing file DB after a verified snapshot, preserves unrelated content and does not reseed on restart',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'owner-reels-'));const file=path.join(root,'db.sqlite');let db:QatafoDatabase|undefined;
  try {
    db=new QatafoDatabase(file);
    db.run('DELETE FROM applied_data_migrations WHERE key=?',OWNER_REELS_MIGRATION);
    const publisher=db.get<any>('SELECT id FROM story_publishers LIMIT 1').id;
    const now=new Date().toISOString();
    for(const id of ['old_reel','shared_target']) db.run("INSERT INTO reels(id,title,channel_id,video_url,publish_at,status,created_at,updated_at) VALUES (?,'Old',?,'/uploads/old.mp4',?,'publie',?,?)",id,publisher,now,now,now);
    db.run("INSERT INTO publications(id,title,channel_id,image_url,publish_at,status,created_at,updated_at) VALUES ('shared_target','Preserved',?,'/uploads/post.jpg',?,'publie',?,?)",publisher,now,now,now);
    db.run("INSERT INTO story_interactions(id,target_id,target_kind,type,text,created_at) VALUES ('old_comment','old_reel','post','comment','Old comment',?),('old_reply','old_reel','post','comment','Old reply',?),('shared_comment','shared_target','post','comment','Preserved',?)",now,now,now);
    db.run("INSERT INTO social_comment_replies(comment_id,parent_id) VALUES ('old_reply','old_comment')");
    const product=db.get<any>('SELECT id FROM products LIMIT 1').id;
    db.run("INSERT INTO content_products(content_kind,content_id,product_id,created_at) VALUES ('reel','old_reel',?,?)",product,now);
    const before=db.all('SELECT * FROM reels ORDER BY id');const preservedPost=db.get("SELECT * FROM publications WHERE id='shared_target'");
    db.close();db=new QatafoDatabase(file);
    expect(db.all<any>('SELECT id FROM reels ORDER BY id').map(row=>row.id)).toEqual(manifest.entries.map(row=>row.id).sort());
    expect(readPublishedSocial(db,'reel',new Date().toISOString(),{limit:12}).items).toHaveLength(5);
    expect(db.all('SELECT * FROM content_products WHERE content_kind=?','reel')).toEqual([]);
    expect(db.all("SELECT * FROM story_interactions WHERE target_id='old_reel'")).toEqual([]);
    expect(db.get("SELECT * FROM social_comment_replies WHERE comment_id='old_reply'")).toBeUndefined();
    expect(db.get("SELECT * FROM publications WHERE id='shared_target'")).toEqual(preservedPost);
    expect(db.get("SELECT text FROM story_interactions WHERE id='shared_comment'")).toEqual({text:'Preserved'});
    const backups=fs.readdirSync(path.join(root,'backups')).filter(name=>name.startsWith('pre-owner-reels-'));expect(backups).toHaveLength(2);
    const snapshots=backups.map(name=>{const raw=new Database(path.join(root,'backups',name),{readonly:true});try{return raw.prepare('SELECT * FROM reels ORDER BY id').all();}finally{raw.close();}});
    expect(snapshots).toContainEqual(before);
    const first=manifest.entries[0].id;db.run("UPDATE reels SET title='Owner edited',status='brouillon' WHERE id=?",first);db.run('DELETE FROM reels WHERE id=?',manifest.entries[1].id);
    db.close();db=new QatafoDatabase(file);
    expect(db.get('SELECT title,status FROM reels WHERE id=?',first)).toEqual({title:'Owner edited',status:'brouillon'});
    expect(db.get('SELECT id FROM reels WHERE id=?',manifest.entries[1].id)).toBeUndefined();
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
    expect(fs.readdirSync(path.join(root,'backups')).filter(name=>name.startsWith('pre-owner-reels-'))).toHaveLength(2);
  }finally{db?.close();fs.rmSync(root,{recursive:true,force:true});}
},20_000);
it('leaves rows and migration marker unchanged when media, backup or a post-delete write fails',()=>{
  const db=new QatafoDatabase(':memory:');const empty=fs.mkdtempSync(path.join(os.tmpdir(),'owner-empty-'));
  try {
    db.run('DELETE FROM applied_data_migrations WHERE key=?',OWNER_REELS_MIGRATION);
    const before=db.all('SELECT * FROM reels ORDER BY id');const backup=vi.fn();
    expect(()=>installOwnerReels(db,backup,empty)).toThrow();expect(backup).not.toHaveBeenCalled();
    expect(()=>installOwnerReels(db,()=>{throw Error('backup');})).toThrow('backup');
    const store={get:db.get.bind(db),all:db.all.bind(db),transaction:db.transaction.bind(db),run:(sql:string,...args:any[])=>{const r=db.run(sql,...args);if(sql==='DELETE FROM reels')throw Error('after delete');return r;}};
    expect(()=>installOwnerReels(store,()=>{})).toThrow('after delete');
    expect(db.all('SELECT * FROM reels ORDER BY id')).toEqual(before);
    expect(db.get('SELECT 1 FROM applied_data_migrations WHERE key=?',OWNER_REELS_MIGRATION)).toBeUndefined();
    expect(installOwnerReels(db,()=>{})).toBe(true);
  }finally{db.close();fs.rmSync(empty,{recursive:true,force:true});}
});
