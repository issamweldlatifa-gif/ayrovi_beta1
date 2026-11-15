/**
 * Modèle `cinema` (16/11/2026, demande du propriétaire, référence Anker « Vivez chargé. ») :
 * vidéo bord à bord + panneau noir profond + deux cartes ou une rangée.
 *
 *  • validation : vidéo OBLIGATOIRE (le type est forcé à `video`), noir par défaut ;
 *  • rendu public : un bloc `cinema` sans vidéo n'est jamais servi ;
 *  • base existante : la contrainte CHECK est élargie UNE fois (table reconstruite,
 *    lignes, ordre et dates intacts), sans rien toucher ensuite ;
 *  • démonstration : le bloc est posé EN TÊTE de la page, une seule fois.
 */
import Database from 'better-sqlite3';
import { describe, expect, test } from 'vitest';
import {
  PUBLICATION_BLOCK_DEFAULT_COLOR,
  PUBLICATION_BLOCK_KINDS,
  isRenderablePublicationBlock,
  normalizePublicationBlockInput,
} from '../shared/publicationBlocks';
import { allowCinemaPublicationBlocks, PUBLICATION_BLOCKS_SCHEMA, PUBLICATION_CINEMA_DEMO } from '../src/services/publicationBlocks';
import { db } from '../src/server';

const okLink = (value: unknown) => ({ ok: true as const, url: String(value) });

describe('validation du modèle cinema', () => {
  test('vidéo obligatoire, type forcé à vidéo, noir profond par défaut', () => {
    expect(PUBLICATION_BLOCK_KINDS).toContain('cinema');
    expect(PUBLICATION_BLOCK_DEFAULT_COLOR.cinema).toBe('#000000');
    const missing = normalizePublicationBlockInput({ kind: 'cinema', title: 'Vivez chargé.', product_ids: ['p1'] }, undefined, okLink);
    expect(missing).toEqual({ ok: false, error: 'Ajoutez la vidéo du bloc.' });
    const ok = normalizePublicationBlockInput(
      { kind: 'cinema', title: 'Vivez chargé.', media_type: 'image', media_url: '/media/v.mp4', poster_url: '/media/v.jpg', product_ids: ['p1', 'p2'] },
      undefined,
      okLink,
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value).toMatchObject({ kind: 'cinema', media_type: 'video', media_url: '/media/v.mp4', poster_url: '/media/v.jpg', bg_color: '#000000' });
    }
  });

  test('un bloc cinema sans vidéo ou sans produit n’est jamais servi', () => {
    const video = { type: 'video' as const, url: '/v.mp4', poster: '' };
    expect(isRenderablePublicationBlock({ kind: 'cinema', products: [{}], media: video })).toBe(true);
    expect(isRenderablePublicationBlock({ kind: 'cinema', products: [{}], media: { ...video, type: 'image' } })).toBe(false);
    expect(isRenderablePublicationBlock({ kind: 'cinema', products: [{}], media: null })).toBe(false);
    expect(isRenderablePublicationBlock({ kind: 'cinema', products: [], media: video })).toBe(false);
  });
});

describe('base créée avant le 16/11', () => {
  test('la contrainte CHECK est élargie une fois, les lignes restent intactes', () => {
    const old = new Database(':memory:');
    old.exec(PUBLICATION_BLOCKS_SCHEMA.replace(",'cinema'", ''));
    old.prepare(`INSERT INTO publication_blocks (id,kind,title,product_ids,sort_order,created_at,updated_at) VALUES ('b1','media','Mode','["p1"]',7,'2026-11-13T00:00:00.000Z','2026-11-14T00:00:00.000Z')`).run();
    expect(() => old.prepare(`INSERT INTO publication_blocks (id,kind,title,created_at,updated_at) VALUES ('x','cinema','X','t','t')`).run()).toThrow(/CHECK/);

    expect(allowCinemaPublicationBlocks(old)).toBe(true);
    expect(old.prepare('SELECT id,kind,title,product_ids,sort_order,created_at,updated_at FROM publication_blocks').all()).toEqual([
      { id: 'b1', kind: 'media', title: 'Mode', product_ids: '["p1"]', sort_order: 7, created_at: '2026-11-13T00:00:00.000Z', updated_at: '2026-11-14T00:00:00.000Z' },
    ]);
    old.prepare(`INSERT INTO publication_blocks (id,kind,title,created_at,updated_at) VALUES ('c1','cinema','Vivez chargé.','t','t')`).run();
    expect(old.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'publication_blocks%' ORDER BY name").all()).toEqual([{ name: 'publication_blocks' }]);
    expect(old.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_publication_blocks_order'").get()).toBeTruthy();
    // Deuxième passage : rien à faire.
    expect(allowCinemaPublicationBlocks(old)).toBe(false);
    old.close();
  });
});

describe('démonstration installée au démarrage', () => {
  test('le bloc cinema existe une fois, en tête de page, avec une vidéo du propriétaire', () => {
    const rows = db.all<{ id: string; kind: string; media_type: string; sort_order: number; bg_color: string }>(
      "SELECT id,kind,media_type,sort_order,bg_color FROM publication_blocks WHERE kind='cinema'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'pubblock_demo_cinema', media_type: 'video', bg_color: '#000000' });
    const first = db.get<{ id: string }>('SELECT id FROM publication_blocks ORDER BY sort_order, created_at, id LIMIT 1');
    expect(first?.id).toBe('pubblock_demo_cinema');
    expect(PUBLICATION_CINEMA_DEMO.reel).toBe('reel_owner_accessories_v1');
  });
});
