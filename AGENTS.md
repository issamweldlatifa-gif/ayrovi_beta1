# Development guidance for ZAYROVI

Read [the owner-approved development and evolution agreement](docs/architecture/DEVELOPMENT_AND_EVOLUTION_AR.md) before architectural changes or new features. It applies to human contributors and coding agents across this repository. See also the contributor link in README.md.

## Required direction

- This is feature-building and experimentation, not a production launch. Continue implementing and testing functionality; do not force an infrastructure migration or microservices rewrite.
- Keep a modular application with explicit domain boundaries. Separate business logic from HTTP/UI and progressively contain database access within domain-specific modules. Reuse existing abstractions; do not introduce speculative framework layers.
- Existing SQLite calls, local filesystem storage and process-local state are not automatically PostgreSQL-, S3- or multi-instance-ready. Document real gaps. Add appropriate seams incrementally when touching those areas; do not claim configuration-only portability.
- Preserve behavior, pricing, authorization, transactions, public/private file boundaries and backwards compatibility. Refactor large mixed-responsibility files incrementally, not through unrelated broad rewrites.
- Bound expensive work and list growth. Test regressions and representative data growth as features are added. Distinguish functional tests, local benchmarks and actual production/device measurements; do not promise capacity or latency without evidence.
- Stronger CPU is not a substitute for these boundaries. Splitting workers, databases or services is a later, measured decision with contracts and migration/rollback planning.

## Owner constraints

- Keep current hosting/storage configuration unless separately authorized. No purchases, paid-plan upgrades, database/file migration, destructive resets or deletion of content under the authority of this guidance alone.
- Stripe is test-only; the owner plans to remove it before release. Do not expand this into a live-payment implementation without a new decision.
- Protect experimental CMS/configuration data too. A later migration needs backups and a tested restore/rollback path.

For each delivery, state what changed, what was actually tested, and what remains unverified. Record materially different architectural decisions, their tradeoffs and owner approval rather than silently replacing this agreement.

## Database changes

Consult [the schema inventory and staged backlog](docs/architecture/DATABASE_STRUCTURE_INVENTORY_AR.md). Run `npm run audit:database` and the schema/reopen/migration tests listed there when changing relationships, indexes or bootstrapping. New child-FK index gaps require an appropriate index or an explicitly justified review entry in `docs/architecture/database-index-review.json`; legacy entries are pending investigation, not proof of optimal indexing. Keep that backlog current when resolving gaps. Verify upgrades and preservation of existing data, not only creation of empty tables.

`runSchema` now rolls back its batch and propagates errors; use `IF NOT EXISTS` or explicit column checks, never depend on swallowed DDL errors. Its splitter supports simple DDL with quoted/comment semicolons, not trigger bodies or transaction-control statements. See [schema/restore safety](docs/architecture/SQLITE_SCHEMA_AND_RESTORE_SAFETY_AR.md). Test backup restoration only in isolation (`npm run backup:verify -- <backup-file>`); that command does not boot the app or verify uploads, and is not permission to overwrite a running database.

## Current client scope (owner decision)

New client features and UI fixes target the mobile application. Website/client UI updates are paused until the owner makes a separate decision; do not mirror mobile changes into `client/` without approval. Shared backend work remains separately scoped and must preserve API contracts.
