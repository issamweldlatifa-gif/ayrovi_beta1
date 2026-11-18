# ZAYROVI — « Za. » brand guide (v9, 18/11/2026)

Visual board: `ZAYROVI-Za-brandbook.png` (generated from the master by `build-brandbook.py`).

## 1. One master
| What | Where |
|---|---|
| Master geometry + rules | `assets/brand/zayrovi-2026-11/logo.json` (v9.0) |
| The owner's two originals (sha-256 pinned) | `assets/brand/zayrovi-2026-11/source/za-light-v9.jpg`, `za-dark-v9.jpg` |
| Generator (all assets and code) | `npm run brand:build` → `scripts/build-brand-assets.mjs` |
| Android resources | `npm run android:assets` (after `brand:build`) |
| Contract test | `tests/brand-logo-v9.test.ts` |

The logo is never redrawn by hand. Everything (web SVG/PNG, the app's `BrandLogo`, splash, icons, e-mails, invoices) comes from the same three paths: **ring** (circle with the z cut out), **a**, **dot**.

## 2. The logo
- **Parts:** yellow circle, knocked-out **z**, **a**, yellow **dot**.
- **The z is always a cut-out.** It shows whatever is behind the logo: white on white, black on black. Its lower bar **always runs out of the circle**. It is one open contour and is never closed inside the circle.
- **The a stands apart** from the circle (a gap, no contact).
- **Fixed ratio:** width = 1.587 × height. Never stretch, slant or crop it.

### Two official versions
| Version | Surface | a | Circle + dot |
|---|---|---|---|
| **Light** (`logo-zayrovi-logo-light.svg`, `<BrandLogo tone="light">`) | white / light | ink `#0A0A0A` | yellow `#F2AE00` |
| **Dark** (`logo-zayrovi-logo-dark.svg`, `<BrandLogo tone="dark">`) | black / dark / photo with a scrim | white `#FFFFFF` | yellow `#F2AE00` |

In the app, `BrandLogo` follows the theme by default. Over a hero tint, `brandToneForInk(ink)` picks the version from the ink colour.

### Symbol alone (circle + z)
Use it wherever the full logo would be under **20 px high**: favicon, round avatars, notification icon, loading ring, tab icon (`BrandSymbol`, `logo-zayrovi-mark.svg`, `logo-zayrovi-icon.svg`).

## 3. Clear space and sizes
- **Clear space:** the dot's diameter on every side (about 12 % of the height).
- **Heights (dp/px):** auth 40 · **home 32** (slightly larger, as requested) · other headers 28 · minimum 20.

## 4. Placements (applied)
| Placement | Version | Size |
|---|---|---|
| App home header (`AppHeader`) | light (dark over a dark hero) | 32 |
| Other app headers, drawer menu | by theme | 28 / 30 |
| App auth screens + Publication sheet | light | 40 |
| Website header (`Navbar`) | light (dark over the hero) | 32 |
| Website footer (black) | dark | 40 |
| Admin login (black panel) / mobile login | dark / light | 40 / 20 |
| Back-office sidebar (black) | dark | 22 |
| Customer auth pages | light | 32 / 40 |
| Web `AppHeader` | by `tone` | 32 |
| App icon (iOS, Android, PWA, apple-touch) | dark on a black `#0A0A0A` tile | 70 % width |
| Android adaptive icon | dark, inside the 66 dp safe circle; background `#0A0A0A` | — |
| Android 13 themed icon / notification | single-colour alpha mask | — |
| Native splash → `BrandEntrance` | dark on `#0A0A0A`, then a soft fade into the app | 86 % of 200 dp |
| Loading (site boot, app, pages) | yellow symbol inside the grey ring | r = 52 |
| Official avatar (Publication, Reels, Stories) | yellow symbol on a black disc (84 %) | 28 / 32 |
| Favicon | yellow symbol, transparent | — |
| Social share (og:image) | dark on black, 1200 × 630 | — |
| Auth e-mails | dark PNG on the black band | 40 |
| Invoices (HTML) | light, inline SVG | 40 |

## 5. Colours
| Token | Value | Use |
|---|---|---|
| `BRAND.yellow` / `brandYellow` / `--ay-e-brand-yellow` | `#F2AE00` | **logo only** (circle + dot) |
| `BRAND.black` | `#0A0A0A` | text, buttons, dark surfaces |
| `BRAND.white` | `#FFFFFF` | canvas, the a on dark |
| action blue | `#0A63F5` | links and the primary action |

The yellow is measured from the owner's originals (median `#F2AE02`). On white it reaches only about 1.9:1 contrast, so it is never used for text or thin lines.

## 6. Don'ts
Stretching or slanting the logo · recolouring the circle (except monochrome masks) · closing the z inside the circle · letting the a touch the circle · yellow on yellow, or on a busy photo without a scrim · shadows, outlines, gradients · rebuilding the logo in live text.

## 7. Cache
Every public logo URL carries `?v=9.0`. The historical file names (`logo-zayrovi-lockup-*-violet.svg`, `wordmark-*.svg`) now contain the official logo by surface tone, so stored settings keep working.
