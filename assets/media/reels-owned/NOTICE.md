# Owner-supplied Reel collection

The owner supplied `shoes.mp4`, `clothing.mp4`, `home.mp4`, `perfume.mp4`, and
`accessories.mp4` through the connected Google Drive and explicitly instructed
publication in Reels and removal of all previous Reel videos. These are **not
CC0 assets**; no third-party licence grant or independent rights verification is
asserted. Do not copy licence claims from the superseded MDN test pack.

`manifest.json` records original filenames, sizes, SHA256s and current output
hashes. Source Drive files were not changed, deleted or made public. Original
large downloads are not committed; only the five delivery encodes and posters
are bundled. Do not use Drive preview/download links as runtime media URLs.

Processing: complete duration (no looping/trimming), aspect-preserving center
crop to portrait 720x1280, H.264/yuv420p/30fps, CRF 23, maxrate 2500k, bufsize
5000k, GOP 60, MP4 faststart. Existing source audio is retained as AAC 128k;
only the home source has an audio track. Posters were extracted at second 1.
Cropping can remove peripheral content; no stretching or added black bars.
FFmpeg was used as a temporary development tool, not a runtime dependency.

The owner-approved one-shot backend migration snapshots and verifies a file DB
before replacing the existing Reel collection with these five entries. It does
not delete products, publications, Stories, Drive originals or arbitrary uploads.
See `docs/REEL_OWNER_COLLECTION_AR.md` in the repository for deployment and rollback
limits. Deployment to the actual backend is required; an APK alone does not
publish database rows.
