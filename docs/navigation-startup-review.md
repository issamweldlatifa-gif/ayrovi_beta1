# Five-icon navigation and bounded startup review

## Implemented corrections

- Exactly five visible native entries, ordered **Accueil → Lens → AYWEBs → Sonim → Profil**. Accueil is the supplied heart-handshake symbol, Verified blue when selected and black/white when inactive. No visible tab captions; translated accessibility names remain. AYWEBs retains its supplied paw and colors.
- Social is hidden using `href: null`, not deleted. Existing Publication screen, route, links, data and functions remain. Cart and all five destinations retain existing actions; Lens still opens `/z-lens` and Sonim retains its full-screen behavior.
- Startup now waits for a positive overlay layout before releasing the system splash or starting animation. The fill uses explicit 50%/50% anchoring against the measured overlay, including rotation, instead of relying on unspecified absolute-child positioning. Its scale covers the viewport diagonal without the previous roughly twofold overscaling. Removed the redundant window-dimensions subscription; measured layout is the only sizing source.
- Removed per-tab caption render factories and caption/underline views. Native-driver opacity/scale animation, reduced-motion handling, bounded animation fallbacks and cleanup remain. This reduces rendered chrome work; it is **not a measured FPS, launch-time or APK-size improvement**.
- Fixed a real startup routing gap: the previous deep-link effect did not subscribe until readiness, dropping warm links received during font/preferences loading. It now subscribes immediately, validates hosts/paths before queueing, and flushes once ready. A delayed initial URL cannot supersede a newer valid link; a foreign-host event cannot suppress a valid cold link. Late OS replies after unmount are ignored.

## Verification and security scope

- Full mobile UI run: **46 suites / 294 tests passed**. Follow-up targeted runs cover final layout, Home colors, five-entry accessibility, loading/rotation/reduced motion and cold/warm/malicious deep links.
- Full mobile unit run: **116 files / 1,148 tests passed**.
- Targeted root security/navigation run: **7 files / 48 tests passed** (admin bootstrap reset, assistant-tool security, native network origin restrictions, quotes and navigation history/home/public links).
- Root/mobile TypeScript, production build, design/icon/identity checks and Android/iOS Hermes exports checked. Export bundle sizes remain approximately **5.2MB Android / 4.9MB iOS**, not APK sizes.
- `npm audit --omit=dev`: root **0 findings**; mobile **9 reported** (8 moderate / 1 low; **0 high/critical**). These are dependency-chain counts, not nine independently established app exploits. `glob` (GHSA-3g3m-2fjr-6pw4) and `minimatch` (GHSA-g3hv-75wg-m249) remain in the Expo build-tool chain. The existing version-checked postinstall deepmerge safety backport remains in place, although npm audit still flags its version. No forced Expo downgrade or untested cross-major override was applied just to clear audit output.

## Boundaries / remaining acceptance

This is a bounded source, dependency, automated security and regression review, **not a claim that every project defect is fixed or that the app is unconditionally secure**. Expo toolchain advisories remain tracked above. Physical phone frame timing, memory, device navigation, deployment and a fresh installed APK still need verification. Existing Jest act/open-handle warnings remain; UI runner uses `--forceExit`.
