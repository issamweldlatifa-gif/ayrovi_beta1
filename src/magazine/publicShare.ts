import path from 'node:path';
import { dataDirectory, isPublicUploadPath } from '../erp-core/storage';
import type { QatafoDatabase } from '../db/database';
import { availableProductParams, availableProductSql } from '../catalogue/contentProducts';
import { REEL_DRIVE_TITLES } from '../../shared/reelDriveTitles';

type Reader = Pick<QatafoDatabase, 'get'>;
type ShareRow = { title: string; title_ar?: string; description?: string; description_ar?: string; image?: string };
export type ShareKind = 'product' | 'reel' | 'story';

function cardImage(value: string | undefined): string {
  if (!value || value.length > 2000 || /[\\\x00-\x20]/.test(value)) return '';
  try {
    // Only image formats usable by previews; never expose private upload paths.
    const url = new URL(value, 'https://media.invalid');
    const pathname = decodeURIComponent(url.pathname);
    if (url.protocol !== 'https:' || url.username || url.password || !/\.(?:avif|gif|jpe?g|png|webp)$/i.test(pathname) || /[\\%]/.test(pathname)) return '';
    if (pathname.startsWith('/uploads/') && !isPublicUploadPath(path.resolve(dataDirectory(), pathname.slice(1)))) return '';
    if (!value.startsWith('/') && !value.startsWith('https://')) return '';
    if (value.startsWith('//')) return '';
    return value;
  } catch { return ''; }
}

/** A projection of published content only. No account data or price commitments. */
export function readShareCard(db: Reader, kind: ShareKind, id: string, now: string): ShareRow | undefined {
  const row = selectCard(db, kind, id, now);
  return row && {
    title: row.title.slice(0, 200), title_ar: row.title_ar?.slice(0, 200),
    description: row.description?.slice(0, 500), description_ar: row.description_ar?.slice(0, 500), image: cardImage(row.image),
  };
}

function selectCard(db: Reader, kind: ShareKind, id: string, now: string): ShareRow | undefined {
  if (kind === 'product') return db.get<ShareRow>(`SELECT p.name AS title,p.description,p.image FROM products p
    WHERE p.id=? AND ${availableProductSql('p')}`, id, ...availableProductParams(now));
  if (kind === 'story') return db.get<ShareRow>(`SELECT title,title_ar,description,description_ar,
    CASE WHEN media_type='IMAGE' THEN media_url ELSE '' END AS image
    FROM stories WHERE id=? AND status='PUBLISHED' AND publish_at<=? AND (expires_at IS NULL OR expires_at>?)`, id, now, now);
  const row = db.get<ShareRow>(`SELECT title,description,poster_url AS image FROM reels
    WHERE id=? AND status='publie' AND publish_at<=?`, id, now);
  const seed = REEL_DRIVE_TITLES[id];
  if (row && seed && (row.title === seed.ar || row.title === seed.fr)) return { ...row, title: seed.fr, title_ar: seed.ar };
  return row;
}
