# zayrovi — heart-handshake identity, 8 November 2026

## Approved direction and scope

The supplied heart-handshake replaces the retired standalone Z throughout active branding. The supplied lowercase `zayrovi` outline replaces the previous uppercase/crossbar-free wordmark. The primary lockup has whitespace, **no divider**, and is monochrome black/white. Loading uses the new symbol in neutral grey, not the retired emblem. Existing blue action accents, typography, commerce behavior, currencies, payment strip, publisher name **Zayrovi Team**, customer content, domains, application identifiers and deep links are unchanged.

## Source and reproduction

- `assets/brand/zayrovi-2026-11/source/`: the three supplied raster originals, unchanged.
- `assets/brand/zayrovi-2026-11/logo.json`: contour master, original file SHA-256 hashes, crop bounds and version `6.0`.
- The JPEG wordmark's unrelated orange sliver at its extreme left is excluded. Neither the wordmark nor symbol has been substituted with a guessed font, stock icon or generative redraw.
- These are **raster-derived vector contours**, not a claim to have received the designer's original SVG/font master. Ownership, font licensing and trademark similarity have not been legally cleared.
- Optional contour rebuild: install `scripts/requirements-brand.txt`, then run `python scripts/trace-zayrovi-logo.py`. Dependencies are pinned. Normal builds use the committed JSON and do not require Python.
- `npm run brand:build` generates identical web/native symbol constants, native wordmark, web SVG/PNG variants, favicon/PWA icons, Expo icons/splash images and Capacitor source images.
- `npm run android:assets` generates the Capacitor Android density-specific launcher and splash images from the new light symbol. 100 platform assets regenerated.

The web and native primary lockup share proportions: wordmark height 66% of symbol height, clear space 24% of symbol height. Native explicit sizes preserve these proportions. Contours carry no font dependency. Runtime tints come from theme tokens.

Old `zMark.ts` modules and their imports are removed, not kept as rendering aliases. Retired source geometry and two original raster assets are archived under `assets/brand/archive/2026-10/`, **outside public/app asset paths and not used by runtime code**. Historical documentation/mockups and Git history are not deployed branding.

## Active surfaces

- Web public header/footer, account and authentication surfaces, admin login/shell, official social avatars, fallback images and metadata assets.
- Web static startup and React Suspense fallback use the same new contour and centering transform; new grey page-loading SVG is used by shop and admin startup.
- Native header/footer, official Publication/Reel publisher avatars, branded authentication, initial loading screen and shared network loading blocks (including Publication).
- Expo launcher/adaptive/favicon/light-and-dark splash images, Capacitor icon/splash inputs and Android platform resources.
- All existing web logo URLs are cache-busted to `?v=6.0`; versioned built-in logo values from historical interface configuration resolve to the current primary lockup. Actual custom user-uploaded branding is not silently deleted.

## Loading behavior

The heart-handshake stays stationary. Only the indeterminate surrounding arc rotates; it does not claim measured download progress. On the web the grey is `#666666`; native loading uses `theme.colors.muted` (Publication uses its local neutral muted token). Arc motion respects reduced-motion preferences. Native loops stop on unmount. Structured skeletons and compact action/button spinners remain unchanged: they are not old Z logos.

## Validation

- Mobile TypeScript: passed.
- Mobile UI: **43 suites / 284 tests passed**, including exact symbol/wordmark contours, grey loading, reduced motion and animation cleanup. Full UI command uses the project's existing `--forceExit` workaround for test-runner open handles; this is not a physical-device lifecycle/performance claim.
- Mobile unit: **115 files / 1145 tests passed**.
- Root targeted branding, dependency, shop, Publication and Reel checks: **16 files / 356 tests passed**.
- Root TypeScript, client/server build, design inventory, icon contract and identity checks: passed.
- Android and iOS Hermes exports: passed (5.2 MB / 4.9 MB bundles).
- Native/PWA/Capacitor representative PNG silhouettes are compared with the new contour master, not only filenames. Source tests prohibit the retired contour in active web/native source/public SVGs and ensure the old vector modules cannot be imported.
- Actual browser: web header/version/assets/no horizontal overflow at **360 / 390 / 768**; Expo web home at **390** in French and Arabic has visible new symbol AND supplied lowercase paths; actual shipped grey loading SVG animates only without reduced motion; actual static startup paints the grey new symbol with JavaScript blocked. **PAGE_ERRORS []**.

Browser evidence and logs are local `.cache/new-brand-*` artifacts, excluded from Git. This is not physical-phone testing, visual trademark clearance, or proof that an APK containing this commit has already finished building.
