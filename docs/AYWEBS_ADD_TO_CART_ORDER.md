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
