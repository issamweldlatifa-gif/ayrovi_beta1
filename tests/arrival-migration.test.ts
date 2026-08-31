import { afterEach, describe, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { QatafoDatabase } from '../src/db/database';

const roots: string[] = [];
afterEach(() => {
  while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('Arrival multi-store database migration', () => {
  test('creates and verifies a pre-DDL backup, migrates the legacy Store, and links existing sources/jobs/products', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ayrovi-arrival-migration-'));
    roots.push(root);
    const databasePath = path.join(root, 'legacy.sqlite');
    const legacy = new Database(databasePath);
    const now = '2026-08-30T12:00:00.000Z';
    legacy.exec(`
      CREATE TABLE customers (
        id TEXT PRIMARY KEY,name TEXT NOT NULL,phone TEXT NOT NULL UNIQUE,normalized_phone TEXT NOT NULL DEFAULT '',
        governorate TEXT NOT NULL DEFAULT '',address TEXT NOT NULL DEFAULT '',registered_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',updated_at TEXT NOT NULL
      );
      CREATE TABLE crm_stores (
        id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,updated_at TEXT NOT NULL
      );
      CREATE TABLE crm_arrivals (
        id TEXT PRIMARY KEY,name TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'DRAFT',confirmed_at TEXT,confirmed_by TEXT,
        created_at TEXT NOT NULL,updated_at TEXT NOT NULL
      );
      CREATE TABLE crm_arrival_clients (
        id TEXT PRIMARY KEY,arrival_id TEXT NOT NULL,customer_id TEXT NOT NULL,store_id TEXT,
        created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(arrival_id,customer_id)
      );
      CREATE TABLE crm_arrival_sources (
        id TEXT PRIMARY KEY,arrival_client_id TEXT NOT NULL,source_type TEXT NOT NULL,original_filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,byte_size INTEGER NOT NULL,source_hash TEXT NOT NULL,storage_key TEXT NOT NULL,
        last_job_id TEXT,uploaded_by TEXT,created_at TEXT NOT NULL,UNIQUE(arrival_client_id,source_hash)
      );
      CREATE TABLE crm_extraction_jobs (
        id TEXT PRIMARY KEY,source_id TEXT NOT NULL,arrival_client_id TEXT NOT NULL,strategy_key TEXT NOT NULL,state TEXT NOT NULL,
        progress_current INTEGER NOT NULL DEFAULT 0,progress_total INTEGER NOT NULL DEFAULT 0,products_extracted INTEGER NOT NULL DEFAULT 0,
        records_needing_review INTEGER NOT NULL DEFAULT 0,warning_codes TEXT NOT NULL DEFAULT '[]',error_code TEXT,error_message TEXT,
        attempt INTEGER NOT NULL DEFAULT 1,started_by TEXT,started_by_name TEXT NOT NULL DEFAULT 'Système',started_from_ip TEXT,
        started_at TEXT,completed_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
      );
      CREATE TABLE crm_extracted_products (
        id TEXT PRIMARY KEY,job_id TEXT,source_id TEXT NOT NULL,arrival_client_id TEXT NOT NULL,arrival_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,store_id TEXT NOT NULL,product_name TEXT,sku TEXT,reference TEXT,variant TEXT,color TEXT,quantity INTEGER,
        product_image_storage_key TEXT,source_type TEXT NOT NULL,source_reference TEXT NOT NULL,extraction_confidence REAL NOT NULL DEFAULT 0,
        extraction_status TEXT NOT NULL,field_evidence TEXT NOT NULL DEFAULT '{}',source_specific TEXT NOT NULL DEFAULT '[]',
        raw_extracted TEXT NOT NULL DEFAULT '{}',review_reasons TEXT NOT NULL DEFAULT '[]',manual_edits TEXT NOT NULL DEFAULT '{}',
        approved_at TEXT,approved_by TEXT,is_current INTEGER NOT NULL DEFAULT 0,superseded_at TEXT,superseded_by_job_id TEXT,
        created_at TEXT NOT NULL,updated_at TEXT NOT NULL
      );
    `);
    legacy.prepare(`INSERT INTO customers VALUES (?,?,?,?,?,?,?,?,?)`).run(
      'legacy_customer', 'Legacy Customer', '+21622111222', '22111222', 'Tunis', 'Legacy address', now, 'ACTIVE', now,
    );
    legacy.prepare('INSERT INTO crm_stores VALUES (?,?,?,?,?,?)').run('legacy_store', 'LEGACY', 'Legacy Store', 1, now, now);
    legacy.prepare('INSERT INTO crm_arrivals VALUES (?,?,?,?,?,?,?)').run('legacy_arrival', 'Legacy Arrival', 'REVIEW', null, null, now, now);
    legacy.prepare('INSERT INTO crm_arrival_clients VALUES (?,?,?,?,?,?)').run(
      'legacy_client', 'legacy_arrival', 'legacy_customer', 'legacy_store', now, now,
    );
    legacy.prepare(`INSERT INTO crm_arrival_sources
      (id,arrival_client_id,source_type,original_filename,mime_type,byte_size,source_hash,storage_key,last_job_id,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      'legacy_source', 'legacy_client', 'EMAIL', 'legacy.txt', 'text/plain', 10, 'legacy-hash', 'legacy/source.txt', 'legacy_job', now,
    );
    legacy.prepare(`INSERT INTO crm_extraction_jobs
      (id,source_id,arrival_client_id,strategy_key,state,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?)`).run('legacy_job', 'legacy_source', 'legacy_client', 'legacy-email-v1', 'COMPLETED', now, now);
    legacy.prepare(`INSERT INTO crm_extracted_products
      (id,job_id,source_id,arrival_client_id,arrival_id,customer_id,store_id,product_name,quantity,source_type,
       source_reference,extraction_status,is_current,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      'legacy_product', 'legacy_job', 'legacy_source', 'legacy_client', 'legacy_arrival', 'legacy_customer', 'legacy_store',
      'Legacy product', 1, 'EMAIL', 'legacy#1', 'EXTRACTED', 1, now, now,
    );
    legacy.close();

    const migrated = new QatafoDatabase(databasePath);
    const assignment = migrated.get<any>(`SELECT * FROM crm_arrival_client_stores
      WHERE arrival_client_id='legacy_client' AND store_id='legacy_store'`);
    expect(assignment).toBeTruthy();
    expect(migrated.get<any>("SELECT arrival_client_store_id FROM crm_arrival_sources WHERE id='legacy_source'").arrival_client_store_id).toBe(assignment.id);
    expect(migrated.get<any>("SELECT arrival_client_store_id FROM crm_extraction_jobs WHERE id='legacy_job'").arrival_client_store_id).toBe(assignment.id);
    expect(migrated.get<any>("SELECT arrival_client_store_id FROM crm_extracted_products WHERE id='legacy_product'").arrival_client_store_id).toBe(assignment.id);
    expect(migrated.all<any>('PRAGMA table_info(crm_arrival_clients)').map((column) => column.name)).toContain('display_alias');
    expect(migrated.get<any>('PRAGMA foreign_key_check')).toBeUndefined();
    const readiness = migrated.arrivalMultistoreMigrationReadiness();
    expect(readiness).toMatchObject({ ready: true, backupStatus: 'VERIFIED', backupId: expect.stringMatching(/^pre-arrival-multistore-/) });
    migrated.close();

    const backupDirectory = path.join(root, 'backups');
    const backups = fs.readdirSync(backupDirectory).filter((name) => name.startsWith('pre-arrival-multistore-') && name.endsWith('.sqlite'));
    expect(backups).toHaveLength(1);
    const backupPath = path.join(backupDirectory, backups[0]);
    expect(fs.statSync(backupPath).mode & 0o777).toBe(0o600);
    const backup = new Database(backupPath, { readonly: true, fileMustExist: true });
    expect(String(backup.pragma('integrity_check', { simple: true }))).toBe('ok');
    expect(backup.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='crm_arrival_client_stores'").get()).toBeUndefined();
    expect(backup.prepare("SELECT store_id FROM crm_arrival_clients WHERE id='legacy_client'").get()).toEqual({ store_id: 'legacy_store' });
    backup.close();

    // Simulate a concurrent/restarted process having persisted the weaker
    // marker after DDL. Startup must rediscover and fully verify the pre-DDL
    // snapshot rather than leaving production at NOT_REQUIRED.
    const weakened = new Database(databasePath);
    weakened.prepare(`UPDATE crm_schema_migrations SET backup_status='NOT_REQUIRED',backup_file=NULL
      WHERE migration_key='crm_arrival_multistore_v1'`).run();
    weakened.close();
    const reconciled = new QatafoDatabase(databasePath);
    expect(reconciled.arrivalMultistoreMigrationReadiness()).toMatchObject({
      ready: true,
      backupStatus: 'VERIFIED',
      backupId: backups[0],
    });
    reconciled.close();
  });

  test('does not treat a post-migration database copy as a pre-DDL backup', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ayrovi-arrival-fresh-'));
    roots.push(root);
    const databasePath = path.join(root, 'fresh.sqlite');
    const fresh = new QatafoDatabase(databasePath);
    expect(fresh.arrivalMultistoreMigrationReadiness()).toMatchObject({ ready: true, backupStatus: 'NOT_REQUIRED' });
    fresh.close();

    const backupDirectory = path.join(root, 'backups');
    fs.mkdirSync(backupDirectory);
    const postMigrationCopy = path.join(backupDirectory, 'pre-arrival-multistore-invalid.sqlite');
    fs.copyFileSync(databasePath, postMigrationCopy);

    const restarted = new QatafoDatabase(databasePath);
    expect(restarted.arrivalMultistoreMigrationReadiness()).toMatchObject({
      ready: true,
      backupStatus: 'NOT_REQUIRED',
      backupId: null,
    });
    restarted.close();
  });
});
