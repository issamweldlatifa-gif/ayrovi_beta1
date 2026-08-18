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

describe('customer notification lifecycle migration', () => {
  test('preserves legacy notifications and accepts all canonical commerce events', () => {
    const file = path.resolve(process.cwd(), 'data', `notification-migration-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
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
      CREATE TABLE customer_notifications (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
        type TEXT NOT NULL DEFAULT 'GENERAL' CHECK(type IN ('GENERAL','ORDER','ACCOUNT','PROMOTION')),
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        action_url TEXT NOT NULL DEFAULT '',
        read_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_customer_notifications_account ON customer_notifications(account_id, created_at DESC);
    `);
    legacy.prepare("INSERT INTO customer_accounts (id,display_name,status,created_at,updated_at) VALUES ('legacy-account','Legacy','ACTIVE',?,?)")
      .run(now, now);
    legacy.prepare("INSERT INTO customer_notifications (id,account_id,type,title,message,created_at) VALUES ('legacy-order','legacy-account','ORDER','Legacy','Preserved',?)")
      .run(now);
    legacy.close();

    const upgraded = new QatafoDatabase(file);
    try {
      expect(upgraded.get<any>("SELECT message FROM customer_notifications WHERE id='legacy-order'")?.message).toBe('Preserved');
      for (const type of ['PAYMENT', 'PROOF', 'SHIPPING', 'INVOICE']) {
        expect(() => upgraded.run(
          'INSERT INTO customer_notifications (id,account_id,type,title,message,created_at) VALUES (?,?,?,?,?,?)',
          `notification-${type.toLowerCase()}`, 'legacy-account', type, type, 'Canonical lifecycle event', now,
        )).not.toThrow();
      }
      expect(upgraded.get<any>("SELECT COUNT(*) count FROM customer_notifications WHERE account_id='legacy-account'")?.count).toBe(5);
    } finally {
      upgraded.close();
    }
  });
});
