# Clean — initial appearance implementation

**Historical first pass.** Later approved typography, icons, navigation and menu changes, plus new browser checks, are documented in [approved-redesign.md](approved-redesign.md).

Implemented for native Expo and web, 2026-11-05.

## Scope

- White conversation canvas, black lowercase centered wordmark and small four-point teal accent above the final n; menu left, right intentionally empty. Exit remains available through navigation/menu (and web Escape).
- Compact welcome; exactly three text-only, regular-weight welcome suggestions in order: Analyser une image, Rechercher un produit, Calculer un prix. Other underlying tools and native drawer shortcuts remain.
- Shared palette: user text/star `#85BAC2`, user text bubble `#C0F9FF`; assistant text black on white. Attachments remain separate and are not tinted. These requested pastel colors are not represented as a WCAG contrast certification.
- Two-row composer with plain plus, subtle divider, outlined microphone, and the approved orange speech-bubble silhouette. Waveform idle, arrow when draft can send, dot during response (existing stop behavior), white stop square while recording. During recording only one orange control is present, with recording indication and cancellation.
- Native and web tab order: Home, Lens, Clean, AYWEBs, Profile. Matching 28px slots and local monochrome camera/search-star/profile references; original Home symbol and multicolor Clean mark retained. Existing routes/screens for removed web tab entries remain in the application. No new Social tab.
- Former Lens homepage section presents Clean, the exact supplied fox artwork, brief localized copy and Clean CTA. Existing `lens-hero` administrative visibility gate and section position remain; no database/content reseed or CMS schema changes. The old web Lens rendering is retained as `LegacyLensFeature`, not mounted by the homepage.
- Only local Clean presentation changed. Commerce/payment/publishing logic and shared theme identity are not globally reskinned.

## Audio behavior and limits

Web keeps the existing recording/STT and full voice-mode controller. Native now uses Expo Audio foreground capture and the existing authenticated `/api/assistant/transcribe` multipart endpoint. Native transcribed text is appended to the editable draft: it is **not automatically submitted**, and is **not** a new full-duplex spoken conversation implementation. Server `voiceReady` gates capture; a configured server STT provider is necessary.

Native capture requests permission, limits capture to 120 seconds, cancels on background/unmount/conversation/account ownership changes, aborts pending transcription, rejects stale completion, releases recorder resources and best-effort deletes temporary files. Audio-mode ownership prevents cleanup from a previous capture disabling a new owner's recording. Permission and transport failures are surfaced, not represented as successful messages.

Expo Audio includes native microphone permission configuration. A new native binary is necessary to install the module/permission; OTA alone is insufficient. Background recording/playback support is explicitly disabled.

## Verification

- Root/client and mobile TypeScript checks passed.
- Native unit suite: 116 files / 1,148 tests passed.
- Native UI suite including five new recording lifecycle cases: 48 suites / 302 tests passed.
- Focused web appearance/navigation/composer/editorial contracts: 9 files / 256 tests passed.
- Design inventory, icon contract and brand identity guards passed (inventory regenerated after source changes).
- Production web/server build passed (existing chunk-size warning).
- Android **and** iOS Expo exports passed, two Metro workers. Generated bundles/caches are ignored, not committed.
- Browser screenshot validation attempted but blocked by unavailable Chromium system library `libnspr4.so`. No visual browser or physical-phone acceptance claimed. No microphone/device/backend-provider integration acceptance claimed. Exports do not establish an APK install or physical device behavior.

Runtime fox assets are locally optimized WebP; the supplied original is preserved under `assets/brand/clean/`. No generated design mockup was substituted for the supplied artwork.
