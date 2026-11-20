import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { SocialAdminPage } from '../client/src/admin/SocialAdminPage';

vi.mock('../client/src/admin/api', () => ({ adminApi: vi.fn() }));

it('opens Social on Reels and has no old Publication template management', () => {
  const html = renderToStaticMarkup(<SocialAdminPage canWrite />);
  expect(html).toContain('Reels vidéo');
  expect(html).toContain('Produits temporaires');
  expect(html).toContain('Aucun reel.');
  expect(html).toMatch(/aria-pressed="true"[^>]*>Reel<\/button>/);
  expect(html).not.toMatch(/>Publication<|Modèle visuel|Aperçu de composition/);
});
