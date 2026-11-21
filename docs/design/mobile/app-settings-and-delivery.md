# Mobile app settings and delivery information

## Delivery form

- **Profile → Mes adresses** and the **delivery section in Checkout** share the same address editor: recipient's full name, street and number, optional delivery instructions (up to 50 characters for new input), postcode, locality, governorate, delivery phone and read-only country (Tunisia). The existing customer model stores one full name; it is never split heuristically. Desktop and mobile use the same order and address-book contracts.
- The governorate selector uses the commerce configuration when available. There are no fabricated pickup points or lockers: this mobile flow is home delivery only.
- Checkout preselects the real default saved address. A customer can select another saved address or start a new one. Draft edits apply to this order only unless the customer explicitly chooses **Enregistrer dans mes adresses**. Edits never overwrite a saved entry from checkout. The draft is scoped to the current signed-in viewer.
- The order API stores a single address string. Checkout composes it from the street, optional postcode/locality, and instructions without silently truncating any part. Existing identity verification, pricing, order creation, and payment rules have not changed.

## App settings

- **Profile → Paramètres de l’application** is available without signing in. Language (FR/AR), theme (system/light/dark), automatic preview playback and optional Wi-Fi-only playback are device preferences. Autoplay respects Reduce Motion and existing media visibility/foreground checks; explicit taps still play the selected video.
- Notification settings use the four real account preferences (order, payment, shipping, invoice). This count is not an OS push-permission count. Newsletter settings store the same marketing preference as the profile; they do not start a mail campaign, send a confirmation email or award points.
- **Suivi des données** defaults to no optional app analytics. Opt-in enables native Home carousel and Ocerex interaction telemetry. This does not change server-side order processing, site cookie settings or promotion emails. The original ZAYROVI privacy text is available in the app, with chapter navigation.
- Feedback opens real configured support channels. Sharing uses the store listing if configured, otherwise the public ZAYROVI website. Ratings are offered only with a verified release input: `EXPO_PUBLIC_APP_STORE_URL` must be the official HTTPS Play Store/App Store listing for the build platform. No default listing is guessed.
