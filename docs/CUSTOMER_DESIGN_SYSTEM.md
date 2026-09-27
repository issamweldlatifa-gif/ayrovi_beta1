# AYROVI Customer Design System 3.1

Current customer-facing visual contract: storefront, product and merchant flows, Lens, cart, checkout, account, login, and password recovery. The admin/back-office is intentionally out of scope.

## Source of truth and build

- Edit `client/src/design/editorial/identity.json` for approved colors, geometry, type weights, and line heights.
- `client/src/design/editorial/customerTheme.ts` binds those values to the customer root (`CustomerIdentity`); do not create per-page copies of the palette or radius scale.
- `client/src/design/editorial/primitives.css` provides reusable editorial primitives. Shared controls should use `Button`, `buttonClasses`, `rounded-control`, and `rounded-card` instead of hand-coded values.
- Run `npm run design:build` after changing the identity. It regenerates `tokens.generated.css`, `client/public/identity.css`, `shared/brand.generated.ts`, and the reference board. `npm run design:check` verifies that generated artifacts and identity inventories are current.

## Color roles

| Role | Light | Dark | Usage |
|---|---|---|---|
| Canvas / ink | `#FFFFFF` / `#000000` | `#000000` / `#FFFFFF` | Page base and readable text |
| Primary action | `#000000` with white text | `#FFFFFF` with black text | Primary and CTA buttons |
| Information | `#595959` on `#F5F5F5` | `#BDBDBD` on `#171717` | Quiet information, tips, and neutral status |
| Success / error | Green / dark red tokens | Accessible light variants | Outcome states only |
| Brand accent | AYROVI orange | AYROVI orange | Brand details, not the primary CTA |

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

- Use `Button` with `primary`/`cta` for primary actions (capsule), `secondary` for secondary controls (12px), and `ghost` for text or icon controls.
- `size="icon"` is an unboxed, round hit area with a visible focus ring; do not add a square background wrapper.
- Keep image/media corners and product crops independent from control/card radii.
- For information-only content, use the neutral info tokens; preserve distinct success, error, promotion, and availability states.
- Do not override customer tokens inside a single page unless the component is a deliberate exception documented here.

## Compatibility note

`client/src/design/tokens.css` and the older `docs/DESIGN_SYSTEM.md` retain legacy compatibility values used outside the customer scope (including the admin). The customer-facing source of truth is this document plus `identity.json`; the generated identity and `CustomerIdentity` bridge apply it on every customer page, including login and recovery.
