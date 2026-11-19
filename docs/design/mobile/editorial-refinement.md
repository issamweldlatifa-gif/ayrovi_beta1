# ZAYROVI mobile visual refinement

## Pre-implementation audit

The supplied Zalando app/web references use two distinct compositions: editorial/event pages with high-impact imagery and strong whitespace, and dense product results with repeatable portrait frames and a clear price stack. Bring over the hierarchy, not the layouts, palette, lettering or icon artwork. In ZAYROVI, yellow remains the purchase/AYWEBs signal; reactions, photography overlays and the Clean mark keep their existing semantic colors.

- Existing infrastructure: `theme`, `rhythm`, `AppScreen`, `SubScreen`, `AppSheet`, shared input/button and async states. The design already has enough color roles; use the existing canvas, surface, line, ink and muted roles rather than introduce a second palette.
- Duplication: orders recreates the stacked header and safe area; editorial headings and rails use local spacing; grid and placeholder geometry are already shared, but present metadata ahead of price. Preserve the grid's measured portrait ratio, swipe/arrival photo, density toggle and aligned rows.
- Density: heavy outlines around secondary content compete with photography. Retain borders that identify controls and the separators needed in forms, sticky bars and dense lists. Selection needs a shape cue in the icon-only tab bar, not another brand color.
- Special contracts: Home full-bleed Hero, approved Publication layouts, immersive Stories/Reels and reaction/follow placement, Lens camera/white sheet, and AYWEBs yellow chrome, verified capture, whole-photo B sheet and checkout reservations are not generic page cards. Preserve these contracts. Use logical alignment for Arabic and explicit limits only in measured components.

### Route inventory (Expo entry points)

- **Router / delegate:** `(tabs)/_layout.tsx`, `(tabs)/social.tsx`, `_layout.tsx`, `panier.tsx`, `reels.tsx`, `z-lens.tsx`.
- **Shared screen:** `(tabs)/account.tsx`, `(tabs)/aywebs.tsx`, `(tabs)/index.tsx`, `+not-found.tsx`, `account/about.tsx`, `account/addresses.tsx`, `account/favorites.tsx`, `account/notifications.tsx`, `account/preferences.tsx`, `account/profile.tsx`, `account/security.tsx`, `aywebs/request.tsx`, `aywebs/store-request.tsx`, `aywebs/stores.tsx`, `catalog.tsx`, `checkout.tsx`, `lens.tsx`, `news/[id].tsx`, `news.tsx`, `product/[id].tsx`, `promotions.tsx`, `stories.tsx`.
- **Specialized surface:** `(tabs)/cart.tsx`, `(tabs)/lens.tsx`, `(tabs)/sonim.tsx`, `aywebs/browser.tsx`, `aywebs/cart.tsx`, `forgot.tsx`, `legal/privacy.tsx`, `legal/terms.tsx`, `orders/[id].tsx`, `orders.tsx`, `publications.tsx`, `reels-viewer.tsx`, `sign-in.tsx`, `sonim-assistant.tsx`.

## Implementation choices

- Stacked pages share the same insets, heading role, wrapping subtitle and back target. Order history now uses that shell without putting its virtualized list inside a scroll view. Checkout choices and the existing cart summary keep their hierarchy when a label wraps.
- Product grids keep the measured two-column and large-photo modes. Current price comes before reference price or stock. Photo pager, placeholder heights, badges, and quick add remain available. `FullBleed` is owned by a wrapper rather than passed to `FlatList`, whose web implementation applied the negative margin twice. The quick-add glyph stays compact; the target is 44 dp.
- On phones the product detail uses a vertical reading order. The sticky buy action has a width cap and the light photo stage has readable controls in dark mode. Social editorial product rails reuse the portrait ratio, studio background and favorite disc without changing the immersive Reel cards.
- Home category navigation now uses a single hairline. The icon-only main navigation gains a small selected mark, not a new glyph or color. Empty/loading surfaces rely on the existing theme surface; warning states keep their semantic border. Field labels name their controls by default. Search and sign-in fields can shrink in narrow RTL rows.
- No new palette, no merchant/checkout rules, no changes to pricing data, the signed AYWEBs selection or scroll-independent product capture, and no changes to Reel reactions/follow.

## Verification scope

Visual review used Expo Web in Chromium at 320×620 (Arabic, dark), 360×800 (French, light), and 390×844 (French, dark). Home, catalog, product, signed-out checkout/sign-in, orders, Social, AYWEBs, lens entry, promotions and publications were sampled, depending on viewport. Catalog and product used local review fixtures injected into the browser only; network-dependent routes without fixtures showed the actual fallback/guest state. This is not verification of a signed-in order, a merchant transaction, a physical keyboard or safe areas on an installed Android/iOS build. Native QA should cover those, device font scaling, and the immersive camera/Reel/merchant surfaces.

### Follow-up: publication and discovery card sizes (19 November)

The new references show two useful scales: roughly 298×430 px for a sponsored showcase photo and 205×296 px in a compact feed row on the 706 px captures. At a 360 dp viewport, the ZAYROVI rendition keeps the established 12 dp page gutter and 8 dp track spacing: 164×236 dp for the two-card showcase, about 107×154 dp for photos in a three-card collection (4 visible on a wide column when enough products exist). The first row deliberately fits whole cards rather than reproducing a clipped peek.

Media publications with three or more products get the compact cards and a 4:3 photo lead. Banner photos with smaller selections, square video, the cinema template and the sponsored duo retain their formats. The Social feed uses the same rail geometry instead of fixed-width cards, shares its post and rail alignment, and uses square/4:5 previews and 4:3 Story covers. Product photos remain contained. These dimensions do not affect camera or fullscreen playback, publication/favorite actions, catalog grids, merchant capture or look selection.

## Recherche, détail et achat — raccordement au CRM

| Surface | Donnée faisant foi / correction Admin |
| --- | --- |
| Boutique mobile | `/api/public/catalog-search` lit `products` publiés en visibilité `CATALOG`, les arrivages enregistrés, les catégories/marques actives et les tailles des variantes actives. La recherche neutralise la casse, les accents et les diacritiques, y compris arabes. Le total et les facettes ne sont pas déduits de la première page. `/products` et `/home` gardent leurs contrats. |
| Budget / stock | Le budget filtre `final_price` en TND, pas le prix marchand. « Stock confirmé » exige une ligne active positive (de la taille demandée s'il y en a une), sans contredire un statut produit épuisé. Un stock non suivi peut encore être commandable selon la fiche ; il n’est pas présenté comme confirmé. |
| Admin → Catalogue | Le détail signale la présence en recherche, les facettes non renseignées et l’inclusion dans « Stock confirmé », sans exposer les quantités aux lecteurs du catalogue. Le prix TND est séparé du prix marchand. La taille, la couleur et le statut d’une variante existante se corrigent sur le même SKU, via le `PUT` déjà autorisé et audité. Les quantités restent dans Inventaire → Stock. |
| Social | Les liens et épingles d’édition continuent de pointer vers les produits canoniques. Les cartes éditoriales reprennent le prix barré uniquement si le CRM l’a saisi au-dessus du prix local. Les gabarits 2/3 colonnes et les contrôles de disponibilité des publications restent en place. |
| Fiche / AYWEBs | La barre d’achat indique la sélection et son état de stock, et marque explicitement la date calculée à partir de la politique comme estimation. AYWEBs sépare le prix publié par le marchand du montant TND : seule la tarification signée pour la sélection et la quantité affichées est qualifiée de devis vérifié. Les contrôles de capture, signature et ajout au panier ne changent pas. |

L’historique est limité à six recherches sur l’appareil et s’efface dans la recherche. L’ouverture d’une fiche depuis la grille conserve l’arrivage, la recherche, les filtres, les pages chargées et le défilement au retour. Le déploiement du serveur doit précéder la distribution du nouvel APK : la recherche utilise une nouvelle route publique ; les clients existants restent compatibles.

Validation navigateur avec un serveur local et le catalogue seed : FR clair à 360 px et AR sombre à 320 px (suggestion, requête, budget y compris chiffres arabes, fiche, retour avec le même défilement et historique). Ce contrôle n’est ni un test sur téléphone natif ni une vérification de stock en production chez un marchand.
