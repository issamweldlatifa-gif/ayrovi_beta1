/** Local, embedded-font PDF writer. No browser, network, system fonts or Latin-1 loss.
 * Async completion is explicit: callers must await the atomic write before sending the file. */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PDFDocument, PDFFont, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { orderPdfTextRuns } from './pdfTextLayout';

export interface PdfLine {
  text: string;
  x?: number;
  size?: number;
  bold?: boolean;
  color?: [number, number, number];
  right?: boolean;
  rule?: boolean;
}
const PAGE_W = 595, PAGE_H = 842, MARGIN = 50, BOTTOM = 60, RIGHT_X = PAGE_W - MARGIN;
const arabic = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u;
const bytes = new Map<string, Buffer>();
function localFont(file: string) {
  if (!bytes.has(file)) bytes.set(file, fs.readFileSync(path.resolve(file)));
  return bytes.get(file)!;
}
export async function writeSimplePdf(lines: PdfLine[], filePath: string): Promise<string> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setProducer('AYROVI A — embedded official fonts');
  const regular = await doc.embedFont(localFont('assets/fonts/ZalandoSans-Regular.ttf'), { subset: true });
  const bold = await doc.embedFont(localFont('assets/fonts/ZalandoSans-Bold.ttf'), { subset: true });
  // Do not ship an Arabic font in Latin-only invoices unnecessarily.
  const ar = lines.some(line => arabic.test(line.text))
    ? await doc.embedFont(localFont('assets/fonts/NotoSansArabic-Regular.ttf'), { subset: true }) : null;
  const arBold = ar && lines.some(line => line.bold && arabic.test(line.text))
    ? await doc.embedFont(localFont('assets/fonts/NotoSansArabic-Bold.ttf'), { subset: true }) : ar;
  const runs = (text: string, strong: boolean) => {
    const result: { text: string; font: PDFFont }[] = [];
    for (const ch of text) {
      const font = arabic.test(ch) && ar ? (strong ? arBold! : ar) : strong ? bold : regular;
      const last = result[result.length - 1];
      if (last?.font === font) last.text += ch;
      else result.push({ text: ch, font });
    }
    return result;
  };
  const width = (text: string, size: number, strong: boolean) => runs(text, strong).reduce((sum, run) => sum + run.font.widthOfTextAtSize(run.text, size), 0);
  let page = doc.addPage([PAGE_W, PAGE_H]), y = PAGE_H - MARGIN;
  const next = (step: number) => { if (y - step < BOTTOM) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; } y -= step; };
  for (const line of lines) {
    const size = Math.min(48, Math.max(6, Number(line.size) || 10)), step = Math.max(12, size + 6);
    if (line.rule) { next(step); page.drawLine({ start: { x: MARGIN, y: y + 3 }, end: { x: RIGHT_X, y: y + 3 }, thickness: .8, color: rgb(.85,.85,.85) }); continue; }
    const x0 = Math.min(RIGHT_X - 20, Math.max(MARGIN, line.x ?? MARGIN));
    const maxWidth = RIGHT_X - x0;
    // Keep words intact where possible; split long identifiers at Unicode code points.
    const rows: string[] = [];
    let row = '';
    for (const word of String(line.text).replace(/[\r\n\t]/g, ' ').split(/(\s+)/)) {
      if (row && width(row + word, size, !!line.bold) > maxWidth) { rows.push(row.trimEnd()); row = ''; }
      for (const ch of word) {
        if (row && width(row + ch, size, !!line.bold) > maxWidth) { rows.push(row); row = ''; }
        if (row || ch.trim()) row += ch;
      }
    }
    if (row || !rows.length) rows.push(row);
    for (const text of rows) {
      next(step);
      let x = line.right ? RIGHT_X - width(text, size, !!line.bold) : x0;
      const color = (line.color || [0,0,0]).map(n => Math.min(1,Math.max(0,n))) as [number,number,number];
      const shapedRuns = orderPdfTextRuns(text).map(run => {
        const font = run.arabic && ar ? (line.bold ? arBold! : ar) : line.bold ? bold : regular;
        return { ...run, font };
      });
      for (const run of shapedRuns) {
        page.drawText(run.text, { x, y, size, font: run.font, color: rgb(...color) });
        x += run.font.widthOfTextAtSize(run.text, size);
      }
    }
  }
  const data = await doc.save();
  const temp = `${filePath}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temp, data, { mode: 0o600, flag: 'wx' }); fs.renameSync(temp, filePath); }
  catch (error) { fs.rmSync(temp, { force: true }); throw error; }
  return filePath;
}
