# AYWEBS — ADD TO CART : ORDRE D'INGÉNIERIE PERMANENT (proxy-shopping)

> أمر هندسي دائم من المالك (2026-10-03). هذا الملف هو المرجع لأي تعديل مستقبلي على
> مسار الإضافة للسلة في AYWEBs. أي Pull Request يخالفه يُرفض.
> Ordre permanent du propriétaire — toute évolution du flow d'ajout au panier AYWEBs
> doit respecter ce document. Logique cible : proxy-shopping / shopping agent (type Buyee).

## Principe fondateur

**Add to Cart = une vraie opération d'ajout au panier AYWEBs. Jamais l'ouverture d'une
nouvelle page/fiche produit.** Le sélecteur de variantes fait partie de cette opération.
Le client ne quitte jamais le contexte du magasin pendant l'ajout.

## Flow canonique (le seul autorisé)

```
STORE (carte avec logo)
  → PRODUCT (dans l'expérience du marchand)
  → ADD TO CART (bouton injecté, état de chargement)
  → VARIANT SELECTOR (bottom sheet PAR-DESSUS la page marchand, si options)
  → DONE / CONFIRM
  → CART ITEM CRÉÉ (réel, côté serveur)
  → RESTER DANS LE STORE
  → CONTINUE SHOPPING ou CART
  → CHECKOUT (Customer/Login → Address → Shipping → Payment → Order Review → Confirmation)
```

## Interdictions absolues

- Pas de grande Product Card overlay après Add to Cart.
- Pas de redirect, pas de sortie du magasin, pas de démarrage direct du checkout.
- Aucune perte de : Store Context, Product Context, Product URL, Product Identity,
  Variant Selection, Quantity, Price, Currency, Cart State — même après retour au magasin.
- Pas de chemin `Add to Cart → Large Product Card → Another Product Page → Store`.
- Pas de recalcul du prix à chaque affichage : le prix est lié au Cart Item
  (stocké côté serveur au moment de l'ajout, §45).
- Libellé du bouton : **« Add to Cart »** — « Add to AYWEBS » est supprimé, et aucun
  bouton différent/parallèle ne doit être créé.

## Product Context capturé au moment de l'ajout

Store · Product URL · Product ID (si présent) · Product name · Main image ·
Product images · Current price · Currency · Availability · Quantity · Variants/Options.

## Variant Selector (bottom sheet au-dessus de l'expérience marchand)

- Groupes : Select Size / Select Color / Select Type / Model / Material / Volume… + Quantity − 1 +.
- Validation : `required variant → selected` · `optional → selected ou défaut` ·
  `unavailable → disabled` (jamais sélectionnable). Impossible d'ajouter sans les
  variantes requises ; pas de substitution silencieuse (§30).
- Actions : **Done / Confirm** → ajout réel au panier.

## Feuille de choix — langage du client (2026-10-23)

La feuille est un **sélecteur d'article**, pas un rapport de lecture. Ordre imposé :

1. Image du produit (92 × 112) + titre + prix **tel que la page l'écrit** (le montant
   et sa note séparément : « 12,95 € » / « TVA incluse »).
2. Un champ **replié** par groupe publié — Taille, Couleur, Volume, Matière, Modèle,
   Type (libellé traduit) sinon le nom publié — qui s'ouvre sur ses valeurs ; chaque
   valeur affiche son prix publié, et « indisponible » quand la page le dit (la valeur
   n'est alors jamais sélectionnable). Un seul champ ouvert à la fois.
3. Quantité − 1 + (1…99).
4. **Un** bouton « Add to Cart » pleine largeur, avec état de chargement.
5. Vue « Article ajouté » : quantité, prix source, total TND, rattachement, puis
   **Cart** ou **Continue Shopping**.

La feuille s'ouvre **sur la combinaison que la page affiche** (ASIN Amazon, ou
`variantGroups[].selected` pour une boutique du catalogue : Zalando présélectionne sa
taille). Aucun appel serveur à l'ouverture, aucun au changement de couleur : **la
lecture est celle du bouton Add**. Elle réutilise la capture qui a ouvert la feuille
quand elle porte le prix ferme et l'état de cette combinaison ; sinon elle lit **une
seule fois** la page du choix, puis `product/resolve` reçoit cette capture. Le serveur
reste le seul juge du prix, du stock et de l'ajout.

Aucune ligne technique n'est visible : ni journal de lecture, ni phases, ni compte à
rebours, ni « lecture serveur », ni classification de page. Une erreur réelle s'écrit
en clair, une seule fois.

## Prix affiché dans la feuille (2026-10-23)

Le prix qui compte est **en dinars, calculé par le serveur** — jamais en devise
marchande seule, jamais calculé par l'application.

- `POST /product/resolve` publie `variant_quotes` : pour chaque valeur publiée
  (couleur, taille, volume…), le montant marchand lu sur la page **et** son devis
  en dinars (`calculatePrice`). Un « à partir de » n'obtient aucun montant ferme,
  une valeur sans prix n'en reçoit aucun, et sans preuve de prix + devise aucun
  devis n'est publié.
- La feuille ouvre avec **une seule** lecture (la capture) qui rapporte le devis
  de la combinaison affichée et tous les devis par valeur. Changer de couleur, de
  taille ou de quantité ne déclenche **aucun** appel : le prix en dinars et le
  total estimé suivent le choix. Le montant marchand reste visible en second.
- Deux valeurs en désaccord sur le montant ⇒ aucun prix. Le silence du marchand
  sur le stock reste « inconnu » et s'écrit « Stock vérifié au moment de l'ajout ».
- Ajout : jugement sur la page décrite par la capture ; si le choix n'est pas
  prouvé, lecture des pages des valeurs choisies (deux au plus, ASIN du twister)
  puis ajout. Sinon, refus **expliqué** avec le code du serveur traduit.

## Cart Item (après Done/Confirm)

Store · Product · Product URL · Product ID · Image · Product Name ·
Selected Variants · Quantity · Unit Price · Currency · Availability.

## Après l'ajout réussi

Le client reste sur la page du magasin (l'overlay confirme puis se ferme) avec deux
sorties seulement : **Continue Shopping** ou **Cart**.

## Panier AYWEBs

Chaque ligne affiche : Store name · Product thumbnail · Product name ·
Selected Size/Color/Type · Quantity · Unit price · Subtotal calculé.
Prix liés au Cart Item, jamais recalculés différemment d'un affichage à l'autre.

## Implémentation de référence (état actuel du dépôt)

- Android natif : `android/app/src/main/java/app/ayrovi/mobile/AyWebsBrowseActivity.java`
  (bouton injecté `aywebs-capture-btn` « Add to Cart » + état chargement ; feuille de
  variantes `dialog_aywebs_variant_sheet.xml` en Dialog par-dessus le WebView, page
  marchand jamais rechargée ; variantes indisponibles désactivées via
  `isValueUnavailable` uniquement sur preuve `variants[].available` ; vue « ajouté »
  avec Continue Shopping = `dialog.dismiss()` / Checkout = deep link panier).
- Serveur : `POST /api/v1/aywebs/product/resolve` (extraction du Product Context) puis
  `POST /api/v1/aywebs/cart/items` (création réelle du Cart Item, prix serveur).
- Web : hôte `client/src/features/aywebs/AyWebsScreen.tsx` (vues home|store|product|
  browser|orders|request ; plus aucune vue « capture », ni entrée lien-collé, ni
  téléversement d'image) ; checkout avec adresse de livraison (§21).
