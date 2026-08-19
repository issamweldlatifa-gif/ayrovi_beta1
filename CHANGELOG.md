# Changelog

All notable AYROVI changes are recorded in this file.

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
