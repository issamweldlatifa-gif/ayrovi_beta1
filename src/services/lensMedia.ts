/**
 * LENS — média de la section d'accueil (vidéo ou image).
 *
 * Deux provenances possibles, choisies depuis CONTENU → LENS dans le Dashboard :
 *   1. un fichier vidéo déposé (MP4/WebM/MOV) → écrit sur le disque public ;
 *   2. une URL externe (YouTube, Vimeo ou fichier .mp4/.webm HTTPS) → aucun stockage.
 *
 * Le Dashboard ne fait confiance à aucune chaîne saisie : l'URL est réécrite vers
 * un domaine d'intégration connu (youtube-nocookie / player.vimeo) avant d'atteindre
 * le navigateur, ce qui évite d'injecter une iframe arbitraire dans la page publique.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';

/** 32 Mo — suffisant pour une boucle produit courte, garde-fou contre les abus. */
export const LENS_VIDEO_MAX_BYTES = 32 * 1024 * 1024;

const ALLOWED_VIDEO_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'video/ogg',
]);

const ALLOWED_VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogv', '.mkv']);

const VIDEOS_DIR = path.resolve(process.cwd(), 'data/uploads/lens');

export interface StoredLensVideo {
  url: string;
  bytes: number;
  mime: string;
}

/**
 * Enregistre une vidéo téléversée dans l'arbre public (`data/uploads/lens`).
 * Le fichier est écrit tel quel — pas de ré-encodage côté serveur — mais le type
 * MIME ET l'extension sont vérifiés, et le nom est régénéré (jamais celui du client).
 */
export async function storeLensVideo(file: Express.Multer.File | undefined): Promise<StoredLensVideo> {
  if (!file || !file.buffer || !file.buffer.length) throw new Error('Aucun fichier vidéo reçu.');
  if (file.size > LENS_VIDEO_MAX_BYTES) {
    throw new Error(`Vidéo trop lourde (maximum ${Math.round(LENS_VIDEO_MAX_BYTES / (1024 * 1024))} Mo).`);
  }
  const mime = String(file.mimetype || '').toLowerCase().split(';')[0].trim();
  const originalExt = path.extname(String(file.originalname || '')).toLowerCase();
  if (!ALLOWED_VIDEO_MIME.has(mime) && !ALLOWED_VIDEO_EXT.has(originalExt)) {
    throw new Error('Format non supporté — utilisez MP4, WebM ou MOV.');
  }
  // L'extension retenue vient d'une liste fermée, jamais du nom fourni par le client.
  const ext = mime.includes('webm') ? '.webm'
    : mime.includes('quicktime') ? '.mov'
      : mime.includes('ogg') ? '.ogv'
        : '.mp4';
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
  const fileName = `lens-${randomUUID().replace(/-/g, '').slice(0, 16)}-${Date.now().toString(36)}${ext}`;
  fs.writeFileSync(path.join(VIDEOS_DIR, fileName), file.buffer);
  return { url: `/uploads/lens/${fileName}`, bytes: file.size, mime: mime || 'video/mp4' };
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);

export type LensVideoKind = 'youtube' | 'vimeo' | 'file';

export interface ResolvedLensVideo {
  kind: LensVideoKind;
  /** URL d'intégration sûre (iframe) pour YouTube/Vimeo, ou l'URL du fichier. */
  src: string;
}

function youtubeId(url: URL): string {
  const host = url.hostname.toLowerCase();
  if (host.endsWith('youtu.be')) return url.pathname.replace(/^\/+/, '').split('/')[0] || '';
  const v = url.searchParams.get('v');
  if (v) return v;
  const parts = url.pathname.split('/').filter(Boolean);
  // /embed/<id> · /shorts/<id> · /v/<id>
  const marker = parts.findIndex((p) => p === 'embed' || p === 'shorts' || p === 'v');
  return marker > -1 ? (parts[marker + 1] || '') : '';
}

function vimeoId(url: URL): string {
  const parts = url.pathname.split('/').filter(Boolean);
  const digits = parts.find((p) => /^\d+$/.test(p));
  return digits || '';
}

/**
 * Valide et normalise une URL de vidéo saisie dans le Dashboard.
 * Retourne `null` pour une chaîne vide (champ simplement non renseigné).
 * Lève une erreur explicite pour toute URL non reconnue — plutôt que de laisser
 * le navigateur charger une origine imprévue.
 */
export function resolveLensVideoUrl(raw: unknown): ResolvedLensVideo | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Lien vidéo invalide — utilisez une URL https:// complète.'); }
  if (url.protocol !== 'https:') throw new Error('Lien vidéo invalide — seules les URL https:// sont acceptées.');

  const host = url.hostname.toLowerCase();
  if (YOUTUBE_HOSTS.has(host)) {
    const id = youtubeId(url);
    if (!/^[\w-]{6,32}$/.test(id)) throw new Error('Lien YouTube illisible — utilisez le format youtube.com/watch?v=…');
    return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}` };
  }
  if (VIMEO_HOSTS.has(host)) {
    const id = vimeoId(url);
    if (!/^\d{5,15}$/.test(id)) throw new Error('Lien Vimeo illisible — utilisez le format vimeo.com/123456789');
    return { kind: 'vimeo', src: `https://player.vimeo.com/video/${id}` };
  }
  // Fichier direct : l'extension doit être vidéo.
  if (!ALLOWED_VIDEO_EXT.has(path.extname(url.pathname).toLowerCase())) {
    throw new Error('Lien vidéo non reconnu — YouTube, Vimeo ou un fichier .mp4/.webm en https.');
  }
  return { kind: 'file', src: url.toString() };
}
