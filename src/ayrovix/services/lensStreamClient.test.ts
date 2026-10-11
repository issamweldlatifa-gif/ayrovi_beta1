import { describe, expect, it } from 'vitest';
import { parseLensSseBlock } from '../../../client/src/ayrovix/services/lensStream';

describe('parseLensSseBlock', () => {
  it('décode une carte', () => {
    const item = parseLensSseBlock('event: card\ndata: {"sourceUrl":"https://shop.example/p/1","title":"Produit"}');
    expect(item).toEqual({ type: 'card', candidate: { sourceUrl: 'https://shop.example/p/1', title: 'Produit' } });
  });
  it('ignore une carte sans lien source', () => {
    expect(parseLensSseBlock('event: card\ndata: {"title":"sans lien"}')).toBeNull();
  });
  it('décode la progression', () => {
    expect(parseLensSseBlock('event: progress\ndata: {"step":"reading","done":2,"total":5}')).toEqual({
      type: 'progress',
      progress: { step: 'reading', done: 2, total: 5 },
    });
  });
  it('décode la fin et les erreurs', () => {
    expect(parseLensSseBlock('event: done\ndata: {"eventId":"e1"}')).toEqual({ type: 'done', meta: { eventId: 'e1' } });
    expect(parseLensSseBlock('event: error\ndata: {"code":"ANALYZE_TIMEOUT","error":"trop long"}')).toEqual({
      type: 'error', code: 'ANALYZE_TIMEOUT', message: 'trop long',
    });
  });
  it('renvoie null pour un bloc vide, invalide ou inconnu', () => {
    expect(parseLensSseBlock('')).toBeNull();
    expect(parseLensSseBlock('event: card\ndata: {pas json')).toBeNull();
    expect(parseLensSseBlock('event: autre\ndata: {}')).toBeNull();
  });
});
