# Global blue brand update — 2026-11-06

## Approved palette / scope

- Primary: **#0113B5**, sampled from the dominant solid background in the first supplied JPEG.
- Secondary: **#0B57CF**, sampled from the second supplied JPEG. Available as `secondaryAction` / `onSecondaryAction` in both light and dark token sets, with native `BRAND.secondaryBlue`. Current visible usage is intentionally limited to the SONIM composer outline; this is not a SONIM feature redesign.
- Soft selection/focus tint: **#CCD0F0**; pressed action: **#031196** (18% brand black blend); readable dark-surface accent: **#737DD6** (45% white blend).
- Shared/native identity sources and generated outputs upgraded to **4.3.0**.

Application, website, CRM/admin, server-rendered public share pages, Android shell theme, reaction SVGs and AYWEBs icon/wordmark pixels now use the blue family. Recoloured AYWEBs PNGs preserve transparency and explicit sRGB intent. Existing ZAYROVI monochrome lockup images remain monochrome. Black footer, neutral base colours and functional warning/error/success colours are preserved. Product colour swatches, merchandise photographs, third-party marks and historical design artifacts are not recoloured.

Compatibility identifiers containing `violet` / `purple`, including existing asset filenames and palette-share keys, remain aliases rather than breaking existing imports/configuration. Their active brand colour values are blue. Numeric verbatim admin tone tokens and all their consumers were renamed together to keep names consistent with their new values.

## Existing installations

- Shared CMS read adapters recognise the retired official purple family as well as the existing legacy-orange rules.
- Transactional, one-shot `rebrand_blue_v1` migration updates exact retired brand values in settings JSON/plain settings, Lens accent/background and authored hero backgrounds. No product/order colour fields or media are rewritten.
- Embedded descriptions mentioning colour codes are preserved; only exact colour values are migrated. Subsequent admin edits survive restart.
- Regression tests exercise both read adapters and a persisted SQLite upgrade/reopen cycle.

## Validation

- Root full suite: **263 files, 3291 passed, 17 skipped**.
- After the final extension to persisted hero/background migration: targeted identity + SQLite migration suites **90 passed**.
- Native logic: **113 files, 1135 passed**.
- React Native UI/Jest: **38 suites, 204 passed** (`--forceExit`, existing lingering-handle warning).
- Root/native TypeScript checks passed; identity generator/check and native token freshness checks passed.
- Production client/server build passed (existing large-chunk advisory).
- Chromium website at **360 / 390 / 768 px**: computed primary/secondary tokens match the approved values, no horizontal overflow. SONIM web preview at 390 px renders the secondary-blue outline. No page errors in these checks.
- White-on-primary contrast is approximately **11.92:1**; dark text-accent and secondary-button contrast remain covered by WCAG tests.

Browser checks are not Android/iOS device acceptance. No APK/IPA was produced or installed, and no production deployment is claimed by pushing this branch.
