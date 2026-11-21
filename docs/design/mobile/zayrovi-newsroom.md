# Zayrovi News et Social Shopping — Accueil mobile

## Zayrovi News

Sous le Hero, deux raccourcis natifs : **Zayrovi News** et **Social Shopping**. Le menu de navigation principal et la page Publications restent disponibles ; la cover d’accueil précédemment dédiée aux Publications est remplacée, sans toucher au lecteur vidéo.

Le Newsroom a une barre fixe (retour, recherche locale, menu), un article illustré « À la une », puis **Dernières actualités**, **Nos outils** et **À propos de Zayrovi**. Les actualités et dossiers reprennent la photo carrée et la copie alignée à côté ; sans photo, l’article est présenté en ligne, sans image fictive. Le premier élément illustré de la rubrique Actualités devient À la une. Le menu permet d’isoler une rubrique ; la recherche porte uniquement sur le contenu public du Newsroom déjà chargé. Les images, titres et résumés renvoient au contenu exact, sans lancer automatiquement une autre vidéo.

**CRM → Contenu → Zayrovi News** : choisir la rubrique d’une carte, son ordre, la publication, son image optionnelle, son accroche et l’article complet FR/AR. Dans un article, `## ` introduit un intertitre et un retour à la ligne sépare deux paragraphes. Un article d’outil peut ouvrir Z Lens, Clean ou AYWEBs par une destination native choisie dans une liste, sans lien libre. Quatre guides éditoriaux sont fournis (les trois outils et À propos) et peuvent être masqués avec une case CRM. Les anciennes cartes sans rubrique restent dans Actualités. L’offre du jour et son calcul restent inchangés.

## Cover Social Shopping

**CRM → Contenu → Cover d’accueil** : choisir **Social Shopping (cover mobile)** pour modifier le titre, le bouton ou l’image ; la première image ou affiche de vidéo valide est utilisée, sans lecture vidéo. Une image éditoriale Zayrovi intégrée est utilisée si aucune photo n’est fournie. L’ancien réglage Publications donne cette même image de remplacement sur la nouvelle application sans effacer les médias stockés. Les destinations Catalogue et Promotions continuent de fonctionner. Désactiver la cover la masque aussi dans le nouvel APK démo quand l’API mobile indique explicitement qu’elle est désactivée.

Le nouveau rendu utilise `GET /api/public/home-cover?surface=mobile` ; sans ce paramètre l’ancien comportement de la cover est conservé. Le flux complet Newsroom expose les guides et rubriques sans les ajouter à l’appel léger de l’offre du jour sur Home. Aucune migration de schéma et aucune modification du site public.
