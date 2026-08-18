# Changelog

All notable AYROVI changes are recorded in this file.

## [3.7.0] - 2026-08-18

### Added
- Complete database-backed customer account with overview counters, vertical mobile-first navigation, orders, payments and transactions, invoices, shipment tracking, addresses, favorites, cart, notifications, security and preferences.
- Order-first deposit lifecycle: checkout creates an order in `AWAITING_DEPOSIT`, then the customer selects the deposit method from the persisted order detail.
- Konnect bank-card adapter with server-only credentials, server-side payment-detail verification, transaction audit data, idempotent webhook/return handling, amount/currency/order matching, and explicit gateway readiness.
- Manual bank/postal transfer proof history with file metadata, transfer references, ownership checks, independent review records, rejection reasons and re-upload support.
- Independent payment, transaction, proof, invoice and delivery entities and identifiers, plus canonical order/payment lifecycle migrations.
- Admin proof-review queue, independent invoice issuance, strict fulfillment transitions, and carrier/tracking controls.
- Customer lifecycle notifications for payment, proof, invoice and shipping events.

### Changed
- Successful checkout now opens the created order instead of presenting payment, invoice or tracking data prematurely.
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
