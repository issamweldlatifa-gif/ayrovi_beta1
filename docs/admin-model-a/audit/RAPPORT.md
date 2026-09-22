# Audit de l’admin — résultats bruts

## Verdict

- écrans inspectés : **49** (tous ceux du plan de navigation servi par le serveur)
- écrans sans aucun défaut mesuré : **49 / 49** ✅
- erreurs JavaScript cumulées : **0** · réponses HTTP en échec : **0**
- sondes d’accès sans session : toutes refusées ✅
- écriture sans jeton CSRF : HTTP 403 · cookie volé après déconnexion : HTTP 401
- fuite de secrets dans les réponses admin : aucune ✅

Généré le 2026-09-22T05:02:35.652Z · 49 écrans inspectés · base http://127.0.0.1:3000

## Écran de connexion

- champs : 2 (dont 1 mot de passe) · boutons : ["Afficher","Se connecter"]
- autocomplete : 2 champ(s) · titre : AYROVI · Console d’exploitation
- étiquettes : ["Adresse email*","Mot de passe*AfficherLe mot de passe n’e"]
- cartouche d’état : ok · œil du mot de passe : « Afficher le mot de passe »
- captures : docs/admin-model-a/audit/login-desktop.png · mobile (marque masquée : true) : docs/admin-model-a/audit/login-mobile.png

## Sécurité — sondes en contexte ANONYME (aucun cookie)

- navigation : HTTP 401 (attendu 401) ✅
- commandes : HTTP 401 (attendu 401) ✅
- contenu (actualités) : HTTP 401 (attendu 401) ✅
- comptes admin : HTTP 401 (attendu 401) ✅
- réglages : HTTP 401 (attendu 401) ✅
- tarification : HTTP 401 (attendu 401) ✅
- CRM : HTTP 401 (attendu 401) ✅
- inventaire : HTTP 401 (attendu 401) ✅
- achats : HTTP 401 (attendu 401) ✅
- connexion refusée (mauvais identifiants) : HTTP 401 (attendu 401) ✅

**Verdict** : toutes les surfaces administrateur refusent un visiteur sans session ✅

- jeton CSRF délivré à la connexion : oui ✅
- écriture SANS jeton CSRF : HTTP 403 (attendu 403) ✅
- déconnexion : HTTP 200 · cookie rejoué après déconnexion : HTTP 401 (attendu 401) ✅
- fuite d'empreinte / de clé dans les réponses admin : aucune détectée ✅
- en-têtes observés : {"xFrameOptions":null,"frameAncestors":null,"contentSecurityPolicy":"présente","xContentTypeOptions":"nosniff","referrerPolicy":"strict-origin-when-cross-origin"}
- **projection production** (non mesurable ici) : /admin → {"X-Frame-Options":"DENY","frameAncestors":"frame-ancestors 'none'"} · site public → {"X-Frame-Options":"SAMEORIGIN","frameAncestors":"frame-ancestors 'self'"}
- cookie : Secure ajouté au cookie de session quand NODE_ENV=production
- cookie de session : {"name":"ayrovi_admin_session","httpOnly":true,"sameSite":"Strict","secure":false,"path":"/api/admin"}

## Écrans

| écran | service | lignes | boutons | liens | tableaux | erreurs JS | HTTP | remarques |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tableau de bord | Vue générale | 1 | 4 | 0 | 1 | 0 | 0 | — |
| Arrivages | Contenu | 2 | 9 | 0 | 1 | 0 | 0 | — |
| Produits | Contenu | 1 | 7 | 0 | 1 | 0 | 0 | — |
| Promotions | Contenu | 1 | 7 | 0 | 1 | 0 | 0 | — |
| Social | Contenu | 2 | 8 | 0 | 1 | 0 | 0 | — |
| وكيل مجلتي | Contenu | 0 | 2 | 0 | 0 | 0 | 0 | — |
| مجلتي | Contenu | 1 | 8 | 0 | 1 | 0 | 0 | — |
| Marques | Contenu | 10 | 24 | 0 | 1 | 0 | 0 | — |
| Barre sous l’en-tête | Contenu | 3 | 13 | 0 | 1 | 0 | 0 | — |
| Visuels d’accueil | Contenu | 1 | 10 | 0 | 1 | 0 | 0 | — |
| LENS | Contenu | 0 | 16 | 0 | 0 | 0 | 0 | — |
| Sections accueil | Contenu | 0 | 14 | 0 | 0 | 0 | 0 | — |
| Ticker annonces | Contenu | 5 | 14 | 0 | 1 | 0 | 0 | — |
| Produits | Catalogue | 1 | 5 | 0 | 1 | 0 | 0 | — |
| Catégories | Catalogue | 1 | 1 | 0 | 1 | 0 | 0 | — |
| Marques | Catalogue | 10 | 13 | 0 | 1 | 0 | 0 | — |
| Arrivals CRM | Commerce | 0 | 5 | 0 | 0 | 0 | 0 | — |
| Commandes | Commerce | 1 | 7 | 1 | 1 | 0 | 0 | — |
| Support IA | Commerce | 1 | 2 | 0 | 1 | 0 | 0 | — |
| Demandes Lens | Commerce | 1 | 2 | 0 | 1 | 0 | 0 | — |
| Lens — banc d’essai | Commerce | 1 | 1 | 0 | 1 | 0 | 0 | — |
| Découverte IA | Commerce | 1 | 0 | 0 | 1 | 0 | 0 | — |
| Clients | Commerce | 1 | 4 | 0 | 1 | 0 | 0 | — |
| Prix & taux | Commerce | 0 | 2 | 0 | 0 | 0 | 0 | — |
| Stock | Commerce | 1 | 4 | 0 | 1 | 0 | 0 | — |
| Rapports | Commerce | 0 | 1 | 0 | 0 | 0 | 0 | — |
| Mouvements de stock | Commerce | 1 | 5 | 0 | 1 | 0 | 0 | — |
| Inventaires | Commerce | 1 | 3 | 0 | 1 | 0 | 0 | — |
| Fournisseurs | Commerce | 1 | 4 | 0 | 1 | 0 | 0 | — |
| Commandes d’achat | Commerce | 1 | 3 | 0 | 1 | 0 | 0 | — |
| Réceptions | Commerce | 1 | 3 | 0 | 1 | 0 | 0 | — |
| Tableau de bord relationnel | CRM | 1 | 0 | 0 | 1 | 0 | 0 | — |
| Fiches clients & partenaires | CRM | 1 | 3 | 0 | 1 | 0 | 0 | — |
| Contacts | CRM | 1 | 3 | 0 | 1 | 0 | 0 | — |
| Activités | CRM | 1 | 3 | 0 | 1 | 0 | 0 | — |
| Tâches & suivis | CRM | 1 | 3 | 0 | 1 | 0 | 0 | — |
| Issues & réclamations | CRM | 1 | 3 | 0 | 1 | 0 | 0 | — |
| Employés | ERP | 1 | 3 | 0 | 1 | 0 | 0 | — |
| Organisation | ERP | 0 | 3 | 0 | 0 | 0 | 0 | — |
| Rôles & permissions | ERP | 156 | 2 | 0 | 1 | 0 | 0 | — |
| Audit (ERP) | ERP | 27 | 2 | 0 | 1 | 0 | 0 | — |
| Événements | ERP | 27 | 0 | 0 | 1 | 0 | 0 | — |
| Modules & environnement | ERP | 18 | 18 | 0 | 1 | 0 | 0 | — |
| واجهتي | Système | 0 | 80 | 0 | 0 | 0 | 0 | — |
| Développement | Système | 0 | 8 | 0 | 0 | 0 | 0 | — |
| Assistant IA | Système | 3 | 9 | 0 | 1 | 0 | 0 | — |
| Paramètres | Système | 0 | 24 | 0 | 0 | 0 | 0 | — |
| Utilisateurs | Système | 1 | 2 | 0 | 1 | 0 | 0 | — |
| Journal d’audit | Système | 27 | 4 | 0 | 1 | 0 | 0 | — |

## Détail des écrans à problème (0)
