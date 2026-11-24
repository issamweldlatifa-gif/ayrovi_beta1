# Mobile Stories gallery

Home → Stories **Explore** and each Home story card open `/stories`, not the Social tab. The optional `focus` parameter promotes the tapped card in the first section, without changing the CMS order of other cards. Tapping a gallery card uses `/stories?id=…` and the editorial Story viewer. Existing share URLs and public expiry rules are preserved.

The standalone gallery is #000000 including safe areas, with light status-bar glyphs and no white browser/navigation band. At 360 dp: 12 dp gutter, 336 × 504 dp featured portraits, ~278 × 418 dp cards for the snapping **Nouveau** rail, 8 dp horizontal and 12 dp vertical archive gaps, portraits in three columns alternating with two stacked small cards beside a larger one. Scrolling reveals a back-to-top button. The outer list is virtualized and the archive grows in batches of nine; **Voir plus de stories** is present only while there are remaining cards to show.

The gallery uses published, visible CMS Stories and existing authors' imagery, never the supplied reference screenshot assets. The archive here is a browsing index of the presently published Stories; it does not expose expired items. The latest-stories CTA follows the official Zayrovi Team account through the existing follow relation. The account inbox receives new eligible Stories published after that follow began. These are in-app alerts, not device push notifications.

## Story player, articles and CRM

Opening a card (or its existing share link) now loads only that story via `GET /api/public/stories/:id/editorial`. The black viewer supports full-bleed, inset-media/editorial and product slides in authored order, with segmented progress, tap sides for navigation, play/pause, sound on video and close. It keeps one active video or GIF, starts with sound on deliberate entry, lets users change that preference on any slide (only video can play sound), and stops progression/playback when unfocused or backgrounded. Reduce Motion starts playback paused. A slide can open the card's own native article via **Lire**, **Découvrir** or **Explorer** (all resolve to the same native page). A product screen displays a compact card for one product or a horizontal row of identically sized cards with a peek at the next product. Each card opens the exact linked product and uses live price and favorite state. Back from an article or product returns to the story. The Social-tab viewer is unchanged.

The article starts on a white canvas with the cover, headline, byline/date and introduction. A horizontal selection rail precedes authored blocks; a product focus block has its own headline, product-specific write-up, image and native catalogue card. The black footer has a link to the Stories gallery and up to four other live Stories, followed by a white latest-Stories alert signup. Only canonically linked products are shown, with published comparison prices when available. Existing cards without a saved composition remain readable using their own cover/text. A missing, expired, future or unpublished story never falls through to a different article.

**CRM → Contenu → Stories officielles:** associate catalogue products, compose up to 12 cover, inset or product slides (photo/video/GIF), choose a duration or use the default, and assign **Lire**, **Découvrir** or **Explorer**. A product slide can link up to eight products in authored order. The article editor supports up to 20 ordered text, image and product focus blocks. It validates all product references against the Story’s current selection. Legacy single-product slides remain readable. Publication/expiry, transactions and audit continue on the existing Stories resource and version-1 JSON document; the gallery does not fetch that JSON.

A one-time data update fills the seven untouched official demo Stories with distinct FR/AR articles and links catalogue suggestions to seven relevant existing Reels. CRM-authored rows, retired rows, unrelated clips and product prices are unchanged. Reels use their existing product tray and product routes (the fullscreen tray opens on request).

Story alerts use the existing authenticated notifications inbox. Opening the account or inbox syncs up to the 20 most recent published, unexpired Stories since following Zayrovi Team, once per Story and account. Old alerts keep their read state; unfollow prevents further alerts. No global notification fan-out or push permission is added.

**CRM → Contenu → Social → Publications:** the current seven mobile layouts are available instead of the retired block-model editor. Existing rows and their legacy types are kept; selecting a new layout explicitly converts it. Retirement archives the record instead of deleting it.

## 19/11/2026 — three defects fixed in the gallery

1. **No story is shown twice in the top blocks.** The "Nouveau" rail was sorted
   from the full list, so a featured story reappeared just below the featured
   portrait. `storiesGalleryContent` now splits the published list into
   *featured* (curated order, optional `focus` first), *recent* (the rest,
   newest first, eight at most) and *archive* (everything that is not featured).
   A story can still be both in the rail and in the archive — the rail is a
   preview of the index, which is documented and asserted in
   `tests/stories-gallery-layout.test.ts`.
2. **The intro has one title, not two.** The subtitle was rendered with the
   title style (30/36), directly under "STORIES SÉLECTIONNÉES" — two competing
   headings, which read as a repeated title. It is now 16/23 (`introNote`).
3. **The alerts block is named for what it does.** Its heading said "LES
   DERNIÈRES STORIES" above a follow button; it now says "NE MANQUEZ AUCUNE
   STORY" (AR: "ما تفوّتش حتى قصة"). The empty rail and archive headings are no
   longer rendered when there is nothing under them.
4. **Failure is actionable.** An empty list previously told the user to pull
   down — a gesture that cannot be discovered on an empty list. The gallery now
   shows the reason plus a bordered **Réessayer** button that refetches stories
   and settings (`tests/ui/storiesGallery.ui.test.tsx`).
