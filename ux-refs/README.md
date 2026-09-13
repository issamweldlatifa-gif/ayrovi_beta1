# Références UX — Admin CRM (modèle C retenu)

Ce dossier documente le choix de direction visuelle du back office AYROVI
(remodelage P3.1, 13/09/2026).

## Choix retenu : **Modèle C — Back-office e-commerce**

Structure opérationnelle centrée sur le flux quotidien (commandes, acomptes,
clients), habillée du style clair/propres du modèle A (shadcn) et des couleurs
marque AYROVI (noir `#111318` / orange `#fe7003`).

## Application concrète (ce qui a été livré)

1. **Poste de travail** : 4 files d'action calculées en direct du backend
   (acomptes à vérifier, nouvelles commandes, support, arrivages à valider).
2. **Commandes** : ligne de KPIs cliquables au-dessus du tableau + pré-filtre
   de statut depuis le poste de travail.
3. **Pipeline visuel** : 9 étapes FR dans la fiche commande (+ état annulée).
4. **Rail** : bloc « Au quotidien » (4 écrans) + groupes CRM/ERP repliables.
   La navigation reste 100 % serveur (verrou de test `back-office-shell`).
5. Thème clair par défaut, sombre + RTL conservés (verrous E8/E9 intacts).

## Fichiers

| Fichier | Contenu |
|---|---|
| `UX-REFERENCE-GALLERY.html` | Galerie autonome (images embeddées) des 4 modèles |
| `model-a-*.jpg/png` | Modèle A — SaaS clair (shadcn, Zenith) |
| `model-b-*.webp/jpg` | Modèle B — Analytics sombre |
| `model-c-*.webp` | Modèle C — Back-office e-commerce (retenu) |
| `model-d-*.webp` | Modèle D — ERP complet |

Références publiques : Dribbble, adminlte.io, shadcnuikit.com, epicpxls.com.
