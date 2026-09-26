/*
 * FACTURE VÉRIFIABLE — le QR (25/09/2026).
 *
 * Une facture imprimée n'est qu'un papier : rien n'y prouvait qu'elle
 * correspondait à une commande réelle. Le QR porte de quoi la rapprocher de nos
 * registres — et rien d'autre : aucune donnée personnelle, car un QR se
 * photographie de loin et se partage.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildInvoiceQrPayload, invoiceQrSvg, renderInvoiceQrSvg } from '../src/services/invoiceQr';

const input = {
  issuer: 'AYROVI SARL',
  taxId: '1234567/A/M/000',
  invoiceNumber: 'FAC-2026-0042',
  orderNumber: 'AYR-518234',
  issuedOn: '2026-09-25',
  totalTnd: 118.9,
  verifyUrl: 'https://ayrovi.tn/facture/FAC-2026-0042',
};

describe('charge utile du QR', () => {
  it('identifie la pièce : émetteur, numéro, commande, date, total, devise', () => {
    const payload = buildInvoiceQrPayload(input);
    expect(payload).toContain('ISS:AYROVI SARL');
    expect(payload).toContain('INV:FAC-2026-0042');
    expect(payload).toContain('ORD:AYR-518234');
    expect(payload).toContain('DATE:2026-09-25');
    expect(payload).toContain('TTC:118.900');
    expect(payload).toContain('CUR:TND');
    expect(payload).toContain('TAX:1234567/A/M/000');
  });

  it('ne contient AUCUNE donnée personnelle', () => {
    const payload = buildInvoiceQrPayload(input).toLowerCase();
    for (const forbidden of ['nom', 'name', 'adresse', 'address', 'tel', 'phone', 'email', '@']) {
      expect(payload.includes(forbidden), forbidden).toBe(false);
    }
  });

  it('n’écrit pas un champ vide : pas de « TAX: » creux', () => {
    const payload = buildInvoiceQrPayload({ ...input, taxId: '', verifyUrl: '' });
    expect(payload).not.toContain('TAX:');
    expect(payload).not.toContain('URL:');
    expect(payload).toContain('INV:FAC-2026-0042');
  });

  it('le montant est écrit comme sur la facture : trois décimales', () => {
    expect(buildInvoiceQrPayload({ ...input, totalTnd: 7 })).toContain('TTC:7.000');
    expect(buildInvoiceQrPayload({ ...input, totalTnd: 118.8996 })).toContain('TTC:118.900');
  });
});

describe('rendu du QR', () => {
  it('est un SVG net à toute taille, sans image binaire', () => {
    const svg = invoiceQrSvg(input, 160);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('width="160"');
    expect(svg).not.toContain('base64');
    expect(svg).toContain('<path d="M');
  });

  it('reste lisible : fond blanc, modules noirs, marge normalisée', () => {
    const svg = renderInvoiceQrSvg('AYROVI:1|INV:X', { size: 120 });
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('fill="#000000"');
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
  });

  it('deux factures différentes ne produisent jamais le même code', () => {
    const a = invoiceQrSvg(input);
    const b = invoiceQrSvg({ ...input, invoiceNumber: 'FAC-2026-0043' });
    expect(a).not.toBe(b);
  });

  it('la même facture produit toujours le même code — une pièce est stable', () => {
    expect(invoiceQrSvg(input)).toBe(invoiceQrSvg({ ...input }));
  });
});

describe('intégration dans la facture', () => {
  const source = readFileSync('src/services/invoice.ts', 'utf8');

  it('le QR est posé sur la facture électronique', () => {
    expect(source).toContain('invoiceQrSvg({');
    expect(source).toContain('FACTURE ÉLECTRONIQUE');
  });

  it('l’identifiant fiscal vient des réglages, il n’est jamais inventé', () => {
    expect(source).toContain("setting('company_tax_id', '')");
  });
});
