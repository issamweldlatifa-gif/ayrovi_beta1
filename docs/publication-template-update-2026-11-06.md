# Publication — templates, identity and immersive reading

## Delivered scope

This updates the existing Publication entry point and CRM, without adding a navigation section, replacing Product Core / Cart Core, changing payment activation, or rewriting published content automatically.

### Feed header / identity

- Back, soft translucent blue title capsule, search and account action; the old wordmark/notification header is removed from this screen.
- Official ZAYROVI publisher names use the outlined official wordmark (including the crossbar-free A), exempt from body typography. Other publishers retain their authored name/avatar.
- Blue inline follow/unfollow uses the existing account-scoped, persisted follow endpoint. Verification is a scalable vector rosette with a rounded white check, shown only for publishers flagged official by the backend.
- Rounded editorial cards and a lightly translucent, blue-derived reaction capsule; no fake engagement counts or cosmetic-only follow/save state.
- Colour/radius/icon treatment uses the existing design tokens. The design audit permits the campaign caption overlay explicitly as an intentional image overlay, without relaxing other layout rules.

### Authored templates / CRM

Visual layout is separate from the existing media/content type:

| `template_id` | Composition |
| --- | --- |
| `auto` | Legacy-compatible layout, including existing feed compact/mixed configuration |
| `photo` | Large photo/media, title and description |
| `split` | Image beside editable title, description and optional live CTA |
| `campaign` | Media with a translucent caption/CTA plate over it |
| `carousel` | Swipeable media, real counter and selectable thumbnails |
| `video` | Existing inline video player, poster, mute/play and visibility lifecycle |

CRM offers template selection, a composition preview using the actual draft media/text, optional CTA label, and target (open the publication or its first associated catalogue product). CTA is a real control, not text baked into an image. Product actions reuse the existing product route; missing associations are rejected before a write. Template/video/carousel incompatibilities are validated server-side.

A video can be chosen from existing Reels: its file URL/poster are reused without changing or deleting the Reel. Uploaded video or direct media links remain supported. The preview is a composition preview, not a promise of pixel-identical video playback inside the CRM.

Three additive, defaulted columns (`template_id`, `action_label`, `action_target`) preserve existing rows. Admin create/update/read and public feed parsing carry these fields. Explicit authored templates take precedence over automatic compact layout. No existing posts were automatically converted or published.

### Reading / zoom

- Opening a post shows media, title and description only — no publisher header, visible back/close control, title bar, reactions or related-post list.
- Opening an image from the reader shows media only against black, without publisher/product chrome or a counter. The selected carousel slide is retained.
- Deliberate downward swipe dismisses the lightbox; another downward swipe at the top of the reader returns to the feed. Horizontal carousel gestures are not captured as dismissals. Incomplete drags spring back.
- System back, modal Escape and accessibility escape callbacks remain supported without visible buttons. Product links remain available from feed controls rather than being duplicated inside this minimal reader.

### Guest interaction sheet

Guest like, comments, follow, save, share and copy intentions open a branded sign-in sheet before any engagement write. The sheet uses the official Z symbol/wordmark, a sign-in CTA to the existing route and a continue-browsing dismissal. No automatic like/follow is fabricated on login. Authenticated error rollback and server-confirmed engagement counts remain intact.

## Validation

- Root: **263 files, 3292 passed, 17 skipped**.
- Native logic/contracts: **114 files, 1137 passed**.
- React Native UI: **38 suites, 208 passed**, including guest gates, real follow/save calls, optimistic-like rollback, minimal reader/lightbox, thumbnail selection, live split CTA and video mute/pause lifecycle. Jest retains its existing open-handle advisory (`--forceExit`).
- Root/native TypeScript checks, identity checks and generated token freshness passed. Client/server production build passed with the existing large-chunk advisory.
- Chromium touch checks: photo/split/campaign/carousel at **360, 390 and 768 px** (12 combinations), no card overflow or page errors. These presentation checks use clearly isolated QA feed fixtures with existing project photography; fixture engagement counts are not production data. Guest engagement writes: **0**.
- Browser touch injection exercised both black-lightbox dismissal and reader dismissal, not merely callback mocks. Thumbnail selection changed the actual visible slide counter.
- Real CRM browser roundtrip created a temporary **draft**, selected split + CTA, saved/read back the persisted fields, verified the draft was absent from the public feed, and deleted only that temporary QA draft. No page errors.

## Boundaries

Browser/touch emulation and React Native component tests are not Android/iOS device acceptance. No APK/IPA was built or installed as part of this task. Video control/lifecycle tests use a mocked player; no new video was generated and no new production video was published. Existing authored media, provenance, product associations and third-party images are preserved.
