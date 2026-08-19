# Changelog

All notable AYROVI changes are recorded in this file.

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
