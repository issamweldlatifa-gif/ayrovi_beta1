/**
 * PLUSIEURS ARTICLES PAR CONTENU (lot F1) — règles pures.
 *
 * Le tiroir d'un Reel doit pouvoir afficher 3 à 4 cartes, alors que le contenu
 * ne portait qu'un seul `product_id`. `content_products` porte la liste ordonnée
 * et ces tests figent les quatre règles qui décident de ce que voit le client :
 *
 *  • l'ordre du tiroir est celui décidé par l'admin ;
 *  • jamais de doublon, même si la même ligne revient ;
 *  • un produit devenu non vendable disparaît — il ne casse jamais le contenu ;
 *  • le `product_id` historique n'est utilisé QUE si aucune ligne n'existe
 *    (compatibilité totale avec les contenus déjà en ligne).
 *
 * Aucune base de données ici : `mergePublicProducts` est pure, elle prend les
 * lignes déjà jointes. C'est volontaire — ces règles doivent rester lisibles et
 * vérifiables sans catalogue.
 */
import { describe, expect, test } from 'vitest';
import {
  CONTENT_KINDS,
  MAX_CONTENT_PRODUCTS,
  effectiveProductIds,
  isContentKind,
  mergePublicProducts,
  normalizeContentProductIds,
} from '../src/services/contentProducts';

/** Ligne telle que la produit le JOIN `content_products × products`. */
const linked = (contentId: string, productId: string, over: Record<string, any> = {}) => ({
  content_id: contentId,
  lp_id: productId,
  lp_name: `Article ${productId}`,
  lp_brand_name: 'Marque',
  lp_image: `/media/${productId}.jpg`,
  lp_status: 'ACTIVE',
  lp_final_price: 89,
  lp_stock_status: 'AVAILABLE',
  ...over,
});

/** Ligne du repli historique (contenu.product_id). */
const legacy = linked;

const reel = (id: string, over: Record<string, any> = {}) => ({ id, content_mode: 'shoppable', product_id: null, ...over });

describe('normalizeContentProductIds — forme de la liste', () => {
  test('nettoie, dédoublonne et garde l’ordre du formulaire', () => {
    expect(normalizeContentProductIds([' p2 ', 'p1', 'p2', '', null, 'p3'])).toEqual(['p2', 'p1', 'p3']);
  });

  test('accepte une chaîne seule (ancien formulaire) et le vide', () => {
    expect(normalizeContentProductIds('p1')).toEqual(['p1']);
    expect(normalizeContentProductIds(undefined)).toEqual([]);
    expect(normalizeContentProductIds({ product: 'p1' })).toEqual([]);
  });

  test('borne la liste : un tiroir n’est pas une boutique', () => {
    expect(MAX_CONTENT_PRODUCTS).toBe(8);
    const many = Array.from({ length: 20 }, (_, i) => `p${i}`);
    expect(normalizeContentProductIds(many)).toHaveLength(8);
    expect(normalizeContentProductIds(many)[0]).toBe('p0');
  });
});

describe('effectiveProductIds — la compatibilité en un seul endroit', () => {
  test('la liste liée gagne sur le produit historique', () => {
    expect(effectiveProductIds(['p2', 'p3'], 'p1')).toEqual(['p2', 'p3']);
  });

  test('sans ligne liée, le produit historique prend le relais', () => {
    expect(effectiveProductIds([], 'p1')).toEqual(['p1']);
    expect(effectiveProductIds([], '  p1  ')).toEqual(['p1']);
  });

  test('sans rien, aucune carte', () => {
    expect(effectiveProductIds([], null)).toEqual([]);
    expect(effectiveProductIds([], '')).toEqual([]);
  });
});

describe('mergePublicProducts — ce que le tiroir affiche', () => {
  test('respecte l’ordre des lignes liées', () => {
    const cards = mergePublicProducts([reel('r1')], [linked('r1', 'p3'), linked('r1', 'p1'), linked('r1', 'p2')], []);
    expect(cards.get('r1')!.map((card) => card.id)).toEqual(['p3', 'p1', 'p2']);
  });

  test('écarte les doublons', () => {
    const cards = mergePublicProducts([reel('r1')], [linked('r1', 'p1'), linked('r1', 'p1', { lp_name: 'Copie' })], []);
    expect(cards.get('r1')!.map((card) => card.id)).toEqual(['p1']);
  });

  test('le repli historique ne sert QUE si la liste liée est vide', () => {
    const withList = mergePublicProducts([reel('r1')], [linked('r1', 'p2')], [legacy('r1', 'p1')]);
    expect(withList.get('r1')!.map((card) => card.id)).toEqual(['p2']);

    const withoutList = mergePublicProducts([reel('r1')], [], [legacy('r1', 'p1')]);
    expect(withoutList.get('r1')!.map((card) => card.id)).toEqual(['p1']);
  });

  test('un produit de la liste devenu non vendable disparaît sans casser le reste', () => {
    const cards = mergePublicProducts(
      [reel('r1')],
      [linked('r1', 'p1'), linked('r1', 'p2', { lp_status: 'ARCHIVED' }), linked('r1', 'p3', { lp_final_price: 0 })],
      [],
    );
    expect(cards.get('r1')!.map((card) => card.id)).toEqual(['p1']);
  });

  test('un contenu `normal` n’expose aucune carte, même avec des lignes liées', () => {
    const cards = mergePublicProducts([reel('r1', { content_mode: 'normal' })], [linked('r1', 'p1')], []);
    expect(cards.get('r1')).toEqual([]);
  });

  test('une ligne orpheline (contenu hors du lot) est ignorée', () => {
    const cards = mergePublicProducts([reel('r1')], [linked('r1', 'p1'), linked('r9', 'p2')], []);
    expect(cards.size).toBe(1);
    expect(cards.get('r9')).toBeUndefined();
    expect(cards.get('r1')!.map((card) => card.id)).toEqual(['p1']);
  });

  test('la carte publique ne porte que ce que la boutique affiche', () => {
    const [card] = mergePublicProducts([reel('r1')], [linked('r1', 'p1', { lp_stock_status: 'OUT_OF_STOCK' })], []).get('r1')!;
    expect(card).toEqual({
      id: 'p1',
      name: 'Article p1',
      brand: 'Marque',
      image: '/media/p1.jpg',
      price: 89,
      currency: 'TND',
      stockStatus: 'OUT_OF_STOCK',
      available: false,
    });
  });

  test('un lot de contenus garde une entrée par contenu, même vide', () => {
    const cards = mergePublicProducts([reel('r1'), reel('r2', { content_mode: 'normal' })], [linked('r1', 'p1')], []);
    expect([...cards.keys()]).toEqual(['r1', 'r2']);
    expect(cards.get('r2')).toEqual([]);
  });
});

describe('types de contenu', () => {
  test('les trois familles seulement', () => {
    expect([...CONTENT_KINDS]).toEqual(['reel', 'publication', 'story']);
    expect(isContentKind('reel')).toBe(true);
    expect(isContentKind('story')).toBe(true);
    expect(isContentKind('post')).toBe(false);
    expect(isContentKind(undefined)).toBe(false);
  });
});
