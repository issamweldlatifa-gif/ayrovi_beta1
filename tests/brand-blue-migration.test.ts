import { describe, test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { QatafoDatabase } from '../src/db/database';
import { brandAccentColor, enforceBrandIdentity, enforceLegacyTheme } from '../shared/identityPolicy';

describe('blue brand 4.3 — existing installations', () => {
  test('read adapters migrate the retired purple family while preserving business content and custom colours', () => {
    expect(brandAccentColor('#571EF6')).toBe('#0113B5');
    expect(brandAccentColor('#C5B2F4')).toBe('#CCD0F0');
    expect(brandAccentColor('#123456')).toBe('#123456');
    expect(enforceLegacyTheme({ accent: '#571EF6' })).toMatchObject({ accent: '#0113B5' });
    const input = { sections: [{ backgroundColor: '#C5B2F4', title: 'Produit violet #571EF6', enabled: false }] };
    expect(enforceBrandIdentity(input).sections).toEqual([{ backgroundColor: '#CCD0F0', title: 'Produit violet #571EF6', enabled: false }]);
    expect(input.sections[0].backgroundColor).toBe('#C5B2F4');
  });

  test('persisted CMS palette is migrated once, preserving copy, metadata and subsequent admin edits', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zayrovi-blue-'));
    const file = path.join(dir, 'brand.sqlite');
    let db: QatafoDatabase | undefined;
    try {
      db = new QatafoDatabase(file);
      const old = JSON.stringify({ accent: '#571EF6', nested: [{ focus: '#926DF9', soft: '#C5B2F4', hover: '#491ACC' }], title: 'Violet #571EF6', custom: '#123456', enabled: false });
      db.run("INSERT INTO settings (id,category,setting_key,setting_value,value_type,label,updated_at) VALUES ('blue-probe','DESIGN','blue_probe',?,'JSON','Palette probe','old')", old);
      db.run("UPDATE lens_hero_settings SET accent_color='#571EF6',bg_color='#C5B2F4' WHERE id='global'");
      db.run("DELETE FROM applied_data_migrations WHERE key='rebrand_blue_v1'");
      db.close(); db = new QatafoDatabase(file);
      expect(JSON.parse(db.get<any>("SELECT setting_value FROM settings WHERE id='blue-probe'").setting_value)).toEqual({ accent: '#0113B5', nested: [{ focus: '#737DD6', soft: '#CCD0F0', hover: '#031196' }], title: 'Violet #571EF6', custom: '#123456', enabled: false });
      expect(db.get<any>("SELECT accent_color FROM lens_hero_settings WHERE id='global'").accent_color).toBe('#0113B5');
      expect(db.get<any>("SELECT bg_color FROM lens_hero_settings WHERE id='global'").bg_color).toBe('#CCD0F0');
      db.run("UPDATE settings SET setting_value='admin-edited' WHERE id='blue-probe'");
      db.close(); db = new QatafoDatabase(file);
      expect(db.get<any>("SELECT setting_value FROM settings WHERE id='blue-probe'").setting_value).toBe('admin-edited');
    } finally { db?.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
