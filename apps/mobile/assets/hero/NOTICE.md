# Owner-supplied mobile Hero collection

The 13 photos in `manifest.json` replace the previous six Hero photos. The
manifest records each supplied filename, local filename, localized title and
black/white title choice. Old unmatched local artwork has been removed.

Owner supplied and requested use; this is not an independent verification of
third-party copyright or a claim that these are original/official brand assets.
The supplied app screenshots are design references, not bundled artwork.

Photos retain their square composition. No cover crop, inset border, added
footer, faded overlay or title is baked into them. 420px originals are not
upscaled; the 1050px source is downsampled to 900px. Native text is laid out above
the image, in the same card on a background sampled from its top row. The
header may grow with accessibility font scale; it does not overlap products.

`palette.json` contains decoded first/last-row RGB means, not brand colours.
Recompute after replacing artwork. The title tone selects the better black or
white WCAG contrast against the header; automated tests require at least 4.5:1.
No new runtime image-processing or native dependencies were added.
