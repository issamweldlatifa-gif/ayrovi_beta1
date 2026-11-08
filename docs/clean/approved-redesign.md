# Clean — approved redesign after phone feedback

This supersedes the appearance/navigation/menu descriptions in `implementation.md`.

## Implemented

- Dedicated local regular system-sans typography: Arial web/iOS, Android system sans. User and assistant messages use the same regular treatment. Clean-only CSS wins against the previous `#root *` and important button typography rules; it does not change commerce fonts. The audited font exception is restricted to one file, one exact selector and one exact stack. Editorial renderer has an explicit `appearance="clean"` rounded-cap/join option; the default remains unchanged.
- Customer text: `#365D63` on `#C0F9FF`, with the supplied **orange** bubble/sparkle artwork beside the message. Assistant: supplied **blue** artwork and black text on white. The small wordmark accent keeps `#85BAC2` and touches the final n's upper outside edge. Welcome and suggestions are black, not faded teal.
- Supplied speaker JPGs were cropped, outside-white removed and resized without AI regeneration. Native/web PNG bytes are identical; the existing official multicolor Clean **navigation** icon is separate and unchanged.
- Composer orange silhouette is the approved domed top/flat lower edge shape. All existing wave/send/dot/stop functions remain. Recording replaces the mic with the orange stop control and temporarily hides the other orange control.
- Real keyboard overlap measurement replaces the former iOS-only avoidance wrapper. It also handles Android windows that fail to resize and avoids double-lifting when `adjustResize` already worked. Root offsets and hide/resize paths have unit and hook tests. Phone OS behavior is not certified by these tests.
- Menu contents are cleared pending redesign. Close affordances remain. Original native UI is archived under `docs/archive/clean/`; old web menu remains an unmounted named export. Underlying routes, history, commerce tools and data are not deleted. Native conversation reset remains in the existing conversation toolbar, outside the cleared menu.
- `+` opens exactly: Appareil photo, AYWEBs, Lens, Photos, Fichiers. AYWEBs/Lens reuse navigation reference shapes and open their real routes. Photos opens the gallery; Fichiers opens the native document picker/web file chooser.
- **File-format limit:** the existing assistant pipeline supports image attachments, not arbitrary documents. Fichiers accepts JPEG/PNG/WebP on native (also GIF on web), retaining the existing two-image limit; native file selection is capped at 8 MB. No unsupported PDF is silently sent or represented as analyzed.
- Appareil photo opens the rounded embedded **real** camera panel, not an external camera app. Shutter/back/three-dot controls; expanding dots exposes flash and facing controls plus collapse X. Native camera waits for readiness, rejects repeated capture and ignores capture completed after close. Web capture returns a real JPEG into the existing image preparation queue. Streams stop on closure/unmount/background; native focus revokes capture/recording even when tabs keep screens mounted. Web flash is disabled when unsupported.
- Navigation: Accueil / Lens / **official Clean** / AYWEBs / Profil; 28px balanced slots, 1.5 reference stroke for monochrome icons, no labels. The newly selected outlined house replaces the old **navigation-only** Home silhouette. Master ZAYROVI brand assets, startup mark and other brand placements are not changed.
- Clean sheets/menu surfaces remain white independently of the commerce theme, through opt-in surface props with unchanged defaults.

## Verification and boundaries

- Production web/server build; root/client/native TypeScript; design inventory/icon/identity checks.
- Mobile full suites passed: 117 unit files / 1,151 tests and 50 UI suites / 308 tests. Focused web appearance, typography, navigation, interaction and identity checks: 10 files / 289 tests passed.
- Android and iOS Metro exports, two workers. Exports are ignored artifacts, not APK/device acceptance.
- `verify/clean-approved-ui.mjs`: actual computed browser fonts/weights/colors; five navigation buttons; compact composer border; reduced viewport bounds; cleared menu; five sheet entries; camera/options and JPEG addition using an explicitly **virtual** Chromium camera. Review screenshots under ignored `.cache/clean-review/`.
- A reduced browser viewport is not an actual mobile keyboard. Camera/permissions/keyboard must still be reviewed in a newly installed native build on the target phone. Expo Document Picker adds a native module, so OTA alone is insufficient. Existing Expo Audio also needs a native binary and a configured server STT provider.
- No new full-duplex native voice assistant, PDF analysis, physical-camera validation or physical-phone acceptance claimed.
