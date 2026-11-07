# Publication : livraison des neuf mises à jour

7 novembre 2026. Exécution autorisée par le propriétaire, y compris les décisions de détail et le push. Le catalogue réel et ses 100 unités nouvelles ne sont pas recréés ni réapprovisionnés.

## 1. Présentation adaptative et non destructive

`shared/publicationPresentation.ts` fournit les règles communes au CRM et au rendu mobile :

- Dimensions connues → ratio borné entre 0,65 et 1,8 pour éviter les cadres extrêmes.
- Nature **produit** → affichage entier par défaut ; **scène** → remplissage par défaut. Un choix explicite de l’éditeur reste prioritaire.
- Les rangées de collage utilisent les dimensions de leurs médias pour leur proportion commune, avec conservation des indices de galerie.
- Réglages par occurrence : `purpose`, `fit`, `focalX`, `focalY`, `scale`, `width`, `height`. Ils ne modifient pas l’image du catalogue ni son original.
- Point focal et taille visuelle réglables dans le CRM, aperçu de composition et aperçu du média. Le zoom manuel peut recadrer : ce choix reste celui de l’éditeur, il n’est pas imposé automatiquement au produit.
- Dimensions extraites des fichiers importés et des médias chargés dans l’éditeur. Pas de dimensions inventées pour les liens illisibles.
- Originaux d’image importés conservés séparément dans `data/media-originals/`, **hors Git et hors stockage public**, avec accès CRM authentifié. Le média de diffusion reste normalisé. Vérification navigateur : original JPEG relu octet pour octet, accès anonyme refusé.

Une migration **de métadonnées uniquement**, `publication_media_presentation_v1`, ajoute les dimensions connues des photos fournies aux publications qui les utilisent. Elle préserve les réglages déjà renseignés, les autres photos, les textes, l’ordre de publication et les données commerciales. Elle ne réexécute pas la migration d’ouverture du stock.

Il ne s’agit pas de segmentation IA, suppression automatique de fond ou détection garantie de l’objet. Le système combine géométrie réelle, choix produit/scène, réglages et aperçu.

## 2. Import vidéo et contenu mixte

L’éditeur accepte jusqu’à dix médias ordonnés, images et vidéos, avec sélection du type pour les liens, réorganisation et suppression d’une occurrence. Les contraintes restent explicites : duo exactement deux médias, photo sociale/shopping un média, modèle vidéo une vidéo, carousel au moins deux médias.

- Images : JPEG, PNG, WebP, GIF.
- Conteneurs vidéo acceptés à l’import : MP4, WebM, Ogg, MOV, M4V.
- Limite de fichier : **10 Mo** ; contrôle préalable des fichiers vidéo importés : **5 minutes**.
- Décodeur du navigateur sollicité avant l’upload : fichier illisible refusé avec indication de conversion. Couverture extraite d’une vraie image de la vidéo, pas d’une illustration inventée.
- **MP4 H.264/AAC recommandé** pour la meilleure interopérabilité. L’extension seule ne garantit pas le codec ; aucun transcodage serveur universel n’est revendiqué. Le navigateur d’administration peut refuser un codec qu’il ne sait pas décoder, et les plateformes mobiles peuvent avoir des capacités différentes. Les liens externes nécessitent leur couverture et une vérification de lecture ; ils ne passent pas par le contrôle de durée du fichier local.
- Serveur : limites de taille et signature de conteneur conservées, droits CRM exigés. La limite JSON de 15 Mo concerne uniquement l’endpoint admin d’upload pour permettre le transport base64 des 10 Mo, pas toutes les API.
- Progression par fichier, erreurs affichées, médias déjà importés conservés lors d’un échec ; sauvegarde et fermeture du formulaire bloquées pendant l’import.
- Miniatures des vidéos dans les collages avec indication de lecture ; vraie lecture dans le lecteur. Les albums à défilement lisent uniquement la vidéo active.

Un défaut réel trouvé par le navigateur a été corrigé : la sélection du post vidéo actif ne reconnaissait que `post_type=video`, pas une vidéo dans un carousel. Elle reconnaît maintenant les médias mixtes. Le lecteur déjà chargé est conservé et mis en pause lorsqu’il devient inactif, au lieu de remettre sa source à zéro lors de l’ouverture des commentaires. Lecture muette initiale, commandes pause/son et interruption hors écran/arrière-plan conservées.

## 3. Description repliée

Mesure du texte à la largeur et à la taille typographique effectives, plutôt qu’un seuil arbitraire de caractères. Le fil montre trois lignes, puis « Voir plus » seulement en cas de débordement réel. « Voir moins » replie le texte ; le contenu enregistré demeure entier. Mesure invisible exclue de l’accessibilité. Vérifié réellement en 360/390/430 px.

## 4. Hiérarchie titre/description

- Social Mosaic, Pair, Strip, Caption Photo et Shoppable : description en tête, sans titre indépendant dans le fil.
- Photo, Split et Campaign : hiérarchie éditoriale adaptée.
- Titre visible facultatif grâce au réglage persistant `show_title`, conservé dans les écritures partielles du CRM et lu par le mobile.
- Le titre interne reste requis pour l’administration, les liens de partage et la compatibilité du modèle existant ; il n’est pas supprimé quand son affichage est désactivé.
- La prévisualisation CRM suit les mêmes règles. Aucun renommage automatique des produits.

## 5. Navigation officielle

`NavigationIcon.tsx` centralise la flèche à tige horizontale et tête ouverte, sans cadre circulaire, adaptée au RTL. Taille logique de référence 32 pour les retours, déclinaison 24 pour les petits liens d’entrée, même géométrie. Le composant conserve les autres icônes sans les transformer : fermer et déplier ne deviennent pas arbitrairement des retours.

`BackButton.tsx` fournit une cible de retour commune de 44 ×44, alignée au centre, avec zone tactile étendue, libellé accessible et état d’appui. Il remplace les commandes de retour simples dans les écrans empilés, Publication, fiche produit, panier, commandes, navigateur boutique, récupération de compte, documents légaux, Lens et Reels. Le header Lens à transition blanc/noir conserve ses deux couches et utilise la même géométrie. Les conteneurs existants conservent leurs safe areas et leurs marges responsives ; les destinations de retour, liens profonds et gestes ne sont pas réinventés.

## 6. Indicateurs de galerie

Segment noir pour le média actif, points gris pour les autres, sur une petite capsule claire au bas du média. Zone de toucher plus haute que la capsule visuelle. Le swipe et le toucher sélectionnent le véritable index ; les labels accessibles donnent la position. Pas de compteur numérique visible ni de points fictifs pour compléter une décoration ; aucun indicateur pour une image unique. Miniatures du modèle Carousel conservées. Commandes vidéo placées en haut à droite pour éviter les indicateurs, même sur un album de dix médias.

## 7. Surface commune Suivre/interactions

Fond commun `#F0F1FC`, très pâle entre bleu et violet. Bouton Suivre séparé et barre en capsule ; texte et icônes noirs au repos. La confirmation Suivi/coche dépend du serveur. La barre commune est utilisée par tous les modèles Publication et par le lecteur. Les nombres nuls ne prennent plus de place ; les nombres affichés sont issus du serveur, avec correction de l’état provisoire en cas d’échec. Aucun compteur artificiel.

## 8. Commentaires intégrés

- Depuis le fil : bottom sheet, fermeture par fond ou bouton, poignée avec agrandissement/réduction par geste et commandes d’accessibilité.
- Depuis la photo agrandie/vidéo : conversation intégrée sous le média, barre de réactions accessible, fermeture revenant au même lecteur ; commandes de la photo masquables par toucher.
- Un seul fil de commentaires par publication, indépendamment de la photo consultée.
- Liste défilante et rédaction hors de cette liste, ajustée au clavier ; clavier fermé tant que l’utilisateur ne choisit pas de rédiger.
- Auteur, date, texte et réponses réels ; validation du commentaire parent sur la même publication. Pas d’avatar, de badge client ni de réponse commerciale fabriqués.
- Brouillon isolé par compte et publication, conservé en mémoire et dans le stockage local avec contexte de réponse ; suppression après succès seulement.
- Envoi protégé des doubles appuis ; identifiant stable de tentative pour éviter de dupliquer un commentaire lors d’un nouvel envoi après perte de réponse réseau. Le serveur refuse la réutilisation d’un identifiant avec un contenu différent.
- Lecture ouverte aux visiteurs ; écrire/réagir demande la connexion. Authentification hébergée dans la modal déjà ouverte pour éviter une seconde présentation native iOS ; le contenu sous-jacent ne concurrence pas la feuille d’authentification pour l’accessibilité.
- Pas de boutons GIF, caméra ou pièces jointes non implémentés.

## 9. Réactions exclusives

Le cœur actif est rouge (`#D92148`) ; Je n’aime pas utilise une icône différente et le jaune (`#E8B323`), plus un libellé/état accessible, sans reposer uniquement sur la couleur.

- Appui simple : J’aime, ou annulation de la réaction active.
- Appui long, ou petite commande explicite « Options de réaction » : choix J’aime / Je n’aime pas. Cette seconde entrée rend la fonction accessible sur le web et sans appui long.
- Choix de l’autre réaction : remplacement exclusif. Choix identique : annulation.
- État persistant par compte et publication, identique dans le fil et le lecteur ; échec → retour à l’état confirmé.
- **Décision conservatrice sur le compteur : seuls les J’aime sont publics.** Le dislike personnel est relu pour son propriétaire, sans compteur négatif public, sans notation de qualité du produit et sans effet de recommandation inventé.
- Compatibilité préservée avec les anciennes mutations J’aime des autres surfaces sociales. Le nouveau choix explicite est idempotent et réservé aux publications.

## Vérification et limites

- Racine : **269 fichiers, 3355 tests réussis, 17 ignorés**.
- Mobile : **114 fichiers, 1139 tests réussis**.
- UI React Native : **39 suites, 236 tests réussis**.
- Total : **4730 tests réussis**.
- TypeScript racine/client/mobile, build, inventaire de design, identité et contrat d’icônes validés.
- Export Expo Android **et** iOS réussi (bundles Hermes). Cet export n’est pas une installation ni une vérification sur téléphone.
- Navigateur réel, sans interception des API : sept compositions en 360/390/430 px, navigation publication → produits → fiche → sélection 42.5 → Cart Core au prix exact ; ligne de panier QA supprimée, aucun ordre ni paiement créé.
- Session client QA réelle : dislike relu après rechargement, remplacement par J’aime, commentaire, réponse, brouillon et même discussion dans le lecteur. Le compte QA et ses seules interactions ont été supprimés après vérification.
- CRM réel : import ordonné **MP4 H.264 + JPEG original + WebM VP9**, couvertures générées, dimensions persistées, original privé identique, accès anonyme refusé, puis décodage des deux vidéos dans le vrai carousel. Post QA supprimé par l’API admin ; publications existantes conservées.
- Post QA de description : affichage optionnel du titre et Voir plus/Voir moins vérifiés aux trois largeurs, puis suppression du seul post QA.
- Aucune erreur `pageerror` dans ces parcours. Des avertissements de dépendances Expo Web préexistants subsistent ; ils ne constituent pas une validation native.
- Stock final relu : **10 produits de la sélection, 100 unités**. Prix, répartitions de tailles et activation du paiement inchangés.

Les vidéos de QA sont de courts fichiers encodés localement à partir d’une photo fournie, utilisés uniquement pour tester l’import/décodage, pas publiés comme campagnes du propriétaire. Les images générées pendant la discussion sont des concepts, jamais des preuves de fonctionnement. Les captures authentiques et logs de travail sont dans `.cache/nine-*`, hors Git.

**Aucun essai physique Android/iOS, production déployée ni paiement encaissé n’est revendiqué.** Le nouvel APK dépend du workflow Android déclenché après le push. La vérification physique du clavier, du décodeur vidéo et des gestes sur les appareils cibles reste nécessaire.
