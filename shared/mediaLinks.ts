/**
 * Liens médias saisis dans l'Admin (Stories, Reels, Publications).
 *
 * Une seule règle, partagée par l'Admin (conversion immédiate à la saisie) et
 * par le serveur (validation à l'enregistrement) : le serveur ne stocke jamais
 * un lien qu'un téléphone ne saurait pas lire.
 *
 *  • lien local de l'application (`/media/…`, `/uploads/…`) → accepté tel quel ;
 *  • lien externe → https:// obligatoire ;
 *  • vidéo : un FICHIER (.mp4, .webm, .mov, .m4v, .ogv) ou un lecteur Cloudinary
 *    (`player.cloudinary.com/embed/…`) converti en fichier direct ; une page
 *    YouTube / Vimeo / réseau social n'est pas une vidéo lisible → refusée avec
 *    une explication, au lieu d'un média cassé publié sur l'application ;
 *  • image : toute adresse https (les CDN n'ont pas toujours d'extension), sauf pages de réseaux sociaux.
 */
export type MediaLinkKind = 'image' | 'video';

export type MediaLinkResult =
  | { ok: true; url: string; converted: boolean }
  | { ok: false; error: string };

const MAX_LENGTH = 500;
const VIDEO_EXTENSION = /\.(mp4|webm|mov|m4v|ogv|ogg)$/i;
const CLOUD_NAME = /^[A-Za-z0-9_-]+$/;

/** Pages de lecture et réseaux sociaux : ce ne sont jamais des fichiers vidéo. */
const PAGE_HOSTS = [
  'youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com', 'tiktok.com',
  'instagram.com', 'facebook.com', 'fb.watch', 'twitter.com', 'x.com',
];

const hostIs = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** Chaque segment du chemin est encodé, les « / » des dossiers Cloudinary sont conservés. */
const encodePath = (value: string) => value.split('/').map(encodeURIComponent).join('/');

export function normalizeMediaLink(raw: unknown, kind: MediaLinkKind): MediaLinkResult {
  const value = String(raw ?? '').trim();
  if (!value) return { ok: true, url: '', converted: false };
  if (value.length > MAX_LENGTH) return { ok: false, error: `Lien trop long (${MAX_LENGTH} caractères maximum).` };

  // Chemin local de l'application : rien à convertir.
  if (value.startsWith('/') && !value.startsWith('//')) return { ok: true, url: value, converted: false };

  let url: URL;
  try { url = new URL(value); } catch {
    return { ok: false, error: 'Lien invalide : collez une adresse complète commençant par https://' };
  }
  if (url.protocol !== 'https:') return { ok: false, error: 'Seules les adresses https:// sont acceptées.' };

  const host = url.hostname.toLowerCase();

  // Lecteur Cloudinary → fichier direct, lisible par l'application.
  if (host === 'player.cloudinary.com' && url.pathname.startsWith('/embed')) {
    if (kind === 'image') return { ok: false, error: 'Ce lien Cloudinary est un lecteur vidéo : pour une image, collez le lien direct de l’image.' };
    const cloud = url.searchParams.get('cloud_name') || '';
    const publicId = (url.searchParams.get('public_id') || '').replace(/^\/+/, '');
    if (!CLOUD_NAME.test(cloud) || !publicId) {
      return { ok: false, error: 'Lien Cloudinary incomplet : cloud_name ou public_id manquant.' };
    }
    const file = VIDEO_EXTENSION.test(publicId) ? publicId : `${publicId}.mp4`;
    return { ok: true, url: `https://res.cloudinary.com/${cloud}/video/upload/${encodePath(file)}`, converted: true };
  }

  if (PAGE_HOSTS.some((domain) => hostIs(host, domain))) {
    return kind === 'video'
      ? { ok: false, error: 'Ce lien est une page (YouTube, Vimeo, réseau social…), pas un fichier vidéo. Collez le lien direct du fichier (.mp4, .webm, .mov).' }
      : { ok: false, error: 'Ce lien est une page (réseau social, lecteur vidéo…), pas une image. Collez le lien direct de l’image.' };
  }

  if (kind === 'video') {
    if (!VIDEO_EXTENSION.test(url.pathname)) {
      return { ok: false, error: 'Ce lien ne pointe pas vers un fichier vidéo (.mp4, .webm, .mov). Pour Cloudinary, copiez le lien de la vidéo, pas celui du lecteur.' };
    }
  }

  return { ok: true, url: url.toString(), converted: false };
}
