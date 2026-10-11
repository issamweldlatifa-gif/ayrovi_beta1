# Contenu « Shoppable » — Reels, Stories, Publications

Statut : **implémenté et testé en local, non poussé** (en attente de validation).

## Principe

- Source unique : la table `products` (catalogue existant). Les contenus ne stockent
  que `content_mode` et `product_id`. Nom, image, prix et stock sont lus à chaque requête.
- `normal` : aucune carte, aucun produit (un produit stocké est effacé à l'enregistrement).
- `shoppable` : produit obligatoire, même pour un brouillon. Produit vendable = statut
  `ACTIVE` et prix final > 0.
- Produit devenu inactif, archivé ou supprimé après publication : `product: null` côté
  public. Le contenu reste, sans carte ni lien mort. Pour une story, `product_id` est aussi
  coupé pour que le CTA existant n'ouvre pas une page morte.

## Migration (additive, idempotente)

`src/db/database.ts`, via `ensureColumn` :

| Table | Colonnes ajoutées |
|---|---|
| `reels` | `content_mode TEXT NOT NULL DEFAULT 'normal'`, `product_id TEXT REFERENCES products(id) ON DELETE SET NULL` |
| `publications` | `content_mode` (idem), `product_id` (idem) |
| `stories` | `content_mode` seulement (`product_id` existait déjà) |

Les lignes existantes deviennent `normal` avec `product_id = NULL`. Aucune donnée supprimée.

## Fichiers

**Serveur**
- `src/services/shoppableContent.ts` (nouveau) : règles pures, carte publique, jointure.
- `src/db/database.ts` : migration.
- `src/admin/routes.ts` : création et mise à jour des publications et reels (refus 400 avec `code`),
  validation des stories dans `validateResourcePayload`.
- `src/public/routes.ts` : `/social/reels`, `/social/publications`, `/stories` joignent le
  catalogue ; nouvelle route `GET /products/:id` (produit actif seulement, 404 sinon).

**Admin**
- `client/src/admin/ProductIntegration.tsx` (nouveau) : bloc « Product Integration / ربط المنتج »,
  mode, recherche (nom, SKU, référence via `/catalogue/products`), choix, changer, délier,
  aperçu de la carte sur téléphone.
- `client/src/admin/SocialAdminPage.tsx` : bloc dans les formulaires Publication et Reel.
- `client/src/admin/StoriesStudio.tsx` : bloc dans le formulaire Story.

**Mobile**
- `apps/mobile/src/api/linkedProduct.ts` (nouveau) : type et parseur ; `null` si incomplet.
- `apps/mobile/src/features/shopping/LinkedProductCard.tsx` (nouveau) : carte `row`
  (publications, stories) et `overlay` (reels plein écran). « Découvrir » ouvre `/product/[id]`.
- `apps/mobile/src/features/social/ReelCard.tsx`, `apps/mobile/app/publications.tsx`,
  `apps/mobile/src/features/social/StoryViewer.tsx` : intégration.
- `apps/mobile/src/api/social.ts`, `apps/mobile/src/api/sections.ts` : champ `product`.
- `apps/mobile/src/api/catalog.ts`, `apps/mobile/app/product/[id].tsx` : la fiche produit se lit
  par identifiant. Avant, elle cherchait dans les 50 premiers produits, donc un produit lié
  plus loin ouvrait une page vide.
- `apps/mobile/src/i18n/fr.ts`, `ar.ts` : `shopping.discover`, `shopping.unavailable`.

## Tests

| Fichier | Couvre |
|---|---|
| `tests/shoppable-content.test.ts` (18) | règles pures ; refus sans produit et avec produit inactif ; carte publique ; produit désactivé après coup ; story sans lien mort ; fiche produit publique ; migration |
| `tests/admin-product-integration-ui.test.tsx` (6) | bloc admin : mode, recherche filtrée, choix, édition, délier, produit supprimé, aperçu |
| `apps/mobile/tests/ui/linkedProduct.ui.test.tsx` (9) | carte : rendu, navigation interne, indisponible, parseur |

Résultats : typecheck racine 0 ; vitest racine 190 fichiers / 2 643 tests ; mobile tsc 0 ;
jest 62/62 ; vitest mobile 488/488.

## Non vérifié (pas d'appareil ni de serveur en direct)

- Rendu sur petit et grand écran, absence de chevauchement, carte Reel au-dessus de la barre
  d'onglets, viewer Story.
- Parcours admin en navigateur réel.
- Saisie réelle d'un produit avec ses variantes SKU.

## Décisions à confirmer

1. Prix affiché en `TND` (devise de la fiche produit actuelle), pas la devise d'origine.
2. Rupture de stock : la carte reste visible avec « Actuellement indisponible » et reste cliquable.
3. Modifier un contenu shoppable dont le produit est devenu inactif est refusé tant qu'on ne choisit
   pas un autre produit ou qu'on ne repasse pas en normal.
4. Le sélecteur utilise les droits du catalogue : un admin sans lecture catalogue voit « Recherche impossible ».
5. Le formulaire Social n'a pas de champ de programmation : « publier » ou « brouillon » seulement,
   comme aujourd'hui. Aucune programmation n'a été ajoutée.
