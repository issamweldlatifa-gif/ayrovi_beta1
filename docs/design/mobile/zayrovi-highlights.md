# Zayrovi Highlights — Plus qu’une vidéo

## Application mobile

- L’accueil affiche une seule grille sombre **2 × 2**, en dessous de Reels Shop. Chaque couverture verticale porte une miniature blanche avec l’image et le prix du produit vedette. La miniature et la couverture ouvrent toutes les deux **le Highlight choisi**. L’accueil ne crée aucun lecteur vidéo ; la lecture de la sélection est déclenchée à l’approche de la section.
- Le modal plein écran affiche Zayrovi Team en haut, la légende sur la vidéo, les réactions et commentaires à droite et le produit vedette en bas à droite. **Acheter** ouvre sa fiche catalogue. La vidéo reste montée et se met en pause quand la fiche ou la feuille de commentaires prend le dessus.
- Un seul article : aucun bouton Shop, aucun carrousel. Plusieurs articles disponibles : une pastille **+N articles** ouvre un carrousel horizontal de produits du même Reel, qui commence par le produit vedette. Balayer cette rangée ne change pas de vidéo.
- Aucun produit fictif ni espace réservé. Si une carte n’a plus de Reel ou de produit vedette public, elle seule est retirée de la grille. Un Reel de la sélection encore publié mais dont le produit a été retiré peut rester lisible sans CTA depuis un modal déjà ouvert. Les Reels masqués sur l’appareil restent masqués.

## CRM → Contenu → Zayrovi Highlights

1. Publier un Reel shoppable de **Zayrovi Team** avec une couverture et ses articles dans **Social**.
2. Dans **Zayrovi Highlights**, choisir quatre Reels différents, les classer avec **Monter / Descendre**, et choisir un produit vedette pour chaque carte (ou laisser le premier article disponible du Reel).
3. Cocher **Afficher sur l’accueil mobile**, puis enregistrer. Décocher et enregistrer coupe la section sans retirer les Reels du fil ni effacer la sélection. Sans configuration enregistrée, le serveur complète les cartes éligibles de la présélection avec des Reels officiels publics et marchands.

Les réglages vivent dans `settings` (`mobile_zayrovi_highlights`), sans changer le schéma. Les écritures passent par les permissions de contenu et l’audit CRM. La sélection ne copie ni média, ni prix, ni stock, ni compteurs ; elle référence des Reels publiés et leurs articles catalogue. La réponse mobile est privée et non stockable en cache HTTP, car elle peut inclure la réaction du compte connecté. Les Reels ordinaires et les Publications gardent leurs écrans.

**Recette Android/iOS** : ouverture par les deux cibles de chaque carte, rendu sous les zones système, lecture et son, Retour depuis une fiche, réactions/commentaires, et balayage horizontal sur un Highlight multi-articles. Vérifier aussi un Highlight mono-article, puis désactiver/réactiver depuis le CRM et rafraîchir l’accueil.

### Watshis Shop (nom sur mobile)

L’accueil présente jusqu’à quatre sélections avec un prix et la photo de l’article en bas à droite de chaque affiche. **Explorer** ouvre `/watch-shop` : grille pleine largeur sans coins arrondis, sans lecture simultanée, avec les mêmes sélections publiées dans le CRM (sans mélange avec le fil Reels lorsque le CRM a défini une sélection). Une affiche ou sa carte ouvre la vidéo exacte, plein écran. Le lecteur conserve le produit principal, Acheter, les réactions et les commentaires ; `+N articles` n’existe que pour les vidéos multi-produits et ne change pas de vidéo. Le studio garde son nom et l’API conserve son tableau `data`, accompagné de `highlightsEnabled`.

Si des clips ou leurs produits ne sont plus éligibles, les autres restent affichés. Sans configuration CRM enregistrée, le serveur complète la sélection par des Reels officiels publiés avec image et produit disponible. Sans résultat, le titre et Explorer restent visibles avec un état vide, sauf si le CRM a explicitement désactivé le rayon.
