/**
 * AYROVI ERP Core — File access (P0 security).
 *
 * Documents are read from disk only through this helper. It is deliberately
 * small and boring: the authorization decision belongs to the route, this file
 * only guarantees that (a) the path came from the database and not from the
 * client, (b) it sits inside an allowed private root, (c) every read — granted
 * or refused — lands in the single audit system as ACCESS / ACCESS_DENIED.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import type { QatafoDatabase } from '../db/database';
import { writeAuditEvent } from '../erp-core/audit';
import { resolvePrivateFile } from '../erp-core/storage';

export interface ServeDocumentInput {
  /** Absolute path exactly as stored in the database row. */
  filePath: unknown;
  allowedRoots: string[];
  module: string;
  resourceType: string;
  resourceId: string | null;
  contentType?: string | null;
  /** Suggested download name; sanitized, never taken from user input verbatim. */
  filename?: string | null;
}

export interface ServeDocumentResult {
  served: boolean;
  status: number;
  code: string;
  message: string;
}

/** Streams a private document, or returns the refusal the caller should answer with. */
export function servePrivateDocument(
  db: QatafoDatabase,
  req: Request,
  res: Response,
  input: ServeDocumentInput,
): ServeDocumentResult {
  const actor = (req as Request & { admin?: { id?: string; name?: string } }).admin;
  const customer = (req as Request & { customer?: { id?: string; email?: string } }).customer;
  const actorName = actor?.name || customer?.email || 'Client';
  const auditWrite = (action: 'DOWNLOAD' | 'ACCESS_DENIED', detail: Record<string, unknown>) => {
    try {
      writeAuditEvent(db, {
        actor: { id: actor?.id ?? customer?.id ?? null, name: actorName, ipAddress: req.ip || null },
        action, module: input.module, resource: { type: input.resourceType, id: input.resourceId },
        newValues: detail,
        context: {
          requestId: (req as Request & { requestId?: string }).requestId ?? null,
          sessionId: (actor?.id ?? customer?.id) ? String(actor?.id ?? customer?.id).slice(0, 80) : null,
          userAgent: (String(req.headers['user-agent'] || '').slice(0, 300) || null),
        },
      });
    } catch { /* an audit failure must never turn into a file leak or a 500 */ }
  };

  const resolved = resolvePrivateFile(input.filePath, input.allowedRoots);
  if (!resolved.ok) {
    const code = resolved.code === 'OUTSIDE_ALLOWED_ROOT' ? 'OUTSIDE_ALLOWED_ROOT' : 'NOT_FOUND';
    auditWrite('ACCESS_DENIED', { reason: code, message: resolved.message, resourceType: input.resourceType });
    return {
      served: false,
      status: code === 'OUTSIDE_ALLOWED_ROOT' ? 403 : 404,
      code: code === 'OUTSIDE_ALLOWED_ROOT' ? 'DOCUMENT_PATH_NOT_ALLOWED' : 'DOCUMENT_NOT_FOUND',
      message: resolved.message,
    };
  }

  res.setHeader('Content-Type', String(input.contentType || 'application/octet-stream'));
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (input.filename) {
    const safe = String(input.filename).replace(/[^\w.-]/g, '').slice(0, 120) || 'document';
    res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
  } else {
    // Inline rendering for images (payment proofs) keeps the current admin UX.
    res.setHeader('Content-Disposition', 'inline');
  }
  fs.createReadStream(String(resolved.absolutePath)).pipe(res);
  auditWrite('DOWNLOAD', { sizeBytes: resolved.sizeBytes });
  return { served: true, status: 200, code: 'SERVED', message: '' };
}

/** True when the absolute path is inside `root` (used by legacy guards). */
export function isInsideRoot(absolutePath: string, root: string): boolean {
  if (!absolutePath || !root) return false;
  return path.resolve(absolutePath).startsWith(path.resolve(root) + path.sep);
}
