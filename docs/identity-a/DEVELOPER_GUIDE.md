# AYROVI A — developer contract

Official interface identity: **Zalando Sans** for Latin text/numbers and **Noto Sans Arabic** for Arabic. These are licensed third-party OFL fonts, not proprietary AYROVI font designs. This change does not redesign the logo or change pricing/business rules.

## Single source and usage

- Canonical manifest: `client/src/design/editorial/identity.json`.
- Generate with `npm run design:build`. Never hand-edit `tokens.generated.css`, `client/public/identity.css` or `shared/brand.generated.ts`.
- Use `var(--ay-font-stack)` / existing approved aliases in CSS, `FONT_STACK` in TypeScript, or inherit from the component. Do not add a font-family from API/CMS/product data.
- Use semantic colors (`--ay-e-ink`, `--ay-e-muted`, `--ay-e-secondary`, `--ay-e-canvas`, `--ay-e-surface`, `--ay-e-action`, `--ay-e-on-action`). Base ink/canvas are pure black/white; dark mode reverses them. Secondary surfaces and separators remain deliberate neutral grays, not a beige canvas.
- Use existing semantic heading/body/label classes. Normal body/price weight is 400; headings 500; labels 700. Latin display width uses the approved 112.5% axis, Arabic uses normal width and a more generous line height.
- Financial identifiers/tables may use tabular numerals and bidi isolation through `.ay-number`/`.ay-e-number`. Never introduce `font-mono` or a third font for numbers. Keep arithmetic, currency formatting and original data separate from presentation.
- English text is covered by Zalando Sans. The application's existing locale switch remains French/Arabic; this migration does **not** add an English translation.

## Configuration and API

`shared/identityPolicy.ts` normalizes legacy font choices on reads and protects the official stack/preset on writes. Both `interface_config` and historical `site_theme` are covered. Existing stored business content is not rewritten on reads. Preserve authentication, authorization, CSRF checks and validation around every settings update.

Interface Studio explains the fixed identity and the historical nature of remaining appearance metadata. Content, media, visibility, ordering and supported layout/navigation settings remain editable. Do not confuse an old CMS appearance preview with the active customer theme.

## HTML, email and PDF

- Generated HTML uses `documentIdentityCss()` and local font data embedded into the document.
- Mail uses `mailIdentityStyle()` with an explicitly validated HTTPS origin. Some mail clients discard webfonts: generic fallback is unavoidable. Never add Arial/Inter/another named fallback as an authored brand family.
- `writeSimplePdf` is asynchronous. **Await it** before storing/sending/reading its file. It subset-embeds approved local static TTFs, including Arabic when needed; Regular/Bold are available for both families. Keep `assets/fonts/` and licenses in deployment artifacts. Font sources and SHA-256 values are pinned in `assets/fonts/manifest.json`.
- Arabic uses fontkit shaping and UAX #9 run ordering through `bidi-js`. Do not reverse raw Arabic strings or numeric amounts. The tested samples include Arabic marks and mixed Latin/Arabic text; they are not a certificate for every possible Unicode script or PDF reader.
- Private invoice authorization, atomic writes and file permissions must remain intact. Previously issued invoice files are not silently regenerated.

## Required checks

```sh
npm ci
npm run typecheck
npm run design:check
npm run build
npm test
npm audit --audit-level=high
npx playwright install --with-deps chromium firefox
npm run verify:identity
```

The existing full browser regression commands in `.github/workflows/ci.yml` remain required. They cover customer/account flows, product selection, variants, voice, media, history, cancellation, 200% text, RTL and responsive layouts.

`identity:check` is also a client prebuild hook. It checks generated output, source declarations/loaders, the two-family allowlist, pure base neutrals, local font assets, hashes and licenses. Negative tests exercise prohibited CSS, inline JSX, font shorthand, arbitrary utilities and remote stylesheet/font loading. It is a maintenance guard, **not** a security sandbox against a developer who can edit the guard itself.

## Repository and rollout controls

- Configure branch protection/rulesets externally: require CI, reviewed pull requests, and review of identity manifest/generator/guard/workflow changes. Local source changes cannot themselves make GitHub checks mandatory.
- Deploy from the repository root (as in `render.yaml`) so local font/document assets are present. Do not package only `dist/`.
- HTML is served without long-lived immutable caching; unversioned identity CSS/fonts revalidate. Hashed build assets retain immutable caching. Purge any CDN/service-worker caches retaining old HTML/styles during rollout.
- Check the remote CI result and production health separately. A local PASS or a successful Git push does not establish that deployment succeeded.
- Rollback via a reviewed revert commit and rebuild. No destructive reset or rewriting of issued invoices is needed.

Private comparison studies in `explorations/` are not production font loaders. The migration push does not need to publish their user-supplied reference crops or alternative-font experiments.
