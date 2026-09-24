// CAPTURE DE GALERIE UNIVERSELLE (signalement client 24/09 11:06 — Kiabi
// «2/2» alors que le marchand affiche plus de photos) : l'ancienne liste
// d'autorisation marchands (ztat/media-amazon/shein/zara/asos) jetait les
// galeries JSON de tous les AUTRES marchands. Le DOM statique ne porte que
// les 2 premières slides — la galerie complète vit dans le JSON embarqué.
// Contrat : TOUTES les URLs d'images des scripts JSON passent, SAUF le bruit
// (logos, icônes, bannières, paiement, tracking…).
import { describe, expect, it } from 'vitest';
import { parseProductPageHtml } from '../src/scraper/productPageParser';

const GALLERY = [
  'https://cdn.funcy-cache.kiabi.com/lilly11_front.jpg?imwidth=1000',
  'https://cdn.funcy-cache.kiabi.com/lilly11_back.jpg?imwidth=1000',
  'https://cdn.funcy-cache.kiabi.com/lilly11_detail_poches.jpg?imwidth=1000',
  'https://cdn.funcy-cache.kiabi.com/lilly11_detail_taille.jpg?imwidth=1000',
  'https://cdn.funcy-cache.kiabi.com/lilly11_porte.jpg?imwidth=1000',
  'https://cdn.funcy-cache.kiabi.com/lilly11_tissu_zoom.jpg?imwidth=1000',
];
const NOISE = [
  'https://cdn.funcy-cache.kiabi.com/kiabi_logo_header.png',
  'https://cdn.funcy-cache.kiabi.com/home_banner_etudiante.jpg',
  'https://cdn.funcy-cache.kiabi.com/payment_icone_cb.png',
  'https://cdn.funcy-cache.kiabi.com/pixel_tracking.gif'.replace('.gif', '.png'),
];

function htmlWith(jsonBody: string, domImages = ''): string {
  return `<html><head><title>Test</title>
    <script type="application/json">{${jsonBody}}</script>
    <script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Pantalon LILLY', image: GALLERY[0], offers: { price: 39, priceCurrency: 'EUR' } })}</script>
  </head><body>
    <h1>Pantalon femme 100% cachemire - LILLY 11</h1>
    <div class="slider">${domImages}</div>
  </body></html>`;
}

describe('capture de galerie — le JSON marchand n\'est plus jeté', () => {
  it('collecte TOUTE la galerie JSON d\'un marchand hors liste d\'autorisation (Kiabi)', () => {
    const jsonBody = `"gallery":[${GALLERY.concat(NOISE).map((u) => JSON.stringify(u)).join(',')}]`;
    const parsed = parseProductPageHtml(htmlWith(jsonBody), 'https://www.kiabi.com/p', 'generic');
    for (const url of GALLERY) expect(parsed.images).toContain(url);
    for (const url of NOISE) expect(parsed.images).not.toContain(url);
  });

  it('garde les marchands de la liste d\'autorisation historique (ztat…)', () => {
    const ztat = 'https://img01.ztat.net/article/spp.jpg?imwidth=1000';
    const jsonBody = `"media":[{"uri":"${ztat}"}]`;
    const parsed = parseProductPageHtml(htmlWith(jsonBody), 'https://www.zalando.fr/p', 'generic');
    expect(parsed.images).toContain(ztat);
  });

  it('continue de lire le DOM paresseux (data-src, srcset)', () => {
    const dom = `<img data-src="https://cdn.tn/slide3.jpg" src="placeholder.gif">
      <img srcset="https://cdn.tn/slide4.jpg 800w, https://cdn.tn/slide4_big.jpg 1600w" src="small.jpg">`;
    const jsonBody = `"unused":true`;
    const parsed = parseProductPageHtml(htmlWith(jsonBody, dom), 'https://shop.tn/p', 'generic');
    expect(parsed.images).toContain('https://cdn.tn/slide3.jpg');
    expect(parsed.images).toContain('https://cdn.tn/slide4.jpg');
    expect(parsed.images).toContain('https://cdn.tn/slide4_big.jpg');
  });
});
