# Phone-feedback corrections

Follow-up to [approved-redesign.md](approved-redesign.md). These corrections supersede the older composer separator, domed action silhouette, and camera-sheet surface.

## Clean and official navigation

- Composer outer surface is pure `#FFFFFF`, without its previous top separator. The input outline and short internal tool divider remain distinct from that removed separator.
- The shared orange action contour is a true circle, with centered wave/send/busy/recording glyphs. Native/web retain the existing actions and the single recording stop control.
- Native camera's enclosing AppSheet is transparent; only the black rounded camera panel supplies a surface. Capture, options, flash, switching, dismissal, safe-area padding and foreground/unmount guards remain.
- Lens/AYWEBs geometry is vector-traced from the owner's supplied images, rather than the prior hand-drawn approximations. `shared/officialNavigationGlyphs.json` drives native paths; matching web SVGs use new `v2` URLs because public assets have immutable caching. Original v1 assets are preserved. Shape geometry is retained while navigation uses the existing monochrome theme color.
- Source references: `Screenshot_20261108_095237.jpg` (Lens), `VeyEQRhbfGIAAAAASUVORK5CYII=(2).png` (AYWEBs). Binary foreground traced to curves and fitted proportionally into the existing navigation bounds; no new icon font or raster white rectangle.

## Concrete loading/playback changes

1. `useVideoPlayer(null)` still constructs a native player. Previously every mounted ReelCard did so, including inactive cards. Playback is now a separate child mounted only for the active card; changing pages unmounts/releases that child's player via Expo's hook.
2. Source preparation uses `replaceAsync` after subscription/view mount, not the synchronous source-bearing player constructor. Playback status, retry deadline, explicit retry, foreground pause, mute and error reporting remain.
3. Preview video is non-interactive (`pointerEvents="none"`), leaving the navigation tile in charge of taps. Android texture surfaces avoid the default SurfaceView's overlap/compositing limitations inside scrolling cards. These are code-level fixes for plausible phone-side interference, not proof that the reported phone failure has been reproduced.
4. Reels viewer mounts its list after data arrives so a cold link's selected index is actually honored. Paging uses the measured available viewport, with one initial cell and a three-page rendering window. Fullscreen playback contains the entire media on black.
5. Public content/catalog queries respect their existing 60/120-second fresh cache instead of always refetching on every mount. Stale and explicit/manual refresh still fetch real server data. No fabricated counts or content.
6. Below-fold home Reels requests wait until the existing visibility measurement sees the section. An invisible measurable anchor is retained when no data exists, so it can become visible and load. Empty social-count ID sets do not issue requests.

## Verification and limits

- Native unit tests: **117 files, 1151 tests**.
- Native UI tests: **53 suites, 315 tests**, including new inactive-player, asynchronous preview/touch, fresh/stale cache, deferred request, transparent camera and cold-link/paging regressions.
- Web Clean/identity tests: **38 tests**; native/root TypeScript; design/icon/brand guards; production build.
- Browser: actual computed white composer, no outer separator, circular geometry, official navigation, reduced viewport, attachment options and virtual-camera capture. This is a browser with a virtual camera, not a real phone or OS keyboard test.
- Android/iOS Metro/Hermes exports succeed. **An export is not an installed APK/IPA or physical-device acceptance.**
- Local logs: `.cache/phone-fixes-{types,webtypes,unit,ui,web,design,build,browser,export}.log` (ignored).
- Production API is outside this sandbox's network allowlist. Server cold-start/network latency and real-device video decoding have not been measured here; no timing/complete-resolution claim is made.

Phone acceptance still required on the rebuilt app: tap an animated home preview, open a cold Reel link, swipe several videos, retry offline/online, background/return, browse between tabs, open/close the OS keyboard and camera. Confirm both the new build identity and these behaviors before declaring the reported phone defects fully resolved.
