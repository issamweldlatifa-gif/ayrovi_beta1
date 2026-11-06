# Correction des deux compositions éditoriales et du nom d’éditeur

6 novembre 2026. Complément aux cinq albums ajoutés précédemment : les identifiants existants `campaign`, `carousel` et `split` restent compatibles. Les références étaient des concepts graphiques, pas des preuves d’un rendu natif déjà identique.

## Nom du véritable éditeur

Le nom à côté de l’avatar est désormais un **AppText ordinaire**, corps fort 16 pt, dans `AyroviExtracted-Bold` ou `NotoSansArabic-Bold` selon la langue. Il n’utilise plus le composant SVG `BrandMark`. Le logo reste dans l’avatar lorsqu’il appartient réellement à ZAYROVI. Les autres éditeurs conservent leur propre nom et avatar ou initiale. La date, Sponsorisé et la vérification restent issus des métadonnées ; pas de nouvelle certification inventée.

Cette correction est locale au nom de l’éditeur : les logos officiels ailleurs dans l’application ne sont pas remplacés. Les grands titres utilisent également les rôles de la famille typographique officielle de l’application ; aucune police étrangère de la maquette n’est importée.

## Composition éditoriale : `campaign`

- Véritable grande image **3/2**, pleine largeur, suivie de l’encart, pas une photo portrait générique avec une petite légende.
- Encart crème `#F4F1EA`, défini dans une source partagée pour le mobile et le CRM.
- Rubrique éditoriale issue de la catégorie réelle lorsqu’elle est connue (par exemple BEAUTÉ), sans réintroduire de rangée de filtres.
- Titre **h1 / 32 pt**, description lisible et CTA bleu avec flèche et parcours réel.
- Espacement intérieur de 24 pt. L’image et l’encart se rejoignent sans trou de 8 pt.
- Le modèle `split` conserve l’image puis son texte pleine largeur, mais avec une hiérarchie de titre **h2 / 28 pt**, distincte d’une légende ordinaire.

## Composition galerie et produit : `carousel`

- Grande photo **3/2**, coins discrets et compteur placé en bas à droite.
- Trois grandes miniatures **4/3** visibles sur la largeur, au lieu de petits carrés de 48 pt ; les galeries plus longues défilent horizontalement.
- Sélection encadrée en bleu ; appui sur une miniature et swipe du véritable pager mettent à jour la photo et le compteur.
- Titre **h3 / 22 pt**, description, puis fiche compacte des vrais produits liés **avant** les actions sociales.
- Image produit de 56 pt et libellé encadré « Voir le produit », ouverture de la fiche produit existante. Nom, marque et prix viennent du catalogue ; aucun matériau, prix ou stock n’est inventé à partir de la photo.
- Aucune fiche commerciale factice si le post n’a pas de produit catalogue associé. Pas de nouveau Product Core ou Cart Core.

## Pourquoi le feed montrait un seul genre de carte

L’audit de l’API locale a trouvé six publications, toutes en `auto / image`. De plus, le réglage de densité compacte faisait auparavant interpréter presque tout contenu automatique comme un split générique.

Un résolveur partagé choisit maintenant la composition à partir des **métadonnées de chaque post**, sans modifier le contenu enregistré : vidéo → vidéo, carousel ou plusieurs images → galerie, contenu éditorial ou catégorie beauté → encart éditorial, autre image → photo. Les collections historiques restent compatibles, et tout modèle explicitement choisi par l’auteur reste prioritaire.

Le réglage compact affecte désormais la densité, pas l’identité du modèle. Les photos des anciens posts beauté automatiques gardent leur ratio d’origine pour éviter de couper un visage en les forçant en 3/2. Le 3/2 des compositions explicitement choisies correspond aux médias éditoriaux préparés pour ce format.

Cela ne recrée aucun filtre public : les requêtes restent sans catégorie cachée et les deux anciennes rangées restent supprimées. Aucun post existant n’a été réécrit, aucun produit ne lui a été ajouté arbitrairement.

## Images et modèles prêts à remplir dans le CRM

Quatre médias éditoriaux ont été générés pour cette livraison, sans texte incorporé ni interface dessinée :

- `editorial-beauty-mirror.jpg` : rituel au miroir ;
- `bag-editorial-caramel.jpg` ;
- `bag-editorial-brown.jpg` ;
- `bag-editorial-ivory.jpg`.

Ils sont dans `assets/media/publications/`, réutilisables via la bibliothèque du CRM. Ils ne remplacent pas les neuf originaux fournis par l’utilisateur.

Deux actions préparent un **brouillon** : « Utiliser le modèle éditorial beauté » et « Utiliser le carousel de sacs ». Elles renseignent le modèle, les médias ordonnés, le titre et le texte s’ils sont vides. Le remplacement de médias existants demande confirmation. Elles ne publient rien, n’inventent pas de produit et invitent à associer un véritable article pour activer la fiche catalogue.

Un test réel du CRM a révélé que la création ignorait le champ d’origine envoyé par le formulaire. Le serveur reconnaît maintenant les quatre chemins de médias générés embarqués et persiste leur provenance interne sur création et modification. Il ne fait pas confiance à un simple drapeau client pour un lien arbitraire. Aucune mention d’IA n’est ajoutée au contenu public.

## Validation

- **3329 tests racine réussis**, 266 fichiers ; 17 ignorés préexistants. Suite lancée avec `--testTimeout=15000`, sans modifier la configuration globale.
- **1138 tests mobile réussis**, 114 fichiers.
- **228 tests UI React Native réussis**, 39 suites. Nom en vraie police d’application, rôles de titres, ratios, galerie et anciennes interactions vérifiés. Jest complet conserve le `--forceExit` utilisé auparavant.
- TypeScript mobile et racine/client, build client/serveur, design/inventaire, identité, icônes et contrôle de diff vérifiés.
- **10 scénarios navigateur tactile** : les deux modèles en 320, 360, 390, 430 et 768 px. Contrôles du ratio 3/2, des grandes miniatures, du compteur réel, du nom sans SVG, du titre éditorial et de la fiche produit avant les réactions. Aucune erreur de page.
- Revue visuelle des captures réelles des deux compositions, avec les nouveaux médias. Les libellés et prix de produit de ces scénarios contrôlés sont des **fixtures de QA**, pas une nouvelle offre commerciale publiée.
- **Vrai CRM local** : les deux préréglages enregistrés et relus, ordre des médias et provenance générée persistés, brouillons non publics puis supprimés avec contrôle de la réponse de suppression.
- **Vrai feed local FR/AR**, sans interception réseau : vérifié après le changement de typographie et du modèle automatique, sans erreur de page.

Les captures proviennent du rendu web réel de l’application Expo, pas d’un téléphone physique. Aucun test Android/iOS sur appareil ni compilation locale APK/IPA n’est revendiqué. Le workflow Android doit reconstruire le nouvel APK après le push. Les scripts, logs et captures temporaires restent dans `.cache/`, hors Git.
