# Changelog

All notable AYROVI changes are recorded in this file.

## [Unreleased]

### Changed
- **Design System — Zalando Strategy (P4/T1): the storefront is now strictly monochromatic and orange is an action trigger, not a decoration.** Six canonical tokens are the single source of truth (`client/src/design/tokens.css`): `--ayrovi-bg-main #ffffff`, `--ayrovi-bg-surface #f8f9fa`, `--ayrovi-border-soft #eaeaea`, `--ayrovi-text-primary #111111`, `--ayrovi-text-secondary #666666`, `--ayrovi-color-brand-orange #ff6900`. `--ayrovi-cta`, `--ayrovi-orange` and `--ayrovi-accent` are now aliases of the single orange bearer; `--ayrovi-accent-soft` moved from peach `#ffb070` to the surface grey. The legacy brand orange (`#fe7003`, `#ff7a00`) is gone from `client/src` and from every server default.
- Orange backgrounds, gradients and full-card washes are deprecated: the LENS v2 section (peach gradient + orange diagonal) is now a pure white AI tool surface, the `Découvrez AYROVI` transition card and the LENS banner became `--ayrovi-bg-surface` cards whose only identity mark is a `3px` orange inline-start rule, and every filled badge (Prix repéré, OFFRE DU MOMENT, Meilleure correspondance, stock, currency, payment) is now light grey/white with dark ink. Merchant price arrows are transparent circles with a 1px `--ayrovi-border-soft` border and a black arrow. Only one filled orange button remains per screen — a second one is automatically demoted to a secondary button (applied to `lens2__banner-cta` and the composer's voice-mode button). The Lens viewfinder (detection frames, scan beam, dots, spinner, phone mockup) is neutral white/ink, Google-Lens style. Measured orange pixel coverage: home page 9.2% → 1.1%, LENS section 13–14% → 1.1%, transition card 92–96% → 0.2–0.8% (budget ≤ 3%).

### Changed
- **Home page reduced to Hero + Trust Bar (product decision 2026-09-14).** The four home blocks are gone: `TransitionCard` (« Découvrez AYROVI »), `BrandsShowcase`, `LensHero` and `DiscoveryHub` are no longer rendered, and the first three files are **deleted** from the project. `DEFAULT_HOME_BLOCKS` is now an empty array, so the page ends at the Trust Bar — the header, announcement bar and **bottom navigation are untouched**, and LENS, cart, account and checkout keep working (LENS now opens from the bottom-nav Lens button). Orange coverage after the change: home page 1.09–1.48%, Hero 1.16–1.90%, Trust Bar 0.36–1.0%, LENS screen 0% (budget ≤ 3%).
- `client/src/components/DiscoveryHub.tsx` is **kept on purpose** (file intact, not rendered): its tab logic — single active panel, full keyboard navigation on a `role="tablist"` (`ArrowLeft`/`ArrowRight`/`Home`/`End`, `tabIndex` 0/−1), `scrollIntoView` on the active tab, and navigation-history integration per tab — is preserved for reuse. A header comment marks it so it is never deleted as dead code.
- The blocks mechanism itself is untouched: `/api/public/home-blocks` and Admin → Sections keep working, and re-adding an id to `DEFAULT_HOME_BLOCKS` re-enables the corresponding block.
- Tests: removed the three locks that read the deleted components' source (`home-content-cms`: brands heading structure, brands 24px gutter, LENS v2 reference composition) and repointed `design-zalando` to assert the deletion plus the surviving `.ay-surface-card` primitive. `verify/zalando-audit.mjs` now measures the Hero, the Trust Bar and the LENS screen opened from the bottom nav. Suite: 675/675 passing, typecheck and build green.

### Added
- **LENS editorial block on the home page (reference: Zalando.fr).** A new section rendered right after the Trust Bar: eyebrow → very large title → supporting paragraph → full-width media → text link « Ouvrir LENS → ». Everything is dashboard-driven from **CONTENU → LENS** (`/api/public/lens-hero`): title, description, CTA label/URL, the media itself (uploaded MP4/WebM/MOV up to 32 MB **or** an external YouTube / Vimeo / .mp4 https link) and its poster image, plus the aspect ratio (16:9 · 4:5 · 1:1 · 9:16) and loop/autoplay/muted switches. Seeded once with the project's `lens-sneakers.jpg` so the block is never empty; uploading a video or pasting a link switches it to video mode automatically.
- `src/services/lensMedia.ts` — media validation: external links are rewritten to the official players (`youtube-nocookie` / `player.vimeo`) and anything else (javascript:, http:, non-video URLs) is rejected rather than handed to the browser. Uploads are MIME- and extension-checked (max 32 MB) and stored under `data/uploads/lens/`.
- `client/src/components/LensFeature.tsx` and its CSS block in `client/src/index.css` — Zalando-style rhythm with a deliberately comfortable vertical gap between sections (`--lens-feature-gap: clamp(64px, 15vw, 104px)`), a title at `clamp(40px, 12vw, 76px)` (46.8 px on a 390 px phone, 76 px on desktop) and a full-bleed media on mobile that becomes a framed, rounded card from 768 px up.
- `tests/lens-feature.test.ts` (15 locks): no frozen copy in the component, media published by the API, link rewriting, rejection of unsafe links, block order after the Trust Bar, spacing tokens, title hierarchy, full-bleed media, and the Zalando charter (monochrome block, orange used exactly once — on the action arrow).

### Security
- `frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com` added to the Content-Security-Policy so the embedded players work while every other framing origin stays blocked.
- `PUBLIC_UPLOAD_DIRS` widened from `['hero']` to `['hero', 'lens']` — `data/uploads/lens/` is the new public home for LENS videos. The allow-list remains closed and default-deny; the three governance tests that lock it were updated to the new explicit list.

### Added
- **Stories container on the home page (reference: Zalando « Stories sur … »).** A titled container placed between the Hero and the LENS block: title + subtitle → a row of **4 or 5 cards of strictly identical dimensions** (equal-column grid, fixed 9/16 thumbnails) → the action link **centred in the middle of the container**. Tapping a card opens the story viewer; the centred link opens the Stories tab unless a destination is configured. Every field is dashboard-driven from **Stories Studio → Bloc d'accueil** (`/api/public/stories-showcase`): title, subtitle, link label, link destination (internal path or https URL, validated), number of cards (4 or 5, bounded) and visibility. The block hides itself when no story is currently published, rather than showing an empty frame.
- `client/src/components/StoriesShowcase.tsx` + its CSS block in `client/src/index.css`, and the `stories_showcase_settings` table with `GET/PUT /api/admin/stories-showcase` and `GET /api/public/stories-showcase`.
- `tests/stories-showcase.test.ts` (13 locks): no frozen copy in the component, card count bounded to 4/5, unsafe link destinations rejected, Trust Bar gone from the page *and* the project, strictly identical card dimensions, centred link, comfortable section gap, and the Zalando charter (monochrome container, orange used exactly once — on the action arrow; unseen stories are marked with ink, not orange).

### Removed
- **The Trust Bar is deleted for good — everywhere.** Following the product decision, the whole feature is gone, not just its rendering: `client/src/components/TrustBar.tsx` (public) and `client/src/admin/TrustBarPage.tsx` (admin screen); the 6 admin routes `/trust-bar`, `/trust-bar/items`, `/trust-bar/items/:id`, `/trust-bar/reorder`, `/trust-bar/settings` and the public `GET /trust-bar`; the `trust_bar_items` and `trust_bar_settings` tables with their seeds and the `trust_bar_compact_v1` one-shot migration; the `content.trust-bar` back-office descriptor (so the entry disappears from the admin sidebar); the `TRUST_BAR` audit resource; the `TRUST_BAR_ICONS` allow-list; the `.trust-bar*` / `.trust-bar-compact*` stylesheets; and the admin-only `.admin-trustbar-*`, `.admin-preview-toggle` and `.admin-icon-picker` rules. `.admin-toggle` is kept — it backs the shared `Toggle` primitive. The home page is now Hero → Stories container → LENS block, and `GET /api/public/trust-bar` answers 404.
- Tests re-pointed rather than weakened: the one-shot-migration persistence guard (`tests/ayrovi.test.ts`) now proves the same regression on `lens_hero_settings` + `lens_feature_media_v1`; the back-office snapshots drop to 36 legacy sections / 48 navigation entries / 51 section ids; `TrustBarPage` leaves the six-file colour allow-list in `tests/design-tokens.test.ts`.
- **Note:** the shared `Toggle` primitive (`client/src/design/admin/Toggle.tsx`) is now unused — it is exported from the admin component barrel, so it was kept. Say the word and it goes too.

### Changed
- **The Stories section is rebuilt to match the reference model, and moved below the LENS block.** The first version was wrong on two counts, both corrected here: the cards were a 4-column grid of small thumbnails (83 px wide) instead of the very large card of the model, and the section sat between the Hero and LENS instead of below it. Measured on the reference screenshot, one card spans **78 % of the screen** with the next one peeking ~57 px, so the row scrolls horizontally (`scroll-snap-type: x mandatory`, hidden scrollbar). Each card carries its own content **overlaid at the bottom of the image** — channel pill, story title, story description — over a dark monochrome scrim, exactly like « Sponsorisé / L'effet lululemon street / Un kit technique à porter au quotidien sportif ». One card now equals one story (the viewer receives one group per card) rather than one publisher.
- `client/src/social/types.ts` and `mapDbStories()` now carry the story's `title` and `description` through to the frontend, so the card can show both lines instead of only the caption.
- Home page order is now **Hero → LENS block → Stories section**, locked by tests in both `tests/lens-feature.test.ts` and `tests/stories-showcase.test.ts`.
- Measured orange coverage after the rebuild: Stories section 1.0–1.98 % (the pixels come from the story photos; the CSS contributes only the arrow), LENS block 0.004–0.016 %, home page 0.73–1.24 % — max **1.98 %** against the 3 % budget. Suite: 704/704 passing, typecheck and build green.

### Fixed
- **The Stories section did not appear at all on a deployed site — the demo content lived only in the sandbox database.** `data/*.sqlite` and `data/uploads/` are excluded from the repository, so a fresh install (or the deployed site) started with an empty `stories` table, and the section — which hides itself when no story is published — simply showed nothing. The five demonstration stories are now seeded from the code via the one-shot migration `stories_demo_seed_v1`, which runs only when no published story exists, so content created from the Dashboard is never overwritten. Their visuals were already versioned in `client/public/media`, so they resolve everywhere. Verified by booting the server against an empty database: the section renders, 4 cards at 304×406, no broken images.

### Fixed
- **The Stories section was rendering ABOVE the LENS block — root cause found and fixed.** The section position became dashboard-driven, and the `sort_order` column defaulted to `0`; the frontend read `0` as « above LENS », so the section jumped back to the top of the page. The column now defaults to `1` (« sous le bloc LENS »), the one-shot migration `stories_showcase_position_v1` promotes existing rows that still carry the old `0`, the admin API clamps the value to `0` or `1`, and the frontend keeps `>= 1` as « below ». Verified on the running page: Hero (45–440) → LENS (440–1205) → Stories (1205–1862).

### Added
- **The block position is now controlled from the Dashboard**: Admin → Contenu → Social → onglet Story → « Bloc d'accueil » → champ **Position** (`Sous le bloc LENS` · `Au-dessus du bloc LENS`). Flipping it takes effect immediately, with no code change. Defaults to « sous le bloc LENS ».

### Changed
- **The Stories block is now reproduced in full, measured pixel by pixel on the supplied model — and it is a DARK block.** Reading the whole capture instead of only its card row changed three things that were wrong:
  - The model is a **complete panel on a black background**, with white text. The black starts before the title and ends after the card; it is not a white section with a row of cards. The section background is now `var(--ayrovi-text-primary)` (#111111) and the title, the link and the body are white (the subtitle in translucent white, since #666666 is unreadable on black).
  - The card is **taller** than I had it: measured 557 × 816 px on the model, a width/height ratio of 0.683 — the `2/3` ratio, not `3/4`. A card now measures 302 × 453 px on a 390 px screen, against 304 × 406 before.
  - The spacing follows the model: card **77.4 %** of the screen, left inset **3.33 %**, gap **2.22 %**, next card visible **17.1 %**. Measured on the running page: card 302 px = 77.4 %, next card overflowing 66 px = 16.9 %.
  Measured orange coverage after the change: 1.97 % (Stories) — the pixels come from the story photos, the CSS still contributes only the arrow.

### Changed
- **The two voids above and below the Stories block are tightened to the model's own measurements.** The block carried 64 px of padding at each end on a phone (104 px on a wide screen) while the supplied model shows **57 px before the title and 52 px after the card** — i.e. 7.92vw and 7.22vw. Expressed as proportions so they hold at every width: on a 390 px screen the voids drop from 64 px to **31 px** (top) and **28 px** (bottom), about a centimetre less at each end, which is the excess that had been reported. The block is now 99 px shorter overall on a 720 px viewport.
  Re-measuring the model also confirmed the card: 557 × 835 px, a ratio of **0.6671** — 2/3 to within 0.0004.

### Added
- **Five demo stories** published across the five channels (Ayrovi Official / Nouveautés / Style / Actus / Promos) so the container is visible immediately. They are ordinary rows in the `stories` table — edit or delete them freely from Stories Studio.

### Changed
- Orange coverage after this change: Stories container 1.24–1.75% (the measured pixels come from the story photos themselves; the CSS contributes only the arrow), home page 0.65–1.08%, LENS block 0.004–0.016% — max **1.75%** against the 3% budget. Suite: 703/703 passing, typecheck and build green.

### Added
- `client/src/styles/zalando-ui.css`: reusable charter primitives (`.ay-surface-card`, `.ay-surface-plain`, `.ay-badge`, `.ay-icon-action`, `.ay-cta-primary`/`.ay-btn-cta`, `.ay-accent-rule`, `.ay-step`), with zero colour literal — every value comes from `tokens.css`.
- `tests/design-zalando.test.ts` (20 tests): locks the six tokens, the single orange bearer, the absence of any legacy orange literal, the neutralised LENS surfaces and transition card, and a closed allowlist plus numeric ceiling for the remaining `bg-cta`/`bg-accent` usages.
- `verify/zalando-audit.mjs` (`npm run audit:design`): loads the real page and **counts orange pixels**, failing when any screen exceeds the 3% charter budget. Before/after evidence screenshots are committed under `verify/`.
- One-shot data migration `rebrand_zalando_orange_v1`: repaints already-persisted `#fe7003`/`#ff7a00` values in `interface_config`, `site_theme`, `lens_hero_settings`, `trust_bar_settings` and `hero_content_settings` to `#FF6900`, without touching custom admin colours.

### Fixed
- **Arrival CRM / Anthropic schema union-type limit (HTTP 400 `too many parameters with union types`):** the Arrival extraction tool schema sent 17 nullable/union parameters (provider limit 16). The provider-facing schema is now a dedicated, fixed AI Extraction Schema (`src/arrival-ingestion/arrivalExtractionSchema.ts`) with **zero** union/anyOf/oneOf/nullable parameters — missing values use stable sentinels (`""`/`0`/`[]`) and the normalization layer converts them to the application model's nulls, preserving the "absent vs present" distinction via `unresolvedEntries`/review reasons. No extraction field was removed; the operational envelope (customer + identifiers, supplier/store, order id, tracking number, order date, shipment status) was added as `orderMeta`, plus product `size`, `unitPrice`, `currency` and `productUrl`, persisted through new `crm_extracted_products` columns.
- Added **preflight schema validation** in the Anthropic adapter (`src/ai-core/adapters/anthropic/schemaLimits.ts`): every output schema and tool input schema is counted for union parameters and, when over the provider limit, rejected locally with `ANTHROPIC_SCHEMA_LIMIT_EXCEEDED` (`union_parameters`, `maximum_allowed`, `offenders`) **before** any network call — no retry, no fallback that hides the error.
- AYROVIX Lens identification schema (18 union parameters on the same Anthropic structured-output path) was converted to the same union-free, sentinel-based shape.
- Arrival customer identity resolution now reconciles the extracted order envelope (Tunisian phone/name) against the canonical CRM customer and flags conflicts (`IDENTITY_PHONE_MISMATCH`, `IDENTITY_NAME_MISMATCH`) without silently rebinding; multiple stores/orders for one customer still aggregate onto a single Customer Arrival Card and flow into the warehouse batch (approve-all → confirm).
### Added
- **Arrival CRM — AI Product Category Classification against the official Category Master.** `SKU / Reference + Product Name` is now mapped onto the official AYROVI Warehouse Core taxonomy: a new `crm_categories` table (`code`, `parent_code`, `name`, `active`, `source`) is imported/managed by Administration and is never hardcoded. A dedicated AI pass (`arrival-ingestion` workload, union-free output schema) may only return a code from the ACTIVE master; the answer is then re-validated server-side (exists, active, subcategory belongs to the selected parent). Confident answers are stored as `CLASSIFIED` with `classification_source='AI'` and the model `classification_confidence`; unknown (`AI_CATEGORY_UNKNOWN`), inactive (`AI_CATEGORY_INACTIVE`), incoherent (`AI_SUBCATEGORY_PARENT_MISMATCH`) or refused (`AI_UNABLE_TO_CLASSIFY`) answers, and confidence below `ARRIVAL_CLASSIFICATION_CONFIDENCE_THRESHOLD` (default 0.75), become `NEEDS_REVIEW` for manual selection from the official list only (free text is rejected with `CATEGORY_INVALID`). Classification runs automatically after an extraction job commits and on demand (`POST /clients/:id/classify`, `POST /products/:id/classify`); a classifier failure never fails the job nor loses rows. Approval, Arrival confirmation and Warehouse dispatch are gated on a valid category for new lines (`PRODUCT_CATEGORY_REQUIRED`, `CATEGORY_REVIEW_REQUIRED`, `CARD_CLASSIFICATION_PENDING`), while lines created before the feature keep `classification_required=0` and keep working unchanged. The classification is stored CRM-side only (`crm_extracted_products`) and is deliberately NOT sent in the Customer Arrival Card payload: the Warehouse Core validates each product with `additionalProperties:false`, so the card keeps exactly the canonical product fields; the Administration review screen exposes an official-list category selector (and an AI classify action) so a pending line can be resolved before send.
- Integration coverage for the preflight limit, a union-free provider schema, fixed-schema sentinel normalization, and the EMAIL + IMAGE(screenshot) multi-store → one Customer Arrival Card → warehouse batch flow.

### Changed
- Removed the legacy `RealtimeVoiceTransport`, global queued `voicePlayer`, synthetic voice earcons, recursive interruption events and browser SpeechRecognition branch.
- Rebuilt Voice Chat around one owned `VoiceChatController`: microphone → VAD with pre-roll → MediaRecorder → server STT → one assistant response → one `VoiceOutput` operation.
- Voice Chat is hands-free between turns but strictly half-duplex: microphone recording is stopped and the input track is disabled for the whole TTS loading/playback interval.
- A complete assistant answer is spoken once. Browser speech is temporarily the safe default while Gemini quota is unavailable; setting `ASSISTANT_TTS_MODE=auto` restores configured server TTS.
- Accepted the realtime target architecture in `docs/REALTIME_VOICE_ARCHITECTURE_AR_2026-08-29.md`: dedicated live transcription → Claude agent/tools → streaming voice renderer, without creating a second Gemini assistant.

### Fixed
- The first word is retained before VAD opens the turn, while the original WebM/Ogg initialization header is preserved so Firefox/Android recordings remain decodable by STT.
- Assistant output can no longer be transcribed as new input or create a `speak → pop → listen` loop.
- Starting a new response cancels the previous request/playback by operation id, preventing stale completion callbacks and ghost audio.
- Browser fallback never forces a French/default voice onto Arabic text, never truncates long turns at the server limit, and transition beeps were removed entirely.
- A timed-out server TTS request now falls through to local speech instead of being mistaken for a user cancellation.
- Gemini raw 24 kHz PCM remains normalized to a valid WAV response, and the legacy TTS route remains compatible.
- Gemini HTTP 429 now opens a quota circuit, emits the sanitized developer code `TTS_QUOTA_EXCEEDED`, and suppresses repeated provider calls until `Retry-After` or the configured cooldown expires.

### Validation
- Replaced the old voice regressions with clean controller/output lifecycle, container-header preservation, half-duplex, cancellation, browser-language fallback, server WAV and route tests.
- Added coverage proving browser-only mode bypasses configured Gemini TTS without deleting its key.
- Added a regression proving two server TTS requests after one Gemini 429 produce only one provider call.
- 226 automated tests, TypeScript checks and the production build pass.

## [3.10.4] - 2026-08-21

### Added
- `scripts/ayrovi-image-to-svg.py` traces an icon photo to 24×24 SVG and measures real stroke.

### Changed
- Profile icon is the traced crop: stroke **1.147** on the 24 grid (was 2, twice too thick).

## [3.10.3] - 2026-08-21

### Changed
- Profile icon is larger in the 24 grid and uses a scaling 2px stroke so it is no longer small and heavy. Header account control is 24px.

## [3.10.2] - 2026-08-21

### Changed
- Profile / user icon redrawn from the attached crop: larger head ring, symmetric shoulder arc, orange signature on the right terminus only.

## [3.10.1] - 2026-08-21

### Fixed
- Public chrome is locked to AYROVI outline icons (Lens / AI / Vision). Admin Lucide/FA/Material libraries no longer replace the live bar.
- Solid-fill runtime no longer paints AYROVI strokes as a black blob. Signature dots stay `#FF6A00`.
- Accueil, Panier, Vision and Lens geometry match the approved crops: door arch, inner bag accent, pupil signature, two Lens dots.

## [3.10.0] - 2026-08-21

### Changed
- AYROVI Icon System applied: public and Admin icons are independent 24×24 SVG components matching the approved reference sheets. Lucide is no longer the AYROVI geometry source. Orange `#FF6A00` is a signature accent only where the reference draws it (Fermer, Ajouter and AI have none).

## [3.9.1] - 2026-08-21

### Changed
- First five AYROVI icons rebuilt as independent SVG components in `client/src/components/icons/ayrovi/`: Menu, Retour, Search, Profile, AI.
- Geometry, stroke and signature placement follow the attached reference sheets. The orange dot is an accent only — AI has none.
- Public chrome uses the new Menu, Profile, Retour and AI marks. Remaining icons are unchanged pending review.

## [3.9.0] - 2026-08-21

### Changed
- AYROVI Icon System: 24×24, 2px round stroke, outline only, signature dot `#FF6A00`. Existing icons matched to the reference; UI layout unchanged.

## [3.8.9] - 2026-08-21

### Changed
- Unified typography: Inter + Noto Sans Arabic, weights 400–700, shared display/body/button/nav scale. No layout, color or spacing redesign.

## [3.8.8] - 2026-08-21

### Changed
- SONIM has no header bar or logo. ChatGPT-style overlay chips sit on the conversation; messages scroll underneath.

## [3.8.7] - 2026-08-21

### Changed
- SONIM chat uses a 52px minimal toolbar: back (previous AYROVI page), SONIM mark, and menu.
- SONIM menu lists Nouvelle conversation, Historique, Mes commandes, AYROVIX and Paramètres.

## [3.8.6] - 2026-08-21

### Changed
- Assistant chrome is **SONIM** with subtitle “L'assistant IA d'AYROVI”.
- Welcome screen no longer shows the large motion mark. Header logo is hidden. Chat avatar is transparent.
- Home prompt cards are text-only (no icons).

## [3.8.5] - 2026-08-21

### Changed
- Official color system: 70% white / 25% black / 5% AYROVI orange (`#fe7003`).
- Orange is attention only: logo dot, primary CTA, active navigation, selected state, progress, AI/Lens scan, thin hero glow (≤ 8%).
- Orange is forbidden on body/heading text, full cards, page background, full navigation and non-CTA buttons.
- Announcement bar is black with a 2px orange underline. Bottom-nav icons stay black until active.

## [3.8.4] - 2026-08-21

### Changed
- Official public name is AYROVI. The shopping assistant is SONIM BETA (nav label SONIM).
- Public chrome is black and white. Orange (`#fe7003`) is reserved for pay/commander CTAs and hearts. Yellow becomes a lighter orange (`#ffb070`).
- New orders use `AYR-` again.

## [3.8.3] - 2026-08-21

### Changed
- Official mark now uses the black A with the orange dot (transparent PNG, white A on dark admin).

## [3.8.2] - 2026-08-21

### Changed
- Official AYSONIC A mark replaces the purple fig leaf on the public site, admin chrome, favicon and PWA icons. Same path `/media/logo-ayrovi.png`.
- Header logo returns home. Dark admin sidebar uses the white mark.

## [3.8.1] - 2026-08-20

### Added
- Admin pricing desk edits the CIF matrix (duty, TVA, weight, status, keywords), the confirmation deposit % and a millime-accurate simulator with category + deposit.
- Order detail shows the frozen CIF snapshot (converted, customs, freight, commission, deposit, tracking).

### Changed
- Admin chrome (login, sidebar, footer) says AYSONIC. Money displays 3 millimes.
- `GET/PUT /api/admin/pricing` now carries `depositPercent` and existing customs categories. Unknown category ids are refused.

### Security
- Content managers still cannot write rates. Historical order snapshots stay frozen after a desk save.

## [3.8.0] - 2026-08-20

### Added
- CIF Tunisian pricing engine: category matrix, kg freight, 3% exchange buffer, 19% TVA, 3% RPD (min 10 TND), 10% commission and 8 TND local delivery.
- Restricted-item gate (drones, weapons, vapes) blocks a payable total until human review.

### Changed
- `calculatePrice` is the single server source for Lens, chat, catalogue, cart and checkout. Local delivery is added once per order.
- Visible brand copy and company settings now say AYSONIC. New order numbers use `AYS-`.
- Admin pricing screen edits buffer, freight/kg, local delivery, commission and RPD.

## [3.7.8] - 2026-08-19

### Fixed
- Shopping and greeting turns no longer die after the first local help reply: Claude 400/404/429/5xx now retry without tools and on fallback models.
- If Anthropic still rejects the turn, the assistant searches locally or asks for a photo/link instead of `ASSISTANT_UNAVAILABLE`.
- Custom tool schemas dropped `additionalProperties` and `integer` bounds that Claude can refuse.

## [3.7.7] - 2026-08-19

### Fixed
- Assistant chat no longer dies on a Claude 400: tool schemas dropped unsupported `minimum`/`maximum`, and the request retries without tools or on a fallback model.
- “Comment utiliser l’assistant / Lens” is answered locally so the help path stays online even if Anthropic refuses the first turn.

## [3.7.6] - 2026-08-19

### Changed
- Restored the three-tool bottom bar (Lens, AI, Vision). Accueil, panier and compte stay in the header.
- The AYROVI logo now returns to the homepage and scrolls to the top.
- The header cart badge is the only cart entry in the public chrome.

## [3.7.5] - 2026-08-19

### Changed
- Homepage now answers “how do I order?” with three gates under the Hero: photo, link and AI.
- Public bottom navigation is Accueil, Lens, AI, Panier and Compte. The empty Vision slot is gone.
- Lens, assistant cards and product results lead with the all-in TND price; the boutique price is secondary.
- Size, color and notes on the Lens product sheet are collapsed so the next action is the exact link plus Commander.
- Each order CTA carries the deposit and “tracking after real shipment” promise.

## [3.7.4] - 2026-08-19

### Fixed
- Lens no longer dies when Claude Vision times out or rejects Structured Outputs: reverse-image matches stay usable, and Vision retries once as plain JSON.
- Image analysis can run with Google Lens alone when Anthropic is briefly unavailable, instead of returning a hard 503.
- Assistant Lens no longer bills SerpApi twice for the same photo; GIF attachments are re-encoded to PNG before Claude Vision.
- Assistant empty state now explains when the AI provider is not configured.

### Changed
- Public header and bottom navigation use a lighter glass treatment; the homepage has a soft brand mesh background.
- Camera viewfinder restores a discreet scan line without the old particle overlay.

### Security
- JSON body limit reduced from 14 MB to 10 MB.
- Added `Cross-Origin-Opener-Policy` and `X-DNS-Prefetch-Control` headers.

## [3.7.3] - 2026-08-19

### Fixed
- Audited the complete public and foreground stacking order: announcement `10`, sticky public header `20`, glass navigation `30`, public utility controls up to `40`, and all cart/checkout/full-screen layers from `50` upward.
- Prevented the sticky homepage header from rendering above Panier, Livraison, Paiement and subsequent foreground screens.
- Isolated the public application stacking context and added regression coverage for cart/checkout overlay precedence.

## [3.7.2] - 2026-08-18

### Fixed
- Made profile X close directly to the homepage instead of navigating back to an earlier overlay.
- Restored the sticky white public header and the mobile parallax scene by avoiding horizontal scroll containers that disable `position: sticky`.
- Reworked the bottom navigation as transparent white glass with black icons; it hides while scrolling down and returns while scrolling up.
- Removed the exchange-rate image/card, its fetched display state, link and unused source asset entirely.
- Corrected public copy so tracking is promised only after real shipment and no unsupported cash-on-delivery option is advertised.

## [3.7.1] - 2026-08-18

### Fixed
- Restored the dedicated payment step after delivery details with Visa/Mastercard, Flouci/D17, bank-transfer and postal cards.
- Kept unavailable gateways visible but disabled; only genuinely configured card/manual methods can be selected, with no simulated Flouci/D17 transaction.
- Kept manual proof upload exclusively in Mon compte → Mes commandes after the order is created.
- Added an internal touch-scroll area and reachable sticky actions so delivery/payment completion controls remain accessible on short mobile viewports.
- Blocked manual method selection and proof upload until the corresponding official RIB or postal account is published by Admin; when no real method is configured, checkout can still persist an unpaid order instead of trapping the customer.
- The success action now opens the newly created order directly for manual-proof follow-up.

## [3.7.0] - 2026-08-18

### Added
- Complete database-backed customer account with overview counters, vertical mobile-first navigation, orders, payments and transactions, invoices, shipment tracking, addresses, favorites, cart, notifications, security and preferences.
- Order-backed deposit lifecycle: checkout creates an order in `AWAITING_DEPOSIT` before any charge, then binds the selected method/transaction to that persisted order; retries remain available from its detail page.
- Konnect bank-card adapter with server-only credentials, server-side payment-detail verification, transaction audit data, idempotent webhook/return handling, amount/currency/order matching, and explicit gateway readiness.
- Manual bank/postal transfer proof history with file metadata, transfer references, ownership checks, independent review records, rejection reasons and re-upload support.
- Independent payment, transaction, proof, invoice and delivery entities and identifiers, plus canonical order/payment lifecycle migrations.
- Admin proof-review queue, independent invoice issuance, strict fulfillment transitions, and carrier/tracking controls.
- Customer lifecycle notifications for payment, proof, invoice and shipping events.

### Changed
- Invoice downloads use issued invoice records as the authoritative source; tracking is exposed only after actual shipment.
- Finance income includes confirmed payments only, excluding orders or proofs still awaiting verification.
- Customer and Admin status labels and filters now follow the canonical lifecycle.
- Customer-domain TypeScript contracts now model orders, payments, transactions, proofs, invoices, deliveries, preferences and notifications explicitly.

### Security
- Card success can only originate from verified gateway data; redirects and frontend state are never trusted as payment confirmation.
- Admin users cannot manually approve card transactions or bypass payment and shipping stages.
- Customer order, payment, proof, invoice and tracking access is authorized by account ownership in the backend.
- Gateway secrets remain server-only and all sensitive card/webhook routes are rate-limited.

### Validation
- 153 automated tests pass, including exact card verification and idempotent initiation, manual transfer approve, reject/re-upload/approve, notification-schema migration, invoice issuance, shipment/tracking, finance rules and authorization boundaries.
- TypeScript server/client checks and production builds pass.
- Browser validation passed in French and Arabic at 320, 360, 375, 390 and 414 px without horizontal overflow, plus a 1440 px desktop layout check.

### Deployment note
- Konnect production credentials and official bank/postal coordinates must be configured on the server/Admin before those payment options become operational.
- SQLite, uploaded proofs and generated invoices require a Render Persistent Disk or another durable storage strategy; without it, redeploys can lose local state and files.
