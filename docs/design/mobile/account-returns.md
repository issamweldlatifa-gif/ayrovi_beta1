# Mon compte → Retours

The supplied reference images guide the returns hub, the item picker (with a count, validation, and expandable “can't find your items?” help), the return guide, the policy FAQ, and swipeable order support cards. Screenshots with an order number are not bundled; all order data in the new module comes from the signed-in account.

- Entry points: **Mon compte → Retours**, **Commandes → Retourner un article**, and the policy link in Orders and order support. The guide and FAQ are readable without signing in.
- The picker fetches the active account’s orders, shows orders marked delivered, and loads item details for the selected order only. Selecting an item prepares a reference to share with support; it does **not** determine eligibility. Selection and order-specific help are cleared on account change or sign-out. Load failure is not presented as no orders.
- Contact opens a published support channel explicitly chosen by the customer. The app does not submit a claim or automatically send order data. The history area explains that tracking and refund history are not available online and directs the customer to support. It does not present a fabricated empty refund history.
- The FAQ summarizes the existing ZAYROVI terms and links to the full official document. No return deadline, free shipping, refund deadline, QR code, or self-service cancellation from the reference is assumed.

Full self-service would need an approved eligibility policy and account-scoped return records with item quantities, request/acceptance/shipping/refund states, a CRM workflow, and a carrier integration before offering labels or tracking. No return requests or refunds are persisted by this change.
