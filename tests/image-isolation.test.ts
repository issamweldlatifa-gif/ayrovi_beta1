// ISOLATION D'ARRIÈRE-PLAN (décision client 24/09/2026) :
//  • fond studio UNIFORME (gris, couleur) → PNG transparent (chroma-key) ;
//  • fond BLANC → redirection (le multiply de la carte suffit) ;
//  • fond COMPLEXE → redirection (l'AI payant reste une décision à part) ;
//  • cache disque par URL (un URL = un travail), garde SSRF, jamais d'image cassée.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { analyzeEdges, chromaKey, chromaKeyConnected, getIsolatedImage, hasEnclosedTransparency, isPublicHttpUrl, isolateBuffer, type RawImage } from '../src/services/imageIsolation';
import { app } from '../src/server';

const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ayrovi-isolated-'));
process.env.AYROVI_ISOLATED_CACHE_DIR = cacheDir;
process.env.AYROVI_SEGMENTATION = 'false'; // tests déterministes : pas de modèle ONNX
afterAll(() => { fs.rmSync(cacheDir, { recursive: true, force: true }); });

function rawImage(width: number, height: number, paint: (x: number, y: number) => [number, number, number]): RawImage {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const [r, g, b] = paint(x, y);
      data[offset] = r; data[offset + 1] = g; data[offset + 2] = b; data[offset + 3] = 255;
    }
  }
  return { data, width, height, channels: 4 };
}

describe('isolation — analyse des bords (pure)', () => {
  it('détecte un fond studio gris uniforme', () => {
    const analysis = analyzeEdges(rawImage(64, 64, () => [238, 238, 238]));
    expect(analysis.kind).toBe('uniform');
    expect(analysis.color).toEqual({ r: 238, g: 238, b: 238 });
  });
  it('détecte un fond blanc (multiply suffit — pas de traitement)', () => {
    expect(analyzeEdges(rawImage(64, 64, () => [255, 255, 255])).kind).toBe('white');
  });
  it('détecte un fond complexe (dégradé photo) et n\'invente rien', () => {
    expect(analyzeEdges(rawImage(64, 64, (x) => [x * 4, 40, 200 - x * 3])).kind).toBe('complex');
  });
});

describe('isolation — chroma-key (pure)', () => {
  it('retire le fond uniforme, garde le produit opaque', () => {
    const image = rawImage(40, 40, (x, y) => (x > 10 && x < 30 && y > 10 && y < 30 ? [200, 30, 30] : [221, 221, 221]));
    const keyed = chromaKey(image, { r: 221, g: 221, b: 221 });
    const alpha = (x: number, y: number) => keyed[(y * 40 + x) * 4 + 3];
    expect(alpha(5, 5)).toBe(0); // fond → transparent
    expect(alpha(20, 20)).toBe(255); // produit → opaque
  });
});

describe('isolation — pipeline sharp', () => {
  it('produit un PNG transparent pour un produit sur fond gris', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#ededed"/><rect x="60" y="60" width="80" height="80" fill="#c0392b"/></svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const result = await isolateBuffer(png);
    expect(result.kind).toBe('uniform');
    expect(result.png).not.toBeNull();
    const meta = await sharp(result.png!).metadata();
    expect(meta.hasAlpha).toBe(true);
  });
  it('redirige (aucun traitement) pour un fond blanc', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#ffffff"/><rect x="30" y="30" width="60" height="60" fill="#333"/></svg>`;
    const result = await isolateBuffer(await sharp(Buffer.from(svg)).png().toBuffer());
    expect(result.kind).toBe('white');
    expect(result.png).toBeNull();
  });
});

describe('isolation — GARDE ANTI-FUITE intérieur produit (24/09/2026)', () => {
  it('détecte un trou transparent ENFERMÉ (tache blanche dans le produit)', () => {
    // Produit gris 60×60 centré avec un trou (fond supprimé) au milieu.
    const image = rawImage(80, 80, (x, y) => {
      const inProduct = x >= 10 && x < 70 && y >= 10 && y < 70;
      const inHole = x >= 30 && x < 40 && y >= 30 && y < 40;
      return inProduct && !inHole ? [120, 120, 120] : [237, 237, 237];
    });
    chromaKey(image, { r: 237, g: 237, b: 237 }); // retire fond ET trou
    expect(hasEnclosedTransparency(image)).toBe(true);
  });

  it('ne déclenche PAS la garde pour un vrai détourage (fond ouvert au bord)', () => {
    const image = rawImage(80, 80, (x, y) => (x >= 20 && x < 60 && y >= 20 && y < 60 ? [120, 120, 120] : [237, 237, 237]));
    chromaKey(image, { r: 237, g: 237, b: 237 });
    expect(hasEnclosedTransparency(image)).toBe(false);
  });

  it('isolateBuffer ne livre AUCUN PNG troué : redirection vers l\'original', async () => {
    // Gris clair sur gris clair AVEC un trou enfermé : le chroma-key connecté
    // du pipeline peut lécher l'intérieur → sans segmentation dispo, on
    // redirige (png:null) au lieu de griffer le produit.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#e9e9e9"/><rect x="40" y="40" width="120" height="120" fill="#dcdcdc"/><rect x="90" y="90" width="20" height="20" fill="#e9e9e9"/></svg>`;
    const result = await isolateBuffer(await sharp(Buffer.from(svg)).png().toBuffer());
    if (result.png) {
      const { data, info } = await sharp(result.png).raw().toBuffer({ resolveWithObject: true });
      // Aucun pixel transparent à l'intérieur de l'emprise produit (centre).
      const center = data[((info.height * 100 + 100) * info.channels) + 3];
      expect(center).toBeGreaterThan(200);
    } else {
      expect(result.kind).toBe('uniform'); // redirection honnête
    }
  });
});

describe('isolation — TRIM هوامش شفافة (المنتج يملأ البطاقة)', () => {
  it('يقصّ الهوامش الميتة: ناتج العزل أصغر من الصورة الأصلية', async () => {
    // 200×300: خلفية #ededed + منتج أحمر 100×160 (هوامش ميتة حوله)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#ededed"/><rect x="50" y="70" width="100" height="160" fill="#c0392b"/></svg>`;
    const result = await isolateBuffer(await sharp(Buffer.from(svg)).png().toBuffer());
    expect(result.png).not.toBeNull();
    const meta = await sharp(result.png!).metadata();
    expect(meta.width).toBeLessThan(160); // بدل 200
    expect(meta.height).toBeLessThan(240); // بدل 300
    expect((meta.width ?? 0) > 80).toBe(true); // المنتج نفسه لم يبتلع
  });
});

describe('isolation — garde SSRF', () => {
  it.each([
    'http://127.0.0.1/x.jpg',
    'http://localhost/x.jpg',
    'http://192.168.1.5/x.jpg',
    'http://172.16.0.1/x.jpg',
    'http://10.0.0.2/x.jpg',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'not-a-url',
  ])('bloque %s', (url) => expect(isPublicHttpUrl(url)).toBe(false));
  it('accepte une URL marchand publique', () => {
    expect(isPublicHttpUrl('https://cdn.shop.com/product.jpg')).toBe(true);
  });
});

describe('isolation — eviction cache cohérent', () => {
  it('recalcule après éviction du PNG isolé au lieu de garder un pointeur cassé', async () => {
    const url = 'https://cdn.shop.example/stale.png';
    const key = createHash('sha256').update(url).digest('hex').slice(0, 32);
    const metaPath = path.join(cacheDir, `${key}.meta.json`);
    fs.writeFileSync(metaPath, JSON.stringify({ kind: 'uniform', file: `${key}.png` }));
    await expect(getIsolatedImage(url)).rejects.toMatchObject({ code: 'UNSAFE_URL' });
    expect(fs.existsSync(metaPath)).toBe(false);
  });
});

describe('isolation — endpoint public', () => {
  it('rejette les URLs privées sans aucun appel réseau', async () => {
    const response = await request(app).get('/api/public/media/isolated?url=http%3A%2F%2F127.0.0.1%2Fsecret.jpg');
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_IMAGE_URL');
  });

  it('ne renvoie jamais de redirection vers un hôte externe en cas de traitement impossible', async () => {
    // Les suffixes réservés (dont .example/.invalid) sont refusés avant DNS.
    const response = await request(app).get(`/api/public/media/isolated?url=${encodeURIComponent('https://cdn.shop.example/white.jpg')}`);
    expect(response.status).toBe(400);
    expect(response.headers.location).toBeUndefined();
    const routeSource = fs.readFileSync(path.resolve('src/public/routes.ts'), 'utf8');
    for (const [start, end] of [["router.get('/media/isolated'", "router.get('/media/card'"], ["router.get('/media/card'", "router.get('/media/img'"], ["router.get('/media/img'", "// Same calculation"]]) {
      const routeBlock = routeSource.split(start)[1]?.split(end)[0] || '';
      expect(routeBlock).not.toContain('res.redirect');
    }
  });
});

describe('isolation — chroma-key CONNECTÉ (fix anti-fantôme 24/09/2026)', () => {
  it('ne mange PAS un produit clair sur fond clair (l’ancien global le rendait translucide)', () => {
    // Produit #fcfcfc sur fond #eee : distance 14 — l'ancien chroma-key GLOBAL
    // l'effaçait entièrement ; le key CONNECTÉ ne retire que le fond relié au bord.
    const image = rawImage(40, 40, (x, y) => (x > 10 && x < 30 && y > 10 && y < 30 ? [252, 252, 252] : [238, 238, 238]));
    chromaKeyConnected(image, { r: 238, g: 238, b: 238 }, 12, 26);
    const alpha = (x: number, y: number) => image.data[(y * 40 + x) * 4 + 3];
    expect(alpha(5, 5)).toBe(0);      // fond connecté au bord → transparent
    expect(alpha(20, 20)).toBe(255);  // produit CLAIR au centre → opaque
    expect(alpha(15, 15)).toBe(255);  // cœur du produit intact
  });

  it('isole encore un produit contrasté sur fond gris (non-régression)', () => {
    const image = rawImage(40, 40, (x, y) => (x > 10 && x < 30 && y > 10 && y < 30 ? [200, 30, 30] : [221, 221, 221]));
    chromaKeyConnected(image, { r: 221, g: 221, b: 221 });
    const alpha = (x: number, y: number) => image.data[(y * 40 + x) * 4 + 3];
    expect(alpha(5, 5)).toBe(0);
    expect(alpha(20, 20)).toBe(255);
  });

  it('pipeline : un produit gris clair sur fond gris reste OPAQUE après isolateBuffer', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#ececec"/><rect x="50" y="50" width="100" height="100" fill="#dddddd"/></svg>`;
    const result = await isolateBuffer(await sharp(Buffer.from(svg)).png().toBuffer());
    expect(result.kind).toBe('uniform');
    expect(result.png).not.toBeNull();
    const { data, info } = await sharp(result.png!).raw().toBuffer({ resolveWithObject: true });
    // après TRIM des marges : le résultat EST le produit — centre opaque.
    const cx = info.width >> 1;
    const cy = info.height >> 1;
    const centerAlpha = data[((info.height * cy + cx) * info.channels) + 3];
    expect(centerAlpha).toBeGreaterThan(200); // le produit n'est pas un fantôme
  });
});
