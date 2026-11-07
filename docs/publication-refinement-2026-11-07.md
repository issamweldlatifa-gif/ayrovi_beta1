# Publication — trois ajustements après essai du propriétaire

7 novembre 2026. Exécution et push explicitement autorisés après confirmation du périmètre à partir des six captures du propriétaire. Cette note remplace les décisions de présentation correspondantes de la première livraison des neuf points, sans annuler leurs fonctionnalités.

## Présentation du fil et du header

- Suppression de la capsule et du fond commun de la barre d’interactions : boutons directement sur le fond du post.
- Icônes principales : 24 au lieu de 32, dans la grille d’icônes officielle ; zones tactiles conservées à au moins 44.
- Flèche officielle conservée, taille de référence abaissée de 32 à 28 ; variante des liens d’entrée abaissée de 24 à 22. Aucun changement de destination ni de geste.
- Publication dans le header utilise explicitement la famille officielle des titres, à la taille compacte du label. Pas de mot-image ni de police de logo.
- Le bouton Suivre/Suivi conserve sa présentation et sa persistance ; sa suppression n’était pas demandée.

## Retrait du commerce additionnel des cartes du fil

- Retrait de « Voir les produits · N », des listes et grilles additionnelles de fiches produit, des prix et des favoris produit sous les modèles, y compris Carousel et Shoppable.
- Retrait de la bande de miniatures sous le carousel dans le fil ; défilement des médias et indicateurs réels conservés.
- Le média principal peut toujours représenter un produit : aucune photo du propriétaire n’est supprimée.
- Le lien d’action principal du modèle demeure, notamment Découvrir/Explorer ; il permet d’ouvrir le contenu de destination ou le produit selon sa configuration CRM. Il redevient disponible pour le modèle Shoppable à produit unique, qui dépendait auparavant de sa carte additionnelle.
- Les associations CRM, le catalogue, les prix, le stock, la fiche produit, le panier et les produits accessibles dans le contenu de destination restent inchangés. Aucun effacement de données commerciales.
- Suppression de la requête de favoris produit devenue inutile dans le fil.

## Commandes immersives distinctes

- L’état et les mutations restent ceux de `PublicationActions`, partagés avec le fil. Seule la présentation change ; aucun second cœur de réactions.
- Dans la photo/vidéo agrandie : commandes flottantes séparées en capsules/cibles arrondies, sans capsule commune, avec icônes et vrais compteurs clairs sur le lecteur sombre.
- Fonds translucides neutres dérivés de la palette existante. Leur opacité conserve le contraste même au-dessus d’une photo blanche. Variante claire avec encre sombre disponible dans le composant, sans prétendre détecter automatiquement les couleurs des pixels.
- Les indicateurs de galerie sont placés au-dessus des commandes pour éviter leur chevauchement. Avec les commentaires ouverts, les commandes reviennent dans le flux, entre média et discussion, au lieu de couvrir la rédaction.
- Connexion, J’aime/Je n’aime pas, commentaires, partage et sauvegarde préservés ; aucune fonction ou quantité fictive recopiée du modèle visuel fourni.

## Vérifications de cette révision

- Mobile : **114 fichiers, 1139 tests réussis**.
- UI : **39 suites, 241 tests réussis**, dont les nouvelles attentes sans cartes commerciales, le CTA réel, les surfaces distinctes, la police et l’espace réservé aux indicateurs.
- TypeScript racine/client et mobile, inventaire/design/identité/contrat d’icônes, build racine : réussis.
- Export Expo Android et iOS : réussi ; ce n’est pas un essai sur appareil physique.
- Navigateur réel, sans mock d’API : sept modèles à 360/390/430 px ; absence des blocs commerciaux, police du header, barre sans fond, sélection réelle du carousel. Lecteur sombre, non-chevauchement indicateurs/commandes et ouverture/fermeture des commentaires vérifiés. `pageerror`: aucun.
- Captures authentiques et logs : `.cache/three-*`, hors Git. Aucune nouvelle image de campagne ni donnée de client fictif créée.

L’APK de cette révision est construit par le workflow Android après le push ; l’APK `8f3c6ce` de la livraison précédente ne contient pas ces trois ajustements. Aucun essai physique Android/iOS n’est revendiqué.

## Finition autorisée : séparation des publications

Le propriétaire a ensuite approuvé un filet gris clair unique après chaque carte du fil, et non une bande grise épaisse ni un cadre. Le bord inférieur préexistant, trop fin sur les écrans à forte densité (`hairlineWidth`), est porté à **1 unité logique** avec le gris neutre existant `#E5E5E5`. Espacement blanc : 12 unités avant et après le filet, cohérent en mode compact et normal. Aucun séparateur supplémentaire ne double ce bord. Les 39 suites UI passent désormais avec **243 tests** ; TypeScript mobile et les contrôles de design/identité passent également.

## Header éditorial autorisé après validation des concepts

Le propriétaire a choisi la nouvelle direction puis demandé son implémentation et son push : nom dans la colonne gauche, avatar circulaire de 48 unités à droite, véritable sceau de vérification en bas à gauche de l’avatar, sans bouton Suivre/Suivi ni date. La disposition de ces deux colonnes reste identique en RTL ; la typographie du nom suit toujours la famille de l’application. Les noms longs restent limités à une ligne avec une colonne flexible. Un éditeur non officiel n’obtient aucun sceau ; avatar fourni et initiale de repli restent pris en charge.

Le libellé Sponsorisé et son sponsor réel sont conservés lorsqu’applicables ; ils ne sont pas remplacés par une date. Les dates des commentaires ne sont pas concernées. Les préférences de suivi existantes et leur API restent intactes ; aucun nouveau profil d’éditeur n’a été inventé ni présenté comme livré. Le code de suivi et d’authentification devenu inactif dans la carte a été retiré, sans toucher à l’authentification des interactions.

Validation : 114 fichiers mobile / **1139 tests réussis**, 39 suites UI / **246 tests réussis**, TypeScript mobile, contrôles design/identité/icônes réussis ; export Expo Android et iOS réussi. Parcours navigateur réel sur sept modèles à 360/390/430 px : positions nom/avatar, absence de bouton et date dans le header, lecteur et commentaires conservés, aucune erreur `pageerror`. Logs et captures authentiques : `.cache/publisher-*`, hors Git. Aucun essai sur téléphone physique revendiqué.

## Espacement resserré sous les interactions

Après comparaison sur téléphone avec le rythme du fil Facebook, le propriétaire a demandé de rapprocher le filet des boutons. Le padding inférieur passe de 12 à **4 unités logiques**, en mode normal et compact ; la marge après le filet reste 12. La barre et ses cibles tactiles ne sont pas réduites, le trait conserve son épaisseur de 1 et son gris neutre. Validation : 39 suites UI / 246 tests réussis, TypeScript mobile et contrôles design/identité réussis. Aucun nouveau test physique revendiqué.

## Trois améliorations communes : rythme, regroupement et description inline

Autorisation du propriétaire après comparaison des espacements et du « Voir plus » de référence.

- Échelle commune `PUBLICATION_SPACING` : groupe 4, section 8, inset éditorial 12, séparation des posts 12, approche du filet 4. Les valeurs sont logiques, pas une mesure prétendument exacte des captures Facebook.
- Une seule responsabilité par limite : retrait du padding supérieur systématique des textes et de la marge supplémentaire du CTA ; intervalle explicite média/texte pour les compositions ordinaires. Split ne cumule plus un gap et le padding de son panneau. Campaign conserve sa composition et son inset horizontal de 24, avec un inset vertical de 12. Les wrappers de texte réellement vides ne produisent plus de section supplémentaire.
- La barre d’interactions utilise une hauteur minimale de 44 plutôt que 48 ; les cibles tactiles restent au moins 44. Le filet gris et le header éditorial à avatar droit sont préservés. L’objectif est un rythme optique cohérent, pas des distances mathématiquement identiques entre des glyphes, des images et des zones de toucher de tailles différentes.
- « … Voir plus » est intégré au dernier des trois premiers rangs, en gris et famille régulière. Une mesure invisible du texte réel, puis une recherche bornée de la longueur affichable **suffixe inclus**, réservent sa place ; pas de seuil arbitraire en caractères ni de superposition sur le texte. Espaces insécables dans le suffixe pour ne pas isoler son second mot.
- Mesure relancée à changement de texte, largeur, langue, typographie ou taille système des caractères. Les callbacks de mesure périmés sont ignorés ; les graphèmes sont mémorisés. `Intl.Segmenter` est utilisé lorsqu’existant, avec repli testé pour les marques combinantes arabes, accents, emoji ZWJ, modificateurs de couleur et drapeaux.
- Pas de ligne de bouton supplémentaire. L’ensemble du paragraphe tronqué reste une cible tactile ; son nom accessible dérive du texte visible et de l’action, plutôt que de masquer le contenu à un lecteur d’écran. Déplier affiche la source intégrale sans mutation et propose Voir moins ; le texte court ne reçoit pas de fausse commande.

Validation locale de cette révision : **1139 tests mobile et 259 tests UI réussis**, TypeScript mobile et contrôles design/identité/icônes réussis, export Expo Android et iOS réussi. Les nouvelles régressions couvrent le rythme de neuf modèles, l’absence de section vide, le texte court, le changement de largeur et le repli Unicode. Navigateur réel : sept compositions à trois largeurs, et posts QA français/arabe à 360/390/430 avec suffixe sur le dernier rang, retour au texte intégral et repli. Les rectangles de glyphes arabes débordent naturellement de leur boîte de ligne : la vérification compare les lignes de base plutôt que d’assimiler cette métrique à un retour de ligne. Aucune erreur `pageerror`. Les seuls posts QA créés ont été supprimés ; stock de la sélection relu à 100 unités. Preuves locales `.cache/rhythm-*`, hors Git. Aucun essai physique Android/iOS revendiqué.
