import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { QatafoDatabase } from '../src/db/database';
import { installReelTestPack, REEL_TEST_PACK_MIGRATION } from '../src/magazine/installReelTestPack';
import manifest from '../assets/media/reel-test-pack/manifest.json';
it('publishes on startup once, snapshots beforehand and preserves edits/deletions on repeated opens',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'reel-auto-'));const file=path.join(root,'fixture.sqlite');
  let db: QatafoDatabase | undefined;
  try {
    db=new QatafoDatabase(file);
    for(const entry of manifest.entries) expect(db.get('SELECT status,video_url,product_id FROM reels WHERE id=?',entry.id)).toEqual({status:'publie',video_url:entry.videoUrl,product_id:null});
    expect(db.get('SELECT 1 FROM applied_data_migrations WHERE key=?',REEL_TEST_PACK_MIGRATION)).toBeTruthy();
    const backups=fs.readdirSync(path.join(root,'backups')).filter(name=>name.startsWith('pre-reel-test-pack-'));
    expect(backups).toHaveLength(1);
    const copy=new Database(path.join(root,'backups',backups[0]),{readonly:true});
    try { expect(copy.prepare('SELECT COUNT(*) n FROM reels WHERE id LIKE ?').get('reel_test_pack_%')).toEqual({n:0}); } finally {copy.close();}
    const edited=manifest.entries[0].id, deleted=manifest.entries[1].id;
    db.run("UPDATE reels SET title='Owner title',status='brouillon',video_url='/uploads/owner.mp4' WHERE id=?",edited);
    db.run('DELETE FROM reels WHERE id=?',deleted);
    db.close();db=new QatafoDatabase(file);
    expect(db.get('SELECT title,status,video_url FROM reels WHERE id=?',edited)).toEqual({title:'Owner title',status:'brouillon',video_url:'/uploads/owner.mp4'});
    expect(db.get('SELECT id FROM reels WHERE id=?',deleted)).toBeUndefined();
    expect(fs.readdirSync(path.join(root,'backups')).filter(name=>name.startsWith('pre-reel-test-pack-'))).toEqual(backups);
  } finally {db?.close();fs.rmSync(root,{recursive:true,force:true});}
});
it('does not mark or partly install a failed batch, and preserves preexisting rows',()=>{
  const db=new QatafoDatabase(':memory:');
  try {
    db.run('DELETE FROM applied_data_migrations WHERE key=?',REEL_TEST_PACK_MIGRATION);
    for(const entry of manifest.entries) db.run('DELETE FROM reels WHERE id=?',entry.id);
    const before=db.all('SELECT * FROM reels ORDER BY id');
    expect(()=>installReelTestPack(db,()=>{throw new Error('backup failed');})).toThrow('backup failed');
    expect(db.all('SELECT * FROM reels ORDER BY id')).toEqual(before);
    const store={get:db.get.bind(db),transaction:db.transaction.bind(db),run:(sql:string,...args:any[])=>{
      const result=db.run(sql,...args);
      if(sql.startsWith('INSERT INTO reels')) throw new Error('after write');
      return result;
    }};
    expect(()=>installReelTestPack(store,()=>{})).toThrow('after write');
    expect(db.all('SELECT * FROM reels ORDER BY id')).toEqual(before);
    expect(db.get('SELECT 1 FROM applied_data_migrations WHERE key=?',REEL_TEST_PACK_MIGRATION)).toBeUndefined();
    expect(installReelTestPack(db,()=>{})).toBe(true);
  } finally {db.close();}
});
