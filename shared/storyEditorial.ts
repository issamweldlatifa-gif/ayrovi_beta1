import { normalizeMediaLink } from './mediaLinks';

export const STORY_EDITORIAL_LIMITS = { slides: 12, blocks: 20, secondsMin: 3, secondsMax: 60, json: 100_000 } as const;
export type StoryMediaKind = 'image' | 'video' | 'gif';
export type StorySlideLayout = 'cover' | 'inset' | 'product';
export type StoryArticleAction = 'read' | 'discover';
export interface StoryMedia { kind: StoryMediaKind; url: string; poster?: string }
export interface StoryLocalizedText { text: string; textAr?: string }
export interface StorySlide {
  layout: StorySlideLayout; media: StoryMedia; title: StoryLocalizedText; caption: StoryLocalizedText;
  seconds?: number; action?: StoryArticleAction; productId?: string;
}
export type StoryArticleBlock = { type: 'text'; content: StoryLocalizedText } | { type: 'image'; url: string; alt: StoryLocalizedText };
export interface StoryArticle {
  cover: string; title: StoryLocalizedText; intro: StoryLocalizedText; author: string;
  blocks: StoryArticleBlock[]; selectionTitle: StoryLocalizedText;
}
export interface StoryEditorial { version: 1; slides: StorySlide[]; article?: StoryArticle }

const obj = (x: unknown): Record<string, unknown> => {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw new Error('Composition Story invalide.');
  return x as Record<string, unknown>;
};
const text = (x: unknown, max: number): string => {
  if (x == null) return '';
  if (typeof x !== 'string' || x.length > max) throw new Error(`Texte invalide (maximum ${max} caractères).`);
  return x.trim();
};
const localized = (x: unknown, max: number): StoryLocalizedText => {
  const value = obj(x ?? {}), ar = text(value.textAr, max);
  return { text: text(value.text, max), ...(ar ? { textAr: ar } : {}) };
};
const url = (x: unknown, kind: 'image' | 'video', required = true): string => {
  const input = text(x, 500);
  if (!input && !required) return '';
  if (input.startsWith('/')) {
    const path = decodeURIComponent(input.split(/[?#]/, 1)[0]!);
    if (!/^\/(media|uploads)\//.test(path) || path.includes('\\') || path.split('/').some(part => part === '..' || part === '.')) {
      throw new Error('Choisissez un fichier dans /media ou /uploads.');
    }
  }
  const link = normalizeMediaLink(input, kind);
  if (!link.ok || !link.url) throw new Error('Ajoutez une URL média directe et valide.');
  return link.url;
};
export const isStoryId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,150}$/.test(value);

/** Parse the same bounded document in Admin, storage and the mobile API. No HTML or external CTA targets. */
export function normalizeStoryEditorial(input: unknown): StoryEditorial | null {
  if (input == null || input === '') return null;
  if (typeof input === 'string') {
    if (input.length > STORY_EDITORIAL_LIMITS.json) throw new Error('Composition Story trop longue.');
    input = JSON.parse(input);
    if (input == null) return null;
  }
  const doc = obj(input);
  if (doc.version !== 1 || !Array.isArray(doc.slides) || !doc.slides.length || doc.slides.length > STORY_EDITORIAL_LIMITS.slides) {
    throw new Error(`Ajoutez entre 1 et ${STORY_EDITORIAL_LIMITS.slides} écrans.`);
  }
  let article: StoryArticle | undefined;
  if (doc.article != null) {
    const story = obj(doc.article);
    if (!Array.isArray(story.blocks) || story.blocks.length > STORY_EDITORIAL_LIMITS.blocks) throw new Error('Blocs d’article invalides.');
    article = { cover: url(story.cover, 'image', false), title: localized(story.title, 180), intro: localized(story.intro, 1200),
      author: text(story.author, 100), selectionTitle: localized(story.selectionTitle, 150), blocks: story.blocks.map((raw): StoryArticleBlock => {
        const block = obj(raw);
        if (block.type === 'text') {
          const content = localized(block.content, 3000);
          if (!content.text && !content.textAr) throw new Error('Un paragraphe est vide.');
          return { type: 'text', content };
        }
        if (block.type === 'image') return { type: 'image', url: url(block.url, 'image'), alt: localized(block.alt, 180) };
        throw new Error('Type de bloc d’article invalide.');
      }) };
  }
  const slides = doc.slides.map((raw): StorySlide => {
    const slide = obj(raw), media = obj(slide.media);
    const { layout, action, seconds } = slide;
    if (layout !== 'cover' && layout !== 'inset' && layout !== 'product') throw new Error('Mise en page d’écran inconnue.');
    if (media.kind !== 'image' && media.kind !== 'gif' && media.kind !== 'video') throw new Error('Format de média inconnu.');
    if ((action != null && action !== 'read' && action !== 'discover') || (action && (!article || layout === 'product'))) throw new Error('Ce bouton nécessite un article et un écran éditorial.');
    const productId = text(slide.productId, 150);
    if (layout === 'product' ? !isStoryId(productId) : Boolean(productId)) throw new Error('Choisissez un produit pour chaque écran Produit.');
    if (seconds != null && (typeof seconds !== 'number' || !Number.isInteger(seconds) || seconds < STORY_EDITORIAL_LIMITS.secondsMin || seconds > STORY_EDITORIAL_LIMITS.secondsMax)) throw new Error('Durée : entre 3 et 60 secondes.');
    const poster = url(media.poster, 'image', false);
    return { layout, media: { kind: media.kind, url: url(media.url, media.kind === 'video' ? 'video' : 'image'), ...(poster ? { poster } : {}) },
      title: localized(slide.title, 180), caption: localized(slide.caption, 420), ...(typeof seconds === 'number' ? { seconds } : {}),
      ...(action === 'read' || action === 'discover' ? { action } : {}), ...(productId ? { productId } : {}) };
  });
  if (article && !slides.some(slide => slide.action)) throw new Error('Ajoutez un bouton Lire ou Découvrir pour ouvrir l’article.');
  const output: StoryEditorial = { version: 1, slides, ...(article ? { article } : {}) };
  if (JSON.stringify(output).length > STORY_EDITORIAL_LIMITS.json) throw new Error('Composition Story trop longue.');
  return output;
}

export function readStoryEditorial(input: unknown): StoryEditorial | null {
  try { return normalizeStoryEditorial(input); } catch { return null; }
}
