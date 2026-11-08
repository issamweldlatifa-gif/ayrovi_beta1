/** Canonical identity master -> web/native vectors and icons. No database writes. */
import fs from 'node:fs';
import sharp from 'sharp';
const dir = 'assets/brand/zayrovi-2026-11';
const logo = JSON.parse(fs.readFileSync(`${dir}/logo.json`, 'utf8'));
const { symbol, wordmark } = logo;
const INK = '#0A0A0A', WHITE = '#FFFFFF';
const { accent: BLUE } = JSON.parse(fs.readFileSync('assets/brand/appearance.json', 'utf8'));
const transform = `translate(19 ${Number(((136 - 98 * symbol.height / symbol.width) / 2).toFixed(4))}) scale(${Number((98 / symbol.width).toFixed(9))})`;
const data = ({ width, height, viewBox, d }) => ({ width, height, viewBox, d });
const ts = `/** GENERATED from supplied heart-handshake contours by npm run brand:build. */\nexport const BRAND_SYMBOL = ${JSON.stringify(data(symbol), null, 2)} as const;\nexport const BOOT_SYMBOL_TRANSFORM = '${transform}';\n`;
for (const file of ['client/src/design/brandSymbol.ts', 'apps/mobile/src/design/brandSymbol.ts']) fs.writeFileSync(file, ts);
fs.writeFileSync('apps/mobile/src/design/brandWordmark.ts', `/** GENERATED supplied lowercase zayrovi contours; no font dependency. */\nexport const BRAND_WORDMARK = ${JSON.stringify(data(wordmark), null, 2)} as const;\n`);
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="ZAYROVI"><title>zayrovi — heart-handshake</title>${body}</svg>\n`;
const path = (shape, color, transform = '') => `<path fill="${color}" d="${shape.d}"${transform ? ` transform="${transform}"` : ''}/>`;
const mark = color => svg(symbol.width, symbol.height, path(symbol, color));
// Symbol at 1000 high; wordmark at 660 high, optically centered; 240 clear-space units. No divider.
const lockup = color => svg(Number((symbol.width + 240 + wordmark.width * .66).toFixed(2)), 1000,
  path(symbol, color) + path(wordmark, color, `translate(${symbol.width + 240} 170) scale(0.66)`));
const square = (size, share = .68, background = INK, foreground = WHITE) => {
  const scale = size * share / Math.max(symbol.width, symbol.height);
  return svg(size, size, `${background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : ''}${path(symbol, foreground, `translate(${(size - symbol.width * scale) / 2} ${(size - symbol.height * scale) / 2}) scale(${scale})`)}`);
};
const writePng = async (file, input, width, height = width) => {
  fs.mkdirSync(file.substring(0, file.lastIndexOf('/')), { recursive: true });
  await sharp(Buffer.from(input)).resize(width, height, { fit: 'contain' }).png({ compressionLevel: 9 }).toFile(file);
};
const media = 'client/public/media';
fs.writeFileSync(`${media}/logo-ayrovi-symbol-blue.svg`, svg(symbol.width, symbol.height, path(symbol, BLUE)));
for (const [tone, ink] of [['black', INK], ['white', WHITE]]) fs.writeFileSync(`${media}/logo-ayrovi-wordmark-${tone}.svg`, svg(wordmark.width, wordmark.height, path(wordmark, ink)));
fs.writeFileSync(`${media}/logo-ayrovi-mark.svg`, mark(INK));
fs.writeFileSync(`${media}/logo-ayrovi-icon.svg`, square(512));
fs.writeFileSync(`${media}/logo-ayrovi-loading.svg`, svg(136, 136,
  `<style>.arc{transform-origin:68px 68px;animation:turn 1100ms linear infinite}@keyframes turn{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.arc{animation:none}}</style><circle cx="68" cy="68" r="65" fill="none" stroke="#E5E5E5" stroke-width="4"/><path class="arc" d="M 68 3 A 65 65 0 0 1 129.08 45.77" fill="none" stroke="#666666" stroke-width="6" stroke-linecap="round"/>` + path(symbol, '#666666', transform)));

for (const [tone, color] of [['black', INK], ['white', WHITE]]) {
  for (const suffix of ['', '-violet']) fs.writeFileSync(`${media}/logo-ayrovi-lockup-${tone}${suffix}.svg`, lockup(color));
  await writePng(`${media}/logo-ayrovi-lockup-${tone}-violet.png`, lockup(color), 1200, Math.round(1200 / (symbol.width + 240 + wordmark.width * .66) * 1000));
}
await writePng(`${media}/logo-ayrovi.png`, svg(512, 512, path(symbol, INK, `translate(${512 * .07} ${(512 - 512 * .86 * symbol.height / symbol.width) / 2}) scale(${512 * .86 / symbol.width})`)), 512);
await writePng(`${media}/logo-ayrovi-light.png`, square(512, .86, null), 512);
for (const [name, size] of [['192', 192], ['512', 512], ['apple-touch', 180]]) await writePng(`${media}/logo-ayrovi-${name}.png`, square(size), size);
for (const [name, size, share, bg] of [
  ['icon', 1024, .68, WHITE], ['adaptive-icon', 1024, .60, null], ['favicon', 64, .72, WHITE],
  ['splash-icon', 1024, .68, null], ['splash-icon-dark', 1024, .68, null],
]) await writePng(`apps/mobile/assets/images/${name}.png`, square(size, share, bg, BLUE), size);
// Capacitor inputs; its platform generator writes density-specific launcher/splash resources.
await writePng('assets/icon.png', square(1024, .62, WHITE, BLUE), 1024);
for (const name of ['splash', 'splash-dark']) await writePng(`assets/${name}.png`, square(2732, .40, WHITE, BLUE), 2732);
// Preserve the existing loader style, changing only symbol geometry/centering.
const htmlPath = 'client/index.html';
let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/<path class="ay-boot-(?:z|symbol)"[^>]*\/>/, `<path class="ay-boot-symbol" transform="${transform}" d="${symbol.d}" />`);
html = html.replaceAll('.ay-boot-z', '.ay-boot-symbol');
fs.writeFileSync(htmlPath, html);
console.log('zayrovi v6: shared symbol, lowercase no-divider lockups, web/native icons and splash inputs generated.');
