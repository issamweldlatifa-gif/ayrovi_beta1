# ZAYROVI · Social Commerce — Lot 1

## Import Figma

Dans Figma Design, créer un fichier **ZAYROVI — Social Commerce** et déposer `figma-board.svg` sur le canevas. Le SVG est autonome : visuels intégrés et structure vectorielle. Les groupes `social-pour-vous` et `social-reels` contiennent chacun un écran 390 × 844. `figma-board.webp` est l’aperçu aplati, pas le fichier à éditer. Les visuels sont des références de design tirées des ressources Reel du dépôt, pas des données intégrées dans l'application. Une importation SVG n'est pas un prototype Figma interactif.

## Implémentation

- **Accueil → Social** ouvre `/(tabs)/social` ; « Explorez tout » préselectionne Stories ou Reels. Les entrées existantes de l’accueil et les cinq icônes inférieures sont conservées. Aucun onglet supprimé faute de preuve qu'il soit durablement vide et sans liens entrants.
- La première version est une surface de découverte bornée : image de couverture issue de la source existante, au plus huit stories et six aperçus de Reels. Aucun lecteur vidéo n'est monté pour un aperçu du fil. Les lecteurs natifs existants prennent le relais, de même que Z Lens et le panier.
- **Pub to Shop reste dans Publication**, accessible depuis le panneau « Pub to Shop ». Pas de deuxième flux publicitaire, carte produit ou panier. Les plans Look, Éditions, classement, flux paginé, attribution et mesure de performance sont des lots distincts.
- **Paiement** : lot non modifié. La politique de paiement est actuellement partagée par `/api/checkout`, la configuration publique et les commandes AYWEBs. Une règle sans COD doit être appliquée et testée sur tout le parcours concerné, pas seulement affichée dans l’onglet.
- **Retour arrière** : retirer l'entrée Social et les deux renvois de l’accueil, puis remettre la redirection existante vers Publication. Aucun changement de base, de données ou de contrat serveur.

## Ajout d’un look complet

- Le bouton « Composer le look » recharge les fiches catalogue et ouvre la feuille native de sélection. Le sous-total affiché est celui des articles hors livraison et promotions ; le panier applique ses règles habituelles.
- `POST /api/cart/catalog/look` vérifie l’édition publiée, impose exactement ses produits et revalide prix, variantes et quantités. Le groupe est ajouté à la même table et par le même constructeur que les articles seuls. Une ligne refusée annule toute la transaction.
- Un identifiant d’opération protège une nouvelle tentative du même panier pendant 24 h. Sur mobile, il est conservé en mémoire si la feuille est refermée pendant une confirmation incertaine. En cas de redémarrage après une telle erreur, vérifier le panier avant de recommencer. Le minuteur de 20 min est celui de l’interface existante, pas une promesse de stock bloqué.
- Déployer l’API avant le client qui affiche ce bouton. Pour retirer ce parcours, rétablir la version précédente du client ; les articles ajoutés restent des lignes catalogue ordinaires. Aucun événement analytique n’est ajouté par cet endpoint.
- Vérification manuelle restante : avec une édition publiée comportant au moins deux produits, essayer une taille épuisée, couper le réseau pendant la confirmation puis réessayer, et vérifier le panier après ouverture de la feuille de confirmation sur Android et iOS.
