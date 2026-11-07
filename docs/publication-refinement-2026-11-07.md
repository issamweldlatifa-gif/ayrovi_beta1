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

## Révision finale autorisée : Zayrovi Team, header de référence et suivi confirmé

Cette révision remplace les décisions précédentes concernant l'absence de suivi et les anciennes dimensions du header. Le nom final demandé est **Zayrovi Team**, exactement ; le logo et la marque officielle ZAYROVI ailleurs ne changent pas.

- Nom : 24/30, dérivé statique Inter Bold 700 / taille optique 24, renommé Zayrovi Publisher Sans et livré avec sa licence SIL OFL et sa notice. Exception limitée au nom de l'éditeur ; les noms arabes gardent leur famille arabe. C'est une approximation licenciée de la référence, pas une identification prétendue du caractère propriétaire Meta.
- Avatar droit 64, marque de repli 32, sceau officiel 16 réellement attaché en bas à gauche, liseré blanc 1 sans rognage. Nom à gauche et Sponsorisé conservés, aucune date ajoutée.
- Bouton adjacent : disque noir 24, plus blanc puis coche blanche ; cible tactile 44. Un invité ouvre l'authentification existante. Le résultat du véritable endpoint de suivi est attendu avant de changer l'icône ; second clic = désabonnement. Verrou par compte/éditeur, état occupé accessible, erreur localisée et nouvelle tentative. Les caches de tous les posts du même éditeur sont mis à jour uniquement pour le compte propriétaire de la requête, même si le compte actif change entretemps.
- Bleu commun de vérification et des textes/flèches de découverte : **#0078CA**, contraste calculé sur blanc **4,626119:1**. C'est une teinte proche de la référence, légèrement assombrie pour le texte ; aucun relevé exact de son RGB n'est prétendu. Le primaire global #0113B5 et les autres accents Publication restent inchangés.
- Tous les modèles placent désormais le titre visible puis la description avant le média, avec le CTA de découverte seul après le média. Les modèles sociaux continuent de masquer leur titre autonome. Pas de duplication des textes, pas de bloc commercial ajouté ; rythme compact, collage, galerie, vidéo et Voir plus inline conservés.
- Normalisation CRM vers `descriptionPosition: above` en conservant la compatibilité des anciennes entrées `below`. L'éditeur et son aperçu suivent cet ordre ; retrait des anciennes vignettes et blocs produits obsolètes dans l'aperçu, avec indication qu'un album y présente son premier média.
- Migration unique `publication_publisher_team_v1`, appliquée au redémarrage local : uniquement le nom historique connu du publisher officiel `pub_ayrovi`, sans reseed de catalogue, sans modifier les autres éditeurs ni leurs dates/éditions personnalisées. Valeur par défaut neuve : Zayrovi Team.

### Validation de cette révision

- Suite racine complète, **sans filtre de noms** : **269 fichiers / 3366 tests réussis**, 17 tests ignorés.
- Mobile : **114 fichiers / 1139 tests réussis** ; UI : **39 suites / 262 tests réussis**. Régressions sur ordre des textes de tous les modèles, aperçu CRM, confirmation/double clic/désabonnement, erreur et nouvelle tentative, propagation au même éditeur et typographie.
- TypeScript racine/mobile, build racine, inventaire et contrôles design/identité/icônes : réussis.
- Export Expo Android **et** iOS réussi, incluant la nouvelle police ; aucun essai sur appareil physique revendiqué.
- Navigateur réel, API non simulée : sept modèles existants à **320/360/390/430 px**, soit **28 vérifications** de header, chargement réel du fichier de police, géométrie, couleurs, textes au-dessus et CTA en dessous. Suivi réel après authentification puis rechargement, même état sur un autre post du même éditeur, désabonnement réellement persisté, et porte d'authentification invité réussis. Injection explicite d'une panne réseau (contexte hors ligne) : message réseau réel, aucune fausse coche. Aucune erreur JavaScript `pageerror`.
- Compte QA temporaire supprimé après chaque parcours ; aucun post QA créé. Aucun changement de stock/catalogue dans cette révision.
- Preuves locales hors Git : `.cache/team-{ui,mobile,root-full,types,root-types,build,inventory,design,browser,native-export}.log`, captures authentiques `.cache/team-*.png` et export `.cache/team-native-export/`.

Les anciennes captures et anciens APK documentés plus haut ne prouvent pas cette nouvelle révision. Un export ne constitue pas un test physique.

## Nouvelle composition approuvée après les références Threads

Autorisation explicite d'appliquer l'ensemble des ajustements discutés. Cette section remplace les dimensions et positions du header décrites dans la révision précédente.

- Avatar **44 à gauche**, marque de repli 24 ; nom **Zayrovi Team** en Inter dérivé **18/24**, avec le véritable sceau officiel immédiatement à côté du nom. Pas d'heure ajoutée, Sponsorisé reste présent lorsque nécessaire. La description conserve le corps régulier existant (16/24), de proportions désormais plus proches du nom.
- Le plus/coche noir et blanc **24** est superposé à l'avatar avec son bord blanc. Sa cible **44 × 44** est entièrement contenue dans un slot 56 et dans tous ses ancêtres : pas de dépendance à une zone tactile débordante que le hit-testing natif pourrait ignorer. Le compte, la confirmation serveur, le verrou, les erreurs et les caches de suivi de la révision précédente sont conservés.
- Un seul groupe éditorial : colonne de texte décalée de **56**, nom puis titre visible/description directement dessous avec un intervalle de 4. La composition accepte le texte dans le composant éditeur pour réserver correctement l'avatar et sa cible tactile, même avec une légende courte ou absente. Les modèles sociaux ne réintroduisent pas leur titre autonome.
- La largeur du média reste propre à son modèle : pas de réduction générale des photos, collages ou albums au seul petit axe du texte. Découverte reste sous le média, sans nouveau produit commercial ni duplication du texte. Les fonds éditoriaux split/campaign restent, sans padding horizontal décalant le texte par rapport au nom.
- Icônes de **réaction/commentaire/partage/enregistrement 26** au lieu de 24, cibles au moins 44. Le token des petites icônes de recherche/compte du header reste **22** ; pas d'agrandissement global d'icônes hors du périmètre.
- Un seul filet gris clair de hauteur **1**, étendu aux deux bords de la page à partir de l'inset réel du fil. Il est positionné au bas de la carte pour garder le rapprochement inférieur 4 et la marge suivante 12, sans nouvel espacement cumulé ni bande épaisse.
- Plein écran média : fond noir neutre existant `VIDEO_BACKDROP` **dans les deux thèmes**. Trois espaces en flux : barre supérieure 60, zone média flexible avec **contain centré**, barre de commandes inférieure d'au moins 76, puis respect des safe areas système. Aucun recadrage ou étirement imposé, aucune barre d'action absolue sur l'image. Les points d'album restent dans leur zone média, à 12 du bord inférieur.
- Fermeture **X en haut à gauche**, options **… en haut à droite**, disques sombres translucides et commandes accessibles. X ferme l'image même lorsque la conversation est ouverte ; retour système conserve la fermeture préalable des commentaires. Le bouton … ouvre le sélecteur de réactions existant (et l'authentification existante pour un invité), sans inventer de menu de signalement, de repartage ou d'API.
- Actions blanches sans pilules sur le noir sous la photo ; compteurs existants seulement. Commentaires, enregistrement, partage, authentification et préférences passent toujours par `PublicationActions`, pas par un second cœur d'interactions. Les espaces haut/bas restent réservés lorsque les contrôles sont masqués. Le lecteur éditorial et sa navigation officielle ne sont pas remplacés.

### Vérifications de cette nouvelle composition

- **1139 tests mobile / 114 fichiers**, **267 tests UI / 39 suites** réussis. UI exécutée avec `--runInBand --forceExit` après fin des suites. Nouveaux contrôles de composition, cible superposée, filet, zones séparées, options invité/connecté et fermeture avec conversation ouverte.
- **44 tests racine ciblés / 3 fichiers** Publication réussis. Le chiffre 3366 de la section précédente correspond à la suite complète de la révision précédente, et n'est pas présenté comme une nouvelle exécution complète pour celle-ci.
- TypeScript mobile/racine, build racine, inventaire/design/identité/icônes réussis. Export Expo Android et iOS réussi sur le code final.
- Navigateur réel sans mock d'API : **28 compositions** (sept modèles à 320/360/390/430), avec contrôle de la police chargée, de l'alignement description/nom, du sceau adjacent, du filet bord à bord et de l'ordre copie/média/CTA. Authentification invité, suivi réellement persisté après rechargement, second post du même éditeur, désabonnement et panne réseau explicite vérifiés à nouveau.
- Plein écran : **320×740, 390×900, 430×900 et 800×390** (paysage). Vérification du contain, du fond, des rectangles non superposés, des options réelles, des commentaires et de la fermeture. Deux vérifications supplémentaires français/arabe en thème sombre, dont cible tactile entièrement à l'intérieur des ancêtres.
- **Six contrôles français/arabe** à 360/390/430 du Voir plus mesuré : trois lignes, suffixe inline au dernier rang, texte intégral au dépliage puis repli. Posts QA et comptes temporaires supprimés ; aucune erreur JavaScript `pageerror` dans ces parcours. Catalogue non modifié.
- Preuves locales hors Git : `.cache/thread-*.log`, `.cache/thread-*.png`, `.cache/thread-native-export/`. Il s'agit de captures authentiques du navigateur et d'exports, **pas d'une validation sur téléphone physique ni d'un nouvel APK déjà installé**.
