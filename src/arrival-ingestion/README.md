# Administration CRM — Arrival Ingestion

This module is the operational Administration CRM layer for turning store documents into reviewed, canonical product rows.

## Boundary

- Operational records live in `crm_*` tables.
- The existing public CMS `arrivals` entity is unchanged.
- There is no Warehouse route, payload, UI, receiving, location, sorting, inventory, shipping or PDF export in this module.
- Customer identities always reference the existing `customers` table.
- Provider wire objects and raw model output never reach the Administration frontend.

## Flow

```text
crm_arrivals
  -> crm_arrival_clients (existing customer + controlled store)
  -> crm_arrival_sources (private immutable original + SHA-256 identity)
  -> crm_extraction_jobs (durable asynchronous state/progress)
  -> crm_extracted_products (canonical current rows + superseded history)
  -> AI category classification against crm_categories (official Category Master)
  -> administrator correction, manual category review and approval
  -> CONFIRMED
```

`CONFIRMED` is the terminal state for this step. It does not trigger a downstream integration.

## Store/source strategy

`crm_stores` and `crm_store_source_profiles` resolve:

```text
Store -> supported source type -> strategy key + extraction hints
```

The AI service uses the existing provider-neutral AYROVI AI Core with the `arrival-ingestion` workload. `StoreExtractionStrategyRegistry` resolves the controlled profile to a profile-driven strategy, so a specialized strategy can be added without changing controllers, source storage, jobs or canonical records. Controllers contain no AI parsing logic. AI usage carries a one-way hash of the requesting administrator and the job ID for attribution; customer identity is not added to the model prompt.

## Product category classification

Each line carries `SKU / Reference + Product Name + Quantity`. A dedicated AI
pass maps it onto the **official Category Master** imported from the AYROVI
Warehouse Core taxonomy.

```text
SKU / Reference + Product Name
  -> AI (arrival-ingestion workload)
  -> Category Master (crm_categories, ACTIVE entries only)
  -> confident  -> CLASSIFIED   (classification_source = 'AI')
  -> otherwise  -> NEEDS_REVIEW -> manual selection (classification_source = 'MANUAL')
```

- The taxonomy is **data, not code**: `crm_categories` (code, parent_code, name,
  active) is imported/managed by Administration
  (`POST /categories/import`, `POST /categories`, `PATCH /categories/:code`).
  No category list is hardcoded anywhere. An empty master means nothing can be
  classified — lines stay in review instead of receiving an invented category.
- The model is never trusted: every answer is re-validated against the master
  (exists, active, subcategory belongs to the selected parent). Unknown codes
  (`AI_CATEGORY_UNKNOWN`), inactive codes (`AI_CATEGORY_INACTIVE`), incoherent
  pairs (`AI_SUBCATEGORY_PARENT_MISMATCH`) and refusals (`AI_UNABLE_TO_CLASSIFY`)
  all become `NEEDS_REVIEW`.
- Confidence below `ARRIVAL_CLASSIFICATION_CONFIDENCE_THRESHOLD` (default 0.75)
  becomes `NEEDS_REVIEW` (`AI_CONFIDENCE_BELOW_THRESHOLD`).
- Manual review accepts **only** an official code — free text is impossible
  (`PATCH /products/:id/category` returns `CATEGORY_INVALID` otherwise).
- Classification runs automatically after an extraction job commits, and on
  demand via `POST /clients/:id/classify`, `POST /products/:id/classify`.
  A classifier failure never fails the extraction job and never loses rows.
- Gate: a line created after the feature (`classification_required=1`) needs a
  valid category before `approve` / Arrival confirmation / `send-to-warehouse`
  (`PRODUCT_CATEGORY_REQUIRED`, `CATEGORY_REVIEW_REQUIRED`,
  `CARD_CLASSIFICATION_PENDING`). Lines created before the feature keep
  `classification_required=0` and behave exactly as before; the gate is inert
  while the master has no active entry, and `ARRIVAL_CLASSIFICATION_GATE=off`
  disables it.
- The Customer Arrival Card payload gains `category_code`, `subcategory_code`,
  `classification_source`, `classification_confidence` and
  `classification_status` per product (additive; `null` for legacy lines).

## Evidence and uncertainty

The canonical normalizer requires evidence for every non-null extracted field. For text/email sources, the normalized value must also occur in the source text. Invalid or unsupported values become `null` and the row becomes `NEEDS_REVIEW`. Missing rows and unit failures are retained as review records; one failed unit does not discard successful units.

## Files and images

Original sources and derived product crops are stored under `data/private/arrival-sources` by default, with generated storage keys and restrictive file modes. They are available only through authenticated Administration endpoints. PDF pages are rendered to images so text PDFs and scanned PDFs use the same visual understanding path. Product images are created only from a source asset explicitly associated by the normalized extraction contract.

## Idempotency

A unique `(arrival_client_id, source_hash)` identity prevents duplicate source records. A source cannot have two active jobs. Reprocessing must be explicit; new current rows, terminal job state and completion audit atomically supersede prior rows while history remains retained. Startup recovery discards uncommitted staging rows and derived crops before safely rerunning an interrupted job.

## Authorization and audit

- Read: `commerce:read`
- Mutations/extraction/confirmation: `orders:write`
- Existing HttpOnly Administration session and CSRF controls apply.
- Audit records use the existing `audit_logs` table and `CRM_ARRIVALS` module.

## Runtime limits

- Source: 20 MiB
- PDF: 80 pages
- Email image attachments supplied to AI: 12
- Extraction jobs execute asynchronously and serially per process.
- A 429/capability circuit stops remaining source units; no immediate retry is scheduled.
