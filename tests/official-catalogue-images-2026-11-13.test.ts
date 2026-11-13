/**
 * Photos du catalogue officiel : un SEUL format (13/11/2026).
 *
 * Le propriétaire : « الصور لازم خلفية موحّدة ولا تبان صحيحة في الإطار ».
 * Les photos des marques arrivaient en carré, paysage ou portrait, sur blanc pur,
 * gris clair ou gris moyen : dans les cadres 2:3 de l'application (carte
 * produit, fiche, Publication) cela donnait des bandes et des produits rognés.
 * `scripts/normalize-catalogue-images.py` les ramène toutes en 1000 × 1500
 * (2:3), produit entier sur un même gris très clair (#F3F3F3).
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { QatafoDatabase } from '../src/db/database';
import { officialImageUrl, versionOfficialImages } from '../src/catalogue/installOfficialCatalogue';

const dir = path.join(__dirname, '..', 'assets', 'media', 'catalogue', 'official');
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'catalogue', 'officialCatalogue.json'), 'utf8'));
const catalogue = (Array.isArray(raw) ? raw : raw.products) as Array<{ key: string; images: string[] }>;
const files = fs.readdirSync(dir).filter((file) => file.endsWith('.jpg')).sort();

/** Packshots (fond uni) — les autres sont des photos d'ambiance recadrées en 2:3. */
const LIFESTYLE = new Set([
  'apple-iphone-18-pro-1', 'apple-iphone-18-pro-2', 'hm-relaxed-cotton-shirt-1', 'levis-501-original-1',
  'nike-dri-fit-legend-1', 'puma-essentials-logo-tee-2', 'tnf-1996-retro-nuptse-2',
  'zara-pleated-mini-dress-1', 'zara-pleated-mini-dress-2',
]);

describe('photos du catalogue officiel', () => {
  it('chaque photo référencée existe', () => {
    const referenced = catalogue.flatMap((item) => item.images).map((url) => path.basename(url)).sort();
    expect(referenced.length).toBeGreaterThan(0);
    for (const file of referenced) expect(files, file).toContain(file);
  });

  it('toutes au même format 2:3 (1000 × 1500)', async () => {
    for (const file of files) {
      const meta = await sharp(path.join(dir, file)).metadata();
      expect([meta.width, meta.height], file).toEqual([1000, 1500]);
    }
  });

  it('packshots : le même fond gris très clair aux quatre coins', async () => {
    for (const file of files) {
      if (LIFESTYLE.has(file.replace(/\.jpg$/, ''))) continue;
      const { data, info } = await sharp(path.join(dir, file)).raw().toBuffer({ resolveWithObject: true });
      for (const [x, y] of [[4, 4], [info.width - 5, 4], [4, info.height - 5], [info.width - 5, info.height - 5]]) {
        const at = (y * info.width + x) * info.channels;
        for (let c = 0; c < 3; c += 1) expect(Math.abs((data[at + c] as number) - 0xF3), `${file} (${x},${y})`).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe('adresses versionnées (les téléphones rechargent la nouvelle photo)', () => {
  it('officialImageUrl : seules les photos officielles reçoivent ?v=2, une seule fois', () => {
    expect(officialImageUrl('/media/catalogue/official/jbl-go-4-1.jpg')).toBe('/media/catalogue/official/jbl-go-4-1.jpg?v=2');
    expect(officialImageUrl('/media/catalogue/official/jbl-go-4-1.jpg?v=2')).toBe('/media/catalogue/official/jbl-go-4-1.jpg?v=2');
    expect(officialImageUrl('/media/catalogue/official/jbl-go-4-1.jpg?v=1')).toBe('/media/catalogue/official/jbl-go-4-1.jpg?v=2');
    expect(officialImageUrl('/media/reels-owned/shoes-v1.jpg')).toBe('/media/reels-owned/shoes-v1.jpg');
    expect(officialImageUrl('https://cdn.example/x.jpg')).toBe('https://cdn.example/x.jpg');
  });

  it('installation neuve : produits, galerie et blocs pointent vers ?v=2', () => {
    const db = new QatafoDatabase(':memory:');
    const products = db.all<{ image: string; additional_images: string }>("SELECT image, additional_images FROM products WHERE id LIKE 'product_official_%'");
    expect(products.length).toBe(20);
    for (const row of products) {
      expect(row.image).toMatch(/\?v=2$/);
      for (const url of JSON.parse(row.additional_images) as string[]) expect(url).toMatch(/\?v=2$/);
    }
    const media = db.all<{ url: string }>("SELECT url FROM catalogue_media WHERE url LIKE '/media/catalogue/official/%'");
    expect(media.length).toBeGreaterThan(20);
    for (const row of media) expect(row.url).toMatch(/\?v=2$/);
    const posters = db.all<{ media_url: string; poster_url: string }>('SELECT media_url, poster_url FROM publication_blocks');
    for (const row of posters) {
      for (const url of [row.media_url, row.poster_url]) {
        if (url.startsWith('/media/catalogue/official/')) expect(url).toMatch(/\?v=2$/);
      }
    }
  });

  it('base déjà installée (adresses sans version) : mise à jour, puis rien à refaire', () => {
    const db = new QatafoDatabase(':memory:');
    // Simule une base du 12/11 : adresses nues.
    db.run("UPDATE products SET image=replace(image,'?v=2',''), additional_images=replace(additional_images,'?v=2','') WHERE id LIKE 'product_official_%'");
    db.run("UPDATE catalogue_media SET url=replace(url,'?v=2','')");
    db.run("UPDATE publication_blocks SET media_url=replace(media_url,'?v=2',''), poster_url=replace(poster_url,'?v=2','')");
    expect(db.get<{ n: number }>("SELECT COUNT(*) n FROM products WHERE image LIKE '%?v=2'").n).toBe(0);
    expect(versionOfficialImages(db)).toBe(20);
    expect(db.get<{ n: number }>("SELECT COUNT(*) n FROM products WHERE id LIKE 'product_official_%' AND image NOT LIKE '%?v=2'").n).toBe(0);
    expect(db.get<{ n: number }>("SELECT COUNT(*) n FROM catalogue_media WHERE url LIKE '/media/catalogue/official/%' AND url NOT LIKE '%?v=2'").n).toBe(0);
    expect(db.get<{ n: number }>("SELECT COUNT(*) n FROM publication_blocks WHERE media_url LIKE '/media/catalogue/official/%' AND media_url NOT LIKE '%?v=2'").n).toBe(0);
    const before = db.all('SELECT id, image, additional_images FROM products ORDER BY id');
    versionOfficialImages(db);
    expect(db.all('SELECT id, image, additional_images FROM products ORDER BY id')).toEqual(before);
  });
});
