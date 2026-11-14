# zayrovi — zebra-striped Z identity (v7), 14 November 2026

## Decision

The zebra-striped **Z** replaces the heart-handshake symbol (v6) everywhere: app, CRM/back-office and website. This was approved by the owner on 14/11/2026: "adopt them as our new logos and delete the old ones permanently". The lowercase `zayrovi` wordmark is unchanged and still sits next to the symbol in lockups. As before, there is no divider.

| Rendering | Where |
|---|---|
| **Dark**: white stripes on flat `#0A0A0A` | App icon (iOS/Expo/Capacitor), Android adaptive icon, native splash (light and dark themes), PWA + apple-touch icons |
| **Light**: ink stripes on white | In-app headers and brand marks, CRM, site, lockups, official avatars, `og:image`, loading (grey `#666666`) |
| **Solid Z**: the silhouette, no stripes | Android notification icon and Android 13 themed (monochrome) icon, which are alpha masks; browser favicons (16–64 px); any native drawing narrower than 24 dp, where stripes would blur to grey |

Both renderings come from **one master**. The owner supplied two files, a black and a white background, and their stripe drawings differ. The black one is the master (higher resolution: 960 × 1110). The white one is kept as the reference for the light look. The light rendering is the same master in ink, so the two versions are the same identity, never two drawings.

## Fixes applied to the supplied files

1. **Centred.** The supplied Z sat about 70 px from the left edge and about 150 px from the right edge. Every asset now centres the Z on its own bounding box, and the tests check the centre to within 1%.
2. **Flat backgrounds.** The supplied backgrounds were gradients (from about `#1D1D1D` down to `#010101`). The assets use exactly `#0A0A0A` and `#FFFFFF`; the tests sample every background pixel.
3. **Android safe zone.** The adaptive foreground fits the Z's outline inside a 60 dp circle on the 108 dp canvas. That stays inside the guaranteed 66 dp safe zone, so no launcher mask ever touches it.
4. **Solid Z.** Added for the notification and monochrome icons, which are white on transparent; Android tints them. Before this change, the notification icon was not configured, so Android showed a white square.
5. **Vector master.** The stripes are traced from a 3× resampled mask: IoU 0.98 against the supplied pixels, with integer coordinates in a 1000-unit box. The solid Z is an exact construction, not a trace:
   - two bars with semicircular ends;
   - a diagonal with parallel edges at 41.8°;
   - at the two corners where the diagonal leaves a bar, a circle tangent to three lines (r ≈ 98.5 / 101.2).

   The stripes are clipped to that outline, so both marks share one crisp edge.

These are **raster-derived contours**. The designer's original vector file was not supplied. If an SVG or a 2000 px+ PNG master arrives later, run `scripts/trace-zayrovi-logo.py` again on it. Ownership and trademark clearance have not been checked.

## Reproduction

- Sources are in `assets/brand/zayrovi-2026-11/source/`: `z-zebra-black.jpeg` (the master) and `z-zebra-white.jpg` (the light reference), both unchanged, plus `wordmark.jpg`.
- `logo.json` v7 holds:
  - `symbol` (the stripes), `symbolSolid` (the solid outline) and `wordmark`;
  - `symbolSolid.maxRadius`, the farthest outline point from the centre, used for every circular fit;
  - SHA-256 hashes of the sources.
- Optional contour rebuild:
  1. `pip install -r scripts/requirements-brand.txt` (pinned versions);
  2. `python scripts/trace-zayrovi-logo.py`.

  Normal builds use the committed JSON and need no Python.
- `npm run brand:build` generates:
  - the identical web and native constants (`BRAND_SYMBOL`, `BRAND_SYMBOL_SOLID`, `BRAND_SYMBOL_MAX_RADIUS`, `BOOT_SYMBOL_TRANSFORM`, `SPLASH_SYMBOL`);
  - every web SVG/PNG, the Expo icons and splash, and the Capacitor inputs;
  - the static boot loader in `client/index.html`.
- `npm run android:assets` regenerates the 100 Capacitor Android launcher and splash resources on `#0A0A0A`.

## Placement rules

- **Loading:** the grey Z is fitted inside the 136 px ring by its farthest point (radius 52 inside the ring's 65), never by its width. It's the same placement on the web (static boot, React fallback, `logo-ayrovi-loading.svg`) and in the app (`RING.symbolRadius`). Only the arc turns, and it respects reduced motion.
- **Native startup:** the native splash shows the white zebra Z on `#0A0A0A`. `BrandEntrance` then redraws it at the exact `app.json` size (`SPLASH_SYMBOL`, generated from `imageWidth` 160 × 0.7). Next, a white disc grows from the Z's centre and opens onto the app's white canvas; the timings are unchanged. The previous blue-on-white entrance would have flashed after a black splash.
- **Official avatars:**
  - website: Stories, Reels and the fullscreen header use `logo-ayrovi-avatar.svg` (ink Z fitted inside the circle);
  - app: the Reel publisher uses the solid ink Z, fitted inside its 28 dp circle.

  The blue symbol (`logo-ayrovi-symbol-blue.svg`) is gone. The blue *verified badge* of Publication is a separate token and is unchanged.
- **Cache:** every public logo URL moves to `?v=7.0`. The "-violet" lockup names stay as historical URLs, because stored interface configurations reference them.

## Deleted permanently

- the heart-handshake raster sources (`source/symbol.png`, `source/reference-lockup.png`);
- the 2026-10 archive (`assets/brand/archive/`: the retired Z and the old PNG logos);
- `logo-ayrovi-symbol-blue.svg`;
- the v6 identity document;
- the v6 test.

`tests/brand-logo-v7.test.ts` fails if any of them comes back, or if the opening coordinates of either retired contour appear anywhere in the sources, scripts, assets or public files. Git history is not deployed branding.

## Validation and limits

The automated checks are listed in the commit and the gate log. This document does not claim the following:
- a physical-device check of the launcher icon under different masks, of the themed icon, of a notification, or of the splash-to-entrance handoff;
- that an APK containing this commit has been built.

Those need a real Android and iOS check.
