/**
 * AYROVI ERP Core — Storage (P0 security foundation).
 *
 * One rule, enforced in code: a document under the private root is NEVER
 * reachable through a public URL. Public media keeps its existing shape
 * (`/uploads/<file>` and `/uploads/hero/*`) so no persisted content changes.
 *
 * Layout on disk (same volume as SQLite, so the existing backup covers it):
 *
 *   <data>/uploads/            PUBLIC   images/videos for CMS (unchanged)
 *   <data>/uploads/hero/       PUBLIC   hero visuals (unchanged)
 *   <data>/uploads/invoices/   PRIVATE  LEGACY location — grandfathered as private
 *   <data>/uploads/deposits/   PRIVATE  LEGACY location — grandfathered as private
 *   <data>/private/documents/            new canonical private root
 *     ├── invoices/
 *     ├── payment-proofs/
 *     └── employee-documents/
 *
 * Legacy rows store ABSOLUTE paths (orders.invoice_path, payment_proofs.file_path),
 * which is exactly why the private root is resolved relative to DATABASE_PATH —
 * the same rule `src/services/invoice.ts` already uses — so old and new files
 * live on the persisted volume either way.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Sub-paths that are always private, wherever they appear under `uploads/`. */
export const LEGACY_PRIVATE_UPLOAD_DIRS = ['invoices', 'deposits'] as const;
/** Sub-paths explicitly published under `/uploads`. */
export const PUBLIC_UPLOAD_DIRS = ['hero'] as const;

export interface PublicUploadsView {
  root: string;
  publicDirs: string[];
}

export function dataDirectory(): string {
  // Mirrors services/invoice.ts: uploads sit next to the database file so the
  // persisted Render disk (and scripts/backup-sqlite.mjs) always cover both.
  const dbPath = process.env.DATABASE_PATH || './data/qatafo_cart.sqlite';
  if (dbPath.trim() === ':memory:') return path.resolve(process.cwd(), 'data');
  return path.dirname(path.resolve(dbPath));
}

/**
 * Create a private directory AND assert its mode.
 *
 * `mkdir(mode)` only applies the mode to directories it actually creates: when the
 * target (or a parent) already exists — from an earlier process, a deploy script, or
 * another module — the mode of whoever got there first wins. A tree that holds
 * invoices, transfer proofs and employee documents must not inherit an accident, so
 * the mode is repaired on every use. Idempotent and cheap (one stat, a chmod only
 * when the mode drifted). On a read-only volume the chmod is skipped and the URL
 * guard in src/server.ts stays the primary control.
 */
function ensurePrivateDirectory(dir: string): string {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    if ((fs.statSync(dir).mode & 0o777) !== 0o700) fs.chmodSync(dir, 0o700);
  } catch {
    /* read-only or restricted volume: never fail a request over local permissions */
  }
  return dir;
}

function privateDocumentsRootPath(): string {
  const data = dataDirectory();
  return ensurePrivateDirectory(path.join(data, 'private', 'documents'));
}

/** Private document kinds. A new kind needs no other change than this list. */
export const PRIVATE_DOCUMENT_KINDS = ['invoices', 'payment-proofs', 'employee-documents'] as const;
export type PrivateDocumentKind = (typeof PRIVATE_DOCUMENT_KINDS)[number];

export function privateDocumentsRoot(): string {
  return privateDocumentsRootPath();
}

export function privateDirectory(kind: PrivateDocumentKind): string {
  const root = privateDocumentsRoot();
  const dir = path.join(root, kind);
  return ensurePrivateDirectory(dir);
}

/** True when an absolute path lives inside the private documents root or a legacy private dir. */
export function isPrivateDocumentPath(absolutePath: unknown): boolean {
  const target = typeof absolutePath === 'string' ? path.resolve(absolutePath) : '';
  if (!target) return false;
  const data = dataDirectory();
  const privateRoot = path.join(data, 'private');
  if (target === privateRoot || target.startsWith(privateRoot + path.sep)) return true;
  return LEGACY_PRIVATE_UPLOAD_DIRS.some((dir) => {
    const legacy = path.join(data, 'uploads', dir);
    return target.startsWith(legacy + path.sep);
  });
}

/**
 * Can this absolute path be reached through `/uploads`?
 * Only files directly in `uploads/` or in an explicitly public sub-dir.
 */
export function isPublicUploadPath(absolutePath: unknown): boolean {
  const target = typeof absolutePath === 'string' ? path.resolve(absolutePath) : '';
  if (!target || isPrivateDocumentPath(target)) return false;
  const root = path.resolve(dataDirectory(), 'uploads');
  if (!target.startsWith(root + path.sep)) return false;
  const relative = path.relative(root, target);
  const first = relative.split(path.sep)[0] ?? '';
  if (relative.includes('..')) return false;
  return !first.endsWith('.sqlite') && (relative.includes(path.sep) ? (PUBLIC_UPLOAD_DIRS as readonly string[]).includes(first) : true);
}

/** Public URL for a file written in the public uploads tree ('' when not publicable). */
export function publicUploadUrl(filename: string): string {
  const safe = String(filename || '').replace(/^[/\\]+/, '');
  return safe && !safe.includes('..') && !safe.includes(path.sep) ? `/uploads/${safe}` : '';
}

export function publicUploadsView(): PublicUploadsView {
  return { root: path.resolve(dataDirectory(), 'uploads'), publicDirs: [...PUBLIC_UPLOAD_DIRS] };
}

/**
 * Server-side read of a stored document, with the authorization decision already
 * applied by the caller. Returns a structured failure instead of throwing so the
 * caller can both answer the request and record the audit event.
 */
export type DocumentDenialCode = 'NOT_FOUND' | 'OUTSIDE_ALLOWED_ROOT' | 'PRIVATE_PATH';

export interface ReadDocumentResult {
  ok: boolean;
  code: DocumentDenialCode | null;
  message: string;
  absolutePath: string | null;
  sizeBytes: number | null;
}

const deny = (code: DocumentDenialCode, message: string): ReadDocumentResult => ({ ok: false, code, message, absolutePath: null, sizeBytes: null });

/**
 * Resolves a stored document path. The path always comes from a database row —
 * never from a request parameter — and must sit inside one of `allowedRoots`.
 */
export function resolvePrivateFile(absolutePath: unknown, allowedRoots: string[]): ReadDocumentResult {
  const raw = typeof absolutePath === 'string' ? absolutePath.trim() : '';
  if (!raw) return deny('NOT_FOUND', 'Fichier indisponible.');
  const absolute = path.resolve(raw);
  const permitted = allowedRoots.filter(Boolean).some((root) => absolute.startsWith(path.resolve(root) + path.sep));
  if (!permitted) return deny('OUTSIDE_ALLOWED_ROOT', 'Chemin de document invalide.');
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return deny('NOT_FOUND', 'Fichier indisponible.');
  return { ok: true, code: null, message: '', absolutePath: absolute, sizeBytes: Number(fs.statSync(absolute).size) };
}

/** Roots from which invoice files may be read (new private root + grandfathered legacy dir). */
export function invoiceReadRoots(): string[] {
  return [privateDirectory('invoices'), path.join(path.resolve(dataDirectory(), 'uploads'), 'invoices')];
}

/** Roots from which deposit/transfer proofs may be read. */
export function paymentProofReadRoots(): string[] {
  return [privateDirectory('payment-proofs'), path.join(path.resolve(dataDirectory(), 'uploads'), 'deposits')];
}
