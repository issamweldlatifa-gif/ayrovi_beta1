# Opt-in licensed Reel test pack

Five **edited test files from three upstream sources**, not five independent advertisements.
No product association, prices, endorsement, account or commerce data is implied.
The clips contain flowers, running water and a short black-and-white film scene
(the upstream `friday.mp4` sample). Two clips are alternate encodes of flower/water.
Audio has been removed. These are motion/decoding test fixtures, not a representative
benchmark of every future uploaded advertisement. Portrait frames preserve the full
source with padding rather than stretching or concealing the original scene.

## Provenance and licence

Source repository: https://github.com/mdn/interactive-examples
Pinned revision: `13024db581b08fae11a0ca229497198b9b0534e7`
Upstream licence: https://github.com/mdn/interactive-examples/blob/13024db581b08fae11a0ca229497198b9b0534e7/LICENSE
CC0 1.0 Universal. A verbatim licence copy is included as `CC0-LICENSE.txt`.
The `manifest.json` records source paths, upstream Git blob IDs, original SHA256s,
output hashes, sizes, dimensions, durations and modifications for each file.
No dependency on a third-party media host at runtime.

Sources:
- `live-examples/media/cc0-videos/flower.mp4`
- `live-examples/media/examples/stream-of-water.mp4`
- `live-examples/media/cc0-videos/friday.mp4`

Outputs: H.264 / yuv420p / 30 fps / MP4 with moov before mdat (`+faststart`),
8–12 seconds, muted, 360x640 / 540x960 / 720x1280.
Generated using FFmpeg/libx264 (via a temporary imageio-ffmpeg installation, not an
application runtime dependency). Scaling preserved aspect ratio, padding was added,
sources looped to the target duration, CRF 24 with maxrate 1500k and bufsize 3000k.
Posters were extracted at second 1. No original runtime file was replaced.

## Owner-approved startup installation

The owner explicitly approved publishing these test Reels. A one-shot backend
startup migration now registers them after a verified file-backed snapshot.
Subsequent edits/deletions are preserved. Deployment of that backend revision is
required; copying media or rebuilding an APK alone does not publish database rows.
See `docs/REEL_LICENSED_TEST_PACK_AR.md` for startup safeguards and the alternative
manual installer. These test clips will be visible to users of the updated backend.
