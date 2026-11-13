/**
 * 13/11 — SYSTÈME DE CARTES : l'aperçu du CRM et l'application partagent la
 * même carte (marge 12, écart 8, deux cartes entières, rapport 1,44, rayon 12,
 * cœur nu). Le test lit le source de l'application (deux builds, pas d'import
 * croisé) et compare la copie du CRM ; une valeur qui bouge d'un seul côté est
 * un aperçu qui mentirait.
 */
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { PREVIEW_CARD, previewCardWidth, PublicationBlockPreview, emptyBlock } from '../client/src/admin/PublicationBlocksTab';

const source = fs.readFileSync(path.resolve(process.cwd(), 'apps/mobile/src/design/cardSystem.ts'), 'utf8');
const value = (name: string) => {
  const match = source.match(new RegExp(`\\b${name}:\\s*([\\d.]+)`));
  if (!match) throw new Error(`cote absente : ${name}`);
  return Number(match[1]);
};

describe('système de cartes : CRM = application', () => {
  test('mêmes cotes', () => {
    // La marge de l'app est `SPACE[2]` (= 12) : vérifiée dans l'échelle des jetons.
    expect(source).toContain('gutter: SPACE[2]');
    const space = fs.readFileSync(path.resolve(process.cwd(), 'apps/mobile/src/design/tokens.generated.ts'), 'utf8');
    expect(space).toMatch(/SPACE = \[4, 8, 12,/);
    expect(PREVIEW_CARD.gutter).toBe(12);
    expect(PREVIEW_CARD.gap).toBe(value('gap'));
    expect(PREVIEW_CARD.ratio).toBe(value('imageRatio'));
    expect(PREVIEW_CARD.radius).toBe(value('radius'));
    expect(PREVIEW_CARD.heart).toBe(value('heartIcon'));
    expect(value('perView')).toBe(2);
  });

  test('deux cartes entières à parts égales dans les trois modèles (aucune amorce coupée)', () => {
    const scale = 320 / 360;
    const width = previewCardWidth();
    expect(Math.abs(2 * width + PREVIEW_CARD.gap * scale + 2 * PREVIEW_CARD.gutter * scale - 320)).toBeLessThanOrEqual(1);
    for (const kind of ['container', 'media', 'sponsored_pair'] as const) {
      const form = { ...emptyBlock(kind), title: 'Bloc', media_url: kind === 'container' ? '' : '/m.jpg' };
      const html = renderToStaticMarkup(<PublicationBlockPreview form={form} products={[]} />);
      expect(html, kind).toContain(`width:${width}px`);
      // cœur nu : un trait, plus de rond blanc
      expect(html, kind).toContain('data-testid="preview-heart"');
      expect(html, kind).not.toMatch(/border-radius:\d+(\.\d+)?px;background:#FFFFFF/i);
    }
  });
});
