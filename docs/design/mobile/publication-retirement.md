# Publication: retrait des anciens modèles

Ce document décrit le retrait historique. Le nouvel affichage mobile des publications éditées est décrit dans [Publication mobile: four reference templates](publication-reference-templates.md) ; les anciens blocs restent désactivés.

La route mobile `/publications` conserve son en-tête blanc et affiche un état vide, sans requête de contenu. Les anciens liens vers `/publication-collection/:id` redirigent vers cette entrée. Le CRM Social ne propose plus l'onglet de composition des blocs ni l'ancien aperçu de modèle dans le formulaire des Reels. La gestion des Reels, des Stories officielles, des produits temporaires et de مجلتي reste indépendante.

L'ancienne API publique de liste renvoie `200` et `data: []` sans cache pour les APK déjà installés. Le détail renvoie `404`, les blocs ne sont plus des cibles sociales et les routes CRUD Admin ont été supprimées. Aucun nouveau bloc démo n'est installé. Les anciennes lignes SQLite et les médias restent intacts : le stockage historique n'est pas une source pour les futurs modèles.
