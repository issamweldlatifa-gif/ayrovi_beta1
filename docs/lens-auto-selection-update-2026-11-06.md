# Lens / navigation / identité — 6 novembre 2026

## Livraison et réserve de fonctionnement

Le code du repérage réel des produits est intégré au Lens mobile, séparément de la recherche marchande. L'interface, les contrats, le transport et les protections ont été testés. **L'acceptation du repérage sur de vraies photos avec un fournisseur réel reste à faire : le fournisseur vision actif d'AI Core n'est pas configuré dans cet environnement.**

Vérification réelle sur le serveur reconstruit : `POST /api/ayrovix/localize` avec une photo JPEG valide → **HTTP 503, `LOCALIZATION_UNAVAILABLE`**. Aucun cadre fixe n'est présenté comme un résultat de détection. La recherche de la photo entière reste le repli initial, explicitement annoncé. Ne pas confondre les tests avec doubles de fournisseur avec une validation de précision du modèle.

## Changements

### Sélection de produits

- Suppression de l'ancien composant de sélection manuelle : plus de PanResponder de déplacement/redimensionnement, de coins à tirer ou de points blancs de sélection dans la photo prise/importée.
- Nouveau `POST /api/ayrovix/localize` : image réellement envoyée à la capacité vision du fournisseur actif d'AI Core, schéma structuré de produits/boîtes/confiance. Il ne lit pas les coordonnées depuis les correspondances SerpApi.
- Repérage initial avant la première recherche : le plus grand produit validé est choisi. Un toucher dans les boîtes repérées choisit la plus petite boîte contenant ce point, afin de rendre les objets superposés accessibles.
- Un toucher hors des produits connus demande un nouveau repérage ciblé au point exact. Réponse vide = aucun objet confirmé, pas un carré centré sur le doigt. Un échec du fournisseur est annoncé.
- Flou réel `expo-image` sur la photo, avec une deuxième copie nette découpée dans la boîte du produit choisi. **Il s'agit d'une région rectangulaire de produit, pas d'un masque de segmentation au pixel ou d'un détourage de silhouette.** Les pixels hors de cette région sont floutés.
- Actions d'accessibilité nommées pour choisir les produits sans manipuler de poignées. État de repérage annoncé.
- Annulation et protections contre les réponses périmées lors des changements de photo, d'une nouvelle sélection, de la fermeture et du démontage.
- La ROI envoyée à la recherche correspond à la boîte choisie ; suppression de l'ancien agrandissement serveur de 18 % / 24 px, qui réintroduisait les articles voisins. Les ROI de 2 % sont acceptées.
- Le mode caméra Live conserve la découverte marchande existante ; cette livraison ne prétend pas ajouter une segmentation d'instances en vidéo temps réel.

### Protection et séparation des responsabilités

- Fichier unique avec la validation et la limite d'upload existantes ; coordonnées de toucher finies et comprises entre 0 et 1.
- Boîtes invalides, trop petites, presque plein cadre, hors image et propositions de personnes/scènes rejetées ; confiance minimale 0,65.
- Au maximum 12 propositions traitées, 4 appels vision simultanés, délai fournisseur 18 secondes.
- Cache borné à 64 entrées, validité 2 minutes : empreinte SHA-256, point et résultats validés ; aucune photo stockée dans ce cache.
- Annulation fournisseur au départ du client, via AbortSignal ; limite de coût quotidienne et limite IP existantes appliquées aussi à `/localize`.
- Ni prix, ni stock, ni lien marchand inventé par le repérage. SerpApi reste la découverte d'offres et les faits marchands restent ceux du parcours existant.
- Pas de changement de routage AI Core, Sonim, paiement, Product Core ou Cart Core.

### Résultats et galeries

- Grille à deux colonnes sans marge extérieure, images sans coins arrondis, gouttière centrale de 2 px.
- En-tête de grille collant pendant le défilement ; le retour supérieur reste hors de la liste.
- Suppression du bloc de prix lorsque le prix est inconnu : plus de « Prix non publié ».
- Galerie horizontale dans les cartes disposant réellement de plusieurs images marchandes ; une chaîne de secours/proxy n'est jamais comptée comme plusieurs photos.
- Petite capsule grise indiquant la page visible / le total, à partir de la visibilité réelle des éléments FlatList, sans supposer un signe d'offset LTR/RTL.
- Compteurs de la fiche et de la visionneuse harmonisés en gris, texte sombre. Retour de la visionneuse par flèche.
- Correction du transport web : les uploads envoient un vrai Blob multipart ; la structure React Native `{uri,name,type}` n'est plus envoyée comme du texte dans le flux web. Le transport natif existant est conservé.

### En-tête, navigation et identité

- En-tête applicatif de 56 pt au lieu de 64 pt, avec cibles tactiles de 44 pt conservées et compensation du contenu via le même jeton de chrome.
- Menu à deux traits fins asymétriques, extrémités arrondies ; attributs SVG adaptés au web pour ne pas générer de toast de développement React.
- Soulignement bleu de l'onglet actif, libellés inactifs gris, surface opaque existante, patte AYWEBs bleue en thème clair. Les cinq destinations et leurs comportements sont conservés ; le contraste du thème sombre reste préservé.
- Mot-symbole vectoriel partagé de l'application : A toujours sans traverse, jambes épaissies pour rejoindre approximativement les 175 unités des fûts du R/I. Pas de modification des polices de texte courant ni des assets tiers.
- Footer noir et Publication existante préservés.

## Vérifications exécutées

| Vérification | Résultat |
|---|---|
| TypeScript serveur + client web | OK |
| TypeScript mobile | OK |
| Tests racine | 264 fichiers ; **3312 réussis**, 17 ignorés préexistants |
| Tests mobile/logique et contrats | 114 fichiers ; **1138 réussis** |
| Tests de composants React Native | 39 suites ; **213 réussis** |
| Total des assertions de tests réussies | **4663** |
| Contrats nouveaux de repérage/upload API | 20 tests, inclus dans les tests racine |
| Identité, jetons, `git diff --check` | OK |
| Build client + serveur | OK, avertissement de taille de bundle existant |

La suite Jest complète utilise `--forceExit`, comme la validation Publication précédente : toutes les assertions passent, mais l'arrêt spontané de la suite complète n'est pas revendiqué. Les nouveaux tests ciblés de sélection/galerie et ceux de caméra ont aussi été exécutés séparément avec arrêt normal, dont une exécution `--detectOpenHandles`.

### Navigateur réel

Playwright/Chromium avec interactions tactiles, sur **360, 390 et 768 px** :

- bords extérieurs à zéro et gouttière centrale de 2 px ;
- en-tête immobile lors du défilement ;
- absence de libellé de prix inconnu ;
- déplacement réel du pager et compteur `2/2` ;
- import d'une vraie image locale dans le sélecteur web Expo, avec upload multipart ;
- repérage distinct de la recherche, flou réel, changement de boîte à un toucher sur un autre produit ;
- nouveau repérage sur un point non reconnu, puis absence de sélection inventée si la réponse est vide ;
- aucune erreur de page ; en-tête/navigation de l'accueil inspectés visuellement.

**Limites de ces preuves :** les réponses marchandes et les boîtes de repérage sont des fixtures explicitement contrôlées. Le déclenchement du dialogue système du sélecteur web a été neutralisé pour charger le fichier dans son input réel ; ce n'est pas une validation du dialogue système Android/iOS. Les captures de sélection sont des preuves de rendu/transport, pas une démonstration de précision du modèle.

Les logs et captures de QA restent dans `.cache/lens-*` et ne sont pas versionnés.

## Acceptation restante avant de déclarer le repérage prêt en production

1. Configurer le fournisseur vision actif via les secrets serveur d'AI Core ; aucun secret n'est demandé ou ajouté dans le dépôt.
2. Obtenir un vrai succès de `/localize` et vérifier, sur plusieurs scènes réelles, une pièce isolée puis veste/sac/chaussures portés ensemble. Vérifier que les boîtes ciblent des articles individuels, pas toute la personne.
3. Mesurer la précision des boîtes, les réponses vides, les quotas et la latence ; ajuster le modèle ou le composant de grounding si les boîtes de vêtements ne sont pas suffisamment précises. Le seuil de confiance déclaré par un modèle n'est pas une mesure indépendante de précision.
4. Valider sur appareils Android et iOS : appareil photo, galerie multiple, orientation EXIF, changement rapide d'article, annulation, lecteur d'écran, flou, swipe des galeries et retour fixe.
5. Générer et installer un nouveau build natif pour l'acceptation. Aucun APK/IPA local ni test sur appareil physique n'est revendiqué ici.
