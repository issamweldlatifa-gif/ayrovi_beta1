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

## Console d'administration (2026-10-16)

Même règle v4.2.0 appliquée au back-office (modèle A « Console opérationnelle »), en
modifiant uniquement les rôles existants : `client/src/styles/admin-console.css`
(rôles `--bo-*`) et `client/src/admin/admin.css` (zéro littéral, tokens seulement).
Aucun nouveau code hexadécimal ; les rôles d'accent de la console pointent désormais sur
l'identité (`--ay-e-action-hover`, `--ay-e-on-action`, `--ay-e-accent-soft`).

Avant = build du commit `78f3258`, après = build de cette branche ; mêmes données des deux
côtés (base neuve, mêmes migrations, mêmes 5 commandes de démonstration). Captures à
1440 × 900 (les 52 sections de la navigation + connexion), états interactifs, thème sombre,
390 × 844 et 768 × 1024.

| Fichier | Ce qui change |
|---|---|
| `admin-1-contenu.jpg` | Mon magazine : grand bandeau dégradé violet → encre, zone de dépôt grise. Agent magazine : en-tête dégradé violet, pastilles et compteur violets → encre. Social et Hero : l'onglet ou la langue choisis ne sont plus un bouton violet plein mais en encre — le violet reste à « Ajouter » / « Publier ». « Enregistrer les réglages » du Hero devient secondaire. |
| `admin-2-commerce.jpg` | Prix & taux : « Actualiser les taux maintenant » et « Calculer » deviennent secondaires, « Enregistrer » reste violet. Promotions : « Créer la règle » secondaire, « Enregistrer la grille » reste violet. Clients : onglet choisi en encre. Commandes : le filtre choisi garde un contour violet (option choisie). |
| `admin-3-etats.jpg` | Rail : la ligne active n'a plus de fond lavande (`#EEE9FE`) — fond neutre + filet violet `#571EF6`. Files « À traiter » : filet et icônes violets → encre (vide = gris, en attente = encre). Fiche commande : étape en cours en `#571EF6` avec un anneau violet clair. Recherche : terme trouvé surligné en violet clair `#C5B2F4`, texte noir. Champ actif : contour violet + halo violet clair. |
| `admin-4-sombre-telephone.jpg` | Thème sombre : la ligne active du rail n'est plus violet foncé (`#1C1239`) ; les contours choisis passent au violet « sur sombre » `#926DF9` (le violet plein n'y fait que 2,4:1). Les pastilles posées sur les bandeaux sombres de l'agent restent lisibles (blanc / noir fixes). Téléphone 390 : même règle, sans changement de mise en page. |

Le violet qui reste, vérifié élément par élément dans le DOM rendu (styles calculés) :
le bouton principal de chaque écran, le filet de l'onglet de service actif, le repère de
l'entrée active du rail, le filet de l'onglet actif du studio interface, le contour du
filtre de commandes choisi, l'étape en cours et le focus (contour violet + halo violet
clair). Dans le code seulement (état non capturé) : la ligne de dépôt d'un
glisser-déposer et le contour du magasin choisi (Arrivals CRM). Restent aussi, parce que ce sont des
**aperçus de données** (la couleur configurée de la vitrine), les pastilles de thème et
l'aperçu CTA de « Développement & design », l'aperçu de la section LENS et l'aperçu
d'icône du studio interface.

| Console (1440 × 900, 53 captures, UI seule) | Violet avant → après | Violet clair avant → après | Total avant → après |
|---|---|---|---|
| Moyenne | 0,59 % → 0,31 % | 0,57 % → 0,01 % | 1,15 % → 0,32 % |

Mesure : teinte 245–290°, saturation ≥ 0,30 (les gris légèrement violacés hérités ne
sont pas comptés). Écrans les plus touchés : Mon magazine 11,16 % → 0,36 %, Agent
magazine 2,77 % → 0,03 %, Prix & taux 1,55 % → 0,33 %, Promotions 1,62 % → 0,48 %.
Écran le plus violet après : « Développement & design » (1,59 %, aperçus de palette).

**Laissé tel quel, à décider** : la fiche commande peut montrer deux boutons principaux
selon l'état (« Valider le virement » / « Émettre la facture » / « Enregistrer la
livraison ») — paiement et commandes, non modifiés sans demande. « Create Arrival »
apparaît deux fois quand la liste est vide (même action).

**Défauts préexistants observés pendant ce lot** (hors violet, corrigés ensuite dans des
commits séparés — voir « Fixed » du CHANGELOG) :
- sous 900 px de large, l'ombre du tiroir fermé (`0 0 0 100vmax`) voilait tout l'écran de
  la console — c'est le voile gris des captures « Téléphone 390 » de `admin-4`, prises avant
  la correction. **Corrigé** : le voile n'existe plus que tiroir ouvert ;
- en thème sombre, la pastille de domaine choisie était blanche sur blanc. **Corrigé** : son
  texte suit le thème (`--bo-card`), comme le bouton-bascule pressé ;
- en thème sombre, la carte « Arrivages Standard actifs » restait blanche — c'est la carte
  claire de « Thème sombre : tableau de bord » dans `admin-4`, prise avant la correction.
  **Corrigé** : en sombre, elle prend l'encre des barres, comme « Arrivages Express actifs ».
