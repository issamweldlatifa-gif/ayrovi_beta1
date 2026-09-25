// ISOLATION D'ARRIÈRE-PLAN (décision client 24/09/2026) :
//  • fond studio UNIFORME (gris, couleur) → PNG transparent (chroma-key) ;
//  • fond BLANC → redirection (le multiply de la carte suffit) ;
//  • fond COMPLEXE → redirection (l'AI payant reste une décision à part) ;
//  • cache disque par URL (un URL = un travail), garde SSRF, jamais d'image cassée.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { promises as dns } from 'node:dns';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { analyzeEdges, chromaKey, chromaKeyConnected, hasEnclosedTransparency, isPublicHttpUrl, isolateBuffer, type RawImage } from '../src/services/imageIsolation';
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
    'https://cdn.shop.example/photo.jpg', // reserved hostname is not public
    'http://192.168.1.5/x.jpg',
    'http://172.16.0.1/x.jpg',
    'http://10.0.0.2/x.jpg',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'not-a-url',
  ])('bloque %s', (url) => expect(isPublicHttpUrl(url)).toBe(false));
  it('accepte une URL marchand publique', () => {
    expect(isPublicHttpUrl('https://cdn.ayrovi.com/product.jpg')).toBe(true);
  });
});

describe('isolation — endpoint public', () => {
  const grayProduct = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#ededed"/><rect x="60" y="60" width="80" height="80" fill="#c0392b"/></svg>`;
  const remote = 'https://cdn.ayrovi.com/gray-studio.jpg';
  let fetchCalls = 0;

  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    fetchCalls = 0;
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as any);
  });

  it('sert un PNG transparent pour un fond studio, puis sert depuis le cache', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      fetchCalls += 1;
      return new Response(await sharp(Buffer.from(grayProduct)).png().toBuffer(), { status: 200, headers: { 'content-type': 'image/png' } });
    }));
    const first = await request(app).get(`/api/public/media/isolated?url=${encodeURIComponent(remote)}`);
    expect(first.status).toBe(200);
    expect(first.headers['content-type']).toContain('image/png');
    const meta = await sharp(first.body).metadata();
    expect(meta.hasAlpha).toBe(true);
    const second = await request(app).get(`/api/public/media/isolated?url=${encodeURIComponent(remote)}`);
    expect(second.status).toBe(200);
    expect(fetchCalls).toBe(1); // le cache disque évite le second téléchargement
    vi.unstubAllGlobals();
  });

  it('redirige vers l\'original pour un fond blanc ou complexe', async () => {
    const white = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#ffffff"/></svg>`;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await sharp(Buffer.from(white)).png().toBuffer(), { status: 200 })));
    const response = await request(app).get(`/api/public/media/isolated?url=${encodeURIComponent('https://cdn.ayrovi.com/white.jpg')}`);
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('https://cdn.ayrovi.com/white.jpg');
    vi.unstubAllGlobals();
  });

  it('rejette les URLs privées (SSRF) sans aucun appel réseau', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const response = await request(app).get('/api/public/media/isolated?url=http%3A%2F%2F127.0.0.1%2Fsecret.jpg');
    expect(response.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
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

describe('image pipeline: conservative classification, original-preserving fallbacks', () => {
  it('measures the actual left/right edge columns on a rectangular image', () => {
    const image = rawImage(160, 100, (x, y) => [x < 3 ? 20 : x > 156 ? 230 : y < 3 ? 90 : 110, 0, 0]);
    // Both vertical sides differ from the horizontal band, never "uniform".
    expect(analyzeEdges(image).kind).toBe('complex');
  });
  it('does not crop lifestyle banners even if the edge color looks uniform', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="160"><rect width="600" height="160" fill="#eeeeee"/><rect x="200" y="40" width="180" height="100" fill="red"/></svg>';
    expect(await isolateBuffer(await sharp(Buffer.from(svg)).png().toBuffer())).toMatchObject({ kind: 'complex', png: null });
  });
  it('keeps an already transparent merchant PNG untouched', async () => {
    const png = await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 80, g: 40, b: 60, alpha: 0.6 } } }).png().toBuffer();
    expect(await isolateBuffer(png)).toMatchObject({ kind: 'transparent', png: null });
  });
  it('does not follow a redirect to private metadata IP', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as any);
    const mock = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }));
    vi.stubGlobal('fetch', mock);
    const { fetchRemoteImage } = await import('../src/services/imageIsolation');
    await expect(fetchRemoteImage('https://cdn.ayrovi.com/photo.png')).rejects.toThrow();
    expect(mock).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
});
