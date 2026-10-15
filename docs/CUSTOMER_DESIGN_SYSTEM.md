# AYROVI Customer Design System 4.2

Current customer-facing visual contract: storefront, product and merchant flows, Lens, cart, checkout, account, login, and password recovery. The admin/back-office is intentionally out of scope.

## Source of truth and build

- Edit `client/src/design/editorial/identity.json` for approved colors, geometry, type weights, and line heights.
- `client/src/design/editorial/customerTheme.ts` binds those values to the customer root (`CustomerIdentity`); do not create per-page copies of the palette or radius scale.
- `client/src/design/editorial/primitives.css` provides reusable editorial primitives. Shared controls should use `Button`, `buttonClasses`, `rounded-control`, and `rounded-card` instead of hand-coded values.
- Run `npm run design:build` after changing the identity. It regenerates `tokens.generated.css`, `client/public/identity.css`, `shared/brand.generated.ts`, and the reference board. `npm run design:check` verifies that generated artifacts and identity inventories are current.

## Color roles

Official palette (2026-10-15), identity `v4.2.0` — the same values as the mobile app (`apps/mobile/src/design/brand.json`).

| Role | Light | Dark | Usage |
|---|---|---|---|
| Canvas / ink | `#FFFFFF` / `#0A0A0A` | `#0A0A0A` / `#FFFFFF` | Page base and readable text |
| Surface | `#F2F2F2` | `#171717` | Secondary backgrounds, skeletons |
| Main action (`action`, `--ayrovi-cta`) | `#571EF6` with white text (7.19:1) | same | **Only** the main purchase/sign-in action: add to bag, checkout, pay, sign in (`.s-cta`, `.ay-btn-cta`, `Button variant="cta"`, auth submit) |
| Generic primary button (`--ayrovi-button-bg`) | `#0A0A0A` with white text | — | Every other solid button (`.ay-btn-primary`, `Button variant="primary"`) |
| Accent text / focus | `#571EF6` | `#926DF9` | Important links, active tab / bottom-nav item, selected-option border, focus ring |
| Light violet (`accentSoft`, `--ayrovi-accent-soft`) | `#C5B2F4` with `#0A0A0A` text (10.4:1) | same | Background of a selected option or active state — always with a violet border/indicator, never white text, never large areas or product cards |
| Information | `#666666` on `#F2F2F2` | `#BDBDBD` on `#171717` | Quiet information, tips, and neutral status |
| Success / error | Green / dark red tokens | Accessible light variants | Outcome states only (unchanged) |

### Violet usage (v4.2.0 — violet kept to the minimum)

- App-level visual guide: violet ≈ **3 %** of the interface (`#571EF6` ≈ 2 % + `#C5B2F4` ≈ 1 %), down from 10 %; white 50 %, black 35 %, light gray 5 % are unchanged and the 7 released points go back to these neutrals (everything that is not violet ≈ 97 %). Source: `identity.json → accentShare`.
- It is a guide for the whole app, **not a quota per screen or component**: a screen with little or no violet is fine, and violet is never added to reach the number. `accentAreaLimit` stays a per-screen *safety ceiling* for the CI pixel audits (no large violet surfaces), not a target.
- Never place violet frames or backgrounds around product photos; product images keep their original colors. Prices, sizes and ratings stay in ink. Promotion badges and decorative rules are neutral.
- One violet main action per screen at most, and not on every screen; secondary actions are ink or outlined. Adjacent violet elements are avoided.

Use the semantic information tokens (`--ayrovi-info`, `--ayrovi-info-soft`) for new informational copy or surfaces. Do not use success/error colors to style neutral information.

## Geometry

- **Primary CTA:** capsule, `999px` (`--ayrovi-radius-cta`).
- **Fields and secondary controls:** softly rounded, `12px` (`--ayrovi-radius-control`).
- **Cards:** `16px` (`--ayrovi-radius-card`).
- **Sheets:** `32px` at the exposed edge (`--ayrovi-radius-sheet`).
- **Product media:** stays full-bleed/square unless a component explicitly needs a different crop.
- **Icon-only controls:** keep at least a `44px` touch target, with a bare glyph by default—no square tile, border, or persistent background. A selected/action state may use a circular indicator, never a square frame.

## Typography

The shared Zalando Sans / Noto Sans Arabic stack remains local to the project. Body defaults are weight `500`, Latin line-height `1.4`, and Arabic line-height `1.55`; headings use weight `650`, line-height `1.18` / Arabic `1.42`; prices use weight `600`. Keep important labels readable and do not increase line-height to create visual weight—use the weight token instead.

## Component contract

- Use `Button` `cta` only for the screen's main purchase/sign-in action (violet capsule), `primary` for other solid actions (ink capsule), `secondary` for secondary controls (12px), and `ghost` for text or icon controls.
- `size="icon"` is an unboxed, round hit area with a visible focus ring; do not add a square background wrapper.
- Keep image/media corners and product crops independent from control/card radii.
- For information-only content, use the neutral info tokens; preserve distinct success, error, promotion, and availability states.
- Do not override customer tokens inside a single page unless the component is a deliberate exception documented here.

## Compatibility note

`client/src/design/tokens.css` and the older `docs/DESIGN_SYSTEM.md` retain legacy compatibility values used outside the customer scope (including the admin). The customer-facing source of truth is this document plus `identity.json`; the generated identity and `CustomerIdentity` bridge apply it on every customer page, including login and recovery.
