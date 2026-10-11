/**
 * Lens — flux SSE (`analyzeLensImageStream`) : le contrat avec le serveur.
 *  • les étapes et les fiches viennent du serveur, dans l'ordre d'arrivée ;
 *  • un bloc coupé en deux morceaux est reconstitué ;
 *  • `error` du serveur, coupure sans `done`, HTTP 400 et annulation sont
 *    des erreurs distinctes (aucune n'est un succès silencieux).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  analyzeLensImageStream, parseLensSseBlock, takeSseBlocks,
  type LensProgress,
} from '../src/api/lensStream';
import { ApiError } from '../src/api/errors';
import type { LensCandidate } from '../src/api/lens';

class FakeXHR {
  static last: FakeXHR | undefined;
  readyState = 0;
  status = 0;
  responseText = '';
  headers: Record<string, string> = {};
  method = '';
  url = '';
  body: unknown = null;
  onreadystatechange: (() => void) | null = null;
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXHR.last = this;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }

  getResponseHeader() {
    return null;
  }

  send(body: unknown) {
    this.body = body;
  }

  abort() {
    this.onabort?.();
  }

  /** Le serveur envoie un morceau de flux. */
  emit(text: string) {
    this.status = 200;
    this.responseText += text;
    this.readyState = 3;
    this.onreadystatechange?.();
    this.onprogress?.();
  }

  /** Fin de la réponse. */
  end(status = 200) {
    this.status = status;
    this.readyState = 4;
    this.onreadystatechange?.();
    this.onload?.();
  }
}

const block = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const card = (n: number) => ({
  id: `c${n}`,
  sourceUrl: `https://shop.example.com/p/${n}`,
  title: `Produit ${n}`,
  availability: 'in_stock',
  verification: 'VERIFIED',
  priceTnd: 100 + n,
  images: [],
  colors: [],
  sizes: [],
  offerCount: 1,
});

const DONE = {
  eventId: 'evt-1',
  query: 'pull gris',
  identification: { brand: 'Maison' },
  excluded: { count: 0, reasons: {} },
  liveStock: { fetched: 2, cacheHits: 0, applied: 0, budget: 8 },
};

const input = { uri: 'file:///photo.jpg', mimeType: 'image/jpeg' };

beforeEach(() => {
  FakeXHR.last = undefined;
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('découpe du flux', () => {
  it('garde le bloc incomplet pour le morceau suivant', () => {
    const { blocks, rest } = takeSseBlocks('event: progress\ndata: {}\n\nevent: card\ndata: {"sou');
    expect(blocks).toEqual(['event: progress\ndata: {}']);
    expect(rest).toBe('event: card\ndata: {"sou');
  });

  it('décode progress, card, done et error', () => {
    expect(parseLensSseBlock('event: progress\ndata: {"step":"reading","done":1,"total":3}'))
      .toEqual({ type: 'progress', progress: { step: 'reading', done: 1, total: 3 } });
    expect(parseLensSseBlock(`event: card\ndata: ${JSON.stringify(card(1))}`)?.type).toBe('card');
    expect(parseLensSseBlock('event: done\ndata: {"eventId":"x"}')?.type).toBe('done');
    expect(parseLensSseBlock('event: error\ndata: {"code":"ANALYZE_TIMEOUT","error":"trop long"}'))
      .toEqual({ type: 'error', code: 'ANALYZE_TIMEOUT', message: 'trop long' });
  });

  it('rejette ce qui ne correspond pas au contrat', () => {
    expect(parseLensSseBlock('event: progress\ndata: {"step":"inventé"}')).toBeNull();
    expect(parseLensSseBlock('event: card\ndata: {"title":"sans lien"}')).toBeNull();
    expect(parseLensSseBlock('event: card\ndata: pas-du-json')).toBeNull();
    expect(parseLensSseBlock('event: autre\ndata: {}')).toBeNull();
  });
});

describe('analyzeLensImageStream', () => {
  it('suit le flux jusqu’au done et remonte les étapes et les fiches', async () => {
    const steps: LensProgress[] = [];
    const cards: LensCandidate[] = [];
    const promise = analyzeLensImageStream(input, {
      onProgress: (p) => steps.push(p),
      onCard: (c) => cards.push(c),
    });
    const xhr = FakeXHR.last!;
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toMatch(/\/api\/ayrovix\/analyze-image$/);
    expect(xhr.headers.Accept).toBe('text/event-stream');

    xhr.emit(block('progress', { step: 'identified' }));
    xhr.emit(block('progress', { step: 'searching' }) + block('progress', { step: 'reading', done: 0, total: 2 }));
    xhr.emit(block('card', card(1)));
    xhr.emit(block('card', card(2)) + block('done', DONE));
    xhr.end(200);

    const result = await promise;
    expect(steps.map((s) => s.step)).toEqual(['identified', 'searching', 'reading']);
    expect(cards.map((c) => c.title)).toEqual(['Produit 1', 'Produit 2']);
    expect(result.candidates.map((c) => c.sourceUrl)).toEqual([card(1).sourceUrl, card(2).sourceUrl]);
    expect(result.eventId).toBe('evt-1');
  });

  it('reconstitue un bloc coupé en deux morceaux', async () => {
    const cards: LensCandidate[] = [];
    const promise = analyzeLensImageStream(input, { onCard: (c) => cards.push(c) });
    const xhr = FakeXHR.last!;
    const text = block('card', card(7)) + block('done', DONE);
    xhr.emit(text.slice(0, 25));
    xhr.emit(text.slice(25));
    xhr.end(200);
    await promise;
    expect(cards.map((c) => c.title)).toEqual(['Produit 7']);
  });

  it('erreur du serveur ⇒ ApiError avec son code', async () => {
    const promise = analyzeLensImageStream(input);
    const xhr = FakeXHR.last!;
    xhr.emit(block('error', { code: 'IDENTIFICATION_FAILED', error: 'Photo illisible' }));
    xhr.end(200);
    await expect(promise).rejects.toMatchObject({ code: 'IDENTIFICATION_FAILED', kind: 'http' });
  });

  it('flux coupé sans done ⇒ STREAM_INCOMPLETE (jamais un succès)', async () => {
    const promise = analyzeLensImageStream(input);
    const xhr = FakeXHR.last!;
    xhr.emit(block('card', card(1)));
    xhr.end(200);
    await expect(promise).rejects.toMatchObject({ code: 'STREAM_INCOMPLETE' });
  });

  it('HTTP 400 ⇒ erreur du serveur avec son statut', async () => {
    const promise = analyzeLensImageStream(input);
    const xhr = FakeXHR.last!;
    xhr.responseText = JSON.stringify({ success: false, code: 'IMAGE_REQUIRED', error: 'Image manquante' });
    xhr.end(400);
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ status: 400 });
  });

  it('annulation par le signal ⇒ aborted (sans message à afficher)', async () => {
    const controller = new AbortController();
    const promise = analyzeLensImageStream(input, {}, { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ kind: 'aborted' });
  });
});

describe('SSE selon la spécification (fins de ligne, champs, commentaires)', () => {
  it('accepte CRLF et CR seul comme fin de ligne', () => {
    const crlf = takeSseBlocks('event: done\r\ndata: {}\r\n\r\nevent: card\r\ndata: {"x"');
    expect(crlf.blocks).toEqual(['event: done\r\ndata: {}']);
    expect(crlf.rest).toBe('event: card\r\ndata: {"x"');
    const cr = takeSseBlocks('event: done\rdata: {}\r\rreste');
    expect(cr.blocks).toEqual(['event: done\rdata: {}']);
    expect(cr.rest).toBe('reste');
  });

  it('attend le \\n qui suit un \\r coupé entre deux morceaux', () => {
    const first = takeSseBlocks('event: done\ndata: {}\n\r');
    expect(first.blocks).toEqual([]);
    const second = takeSseBlocks(`${first.rest}\n`);
    expect(second.blocks).toEqual(['event: done\ndata: {}']);
  });

  it('joint plusieurs lignes data avec un saut de ligne', () => {
    expect(parseLensSseBlock('event: progress\ndata: {"step":\ndata: "identified"}')).toEqual({
      type: 'progress',
      progress: { step: 'identified', done: undefined, total: undefined },
    });
  });

  it('ignore les commentaires et ne retire qu’un seul espace après le deux-points', () => {
    const block = ': keep-alive\nevent:progress\ndata:{"step":"searching"}';
    expect(parseLensSseBlock(block)).toEqual({
      type: 'progress',
      progress: { step: 'searching', done: undefined, total: undefined },
    });
  });

  it('un bloc sans data ne produit aucun événement', () => {
    expect(parseLensSseBlock('event: done')).toBeNull();
    expect(parseLensSseBlock(': seulement un commentaire')).toBeNull();
  });
});
