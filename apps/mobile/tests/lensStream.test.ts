import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../src/api/errors';
import {
  analyzeImageStream,
  createLensSseReader,
  parseLensSseBlock,
  type LensStreamItem,
} from '../src/api/lensStream';

/**
 * XHR factice : React Native n'expose pas `response.body`, c'est donc le XHR
 * qui porte le flux (`responseText` grandit). Ce double reproduit exactement
 * ce contrat : `onprogress` livre le corps cumulé, `onload` la fin.
 */
class FakeXhr {
  static instances: FakeXhr[] = [];

  method = '';
  url = '';
  headers: Record<string, string> = {};
  responseText = '';
  status = 200;
  responseHeaders: Record<string, string> = { 'content-type': 'text/event-stream' };
  body: unknown = null;
  sent = false;
  aborted = false;

  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value;
  }

  getResponseHeader(name: string): string | null {
    return this.responseHeaders[name.toLowerCase()] ?? null;
  }

  send(body: unknown): void {
    this.sent = true;
    this.body = body;
  }

  abort(): void {
    this.aborted = true;
    this.onabort?.();
  }

  /** Un morceau arrive : le corps cumulé grandit. */
  push(chunk: string): void {
    this.responseText += chunk;
    this.onprogress?.();
  }

  /** Le serveur a fini. */
  finish(): void {
    this.onload?.();
  }
}

afterEach(() => {
  FakeXhr.instances = [];
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const block = (event: string, data: unknown): string => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const identification = {
  description: 'Sac à main en cuir noir',
  brand: 'ZAYROVI',
  model: 'Mini',
  category: 'Sacs',
};

const card = (id: string) => ({
  id,
  kind: 'external',
  title: `Sac ${id}`,
  sourceUrl: `https://shop.example/p/${id}`,
  image: `/m/${id}.jpg`,
  price: 120,
  currency: 'TND',
  priceTnd: 120,
  availability: 'in_stock',
});

describe('Lens — lecture du flux (SSE) sur téléphone', () => {
  it('lit un bloc « progress » avec l’identification du produit', () => {
    const item = parseLensSseBlock(block('progress', { step: 'identified', identification }));
    expect(item?.type).toBe('progress');
    if (item?.type !== 'progress') throw new Error('bloc progress attendu');
    expect(item.progress.step).toBe('identified');
    expect(item.progress.identification?.description).toBe('Sac à main en cuir noir');
  });

  it('lit un bloc « card » et une fiche marchande', () => {
    const item = parseLensSseBlock(block('card', card('c1')));
    expect(item?.type).toBe('card');
    if (item?.type !== 'card') throw new Error('bloc card attendu');
    expect(item.candidate.sourceUrl).toBe('https://shop.example/p/c1');
    expect(item.candidate.priceTnd).toBe(120);
  });

  it('lit l’avancement de lecture « done/total »', () => {
    const item = parseLensSseBlock(block('progress', { step: 'reading', done: 3, total: 8 }));
    expect(item?.type).toBe('progress');
    if (item?.type !== 'progress') throw new Error('bloc progress attendu');
    expect(item.progress.done).toBe(3);
    expect(item.progress.total).toBe(8);
  });

  it('ignore un événement inconnu, un JSON cassé et une étape inventée', () => {
    expect(parseLensSseBlock(block('mystery', { a: 1 }))).toBeNull();
    expect(parseLensSseBlock('event: card\ndata: {pas du json\n\n')).toBeNull();
    expect(parseLensSseBlock(block('progress', { step: 'invented' }))).toBeNull();
  });

  it('remonte l’erreur du serveur telle quelle', () => {
    const item = parseLensSseBlock(block('error', { code: 'IDENTIFICATION_FAILED', error: 'Photo illisible' }));
    expect(item?.type).toBe('error');
    if (item?.type !== 'error') throw new Error('bloc error attendu');
    expect(item.code).toBe('IDENTIFICATION_FAILED');
    expect(item.message).toBe('Photo illisible');
  });

  it('découpe les blocs même quand un morceau arrive coupé en deux', () => {
    const items: LensStreamItem[] = [];
    const reader = createLensSseReader((item) => items.push(item));
    const full = block('progress', { step: 'searching' });
    reader.push(full.slice(0, 12));
    expect(items).toHaveLength(0);
    reader.push(full.slice(12));
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('progress');
  });

  it('vide le dernier bloc à la fermeture du flux', () => {
    const items: LensStreamItem[] = [];
    const reader = createLensSseReader((item) => items.push(item));
    reader.push('event: done\ndata: {"eventId":"e1","query":"sac"}');
    expect(items).toHaveLength(0);
    reader.flush();
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('done');
  });
});

describe('Lens — analyse en flux', () => {
  it('l Identification, les fiches et la fin arrivent dans l’ordre', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr as unknown as typeof XMLHttpRequest);
    const progress: string[] = [];
    const cards: string[] = [];

    const pending = analyzeImageStream(
      { uri: 'file:///tmp/photo.jpg', name: 'capture.jpg', type: 'image/jpeg' },
      {
        roi: { x: 0, y: 0, w: 1, h: 1 },
        onProgress: (p) => progress.push(p.step),
        onCard: (c) => cards.push(c.sourceUrl),
      },
    );

    const xhr = FakeXhr.instances[0];
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toContain('/analyze-image');
    expect(xhr.headers.accept).toBe('text/event-stream');
    expect(xhr.sent).toBe(true);

    xhr.push(block('progress', { step: 'identified', identification }));
    xhr.push(block('progress', { step: 'searching' }));
    xhr.push(block('progress', { step: 'reading', done: 0, total: 2 }));
    xhr.push(block('card', card('c1')));
    xhr.push(block('card', card('c2')));
    xhr.push(block('done', { eventId: 'e1', query: 'sac noir', identification, excluded: { count: 2, reasons: { interdit: 2 } } }));
    xhr.finish();

    const result = await pending;
    expect(progress).toEqual(['identified', 'searching', 'reading']);
    expect(cards).toEqual(['https://shop.example/p/c1', 'https://shop.example/p/c2']);
    expect(result.candidates).toHaveLength(2);
    expect(result.query).toBe('sac noir');
    expect(result.eventId).toBe('e1');
    expect(result.identification?.brand).toBe('ZAYROVI');
    expect(result.excluded?.count).toBe(2);
  });

  it('ne compte pas deux fois la même fiche', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr as unknown as typeof XMLHttpRequest);
    const cards: string[] = [];
    const pending = analyzeImageStream(
      { uri: 'file:///tmp/photo.jpg', name: 'capture.jpg', type: 'image/jpeg' },
      { onCard: (c) => cards.push(c.sourceUrl) },
    );
    const xhr = FakeXhr.instances[0];
    xhr.push(block('card', card('c1')));
    xhr.push(block('card', card('c1')));
    xhr.push(block('done', { eventId: 'e1', query: 'sac' }));
    xhr.finish();
    const result = await pending;
    expect(cards).toHaveLength(1);
    expect(result.candidates).toHaveLength(1);
  });

  it('un flux coupé sans « done » est une erreur, jamais un résultat vide silencieux', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr as unknown as typeof XMLHttpRequest);
    const pending = analyzeImageStream({ uri: 'file:///tmp/photo.jpg', name: 'capture.jpg', type: 'image/jpeg' });
    const xhr = FakeXhr.instances[0];
    xhr.push(block('card', card('c1')));
    xhr.finish();
    await expect(pending).rejects.toBeInstanceOf(ApiError);
    await expect(pending).rejects.toMatchObject({ code: 'STREAM_INCOMPLETE' });
  });

  it('l’annulation du client interrompt le flux', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr as unknown as typeof XMLHttpRequest);
    const controller = new AbortController();
    const pending = analyzeImageStream(
      { uri: 'file:///tmp/photo.jpg', name: 'capture.jpg', type: 'image/jpeg' },
      { signal: controller.signal },
    );
    // L'assertion s'abonne AVANT l'abandon : pas de rejet non surveillé.
    const rejection = expect(pending).rejects.toMatchObject({ kind: 'aborted' });
    const xhr = FakeXhr.instances[0];
    controller.abort();
    expect(xhr.aborted).toBe(true);
    await rejection;
  });

  it('une réponse JSON (serveur qui n’a pas streamé) reste acceptée', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr as unknown as typeof XMLHttpRequest);
    const pending = analyzeImageStream({ uri: 'file:///tmp/photo.jpg', name: 'capture.jpg', type: 'image/jpeg' });
    const xhr = FakeXhr.instances[0];
    xhr.responseHeaders = { 'content-type': 'application/json' };
    xhr.responseText = JSON.stringify({
      success: true,
      data: { identification, query: 'sac noir', candidates: [card('c1')], eventId: 'e1' },
    });
    xhr.finish();
    const result = await pending;
    expect(result.candidates).toHaveLength(1);
    expect(result.query).toBe('sac noir');
  });

  it('le délai d’inactivité donne une erreur de temps, pas un écran vide', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('XMLHttpRequest', FakeXhr as unknown as typeof XMLHttpRequest);
    const pending = analyzeImageStream(
      { uri: 'file:///tmp/photo.jpg', name: 'capture.jpg', type: 'image/jpeg' },
      { idleMs: 100, totalMs: 5000 },
    );
    const rejection = expect(pending).rejects.toMatchObject({ kind: 'timeout' });
    const xhr = FakeXhr.instances[0];
    xhr.push(block('progress', { step: 'identified', identification }));
    await vi.advanceTimersByTimeAsync(200);
    await rejection;
    expect(xhr.aborted).toBe(true);
  });
});
