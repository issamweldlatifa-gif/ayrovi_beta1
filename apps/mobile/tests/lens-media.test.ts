import { describe, expect, it } from 'vitest';
import { parseCandidate } from '../src/api/lens';
import { lensGallery, lensMediaChain } from '../src/features/lens/lensMedia';

const product = parseCandidate({
  id: 'p1',
  sourceUrl: 'https://shop.example/p/1',
  title: 'Produit',
  image: 'https://cdn.example/main.jpg',
  images: ['https://cdn.example/main.jpg', 'https://cdn.example/side.jpg'],
  colorImages: { rouge: ['https://cdn.example/red.jpg'] },
});

describe('Lens — chaîne média native', () => {
  it('une image marchand tente composition, isolation, proxy puis original', () => {
    const chain = lensMediaChain('https://cdn.example/product.jpg', 'card');
    expect(chain).toHaveLength(4);
    expect(chain[0]).toContain('/api/public/media/card?');
    expect(chain[0]).toContain('w=600');
    expect(chain[1]).toContain('/api/public/media/isolated?');
    expect(chain[2]).toContain('/api/public/media/img?');
    expect(chain[2]).toContain('w=480');
    expect(chain[3]).toBe('https://cdn.example/product.jpg');
  });

  it('charge une miniature par le proxy léger avant les transformations longues', () => {
    const chain = lensMediaChain('https://cdn.example/product.jpg', 'thumb');
    expect(chain).toHaveLength(4);
    expect(chain[0]).toContain('/api/public/media/img?');
    expect(chain[0]).toContain('w=156');
    expect(chain[1]).toContain('/api/public/media/card?');
    expect(chain[2]).toContain('/api/public/media/isolated?');
  });

  it('un média local au serveur n’est pas envoyé dans le pipeline distant', () => {
    expect(lensMediaChain('/media/catalogue/a.jpg')).toEqual(['/media/catalogue/a.jpg']);
  });

  it('la galerie ne transforme pas les replis en fausses diapositives', () => {
    const gallery = lensGallery(product);
    expect(gallery).toHaveLength(2);
    expect(gallery[0].uris).toHaveLength(4);
  });

  it('la couleur choisie remplace la galerie générale quand le marchand la fournit', () => {
    const gallery = lensGallery(product, 'Rouge');
    expect(gallery.map((item) => item.original)).toEqual(['https://cdn.example/red.jpg']);
  });
});
