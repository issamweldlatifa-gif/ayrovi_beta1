import { afterEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { QatafoDatabase } from '../src/db/database';

const createdFiles: string[] = [];

afterEach(() => {
  for (const file of createdFiles.splice(0)) {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${file}${suffix}`, { force: true });
  }
});

describe('Facebook identity migration', () => {
  test('upgrades legacy GOOGLE/PHONE identity constraints without losing identities', () => {
    const file = path.resolve(process.cwd(), 'data', `facebook-migration-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
    createdFiles.push(file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const legacy = new Database(file);
    const now = new Date().toISOString();
    legacy.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE customer_accounts (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL DEFAULT '',
        email TEXT UNIQUE COLLATE NOCASE,
        phone TEXT UNIQUE,
        avatar_url TEXT NOT NULL DEFAULT '',
        email_verified_at TEXT,
        phone_verified_at TEXT,
        locale TEXT NOT NULL DEFAULT 'fr-TN',
        marketing_opt_in INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','BLOCKED','DELETED')),
        last_login_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE customer_auth_identities (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
        provider TEXT NOT NULL CHECK(provider IN ('PHONE','GOOGLE')),
        provider_subject TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(provider, provider_subject)
      );
      CREATE INDEX idx_customer_identities_account ON customer_auth_identities(account_id);
    `);
    legacy.prepare("INSERT INTO customer_accounts (id,display_name,status,created_at,updated_at) VALUES ('legacy-account','Legacy','ACTIVE',?,?)").run(now, now);
    legacy.prepare("INSERT INTO customer_auth_identities (id,account_id,provider,provider_subject,created_at) VALUES ('legacy-google','legacy-account','GOOGLE','google-subject',?)").run(now);
    legacy.close();

    const upgraded = new QatafoDatabase(file);
    try {
      expect(upgraded.get<any>("SELECT provider_subject FROM customer_auth_identities WHERE id='legacy-google'")?.provider_subject).toBe('google-subject');
      expect(() => upgraded.run("INSERT INTO customer_auth_identities (id,account_id,provider,provider_subject,created_at) VALUES ('facebook-id','legacy-account','FACEBOOK','facebook-subject',?)", now)).not.toThrow();
      expect(upgraded.get<any>("SELECT provider FROM customer_auth_identities WHERE id='facebook-id'")?.provider).toBe('FACEBOOK');
    } finally {
      upgraded.close();
    }
  });
});
