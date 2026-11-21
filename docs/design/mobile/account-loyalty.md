# ZAYROVI Plus — Loyalty design and operating model

[Visual references provided by the user](references/account-loyalty/) are stored at reduced size and do not ship in the application. The app’s editorial photography is original AI-generated imagery. No third-party logos, offers, dates or terms are reused.

## What the reference shows

- An account entry point and a dedicated branded page: current tier, confirmed points, pending points and next threshold. Light shows a next threshold of 100 points; Shine and Star also appear, but the screenshots do not give the full tier schedule. The reference describes tier validity of one year and activation of purchase points after the return period; one example Booster shows 30 days.
- Horizontal missions: birthday (+10), opt-in newsletter (+20), notifications (+20), measurements (+50), preferred sports (+20) and resale (+50). A temporary Booster and an expandable history, followed by tier comparisons, reward details and FAQs.
- Reward examples: partners, exclusive offers, standard and premium delivery, priority support, access to new arrivals, events, restock alerts and private offers. The reference's partner brands and commercial terms are not ZAYROVI commitments.

## What works in the mobile preview

Account banner and row → ZAYROVI Plus → balance gauge, mission/details rail, optional Booster, purchase simulator, tier comparison and reward details, FAQ and reset. One sample purchase contributes 40 pending points (+20 if its Booster was activated beforehand); these only become confirmed after the simulated end of the return period. A return instead cancels both. One reward per mission; tiers in the preview: Light 0 / Shine 100 / Star 200. Preview state is held only in app memory and shared with the black strip at the top of the profile. It survives navigation back to the profile, but is reset explicitly, on account changes/sign-out or on app restart. Confirmed and pending points are displayed separately. No checkout, data collection, consent change, coupon, monetary conversion, real reward, real balance or membership activation is wired up.

## Production design to approve before connecting the programme

1. **Membership:** explicit opt-in and versioned terms, with a clearly explained exit flow. No membership is created by viewing Plus. Newsletter/push consent remains separate and revocable; no permission prompt or collection of birthday or measurements in the preview. Confirm which optional actions are permitted to earn points.
2. **Points ledger:** server records immutable, account-scoped credits/debits with source and idempotency key. Eligible paid, fulfilled lines generate pending entries; the return deadline comes from policy and order data, not a fixed number from an example capture. A refund or return reverses eligible amounts at line level; a worker atomically confirms remaining entries once eligible. Missions are verified against actual server events and credited once per allowed period.
3. **Levels vs spend:** use confirmed qualifying points for tiers. Do not treat points as money. If conversion or coupons are desired, specify a separate spendable balance and rates, limits, expiry and reversal rules before implementation. Define tier retention, renewal and downgrade explicitly, rather than assume a rolling year from the reference.
4. **Boosters:** configure validity, eligibility, opt-in requirement, qualifying event, cap and stacking in CRM. Store the applicable terms with each awarded entry; a refunded qualifying purchase reverses the linked bonus. Surface upcoming, live, pending and past entries only when real records exist.
5. **Rewards:** each reward has a minimum tier and explicit terms. Checkout validates entitlement, limits, stock and shipping server-side, even if the mobile screen says it is available. Apply, consume and restore entitlements atomically where relevant. Keep unconfirmed commercial benefits and partner branding out until approved.

**Open decisions:** earn formula and rounding in TND, eligible subtotal/taxes/shipping and order statuses, tiers and renewal, returns/refunds, points expiry, whether conversion exists, approved missions/bonuses, reward quotas/partners and the CRM permissions/audit policy. The examples above do not set production policy.
