/**
 * Module Hero — cartes en BROUILLON puis publication (table `hero_slide_drafts`).
 *
 * Modèle :
 *  • `hero_slides` = ce que l'application mobile LIT (publié). Inchangé.
 *  • `hero_slide_drafts` = ce que l'opérateur ÉDITE. Une ligne par carte modifiée :
 *      CREATE  → carte nouvelle, absente de `hero_slides` ;
 *      UPDATE  → carte publiée, avec des changements en attente ;
 *      DELETE  → carte publiée, à retirer à la publication.
 *  • Publier = appliquer les brouillons à `hero_slides` dans UNE transaction,
 *    puis vider les brouillons. Rien n'est visible par les visiteurs avant.
 *
 * Ce module est la seule source de : validation des champs, fusion brouillon /
 * publié, statut d'une carte, et carte publique (contrat `/api/public/hero-slides`).
 * L'API publique et l'aperçu Admin l'utilisent tous les deux : l'aperçu montre
 * donc exactement ce que verra le visiteur.
 */
import type { QatafoDatabase } from '../db/database';
import { heroDestinationConfig, heroDestinationHref, isValidExternalUrl } from '../../shared/heroDestinations';
import { isHexColor, parseHeroPalette, resolveMediaFilePath } from './heroPalette';
import fs from 'node:fs';

/* ── Champs éditables ─────────────────────────────────────────────────────── */

export const EDITABLE_FIELDS = [
  'image', 'video', 'title', 'title_ar', 'subtitle', 'subtitle_ar', 'cta', 'cta_ar',
  'destination_type', 'destination_value', 'bg_mode', 'bg_color',
  'display_order', 'active', 'published_from', 'published_to',
] as const;

export type EditableField = (typeof EDITABLE_FIELDS)[number];

export interface SlideValues {
  image: string;
  video: string;
  title: string;
  title_ar: string;
  subtitle: string;
  subtitle_ar: string;
  cta: string;
  cta_ar: string;
  destination_type: string;
  destination_value: string;
  bg_mode: 'auto' | 'manual';
  bg_color: string;
  display_order: number;
  active: 0 | 1;
  published_from: string;
  published_to: string;
}

export const LIMITS = {
  title: 80, subtitle: 160, cta: 40, destinationValue: 300, image: 300, displayOrder: 9999,
} as const;

export const EMPTY_VALUES: SlideValues = {
  image: '', video: '', title: '', title_ar: '', subtitle: '', subtitle_ar: '', cta: '', cta_ar: '',
  destination_type: '', destination_value: '', bg_mode: 'auto', bg_color: '',
  display_order: 0, active: 1, published_from: '', published_to: '',
};

export interface ValidationResult {
  values: SlideValues;
  /** Erreurs par champ (clé = nom de champ). Vide ⇒ valide. */
  errors: Partial<Record<EditableField, string>>;
}

/* ── Validation pure ──────────────────────────────────────────────────────── */

const text = (value: unknown): string => String(value ?? '').trim();

/** Booléen tolérant : JSON (true/false), formulaire ('1'/'true'/'on') ou SQLite (1/0). */
const truthy = (value: unknown): boolean => value === true || value === 1 || ['1', 'true', 'on', 'yes'].includes(String(value).trim().toLowerCase());

function parseDate(raw: string): number | null {
  if (!raw) return null;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : null;
}

/**
 * Normalise puis valide une carte. `base` = valeurs courantes (mise à jour partielle) ;
 * un champ absent de `input` garde sa valeur de base.
 */
export function validateSlideValues(input: Record<string, unknown>, base: SlideValues = EMPTY_VALUES): ValidationResult {
  const pick = <K extends EditableField>(key: K): SlideValues[K] => (
    key in input ? (input[key] as SlideValues[K]) : base[key]
  );
  const values: SlideValues = {
    image: text(pick('image')),
    video: text(pick('video')),
    title: text(pick('title')),
    title_ar: text(pick('title_ar')),
    subtitle: text(pick('subtitle')),
    subtitle_ar: text(pick('subtitle_ar')),
    cta: text(pick('cta')),
    cta_ar: text(pick('cta_ar')),
    destination_type: text(pick('destination_type')).toUpperCase(),
    destination_value: text(pick('destination_value')),
    bg_mode: text(pick('bg_mode')) === 'manual' ? 'manual' : 'auto',
    bg_color: text(pick('bg_color')),
    display_order: Math.trunc(Number(pick('display_order')) || 0),
    active: truthy(pick('active')) ? 1 : 0,
    published_from: text(pick('published_from')),
    published_to: text(pick('published_to')),
  };
  const errors: ValidationResult['errors'] = {};

  if (!values.image) errors.image = 'Une image est obligatoire.';
  else if (values.image.length > LIMITS.image) errors.image = 'Chemin d’image trop long.';
  else if (!/^(\/uploads\/|https:\/\/)/.test(values.image)) errors.image = 'Image non reconnue : téléversez un fichier.';

  if (!values.title) errors.title = 'Le titre (français) est obligatoire.';
  else if (values.title.length > LIMITS.title) errors.title = `Titre limité à ${LIMITS.title} caractères.`;
  if (values.title_ar.length > LIMITS.title) errors.title_ar = `Titre limité à ${LIMITS.title} caractères.`;
  if (values.subtitle.length > LIMITS.subtitle) errors.subtitle = `Description limitée à ${LIMITS.subtitle} caractères.`;
  if (values.subtitle_ar.length > LIMITS.subtitle) errors.subtitle_ar = `Description limitée à ${LIMITS.subtitle} caractères.`;
  if (values.cta.length > LIMITS.cta) errors.cta = `Bouton limité à ${LIMITS.cta} caractères.`;
  if (values.cta_ar.length > LIMITS.cta) errors.cta_ar = `Bouton limité à ${LIMITS.cta} caractères.`;

  const destination = heroDestinationConfig(values.destination_type);
  if (!destination) errors.destination_type = 'Choisissez une destination.';
  else if (destination.needsValue && !values.destination_value) errors.destination_value = 'Cette destination exige une valeur.';
  else if (values.destination_value.length > LIMITS.destinationValue) errors.destination_value = 'Valeur trop longue.';
  else if (destination.id === 'EXTERNAL' && !isValidExternalUrl(values.destination_value)) {
    errors.destination_value = 'Le lien externe doit être une URL http(s) valide.';
  } else if (!errors.destination_type && !heroDestinationHref(values.destination_type, values.destination_value)) {
    errors.destination_value = 'Destination invalide.';
  }

  if (values.bg_mode === 'manual' && !isHexColor(values.bg_color)) {
    errors.bg_color = 'En fond manuel, indiquez une couleur hexadécimale (#rrggbb).';
  } else if (values.bg_color && !isHexColor(values.bg_color)) {
    errors.bg_color = 'Couleur hexadécimale attendue (#rrggbb).';
  }

  if (values.display_order < 0 || values.display_order > LIMITS.displayOrder) {
    errors.display_order = `Position entre 0 et ${LIMITS.displayOrder}.`;
  }

  const from = parseDate(values.published_from);
  const to = parseDate(values.published_to);
  if (values.published_from && from === null) errors.published_from = 'Date de début invalide.';
  if (values.published_to && to === null) errors.published_to = 'Date de fin invalide.';
  if (from !== null && to !== null && to <= from) errors.published_to = 'La fin doit être postérieure au début.';

  return { values, errors };
}

/**
 * Validation complète, y compris l'existence de la cible en base. Utilisée à la
 * sauvegarde d'un brouillon ET à la publication (la cible peut avoir disparu entre-temps).
 */
export function validateSlideForSave(db: QatafoDatabase, input: Record<string, unknown>, base: SlideValues = EMPTY_VALUES): ValidationResult {
  const result = validateSlideValues(input, base);
  if (!result.errors.destination_type && !result.errors.destination_value
    && !heroDestinationExists(db, result.values.destination_type, result.values.destination_value)) {
    result.errors.destination_value = 'Cible introuvable (arrivage ou produit absent).';
  }
  return result;
}

/**
 * Image disponible ? Un chemin `/uploads/…` doit exister sur le disque ; une URL
 * https est supposée joignable (pas de requête sortante depuis l'Admin).
 */
export function heroImageAvailable(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('https://')) return true;
  const filePath = resolveMediaFilePath(url);
  return Boolean(filePath && fs.existsSync(filePath));
}

/* ── Accès base : brouillons ──────────────────────────────────────────────── */

export type ChangeType = 'CREATE' | 'UPDATE' | 'DELETE';

export interface DraftRow extends SlideValues {
  id: string;
  change_type: ChangeType;
  created_at: string;
  updated_at: string;
  updated_by: string;
}

export function draftRowsById(db: QatafoDatabase): Map<string, DraftRow> {
  const rows = db.all<DraftRow>('SELECT * FROM hero_slide_drafts');
  return new Map(rows.map((row) => [row.id, row]));
}

/** Valeurs d'une ligne publiée (`hero_slides`) dans la forme éditable. */
export function liveValues(row: any): SlideValues {
  return {
    image: String(row.image || ''),
    video: String(row.video || ''),
    title: String(row.title || ''),
    title_ar: String(row.title_ar || ''),
    subtitle: String(row.subtitle || ''),
    subtitle_ar: String(row.subtitle_ar || ''),
    cta: String(row.cta || ''),
    cta_ar: String(row.cta_ar || ''),
    destination_type: String(row.destination_type || ''),
    destination_value: String(row.destination_value || ''),
    bg_mode: row.bg_mode === 'manual' ? 'manual' : 'auto',
    bg_color: String(row.bg_color || ''),
    display_order: Number(row.display_order) || 0,
    active: row.active ? 1 : 0,
    published_from: String(row.published_from || ''),
    published_to: String(row.published_to || ''),
  };
}

/* ── Fusion : ce que verrait le visiteur après publication ─────────────────── */

export interface MergedSlide {
  id: string;
  /** Valeurs après publication (brouillon si présent, sinon publié). */
  values: SlideValues;
  palette: string | null;
  status: SlideStatus;
  /** Présente seulement si la carte existe dans `hero_slides`. */
  liveId: string | null;
  changeType: ChangeType | null;
}

export type SlideStatus =
  | 'PUBLISHED'      // en ligne, fenêtre ouverte
  | 'SCHEDULED'      // en ligne plus tard (published_from futur)
  | 'EXPIRED'        // fenêtre close
  | 'DISABLED'       // publiée mais désactivée
  | 'NEW_DRAFT'      // nouvelle carte, non publiée
  | 'MODIFIED'       // publiée, modifications en attente
  | 'DELETING';      // sera retirée à la publication

export function slideStatus(values: SlideValues, changeType: ChangeType | null, isLive: boolean, now: number): SlideStatus {
  if (changeType === 'DELETE') return 'DELETING';
  if (changeType === 'CREATE') return 'NEW_DRAFT';
  if (!isLive) return 'NEW_DRAFT';
  if (changeType === 'UPDATE') return 'MODIFIED';
  if (!values.active) return 'DISABLED';
  const from = parseDate(values.published_from);
  const to = parseDate(values.published_to);
  if (from !== null && from > now) return 'SCHEDULED';
  if (to !== null && to < now) return 'EXPIRED';
  return 'PUBLISHED';
}

/**
 * Vue admin : toutes les cartes (publiées + brouillons), dans l'ordre d'affichage
 * qu'elles auront après publication (les DELETE sont gardées pour le statut).
 */
export function mergeSlides(live: any[], drafts: Map<string, DraftRow>, now: number): MergedSlide[] {
  const merged: MergedSlide[] = [];
  const liveIds = new Set<string>();
  for (const row of live) {
    liveIds.add(String(row.id));
    const draft = drafts.get(String(row.id));
    const changeType = draft?.change_type ?? null;
    const live = liveValues(row);
    const values = draft && changeType !== 'DELETE' ? draft : live;
    // Image remplacée en brouillon : l'ancienne palette ne vaut plus. Elle est
    // recalculée à la publication ; l'aperçu n'affiche pas une couleur périmée.
    const imageChanged = values.image !== live.image;
    merged.push({
      id: String(row.id),
      values,
      palette: row.palette && !imageChanged ? String(row.palette) : null,
      status: slideStatus(values, changeType, true, now),
      liveId: String(row.id),
      changeType,
    });
  }
  for (const draft of drafts.values()) {
    if (liveIds.has(draft.id) || draft.change_type !== 'CREATE') continue;
    merged.push({
      id: draft.id, values: draft, palette: null,
      status: slideStatus(draft, 'CREATE', false, now),
      liveId: null, changeType: 'CREATE',
    });
  }
  return merged.sort((a, b) => a.values.display_order - b.values.display_order || a.id.localeCompare(b.id));
}

/* ── Carte publique (contrat `/api/public/hero-slides`) ───────────────────── */

export interface PublicHeroCard {
  id: string;
  image: string;
  video: string;
  title: string;
  titleAr: string;
  subtitle: string;
  subtitleAr: string;
  cta: string;
  ctaAr: string;
  displayOrder: number;
  href: string;
  destinationType: string;
  background: string;
  dominant: string;
  luminance: number;
}

/** Destination existante ? (arrivage / produit vérifiés en base). */
export function heroDestinationExists(db: QatafoDatabase, type: string, value: string): boolean {
  const kind = String(type || '').trim().toUpperCase();
  if (kind === 'COLLECTION' && !db.get<any>('SELECT id FROM arrivals WHERE id=?', value)) return false;
  if (kind === 'PRODUCT' && !db.get<any>('SELECT id FROM products WHERE id=?', value)) return false;
  return true;
}

/** Fenêtre de publication : vide = toujours ; sinon bornes incluses. */
export function inPublicationWindow(values: Pick<SlideValues, 'published_from' | 'published_to'>, now: number): boolean {
  const from = parseDate(values.published_from);
  const to = parseDate(values.published_to);
  if (from !== null && from > now) return false;
  if (to !== null && to < now) return false;
  return true;
}

/**
 * Transforme des lignes (publiées OU fusionnées) en cartes publiques. Une carte
 * sans destination valide, sans image ou hors fenêtre n'est jamais servie.
 */
export function toPublicCards(
  db: QatafoDatabase,
  rows: Array<{ id: string; values: SlideValues; palette: string | null }>,
  now: number,
  maxCards: number,
): PublicHeroCard[] {
  const cards: PublicHeroCard[] = [];
  for (const { id, values, palette: rawPalette } of rows) {
    if (cards.length >= maxCards) break;
    if (!values.active || !values.image) continue;
    if (!inPublicationWindow(values, now)) continue;
    const href = heroDestinationHref(values.destination_type, values.destination_value);
    if (!href || !heroDestinationExists(db, values.destination_type, values.destination_value)) continue;
    const palette = parseHeroPalette(rawPalette);
    const manual = values.bg_color.trim();
    cards.push({
      id,
      image: values.image,
      video: values.video,
      title: values.title,
      titleAr: values.title_ar,
      subtitle: values.subtitle,
      subtitleAr: values.subtitle_ar,
      cta: values.cta,
      ctaAr: values.cta_ar,
      displayOrder: values.display_order,
      href,
      destinationType: values.destination_type,
      background: values.bg_mode === 'manual' && isHexColor(manual) ? manual : (palette?.background ?? ''),
      dominant: palette?.dominant ?? '',
      luminance: palette?.luminance ?? 0,
    });
  }
  return cards;
}

/** Lignes publiées, telles que la base les sert (ordre d'affichage puis id). */
export function publishedRows(db: QatafoDatabase): any[] {
  return db.all<any>('SELECT * FROM hero_slides ORDER BY display_order,id');
}

/** Aperçu = ce que verrait le visiteur si les brouillons étaient publiés. */
export function previewCards(db: QatafoDatabase, maxCards: number, now: number): PublicHeroCard[] {
  const merged = mergeSlides(publishedRows(db), draftRowsById(db), now)
    .filter((slide) => slide.changeType !== 'DELETE');
  return toPublicCards(db, merged.map((slide) => ({
    id: slide.id,
    values: slide.values,
    palette: slide.palette,
  })), now, maxCards);
}
