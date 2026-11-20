# Publication mobile: four reference templates

The 720 px reference screenshots were normalized to a 360 dp viewport. The media silhouette is independent of how many products are attached. The existing fixed white Publication navigation remains in place; measurements apply to the posts below it.

| Element | Baseline at 360 dp |
|---|---|
| Post edges | 12 dp inset on both sides; media width 336 dp; media and tile radius 8 dp |
| Image · cover | about 336 × 324 dp (658:634 reference) |
| Image · panoramic | about 336 × 162 dp (658:318 reference) |
| Video · inset | 336 × 162 dp frame; video centered at half frame width over a blurred poster |
| Video · panoramic | 336 × 162 dp frame; video fills the frame |
| Product strip | 4 dp below media; tiles ≈103 × 148 dp, 4 dp gaps, 16 dp fourth-card peek if available |
| Favourite / Voir plus | 32 dp heart disc inset 8 dp from top and end; same-size terminal tile with centered 48 dp arrow disc |
| Text and controls | 6 dp below the rail; left-aligned title/subtitle (mirrored in Arabic), 16/20 dp; overflow at the trailing edge; video controls 40 dp in discs stacked at the lower trailing corner |

The authored `/api/public/social/publication-feed` remains the source for media, titles, publisher, sponsorship and linked products. The renderer distinguishes image vs video, then uses authored dimensions (landscape starts at 1.55:1) and the video `fit` override (`contain` → inset, `cover` → panoramic). If a legacy image has no dimensions, `campaign`/`split` use panoramic and other image formats use the cover. The principal visual is the first valid authored media. `Voir plus` reveals the post's description and its own linked products, not an unrelated catalogue. The sponsor label is independent of template geometry and only renders for authored sponsorship. Only one visible video can play; it starts muted, does not autoplay under Reduce Motion, and releases its player offscreen, on background, or while a sheet is open.

No retired block endpoint, admin composer or legacy demo example is reactivated. No reference campaign assets are shipped and no post is automatically published. The tab shell, product screens and AYWEBs remain unchanged.

## Orange and red product campaigns

`campaign_orange` and `campaign_red` are two additional, opt-in templates on the same authored Publication API. They use the actual linked items in their existing order. Set `template_id` to one of those values and provide `title`, `channel_id`, and `product_ids`; `subtitle` is the second headline and the image is optional for these layouts. `sponsored: true` enables the disclosure on the headline and products; a short authored `action_label` may appear as the campaign tag. Nothing is seeded or published automatically.

At 360 dp, the title is inset 24 dp, the rail starts 54 dp after the heading panel, and portrait product photos are about 152 × 219 dp (16 dp radius and inter-card gap; 20 dp outer inset). The Follow button is 128 × 48 dp, outlined, with its publisher alongside. Orange panels are `#F2631F` / `#F6A178`; red panels are `#DB2436` / `#831520`, sampled from unobstructed reference pixels. The toolbar exposes search within the campaign, saved products and the cart; the filter works on the actual linked brands and discounts. Promo pricing appears only if the catalogue publishes a valid compare-at price; it is not labelled as a 30-day low.
