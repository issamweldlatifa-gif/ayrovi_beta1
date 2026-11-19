# ZAYROVI Admin · Design System

This guide extends the existing ZAYROVI identity, not a separate brand. It applies to the unified `/admin` surface, not the public website or native app.

## References and decisions

| Reference | What we use | What remains ZAYROVI-specific |
| --- | --- | --- |
| Owner-supplied navy/light and charcoal dashboards | A dark navigation rail, uncluttered toolbar, readable metrics and a real dark theme | Existing brand mark, FR/AR, actual order metrics and modules |
| [Fluent 2 — Design tokens](https://fluent2.microsoft.design/design-tokens) | Semantic roles for foregrounds, surfaces, actions and states | The local `--office-*` vocabulary; `--bo-*` stays as a compatibility bridge. Change a role once instead of overriding page colors. |
| [Fluent 2 — Typography](https://fluent2.microsoft.design/typography) | Explicit caption, label, body, section title and page title roles | Zayrovi Extracted Sans and Noto Sans Arabic, both existing local OFL assets; Arabic uses looser leading, not letter spacing. Numbers in cards and reports use tabular figures. |
| [Carbon — Data table guidelines](https://preview.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines) and [icons](https://v10.carbondesignsystem.com/guidelines/icons/code/) | Toolbar is for search/filters that operate on the whole table; two common record actions stay visible inline; track focus and keep decorative icons explicitly hidden from assistive technology | The existing `DataTable`, server pagination and permissions remain. Small actions are labelled in the accessibility tree and have native titles; no external UI library. |

## Source of truth

- `client/src/design/admin/office-tokens.css` — Admin theme, scale, spacing, focus, chart colors and compatibility aliases. The same roles apply in both modes. Do not hardcode per-screen colors; use `--office-text-*`, `--office-surface-*` or `--office-action-*`.
- `client/src/design/admin/OfficeIcon.tsx` — Admin semantic icon API (`action` 16 px, `navigation` 20 px, `feature` 24 px). New glyph geometry is authored once in `client/src/design/editorial/glyphs.json`, rendered by `EditorialIcon` and included in the generated icon specimen. Use visible labels on navigation; icon-only actions need an accessible name.
- `OfficeViewSwitch` — same dataset, different view (table, Kanban, analysis). Use a page-level navigation link instead when the destination changes. Pass a narrow union of view IDs and ensure one option matches the current value.
- `OfficeListToolbar` plus `DataTable` — global filters above, row actions inside; use `rowActions` and keep server query bounds. Provide empty, loading and error states. Do not move permission checks to presentation components.
- `client/src/styles/admin-unified.css` — responsive workspace composition. Use logical properties (`padding-inline`, `text-align: start`). Database, API and transactions are out of scope for design-system changes.

## Add a new screen

1. Reuse `PageHeader`, `CardTitle`, form and table primitives. A new label or filter is not a reason to fork a component.
2. If it is a business module, register it and its permissions **server-side** first. Add placement by `section` in `workspaces.ts`; unknown permitted entries still land in *Autres outils*.
3. Use the toolbar for search and filters, and put row actions inside the table. Never introduce destructive or financial actions without the corresponding server permissions, confirmation and audit.
4. Test light/dark, FR/AR layout at desktop and small widths, keyboard traversal and visible focus, as well as empty/table/board states. Add translation where the screen changes; this does not make all older screens bilingual.
5. If changing glyphs, run `npm run design:build` and `npm run design:inventory`, then `npm run design:check` and `npm run typecheck`. The token tests sample critical contrast pairs; they are not a full accessibility audit.

The revenue chart uses the existing UTC date grouping, including days without sales. It can be inspected by pointer or by an accessible range input (keyboard and touch). This is an alternate reading of the same data, not a new reporting API.
