# Publication : cinq modèles supplémentaires d’après les références fournies

6 novembre 2026. Ajout aux six identifiants existants, sans suppression des compositions précédemment choisies et sans nouvelle page Publication.

## Modèles

| Identifiant CRM/API | Composition |
|---|---|
| `social_mosaic` | Identité du véritable éditeur, description au-dessus, album adaptatif. Deux photos : deux carrés ; trois : une rangée ; quatre : 2 + 2 ; cinq ou plus : deux grands carrés puis trois plus petits. Dernière vignette : `+N` des photos réellement cachées. |
| `shoppable` | Description, grande image dans son ratio original, puis deux colonnes de cartes de produits catalogue. Image produit portrait, marque quand disponible, nom, prix/currency réels, cœur fonctionnel et ouverture de la fiche existante. |
| `caption_photo` | Identité, description avant une grande photo pleine largeur dans son ratio original, sans superposer le texte à la photo. |
| `social_strip` | Description au-dessus d’une rangée de trois carrés au maximum ; la dernière image indique le nombre réel de photos restantes. |
| `social_pair` | Description puis exactement deux carrés côte à côte, séparés par 2 pt. Hauteur différente de l’image éditoriale et du mosaïque, comme dans la référence. |

Les albums et la grande photo sociale utilisent toute la largeur disponible ; le texte conserve ses marges de lecture. La géométrie d’album est partagée entre le CRM et le rendu natif dans `shared/publicationLayouts.ts`. Les images ne sont pas étirées : recadrage carré uniquement pour les tuiles, ratio d’origine pour la grande photo, `contain` pour les produits et le plein écran.

La description des nouveaux modèles précède toujours les médias, y compris dans la valeur persistée `description_position`. Le titre administratif n’est pas répété au-dessus de cette description ; il reste le libellé de secours si elle est vide. Les anciennes compositions conservent leur comportement. Une description courte n’est plus coupée sans bouton d’expansion sur les petits écrans.

La normalisation serveur, le parseur mobile, le sélecteur CRM et sa prévisualisation acceptent les cinq nouveaux identifiants. Les contraintes de quantité sont validées : album/rangée 2–10, duo exactement 2, grande photo et shopping une image. Le type vidéo reste incompatible avec ces modèles de photos. Les nouveaux modèles ne sont pas ajoutés au sélecteur Reels.

## Images fournies et administration

Neuf photos originales jointes par l’utilisateur sont conservées dans `assets/media/publications/style-references/` : six looks, la campagne rouge et les deux chaussures. Aucun remplacement par une image générée, aucune suppression des inscriptions présentes sur les originaux.

Le CRM propose ces photos sous **Photos de référence fournies**. Un clic les ajoute aux médias ordonnés du brouillon et renseigne la couverture si elle est vide. Les maxima du modèle sont respectés. L’upload ordonné existant renseigne également sa première image comme couverture lorsque celle-ci manque.

**Aucune publication n’est créée automatiquement.** Les photos de chaussures ne deviennent pas des produits factices ; les prix, produits associés, stocks et favoris continuent d’utiliser le catalogue et les services existants. La prévisualisation informe lorsqu’aucun produit catalogue n’est résolu au lieu d’inventer une carte.

## Suivi et menus

- Suivre : capsule à bordure fine, fond transparent, cible tactile de 44 pt, largeur minimale 88 pt.
- Réponse du serveur confirmée avant de montrer **✓ Suivi** ; une erreur ne transforme pas le bouton en suivi fictif. Retour à Suivre via la même action persistante existante.
- Les invités utilisent la feuille d’authentification Publication, y compris pour les cœurs produit.
- Suppression du bouton à trois points et de son panneau dans le post. Pas de menu de remplacement ajouté. Sauvegarde, commentaires et partage directs restent disponibles.
- Favoris produit : réutilisation du hook et des API catalogue existants, une lecture pour le feed, remise à zéro lorsqu’on change de propriétaire de session. Pas de nouveau Product Core ou Cart Core.

## Agrandissement

Un clic sur n’importe quelle tuile ouvre **directement la photo correspondante** dans la galerie noire du même post. Le tap sur `+N` ouvre la dernière photo visible puis permet de parcourir les suivantes dans leur ordre réel. Le swipe horizontal change de photo ; le geste vertical de fermeture retourne au feed. Le lecteur de texte séparé demeure disponible depuis les anciennes actions de lecture.

Le démarrage direct présente un seul modal natif, pas deux modals simultanés qui pourraient entrer en concurrence sur iOS. Le fond du conteneur est noir, et la couche `AppImage` plein écran est transparente : elle ne laisse plus sa plaque grise/blanche couvrir les bandes noires autour d’une photo en `contain`. Même règle sur son secours en cas d’échec. La barre d’état du plein écran utilise le texte clair. Les sorties matérielle et d’accessibilité restent câblées.

## Validation réalisée

- Racine : **3325 tests réussis**, 266 fichiers, 17 tests ignorés préexistants (`--testTimeout=15000`, sans modifier la configuration du dépôt).
- Mobile : **1138 tests réussis**, 114 fichiers.
- UI React Native : **226 tests réussis**, 39 suites, dont ouverture directe au bon index, un seul modal visible, fond d’image transparent, proportions des cartes produit, favoris invités et absence des trois points.
- TypeScript mobile et racine/client, build client/serveur, inventaire de sources, contrat d’icônes/identité, jetons et contrôle de diff : vérifiés.
- Navigateur tactile : les **cinq modèles sur 320, 360, 390, 430 et 768 px**, avec les photos originales fournies. Contrôle des tuiles carrées, du compteur caché réel, de l’encadrement transparent de suivi, du bon index plein écran, du fond noir et du swipe réel. Aucune erreur de page.
- Inspection visuelle des captures réelles de rendu : le premier contrôle a révélé une hauteur de 56 pt héritée de la présentation produit compacte. La tuile shopping utilise désormais des styles séparés, une image en 3/4 et un bloc texte sans `flex` contraignant ; un contrôle navigateur explicite vérifie ce ratio et la présence des deux marques catalogue.
- Vrai CRM local : cinq brouillons distincts créés dans l’interface avec le sélecteur de modèles et les photos de référence, enregistrés puis relus via l’API. Modèle, ordre des médias, CTA et description au-dessus persistés ; invisibilité publique des brouillons vérifiée. Les cinq brouillons de QA ont ensuite été supprimés.

Les cartes produit, prix et mentions d’éditeur des scénarios navigateur contrôlés sont des **fixtures de QA**, pas des produits ou publications mis en ligne. Les originaux restent disponibles pour l’auteur via le CRM. Les captures sont du **rendu web réel d’Expo**, pas une compilation photographiée sur Android ou iOS : aucun test sur téléphone physique n’est revendiqué. Le workflow Android doit générer un nouvel APK après le push, et la nouvelle application doit être installée pour voir le changement. Les images de référence sont servies par la version correspondante du site/API.

Les correctifs Lens de la livraison précédente sont conservés sans changement de fournisseur vision. Cette livraison ne prétend pas activer un fournisseur non configuré ni démontrer sa précision. Scripts, logs et captures temporaires restent dans `.cache/`, hors Git.
