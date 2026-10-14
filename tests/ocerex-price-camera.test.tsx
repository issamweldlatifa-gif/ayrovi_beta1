import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { OcerexHome } from '../client/src/features/ocerex/screens/OcerexHome';
import { LocaleProvider } from '../client/src/i18n/LocaleContext';

const source = readFileSync('client/src/features/ocerex/screens/OcerexHome.tsx', 'utf8');

describe('OCEREX — capture du prix sur l’étiquette (maquette 4)', () => {
  it('ouvre la caméra arrière en direct et garde la capture native en secours', () => {
    expect(source).toContain("navigator.mediaDevices?.getUserMedia");
    expect(source).toContain("facingMode: { ideal: 'environment' }");
    expect(source).toContain('capture="environment"');
  });

  it('ne lit aucun code-barres : seul le prix est demandé', () => {
    expect(source).not.toMatch(/barcode|BarcodeDetector|code-barres/i);
  });

  it('affiche le cadre et le libellé de la maquette, et les deux modes', () => {
    const html = renderToStaticMarkup(<LocaleProvider><OcerexHome busy={false} onFile={() => {}} /></LocaleProvider>);
    expect(html).toContain('Cadrez le prix sur l’étiquette');
    expect(html).toContain('Prendre une photo');
    expect(html).toContain('Importer une image');
    expect(html).toContain('Prendre la photo du prix');
  });
});

describe('OCEREX — prix en dinars et photos de la session', () => {
  it('le prix de référence en DT est calculé par le serveur avec le taux du devis', () => {
    const routes = readFileSync('src/ocerex/routes.ts', 'utf8');
    expect(routes).toContain('const rate = row.currency ? getExchangeRate(rules, row.currency) : null;');
    expect(routes).toContain('referenceTnd = row.reference_price != null && rate != null ? millimes(Number(row.reference_price) * rate) : null;');
  });

  it('l’écran de résultat affiche le montant en DT quand il existe, sans € en dur', () => {
    const result = readFileSync('client/src/features/ocerex/screens/OcerexResult.tsx', 'utf8');
    expect(result).toContain('extraction.referenceTnd != null');
    expect(result).toContain("maximumFractionDigits: 2 }).format(extraction.referenceTnd)} DT");
    expect(result).not.toContain("'EUR'");
  });

  it('les miniatures restent en mémoire de la page : aucune écriture stockage ni envoi', () => {
    expect(source).toContain('const sessionPhotos');
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    expect(source).toContain('URL.revokeObjectURL');
  });
});
