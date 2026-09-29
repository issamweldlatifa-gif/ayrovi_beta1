import { afterEach, describe, expect, test } from 'vitest';
import { QatafoDatabase } from '../src/db/database';
import { ensureBootstrapAdmin, verifyPassword } from '../src/admin/auth';

const envBefore = {
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  ADMIN_BOOTSTRAP_RESET: process.env.ADMIN_BOOTSTRAP_RESET,
  NODE_ENV: process.env.NODE_ENV,
};

afterEach(() => {
  for (const [key, value] of Object.entries(envBefore)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

describe('admin bootstrap recovery token', () => {
  test('consumes a reset token once and never reapplies it on restart', () => {
    process.env.NODE_ENV = 'test';
    process.env.ADMIN_EMAIL = 'first-admin@ayrovi.tn';
    process.env.ADMIN_PASSWORD = 'First-unique-password-2026!';
    delete process.env.ADMIN_BOOTSTRAP_RESET;
    const db = new QatafoDatabase(':memory:');
    try {
      ensureBootstrapAdmin(db);
      const initial = db.get<{ id: string; password_hash: string }>('SELECT id,password_hash FROM admin_users WHERE email=?', 'first-admin@ayrovi.tn')!;
      expect(verifyPassword('First-unique-password-2026!', initial.password_hash)).toBe(true);

      process.env.ADMIN_EMAIL = 'recovered-admin@ayrovi.tn';
      process.env.ADMIN_PASSWORD = 'Second-unique-password-2026!';
      process.env.ADMIN_BOOTSTRAP_RESET = 'f2c8325926175c4e1c02dcf848e9b7a4f2b26036f1e35c2ed37f9908b1b4de71';
      ensureBootstrapAdmin(db);
      const recovered = db.get<{ id: string; password_hash: string }>('SELECT id,password_hash FROM admin_users WHERE email=?', 'recovered-admin@ayrovi.tn')!;
      expect(recovered.id).toBe(initial.id);
      expect(verifyPassword('Second-unique-password-2026!', recovered.password_hash)).toBe(true);

      process.env.ADMIN_PASSWORD = 'Third-unique-password-2026!';
      ensureBootstrapAdmin(db);
      const afterRestart = db.get<{ password_hash: string }>('SELECT password_hash FROM admin_users WHERE id=?', initial.id)!;
      expect(verifyPassword('Second-unique-password-2026!', afterRestart.password_hash)).toBe(true);
      expect(verifyPassword('Third-unique-password-2026!', afterRestart.password_hash)).toBe(false);
      expect(db.get<{ count: number }>('SELECT COUNT(*) AS count FROM admin_bootstrap_reset_usage')?.count).toBe(1);
    } finally {
      db.close?.();
    }
  });
});
