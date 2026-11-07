# Publication-only visual model — 2026-11-07

## Scope and reference

Implemented a dedicated presentation model for Publication using the supplied Threads screenshots as visual references. It covers the feed, publisher header, post reader, comments, post options, feedback states, and fullscreen media. Existing Publication data, templates and social services remain the source of truth. This is not a duplicate publication/business core.

The JPEGs establish visual direction, not certified original CSS values or access to Meta's proprietary font. The shipped typography is a licensed Inter derivative, not the Threads font. No pixel-perfect or physical-phone verification is claimed.

## Local design contract

- `publicationTokens.ts`: private palette, typography and publisher metrics.
- `publicationDesign.tsx`: Publication-only text renderer and rounded SVG action family. Navigation arrows continue to use the approved shared long-shaft arrow.
- `publicationFormat.ts`: locale-aware compact display of genuine counters, without changing stored values or adding engagement.
- `PublicationFeedback.tsx`: local loading, empty and failure presentation, retaining actual errors and retry callbacks.
- `PublicationPostOptions.tsx`: genuine supported menu operations, not decorative mock actions.
- Licensed `Publication-Regular` and `Publication-SemiBold` fonts are registered alongside, not instead of, existing brand fonts. License and provenance notices accompany the TTFs. Existing Noto Arabic Regular/Bold support is retained.

### Palette

| Role | Value |
| --- | --- |
| Paper / editorial backgrounds | `#FFFFFF` |
| Main text | `#101010` |
| Inactive action icons | `#454545` |
| Secondary text | `#666666` |
| Thin separator | `#E8E8E8` |
| Neutral surface | `#F3F3F3` |
| Composer field | `#F1F1F1` |
| Verified seal | `#0095F6` |
| Genuine discovery CTA | `#0078CA` |
| Active heart | `#F23F5D` |
| Fullscreen media | `#000000` |

These are scoped choices informed by the references, not claims about the source application's exact RGB values. The global primary `#0113B5` is unchanged.

### Typography and rhythm

- Body: 16/24, regular; publisher: 16/22, semibold.
- Secondary: 13/18; counters: 14/20; local headings: 18 or 20.
- Local line icons: 24, rounded stroke 1.8; interactive targets remain at least 44.
- Feed inset 8, avatar 44, publisher column 52: publisher name and copy align at x=60. Standard photo, carousel, caption-first, shoppable and social media/actions use this column too. Split/campaign preserve their approved editorial composition, with the local typography and white palette.
- Copy remains above media, with Unicode-safe inline expansion/collapse and no below-media duplicate. Existing social templates suppress standalone titles. The separator remains a thin full-width line.

## Browsing and genuine actions

- The comment control opens a full post reader: real publisher, original copy above media, supported product links, actual comments and the existing composer/auth gate. It does not open an unrelated generic chat.
- Image taps open black fullscreen media with `contain`, separate top controls, a separate white action area, safe areas and actual comments/options. Existing galleries and carousel behavior remain.
- Four actual feed actions are shown. The existing reaction alternatives remain available through long press and accessibility actions. No nonfunctional repost button or invented engagement was added.
- Post options expose existing capabilities only: copy URL, save/unsave, hide, not interested, authentication, pending/error/retry handling. No unsupported reporting, blocking, translation or AI actions are presented.
- Follow/check states still depend on the persisted follow service. A failed follow does not become a confirmed check.
- `Zayrovi Team` capitalization is retained where that is the real official publisher; other publisher identities are not overwritten.

## Commerce and shared-component boundary

Products, product details, cart, checkout, global theme, logo and shared brand typography are not reskinned. Navigating from the post reader into the actual product restores the existing ZAYROVI typography and controls. Existing product links are retained; no extra commercial card rail was added to the feed.

The shared `Comments` component has an explicit opt-in Publication presentation flag, defaulting to false. Its mutations, drafts and reply logic are reused. Ordinary consumers retain their existing brand rendering. No catalogue reseed or customer data migration accompanies this update.

## Final-source validation

- Mobile TypeScript: passed.
- Mobile unit tests: **115 files / 1,145 tests passed**.
- Mobile UI tests: **39 suites / 273 tests passed**.
- Root Publication tests: **8 files / 71 tests passed**.
- Root design inventory, design guard, TypeScript and production build: passed.
- Final Android and iOS Expo exports: passed; both generated Hermes bundles. Export success is not a signed APK or a physical-device test.
- Real browser/API test: 28 combinations of four widths (320/360/390/430) and seven existing showcase templates. Checked typography, SVG strokes, four genuine actions, name/copy/media alignment, separator and CTA placement.
- Real browser/API test: guest follow authentication, persisted follow/unfollow, save/reload, comment submission/reload, full reader and actual product navigation with original brand fonts restored.
- Fullscreen geometry/contain and separate controls tested at 320×740, 390×900, 430×900 and 800×390.
- Targeted follow-network failure verified without a false successful state. This is not a claim that every asset is safe under a global offline fault.
- Additional French/Arabic browser checks: inline measured expansion and complete source recovery at 360/390/430; actual clipboard writes/readback; settled reader opening/closing; dark-preference fullscreen black background and closing. These checks reported no page errors.
- Controlled temporary browser-test accounts/comments were removed using their exact generated identity and foreign-key-aware cleanup, not a blanket reset.

The comprehensive browser run on the final implementation completed with `PAGE_ERRORS []`. One browser launch attempt failed before loading the app with a Chromium startup SIGSEGV; the subsequent complete run passed. An initially mistyped targeted root-test command matched no files; the corrected eight-file Publication run passed as listed above.

### Limits

No new signed installable APK or physical Android/iPhone test is claimed in this report. Clipboard is browser-proven; native export does not prove the native system clipboard UI. Real comment submission is browser-proven; reply submission was not separately exercised in that browser run. Existing reply logic remains covered by the shared component's test coverage.
