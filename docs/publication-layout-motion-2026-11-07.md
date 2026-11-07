# Publication layout and motion refinement — 2026-11-07

## Basis and scope

The user supplied further Threads screenshots and requested implementation without a screen recording. These changes use that visual evidence and conservative motion choices suited to our app. No live Threads browsing, original timing measurement, proprietary font identity, exact imitation, FPS measurement or physical-device test is claimed.

Only Publication presentation and an opt-in shared-comments visibility input change. Reel work, products, cart, checkout, global typography/colors, CRM data and social write semantics remain intact.

## Visual changes

- Local rounded action glyphs: 22 instead of 24, stroke 1.7 instead of 1.8. Interactive targets remain at least 44×44.
- Real counters: regular licensed local face, 15/20 instead of 14/20, single-line. The existing real counter formatter and genuine action semantics remain.
- Feed actions form a leading group, with 12 spacing rather than equal full-width distribution. Their first glyph starts at the copy column; touch-target width is not mistaken for visible glyph width.
- Fullscreen actions form a centered group, with 8 spacing on the existing black media surface. No unsupported repost action is fabricated.
- Social pair and mosaic media span a wider frame (12 from the page edge with the normal feed inset); text, CTA and action alignment remain independent at the publisher column. Single-media and approved editorial compositions retain their respective layouts.
- Publisher/body fonts and the licensed Arabic/Latin font families are retained; no global brand font substitution.

## Motion and continuity

Chosen local timings, not claimed Threads timings:

| Transition | Choice |
| --- | --- |
| Modal entrance | 200 ms, opacity + 12-point translation |
| Button/back dismissal | 140 ms, opacity + translation |
| Internal gallery entrance | 140 ms fade |
| Completed vertical dismissal | 180 ms toward the viewport edge |
| Cancelled drag | Near-critically-damped spring, stiffness 280 / damping 32 / mass 1 |

- Use native-driver opacity/transform animations, not page layout animation. The entrance/exit transition does not create an interaction handle that blocks list work.
- A completed swipe moves out before closing; it no longer snaps back to zero before dismissing. The drag offset resets only after its layer is inactive, so reopening cannot reveal an offscreen stale transform.
- Existing direction/distance/velocity guards preserve horizontal carousel swipes and avoid dismissing a reader scrolled away from its top.
- Reduced motion removes automatic entrance/exit and drag-return tweening. Closing is guarded once, cleaned up on unmount, and bounded if a native animation callback is interrupted. Tests cover changing motion preference during a close.
- Use a stable translucent native modal configuration with safe-area padding, avoiding switching its window geometry between reader and gallery.
- Retain the actual reader and its variable-height comments list behind the media layer instead of unmounting them. Hidden reader content is inaccessible and cannot take touches; its video is inactive.
- The shared Comments `active` input defaults true. When the Publication reader resumes, it reloads the existing owner/target draft map, including changes made in fullscreen comments. This does not introduce another draft or comment business core. Inactive inputs blur.
- Feed virtualization, stable post keys, saved feed offset and one-active-video behavior are retained. No new feed scrolling or forced scroll-to-top is introduced.

## Validation

Final-source local checks:

- Mobile TypeScript passed.
- Mobile UI: **42 suites / 281 tests passed**.
- Mobile unit: **115 files / 1,145 tests passed**.
- Root Publication + publisher-follow tests: **9 files / 74 tests passed**.
- Root TypeScript, production build, design inventory, design guards and identity check passed.
- Android + iOS Expo/Hermes exports passed.

Browser checks:

- 28 combinations: seven existing showcase templates × 320/360/390/430 widths, checking local font, thinner SVG strokes, leading group bounds, wider pair/mosaic frames, copy order and genuine CTA placement.
- Existing actual guest auth, persisted follow/unfollow/save/comment submission, product navigation restoring brand fonts, targeted follow failure and four fullscreen gallery geometries still passed. The comprehensive harness exceeded the tool's initial waiting window but continued to completion; its final log reports `PAGE_ERRORS []` and scoped QA cleanup.
- French and Arabic clipboard, reader/gallery/close smoke checks passed.
- A dedicated authenticated browser check marked the original reader DOM node and its scroller, scrolled to offset 70, opened media, changed the shared draft in fullscreen comments, and returned: same reader node, same offset, updated draft. No remount-based restoration guess was used.
- Real touch events through Chromium CDP completed vertical gallery dismissal. Reopening verified no stale drag transform. Immersive group geometry was centered. Final browser result: `PAGE_ERRORS []`.
- Temporary QA accounts and their related interactions were removed using their exact generated identities and foreign-key-aware cleanup. No blanket reset or reseed.

## Limits

The browser's synthetic touch sequence is not a physical-phone gesture test. Native export is not a signed APK, device-decoder test or measured frame-rate guarantee. Timings are sensible app-specific choices, not extracted source-app animation values. No shared-element zoom, pinch feature, fake engagement or unsupported interaction was added.
