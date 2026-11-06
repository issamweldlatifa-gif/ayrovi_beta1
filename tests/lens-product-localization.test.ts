import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import express from 'express';
const provider = vi.hoisted(() => ({
  isConfigured: vi.fn(),
  complete: vi.fn(),
}));
vi.mock('../src/ai-core/core', () => ({
  getAyroviAiCore: () => ({ responses: () => provider }),
}));
import {
  parseLocalizedProducts,
  localizeProducts,
} from '../src/ayrovix/services/productLocalization';
import { createAyrovixRouter } from '../src/ayrovix/routes';
const coat = {
  name: 'Veste',
  category: 'jacket',
  confidence: 0.92,
  box: [0.1, 0.1, 0.7, 0.7],
};
const bag = {
  name: 'Sac',
  category: 'bag',
  confidence: 0.9,
  box: [0.4, 0.4, 0.2, 0.25],
};
const app = express();
app.use('/api/ayrovix', createAyrovixRouter({} as any, {} as any));
let color = 10;
async function photo() {
  return sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: color++, g: 30, b: 40 },
    },
  })
    .png()
    .toBuffer();
}
beforeEach(() => {
  vi.clearAllMocks();
  provider.isConfigured.mockReturnValue(true);
  provider.complete.mockResolvedValue({
    textBlocks: [JSON.stringify({ products: [coat, bag] })],
  });
});
describe('Grounding validation, not guessed finger rectangles', () => {
  it('keeps distinct garments and lets a tap reach the smallest actual containing item', () => {
    const items = parseLocalizedProducts(
      { products: [coat, bag] },
      { x: 0.5, y: 0.5 }
    );
    expect(items.map((p) => p.name)).toEqual(['Sac', 'Veste']);
    expect(items[0].box).toEqual({ x: 0.4, y: 0.4, w: 0.2, h: 0.25 });
    expect(
      parseLocalizedProducts({ products: [bag] }, { x: 0.9, y: 0.9 })
    ).toEqual([]);
  });
  it.each([
    [-1, 0.1, 0.5, 0.5],
    [0.5, 0.5, 0.8, 0.8],
    [0, 0, 1, 1],
    [0.2, 0.2, 0, 0.4],
    [0.2, 0.2, NaN, 0.4],
    ['.2', 0.2, 0.2, 0.2],
    [0.2, 0.2, 0.2],
  ])('rejects invalid or whole-scene box %j', (...box) => {
    expect(parseLocalizedProducts({ products: [{ ...bag, box }] })).toEqual([]);
  });
  it.each([0.4, NaN, Infinity, 1.1, '0.9'])(
    'rejects unreliable confidence %s',
    (confidence) => {
      expect(
        parseLocalizedProducts({ products: [{ ...bag, confidence }] })
      ).toEqual([]);
    }
  );
  it('rejects people as product boxes and malformed payloads', () => {
    expect(
      parseLocalizedProducts({ products: [{ ...coat, category: 'person' }] })
    ).toEqual([]);
    expect(() => parseLocalizedProducts({ matches: [] })).toThrow(
      'INVALID_LOCALIZATION'
    );
  });
  it('calls genuine vision with structured boxes and the exact touch point; caches only validated products', async () => {
    const bytes = await photo();
    const point = { x: 0.5, y: 0.5 };
    await localizeProducts(bytes, 'image/png', point);
    await localizeProducts(bytes, 'image/png', point);
    expect(provider.complete).toHaveBeenCalledTimes(1);
    const args = provider.complete.mock.calls[0];
    expect(args[0].workload).toBe('vision');
    expect(args[0].messages[0].content[0].source.data).toBe(
      bytes.toString('base64')
    );
    expect(args[0].messages[0].content[1].text).toContain('x=0.5, y=0.5');
    expect(args[1]).toBeInstanceOf(AbortSignal);
  });
});
describe('Localization upload API', () => {
  it('returns item coordinates separately from merchant discovery', async () => {
    const res = await request(app)
      .post('/api/ayrovix/localize')
      .attach('image', await photo(), 'scene.png');
    expect(res.status).toBe(200);
    expect(res.body.data.products).toHaveLength(2);
    expect(res.body.data.products[1].box).toEqual({
      x: 0.4,
      y: 0.4,
      w: 0.2,
      h: 0.25,
    });
  });
  it('rejects missing image and invalid points before provider access', async () => {
    expect((await request(app).post('/api/ayrovix/localize')).status).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/ayrovix/localize')
          .field('point', '{"x":7,"y":0}')
          .attach('image', await photo(), 'scene.png')
      ).status
    ).toBe(400);
    expect(provider.complete).not.toHaveBeenCalled();
  });
  it('rejects corrupt bytes', async () => {
    expect(
      (
        await request(app)
          .post('/api/ayrovix/localize')
          .attach('image', Buffer.from('not an image'), 'scene.png')
      ).status
    ).toBe(400);
    expect(provider.complete).not.toHaveBeenCalled();
  });
  it('reports unavailable rather than inventing a central box', async () => {
    provider.isConfigured.mockReturnValue(false);
    const res = await request(app)
      .post('/api/ayrovix/localize')
      .attach('image', await photo(), 'scene.png');
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('LOCALIZATION_UNAVAILABLE');
    expect(res.body.data).toBeUndefined();
  });
  it('returns empty when a touched spot contains no grounded product', async () => {
    const res = await request(app)
      .post('/api/ayrovix/localize')
      .field('point', '{"x":0.95,"y":0.95}')
      .attach('image', await photo(), 'scene.png');
    expect(res.body.data.products).toEqual([]);
  });
});
