/** Canonical identity master -> web/native vectors and icons. No database writes.
 *
 * v7 (14 Nov 2026) — zebra-striped Z. One master (assets/brand/zayrovi-2026-11/logo.json), two renderings:
 *  - light : ink stripes on flat #FFFFFF    -> launcher icons, adaptive icon, splash, PWA/apple-touch icons
 *            (owner, 14/11: "the app icon has a WHITE background"), in-app/CRM/site surfaces, lockups, loading;
 *  - dark  : white stripes on flat #0A0A0A  -> the official account avatar (Publication, Reels, Stories).
 * `symbolSolid` (the Z silhouette, no stripes) is used where stripes cannot survive: Android notification and
 * themed (monochrome) icons, which are alpha masks, and the 16–64 px favicons.
 * Every placement is centred on the Z's own box; circular placements fit `symbolSolid.maxRadius`.
 */
import fs from 'node:fs';
import sharp from 'sharp';

const dir = 'assets/brand/zayrovi-2026-11';
const logo = JSON.parse(fs.readFileSync(`${dir}/logo.json`, 'utf8'));
const { symbol, symbolSolid: solid, wordmark } = logo;
export const VERSION = logo.version; // cache-busting query for every public logo URL: ?v=<version>
const INK = '#0A0A0A', WHITE = '#FFFFFF', LOADING_GREY = '#666666';
const num = (n, digits = 4) => Number(n.toFixed(digits));

/** Transform placing a symbol-unit shape centred in a box, scaled so its outline fits a circle of `radius`. */
const fitCircle = (box, radius) => {
  const scale = radius / solid.maxRadius;
  return `translate(${num((box - symbol.width * scale) / 2)} ${num((box - symbol.height * scale) / 2)}) scale(${num(scale, 9)})`;
};
/** Transform centring the Z in a square box with its height = `share` of the box. */
const fitHeight = (box, share) => {
  const scale = (box * share) / symbol.height;
  return `translate(${num((box - symbol.width * scale) / 2)} ${num((box - symbol.height * scale) / 2)}) scale(${num(scale, 9)})`;
};

// Native splash (expo-splash-screen): the image is `imageWidth` dp square and the Z is SPLASH_SHARE of its height.
// The JS entrance (apps/mobile/src/design/BrandEntrance.tsx) redraws the Z at exactly this size for a seamless handoff.
const SPLASH_SHARE = 0.7;
const appJson = JSON.parse(fs.readFileSync('apps/mobile/app.json', 'utf8'));
const splashPlugin = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
// The native splash, the adaptive icon and the JS redraw (BRAND.white token) must be the same flat white.
for (const bg of [splashPlugin.backgroundColor, splashPlugin.dark?.backgroundColor, appJson.expo.android.adaptiveIcon.backgroundColor])
  if (String(bg).toUpperCase() !== WHITE) throw new Error(`app.json: launch background ${bg} must be ${WHITE} (BRAND.white)`);
const splashHeight = splashPlugin.imageWidth * SPLASH_SHARE;
const SPLASH = { imageWidth: splashPlugin.imageWidth, share: SPLASH_SHARE,
  width: num((splashHeight * symbol.width) / symbol.height, 2), height: num(splashHeight, 2) };

// Loading ring: 136 box, ring r = 65 (stroke 4–6). The Z fits a 52 radius circle -> ~9 px clear of the ring.
const BOOT_TRANSFORM = fitCircle(136, 52);
const data = ({ width, height, viewBox, d }) => ({ width, height, viewBox, d });
const ts = `/** GENERATED from the supplied zebra-striped Z (logo.json v${VERSION}) by npm run brand:build. */
export const BRAND_SYMBOL = ${JSON.stringify(data(symbol), null, 2)} as const;
/** The same Z without stripes: alpha-mask surfaces and very small sizes. */
export const BRAND_SYMBOL_SOLID = ${JSON.stringify(data(solid), null, 2)} as const;
/** Farthest outline point from the box centre, in symbol units (fit the Z inside circles). */
export const BRAND_SYMBOL_MAX_RADIUS = ${solid.maxRadius};
export const BOOT_SYMBOL_TRANSFORM = '${BOOT_TRANSFORM}';
/** Native splash geometry (app.json expo-splash-screen, background BRAND.white, ink Z), in dp: the Z drawn by the startup handoff. */
export const SPLASH_SYMBOL = ${JSON.stringify(SPLASH)} as const;
`;
for (const file of ['client/src/design/brandSymbol.ts', 'apps/mobile/src/design/brandSymbol.ts']) fs.writeFileSync(file, ts);
fs.writeFileSync('apps/mobile/src/design/brandWordmark.ts', `/** GENERATED supplied lowercase zayrovi contours; no font dependency. */\nexport const BRAND_WORDMARK = ${JSON.stringify(data(wordmark), null, 2)} as const;\n`);

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="ZAYROVI"><title>zayrovi — Z</title>${body}</svg>\n`;
const path = (shape, color, transform = '') => `<path fill="${color}" d="${shape.d}"${transform ? ` transform="${transform}"` : ''}/>`;
const rect = (size, color) => (color ? `<rect width="${size}" height="${size}" fill="${color}"/>` : '');
/** Square tile: flat background (or transparent) + centred Z. */
const tile = (size, { share, radius, background = null, color = WHITE, shape = symbol, round = false }) =>
  svg(size, size, (round ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${background}"/>` : rect(size, background)) + path(shape, color, radius ? fitCircle(size, radius * size) : fitHeight(size, share)));
// Lockup: symbol 1000 high; wordmark 660 high, optically centred; 240 clear-space units. No divider.
const lockupWidth = num(symbol.width + 240 + wordmark.width * 0.66, 2);
const lockup = (color) => svg(lockupWidth, 1000, path(symbol, color) + path(wordmark, color, `translate(${symbol.width + 240} 170) scale(0.66)`));
const writePng = async (file, input, width, height = width) => {
  fs.mkdirSync(file.substring(0, file.lastIndexOf('/')), { recursive: true });
  await sharp(Buffer.from(input), { density: 72 }).resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 }).toFile(file);
};

// ---- Web (client/public/media) -------------------------------------------------------------------------
const media = 'client/public/media';
// Retired v6 file: the official avatar no longer uses a blue symbol.
fs.rmSync(`${media}/logo-ayrovi-symbol-blue.svg`, { force: true });
fs.writeFileSync(`${media}/logo-ayrovi-mark.svg`, svg(symbol.width, symbol.height, path(symbol, INK)));
for (const [tone, ink] of [['black', INK], ['white', WHITE]]) {
  fs.writeFileSync(`${media}/logo-ayrovi-wordmark-${tone}.svg`, svg(wordmark.width, wordmark.height, path(wordmark, ink)));
  // `-violet` names are historical URLs kept by stored interface configs; same monochrome lockup.
  for (const suffix of ['', '-violet']) fs.writeFileSync(`${media}/logo-ayrovi-lockup-${tone}${suffix}.svg`, lockup(ink));
  await writePng(`${media}/logo-ayrovi-lockup-${tone}-violet.png`, lockup(ink), 1200, Math.round((1200 / lockupWidth) * 1000));
}
// Official account avatar (round): white stripes on a black disc, fitted inside the circle (owner, 14/11).
fs.writeFileSync(`${media}/logo-ayrovi-avatar.svg`, tile(512, { radius: 0.4, background: INK, color: WHITE, round: true }));
// Browser tab favicon: white tile, solid ink Z (stripes do not survive 16–32 px).
fs.writeFileSync(`${media}/logo-ayrovi-icon.svg`, tile(512, { share: 0.64, background: WHITE, color: INK, shape: solid }));
fs.writeFileSync(`${media}/logo-ayrovi-loading.svg`, svg(136, 136,
  `<style>.arc{transform-origin:68px 68px;animation:turn 1100ms linear infinite}@keyframes turn{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.arc{animation:none}}</style><circle cx="68" cy="68" r="65" fill="none" stroke="#E5E5E5" stroke-width="4"/><path class="arc" d="M 68 3 A 65 65 0 0 1 129.08 45.77" fill="none" stroke="${LOADING_GREY}" stroke-width="6" stroke-linecap="round"/>` + path(symbol, LOADING_GREY, BOOT_TRANSFORM)));
// Light symbol (ink stripes, transparent) for headers/avatars/og:image; white stripes for dark surfaces.
await writePng(`${media}/logo-ayrovi.png`, tile(512, { share: 0.86, color: INK }), 512);
await writePng(`${media}/logo-ayrovi-light.png`, tile(512, { share: 0.86, color: WHITE }), 512);
// PWA + apple-touch: white tile, ink stripes (same as the launcher icon).
for (const [name, size] of [['192', 192], ['512', 512], ['apple-touch', 180]]) {
  await writePng(`${media}/logo-ayrovi-${name}.png`, tile(size, { share: 0.62, background: WHITE, color: INK }), size);
}

// ---- Expo (apps/mobile/assets/images) ------------------------------------------------------------------
const expo = 'apps/mobile/assets/images';
// Android adaptive icon: 108 dp canvas, launcher masks keep the central 72 dp, the guaranteed safe zone is the
// 66 dp circle. The Z outline fits a 60 dp circle (radius 30/108): inside the safe zone with 3 dp of air, so no
// launcher mask (circle, squircle, teardrop) ever touches it. Background colour lives in app.json.
export const ADAPTIVE_FIT = 30 / 108;
const SAFE_ZONE = ADAPTIVE_FIT;
for (const [name, size, options] of [
  ['icon', 1024, { share: 0.62, background: WHITE, color: INK }],         // iOS / store: flat white tile
  ['adaptive-icon', 1024, { radius: SAFE_ZONE, color: INK }],             // foreground, transparent (bg #FFFFFF)
  ['adaptive-icon-monochrome', 1024, { radius: SAFE_ZONE, shape: solid }], // Android 13 themed icon (alpha)
  ['notification-icon', 96, { share: 0.78, shape: solid }],               // status bar: alpha-only, white
  ['favicon', 64, { share: 0.68, background: WHITE, color: INK, shape: solid }],
  ['splash-icon', 1024, { share: SPLASH_SHARE, color: INK }],             // on #FFFFFF (app.json)
  ['splash-icon-dark', 1024, { share: SPLASH_SHARE, color: INK }],
]) await writePng(`${expo}/${name}.png`, tile(size, options), size);

// ---- Capacitor inputs (android/ is generated from these by npm run android:assets) ---------------------
await writePng('assets/icon.png', tile(1024, { share: 0.62, background: WHITE, color: INK }), 1024);
for (const name of ['splash', 'splash-dark']) await writePng(`assets/${name}.png`, tile(2732, { share: 0.22, background: WHITE, color: INK }), 2732);

// ---- Static boot loader in client/index.html (same contour + centring as main.tsx) ---------------------
const htmlPath = 'client/index.html';
let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/<path class="ay-boot-(?:z|symbol)"[^>]*\/>/, () => `<path class="ay-boot-symbol" transform="${BOOT_TRANSFORM}" d="${symbol.d}" />`);
html = html.replaceAll('.ay-boot-z', '.ay-boot-symbol');
fs.writeFileSync(htmlPath, html);
console.log(`zayrovi v${VERSION}: zebra Z (light icons + splash, dark official avatar), solid Z for alpha/small surfaces, lockups, web/native icons and splash inputs generated.`);
