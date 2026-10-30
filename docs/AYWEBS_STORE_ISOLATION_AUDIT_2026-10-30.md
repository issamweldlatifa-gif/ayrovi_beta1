# AYWEBs store reader audit — 30 October 2026

## Current architecture

Amazon, Zalando, SHEIN, TEMU and AliExpress already have separate server adapters in `src/aywebs/adapters/` for URL recognition, identity and resolution. `captureReaders/` supplies per-store version and price-policy metadata, and the mobile client caches scripts per store. However, those profiles **do not isolate extraction code**: `buildAyWebsCaptureScript` wraps the same large `captureScript.ts` for every merchant. Shared parsing, DOM selectors and variant matrices therefore remain coupled. It would be misleading to describe these as independent scripts.

## Safe migration

1. Define a versioned capture contract, shared safety limits, host validation and currency/price evidence rules; keep those common.
2. Extract each merchant's DOM, structured-state, image and variant readers into its own module and compose only that module into its bundle. Keep the legacy endpoint for existing clients until migration is validated.
3. Preserve one adapter per store. Do not let a merchant-specific selector, fallback, network payload, or SKU identity leak into another merchant's bundle.
4. For each merchant add fixtures covering changing selection without navigation, incomplete selection, products with no choices, price/currency ambiguity, stock and image fallbacks. Run all merchant suites on every change, plus tests proving a bundle does not include unrelated readers.
5. Test real device WebViews and actual product URLs after changes. Screenshots alone cannot reveal DOM selectors, the selected SKU, network responses, or the reason a quote was rejected. Never invent a price or mark an unknown selection as verified.

## This change

The mobile confirmation gives priority to the currently captured Amazon group selection, does not reuse an old cached proof for read-only merchant confirmation, and does not import server-only option groups into that confirmation. Single-value groups are retained because a single available option can still require an explicit merchant selection. SHEIN's visible size and color headers are preferred when supported by the captured options. TEMU no longer assigns the base price to every SKU lacking its own price. Product images use the main product image before a potentially tiny option swatch and the sheet image is wider.

These changes do **not** complete per-store script isolation or establish that every live merchant page, missing-price case, or product without options is fixed. In particular, merchants change their DOM and prices may remain unavailable when currency or exact SKU evidence is insufficient. End-to-end device validation with the actual product URLs and page evidence is still necessary.

## Supplied product examples

- Zalando `PO272R00Y-T11` (mug): the public page displays a fixed colour and “One Size”; this is not equivalent to a multi-size shoe selector. Do not infer that every single-option merchant group can be ignored: a real mandatory selection still needs evidence.
- Zalando `AD542A5XR-G11` (basketball shoe): the public page shows colour alternatives and an unselected size prompt. The fetched page does not show the dynamic size menu or a selection of 40, so it cannot validate the selected-size capture.
- TEMU `601101541616684`: the public fetch redirected to login. No price, SKU or variant could be verified.
- AliExpress `1005012597007309`: the public fetch redirected to a US page with a robot challenge. No price, SKU or variant could be verified. Prices in tracking query parameters are not reliable evidence of the currently selected SKU.

Public-page snapshots are not a substitute for capture from the actual mobile WebView after selecting a variant.
