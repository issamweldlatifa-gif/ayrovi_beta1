# Android / security readiness — state of the work (2026-10-05)

Branch: `fix/android-security-readiness` → also published on `main` (per the owner's
instruction). Baseline before this work: `23bcf1b`.

This file records what is **verified**, what is **deliberately deferred**, and what is
still missing. It is not a security certification and not a Google Play approval.

## Implemented and verified

### 1. The verified price is now proven at checkout (closing the main trust hole)
Before: the cart stored `price_verification_status = 'VERIFIED'` — a string — but not the
signed quote itself. An order could therefore charge a price attested much earlier, or a
line price edited after the fact.

Now:
- the server keeps the signed quote on the line (`cart_items.price_token`, migration
  included; the token is **never** exposed through the public cart payload);
- at checkout, `src/services/cartPriceTrust.ts` re-verifies the quote signature against
  exactly the line's price, currency, title and reference URL, through the token's own
  30-minute expiry;
- an expired/altered quote returns **409 `PRICE_VERIFICATION_REQUIRED` before any order
  row exists** — no stuck order, no stale amount collected;
- lines written before quotes were persisted keep a 30-minute freshness window based on
  the line itself (legacy path), and older ones must be re-quoted;
- the manual Lens-less path (`PENDING_MANUAL`) is unchanged: it still follows the human
  review flow;
- the bag screen shows the same decision as the server (`priceTrust`, per line and as a
  footer refusal) and disables the checkout button.

Tests: `tests/cart-price-trust.test.ts` (8) — fresh quote orders, expired quote refused
with no order created, tampered line refused, manual path still orders, cart read agrees
with checkout, exact expiry boundary, legacy windows.

### 2. Quote signing secret can no longer be the public development constant
`validateQuoteSecret()`: a dedicated `AYROVIX_QUOTE_SECRET` wins when it is strong and
different from `CUSTOMER_AUTH_SECRET`; otherwise a production key is **derived** from
`CUSTOMER_AUTH_SECRET` with HKDF-SHA256 (domain-separated, no raw key reuse) and a warning
asks for the dedicated variable; if nothing strong exists, the server refuses to start.
This closes forged-price tokens *without* requiring an unverifiable change to the
production environment (the earlier fail-stop version could have prevented the service
from booting if the dashboard variable was never filled).

Tests: `tests/quote-security.test.ts` — never the repository constant in production,
derived key differs from the auth key, dedicated secret precedence, refusal when nothing
is strong.

### 3. Native trust boundary (previous commits, re-verified here)
- Client credentials are attached to the API origin **only**, after URL normalisation
  (`Request` objects are cloned, never consumed; caller headers/bodies preserved; XHR
  stays credential-free; redirects are refused for authenticated calls).
- Android pins its own API origin: nothing supplied by an Intent can redirect private
  calls (`ApiTrust`, unit-tested), and merchant navigation refuses `http`, `file`,
  `content`, `intent`, `javascript`, `data` and embedded credentials.
- The merchant browser no longer uploads merchant HTML as price evidence; no client HTML
  is accepted as evidence (`rejectProvidedPage`).
- Merchant storage is isolated in a separate process on Android 9+ (dedicated WebView
  data directory), cookies are cleared through a durable marker when the customer logs
  out, and the session token is kept in app-private no-backup storage instead of Intent
  extras (below Android 9 the merchant browser is not opened at all rather than sharing a
  profile).
- Merchant back navigation now uses `OnBackInvokedDispatcher` on API 33+
  (`onBackPressed()` is deprecated and bypassed by predictive back) with the same
  fallback for older releases.

### 4. Build, signing and CI
- API 36 toolchain: `compileSdk`/`targetSdk` 36, AGP 8.10.1, Gradle 8.11.1.
- Debug builds use the debug certificate; release signing is only configured when the
  release secrets exist, so a keystore can never leak into a debug artifact (CI verifies
  the debug certificate and jarsigner output; version codes are validated against the
  operator-supplied Play value).
- CI now builds and unit-tests the Android shell as a **required** step, and the
  front-end build runs before the suite (eight tests depend on `dist/`, which is why they
  failed at baseline).

## Published state

- `main` = the work above, published directly (the owner's deploy key bypasses the
  “changes must be made through a pull request” rule, as GitHub reports on push).
- CI on `main` (run for `42209ff`): **`typecheck-test` success, `android-shell`
  success, 0 failing steps** — the whole existing evidence pipeline (identity,
  charter guards, Lens, customer screens, mobile purchase) plus the new required
  Android build/test job.
- The Android CI job no longer uses `android-actions/setup-android@v3`: that action
  failed in 11 s on the current runner image (run #373); the job now locates
  `cmdline-tools`, falls back to downloading them, makes `ANDROID_HOME` writable and
  installs platform/build-tools 36 explicitly.
- The design source inventory was regenerated (`docs/editorial/source-inventory.json`)
  because the bag/checkout UI changed; `npm run design:check` — the first CI step that
  failed on the first push — passes again.

## Evidence (this session)

- `npm ci`: 0 audit vulnerabilities; `npm run build` (client + server) succeeds.
- `tsc --noEmit` (server) and `tsc -p tsconfig.client.json --noEmit` (client): clean.
- Full suite **after** the front-end build: **162 files / 2246 tests passed, 0 failed**
  (baseline was 2209 passed / 8 failed because `dist/` was missing).
- `npm run android:check`: 43 invariants, 0 broken.
- Android: `:app:assembleDebug` **BUILD SUCCESSFUL** → `app-debug.apk` (8.4 MB, debug
  certificate `CN=Android Debug`, verified with `apksigner`);
  `:app:testDebugUnitTest` → 4 tests, 0 failures (`ApiTrustTest` covers origin pinning and
  malicious endpoints).
- `npx cap sync android` succeeds after the front-end build.
- CI (`main`): both jobs green, see “Published state”.

## Deliberately deferred

- **Release signing was waived for this delivery** (“دون توقيع اصدار”). The APK attached
  is a **debug** build: it is not signed with the AYROVI production certificate, is not an
  update for an installed production app, and is not a Play upload artifact. Delivering a
  signed AAB still requires the existing production keystore (and its passwords/alias) or
  an explicit decision to start a new signing key — plus the current Play `versionCode`,
  which this workspace cannot read.
- Pushing these server changes to `main` may trigger a production deploy; the deploy is
  safe from a boot standpoint (see §2), but the derived-key warning should be replaced by
  a real `AYROVIX_QUOTE_SECRET` in the dashboard as soon as possible.

## Still missing (not started or not finished)

- No runtime Android evidence: no device and no `/dev/kvm` in this workspace, so cold
  start, merchant-session behaviour, back gesture and cookie clearing are unverified on a
  real release build.
- SSRF callers are audited only where this work touched them; a complete pass over every
  fetcher is outstanding.
- Media lifecycle/privacy (retention, deletion, EXIF, provider disclosures), logging and
  the Data safety form have not been completed.
- Merchant URL query-parameter minimisation and runtime popup/redirect compatibility
  testing are outstanding.
- No Google Play approval is claimed; `versionCode` must be confirmed against the current
  Play Console value before any upload.
