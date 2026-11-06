# Modèles visibles dès l’ouverture de Publication

6 novembre 2026 — demande complémentaire : les modèles ne doivent plus seulement être disponibles dans le CRM. Le propriétaire demande maintenant des exemples installés par le code, visibles dans le feed, puis modifiables depuis le CRM.

## Livraison

Une migration transactionnelle et exécutée une seule fois (`publication_visible_showcase_v1`) installe de véritables publications au statut `publie` :

| Modèle | Publication |
| --- | --- |
| `social_mosaic` | Une semaine, plusieurs allures — six photos, collage et +1 |
| `shoppable` | Produit existant du catalogue — photo puis carte commerciale réelle |
| `caption_photo` | L’allure en rouge — texte puis grande photo |
| `social_strip` | Trois regards sur le style — trois photos côte à côte |
| `social_pair` | Deux façons de porter l’essentiel — deux photos côte à côte |
| `campaign` | Votre nouveau rituel. — grande image et encart crème |
| `carousel` | Les essentiels de saison — galerie de sacs et grandes miniatures |

Les cinq modèles additionnels sont donc directement consultables, avec également les deux compositions corrigées de la demande précédente. Identifiants stables : `publication_showcase_<template>`.

Ce ne sont ni une injection de fixtures dans le client, ni des cartes locales déconnectées de l’API, ni des brouillons à créer manuellement. Le même feed, les mêmes composants et les mêmes parcours de galerie, authentification, préférences et catalogue servent ces publications. Elles apparaissent dans la liste habituelle du CRM et restent entièrement modifiables.

## Préservation des données

- Les publications existantes sont conservées. Les nouveaux exemples sont datés juste après celles-ci dans l’ordre du feed, avant les anciens éditoriaux de lancement, sans changer la sélection actuelle d’À la une.
- La migration ne s’exécute qu’une fois sur chaque base existante ou neuve. Un redémarrage ne rétablit ni un titre modifié, ni une publication archivée ou supprimée par le propriétaire.
- Aucun compte, produit, prix, stock, commentaire, abonnement ou compteur d’engagement n’est inventé.
- La carte shoppable utilise le produit de test fixe déjà présent dans le catalogue, son image et son prix actuels. Elle ne crée pas de marchandise. Si ce produit n’est plus publiable, le modèle garde une inspiration chaussure sans carte commerciale factice.
- Le carousel de sacs ne prétend pas vendre ces sacs s’ils ne sont pas associés à un véritable produit du catalogue. Le propriétaire peut effectuer cette association dans le CRM.
- Les médias générés gardent leur provenance interne ; les originaux fournis restent disponibles. Aucun marquage d’IA n’est ajouté à l’interface publique.

Cette demande autorise explicitement la publication de ces exemples, contrairement au lot précédent qui ne préparait que des brouillons. Elle n’active pas la publication automatique des futurs brouillons du CRM.

## Vérification

- TypeScript et build client/serveur réussis.
- Suite racine complète : **3332 tests réussis, 267 fichiers ; 17 ignorés préexistants**.
- Trois nouveaux tests : présence publique des sept compositions et médias, catalogue réel et À la une préservée ; absence d’écrasement des modifications CRM ; redémarrage sur fichier SQLite conservant les modifications et la suppression.
- Migration appliquée à la base locale réelle : sept publications ajoutées, anciennes conservées.
- Navigateur Expo Web à 390 px, **sans interception réseau ni fixtures** : ouverture normale du feed, présence des exemples, rendu individuel des sept modèles, produit réel du catalogue et sélection de la deuxième miniature du carousel (`2/3`). Aucune erreur de page.
- Revue visuelle du collage et du modèle shoppable à partir des publications effectivement installées. Capture supplémentaire du collage dans le feed normal, sans filtre `post`.
- Contrôles design, identité et diff réussis. Le code mobile de rendu n’est pas modifié par ce lot ; aucun nouveau test sur téléphone physique n’est revendiqué.

Code : `src/services/publicationShowcase.ts`, installation dans `src/db/database.ts`. Tests : `tests/publication-visible-showcase.test.ts`. Logs et captures de contrôle restent dans `.cache/`, hors Git.
