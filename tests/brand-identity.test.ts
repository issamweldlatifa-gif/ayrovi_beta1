import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';
import { FONT_STACK, BRAND } from '../shared/brand.generated';
import { enforceBrandIdentity, enforceLegacyTheme, hasForbiddenFontSelection } from '../shared/identityPolicy';
import { normalizeInterfaceConfig } from '../client/src/config/interfaceConfig';
import { inspectBrandSource, auditBrand } from '../scripts/check-brand-identity.mjs';
import { orderPdfTextRuns } from '../src/services/pdfTextLayout';
import { writeSimplePdf } from '../src/services/simplePdf';
import { documentIdentityCss, mailIdentityStyle } from '../src/services/brandDocuments';
import { invoiceEmailHtml } from '../src/services/invoice';
import { authMailTemplate } from '../src/customer/accountMail';

describe('AYROVI A — enforceable identity', () => {
  test('has only the two approved local families and pure base neutrals', () => {
    expect(BRAND.fonts.map(f => f.family)).toEqual(['Zalando Sans', 'Noto Sans Arabic']);
    expect(BRAND.colors.canvas).toBe('#FFFFFF');
    expect(BRAND.colors.ink).toBe('#000000');
    expect(BRAND.colors.accent).toBe('#FF7900'); // Existing brand accent unchanged.
    expect(auditBrand()).toEqual([]);
  });
  test('normalizes legacy/malicious CMS data without mutating content or price data', () => {
    const source = { typography: { body: 'Arial; background:url(https://evil.test)', display: 'Georgia', preset: 'friendly' }, colors: { pageBackground: '#f6f5f3' }, sections: [{ id: 'hero', title: 'Actual content' }], price: { amount: 189.9 } };
    const snapshot = structuredClone(source);
    const result = enforceBrandIdentity(source);
    expect(result.typography.body).toBe(FONT_STACK);
    expect(result.typography.display).toBe(FONT_STACK);
    expect(result.typography.preset).toBe('ayrovi-a');
    expect(result.colors.pageBackground).toBe('#ffffff');
    expect(result.price).toEqual(source.price);
    expect(result.sections).toEqual(source.sections);
    expect(source).toEqual(snapshot);
    expect(enforceBrandIdentity(result)).toEqual(result);
    expect(normalizeInterfaceConfig(source).typography.body).toBe(FONT_STACK);
  });
  test.each([null, 0, '', [], 'not config'])('handles non-object legacy input %j', input => {
    expect(enforceBrandIdentity(input)).toBe(input);
    expect(normalizeInterfaceConfig(input).typography.body).toBe(FONT_STACK);
  });
  test('rejects font switches on write, including the old site_theme channel', () => {
    expect(hasForbiddenFontSelection({ typography: { body: 'Arial' } })).toBe(true);
    expect(hasForbiddenFontSelection({ typography: { preset: 'system-clean' } })).toBe(true);
    expect(hasForbiddenFontSelection({ typography: { body: FONT_STACK, display: FONT_STACK, preset: 'ayrovi-a' } })).toBe(false);
    expect(enforceLegacyTheme({ font: 'jakarta', custom: true })).toEqual({ font: FONT_STACK, custom: true });
  });
  test.each([
    ['client/src/New.css', '.x{font-family:Arial,sans-serif}'],
    ['client/src/New.css', '.x{FONT-family:Arial}'],
    ['client/src/New.tsx', 'const fontFamily = api.font; const x=<p style={{fontFamily}}>X</p>'],
    ['client/public/new.html', '<style>@import url(https://other.test/a.css);</style>'],
    ['client/public/new.html', '<link href="https://other.test/a.css" rel="stylesheet">'],
    ['client/src/New.css', '.x{font:14px Georgia}'],
    ['client/src/New.css', ':root{--font-primary:Arial}'],
    ['client/src/New.css', '@font-face{font-family:X;src:url(x.woff2)}'],
    ['client/src/New.css', '@import url(https://other.test/fonts.css);'],
    ['client/src/New.css', ':root{--ay-e-canvas:#f6f5f3}'],
    ['client/src/New.tsx', 'const x=<p style={{fontFamily:"Arial"}}>Text</p>'],
    ['client/src/New.tsx', 'const x=<p style={{fontFamily:api.font}}>Text</p>'],
    ['client/src/New.tsx', 'const x=<p className="font-mono">123</p>'],
    ['client/src/New.tsx', 'const x=<p className="font-[Georgia]">123</p>'],
    ['client/public/new.html', '<style>body{font:14px Georgia}</style>'],
    ['client/index.html', '<link href="https://fonts.googleapis.com/css2?family=Inter">'],
  ])('blocks a new bypass in %s', (file, code) => expect(inspectBrandSource(file, code).length).toBeGreaterThan(0));
  test('accepts official roles and does not mistake business text for a font', () => {
    expect(inspectBrandSource('client/src/New.css', '.x{font-family:var(--ay-font-stack);font-weight:700}')).toEqual([]);
    expect(inspectBrandSource('client/src/New.tsx', 'const x=<p className="ay-number">Inter est une marque dans ce texte.</p>')).toEqual([]);
  });
  test('generated HTML embeds real fonts and preserves HTML escaping in mail', () => {
    expect(documentIdentityCss()).toContain('data:font/woff2;base64,');
    expect(documentIdentityCss()).not.toContain('https://fonts.');
    const html = authMailTemplate(false, '<img src=x onerror=alert(1)>', '<p>Trusted template body</p>');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain(FONT_STACK);
    expect(mailIdentityStyle()).not.toContain('Arial');
    const invoice = invoiceEmailHtml({customerName:'<img src=x>',orderNumber:'TEST',invoiceNumber:'TEST',trackingCode:'000123',totalLabel:'189.900 TND',depositLabel:'50.000 TND',balanceLabel:'139.900 TND',company:'AYROVI'});
    expect(invoice).toContain(FONT_STACK);
    expect(invoice).toContain('background:#ffffff');
    expect(invoice).toContain('&lt;img');
    expect(invoice).not.toContain('<img src=x>');
  });
  test('mixed Arabic/Latin PDF ordering keeps numeric amounts and Latin brands LTR', () => {
    const runs = orderPdfTextRuns('فاتورة AYROVI 189.900 TND (2026)');
    expect(runs[0].text).toBe('AYROVI 189.900 TND (2026)');
    expect(runs.at(-1)?.text).toBe('فاتورة');
    expect(runs.find(r => r.arabic)?.level % 2).toBe(1);
    expect(orderPdfTextRuns('Client: محمد علي — 189.900 TND').map(r=>r.text).join('')).toContain('189.900');
  });
  test('PDF embeds official fonts, paginates, preserves Unicode and writes atomically', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ayrovi-font-'));
    try {
      const target = path.join(dir, 'sample.pdf');
      await writeSimplePdf([{ text: 'Facture Éléonore — 189.900 TND', bold: true }, { text: 'مرحبا بكم في أيروفي' }, { text: 'هُوِيَّة أَيْرُوفِي', bold: true }, ...Array.from({ length: 110 }, (_, i) => ({ text: `Ligne ${i} — 90,00 €`, right: true }))], target);
      const bytes = fs.readFileSync(target);
      expect(bytes.subarray(0,5).toString()).toBe('%PDF-');
      expect(fs.readdirSync(dir)).toEqual(['sample.pdf']);
      expect(fs.statSync(target).mode & 0o777).toBe(0o600);
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount()).toBeGreaterThan(1);
      const names: string[] = [];
      for (const page of pdf.getPages()) {
        const fonts = page.node.Resources()!.lookup(PDFName.of('Font'), PDFDict);
        for (const [,ref] of fonts.entries()) {
          const font = pdf.context.lookup(ref, PDFDict);
          names.push(String(font.get(PDFName.of('BaseFont'))));
          expect(font.has(PDFName.of('ToUnicode'))).toBe(true);
        }
      }
      expect(names.some(n => n.includes('Zalando'))).toBe(true);
      expect(names.some(n => n.includes('Noto'))).toBe(true);
      expect(names.every(n => /Zalando|Noto/.test(n))).toBe(true);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
