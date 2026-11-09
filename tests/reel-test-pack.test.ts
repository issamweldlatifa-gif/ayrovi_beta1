import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import express from 'express';
import request from 'supertest';
import { expect, it } from 'vitest';
import { QatafoDatabase } from '../src/db/database';
import { readPublishedSocial } from '../src/magazine/publicSocialReads';
import manifest from '../assets/media/reel-test-pack/cover-manifest.json';
const directory=path.resolve('assets/media/reel-test-pack');
const run=(file:string, apply=false)=>spawnSync(process.execPath,['scripts/install-reel-test-pack.mjs','--database',file,...(apply?['--apply']:[])],{encoding:'utf8',timeout:20_000});
it('ships five hashed licensed faststart MP4s and posters served with byte-range support',async()=>{
  expect(manifest.entries).toHaveLength(5);
  const app=express().use('/media/reel-test-pack',express.static(directory));
  for(const item of manifest.entries) {
    const bytes=fs.readFileSync(path.join(directory,item.file));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(item.sha256);
    expect(createHash('sha256').update(fs.readFileSync(path.join(directory,item.poster))).digest('hex')).toBe(item.posterSha256);
    expect(item.license).toBe('CC0-1.0');
    const atoms: string[]=[];let offset=0;
    while(offset+8<=bytes.length) {const size=bytes.readUInt32BE(offset);expect(size).toBeGreaterThanOrEqual(8);atoms.push(bytes.toString('ascii',offset+4,offset+8));offset+=size;}
    expect(offset).toBe(bytes.length);
    expect(atoms.indexOf('moov')).toBeGreaterThanOrEqual(0);
    expect(atoms.indexOf('moov')).toBeLessThan(atoms.indexOf('mdat'));
    const response=await request(app).get(item.videoUrl).set('Range','bytes=0-127');
    expect(response.status).toBe(206);expect(response.headers['content-type']).toContain('video/mp4');
    expect(response.headers['content-range']).toBe(`bytes 0-127/${bytes.length}`);
    expect(response.body).toEqual(bytes.subarray(0,128));
  }
});
it('defaults to dry run, backs up before opt-in insertion and preserves repeated/custom rows',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'reel-pack-'));const file=path.join(root,'test.sqlite');
  let db: QatafoDatabase | undefined;
  try {
    db=new QatafoDatabase(file);
    for(const entry of manifest.entries) db.run('DELETE FROM reels WHERE id=?',entry.id);
    const before=db.all('SELECT * FROM reels ORDER BY id');db.close();db=undefined;
    const dry=run(file);expect(dry.status,dry.stderr).toBe(0);expect(JSON.parse(dry.stdout)).toMatchObject({mode:'dry-run',pending:5,inserted:0,backup:null});
    db=new QatafoDatabase(file);expect(db.all('SELECT * FROM reels ORDER BY id')).toEqual(before);db.close();db=undefined;
    const applied=run(file,true);expect(applied.status,applied.stderr).toBe(0);const report=JSON.parse(applied.stdout);
    expect(report.inserted).toBe(5);expect(fs.existsSync(report.backup)).toBe(true);
    db=new QatafoDatabase(file);
    const page=readPublishedSocial(db,'reel',new Date().toISOString(),{limit:12});
    expect(page.items.filter(row=>manifest.entries.some(entry=>entry.id===row.id))).toHaveLength(5);
    expect(db.all('SELECT product_id FROM reels WHERE id LIKE ?', 'reel_test_pack_%').every(row=>row.product_id===null)).toBe(true);
    for(const row of before) expect(db.get('SELECT * FROM reels WHERE id=?',row.id)).toEqual(row);
    const id=manifest.entries[0].id;db.run("UPDATE reels SET title='Owner edited',status='brouillon' WHERE id=?",id);db.close();db=undefined;
    const repeated=run(file,true);expect(repeated.status,repeated.stderr).toBe(0);expect(JSON.parse(repeated.stdout)).toMatchObject({inserted:0,backup:null});
    db=new QatafoDatabase(file);expect(db.get('SELECT title,status FROM reels WHERE id=?',id)).toEqual({title:'Owner edited',status:'brouillon'});
    db.run("UPDATE reels SET video_url='/uploads/owner.mp4' WHERE id=?",id);db.close();db=undefined;
    const conflict=run(file,true);expect(conflict.status).not.toBe(0);expect(conflict.stderr).toContain('REEL_TEST_ID_CONFLICT');
    expect(run(path.join(root,'missing.sqlite'),true).status).not.toBe(0);expect(fs.existsSync(path.join(root,'missing.sqlite'))).toBe(false);
  } finally {db?.close();fs.rmSync(root,{recursive:true,force:true});}
},30_000);
