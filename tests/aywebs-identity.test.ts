/**
 * AYWEBs — IDENTITÉ MARCHANDE DÉTERMINISTE (25/10/2026).
 *
 * La VAGUE 2 promeut 367 marchands sans qu'aucun site n'ait été visité. Le
 * pays et la devise ne peuvent donc être remplis que par une RÈGLE vérifiable,
 * jamais par une supposition : extension nationale non ambiguë → identité
 * connue ; domaine générique (.com, .net, extension de marque) → chaînes vides.
 * La devise réelle est établie à la capture et passe par le moteur de tarif.
 *
 * Ce fichier verrouille :
 *   1. chaque ccTLD connue donne le bon couple pays/devise, y compris les
 *      domaines de second niveau (.co.uk, .com.au, .co.jp) ;
 *   2. les domaines génériques restent VIDES (pas de défaut US/USD deviné) ;
 *   3. les URL illisibles et les extensions inconnues donnent le vide ;
 *   4. la fonction ne renvoie jamais d'état moitié (pays sans devise) ;
 *   5. le résultat est une copie : le muter ne pollue pas les appels suivants.
 */
import { describe, expect, it } from 'vitest';

import { CATALOG_ROWS, resolveStoreIdentity } from '../shared/aywebsStoreCatalog';

describe('resolveStoreIdentity — extensions nationales', () => {
  const cases: ReadonlyArray<[string, string, string]> = [
    ['https://www.next.co.uk', 'GB', 'GBP'],
    ['https://www.saturn.de', 'DE', 'EUR'],
    ['https://www.conforama.fr', 'FR', 'EUR'],
    ['https://www.coolblue.nl', 'NL', 'EUR'],
    ['https://www.rakuten.co.jp', 'JP', 'JPY'],
    ['https://www.petvalu.ca', 'CA', 'CAD'],
    ['https://www.ica.se', 'SE', 'SEK'],
    ['https://shop.example.com.au', 'AU', 'AUD'],
    ['https://www.example.net.au', 'AU', 'AUD'],
    ['https://www.example.co.nz', 'NZ', 'NZD'],
    ['https://www.allegro.pl', 'PL', 'PLN'],
    ['https://www.example.ch', 'CH', 'CHF'],
    ['https://www.example.dk', 'DK', 'DKK'],
    ['https://www.example.cz', 'CZ', 'CZK'],
    ['https://www.example.co.za', 'ZA', 'ZAR'],
    ['https://www.example.com.br', 'BR', 'BRL'],
    ['https://www.example.com.mx', 'MX', 'MXN'],
    ['https://www.example.in', 'IN', 'INR'],
    ['https://www.example.ae', 'AE', 'AED'],
    ['https://www.example.sg', 'SG', 'SGD'],
  ];

  for (const [url, country, currency] of cases) {
    it(`${url} → ${country}/${currency}`, () => {
      expect(resolveStoreIdentity(url)).toEqual({ country, currency });
    });
  }
});

describe('resolveStoreIdentity — domaines génériques : le vide, pas une devinette', () => {
  const generic = [
    'https://www.ebay.com',
    'https://jp.mercari.com',
    'https://shop.mango.com',
    'https://www.pandora.net',
    'https://bookshop.org',
    'https://nothing.tech',
    'https://secretlab.co',
    'https://www.e.leclerc',
    'https://frame.work',
  ];

  for (const url of generic) {
    it(`${url} reste sans identité`, () => {
      expect(resolveStoreIdentity(url)).toEqual({ country: '', currency: '' });
    });
  }
});

describe('resolveStoreIdentity — robustesse', () => {
  it("URL illisible, vide ou sans host → l'identité vide, jamais d'erreur", () => {
    for (const raw of ['', 'pas une url', '???', 'https://']) {
      expect(resolveStoreIdentity(raw)).toEqual({ country: '', currency: '' });
    }
  });

  it("ne renvoie jamais un état moitié (pays rempli, devise vide, ou l'inverse)", () => {
    for (const [, , homeUrl] of CATALOG_ROWS) {
      const { country, currency } = resolveStoreIdentity(homeUrl);
      expect(Boolean(country)).toBe(Boolean(currency));
    }
  });

  it('renvoie une copie : muter le résultat ne pollue pas les appels suivants', () => {
    const first = resolveStoreIdentity('https://www.saturn.de');
    first.country = 'XX';
    first.currency = 'XXX';
    expect(resolveStoreIdentity('https://www.saturn.de')).toEqual({ country: 'DE', currency: 'EUR' });
  });

  it("couvre tout le catalogue : un couple rempli est toujours un couple cohérent", () => {
    const seen = new Set<string>();
    for (const [, , homeUrl] of CATALOG_ROWS) {
      const { country, currency } = resolveStoreIdentity(homeUrl);
      if (country) seen.add(`${country}/${currency}`);
    }
    /* Cohérence avec les extensions réellement présentes dans les données. */
    expect([...seen].sort()).toEqual(
      ['AU/AUD', 'CA/CAD', 'DE/EUR', 'FR/EUR', 'GB/GBP', 'JP/JPY', 'NL/EUR', 'SE/SEK'].sort(),
    );
  });
});
