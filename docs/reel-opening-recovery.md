# Reel opening and playback recovery

## Observed failure and limits

The home tile navigated to `/reels-viewer?id=reel_demo_01`, but the existing demo video depended on `interactive-examples.mdn.mozilla.net`. In the sandbox that external request failed and the player remained at readyState 0 behind a black screen. Network access restrictions here do **not** prove that the owner's phone has the identical network failure. This was a reproduced failure path, not a device crash report.

The viewer also lacked pending/error/empty states for a cold feed request. Native player failures had no visible retry path. Expo Video's web `play()`/`replaceAsync()` wrappers additionally discard DOM play promises and could emit an unhandled AbortError when playback was paused during opening/retry.

## Changes

- Serve the **identical existing CC0 flower demo**, not replacement content, from `/media/reels/flower-cc0-v1.mp4` (1,128,375 bytes). Original Git blob, source, CC0 licence and notice are included beside the media. SHA-256: `0cd83d944a6ca7822b4a8306cecc60a36e859b041f6702c6a1ad9ead78924451`.
- Fresh seed uses the same-origin asset. One-shot migration changes only `reel_demo_01` when its video URL still exactly equals the known legacy MDN URL. It preserves titles, timestamps, counters, product associations and all other CRM content. A custom URL remains untouched. No reseed/reset.
- Fullscreen feed now shows honest loading/error/retry/empty states. Cold links without an ID, or an unavailable ID, select the first available actual Reel instead of leaving all players inactive.
- `useReelPlaybackStatus` observes native status events, cleans up listeners/deadlines, exposes explicit retry and caps indefinite loading at 20 seconds. No fake success, impressions or automatic retry storm.
- Previews and fullscreen playback wait for readiness before playing. A new grey loading mark appears while waiting; actual media errors show localized Arabic/French text and an accessible retry target.
- Native retry uses `replaceAsync`. Web controls use the documented `VideoView.nativeRef` DOM element to own play promises and reload without eager SDK autoplay. Only expected pause/unmount AbortErrors are ignored; other play failures become visible errors. No global rejection suppression and no changes to node_modules.
- TND/product tray, first-party publisher, comments, auth, favourites and purchasing remain unchanged.

## Validation

- Mobile TypeScript; root TypeScript; design/identity checks; client/server build: passed.
- Mobile UI: **44 suites / 288 tests passed**, including four new status/deadline/retry/cleanup tests. Full suite retains the pre-existing `--forceExit` runner workaround.
- Mobile unit: **116 files / 1148 tests passed**, including web promise and safe-reload tests.
- Root targeted media/range/migration, publisher, hardening and identity checks: **5 files / 30 tests passed**.
- Real HTTP media request: `206 Partial Content`, `video/mp4`, `Accept-Ranges: bytes`; test verifies actual requested bytes against the original file.
- Android and iOS Hermes exports: passed (5.2 MB / 4.9 MB bundles).
- Actual browser playback, **without substituting a fixture video or modifying CRM for proof**:
  - home moving preview → tile click → original local MP4 decoded/playing, French and Arabic;
  - cold direct links with valid ID, missing ID and unavailable ID;
  - aborted media request → visible error → explicit retry → same actual MP4 plays;
  - failed feed request → visible error → retry → actual playback;
  - empty feed → visible empty state;
  - **PAGE_ERRORS []** after fixing the web play-promise race.

Proof scripts/logs/screenshots are local `.cache/reel-open-*` artifacts, not committed. Negative tests intercept only the requests being deliberately failed/emptied; successful playback uses the shipped original MP4.

## Release requirement

Deploy the backend/public asset changes as well as the new app build. A new APK alone does not install a server-side migration or public video asset on an already-deployed backend. No physical-phone test or ready-to-download APK containing this commit is claimed.
