# AYWEBs purchase sheet — v6

[`aywebs-sheet-v6.html`](aywebs-sheet-v6.html) is the supplied design reference, not application code. Its sample catalogue, illustrations, quantities, fees and inventory are demo data only.

The React Native `AddToCartSheet` is the shared merchant surface. The v6 arrangement keeps the merchant and current product above a full-width price ticket, published choices below it and the quantity control next to the pinned purchase action. The ticket has explicit pending, unavailable, estimate and verified states. Retry requests the server's quote for the current selection; changing selection or closing aborts the retry. The cart action still uses the existing resolve/add contract.

The client renders only server-supplied prices and breakdowns. Do not multiply a single-unit breakdown to invent a tier total, attach a sibling quote to the wrong SKU, invent a sales tax or show demo stock. When there is no quote, do not imply that a verified total exists. SHEIN capture stays independent; UI adoption does not require changing any capture reader.

The companion native Android fallback (`dialog_aywebs_variant_sheet.xml`) and web (`AyWebsVariantSheet.tsx`) retain their existing presentation until their v6 adaptation is tested. A mock-only favorites toggle, placeholder product art or synthetic price recomputation is not ported from the HTML.
