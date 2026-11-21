# Mon compte → Commandes

The reference informed the two states of the order list (actual empty account and populated history), the dedicated detail screen, payment information and progress. Captures containing a personal address, order identifiers and example bank coordinates are not saved in Git or bundled into the app.

- The list stays scoped to the active account. It displays actual orders regardless of payment method, grouped by UTC calendar month. The initial six-month filter is switchable to the full history. A filtered-out history, a successful empty history, a failed request and a signed-out session each have distinct displays. The shopping CTA navigates to Home.
- The API returns a preview from the first persisted item of the same order, using a deterministic tie-breaker. Existing older APIs without preview title or size still work. No per-order fetch is needed for the list.
- Detail shows the stored date, payment method, payment status, product variants, amount breakdown and delivery address. It does not infer billing data, taxes, shipping estimates, or tracking. The progress stages map to actual order status; cancelled or unknown states do not show false progress.
- Transfer instructions only use configured fields returned by the API for the order’s selected transfer method and relevant status; a paid, cancelled or card order does not show bank coordinates. Payment, proof upload, and eligibility logic remain server governed. No transfer details from the reference are reused.
- Returns open the [guided return flow](account-returns.md), which uses the configured support channels and legal terms. No self-serve refund, cancellation, or resale is offered without a real backend workflow.
