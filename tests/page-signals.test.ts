/**
 * SIGNAUX DE FICHE MARCHANDE — textes RÉELS des fiches Zalando.
 *
 * Les phrases ci-dessous ne sont PAS inventées : elles ont été relevées telles
 * quelles sur les captures du client (16/10/2026, fiches Jordan / Marks &
 * Spencer / Calvin Klein / Severin). Le HTML qui les entoure est, lui, un
 * emballage minimal d'écriture maison : ce test vérifie que l'extracteur
 * retrouve un texte réel dans une page, pas qu'il devine une structure.
 */
import { describe, expect, it } from 'vitest';

import { readPageSignals } from '../src/scraper/pageSignals';
import { parseProductPageHtml } from '../src/scraper/productPageParser';

const ZALANDO_LIKE_PAGE = `<!doctype html>
<html lang="fr"><head>
  <meta property="og:title" content="CREWNECK - Pullover - gris" />
  <meta property="product:price:amount" content="18.50" />
  <meta property="product:price:currency" content="EUR" />
  <title>CREWNECK - Pullover - gris | Zalando</title>
</head><body>
  <div class="badge">Dernières pièces</div>
  <p>Notre mannequin (190 cm) porte une taille XL</p>
  <h1>Marks &amp; Spencer</h1>
  <span>18,50 €</span>
  <span>Prix conseillé 39,00</span>
  <div class="size-advice">Nous vous recommandons de choisir une taille au-dessus de celle habituelle.</div>
  <button aria-label="Voir les informations sur la fabrication">Voir les informations sur la fabrication</button>
  <p>Fabriqué en Turquie</p>
  <div class="delivery">Livraison rapide 23 octobre-29 octobre</div>
  <div class="promo">Se termine dans 1j4h22m</div>
</body></html>`;

const EMPTY_PAGE = `<!doctype html><html><head><title>Sans signal</title></head><body>
  <p>Une fiche qui ne publie ni conseil de taille, ni mannequin, ni livraison.</p>
</body></html>`;

describe('signaux de fiche marchande', () => {
  it('relève les cinq signaux publiés, mot pour mot', () => {
    const signals = readPageSignals(ZALANDO_LIKE_PAGE.replace(/<[^>]+>/g, ' '));

    expect(signals.modelInfo).toBe('Notre mannequin (190 cm) porte une taille XL');
    expect(signals.sizeAdvice).toBe('Nous vous recommandons de choisir une taille au-dessus de celle habituelle.');
    expect(signals.manufacturingInfo).toBe('Turquie');
    expect(signals.deliveryEstimate).toBe('23 octobre-29 octobre');
    expect(signals.promoCountdown).toBe('1j4h22m');
  });

  it('ne fabrique RIEN quand la page ne publie pas ces informations', () => {
    const signals = readPageSignals(EMPTY_PAGE.replace(/<[^>]+>/g, ' '));
    expect(signals).toEqual({});
  });

  it('remonte les signaux dans la lecture complète de la page', () => {
    const parsed = parseProductPageHtml(ZALANDO_LIKE_PAGE, 'https://www.zalando.fr/pullover.html', 'other');

    expect(parsed.signals?.modelInfo).toBe('Notre mannequin (190 cm) porte une taille XL');
    expect(parsed.signals?.sizeAdvice).toBe('Nous vous recommandons de choisir une taille au-dessus de celle habituelle.');
    expect(parsed.signals?.deliveryEstimate).toBe('23 octobre-29 octobre');
    expect(parsed.signals?.promoCountdown).toBe('1j4h22m');
    // Le prix publié reste la priorité : un signal ne remplace jamais un montant.
    expect(parsed.price).toBe(18.5);
    expect(parsed.currency).toBe('EUR');
  });

  it('n’invente aucune équivalence de taille : aucun tableau FR ↔ US n’est produit', () => {
    const signals = readPageSignals('Tailles 40 41 42 disponibles. FR / SUR L’ÉTIQUETTE (US). Plus que 3 disponibles.');
    expect(signals.sizeAdvice).toBeUndefined();
    expect(signals.modelInfo).toBeUndefined();
    expect(JSON.stringify(signals)).not.toMatch(/US|UK/);
  });
});
