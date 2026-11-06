# Publication Phase 1 — livraison

## État

Phase 1 implémentée sur **`/publications` existante**, sans nouvel onglet ni remplacement de la navigation principale. Le document `zayrovi-publication-phase-1.md` conserve le raisonnement et les contrats envisagés ; le présent fichier décrit la livraison effective, pas les phases futures.

## Livré

- Feed blanc, Header fixe compact, logo officiel, retour/accueil, recherche de publications et accès aux notifications **du compte** déjà existantes. Pas de prétendues notifications de Likes.
- Chips For You, Fashion, Beauty, Home & Decor, Lifestyle, Trends, Technology ; filtre serveur réel. For You est un flux éditorial chronologique, **pas une recommandation personnalisée**.
- Recherche titre/sous-titre, debounce, messages de chargement/absence/réessai ; pagination cursor `(publish_at,id)` limitée à 12 par requête (30 maximum côté serveur). FlatList réellement virtualisée, hors ScrollView parent.
- Cartes portrait et compositions éditoriales compactes, textes courts, images cache AppImage. Les images utilisent `contain` pour préserver leur composition, avec fond neutre. Pas de vidéo/Carousel inventé à partir d'une photo.
- Z-Heart vectoriel, état initial d'après le compte, Like optimiste, verrou contre doubles appuis, rollback en cas d'échec, puis nombre confirmé par serveur et mise à jour du cache.
- Commentaires existants dans une Sheet, authentification conservée pour écrire. Réessai explicite de leur lecture. Réponses imbriquées non ajoutées.
- Partage natif, copie d'un lien absolu vers le post exact et aperçu web public échappé. Le lien `ayrovi://publications?post=…` ouvre le même écran natif filtré sur la publication ; brouillons et futures publications restent inaccessibles. Un partage annulé n'enregistre pas de succès.
- Produits réellement liés par le CRM : panneau de produits existants et navigation interne vers les fiches existantes. Aucun produit/prix/stock/recommandation fabriqué pour les photos générées. Aucun nouveau Cart Core.
- Restauration en mémoire des filtres/recherche/offset pour le retour de navigation et le remontage de la route. Pas de promesse de restauration après arrêt complet du processus.
- Palette blanche indépendante du mode sombre, typographies de l'application, labels FR/AR, dispositions RTL, safe areas et zones tactiles 44 pt. Status bar adaptée pendant le focus.
- Source CRM : champ Catégorie ajouté dans **Social → Publication**, validation enum/auth/CSRF/audit existants. Les anciens consommateurs de `/social/publications` conservent leur contrat.

## Contenus et identité

Quatre nouvelles photographies éditoriales ont été générées et optimisées, dans `assets/media/publications/` :

1. `editorial-style.jpg` — matières et silhouette.
2. `editorial-home.jpg` — intérieur et lumière.
3. `editorial-tech.jpg` — objets et design audio, sans marque/fiche produit fictive.
4. `editorial-lifestyle.jpg` — pause et inspiration.

La migration additive unique `publication_editorial_launch_v1` crée leurs quatre publications ; l'interface les identifie **Création visuelle IA**. Les dates sont antérieures aux publications existantes pour ne pas remplacer la sélection actuelle de À la une. Pas de résurrection à chaque démarrage. Aucun achat n'est proposé pour des objets seulement illustratifs.

Deux ressources de marque : `reactions/z-heart.svg` et `reactions/z-spark.svg`. Dessins vectoriels spécifiques, pas de nouveau caractère Emoji Unicode. Z-Heart est utilisé par le bouton Like, Z-Spark dans l'état sans résultats. Aucun picker de réactions multiples n'est présenté comme disponible.

`design/publication-feed-concept.png` est le concept AI choisi, **pas une capture de l'application**. Les captures de validation locale ont été prises séparément dans Chromium/Expo Web.

## Audit de l'ancien

L'ancienne implémentation de l'écran a été retirée et remplacée par des composants `features/publications`. Les données CRM, interactions, publications existantes et leurs photos n'ont pas été supprimées : elles sont encore utilisées par le feed, À la une ou les canaux partagés. Reels/Stories et leurs ressources ne sont pas modifiés pour simuler un nettoyage. Les quatre nouveaux médias sont indépendants et totalisent environ 505 Ko.

## Limites explicites de Phase 1

- Save/Collections et More/Report/Hide : boutons désactivés avec libellés accessibles « prochaine phase ». Aucun faux enregistrement/report. Leur backend relève de Phase 4.
- Immersive Viewer, gestes médias/post, Carousel, vidéo/streaming, hotspots, panier dans Viewer, Sponsored/Ads, recommandations intelligentes et analytics de conversion : non livrés dans Phase 1.
- **Aucune génération vidéo réelle disponible dans les outils de cette session.** Aucun MP4 vide, slideshow ou faux lecteur n'a été présenté comme vidéo générée.
- Pas de badges Sponsored factices ni de statistiques d'engagement de démonstration. Les compteurs viennent de la base.
- Validation visuelle via Expo Web ; Android/iOS sur appareils réels et nouvel APK ne sont pas inclus dans cette livraison.

## Validation

- TypeScript racine + mobile et build serveur/web : réussis.
- Suite racine complète : **260 fichiers, 3278 tests réussis, 17 ignorés**.
- Logique mobile : **113 fichiers, 1133 tests réussis**.
- UI mobile complète : **37 suites, 193 tests réussis**.
- Tests ajoutés : contrat Feed/pagination/filtres/privacité/Like authentifié/aperçu partagé/CRM ; parseur et restauration ; UI optimiste/rollback/guest/Sheet/catégories/cache.
- Chromium réel : chargement des publications, Fashion, recherche, absence de résultats, Sheet commentaires, lien natif filtré, aperçu web du post, **zéro erreur de page**. Retour depuis notifications du compte : offset avant/après **400 → 400**.

Les dernières corrections de focus/status bar, sticker d'absence et RTL compact ont également été contrôlées par typecheck et tests ciblés avant livraison. Le push d'un commit n'est pas une preuve de déploiement en production.
