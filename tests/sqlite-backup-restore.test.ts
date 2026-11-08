import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { QatafoDatabase } from '../src/db/database';
const cleanEnvironment = () => Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('BACKUP_') && key!=='DATABASE_PATH'));
const run=(script: string, args: string[], env: NodeJS.ProcessEnv)=>spawnSync(process.execPath,[script,...args],{cwd:process.cwd(),env,encoding:'utf8',timeout:30_000});
it('backs up committed WAL content, verifies an isolated restore and preserves business rows on application reopen',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ayrovi-backup-test-'));
  const sourcePath=path.join(root,'source.sqlite'), backupDir=path.join(root,'backups');
  let db: QatafoDatabase | undefined, restored: QatafoDatabase | undefined;
  try {
    db=new QatafoDatabase(sourcePath);
    db.run('PRAGMA wal_autocheckpoint=0');
    const stamp='2026-11-05T00:00:00.000Z';
    db.run("INSERT INTO settings(id,category,setting_key,setting_value,value_type,label,updated_at) VALUES ('backup_fixture','GENERAL','backup_fixture','Owner setting','STRING','Fixture',?)",stamp);
    db.run("UPDATE home_featured_settings SET enabled=0,cta_label='Backup owner CTA',updated_at=? WHERE id='global'",stamp);
    db.run("INSERT INTO products(id,name,status,final_price,created_at,updated_at) VALUES ('backup_product','Backup product','ACTIVE',79.5,?,?)",stamp,stamp);
    db.run("INSERT INTO customer_accounts(id,display_name,status,created_at,updated_at) VALUES ('backup_account','Backup owner','ACTIVE',?,?)",stamp,stamp);
    const publisher=db.get<any>('SELECT id FROM story_publishers LIMIT 1').id;
    db.run('INSERT INTO publication_follows(account_id,publisher_id,created_at) VALUES (?,?,?)','backup_account',publisher,stamp);
    // Disposable cache must be scrubbed from the backup, not from the source.
    db.run("INSERT INTO lens_analysis_cache(image_hash,result_json,model,created_at) VALUES ('backup_fixture','private OCR fixture','test',?)",stamp);
    const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';
    const tables=db.all<{name:string}>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map(row=>row.name);
    const expected=Object.fromEntries(tables.filter(name=>name!=='lens_analysis_cache').map(name=>[name,db!.all(`SELECT * FROM ${quote(name)}`).map(row=>JSON.stringify(row)).sort()]));
    const selected=()=>({settings:db!.get("SELECT * FROM settings WHERE id='backup_fixture'"),featured:db!.all('SELECT * FROM home_featured_settings'),migrations:db!.all('SELECT * FROM applied_data_migrations ORDER BY key')});
    const productBefore=db.get("SELECT * FROM products WHERE id='backup_product'");
    const followsBefore=db.all("SELECT * FROM publication_follows WHERE account_id='backup_account'");
    const before=selected(), cacheBefore=db.all('SELECT * FROM lens_analysis_cache');
    expect(fs.statSync(sourcePath+'-wal').size).toBeGreaterThan(0);
    const env={...cleanEnvironment(),DATABASE_PATH:sourcePath,BACKUP_DIR:backupDir};
    const backup=run('scripts/backup-sqlite.mjs',[],env);
    expect(backup.status,backup.stderr).toBe(0);
    const report=JSON.parse(backup.stdout);
    expect(report).toMatchObject({success:true,integrity:'ok',foreignKeyViolations:0,external:null,removed:0});
    expect(selected()).toEqual(before);
    expect(db.all('SELECT * FROM lens_analysis_cache')).toEqual(cacheBefore);
    const verified=run('scripts/verify-sqlite-backup.mjs',[report.backup],cleanEnvironment());
    expect(verified.status,verified.stderr).toBe(0);
    expect(JSON.parse(verified.stdout)).toMatchObject({success:true,applicationBootTested:false,uploadsVerified:false});
    const copyPath=path.join(root,'restored.sqlite');
    const snapshot=new Database(report.backup,{readonly:true,fileMustExist:true});
    try {await snapshot.backup(copyPath);} finally {snapshot.close();}
    const raw=new Database(copyPath,{readonly:true,fileMustExist:true});
    try {
      for(const [name,rows] of Object.entries(expected)) expect(raw.prepare(`SELECT * FROM ${quote(name)}`).all().map(row=>JSON.stringify(row)).sort(),name).toEqual(rows);
      expect(raw.prepare('SELECT COUNT(*) n FROM lens_analysis_cache').get()).toEqual({n:0});
    } finally {raw.close();}
    for(let i=0;i<2;i++) {
      restored=new QatafoDatabase(copyPath);
      expect(restored.get("SELECT * FROM settings WHERE id='backup_fixture'")).toEqual(before.settings);
      expect(restored.all('SELECT * FROM home_featured_settings')).toEqual(before.featured);
      expect(restored.all('SELECT * FROM applied_data_migrations ORDER BY key')).toEqual(before.migrations);
      expect(restored.get("SELECT * FROM products WHERE id='backup_product'")).toEqual(productBefore);
      expect(restored.all("SELECT * FROM publication_follows WHERE account_id='backup_account'")).toEqual(followsBefore);
      expect(restored.all('PRAGMA foreign_key_check')).toEqual([]);
      expect(restored.get('PRAGMA integrity_check')).toEqual({integrity_check:'ok'});
      restored.close();restored=undefined;
    }
  } finally {restored?.close();db?.close();fs.rmSync(root,{recursive:true,force:true});}
},40_000);
it('rejects absent/corrupt backups and FK violations without creating a missing input',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ayrovi-invalid-backup-'));
  try {
    const missing=path.join(root,'missing.sqlite');
    expect(run('scripts/verify-sqlite-backup.mjs',[missing],cleanEnvironment()).status).not.toBe(0);
    expect(fs.existsSync(missing)).toBe(false);
    const corrupt=path.join(root,'corrupt.sqlite');fs.writeFileSync(corrupt,'not a database');
    expect(run('scripts/verify-sqlite-backup.mjs',[corrupt],cleanEnvironment()).status).not.toBe(0);
    const bad=path.join(root,'bad.sqlite');const raw=new Database(bad);
    raw.pragma('foreign_keys=OFF');raw.exec('CREATE TABLE parent(id TEXT PRIMARY KEY);CREATE TABLE child(parent_id TEXT REFERENCES parent(id));INSERT INTO child VALUES (\'missing\');');raw.close();
    expect(run('scripts/verify-sqlite-backup.mjs',[bad],cleanEnvironment()).status).not.toBe(0);
    const backupDir=path.join(root,'backups');fs.mkdirSync(backupDir);
    const old=path.join(backupDir,'ayrovi-old.sqlite');fs.writeFileSync(old,'retained');fs.utimesSync(old,0,0);
    const result=run('scripts/backup-sqlite.mjs',[],{...cleanEnvironment(),DATABASE_PATH:bad,BACKUP_DIR:backupDir});
    expect(result.status).not.toBe(0);
    expect(fs.readFileSync(old,'utf8')).toBe('retained');
    expect(fs.readdirSync(backupDir)).toEqual(['ayrovi-old.sqlite']);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
