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
  -> administrator correction and approval
  -> CONFIRMED
```

`CONFIRMED` is the terminal state for this step. It does not trigger a downstream integration.

## Store/source strategy

`crm_stores` and `crm_store_source_profiles` resolve:

```text
Store -> supported source type -> strategy key + extraction hints
```

The AI service uses the existing provider-neutral AYROVI AI Core with the `arrival-ingestion` workload. `StoreExtractionStrategyRegistry` resolves the controlled profile to a profile-driven strategy, so a specialized strategy can be added without changing controllers, source storage, jobs or canonical records. Controllers contain no AI parsing logic. AI usage carries a one-way hash of the requesting administrator and the job ID for attribution; customer identity is not added to the model prompt.

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
