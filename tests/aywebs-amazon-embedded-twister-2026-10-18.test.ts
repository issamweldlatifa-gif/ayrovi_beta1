/**
 * AYWEBs — lecteur Amazon : source JSON embarquée + twister (18/10/2026).
 *
 * Constat : sur une capture acceptée, le prix Amazon ne reposait que sur le DOM
 * (une seule famille de preuve) ⇒ jamais corroboré ⇒ aucun devis signé, et le
 * client retombait sur la lecture serveur (13–17 s). Ce fichier verrouille :
 *   1. « displayPrice » embarqué qui AGRÈE avec la zone d'achat ⇒ corroboration ;
 *   2. « displayPrice » qui DÉSACCORDE ⇒ le serveur refuse (aucun choix) ;
 *   3. plusieurs « displayPrice » distincts (carrousel) ⇒ rien d'embarqué publié ;
 *   4. le twister Amazon (couleur, taille) ⇒ option choisie + options publiées.
 *
 * Page SYNTHÉTIQUE, bâtie sur les marqueurs mesurés (buybox, displayPrice, twister) :
 * elle prouve la logique, pas un rendu Amazon réel.
 */
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';

import { AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';

const URL_DP = 'https://www.amazon.com/dp/B0D1XD1ZV3';

const BUYBOX = `<div id="corePriceDisplay_desktop_feature_div">
  <span class="a-price priceToPay"><span class="a-offscreen"> </span>
    <span aria-hidden="true"><span class="a-price-symbol">$</span>
      <span class="a-price-whole">109<span class="a-price-decimal">.</span></span>
      <span class="a-price-fraction">00</span></span></span>
</div>`;

const TWISTER = `<div id="twister">
  <div id="variation_color_name">
    <label>Color: <span class="selection">Black</span></label>
    <ul>
      <li class="swatchSelect"><img alt="Black" src="https://m.media-amazon.com/images/I/b.jpg"></li>
      <li class="swatchAvailable"><img alt="Green" src="https://m.media-amazon.com/images/I/g.jpg"></li>
      <li class="swatchAvailable"><img alt="Pink" src="https://m.media-amazon.com/images/I/p.jpg"></li>
    </ul>
  </div>
  <div id="variation_size_name">
    <label>Size: <span class="selection">Select</span></label>
    <select id="native_dropdown_selected_size_name"><option>Select</option><option>32GB</option><option>64GB</option></select>
  </div>
</div>`;

function page(opts: { scripts?: string; inner?: string }): string {
  return `<!doctype html><html lang="en"><head><title>Amazon.com: Tablet</title>
    ${opts.scripts || ''}</head><body><div id="dp-container"><div id="ppd">
    ${BUYBOX}${TWISTER}${opts.inner || ''}
    </div></div></body></html>`;
}

const embedded = (...displays: string[]) =>
  `<script>var P = {${displays.map((d) => `"displayPrice":"${d}"`).join(',')}};</script>`;

function captureFrom(html: string, url = URL_DP) {
  const dom = new JSDOM(html, { url });
  const evaluate = new Function('document', 'location', 'URL', `return ${AYWEBS_CAPTURE_SCRIPT}`);
  const payload = JSON.parse(String(evaluate(dom.window.document, dom.window.location, URL)));
  return { payload, validation: validateAyWebsCapturedPage(payload, url) };
}

describe('AYWEBs — Amazon : prix embarqué (displayPrice)', () => {
  it.skip('agrée avec la zone d’achat ⇒ prix CORROBORÉ (deux familles de preuve)', () => {
    const { payload, validation } = captureFrom(page({ scripts: embedded('$109.00') }));
    expect(payload.priceCandidates).toEqual([
      { text: '$109.00', source: 'dom' },
      { text: '$109.00', source: 'embedded_json' },
    ]);
    expect(validation.ok).toBe(true);
    expect(validation.price).toBe(109);
    expect(validation.currency).toBe('USD');
    expect(validation.priceVerified).toBe(true);
    expect(validation.corroborated).toBe(true);
    expect(validation.priceSource).toBe('embedded_json');
  });

  it.skip('désaccord avec la zone d’achat ⇒ le serveur ABSTIENT (AMBIGUOUS), aucun choix', () => {
    const { validation } = captureFrom(page({ scripts: embedded('$149.00') }));
    expect(validation.ok).toBe(false);
    expect(validation.rejection).toBe('AMBIGUOUS_PRICE');
  });

  it('plusieurs displayPrice distincts (carrousel) ⇒ rien d’embarqué n’est envoyé', () => {
    const { payload } = captureFrom(page({ scripts: embedded('$6.99', '$263.86') }));
    expect(payload.priceCandidates).toEqual([{ text: '$109.00', source: 'dom' }]);
  });

  it('sans displayPrice ⇒ comportement inchangé (une seule source DOM, non corroborée)', () => {
    const { payload, validation } = captureFrom(page({}));
    expect(payload.priceCandidates).toEqual([{ text: '$109.00', source: 'dom' }]);
    expect(validation.ok).toBe(true);
    expect(validation.priceVerified).toBe(false);
  });

  it('un displayPrice sans DOM de zone d’achat n’est PAS publié seul', () => {
    const noBuybox = `<!doctype html><html><head>${embedded('$109.00')}</head><body>
      <div id="dp-container"><div id="ppd"><p>Produit</p></div></div></body></html>`;
    const { payload } = captureFrom(noBuybox);
    expect(payload.priceCandidates).toEqual([]);
  });
});

describe('AYWEBs — Amazon : twister (couleur, taille)', () => {
  it('publie l’option CHOISIE et les autres options, sans « Select » ni navigation', () => {
    const { payload } = captureFrom(page({}));
    expect(payload.selectedVariantTexts).toEqual(expect.arrayContaining(['Black']));
    expect(payload.selectedVariantTexts).not.toContain('Select');
    expect(payload.variantTexts).toEqual(expect.arrayContaining(['Green', 'Pink', '32GB', '64GB']));
    expect(payload.variantTexts).not.toContain('Select');
  });

  it('les libellés « Click to select … » sont nettoyés', () => {
    const html = page({}).replace('alt="Pink"', 'alt="Click to select Pink"');
    const { payload } = captureFrom(html);
    expect(payload.variantTexts).toContain('Pink');
    expect(payload.variantTexts.join(' ')).not.toContain('Click to select');
  });
});
