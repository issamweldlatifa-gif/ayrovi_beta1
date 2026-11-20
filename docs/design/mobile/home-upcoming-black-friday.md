# Mobile home: AYWEBs Upcoming and Black Friday Week

The mobile home order is Cover → Stories → AYWEBs · Prochainement → Black Friday Week → Reels. The Stories heading is above its dark carousel; the standalone black Stories gallery keeps its design and navigation. The Publications cover has a title above its media and the Publication header always has a visible title. Clean remains available in the app; only its home promo block was replaced. The storefront website was not redesigned.

## Store countdowns

In CRM → Contenu → غلاف الواجهة (cover), **AYWEBs · Prochainement** controls visibility, store order (list order), image and local publication time. The catalogue provides the name and a logo if no photo is uploaded. The existing settings table stores a bounded list (up to 12) behind dedicated `content:read` / `content:write` endpoints; the public response includes only still-upcoming cards, never opens a store integration, and omits discontinued/now-supported catalog entries. The initial one-week clock is persisted when the setting is installed; it does not restart with the app or server. CRM can re-arm a card using **Dans 7 jours**. Dates in the response are UTC; the countdown corrects for the device clock using API server time.

On native platforms the bell schedules a local reminder after permission. It is per device, uses the date at the time it is set, and is not server push. Changing the CRM date does not silently reschedule already-installed local alarms; a user can set a new reminder from the updated card. The reminder does not promise an integration has gone live.

## Black Friday and video

The Black Friday Week layout pulls active promotions from the existing Promotions resource and uses their actual images, linked products/arrivals and percentage values. The horizontal rail appears only with usable images. Without active imagery the banner and link to all promotions remain; no sample offers or discounts are generated.

A Publication video detail uses a 9:16 portrait stage, three overlaid controls and dark chrome/content behind the video. Close, mute and expand are independent buttons. Information, saved looks and linked products remain reachable. Fullscreen video fills the viewport under the system bars; the controls respect display insets instead of reserving a white strip. Existing feed media layouts and image/campaign details are not resized by this stage change.

Shared native motion was retuned for navigation, media, tabs, header tint and sheets. Reduced Motion still bypasses transitions. Real-device visual, notification and frame-rate validation is separate from automated UI tests.
