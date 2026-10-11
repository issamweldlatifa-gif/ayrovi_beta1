/**
 * Module Hero — logique pure (sans base) : validation, statut, fusion, fenêtre de publication.
 */
import { describe, expect, it } from 'vitest';
import {
  EMPTY_VALUES, inPublicationWindow, liveValues, mergeSlides, slideStatus, toPublicCards,
  validateSlideValues, type DraftRow, type SlideValues,
} from '../src/services/heroSlideDrafts';

const NOW = Date.parse('2026-10-10T12:00:00Z');
const ISO = (offsetHours: number) => new Date(NOW + offsetHours * 3600e3).toISOString();

const VALID = {
  image: '/uploads/visuel.jpg', title: 'Mode homme', cta: 'Découvrir',
  destination_type: 'CAMPAIGN', bg_mode: 'auto', display_order: 10, active: true,
};

const values = (over: Partial<SlideValues> = {}): SlideValues => ({ ...EMPTY_VALUES, ...VALID, ...over } as SlideValues);

describe('validateSlideValues', () => {
  it('une carte complète est valide et normalisée', () => {
    const { values: v, errors } = validateSlideValues({ ...VALID, title: '  Mode homme  ' });
    expect(errors).toEqual({});
    expect(v.title).toBe('Mode homme');
    expect(v.active).toBe(1);
    expect(v.destination_type).toBe('CAMPAIGN');
  });

  it('image obligatoire, et seulement un chemin téléversé ou une URL https', () => {
    expect(validateSlideValues({ ...VALID, image: '' }).errors.image).toBeTruthy();
    expect(validateSlideValues({ ...VALID, image: 'C:\\photo.jpg' }).errors.image).toBeTruthy();
    expect(validateSlideValues({ ...VALID, image: 'https://cdn.exemple.tn/a.jpg' }).errors.image).toBeUndefined();
  });

  it('titre français obligatoire, bornes de longueur', () => {
    expect(validateSlideValues({ ...VALID, title: '   ' }).errors.title).toBeTruthy();
    expect(validateSlideValues({ ...VALID, title: 'x'.repeat(81) }).errors.title).toBeTruthy();
    expect(validateSlideValues({ ...VALID, subtitle: 'x'.repeat(161) }).errors.subtitle).toBeTruthy();
  });

  it('destination : type fermé, valeur exigée quand le type la demande', () => {
    expect(validateSlideValues({ ...VALID, destination_type: 'PAGE_LIBRE' }).errors.destination_type).toBeTruthy();
    expect(validateSlideValues({ ...VALID, destination_type: 'PRODUCT', destination_value: '' }).errors.destination_value).toBeTruthy();
    expect(validateSlideValues({ ...VALID, destination_type: 'PRODUCT', destination_value: 'prd_1' }).errors.destination_value).toBeUndefined();
  });

  it('lien externe : http(s) uniquement, jamais un schéma libre', () => {
    const bad = validateSlideValues({ ...VALID, destination_type: 'EXTERNAL', destination_value: 'javascript:alert(1)' });
    expect(bad.errors.destination_value).toBeTruthy();
    const good = validateSlideValues({ ...VALID, destination_type: 'EXTERNAL', destination_value: 'https://ayrovi.tn/promo' });
    expect(good.errors.destination_value).toBeUndefined();
  });

  it('fond manuel : couleur hexadécimale obligatoire', () => {
    expect(validateSlideValues({ ...VALID, bg_mode: 'manual', bg_color: '' }).errors.bg_color).toBeTruthy();
    expect(validateSlideValues({ ...VALID, bg_mode: 'manual', bg_color: '#1B4D8A' }).errors.bg_color).toBeUndefined();
    expect(validateSlideValues({ ...VALID, bg_color: 'bleu' }).errors.bg_color).toBeTruthy();
  });

  it('active accepte booléen, 0/1 et chaînes de formulaire', () => {
    expect(validateSlideValues({ ...VALID, active: false }).values.active).toBe(0);
    expect(validateSlideValues({ ...VALID, active: 0 }).values.active).toBe(0);
    expect(validateSlideValues({ ...VALID, active: 'on' }).values.active).toBe(1);
    expect(validateSlideValues({ ...VALID, active: '0' }).values.active).toBe(0);
  });

  it('fenêtre de publication : dates valides et fin après début', () => {
    expect(validateSlideValues({ ...VALID, published_from: 'pas-une-date' }).errors.published_from).toBeTruthy();
    const reversed = validateSlideValues({ ...VALID, published_from: ISO(5), published_to: ISO(1) });
    expect(reversed.errors.published_to).toBeTruthy();
    const ok = validateSlideValues({ ...VALID, published_from: ISO(1), published_to: ISO(5) });
    expect(ok.errors).toEqual({});
  });

  it('mise à jour partielle : les champs absents gardent leur valeur de base', () => {
    const base = values({ title: 'Ancien', subtitle: 'Gardé' });
    const { values: v } = validateSlideValues({ title: 'Nouveau' }, base);
    expect(v.title).toBe('Nouveau');
    expect(v.subtitle).toBe('Gardé');
  });

  it('position : entier, borné', () => {
    expect(validateSlideValues({ ...VALID, display_order: -1 }).errors.display_order).toBeTruthy();
    expect(validateSlideValues({ ...VALID, display_order: 10000 }).errors.display_order).toBeTruthy();
    expect(validateSlideValues({ ...VALID, display_order: '20' }).values.display_order).toBe(20);
  });
});

describe('slideStatus', () => {
  const now = NOW;
  it('publiée et ouverte ⇒ PUBLISHED ; désactivée ⇒ DISABLED', () => {
    expect(slideStatus(values(), null, true, now)).toBe('PUBLISHED');
    expect(slideStatus(values({ active: 0 }), null, true, now)).toBe('DISABLED');
  });
  it('fenêtre future ⇒ SCHEDULED ; fenêtre close ⇒ EXPIRED', () => {
    expect(slideStatus(values({ published_from: ISO(2) }), null, true, now)).toBe('SCHEDULED');
    expect(slideStatus(values({ published_to: ISO(-2) }), null, true, now)).toBe('EXPIRED');
  });
  it('brouillons : NEW_DRAFT, MODIFIED, DELETING', () => {
    expect(slideStatus(values(), 'CREATE', false, now)).toBe('NEW_DRAFT');
    expect(slideStatus(values(), 'UPDATE', true, now)).toBe('MODIFIED');
    expect(slideStatus(values(), 'DELETE', true, now)).toBe('DELETING');
  });
});

describe('mergeSlides — ce que verra le visiteur', () => {
  const live = [
    { id: 'a', ...liveValues(values({ title: 'A', display_order: 10 })), palette: '{"background":"#111111"}' },
    { id: 'b', ...liveValues(values({ title: 'B', display_order: 20 })), palette: '{"background":"#222222"}' },
  ];
  const draft = (over: Partial<DraftRow>): DraftRow => ({
    id: 'x', change_type: 'UPDATE', ...values(), created_at: '', updated_at: '', updated_by: '', ...over,
  } as DraftRow);

  it('un brouillon UPDATE remplace les valeurs affichées (aperçu) sans toucher au publié', () => {
    const drafts = new Map([['a', draft({ id: 'a', title: 'A modifié', change_type: 'UPDATE' })]]);
    const merged = mergeSlides(live as any, drafts, NOW);
    expect(merged.find((s) => s.id === 'a')?.values.title).toBe('A modifié');
    expect(merged.find((s) => s.id === 'a')?.status).toBe('MODIFIED');
  });

  it('une carte CREATE apparaît dans la liste admin mais pas dans le publié', () => {
    const drafts = new Map([['new1', draft({ id: 'new1', change_type: 'CREATE', title: 'Nouvelle', display_order: 15 })]]);
    const merged = mergeSlides(live as any, drafts, NOW);
    expect(merged.map((s) => s.id)).toEqual(['a', 'new1', 'b']);
    expect(merged.find((s) => s.id === 'new1')?.liveId).toBeNull();
  });

  it('une image remplacée en brouillon ne garde pas la palette périmée', () => {
    const drafts = new Map([['a', draft({ id: 'a', image: '/uploads/nouvelle.jpg', change_type: 'UPDATE' })]]);
    const merged = mergeSlides(live as any, drafts, NOW);
    expect(merged.find((s) => s.id === 'a')?.palette).toBeNull();
    const kept = mergeSlides(live as any, new Map(), NOW);
    expect(kept.find((s) => s.id === 'a')?.palette).toContain('#111111');
  });

  it('une carte DELETE reste visible en admin (statut) mais est exclue de la publication', () => {
    const drafts = new Map([['b', draft({ id: 'b', change_type: 'DELETE' })]]);
    const merged = mergeSlides(live as any, drafts, NOW);
    expect(merged.find((s) => s.id === 'b')?.status).toBe('DELETING');
  });
});

describe('inPublicationWindow', () => {
  it('vide = toujours ouverte ; bornes incluses', () => {
    expect(inPublicationWindow({ published_from: '', published_to: '' }, NOW)).toBe(true);
    expect(inPublicationWindow({ published_from: ISO(0), published_to: '' }, NOW)).toBe(true);
    expect(inPublicationWindow({ published_from: '', published_to: ISO(0) }, NOW)).toBe(true);
    expect(inPublicationWindow({ published_from: ISO(0.001), published_to: '' }, NOW)).toBe(false);
    expect(inPublicationWindow({ published_from: '', published_to: ISO(-0.001) }, NOW)).toBe(false);
  });
});

describe('toPublicCards — contrat visiteur', () => {
  // Faux accès base : toutes les cibles existent.
  const db = { get: () => ({ id: 'ok' }), all: () => [] } as any;
  const row = (id: string, over: Partial<SlideValues> = {}) => ({ id, values: values(over), palette: '{"background":"#123456","dominant":"#123456","luminance":0.2}' });

  it('sert les cartes actives, ouvertes, avec une image et une destination valide', () => {
    const cards = toPublicCards(db, [row('ok1'), row('off', { active: 0 }), row('noimg', { image: '' })], NOW, 6);
    expect(cards.map((c) => c.id)).toEqual(['ok1']);
    expect(cards[0].background).toBe('#123456');
  });

  it('une destination invalide ou une fenêtre close ne sont jamais servies', () => {
    const cards = toPublicCards(db, [
      row('bad', { destination_type: 'EXTERNAL', destination_value: 'ftp://x' }),
      row('closed', { published_to: ISO(-1) }),
    ], NOW, 6);
    expect(cards).toEqual([]);
  });

  it('fond manuel : la couleur choisie remplace la palette', () => {
    const [card] = toPublicCards(db, [row('m', { bg_mode: 'manual', bg_color: '#ABCDEF' })], NOW, 6);
    expect(card.background).toBe('#ABCDEF');
  });

  it('plafond de cartes respecté', () => {
    const many = Array.from({ length: 8 }, (_, i) => row(`c${i}`));
    expect(toPublicCards(db, many, NOW, 3)).toHaveLength(3);
  });
});
