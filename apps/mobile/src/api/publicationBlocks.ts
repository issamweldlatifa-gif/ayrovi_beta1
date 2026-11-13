/**
 * Blocs de la page Publication (modèles composés dans le CRM, 13/11/2026).
 * Contrat : `shared/publicationBlocks.ts` — lecture `GET /api/public/social/publication-blocks`.
 *
 * Lecture défensive : un bloc mal formé est écarté seul (la page reste lisible),
 * un produit incomplet disparaît de sa rangée, et un bloc qui n'a plus assez de
 * produits n'est pas affiché (même règle que le serveur).
 */
import {
  isPublicationBlockKind,
  isRenderablePublicationBlock,
  normalizeHexColor,
  PUBLICATION_PUBLISHER_ID,
  PUBLICATION_PUBLISHER_NAME,
  type PublicationBlockPublic,
} from '../../../../shared/publicationBlocks';
import { apiGetData, type RequestOptions } from './client';
import { ApiError } from './errors';
import { parseLinkedProduct, type LinkedProduct } from './linkedProduct';

export interface PublicationBlock extends Omit<PublicationBlockPublic, 'products'> {
  products: LinkedProduct[];
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

export function parsePublicationBlock(value: unknown): PublicationBlock | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = str(row.id);
  const kind = row.kind;
  const title = str(row.title).trim();
  if (!id || !isPublicationBlockKind(kind) || !title) return null;
  const bgColor = normalizeHexColor(row.bgColor);
  if (!bgColor) return null;
  const rawMedia = row.media as Record<string, unknown> | null | undefined;
  const mediaUrl = str(rawMedia?.url).trim();
  const mediaType: 'image' | 'video' | null = rawMedia?.type === 'video' ? 'video' : rawMedia?.type === 'image' ? 'image' : null;
  const media = mediaUrl && mediaType ? { type: mediaType, url: mediaUrl, poster: str(rawMedia?.poster).trim() } : null;
  const products = (Array.isArray(row.products) ? row.products : [])
    .map(parseLinkedProduct)
    .filter((product): product is LinkedProduct => product !== null);
  const block: PublicationBlock = {
    id,
    kind,
    title,
    subtitle: str(row.subtitle).trim(),
    bgColor,
    panelColor: normalizeHexColor(row.panelColor) ?? bgColor,
    sponsored: row.sponsored === true,
    media,
    products,
    publisher: {
      id: str((row.publisher as Record<string, unknown> | undefined)?.id).trim() || PUBLICATION_PUBLISHER_ID,
      name: str((row.publisher as Record<string, unknown> | undefined)?.name).trim() || PUBLICATION_PUBLISHER_NAME,
    },
  };
  return isRenderablePublicationBlock(block) ? block : null;
}

export function parsePublicationBlocks(value: unknown): PublicationBlock[] {
  if (!Array.isArray(value)) throw new ApiError('malformed', 'Invalid Publication blocks');
  const seen = new Set<string>();
  const blocks: PublicationBlock[] = [];
  for (const entry of value) {
    const block = parsePublicationBlock(entry);
    if (!block || seen.has(block.id)) continue;
    seen.add(block.id);
    blocks.push(block);
  }
  return blocks;
}

export async function fetchPublicationBlocks(options?: RequestOptions): Promise<PublicationBlock[]> {
  return parsePublicationBlocks(await apiGetData<unknown>('/api/public/social/publication-blocks', options));
}
