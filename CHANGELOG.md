# Changelog

All notable AYROVI changes are recorded in this file.

## [Unreleased]

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
