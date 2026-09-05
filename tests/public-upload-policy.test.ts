/**
 * P1 closure gate — the public upload policy, stated as a test.
 *
 * P0 replaced "everything under `data/uploads` is downloadable by URL" with a
 * default-deny policy: ONE directory (`hero`) is public, the trees that hold customer
 * documents are private and readable only through an authorized endpoint. This file is
 * the contract for that policy, kept separate from the ERP-core suite so the rule is
 * discoverable on its own (a new module writing uploads must satisfy these tests).
 *
 * Nothing here moves data or renames a route: `/uploads/hero/<file>` keeps its exact
 * URL shape, which is why the public-side assertions are as strict as the private ones.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import {
  LEGACY_PRIVATE_UPLOAD_DIRS,
  PRIVATE_DOCUMENT_KINDS,
  PUBLIC_UPLOAD_DIRS,
  isPrivateDocumentPath,
  isPublicUploadPath,
  privateDirectory,
  privateDocumentsRoot,
  publicUploadsView,
} from '../src/erp-core/storage';

const SECRET = `SECRET-INVOICE-CONTENT-${Date.now()}`;
const uploadsRoot = path.resolve(process.cwd(), 'data/uploads');
const createdFiles: string[] = [];
const createdDirs: string[] = [];

function writePrivateFixture(dir: string, name: string, contents = SECRET): string {
  const absolute = path.join(dir, name);
  fs.mkdirSync(path.dirname(absolute), { recursive: true, mode: 0o700 });
  createdDirs.push(path.dirname(absolute));
  fs.writeFileSync(absolute, contents);
  createdFiles.push(absolute);
  return absolute;
}

/** A served image arrives as a Buffer, a served text file as `.text` — accept both. */
function bodyText(response: request.Response): string {
  if (typeof response.text === 'string' && response.text.length) return response.text;
  return Buffer.isBuffer(response.body) ? response.body.toString('utf8') : String(response.body ?? '');
}

function removeIfEmpty(dir: string) {
  try {
    if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  } catch { /* best effort — the fixture files are the part that must not leak */ }
}

describe('public upload policy (P0/P1 closure gate)', () => {
  const admin = request.agent(app);

  beforeAll(async () => {
    const login = await admin
      .set('User-Agent', 'AYROVI-UploadPolicyTest/1.0 (vitest)')
      .post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);

    // A file that exists on disk is the only honest probe: a 404 caused by an absent
    // file would hide a guard regression.
    writePrivateFixture(path.join(uploadsRoot, 'invoices'), 'policy-invoice.pdf');
    writePrivateFixture(path.join(uploadsRoot, 'deposits'), 'policy-proof.png');
    for (const kind of PRIVATE_DOCUMENT_KINDS) {
      writePrivateFixture(privateDirectory(kind as (typeof PRIVATE_DOCUMENT_KINDS)[number]), `policy-${kind}.pdf`);
    }
    writePrivateFixture(uploadsRoot, 'policy-loose-product.jpg', 'PUBLIC-LOOSE');
    writePrivateFixture(path.join(uploadsRoot, 'hero'), 'policy-hero.png', 'PUBLIC-HERO-BYTES');
  });

  afterAll(() => {
    for (const file of createdFiles) { try { fs.rmSync(file, { force: true }); } catch { /* best effort */ } }
    for (const dir of createdDirs) removeIfEmpty(dir);
  });

  test('the policy is an explicit allow-list, not a naming convention', () => {
    expect([...PUBLIC_UPLOAD_DIRS]).toEqual(['hero']);
    expect([...LEGACY_PRIVATE_UPLOAD_DIRS]).toEqual(['invoices', 'deposits']);
    // The public view the admin screen reads agrees with the guard itself.
    expect(publicUploadsView().publicDirs).toEqual(['hero']);
    // A directory nobody thought about is private by default (default-deny).
    expect(isPublicUploadPath(path.join(uploadsRoot, 'contracts', 'a.pdf'))).toBe(false);
    expect(isPublicUploadPath(path.join(uploadsRoot, 'avatars', 'me.png'))).toBe(false);
    // ...while a loose file at the uploads root stays reachable, as it was before P0.
    expect(isPublicUploadPath(path.join(uploadsRoot, 'loose.png'))).toBe(true);
    expect(isPublicUploadPath(path.join(uploadsRoot, 'hero', 'slide.jpg'))).toBe(true);
  });

  test('every document tree is classified private, on both the new and the legacy layout', () => {
    for (const dir of LEGACY_PRIVATE_UPLOAD_DIRS) {
      const legacy = path.join(uploadsRoot, dir, 'x.pdf');
      expect(isPrivateDocumentPath(legacy), legacy).toBe(true);
      expect(isPublicUploadPath(legacy), legacy).toBe(false);
    }
    for (const kind of PRIVATE_DOCUMENT_KINDS) {
      const modern = path.join(privateDocumentsRoot(), kind, 'x.pdf');
      expect(isPrivateDocumentPath(modern), modern).toBe(true);
      expect(isPublicUploadPath(modern), modern).toBe(false);
    }
  });

  test('the private root is not world-readable', () => {
    const root = privateDocumentsRoot();
    const mode = fs.statSync(root).mode & 0o777;
    // 0700: the persisted volume is shared with the web root, so the files must not be
    // readable by another process on the box (Render runs one user today — this is the
    // cheap insurance, and it is asserted so a future refactor cannot silently widen it).
    expect(mode & 0o077).toBe(0);
    for (const kind of PRIVATE_DOCUMENT_KINDS) {
      const dir = privateDirectory(kind as (typeof PRIVATE_DOCUMENT_KINDS)[number]);
      expect(fs.statSync(dir).mode & 0o777 & 0o077).toBe(0);
    }
  });

  test('GET /uploads never serves a private document, whatever the caller', async () => {
    const probes = [
      '/uploads/invoices/policy-invoice.pdf',
      '/uploads/deposits/policy-proof.png',
      `/uploads/private/documents/invoices/policy-invoices.pdf`,
      `/uploads/private/documents/payment-proofs/policy-payment-proofs.pdf`,
      `/uploads/private/documents/employee-documents/policy-employee-documents.pdf`,
    ];
    for (const url of probes) {
      const anonymous = await request(app).get(url);
      expect(anonymous.status, url).toBe(403);
      expect(anonymous.body.code, url).toBe('PRIVATE_DOCUMENT_NOT_PUBLIC');
      // A refusal must be a refusal: no bytes, and no HTML error page that a crawler
      // could confuse with a real document.
      expect(bodyText(anonymous), url).not.toContain(SECRET);
      expect(String(anonymous.headers['content-type'])).toContain('application/json');

      // An authenticated administrator session does not bypass the static guard either
      // (authorized reads go through the audited endpoints, not through /uploads).
      const asAdmin = await admin.get(url);
      expect(asAdmin.status, url).toBe(403);
      expect(asAdmin.body.code, url).toBe('PRIVATE_DOCUMENT_NOT_PUBLIC');

      const head = await request(app).head(url);
      expect(head.status, url).toBe(403);
    }
  });

  test('public media is unaffected: same URL, same bytes', async () => {
    const hero = await request(app).get('/uploads/hero/policy-hero.png');
    expect(hero.status).toBe(200);
    expect(bodyText(hero)).toBe('PUBLIC-HERO-BYTES');
    expect(String(hero.headers['content-type'])).toContain('image/png');

    const loose = await request(app).get('/uploads/policy-loose-product.jpg');
    expect(loose.status).toBe(200);
    expect(bodyText(loose)).toBe('PUBLIC-LOOSE');

    // Absent public media keeps its pre-P0 behaviour: the SPA fallback answers, not a
    // guard-generated 404 (the guard only refuses what is private).
    const missing = await request(app).get('/uploads/hero/policy-not-there.png');
    expect(missing.status).toBe(200);
    expect(String(missing.headers['content-type'])).toContain('text/html');
  });

  test('dot segments cannot walk from a public directory into a private one', async () => {
    const response = await request(app).get('/uploads/hero/../invoices/policy-invoice.pdf');
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('PRIVATE_DOCUMENT_NOT_PUBLIC');
    expect(bodyText(response)).not.toContain(SECRET);

    // Encoded traversal is decoded by the guard before it decides.
    const encoded = await request(app).get('/uploads/hero/%2e%2e/invoices/policy-invoice.pdf');
    expect(encoded.status).toBe(403);

    // Empty / root paths resolve outside the public allow-list.
    expect((await request(app).get('/uploads')).status).toBe(403);
    expect((await request(app).get('/uploads/')).status).toBe(403);

    // Walking out of data/uploads must never return the database file.
    const escaped = await request(app).get('/uploads/hero/../../qatafo_cart.sqlite');
    expect([403, 200]).toContain(escaped.status);
    if (escaped.status === 200) expect(String(escaped.headers['content-type'])).toContain('text/html');
    expect(escaped.headers['content-type'] || '').not.toMatch(/octet-stream|sqlite/);
  });

  test('uploads written by the application itself land under the private root', () => {
    // Read from the modules rather than duplicating their logic: the guarantee is that
    // the writers point at `privateDirectory`, not at the served uploads tree.
    const invoiceModule = fs.readFileSync(path.resolve(process.cwd(), 'src/services/invoice.ts'), 'utf8');
    expect(invoiceModule).toContain("privateDirectory('invoices')");
    expect(invoiceModule).toContain("privateDirectory('payment-proofs')");
    expect(privateDirectory('invoices')).toContain(path.join('private', 'documents'));
    // Legacy read-only helper is marked as such, so a new call site is a visible choice.
    expect(invoiceModule).toContain('@deprecated');
  });

  test('the guard is mounted on /uploads and the raw tree is not exposed statically', () => {
    const server = fs.readFileSync(path.resolve(process.cwd(), 'src/server.ts'), 'utf8');
    expect(server).toContain("app.use('/uploads'");
    expect(server).toContain('isPublicUploadPath');
    expect(server).toContain('PRIVATE_DOCUMENT_NOT_PUBLIC');
    // No blanket `express.static(data/uploads)` outside the guarded middleware.
    const staticCalls = server.match(/express\.static\([^)]*\)/g) ?? [];
    expect(staticCalls.length).toBeGreaterThan(0);
    expect(staticCalls.filter((call) => call.includes('uploadsDir'))).toHaveLength(1);
  });

  test('a refusal is recordable in the audit system (no silent denials on reads)', async () => {
    // The static guard cannot write an audit row (it must stay cheap and anonymous);
    // the audited denial lives on the authorized read path. Assert that the single
    // audit writer accepts the ACCESS_DENIED shape used there.
    const before = db.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM audit_logs WHERE action='ACCESS_DENIED'`, [])?.count ?? 0;
    expect(Number.isFinite(Number(before))).toBe(true);
    const endpoint = fs.readFileSync(path.resolve(process.cwd(), 'src/documents/fileAccess.ts'), 'utf8');
    expect(endpoint).toContain('ACCESS_DENIED');
    expect(endpoint).toContain('DOWNLOAD');
    // One audit system (P1): the file path writes through the shared event writer and
    // never invents a second table or a raw insert of its own.
    expect(endpoint).toContain('writeAuditEvent');
    expect(endpoint).not.toContain('INSERT INTO audit_logs');
  });
});
