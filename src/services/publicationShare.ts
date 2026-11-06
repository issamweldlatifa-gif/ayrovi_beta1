/** Public share fallback for the existing native /publications route, not a new app entry. */
import type { QatafoDatabase } from '../db/database';
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
export function publicationShareHtml(db: QatafoDatabase, id: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) return null;
  const post = db.get<any>("SELECT id,title,subtitle,image_url,media_origin FROM publications WHERE id=? AND status='publie' AND publish_at<=?", id, new Date().toISOString());
  if (!post) return null;
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(post.title)} · ZAYROVI</title><meta name="description" content="${escape(post.subtitle)}"><style>body{margin:0;background:#fff;color:#0a0a0a;font:16px system-ui,sans-serif}main{max-width:640px;margin:24px auto;padding:0 16px}img{display:block;width:100%;max-height:75vh;object-fit:contain;border-radius:16px}a{display:inline-block;color:#0113b5;padding:14px 0}small{color:#666}</style><main><a href="/" aria-label="Accueil ZAYROVI">ZΛYROVI</a><p>Publication</p><img src="${escape(post.image_url)}" alt="${escape(post.title)}"><h1>${escape(post.title)}</h1><p>${escape(post.subtitle)}</p>${post.media_origin === 'generated' ? '<small>Création visuelle IA · ZAYROVI</small><br>' : ''}<a href="ayrovi://publications?post=${encodeURIComponent(id)}">Ouvrir dans l’application ZAYROVI</a></main></html>`;
}
