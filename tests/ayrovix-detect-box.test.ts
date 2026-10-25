import { describe, expect, test } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import express from 'express';
import { createAyrovixRouter } from '../src/ayrovix/routes';
import { SmartLinkScraper } from '../src/scraper/scraper';
import type { QatafoDatabase } from '../src/db/database';

/* /detect-box ne touche ni la base, ni SerpApi, ni aucune clef : un routeur
   isolé suffit à tester le contrat HTTP de cadrage automatique. */
const app = express();
app.use(express.json());
app.use('/api/ayrovix', createAyrovixRouter({} as QatafoDatabase, new SmartLinkScraper()));

async function renderSvg(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const SINGLE_PRODUCT = `
  <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
    <rect width="200" height="200" fill="#f2f2f2"/>
    <rect x="50" y="40" width="100" height="120" fill="#1f2d4d"/>
  </svg>`;

const UNIFORM = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#eaeaea"/></svg>`;

const TWO_PRODUCTS = `
  <svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120">
    <rect width="240" height="120" fill="#f5f5f5"/>
    <rect x="20" y="30" width="70" height="70" fill="#222"/>
    <rect x="150" y="30" width="70" height="70" fill="#333"/>
  </svg>`;

describe('Z Lens — cadrage automatique (/api/ayrovix/detect-box)', () => {
  test('exige une image et refuse les formats non image', async () => {
    const missing = await request(app).post('/api/ayrovix/detect-box');
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('IMAGE_REQUIRED');

    const wrongType = await request(app)
      .post('/api/ayrovix/detect-box')
      .attach('image', Buffer.from('plain text'), { filename: 'notes.txt', contentType: 'text/plain' });
    expect(wrongType.status).toBe(415);
    expect(wrongType.body.code).toBe('UNSUPPORTED_IMAGE');
  });

  test('un produit unique renvoie une boîte normalisée fiable, sans toucher SerpApi', async () => {
    const response = await request(app)
      .post('/api/ayrovix/detect-box')
      .attach('image', await renderSvg(SINGLE_PRODUCT), { filename: 'produit.png', contentType: 'image/png' });
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const { box, confidence, coverage, reason, width, height } = response.body.data;
    expect(reason).toBe('single_object');
    expect(box).not.toBeNull();
    expect(confidence).toBeGreaterThanOrEqual(0.6);
    expect(coverage).toBeGreaterThan(0);
    expect(typeof width).toBe('number');
    expect(typeof height).toBe('number');
    for (const value of [box.x, box.y, box.w, box.h]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(box.x + box.w).toBeLessThanOrEqual(1.0001);
    expect(box.y + box.h).toBeLessThanOrEqual(1.0001);
  });

  test('une image sans produit ne casse pas la recherche : box null en 200', async () => {
    const response = await request(app)
      .post('/api/ayrovix/detect-box')
      .attach('image', await renderSvg(UNIFORM), { filename: 'fond.png', contentType: 'image/png' });
    expect(response.status).toBe(200);
    expect(response.body.data.box).toBeNull();
    expect(['low_contrast', 'no_foreground']).toContain(response.body.data.reason);
  });

  test('deux objets : aucun rectangle unique trompeur', async () => {
    const response = await request(app)
      .post('/api/ayrovix/detect-box')
      .attach('image', await renderSvg(TWO_PRODUCTS), { filename: 'deux.png', contentType: 'image/png' });
    expect(response.status).toBe(200);
    expect(response.body.data.box).toBeNull();
    expect(response.body.data.reason).toBe('multi_object');
  });
});
