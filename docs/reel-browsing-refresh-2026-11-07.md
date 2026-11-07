# Reel browsing refresh — 2026-11-07

## Requested scope

Update both the external Reel preview and the fullscreen experience using the supplied comparison screenshots. Publishing is currently first-party only: display **Zayrovi Team**, not a borrowed reference creator or an open-publication identity. Keep TND prices, genuine actions and the existing ZAYROVI commerce identity.

## External preview

- Replace the empty/poster-only preview and gray title strip with the actual video, muted and looping when visible.
- Show a small play/video badge at the top of the rounded media frame.
- Place the publisher avatar/brand mark and `Zayrovi Team` below the media, with an independent 44-point options control.
- Retain the supplied poster only as a loading/offscreen fallback behind the video; do not manufacture or replace CRM assets.
- Only the horizontally active preview mounts a player. Also measure vertical section visibility, stop when it leaves the home viewport, and stop when the route loses focus or the app backgrounds. Reduced motion keeps the visible video paused instead of autoplaying.
- The preview media layer does not intercept the card's navigation touch.

## Fullscreen experience

- Replace the persistent title/description/sign-in stack with a compact publisher row. The original title and description remain available under the actual options/info action.
- Keep three controls on the video: share, sound and options. Likes and comments are still genuinely available from options, rather than being deleted or replaced with nonfunctional icons.
- Keep the approved long-shaft unframed back arrow.
- Keep the same tray geometry and initial-open behavior. Opening/closing products does not remount or pause the active video. Publisher, pill and action rail follow the tray's position.
- Open options/auth pause playback. App background and route focus are also respected.
- Closed/open pill colors remain white/black on media, including dark preference. Inline tray text is contrast-correct too.
- Explicit video width/height cover the intended frame on web as well as native layout.

## Genuine options and shared services

- Publisher follow uses the existing `publication_follows` relation and the existing follow write API. Added a private/no-store GET for its actual current state; no local optimistic follow/check is invented.
- Guest follow/like gates reuse the branded authentication sheet. Inside the options modal, the existing authentication host avoids stacking another native modal.
- Sharing includes the actual Reel deep link. The server interaction is recorded only for a system-reported share, not simply opening/dismissing the sheet.
- Hiding is explicitly **on this device**, persisted in AsyncStorage. Both Reel routes and the home section filter the same device preference. Home exposes a restore control, including when every Reel is hidden. Hiding the final Reel exits the empty viewer.
- No unsupported report/block/recommendation-personalization service is implied. The info action explains the actual first-party/date-ordered listing.

## Commerce boundary

`LinkedProductCard.reelPresentation` is opt-in and defaults false: Reel overlays use a one-line title, regular-weight price and a little more image breathing room. All prices still use the existing amount formatter and the server's currency, including TND. Product/cart/checkout typography and global styling are unchanged.

Favorite taps stop propagation rather than also opening the product. Guest favorites open the branded authentication gate. The Reel-specific web product container is a navigation link, avoiding nested-button DOM errors. Other consumers retain their existing card presentation.

## Final-source validation

- Mobile typecheck passed.
- Mobile unit: **115 files / 1,145 tests passed**.
- Mobile UI: **41 suites / 277 tests passed**.
- Root Publication + publisher follow API: **9 files / 74 tests passed**.
- Root typecheck, production build, design inventory, design guards and identity checks passed.
- Android and iOS Expo/Hermes exports passed.
- Real browser: muted video actually advances, one preview player, external publisher row, no title overlay, vertical-scroll stop/remount, options pause and guest follow gate.
- Real browser: home-card navigation, clean fullscreen publisher, three-control rail, unchanged player node across tray toggles, continued playback while toggling products, and real comments modal access.
- Fullscreen video bounds and publisher/pill/tray separation checked at widths 320, 390 and 430.
- Actual API account: follow saved and read back after reload. Exact temporary QA account removed with foreign-key-aware cleanup.
- Device hide/reload/restore checked in the browser, including leaving the final hidden viewer. Unit UI tests also prove a failed storage write does not hide the item.
- Unit UI test verifies dismissed sharing does not increment engagement and successful sharing includes the deep link.
- Browser validation reported no page errors or console errors after resolving the Reel-specific nested-button issue.

### QA limits

The sandbox cannot fetch the demo's external MDN video host. Browser media playback therefore used a context-only local WebM fixture. The local demo Reel has no linked products, so its browser tray test used context-only links to existing real catalogue products returned by the API. Neither interception modified stored Reel URLs, associations, prices, CRM or user data. Screenshots of this fixture are not represented as the production flower video or delivered as final product imagery.

No physical phone playback test or newly signed APK is claimed. Native export checks bundling, not decoder/device behavior or the native system share sheet. Reduced-motion/background/focus behavior is additionally covered by the component hook test.
