# Android/security work in progress — 2026-10-05

Baseline: 23bcf1b. This is NOT a completed security remediation or Play release.

Implemented: exact-origin native fetch credentials, Request cloning, credential-free XHR rewrite, HTTPS configuration, native pinned API and blocked redirects, no merchant DOM uploads or client-HTML pricing evidence, separate quote secret/startup validation, API 36 + AGP 8.10.1, debug/release signing separation, cold-intent queue and modern main-activity back callback, merchant process storage isolation on Android >=28 (external-browser fallback below), cookie clearing service on logout, bounded native API response bodies, restrictive merchant navigation, CI build gate and version input validation.

Evidence:
- npm ci: 0 audit vulnerabilities; typecheck passed.
- Before changes: 2209 tests passed / 8 failed (before client build).
- After build/changes: 2235 passed / 3 failed; these 3 were obsolete source assertions. Updated security contracts: both affected suites now pass all 65 tests.
- New network/quote + existing safe URL suites: 29 passed.
- android:check: 43 passed.
- Android assembleDebug + testDebugUnitTest: successful. Debug certificate verified.
- Combined release build daemon died; signed release not verified.

Remaining blockers/work (do not merge as completed):
- Full final test rerun and runtime Android testing. No KVM/device in workspace; no cold/warm Android performance evidence.
- Checkout fresh-price validation/manual-review/payment gating requires coordinated DB/UI work; not completed.
- Audit all SSRF callers, media lifecycle/privacy, retention/deletion, logging and provider disclosures; not completed.
- Merchant URL query minimization, runtime redirect/popup compatibility and process-cookie reset tests still needed.
- Merchant Activity still uses legacy back callback; API36 runtime behavior needs correction/testing.
- Raw HTML input now rejects old clients explicitly; URL-only server fetch can fail where merchants block access. No bypass or false VERIFIED fallback added.
- Production quote secret must exist independently before deploying server. render.yaml already lists it; configuration was NOT changed remotely. Main may auto-deploy, so do not push these incomplete server changes there.
- No signing file in uploads (only two Markdown briefs). No passwords/alias or Play highest versionCode supplied. APK is DEBUG, not an update signed with the existing production certificate. Do not uninstall a production app without safeguarding data.
- No Google Play approval, signed AAB or main-branch completion claimed.
