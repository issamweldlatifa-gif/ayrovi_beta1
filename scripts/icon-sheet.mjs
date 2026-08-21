// Génère docs/ayrovi-icon-contact.html : contact sheet de toute la famille AYROVI.
// Usage : node scripts/icon-sheet.mjs
import { buildSync } from 'esbuild';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const entry = path.join(root, 'scripts/icon-sheet-entry.tsx');
const outDir = path.join(root, 'node_modules/.icon-sheet');

buildSync({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: path.join(outDir, 'sheet.cjs'),
  external: ['react', 'react-dom/server'],
});

const { renderSheet } = await import(path.join(outDir, 'sheet.cjs'));
const html = renderSheet();

const css = `
:root { --ink:#111827; --muted:#6b7280; --line:#e8eaef; --sig:#FF6A00; --ayrovi-icon-stroke: 2; --ayrovi-icon-signature: #FF6A00; }
* { box-sizing: border-box; }
body { margin:0; background:#fff; color:var(--ink); font-family:Inter,"Noto Sans Arabic",Helvetica,Arial,sans-serif; padding:24px; }
h1 { font-size:20px; letter-spacing:-.02em; margin:0 0 4px; }
.sub { color:var(--muted); font-size:13px; margin-bottom:20px; }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(96px,1fr)); gap:10px; }
.card { border:1px solid var(--line); border-radius:14px; padding:12px 8px 8px; text-align:center; background:#fafafa; }
.card span { display:block; font-size:10.5px; font-weight:600; margin-top:8px; line-height:1.25; }
.ayrovi-icon, .lucide { display:block; margin:0 auto; overflow:visible; fill:none; stroke-linecap:round; stroke-linejoin:round; stroke-width:var(--ayrovi-icon-stroke, 2); shape-rendering:geometricPrecision; }
.ayrovi-icon > *:not([data-ayrovi-signature]), .lucide > *:not([data-ayrovi-signature]) { vector-effect:non-scaling-stroke; }
.ayrovi-icon[data-ayrovi-icon='Profile'], .ayrovi-icon[data-ayrovi-icon='Profile'] > * { vector-effect:none !important; }
.ayrovi-icon [data-ayrovi-signature], .lucide [data-ayrovi-signature] { fill:var(--ayrovi-icon-signature, #FF6A00) !important; stroke:none !important; }
.ayrovi-icon [data-ayrovi-accent] { stroke:var(--ayrovi-icon-signature, #FF6A00) !important; fill:none !important; }
`;

const page = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>AYROVI — contact sheet icônes</title><style>${css}</style></head><body>
<h1>AYROVI Icon System — contact sheet (rendu exact du site)</h1>
<p class="sub">Toute la famille issue de <code>client/src/components/icons/ayrovi/catalog.tsx</code>, avec la même CSS que le site (grille 24, stroke 2, coins arrondis, point signature #FF6A00).</p>
${html}
</body></html>`;

const out = path.join(root, 'docs/ayrovi-icon-contact.html');
writeFileSync(out, page);
console.log(`OK → ${out}`);
