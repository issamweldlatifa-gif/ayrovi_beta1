/**
 * AYROVI — كاتب PDF بسيط بدون أي تبعيات (خطة بديلة عندما يتعذّر تشغيل Chromium).
 * ينتج فاتورة A4 مهنية (نصوص Helvetica — الفرنسية/اللاتينية فقط) مع دعم صفحات متعددة.
 */
import fs from 'node:fs';

export interface PdfLine {
  text: string;
  x?: number;          // الافتراضي 50 (الهامش)
  size?: number;       // الافتراضي 10
  bold?: boolean;
  color?: [number, number, number]; // RGB 0..1
  right?: boolean;     // محاذاة لليمين عند x=545
  rule?: boolean;      // خط أفقي بدل النص
}

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 50;
const BOTTOM = 60;
const RIGHT_X = PAGE_W - MARGIN;

// تقريب عرض النص بخط Helvetica (كافٍ للمحاذاة اليمنى للأرقام/المبالغ)
function approxWidth(text: string, size: number, bold: boolean): number {
  let width = 0;
  for (const ch of text) {
    if ('iljtf.,:;| '.includes(ch)) width += 0.28;
    else if ('mwMW@'.includes(ch)) width += 0.9;
    else if (ch >= '0' && ch <= '9') width += 0.56;
    else width += 0.55;
  }
  return width * size * (bold ? 1.05 : 1);
}

function toLatin1(text: string): string {
  // تحويل الأحرف لما يقابلها في WinAnsi — الأحرف غير المدعومة تُستبدل
  return text.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
    .replace(/✓/g, 'OK').replace(/✕/g, 'X').replace(/⬇️?/g, '').replace(/⚠️?/g, '!')
    .replace(/[€]/g, 'EUR').replace(/[^\x00-\xFF]/g, '?');
}

function escapePdf(text: string): string {
  return toLatin1(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export function writeSimplePdf(lines: PdfLine[], filePath: string): string {
  // تقسيم الصفحات
  const pages: PdfLine[][] = [];
  let current: PdfLine[] = [];
  let y = PAGE_H - MARGIN;
  for (const line of lines) {
    const step = Math.max(12, (line.size || 10) + 6);
    if (y - step < BOTTOM && current.length) { pages.push(current); current = []; y = PAGE_H - MARGIN; }
    current.push({ ...line, x: line.x ?? MARGIN });
    y -= step;
  }
  if (current.length) pages.push(current);

  // بناء كائنات PDF: 1=Catalog 2=Pages 3=F1 4=F2 ثم لكل صفحة: (page, content)
  const pageObjIds = pages.map((_, i) => 5 + i * 2);
  const contentIds = pages.map((_, i) => 6 + i * 2);
  const objects: Record<number, Buffer> = {};

  objects[1] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1');
  objects[2] = Buffer.from(`<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`, 'latin1');
  objects[3] = Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', 'latin1');
  objects[4] = Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>', 'latin1');

  pages.forEach((pageLines, index) => {
    objects[pageObjIds[index]] = Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentIds[index]} 0 R >>`, 'latin1');

    const ops: string[] = [];
    let cursorY = PAGE_H - MARGIN;
    for (const line of pageLines) {
      const size = line.size || 10;
      const step = Math.max(12, size + 6);
      cursorY -= step;
      if (line.rule) {
        ops.push('0.80 0.78 0.85 RG 0.8 w', `${MARGIN} ${cursorY + 3} m ${RIGHT_X} ${cursorY + 3} l S`);
        continue;
      }
      const [r, g, b] = line.color || [0.09, 0.07, 0.12];
      let x = line.x ?? MARGIN;
      if (line.right) x = RIGHT_X - approxWidth(toLatin1(line.text), size, Boolean(line.bold));
      ops.push(`${r} ${g} ${b} rg`, `BT /${line.bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${cursorY.toFixed(2)} Tm (${escapePdf(line.text)}) Tj ET`);
    }
    const stream = Buffer.from(ops.join('\n'), 'latin1');
    objects[contentIds[index]] = Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'latin1'), stream, Buffer.from('\nendstream', 'latin1'),
    ]);
  });

  const total = 4 + pages.length * 2;
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  const offsets: number[] = [0];
  let position = parts[0].length;
  for (let id = 1; id <= total; id += 1) {
    offsets[id] = position;
    const body = objects[id] || Buffer.from('<< >>', 'latin1');
    const header = Buffer.from(`${id} 0 obj\n`, 'latin1');
    parts.push(header, body, Buffer.from('\nendobj\n', 'latin1'));
    position += header.length + body.length + 7;
  }
  const xrefStart = position;
  let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= total; id += 1) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  parts.push(Buffer.from(xref, 'latin1'));
  fs.writeFileSync(filePath, Buffer.concat(parts));
  return filePath;
}
