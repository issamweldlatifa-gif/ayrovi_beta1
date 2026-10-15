# Violet au minimum — charte v4.2.0 (2026-10-15)

Planches **avant | après** prises sur les vrais écrans, compilés depuis la branche :
l'avant est l'état v4.1.0 (violet ≈ 10 %), l'après l'état v4.2.0 (repère global ≈ 3 % :
`#571EF6` ≈ 2 % + violet clair `#C5B2F4` ≈ 1 %). Mêmes données des deux côtés (base
en mémoire, produits, promotions et panier de démonstration identiques).

- **Application mobile** : export web Expo (`expo export --platform web`) — les mêmes
  composants React Native que l'APK, rendus par Chromium. Tailles : 360 × 800,
  390 × 844, 412 × 915, 768 × 1024.
- **Site client** : build de production (`npm run build`). Tailles : 360 × 800,
  390 × 844, 768 × 1024, 1440 × 900.

## Planches

| Fichier | Ce qui change |
|---|---|
| `app-1-accueil-boutique-produit.jpg` | Accueil : CTA « Découvrir » du héro violet → encre (le violet ne touche plus la photo). Boutique : segment choisi violet plein → violet clair + filet violet. Fiche produit : « Ajouter au panier » **reste** violet (action principale). |
| `app-2-panier-caisse-promotions.jpg` | Panier : échéance Lens violette → encre ; « Continuer vers la commande » reste violet. Caisse : ville choisie violet plein + texte blanc → violet clair + contour violet + texte noir. Promotions : pastilles de remise et code promo violets → encre. |
| `app-3-connexion-compte-arrivage.jpg` | Connexion : bouton principal et liens importants violets ; liens légaux → encre soulignée. Compte invité : bouton secondaire → encre, l'onglet actif de la barre du bas reste violet. Arrivage choisi : violet clair + filet. |
| `app-4-petit-ecran-360.jpg`, `app-5-tablette-768.jpg` | Même règle sur petit téléphone et tablette, sans changement de mise en page. |
| `site-1-produit-panier-404.jpg` | Fiche produit : bouton « panier » posé sur la photo violet → encre ; « Ajouter au panier » s'affiche enfin en capsule violette (avant : texte nu, voir ci-dessous). Panier : « Continuer vers le paiement » désactivé (ligne à confirmer) = capsule violette atténuée. 404 : « Revenir à l'accueil » violet → encre. |
| `site-2-produit-1440.jpg` | Fiche produit sur bureau. |
| `site-3-barre-du-bas.jpg` | Point « nouveau » de Vision : violet → encre. |

**Défaut préexistant corrigé (site)** : la remise à zéro `.s-root button` (spécificité
0,1,1) annulait le fond de `.s-cta` (0,1,0). Dans le navigateur, le fond calculé
d'« Ajouter au panier » était `rgba(0, 0, 0, 0)` (mesuré sur l'état v4.1.0 ; les deux
règles sont identiques sur `main`) : l'action principale de la boutique n'avait pas son
fond. Surcharge ciblée dans
`client/src/shop/shop.css` (fond, libellé, marge intérieure 16 px) ; le bouton fantôme
n'est pas touché. Fond calculé après correction : `rgb(87, 30, 246)`, libellé blanc.

## Mesure (pixels, captures « UI seule », photos masquées)

Part des pixels violets (`#571EF6` et ses variantes d'état : survol, accent sombre,
bouton désactivé) et violet clair (`#C5B2F4`), moyenne de toutes les captures. C'est un
**indicateur visuel**, pas une mesure d'usage ; le 3 % est un repère pour l'ensemble de
l'application, pas un quota par écran — aucun violet n'a été ajouté pour l'atteindre.

| Surface | Captures | Violet avant → après | Violet clair avant → après | Total avant → après |
|---|---|---|---|---|
| Application mobile | 86 | 1,78 % → 1,29 % | 0,02 % → 0,16 % | 1,80 % → 1,45 % |
| Site client | 40 | 0,54 % → 0,65 % | 0,00 % → 0,70 % | 0,54 % → 1,35 % |

Côté site, la hausse vient **uniquement** du défaut corrigé : « Ajouter au panier » et
« Continuer vers le paiement » (désactivé, 35 % d'opacité, compté comme violet clair par
la mesure) retrouvent leur fond d'action principale. Toutes les autres scènes du site
baissent ou restent à zéro (accueil, catalogue, barre du bas, 404, photo produit).

Écran le plus violet après : 360 × 800, connexion (app, 5,46 %) et panier (site,
4,93 %) — un seul bouton principal par écran ; en dessous du plafond de sécurité par
écran `accentAreaLimit` (10 %) utilisé par les audits CI.
