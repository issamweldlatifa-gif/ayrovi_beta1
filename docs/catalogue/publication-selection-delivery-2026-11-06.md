# Dix produits du propriétaire : catalogue, stock et parcours Publication

6 novembre 2026. Autorisation finale : vente réelle, dix unités de chaque produit, avec répartition des tailles approuvée. Ce lot remplace le contenu d’illustration par les produits photographiés fournis par le propriétaire ; il ne simule pas de ventes.

## Produits et prix publiés

Conversion directe approuvée : 1 EUR = 3,370911 TND, valeur configurée dans la plateforme au moment de la préparation, **pas un taux de marché vérifié en direct**. Prix unitaires fixes du catalogue, sans nouveau supplément d’importation ou de service. La livraison locale existante reste calculée une seule fois par commande selon la configuration du site.

| Produit | Source EUR | Vente TND | Stock initial |
| --- | ---: | ---: | ---: |
| Kérastase Volumifique, 250 ml | 29,95 | 100,959 | 10 |
| Kérastase Chronologiste, 30 ml | 49,95 | 168,377 | 10 |
| The Ordinary Hair Density, 60 ml | 23,95 | 80,733 | 10 |
| Emporio Armani Traditional | 181,00 | 610,135 | 10 |
| Furla Easy Shape | 156,75 | 528,390 | 10 |
| Tasse Swarovski et soucoupe | 125,00 | 421,364 | 10 |
| Michael Kors porte-clés bordeaux | 49,95 | 168,377 | 10 |
| Michael Kors Bri Ruched bordeaux | 134,95 | 454,904 | 10 |
| Michael Kors Laila bordeaux | 124,95 | 421,195 | 10 |
| Calvin Klein Jeans Henley blanc | 48,95 | 165,006 | 10 |

Le prix 49,95 EUR de la variante Chronologiste 30 ml a été confirmé explicitement par le propriétaire après la capture « à partir de ». Le stock n’est pas déduit des limites de commande ou des indications du marchand dans les captures : il vient de l’instruction du propriétaire.

- Henley : S ×3, M ×3, XL ×2, XXL ×2.
- Ballerines : 40 ×3, 41 ×3, **42.5 ×2**, 43 ×2.
- Les huit autres produits ont chacun dix unités de leur unique choix fourni.
- **100 unités nouvelles**, 16 variantes et mouvements d’ouverture dans l’inventaire existant. Le produit de test antérieur reste conservé, mais n’illustre plus ces publications.

Les prix EUR et le taux sont conservés en provenance interne, pas utilisés pour recalculer des frais d’importation sur ces ventes locales. Les prix publiés passent par le catalogue et le même devis que le panier et la commande. La précision au millime est conservée à l’écran lorsqu’elle est significative, et dans le résultat de création de commande ; 89.00 garde son ancien affichage.

## Installation et médias

`src/catalogue/publicationSelection.json` est la sélection approuvée. `installPublicationSelection.ts` l’installe dans le Product Core, les marques/catégories du CRM, les médias, les variantes et l’Inventory Core. Migration transactionnelle `publication_owner_products_v1`, exécutée une seule fois. Elle ne réapprovisionne pas les quantités consommées et ne remplace pas un produit existant lors des démarrages suivants.

Les dix photos sont dans `assets/media/catalogue/publication-selection/`. Les originaux sont conservés dans `originals/`. Les packshots ont seulement été recadrés pour retirer le grand vide de fond, sans génération ni modification de l’objet ; la photographie du vêtement est conservée entière. `fit: contain` évite de couper les objets dans les compositions. Ce réglage est conservé par le serveur et le CRM.

## Publication et découverte

Les treize publications intégrées connues ont leurs anciennes illustrations remplacées par les photos fournies, avec liens vers de vrais identifiants du catalogue. La migration protège les couvertures personnalisées ne correspondant pas aux anciennes illustrations intégrées ; elle n’est pas un remplacement global de tous les contenus du CRM.

- Galerie bordeaux : sac, ballerines et porte-clés, chacun avec sa fiche et son prix.
- Soins cheveux : les trois produits, sans présenter un produit comme une étape obligatoire ou inventer de propriétés/ingrédients.
- Deux montres, composition vêtement et sélection multimarque.
- Tasse et soucoupe pour les contenus maison/lifestyle.
- Les modèles collage, trois images, duo, photo, shoppable, éditorial crème et carousel restent présents.

Les CTA sont explicites : « Explorer l’ensemble », « Explorer les soins », « Découvrir les montres » ou « Voir le produit ». Un CTA de groupe ouvre le lecteur existant avec description et vrais produits. Un CTA de produit ouvre la fiche existante. Le lecteur se ferme avant la navigation pour ne pas laisser une Modal au-dessus de la fiche.

La carte shoppable d’un seul produit est désormais une **ligne compacte pleine largeur**, avec petit visuel, nom, marque, prix, favori et bouton encadré. Plusieurs produits peuvent encore utiliser la grille. Pas de nouveau Product Core, Cart Core ou paiement.

À la une conserve ses réglages latest/pinned et son parcours existant ; si elle référence une publication remplacée, elle suit ses nouveaux contenus. Une égalité de dates a été rendue déterministe par identifiant, au lieu de dépendre de l’ordre de lecture SQLite.

## Stock et commande réels

`localSale.ts` est un adaptateur de validation/réservation dans les cores existants :

- choix obligatoire lorsqu’il y a plusieurs tailles ; refus de L et de toute pointure non déclarée ;
- contrôle des quantités cumulées d’un même SKU dans le panier, y compris ses mises à jour ;
- disponibilité du panier issue de l’inventaire local, pas d’une interrogation d’un faux marchand `catalog.local` ;
- contrôle et réservation **dans la transaction de commande existante**, empêchant deux commandes de consommer les mêmes unités ;
- réservation d’une commande en attente ≠ vente payée ;
- annulation administrative : restitution de ses seules réservations, de manière idempotente ; aucun remboursement ou succès de paiement fabriqué ;
- produit archivé : ligne encore lisible et supprimable du panier, achat bloqué ;
- prix catalogue relu et contrôlé ; les contrats de disponibilité des marchandises externes sans inventaire local ne sont pas supprimés.

Les méthodes de paiement et leur activation ne sont pas modifiées.

## Erreurs de suivi et d’enregistrement

La couche mobile partage désormais un seul renouvellement CSRF entre écritures concurrentes et réutilise un jeton déjà renouvelé par une autre écriture. Une session expirée ouvre la demande de reconnexion, même si le cache local la croyait encore connectée. L’erreur précédente est effacée lors d’une nouvelle tentative et un succès n’est affiché qu’après réponse du serveur. Les erreurs API sont affichées selon leur cause au lieu d’un texte générique systématique.

Ces scénarios ont des tests de non-régression. La cause exacte de chaque erreur sur les anciennes captures APK n’a pas été confirmée à partir de journaux du téléphone ; une vérification du nouveau build sur appareil reste nécessaire.

## Vérification finale

- **3339 tests racine réussis**, 268 fichiers ; 17 ignorés préexistants.
- **1139 tests mobile réussis**, 114 fichiers.
- **231 tests UI React Native réussis**, 39 suites.
- TypeScript racine/client et mobile, build client/serveur, design, identité et diff vérifiés.
- **21 rendus navigateur réels**, sept compositions en 360/390/430 px, sans interception réseau ni fixtures. Revue visuelle des captures carousel, éditorial et shoppable à 390 px.
- Vrai parcours Expo Web : groupe de soins → lecteur avec trois produits → fiche produit ; absence de Modal résiduelle et affichage de 100.959 TND.
- Vraie fiche ballerines : choix **42.5**, ajout au Cart Core à **454.904 TND**, puis suppression vérifiée du seul article de QA. Aucun achat, paiement ou commande réel créé par cette vérification.
- Base locale relue : dix nouveaux produits, dix unités chacun, **100 unités entrantes et aucune sortie** après nettoyage du panier de QA.
- Tests transactionnels avec rollback : réservation, refus de dépassement de stock, libération idempotente et commande utilisant le prix publié.

Les captures sont issues d’Expo Web ; aucun essai physique Android/iOS ni encaissement n’est revendiqué. Les logs et captures intermédiaires restent dans `.cache/`, hors Git. Le workflow Android doit produire un nouvel APK après le push.
