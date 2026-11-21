# Publication mobile: reference templates

The 720 px reference screenshots were normalized to a 360 dp viewport. The media silhouette is independent of how many products are attached. The existing fixed white Publication navigation remains in place; measurements apply to the posts below it.

| Element | Baseline at 360 dp |
|---|---|
| Post edges | 12 dp inset on both sides; media width 336 dp; media and tile radius 8 dp |
| Image · cover | about 336 × 324 dp (658:634 reference) |
| Image · panoramic | about 336 × 162 dp (658:318 reference) |
| Video · inset | 336 × 162 dp frame; video centered at half frame width over a blurred poster |
| Video · panoramic | 336 × 162 dp frame; video fills the frame |
| Video · square | 336 × 336 dp frame; default centered portrait at 56% width with blurred sides; 2-product edition and matching CTA |
| Product strip | 4 dp below media; tiles ≈103 × 148 dp, 4 dp gaps, 16 dp fourth-card peek if available |
| Favourite / En savoir plus | 32 dp heart disc inset 8 dp from top and end; same-size terminal tile with centered 48 dp arrow disc |
| Text and controls | 6 dp below the rail; left-aligned title/subtitle (mirrored in Arabic), 16/20 dp; overflow at the trailing edge; video controls 40 dp in discs stacked at the lower trailing corner |

The authored `/api/public/social/publication-feed` remains the source for media, titles, publisher, sponsorship and linked products. The renderer distinguishes image vs video, then uses authored dimensions (landscape starts at 1.55:1) and the video `fit` override (`contain` → inset, `cover` → panoramic). If a legacy image has no dimensions, `campaign`/`split` use panoramic and other image formats use the cover. The principal visual is the first valid authored media. `En savoir plus` reveals the post's description and its own linked products, not an unrelated catalogue. The sponsor label is independent of template geometry and only renders for authored sponsorship. Only one visible video can play; it starts muted, does not autoplay under Reduce Motion, and releases its player offscreen, on background, or while a sheet is open.

No retired block endpoint, admin composer or legacy demo example is reactivated. No reference campaign assets are shipped and no post is automatically published. The tab shell, product screens and AYWEBs remain unchanged.

## Orange and red product campaigns

`campaign_orange` and `campaign_red` are two additional, opt-in templates on the same authored Publication API. They use the actual linked items in their existing order. Set `template_id` to one of those values and provide `title`, `channel_id`, and `product_ids`; `subtitle` is the second headline and the image is optional for these layouts. `sponsored: true` enables the disclosure on the headline and products; a short authored `action_label` may appear as the campaign tag. Nothing is seeded or published automatically.

At 360 dp, both colors share a 48 dp filter strip and a 128 dp minimum heading panel (long authored content may expand). Product photos use the same uncropped fit and the copy reserves a common baseline for Follow. The title is inset 24 dp, the rail starts 54 dp after the heading panel, and portrait product photos are about 152 × 219 dp (16 dp radius and inter-card gap; 20 dp outer inset). The Follow button is 128 × 48 dp, outlined, with its publisher alongside. Orange panels are `#F2631F` / `#F6A178`; red panels are `#DB2436` / `#831520`, sampled from unobstructed reference pixels. The toolbar exposes search within the campaign, saved products and the cart; the filter works on the actual linked brands and discounts. Promo pricing appears only if the catalogue publishes a valid compare-at price; it is not labelled as a 30-day low.

## Publication entry points

| Template | Tap media | Final **En savoir plus** | Tap a product |
| --- | --- | --- | --- |
| `image-cover`, `image-panoramic` | `/publication-look/[id]`: publisher-style cover and **only** that publication’s linked products | Same publication-specific route | Canonical `/product/[id]` |
| `video-inset`, `video-panoramic`, `video-square` | Edge-filling video, back, share, sound, expandable description, and playback tools under overflow | **En savoir plus** on either surface → `/publication-look/[id]`: video, title/description, publisher and Follow, then linked product grid | Canonical `/product/[id]` |
| `campaign_orange`, `campaign_red` | **Tap the headline** → `/publication-look/[id]`: inset landscape cover, title, description, publisher/Follow, info and a two-column linked grid | — | Canonical `/product/[id]` |

The photo detail reuses the Zayrovi Team publisher layout: authored hero, title and description, Follow, back/share/overflow, compact scroll header, product count and info, three-column grid or list. Brand, price and confirmed-stock filters operate on linked items only, in authored order. The Team profile remains a separate catalogue view. The mobile Social header and Team avatar use the white-backed yellow and black **Za.** lockup. Tapping the video or its play glyph opens the same video fullscreen; the sound control changes mute without opening it; fullscreen uses the original source on an edge-to-edge canvas, with no reserved status-bar or footer strip. Portrait video fills the upright screen; landscape video fits without cropping, over a blurred poster where available. The close button stays within the safe area and available when controls are hidden. CC appears when the native player discovers a subtitle track and toggles the existing timed text (preferring the app language when available); it does not transcribe or translate automatically. The player reports automatic quality and the actual decoder resolution, not fabricated selections. The player is paused in the background and the feed preview does not play underneath it.

Campaign detail prefers the authored image or poster, then uses the first real linked product photo if no cover was authored. It leaves the cover absent if neither source exists and never reads the global catalogue.

All three detail presentations reuse the same authorized, account-keyed public feed read (`post=…&limit=1`); follow, look saves and product favorites use existing endpoints. Prices and optional discount/new badges come only from actual catalogue fields; no reference campaign data, historical-price labels, demo assets, or retired collections were added. Captions and options retain their existing action paths.

## Initial Zayrovi Team content

On a database with the current 24-product selection and the two chosen published owner Reels, `catalogue_publications_v1` adds six editable Zayrovi Team publications (four linked catalogue IDs each, no duplicates). Image covers use catalogue product photos. Video layouts reuse the existing Capsule Wardrobe and Classic Outfits video URLs and posters (`contain` and `cover` respectively); no copies and no changes to the Reels themselves. Product data is read at request time. This one-shot insertion does not recreate or overwrite edits, and waits if any of the sources are unavailable. To undo it, unpublish the six `publication_catalogue_v1_*` posts in the CRM; do not delete the migration marker. The mobile-only `presentation=reference` list skips the old starter artwork and past showcase examples, without deleting, unpublishing or changing legacy direct reads.

The square frame is explicit video media metadata (`frame: "square"`), not an inference about the Reel’s aspect ratio. The additive `catalogue_publication_square_video_v1` installation reuses the published Workwear Reel and two existing catalogue products; it does not alter the original six publications, their assignments, or the Reel. At 360 dp the new reference gives a ≈20 dp rail inset for this two-product edition, 4 dp gaps, and 40 dp preview control discs. The fullscreen caption and outlined CTA are independent actions; only the CTA opens the video detail.

### Shoppable fullscreen player

The Amazon mobile reference is implemented only in the shared **Publication fullscreen** session (feed and Look entry points), not in the feed cards or white detail page. One tap opens fullscreen and queues playback, with editorial identification and close visible while transport stays hidden. In the feed, only the visible video autoplays with sound by default (respecting Reduce Motion). The mute choice follows scrolling and fullscreen for the feed session. Both players defer audio until the first rendered frame; fullscreen offers retry if no frame arrives. The transparent editorial overlay keeps a larger/bolder title, publisher (using the official Za. mark for Zayrovi Team), sponsorship when authored, and a compact description or exact linked product name visible with or without playback controls. The on-demand controls show centre play/pause and ±10 s, remaining time, scrubber, sound, native CC when present, details, and settings. Tapping the surface toggles the chrome; × remains available. A downward swipe on the media dismisses back to the originating video and preserves its timestamp; horizontal scrubs and panel scrolling do not dismiss. The video surface never changes size when controls are toggled. Controls and the bottom actions are white glyphs and text directly over the picture, with local contrast and no screen tint or bottom band. Shop Products and More Videos only show their panels when requested. Sharing remains outside the fullscreen player.

- **Shop Products** is an in-player horizontal panel using only the active post’s public linked product cards and catalogue prices. Selecting a card opens the canonical product route. The action is hidden when the current post has no links.
- **En savoir plus** opens the currently playing publication’s detail page.
- **Plus de vidéos** slides up without leaving the same modal. Product-filtered, viewer-scoped feed reads are bounded (20 product IDs, 30 candidates); the mobile queue confirms shared available products, deduplicates videos and displays up to 12. There is no random fallback. Selecting a card replaces the video without changing the route.
- **À suivre** starts a five-second countdown after the real native end event, with immediate-play and Cancel actions. The timer stops in the background or while a sheet or menu is open; Reduce Motion disables auto-next. Visited posts are not auto-replayed, and the original preview resumes from its own last position on exit.
- Duration badges use validated authored durations or the shipped media manifest for bundled videos. Missing stars, review counts, commission claims, or timed captions are not synthesized. The existing API only adds a product filter and read-time duration metadata to that filtered response; no CRM content, schema or media asset is changed.
