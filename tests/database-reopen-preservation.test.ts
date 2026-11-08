import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { QatafoDatabase } from '../src/db/database';
import { ensureCrmSchema } from '../src/crm/bootstrap';
import { inspectDatabaseSchema } from '../src/db/schemaInspection';
it('preserves selected CMS edits, migration markers and CRM schema across repeated file-backed opens', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zayrovi-reopen-'));
  const file = path.join(root, 'fixture.sqlite');
  let db: QatafoDatabase | undefined;
  try {
    db = new QatafoDatabase(file);
    ensureCrmSchema(db);
    const stamp = '2026-11-05T00:00:00.000Z';
    db.run(`INSERT INTO settings(id,category,setting_key,setting_value,value_type,label,updated_at)
      VALUES ('reopen_fixture','GENERAL','reopen_fixture','retained','STRING','Fixture',?)`, stamp);
    db.run("UPDATE home_featured_settings SET enabled=0,cta_label='Owner fixture CTA',updated_at=? WHERE id='global'", stamp);
    db.run("UPDATE lens_hero_settings SET bg_image='/uploads/fixture-preserved.jpg',title='Owner fixture title',updated_at=?", stamp);
    const read = () => ({
      setting: db!.get("SELECT setting_value,updated_at FROM settings WHERE id='reopen_fixture'"),
      featured: db!.all('SELECT * FROM home_featured_settings'),
      lens: db!.all('SELECT id,bg_image,title,updated_at FROM lens_hero_settings'),
      migrations: db!.all('SELECT key,applied_at FROM applied_data_migrations ORDER BY key'),
    });
    const expected = read();
    expect(expected.featured.length).toBeGreaterThan(0);
    expect(expected.lens.length).toBeGreaterThan(0);
    const schema = inspectDatabaseSchema(db);
    for (let i = 0; i < 2; i++) {
      db.close(); db = new QatafoDatabase(file); ensureCrmSchema(db);
      expect(read()).toEqual(expected);
      expect(inspectDatabaseSchema(db)).toEqual(schema);
      expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
      expect(db.get('PRAGMA integrity_check')).toEqual({ integrity_check: 'ok' });
    }
  } finally { db?.close(); fs.rmSync(root, { recursive: true, force: true }); }
}, 20_000);
