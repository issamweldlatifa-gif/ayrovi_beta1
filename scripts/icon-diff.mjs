// يولّد docs/icon-diff.html : مقارنة قبل/بعد لكل أيقونة (من git HEAD مقابل الكود الحالي).
import { buildSync } from 'esbuild';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'node_modules/.icon-diff');
buildSync({
  entryPoints: [path.join(root, 'scripts/icon-diff-entry.tsx')],
  bundle: true, platform: 'node', format: 'cjs', target: 'node20',
  outfile: path.join(outDir, 'diff.cjs'),
  external: ['react', 'react-dom/server'],
  absWorkingDir: root,
});
const { renderDiff } = await import(path.join(outDir, 'diff.cjs'));
const body = renderDiff();

const css = `
:root { --ink:#111827; --muted:#6b7280; --line:#e8eaef; --sig:#FF6A00; --ayrovi-icon-stroke: 2; --ayrovi-icon-signature: #FF6A00; }
* { box-sizing: border-box; }
body { margin:0; background:#fff; color:var(--ink); font-family:Inter,Helvetica,Arial,sans-serif; padding:24px; }
h1 { font-size:20px; margin:0 0 4px; letter-spacing:-.02em; }
.sub { color:var(--muted); font-size:13px; margin-bottom:18px; }
.row { display:grid; grid-template-columns:1fr 1fr 220px; gap:12px; align-items:center; border:1px solid var(--line); border-radius:14px; padding:12px 14px; margin-bottom:10px; }
.row.changed { border-color:#FF6A00; background:#fff7f0; }
.box { background:#fff; border:1px solid var(--line); border-radius:12px; padding:14px 8px; text-align:center; }
.box .tag { font-size:10px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); display:block; margin-bottom:6px; }
.name { font-weight:700; font-size:13px; }
.name small { display:block; color:var(--muted); font-weight:500; font-size:11px; margin-top:2px; }
.badge { display:inline-block; margin-left:8px; font-size:10px; font-weight:700; color:#fff; background:var(--sig); border-radius:999px; padding:2px 8px; vertical-align:middle; }
.ayrovi-icon,.lucide { display:block; margin:0 auto; overflow:visible; fill:none; stroke-linecap:round; stroke-linejoin:round; stroke-width:var(--ayrovi-icon-stroke,2); shape-rendering:geometricPrecision; }
.ayrovi-icon > *:not([data-ayrovi-signature]), .lucide > *:not([data-ayrovi-signature]) { vector-effect:non-scaling-stroke; }
.ayrovi-icon[data-ayrovi-icon='Profile'], .ayrovi-icon[data-ayrovi-icon='Profile'] > * { vector-effect:none !important; }
.ayrovi-icon [data-ayrovi-signature], .lucide [data-ayrovi-signature] { fill:var(--ayrovi-icon-signature,#FF6A00) !important; stroke:none !important; }
.ayrovi-icon [data-ayrovi-accent] { stroke:var(--ayrovi-icon-signature,#FF6A00) !important; fill:none !important; }
`;
const page = `<!DOCTYPE html>
<html lang="ar" dir="ltr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>AYROVI — قبل / بعد</title><style>${css}</style></head><body>
<h1>AYROVI Icon System — قبل / بعد (قبل = git HEAD، بعد = الكود الحالي)</h1>
<p class="sub">الصفوف البرتقالية = أيقونة تغيّرت هندسيًا أو في موضع نقطة الـ signature. الرموز في «قبل» مأخوذة مباشرة من آخر commit.</p>
${body}
</body></html>`;
const out = path.join(root, 'docs/icon-diff.html');
writeFileSync(out, page);
console.log(`OK → ${out}`);
