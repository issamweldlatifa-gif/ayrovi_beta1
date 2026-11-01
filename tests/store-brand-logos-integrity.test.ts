import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const STORES_DIR = path.join(ROOT, 'client/public/stores');
const MEDIA_BRANDS_DIR = path.join(ROOT, 'client/public/media/brands');
const SRC_BRANDS_DIR = path.join(ROOT, 'client/src/assets/brands');

function sha256(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

describe('intégrité des logos boutiques & marques (zéro collision inter-enseignes)', () => {
  it('aucun fichier dans client/public/stores/*.png ne partage le SHA-256 d’une autre boutique', () => {
    const files = fs.readdirSync(STORES_DIR).filter((f) => f.endsWith('.png')).sort();
    expect(files.length).toBeGreaterThan(350);

    const byHash = new Map<string, string[]>();
    for (const file of files) {
      const digest = sha256(path.join(STORES_DIR, file));
      const group = byHash.get(digest) ?? [];
      group.push(file);
      byHash.set(digest, group);
    }

    const duplicates = [...byHash.values()].filter((group) => group.length > 1);
    expect(duplicates).toEqual([]);
  });

  it('client/src/assets/brands et client/public/media/brands sont synchronisés et sans collision', () => {
    const srcFiles = fs.readdirSync(SRC_BRANDS_DIR).filter((f) => /\.(jpg|jpeg|png)$/i.test(f)).sort();
    const pubFiles = fs.readdirSync(MEDIA_BRANDS_DIR).filter((f) => /\.(jpg|jpeg|png)$/i.test(f)).sort();
    expect(srcFiles).toEqual(pubFiles);

    const byHash = new Map<string, string>();
    for (const file of srcFiles) {
      const hSrc = sha256(path.join(SRC_BRANDS_DIR, file));
      const hPub = sha256(path.join(MEDIA_BRANDS_DIR, file));
      expect(hSrc, `${file} diverge entre src/assets/brands et public/media/brands`).toBe(hPub);
      expect(byHash.get(hSrc), `collision de marque sur ${file}`).toBeUndefined();
      byHash.set(hSrc, file);
    }
  });

  it('PartnerBrandsSlider ne retombe jamais sur le logo d’une autre marque par modulo d’index', () => {
    const raw = fs.readFileSync(path.join(ROOT, 'client/src/components/PartnerBrandsSlider.tsx'), 'utf8');
    const codeOnly = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(codeOnly).not.toMatch(/fallbackBrands\[index\s*%/);
  });
});
