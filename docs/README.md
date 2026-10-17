# AYROVI — Documentation

Cette documentation complète le `README.md` à la racine. Les fichiers qui se trouvaient
auparavant à la racine du dépôt (37 `.md` + 1 `.csv`) ont été réorganisés en **sous-dossiers
thématiques** pour distinguer les documents de référence stables des rapports d’étape
datés. Tous les chemins relatifs entre documents ont été mis à jour.

## Sommaire

| Dossier | Contenu | Type |
|---|---|---|
| `../apps/mobile/` | **Application mobile native (React Native + Expo SDK 57, Expo Router)** — 287 fichiers, écrans natifs, WebView pour les pages marchands uniquement. Voir `apps/mobile/PLAN.md`. | Application |
| `admin/` | Admin CMS (référence stable) | Manuel |
| `architecture/` | Architecture à l’échelle, garde-fous | Manuel |
| `audits/` | Audits ponctuels datés (rapports) | Historique |
| `auth-review/` | Revues d’authentification | Historique |
| `ayrovix/` | Audits produit & performance Ayrovix Lens | Historique |
| `back-office/` | Rapports P2.0 → P2.3 du back-office | Historique |
| `crm/` | Architecture, modèle de domaine, API, permissions, workflows, matrice de tests, audit baseline, rapport de clôture (référence CRM) | Manuel |
| `design/` | Rapports Design P3/T1, T1-bis, T2 et Zalando P4/T1–T2 | Historique |
| `editorial/` | Maquettes éditoriales HTML et revue d’icônes | Exploration |
| `erp-core/` | Audits et rapports ERP Core (P0/P1, table de décision) | Manuel + Historique |
| `footer-payments/` | Spécifications du pied de page et des paiements | Manuel |
| `icon-refs/`, `identity-a/`, `admin-model-a/`, `lens-product-cards/`, `lens-results/`, `lens-phase1/`, `ayrovi-2026-10-03/`, `admin-prototypes*/`, `public-additions/`, `public-navigation/`, `site-structure/`, `security/` | Ressources de design et explorations | Exploration |
| `lens/` | Audits Lens, plan de stock live, phase 0 | Historique |
| `plans/` | Plans stratégiques (P2 → P5, Boutique v2, transformation Back-Office, catalogue P2.1, plan de correction) | Référence |
| `product/` | Moteur de composition d’images (référence produit) | Manuel |
| `android/` | Guide de l’application Android (référence plateforme) | Manuel |

## Fichiers de racine

- `../CHANGELOG.md` — journal des modifications versionné.
- `../README.md` — point d’entrée du dépôt (installation, démarrage, vérificateurs).

## Conventions

- Les **manuels de référence** (CRM, ERP, Admin CMS, Product, Android, Architecture) gardent
  des noms courts et stables : `API.md`, `ARCHITECTURE.md`, etc.
- Les **rapports datés** conservent leur préfixe d’origine (`P2_3_REPORT`, `P3_T1_REPORT`,
  `AUDIT_2026-09-05`, etc.) pour rester cherchables depuis l’historique Git.
- Les **plans** (sous `plans/`) sont des documents vivants : leurs références internes
  utilisent toujours des chemins relatifs par rapport à leur dossier.
