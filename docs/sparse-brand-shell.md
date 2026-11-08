# Sparse shell and blue brand entrance

## Scope

- Mobile main header: lowercase vector wordmark only, disabled `Plus ★ Light`, notification bell, cart. No invented Plus destination. AYWEBs keeps its supplied wordmark and existing favorites/cart actions.
- The main Menu entry is not rendered. Its previous complete native implementation is retained, unmounted, as `LegacyMainMenu.tsx`; web `MenuDrawer`, routing, settings, pages and data remain intact. SONIM's own conversation menu is not the main Menu and is unchanged.
- Latest revision: Accueil uses the brand symbol; only five native destinations are visible (Accueil, Lens, AYWEBs, Sonim, Profil), without visual labels. The Social tab entry is hidden with `href: null`, retaining the Publication screen/error boundary. No destination was removed and no Publication business core was copied. `/publications` remains valid.
- Home's inactive symbol uses black in light mode, white in dark mode; selected uses **#0095F6**, exactly Publication Verified. `assets/brand/appearance.json` is their shared accent source; commerce primary colors stay unchanged.
- Footer brand graphic removed on native/web; payment strip, legal/help links and commerce preserved. SONIM's decorative secondary logo removed; Publication auth uses the wordmark only.
- Web main header likewise hides Menu, uses wordmark/Plus/bell/cart, and opens the existing account Notifications section. CRM custom logo data/rendering remains supported, without the former extra repeated wordmark.

## Startup

Expo native: system splash is blue symbol on white in both themes, aligned to the 96pt JS symbol. JS shows that symbol on white, expands a Verified-blue disk to cover the viewport, transitions to the existing neutral waiting indicator, and reveals the mounted application once fonts/preferences are ready. Native-driver transforms/opacity only; cleanup on unmount; bounded intro/exit callback fallbacks; reduced motion skips expansion. Application initialization is not duplicated or blocked by a permanently unresolved animation callback.

Durations are implementation choices, not measured from the supplied stills. Android Capacitor launch resources are regenerated blue/white from the same contour, but its HTML boot loader is separate; the animated entrance described above is the Expo implementation.

## Validation

- Mobile UI: **45 suites, 291 tests passed**, including black/white/selected-blue Social, disabled Plus, hidden Menu with legacy settings preserved, readiness gating, lost animation callbacks, and reduced motion. Existing Jest act/open-handle warnings remain; runner uses `--forceExit`.
- Mobile unit suite: **116 files, 1,148 tests passed**.
- Root targeted identity/color/asset/icon suites: **4 files, 210 tests passed**.
- Root/mobile TypeScript, root production build and design/icon/identity checks passed.
- Android and iOS Hermes exports passed (5.2MB / 4.9MB); these are compilation checks, **not APKs or physical-phone proof**.

A new native build is needed for the updated system splash/launcher assets. No remote deployment, new installed APK, or physical-phone verification is claimed.
