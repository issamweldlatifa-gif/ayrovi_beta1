# Gift Cards — mobile & Finance preview

## Try the flow

- Mobile: open the **Gift Cards** tab. The catalogue has physical cards (envelopes) and digital cards, with original ZAYROVI artwork. Tap a card, pick a design and an example amount, select yourself or another recipient, and add a greeting. Example amounts are TND and keep millime precision. The summary never starts a checkout.
- **Profile → Cartes cadeaux** opens the wallet preview. Its empty state is explicit and **Acheter une carte cadeau / Buy Gift** navigates to the shopping tab. Code entry and activation are disabled; the preview does not invent active cards or a balance.
- All formats, including print, require a recipient email in the draft. Printing is for presentation only. The “link” option previews the same recipient-bound invitation concept, not another delivery channel for the code. No message, print job, or share link is created.
- **Voir le code · démo** rehearses signing in and checking for a verified recipient email. This uses local session state to explain the proposed UX; it is not a security boundary and it never displays a code. Form and catalogue favorite state are in memory only. Public web `/gift-cards` remains unchanged.
- Back Office → **Finance → Cartes cadeaux** opens a separate specimen workflow. Existing `reports:read` allows listing, `reports:write` allows creating a draft or approving one. A different authorized administrator must approve the draft. The server generates a `DEMO-…` specimen once on approval; only a fingerprint is retained. No specimen or fingerprint is shown in listings/audit events. Creation and approval are audited and costs, orders, card balances and payment data are not touched. This is not issuance of real cards, even when the UI says “approved.”

## Before offering real gift cards

- Confirm the remainder of the reveal requirement (after “sign in or…”), and clarify whether “encrypted email” means a protected link in ordinary email or actual end-to-end encrypted email. Do not allow a guest to reveal a code by opening the link alone. No one should receive a bare code in the email body, printout, or forwardable link.
- Confirm who in Finance can submit, who may approve, and the production purchase, funding, refund and physical delivery policies. Preview denominations and the two-person procedure are not production terms.
- Implement protected server-side reveal with recipient verification, plus a safe email delivery flow for recipients without an existing customer account. The existing customer-auth mail queue encrypts stored mail jobs but does not provide end-to-end email encryption and requires an active matching customer account; do not reuse it as-is for gifts to non-customers.
- Wire funding to verified payment events and use an auditable, concurrency-safe ledger with idempotent issuance/redemption and explicit checkout/refund semantics. A gift balance should pay for purchases only, not expose withdrawal or cash conversion. Keep live codes separate from specimen data and out of logs, analytics, URLs and admin listings.
