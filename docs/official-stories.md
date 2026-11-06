# Stories officielles — 6 novembre 2026

## Surface livrée

- Accueil mobile : entre **À la une** et **LENS**, dans les séparateurs et marges habituels. Fond noir pleine largeur, composants typographiques de l’application, rail horizontal portrait utilisant la géométrie Hero (aperçu de la carte suivante), textes en surimpression et support FR/AR.
- Sept photographies distinctes fournies par le propriétaire, optimisées dans `assets/media/stories/`. La seconde image du collage vêtements, identique à la première, est exclue.
- Le libellé **Explorez toutes les stories →** reste visible, sans destination ni interaction. Il ne lance ni ancien viewer ni fausse navigation.
- Web et route mobile `/stories` réutilisent la nouvelle galerie officielle ; les anciens cercles et viewers ont été retirés de ces surfaces.

## CRM

**Contenu → Stories officielles** (`/admin?section=stories`) ouvre l’éditeur dédié. Le registre serveur déclare cette surface comme `custom`, avec les mêmes permissions CMS et les contrôles API existants (session, permission d’écriture, CSRF et audit). Le client désactive les actions d’écriture en lecture seule. L’ancien formulaire générique et l’onglet Story de Social ont été retirés : un seul éditeur officiel.

- Conteneur : titre, sous-titre et libellé Explore FR/AR, visibilité, nombre de cartes affichées.
- Cartes : ajout, remplacement/upload d’image, titres et descriptions FR/AR, priorité, statut publié/brouillon/retiré et retrait.
- Priorité décroissante ; le CRM est paginé à 100 cartes. Le nombre affiché accepte 1 à 1000, initialisé à 7. Augmenter ce nombre pour afficher davantage de cartes après ajout.

## Audit de dépendances et remplacement

Les éditeurs et endpoints Stories existants partagent des tables/services avec Publications, Reels et les produits de contenu. Ils n’ont donc pas été supprimés aveuglément.

La migration unique `official_stories_editorial_v1` :

1. Crée, pour une base fichier contenant d’anciennes Stories, une copie SQLite complète par `VACUUM INTO` dans `data/backups/before-official-stories-*.sqlite` (ou le dossier `backups` voisin du chemin de base configuré). Un échec de copie bloque le remplacement. Ces sauvegardes contiennent les données de la base et doivent rester privées, hors Git.
2. Dans une transaction, remplace uniquement les lignes Stories, leurs associations `content_products` et leurs interactions `target_kind='story'`. Archive les anciens brouillons de type Story.
3. Reconstruit les réglages pour lever l’ancien `CHECK(card_count IN (4,5))`, ajoute les champs bilingues et publie les sept nouvelles cartes.
4. Conserve les canaux `story_publishers`, aussi utilisés par Publications et Reels, ainsi que leurs contenus/associations/interactions. Les fichiers médias partagés ne sont pas effacés.

Les API existantes `/stories` et `/stories-showcase` servent désormais le nouveau contenu. Les anciens seeds de démonstration Stories sont retirés. La migration ne se rejoue pas au redémarrage : les éditions, retraits et changements du nombre de cartes persistent, sans résurrection des anciennes Stories.

Déploiement : mettre à jour le serveur et les clients ensemble, garder le dossier de données et ses sauvegardes persistants et vérifier la présence des sept images versionnées. Le premier démarrage du serveur effectue le remplacement demandé. Les changements du dépôt ont été poussés ; cela ne constitue pas à lui seul un déploiement en production ni une compilation APK.

## Vérifications exécutées

- TypeScript serveur/web et mobile : succès.
- Build serveur + web : succès.
- Suite racine complète : **258 fichiers, 3271 tests réussis, 17 ignorés**.
- Logique mobile : **112 fichiers, 1130 tests réussis**.
- UI mobile : **36 suites, 187 tests réussis**.
- Régression SQLite : vraie ancienne contrainte 4/5, sauvegarde, remplacement, conservation de Publications/Reels et persistance après redémarrage.
- API : sept images accessibles, texte bilingue, session/CSRF, ajout d’une huitième carte, ordre, édition, brouillon/retrait et rejet de média dangereux.
- Chromium réel : galerie native via Expo Web et galerie web avec sept cartes, sans erreur de page ; navigation directe CRM, sept cartes, ouverture du formulaire, modification enregistrée puis restaurée via l’interface et contrôle de sa persistance par API. Captures locales réellement prises dans le navigateur, non générées.

La validation visuelle mobile a été faite via Expo Web ; elle ne remplace pas un essai sur téléphone Android/iOS. Aucun APK n’a été produit pendant cette tâche.
