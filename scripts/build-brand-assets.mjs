/** Canonical identity master -> web/native vectors and icons. No database writes.
 *
 * v9 (18 Nov 2026) — « Za. » : yellow circle, knocked-out z, a, yellow dot. One master
 * (assets/brand/zayrovi-2026-11/logo.json), two official renderings supplied by the owner:
 *  - dark  : on black  -> a WHITE  (splash, app icon, PWA icons, email/footer bands, dark headers);
 *  - light : on white  -> a INK    (site and app headers, auth screens, documents).
 * The z is ALWAYS a knockout: it takes the colour of whatever is behind the logo (black on black, white on white),
 * and its lower bar always runs out of the circle. The circle and the dot are always ZAYROVI yellow, except on
 * alpha masks (Android notification + themed icons), where everything is one colour.
 * `mark` (circle + z) replaces the full logo where the a and the dot would be too small: favicon, round avatars,
 * notification icon, loading ring, tab icon.
 */
import fs from 'node:fs';
import sharp from 'sharp';

const dir = 'assets/brand/zayrovi-2026-11';
const master = JSON.parse(fs.readFileSync(`${dir}/logo.json`, 'utf8'));
const { logo, mark, colors } = master;
export const VERSION = master.version; // cache-busting query for every public logo URL: ?v=<version>
const { yellow: YELLOW, ink: INK, white: WHITE } = colors;
const TRACK = '#E5E5E5';
const num = (n, digits = 4) => Number(n.toFixed(digits));

// ---- Placement helpers -----------------------------------------------------------------------------------
/** Transform centring the full logo in a w×h box, the logo being `share` of the box width (or height if taller). */
const fitLogo = (w, h, share) => {
  const scale = Math.min((w * share) / logo.width, (h * share) / logo.height);
  return { scale, transform: `translate(${num((w - logo.width * scale) / 2)} ${num((h - logo.height * scale) / 2)}) scale(${num(scale, 9)})` };
};
/** Transform centring the mark (circle r = 500) so that its circle has radius `radius`. */
const fitMark = (box, radius) => `translate(${num(box / 2 - radius)} ${num(box / 2 - radius)}) scale(${num(radius / 500, 9)})`;

/** The logo body. tone: 'light' (a ink) | 'dark' (a white) | a colour string (single-colour silhouette). */
const logoBody = (tone, transform = '') => {
  const mono = tone !== 'light' && tone !== 'dark' ? tone : null;
  const a = mono ?? (tone === 'dark' ? WHITE : INK);
  const disc = mono ?? YELLOW;
  return `<g${transform ? ` transform="${transform}"` : ''}><path fill="${disc}" d="${logo.ring}"/>`
    + `<path fill="${a}" d="${logo.a}"/><path fill="${disc}" d="${logo.dot}"/></g>`;
};
const markBody = (color = YELLOW, transform = '') =>
  `<path fill="${color}" d="${mark.d}"${transform ? ` transform="${transform}"` : ''}/>`;

const svg = (w, h, body, title = 'ZAYROVI') => `<svg xmlns="http://www.w3.org/2000/svg" width="${num(w, 2)}" height="${num(h, 2)}" viewBox="0 0 ${num(w, 2)} ${num(h, 2)}" role="img" aria-label="ZAYROVI"><title>${title}</title>${body}</svg>\n`;
const rect = (w, h, color, rx = 0) => (color ? `<rect width="${w}" height="${h}"${rx ? ` rx="${rx}"` : ''} fill="${color}"/>` : '');
const disc = (size, color) => `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${color}"/>`;
/** Square tile with the full logo: background (or transparent) + centred logo at `share` of the width. */
const logoTile = (size, { share, background = null, tone = 'dark', rx = 0 }) =>
  svg(size, size, rect(size, size, background, rx) + logoBody(tone, fitLogo(size, size, share).transform), 'Za.');
/** Square tile with the mark: the circle has radius `radius` × size. */
const markTile = (size, { radius, background = null, color = YELLOW, round = false, rx = 0 }) =>
  svg(size, size, (round ? disc(size, background) : rect(size, size, background, rx)) + markBody(color, fitMark(size, radius * size)), 'Za.');

const writePng = async (file, input, width, height = width) => {
  fs.mkdirSync(file.substring(0, file.lastIndexOf('/')), { recursive: true });
  await sharp(Buffer.from(input), { density: 72 }).resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 }).toFile(file);
};

// ---- Native splash geometry --------------------------------------------------------------------------------
// expo-splash-screen draws a square `imageWidth` dp image centred on a flat black background; the logo spans
// SPLASH_SHARE of that square's width. BrandEntrance redraws it at exactly this size for a seamless handoff.
const SPLASH_SHARE = 0.86;
const appJson = JSON.parse(fs.readFileSync('apps/mobile/app.json', 'utf8'));
const splashPlugin = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
for (const bg of [splashPlugin.backgroundColor, splashPlugin.dark?.backgroundColor, appJson.expo.android.adaptiveIcon.backgroundColor])
  if (String(bg).toUpperCase() !== INK) throw new Error(`app.json: launch background ${bg} must be ${INK} (BRAND.black, the dark master)`);
const splashWidth = num(splashPlugin.imageWidth * SPLASH_SHARE, 2);
const SPLASH = { imageWidth: splashPlugin.imageWidth, share: SPLASH_SHARE, width: splashWidth, height: num((splashWidth * logo.height) / logo.width, 2) };

// Loading ring: 136 box, ring r = 65 (track 4, arc 6). The mark's circle has radius 52 -> 10 px clear of the arc.
const BOOT_MARK_RADIUS = 52;
const BOOT_TRANSFORM = fitMark(136, BOOT_MARK_RADIUS);

// ---- Social icon (owner's drawing, 18/11/2026) ---------------------------------------------------------------
// Black rounded tile; the mark (yellow circle, knocked-out z whose bar runs out into the black) + the yellow dot,
// brought closer than in the full logo: gap between the circle's edge (at the dot's height) and the dot = the dot's
// diameter. The group spans SOCIAL.content of the tile width, centred; corner radius = SOCIAL.radius × size.
const DOT = (() => { const m = /^M([\d.]+) ([\d.]+)A([\d.]+)/.exec(logo.dot); return { r: Number(m[3]), cy: Number(m[2]) }; })();
const SOCIAL_EDGE = 500 + Math.sqrt(500 ** 2 - (DOT.cy - 500) ** 2);
const SOCIAL_DOT_X = SOCIAL_EDGE + 2 * DOT.r + DOT.r;
export const SOCIAL = { content: 0.74, radius: 0.2, width: num(SOCIAL_DOT_X + DOT.r, 1), height: 1000, dot: { cx: num(SOCIAL_DOT_X, 1), cy: DOT.cy, r: DOT.r } };
const socialTile = (size) => {
  const scale = (size * SOCIAL.content) / SOCIAL.width;
  const transform = `translate(${num((size - SOCIAL.width * scale) / 2)} ${num((size - SOCIAL.height * scale) / 2)}) scale(${num(scale, 9)})`;
  return svg(size, size, rect(size, size, INK, num(size * SOCIAL.radius, 2))
    + `<g transform="${transform}"><path fill="${YELLOW}" d="${mark.d}"/><circle cx="${SOCIAL.dot.cx}" cy="${SOCIAL.dot.cy}" r="${SOCIAL.dot.r}" fill="${YELLOW}"/></g>`, 'Za.');
};

// ---- Generated TypeScript (client + native share one file) -------------------------------------------------
const ts = `/** GENERATED from assets/brand/zayrovi-2026-11/logo.json (v${VERSION}, « Za. ») by npm run brand:build — do not edit.
 * Geometry only: the colours live in the design tokens (ZAYROVI yellow, ink, white).
 * ring = ONE contour: the circle with the z cut out and open to the outside (its lower bar crosses the edge). */
export const BRAND_LOGO = ${JSON.stringify({ width: logo.width, height: logo.height, viewBox: logo.viewBox, ring: logo.ring, a: logo.a, dot: logo.dot }, null, 2)} as const;
/** The symbol alone (circle + knocked-out z), for small and round placements. Circle: centre 500,500, r 500. */
export const BRAND_MARK = ${JSON.stringify({ width: mark.width, height: mark.height, viewBox: mark.viewBox, d: mark.d }, null, 2)} as const;
/** Loading ring (136 box): the mark's circle has radius ${BOOT_MARK_RADIUS}. */
export const BOOT_MARK_TRANSFORM = '${BOOT_TRANSFORM}';
/** Social icon (account avatar in Publication, Reels, Stories): black rounded tile, mark + closer dot. Units = the
 * mark's (circle r 500); the group is \`content\` × tile width, centred; corner radius = \`radius\` × tile size. */
export const SOCIAL_ICON = ${JSON.stringify(SOCIAL)} as const;
/** Native splash geometry (app.json expo-splash-screen, black background, dark logo), in dp. */
export const SPLASH_LOGO = ${JSON.stringify(SPLASH)} as const;
`;
for (const file of ['client/src/design/brandSymbol.ts', 'apps/mobile/src/design/brandSymbol.ts']) fs.writeFileSync(file, ts);
fs.rmSync('apps/mobile/src/design/brandWordmark.ts', { force: true }); // v8 lowercase wordmark: retired

// ---- Web (client/public/media) -----------------------------------------------------------------------------
const media = 'client/public/media';
const logoSvg = (tone) => svg(logo.width, logo.height, logoBody(tone), 'Za.');
fs.writeFileSync(`${media}/logo-zayrovi-logo-light.svg`, logoSvg('light'));
fs.writeFileSync(`${media}/logo-zayrovi-logo-dark.svg`, logoSvg('dark'));
fs.writeFileSync(`${media}/logo-zayrovi-mark.svg`, svg(mark.width, mark.height, markBody(), 'Za.'));
// Historical file names (stored interface configs, old pages): same official logo, by surface tone.
// -black = for LIGHT surfaces (a ink); -white = for DARK surfaces (a white).
for (const [tone, surface] of [['black', 'light'], ['white', 'dark']]) {
  fs.writeFileSync(`${media}/logo-zayrovi-wordmark-${tone}.svg`, logoSvg(surface));
  for (const suffix of ['', '-violet']) fs.writeFileSync(`${media}/logo-zayrovi-lockup-${tone}${suffix}.svg`, logoSvg(surface));
  await writePng(`${media}/logo-zayrovi-lockup-${tone}-violet.png`, logoSvg(surface), 1200, Math.round((1200 / logo.width) * 1000));
}
// Official account avatar = the social icon (owner's drawing, 18/11): black rounded tile, mark + closer yellow dot.
fs.writeFileSync(`${media}/logo-zayrovi-avatar.svg`, socialTile(512));
// Browser tab favicon: the mark alone, transparent (the knocked-out z shows the tab colour).
fs.writeFileSync(`${media}/logo-zayrovi-icon.svg`, markTile(512, { radius: 0.5 }));
fs.writeFileSync(`${media}/logo-zayrovi-loading.svg`, svg(136, 136,
  `<style>.arc{transform-origin:68px 68px;animation:turn 1100ms linear infinite}@keyframes turn{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.arc{animation:none}}</style><circle cx="68" cy="68" r="65" fill="none" stroke="${TRACK}" stroke-width="4"/><path class="arc" d="M 68 3 A 65 65 0 0 1 129.08 45.77" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>` + markBody(YELLOW, BOOT_TRANSFORM)));
// Small square symbol (account, assistant, app header fallback): the mark, transparent.
await writePng(`${media}/logo-zayrovi.png`, markTile(512, { radius: 0.47 }), 512);
await writePng(`${media}/logo-zayrovi-light.png`, markTile(512, { radius: 0.47 }), 512);
// PWA + apple-touch: the app icon (black tile, dark logo).
for (const [name, size] of [['192', 192], ['512', 512], ['apple-touch', 180]])
  await writePng(`${media}/logo-zayrovi-${name}.png`, logoTile(size, { share: 0.7, background: INK }), size);
// Social share card (og:image / twitter:image): 1200 × 630, black, dark logo.
const og = svg(1200, 630, rect(1200, 630, INK) + logoBody('dark', fitLogo(1200, 630, 0.42).transform), 'ZAYROVI');
await writePng(`${media}/og-zayrovi.png`, og, 1200, 630);

// E-mail header band (black): the dark master, background baked in (mail clients strip SVG and some recolour
// transparent images). Shown at 40 px high -> drawn at 3x.
const mailH = 120, mailW = Math.round((mailH * logo.width) / logo.height);
await writePng(`${media}/logo-zayrovi-email-dark.png`, svg(mailW, mailH, rect(mailW, mailH, INK) + logoBody('dark', fitLogo(mailW, mailH, 1).transform), 'ZAYROVI'), mailW, mailH);

// ---- Server documents (invoices): inline SVG strings, no network, printable --------------------------------
const inline = (tone, height) => svg((height * logo.width) / logo.height, height, '', 'ZAYROVI')
  .replace(/viewBox="[^"]*"/, `viewBox="${logo.viewBox}"`).replace('</svg>', `${logoBody(tone)}</svg>`).trim();
fs.mkdirSync('shared', { recursive: true });
fs.writeFileSync('shared/brandLogo.generated.ts', `// GENERATED from assets/brand/zayrovi-2026-11/logo.json (v${VERSION}, « Za. ») by npm run brand:build — do not edit.
/** Official logo as inline SVG for server documents. light = on white (ink a), dark = on black (white a). */
export const BRAND_LOGO_VERSION = ${JSON.stringify(VERSION)};
export const BRAND_LOGO_SVG = ${JSON.stringify({ light: inline('light', 40), dark: inline('dark', 40) }, null, 2)} as const;
/** Public path of the e-mail header image (black band, dark master), 40 px high in the template. */
export const BRAND_LOGO_EMAIL = ${JSON.stringify({ path: `/media/logo-zayrovi-email-dark.png?v=${VERSION}`, width: num((40 * logo.width) / logo.height, 1), height: 40 })} as const;
`);

// ---- Expo (apps/mobile/assets/images) ----------------------------------------------------------------------
const expo = 'apps/mobile/assets/images';
// Android adaptive icon: 108 dp canvas, the guaranteed safe zone is the 66 dp circle (radius 33). The full logo's
// farthest point from the centre stays inside a 31 dp radius: no launcher mask ever touches it. Background in app.json.
export const ADAPTIVE_RADIUS = 31 / 108;
const farthest = (scale) => { // farthest painted point of the centred logo, in logo units × scale
  const cx = logo.width / 2, cy = logo.height / 2;
  const dotC = master.logo.dotCircle;
  const toCircle = Math.hypot(500 - cx, 500 - cy) + 500;
  const toDot = Math.hypot(dotC.cx - cx, dotC.cy - cy) + dotC.r;
  return Math.max(toCircle, toDot) * scale;
};
const adaptiveShare = (ADAPTIVE_RADIUS * logo.width) / farthest(1); // logo width share of the canvas
for (const [name, size, body] of [
  ['icon', 1024, logoTile(1024, { share: 0.7, background: INK })],                        // iOS / store: black tile
  ['adaptive-icon', 1024, logoTile(1024, { share: adaptiveShare })],                     // foreground, transparent (bg #0A0A0A)
  ['adaptive-icon-monochrome', 1024, logoTile(1024, { share: adaptiveShare, tone: WHITE })], // Android 13 themed icon (alpha)
  ['notification-icon', 96, markTile(96, { radius: 0.42, color: WHITE })],                 // status bar: alpha-only, white
  ['favicon', 64, markTile(64, { radius: 0.5 })],
  ['splash-icon', 1024, logoTile(1024, { share: SPLASH_SHARE })],                        // on #0A0A0A (app.json)
  ['splash-icon-dark', 1024, logoTile(1024, { share: SPLASH_SHARE })],
]) await writePng(`${expo}/${name}.png`, body, size);

// ---- Capacitor inputs (android/ is generated from these by npm run android:assets) -------------------------
await writePng('assets/icon.png', logoTile(1024, { share: 0.7, background: INK }), 1024);
for (const name of ['splash', 'splash-dark']) await writePng(`assets/${name}.png`, logoTile(2732, { share: 0.3, background: INK }), 2732);

// ---- Static boot loader in client/index.html (same mark + placement as main.tsx) ---------------------------
const htmlPath = 'client/index.html';
let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/<path class="ay-boot-symbol"[^>]*\/>/, () => `<path class="ay-boot-symbol" transform="${BOOT_TRANSFORM}" d="${mark.d}" />`);
fs.writeFileSync(htmlPath, html);
console.log(`zayrovi v${VERSION} « Za. »: logo (light/dark), mark, avatar, favicon, loading, PWA + og, Expo icons/splash and Capacitor inputs generated.`);
