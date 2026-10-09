# recette carrousel Hero — à exécuter sur appareil / émulateur

**Date** : 2026-10-09 · **Branche** : `arena/bc19f283-ayrovi-beta1` · **PR** : #27

Cette matrice complète les tests automatisés (2555 racine + 442 mobile, tous verts) :
elle valide le **rendu réel** sur un appareil, une fois les visuels uploadés.

## Pré-requis

- APK démo à jour (artefact `AYROVI-demo-apk`, build du 09/10 02:45 — contient le carrousel)
  ou app de dev sur émulateur.
- Admin : les campagnes `hero_card_*` uploadées (image 4:5) et **activées**
  (elles sont seedées inactives — rien n'est publié sans visuel approuvé).

## Procédure Admin (avant le test)

1. Admin → « Hero Slider » → ouvrir une campagne seedée (`hero_card_tech`, `hero_card_mode_homme`,
   `hero_card_mode_femme`, `hero_card_sport`, `hero_card_streetwear`, `hero_card_designer`).
2. Uploader l'image 4:5 → la **palette se calcule à l'enregistrement** (champ « Palette extraite », lecture seule).
3. Vérifier : destination (type + valeur), titres FR/AR, CTA, ordre d'affichage, fenêtre de publication.
4. Activer (Visible = oui).
5. Admin → « Carrousel Hero » → vérifier l'**aperçu mobile** (carte, fond adaptatif, fondu,
   carte voisine, points) et régler autoplay / pagination si besoin.

## Matrice (à cocher)

| # | Test | Étapes | Résultat attendu | Statut |
|---|------|--------|------------------|--------|
| 1 | Affichage de base | Ouvrir l'accueil | Carrousel sous les annonces, au-dessus des onglets ; carte 4:5 (image, titre, CTA) | ☐ |
| 2 | Fond adaptatif | Swiper entre 2 cartes | Le fond de la section transitionne doucement vers la couleur de la carte active | ☐ |
| 3 | Fondu | Observer le bas d'une carte | Le bas de l'image se fond dans le fond de la carte (dégradé) | ☐ |
| 4 | Pagination | Regarder sous le carrousel | Points visibles ; « carte X sur N » annoncé au lecteur d'écran | ☐ |
| 5 | Carte voisine (peek) | Regarder le bord du carrousel | La carte suivante dépasse — découvrabilité du swipe | ☐ |
| 6 | Tap → destination | Taper une carte | Navigation vers la destination choisie (ex. `/promotions`) | ☐ |
| 7 | RTL (arabe) | Passer l'app en arabe | Liste inversée, rangée miroir, swipe droite → gauche | ☐ |
| 8 | Module désactivé | Admin → « Carrousel Hero » → éteindre | L'ancien hero réapparaît, aucun trou blanc | ☐ |
| 9 | Aucune carte active | Désactiver toutes les cartes | Repli sur l'ancien hero | ☐ |
| 10 | Image cassée | Carte avec URL morte (test temporaire, à remettre après) | Cadre de secours avec icône, pas de trou blanc | ☐ |
| 11 | Autoplay | Activer dans « Carrousel Hero » | Défilement auto (~5 s) ; pause au toucher, hors foyer, arrière-plan | ☐ |
| 12 | Mouvement réduit | Activer « Réduire les mouvements » (réglages OS) | Transitions instantanées, pas d'autoplay | ☐ |
| 13 | Contraste | Lire titre/CTA sur chaque carte | Lisible — l'encre suit la luminance du fond effectif | ☐ |
| 14 | Thèmes | Clair, puis sombre | Correct dans les deux | ☐ |
| 15 | Tailles + font scaling | Téléphone étroit, tablette, texte système agrandi | Pas de débordement, rien de tronqué | ☐ |
| 16 | Safe areas | Appareil avec encoche / barre de gestes | Aucun contenu caché | ☐ |
| 17 | Non-régression | Recherche (AppHeader), navigation, Lens, AYWEBs, panier | Tout fonctionne comme avant | ☐ |
| 18 | Hors-ligne | Couper le réseau, ouvrir l'accueil | Repli propre (état hors-ligne / ancien hero), pas de crash | ☐ |
| 19 | Arrière-plan | Quitter l'app 30 s, revenir | État du carrousel sain | ☐ |

## Télémétrie (optionnel)

- Impressions et clics partent en **fire-and-forget** (ne bloquent jamais l'UI) ;
  table `hero_events` (empreinte HMAC, sans donnée personnelle, rate-limité).

## À remplir

- Appareil / émulateur : ____________ · OS + version : ____________
- Date : ____________ · Testeur : ____________
- Échecs constatés : ____________ (à remonter)
