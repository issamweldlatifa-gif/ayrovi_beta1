# Publication — application des compositions choisies / Lens — pagination

6 novembre 2026. Ce document remplace les choix visuels précédents de cette journée pour les éléments concernés. Il décrit du code appliqué et vérifié, pas les images de concept.

## Exigences appliquées

- Les **deux rangées de catégories et modes ont été supprimées sans remplacement**. Aucun nouvel onglet, menu de filtres ou bandeau équivalent n'a été ajouté.
- Leurs états de requête ont également été retirés : une ancienne catégorie mémorisée ne continue pas de filtrer silencieusement les publications. La recherche explicite existante reste disponible à la demande.
- En-tête blanc de 52 pt, titre véritablement centré avec groupes latéraux de largeur égale. Plus de grande capsule de titre. Cibles de 44 pt conservées.
- Plus de grosses cartes arrondies imbriquées : marges latérales régulières, séparateur léger, très petit rayon du média, pas de cadre autour de tout le post.
- Hiérarchie typographique réduite et homogène. Les titres principaux ne sont plus limités à trois lignes dans une colonne étroite. Le texte long conserve son action Voir plus / Voir moins.
- Actions sociales cohérentes dans une même famille Ionicons, taille optique partagée **22 pt**, sans grande capsule de réactions. Cœur actif et marque-page enregistré ont un état rempli réel.
- Avatar **36 pt**, mot-symbole officiel sans traverse du A conservé, Suivre séparé du nom, alignement corrigé en français et en arabe.
- Vérification : glyph **Material Icons `verified` de 16 pt**, au lieu de la rosette dessinée manuellement. Affichage uniquement lorsque `publisherOfficial` est vrai dans les données reçues. Cela ne revendique aucune certification externe nouvelle.
- Un autre éditeur sans avatar n'emprunte plus le logo ZAYROVI : il affiche son initiale. Le logo officiel de secours est réservé au nom de la marque.
- Les mentions « vues uniques / partages uniques » sont retirées du post. Les événements et statistiques réels sont toujours conservés pour le CRM.

## Compositions et contrôle CRM

Les identifiants de modèles restent compatibles avec les publications et brouillons existants ; aucune migration destructrice ni nouvelle section de navigation.

| Modèle | Composition appliquée |
|---|---|
| `photo` | Grande photo éditoriale, texte lisible, actions discrètes |
| `split` | Photo pleine largeur puis texte pleine largeur dans un encart léger ; plus de colonne qui coupe le titre |
| `carousel` | Vrai pager, miniatures de 48 pt, aperçu compact des produits catalogue réellement associés |
| `campaign` | Média puis encart de texte/CTA ; plus de texte superposé risquant de masquer l'image |
| `auto`, `video`, collection | Compatibilité conservée avec contenus, lecteur et interactions existants |

Les libellés et la **prévisualisation CRM** ont été mis à jour pour représenter ces compositions, et non l'ancien split étroit. La taxonomie historique reste stockée pour compatibilité ; le CRM précise qu'elle ne crée plus de filtres dans le fil public.

La ligne produit de Publication est uniquement une présentation compacte des données `LinkedProduct` existantes. Elle ouvre le parcours produit existant, ne calcule aucun prix et ne crée pas de nouveau panier. Aucune ligne n'est créée en l'absence de produit réel lié. Les autres usages de `LinkedProductCard` (Reels/Stories) ne sont pas modifiés.

Les CTA restent du texte et des boutons interactifs issus du CRM, pas du texte incorporé à une image. Sauvegarde, suivi, commentaires, partage, authentification des invités, lecteur minimal et fermeture tactile sont conservés.

## Lens : nouvelle demande prioritaire

Cette demande remplace le compteur visible choisi précédemment **dans les cartes de résultats** :

- Plus de texte visible `1/2`, `2/2`, etc. dans ces cartes.
- Point actif allongé à **14 × 4 pt**, autres points **4 × 4 pt**.
- L'état suit les éléments réellement visibles du pager, pas un compteur simulé.
- Au maximum sept points visibles pour ne pas couvrir une longue galerie ; la fenêtre suit la page active.
- Aucun indicateur pour une seule photo. Le compteur numérique est conservé comme libellé non visuel pour les lecteurs d'écran.
- Les replis/proxies d'une même image ne deviennent pas des pages de galerie.
- Retrait des hauteurs minimales inutiles dans les textes des cartes Lens, qui laissaient de grands trous quand le prix était absent ou le titre court.
- Bords extérieurs sans marge, séparation centrale de 2 pt et absence de « Prix non publié » conservés.
- Les compteurs de la visionneuse plein écran ne sont pas confondus avec cette demande spécifique aux cartes.

## Vérifications

| Contrôle | Résultat |
|---|---|
| Tests racine | **3316 réussis**, 17 ignorés préexistants, 265 fichiers |
| Tests logique/contrats mobile | **1138 réussis**, 114 fichiers |
| Composants React Native | **218 réussis**, 39 suites |
| Total réussi | **4672 tests** |
| TypeScript racine/client et mobile | OK |
| Design, inventaire, icônes, identité, jetons | OK |
| Invariants de coque Android | 45 vérifiés, aucune rupture |
| Build client + serveur / diff check | OK |

Précisions : un premier lancement parallèle a dépassé le délai de 5 secondes dans deux tests de fixtures Amazon sans rapport avec cette modification. La suite racine complète a été rejouée seule avec `--testTimeout=15000` et a réussi ; aucun délai global du dépôt n'a été modifié. Jest complet conserve le `--forceExit` utilisé auparavant ; les tests ciblés de galerie ont aussi réussi avec arrêt normal. Le test de galerie longue simule les événements natifs layout/contenu/scroll, y compris la virtualisation au-delà des dix premières images.

### Revue visuelle et fonctionnelle

- **20 compositions** testées en navigateur tactile : photo, split, campagne et carousel sur **320, 360, 390, 430 et 768 px**. Vérification de l'absence des deux barres, du centrage, de l'absence de débordement, des miniatures, du lien produit, des gestes de fermeture et de la feuille d'authentification invitée. Aucune erreur de page, aucune interaction d'engagement invité envoyée dans ces scénarios contrôlés.
- **Trois tailles Lens** : pagination réellement déplacée, ancien point redevenu rond, nouveau point allongé, aucun compteur numérique visible.
- **Vrai feed local français et arabe à 390 px**, sans interception réseau et avec fuseau Africa/Tunis, inspecté visuellement : contenu réel existant, pas une maquette générée.
- **Vrai CRM** : création d'un brouillon temporaire avec modèle `split` et CTA, enregistrement/relecture, vérification qu'il n'est pas public, puis suppression du brouillon de QA. Aucune erreur de page.
- Les scénarios contrôlés de templates/produits utilisent des fixtures identifiées comme telles ; ils ne démontrent pas le stock réel d'un produit fictif de test.

L'inventaire de sources généré était périmé et bloquait le check CI du précédent head ; il a été régénéré avec `npm run design:inventory`, puis `design:check` a réussi. Cela ne constitue pas une affirmation que toutes les futures étapes GitHub sont déjà terminées.

## Limites explicites

- Ces captures de validation proviennent du **rendu web réel de l'application Expo**, pas d'un téléphone Android ou iOS.
- Aucun test physique Android/iOS ni APK/IPA compilé localement n'est revendiqué. Le workflow Android existant doit reconstruire le nouvel APK après le push ; l'ancien APK installé n'intègre pas ces changements tant qu'il n'est pas mis à jour.
- La réserve de la livraison Lens précédente reste valable : le fournisseur vision actif n'est pas configuré dans ce sandbox. La pagination et cette refonte n'activent pas le fournisseur et ne prouvent pas la précision d'un repérage sur une vraie scène multi-produits.
- Les logs, captures et scripts temporaires restent dans `.cache/`, hors Git.
