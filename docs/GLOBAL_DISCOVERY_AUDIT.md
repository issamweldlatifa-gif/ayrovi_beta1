# AYROVI — GLOBAL DISCOVERY : audit architectural & migration

**Date :** 22 septembre 2026 · **Portée :** code, base, API, admin, UI, tests
**Principe directeur :** Ayrovi n'est plus construit autour d'une liste fermée de
boutiques (SHEIN / Amazon / TEMU / AliExpress). **La source est une métadonnée,
pas l'architecture.** Le produit/objet/contenu est la cible ; un site web n'est
qu'une source possible parmi le web mondial.

```
Intention / Image / Produit / Requête
        ↓
   Ayrovi Discovery Engine            (orchestration source-agnostique)
        ↓
Recherche & découverte globales       (SerpApi = infrastructure de retrieval, inchangée)
        ↓
   Sources candidates                 (registre discovery_sources + sources dynamiques)
        ↓
Extraction / Normalisation produit
        ↓
   Rapprochement (matching) + Déduplication multi-sources (groupOffers)
        ↓
   Prix / Devise (moteur tarifaire TND existant) / Disponibilité
        ↓
   Classement AYROVI (ranking existant)
        ↓
   Flux produit / commande AYROVI existant (panier → checkout → OMS → WHS)
```

---

## 1. Cartographie KEEP / MODIFY / REMOVE / REPLACE

### REMOVE — n'existait que pour la stratégie « sources fixes »

| Emplacement | Avant | Traitement |
|---|---|---|
| `src/api/routes.ts` | `SUPPORTED_STORES = Set('amazon','shein','temu','aliexpress','generic')` bloquait le panier pour toute autre boutique | **Supprimé.** Validation ouverte : la source est un slug court valide, n'importe quelle boutique mondiale passe |
| `src/db/database.ts` (DDL `orders`) | `CHECK(source IN ('SHEIN','AMAZON','TEMU','ALIEXPRESS','OTHER','MIXED'))` | **Supprimé** (rebuild sans perte via `rebuildTableIfLegacy`) — `source` est libre |
| `src/db/database.ts` (DDL `products`) | `CHECK(source_platform IN ('SHEIN','AMAZON','TEMU','ALIEXPRESS','OTHER'))` | **Supprimé** (rebuild sans perte) |
| `src/db/database.ts` (`createOrder`) | `supportedSources` Set → toute boutique inconnue était masquée en `OTHER` | **Supprimé.** La source réelle remonte telle quelle (`MIXED` si multi-boutiques) |
| `client/index.html` | meta/OG/Twitter : « Achetez depuis SHEIN, Amazon, TEMU, AliExpress… » | **Remplacé** par « n'importe quel produit du web mondial » |
| `client/src/components/ProductDrawer.tsx` | « Prenez une photo de votre article sur SHEIN, Amazon ou TEMU. » / « Copiez l'URL … depuis SHEIN, AliExpress ou Amazon. » / placeholder `shein.com` | **Remplacé** par « où qu'il soit en ligne » / « depuis n'importe quelle boutique du monde » / placeholder neutre |
| `client/src/ayrovix/components/LensLauncher.tsx` | « SHEIN, Zara, Amazon, AliExpress… » | **Remplacé** par « Toutes les boutiques du monde » |
| `src/assistant/service.ts` (prompt SONIM) | « AYROVI commande depuis TOUTES les boutiques mondiales (SHEIN, Amazon, Zara, Temu, AliExpress, Nike, Sephora…) » | **Remplacé** par « N'IMPORTE QUELLE boutique ou marque dans le monde » |
| `src/db/database.ts` (seed `footer_about`) | « …Commandez facilement depuis SHEIN, Amazon, TEMU et AliExpress… » | **Remplacé** par « Le monde entier, livré en dinars tunisiens. » (+ data migration one-shot `global_discovery_footer_copy_v1` pour les bases existantes) |
| `src/admin/routes.ts` (resource `products`) | `enums.source_platform` liste fermée → champ select bloqué aux 4 plateformes | **Supprimé** — champ libre, toute boutique est une source valide |

### REPLACE — nouvelle abstraction globale requise

| Nouvelle pièce | Rôle |
|---|---|
| Table **`discovery_sources`** + resource back office `discovery-sources` | Registre administrable des sources : `source_id`, `domain`, `country`, `market`, `source_type` (MARKETPLACE/MERCHANT/BRAND/RETAILER/LOCAL_STORE/AGGREGATOR/GENERIC), `language`, `currency`, `capabilities` (JSON), `reliability`, `status`, `notes`. Amorcé avec les adaptateurs existants (amazon, shein, temu, aliexpress) **comme entrées de registre** + `generic` (`domain='*'`) qui couvre toute source web non encore identifiée |
| Table **`discovery_markets`** + resource `discovery-markets` | Couche marchés configurable : `code`, `country`, `language`, `currency`, `locale`, `search_params` (JSON : gl/hl SerpApi), `shipping_context`, `enabled`, `display_order`. Amorcée : TN, FR, US, GB, DE actifs ; CA, MA, DZ, AE, JP prêts (expansion progressive par configuration) |
| **`groupOffers()`** (`src/ayrovix/services/search.ts`) | Un même produit trouvé chez plusieurs sources du web devient **UN candidat avec plusieurs offres** (`offerCount`, `offers[]` triées par prix TND). Identité par signaux disponibles : marque + recouvrement des tokens du titre (Jaccard ≥ 0,6 — modèle/GTIN participent naturellement). Le catalogue AYROVI reste à part (offre propre) |
| Module ERP **`discovery`** + icônes `Globe2`/`MapPin` | Le registre existe dans le module ERP, visible dans le back office (groupe Catalogue) |
| `tests/global-discovery.test.ts` | Contrat exécutable : registres amorcés, sources libres en base, panier + commande acceptent toute boutique mondiale, déduplication multi-sources, et **aucune liste fermée ne réapparaît** dans les points d'entrée |

### MODIFY — logique réutilisable, généralisée

| Emplacement | Traitement |
|---|---|
| `src/types/index.ts` — `StoreType` | Union ouverte : les valeurs historiques restent proposées (complétion), toute nouvelle boutique acceptée (`(string & {})`) |
| `src/scraper/scraper.ts` | Les branches par boutique (ASIN Amazon, `-p-` SHEIN, `goods-` TEMU) restent des **adaptateurs d'enrichissement** réutilisables ; la détection (`detectStoreFromUrl`) est une heuristique qui retombe sur `generic` — chemin générique (`productPageParser`) par défaut pour toute URL inconnue |
| `src/ayrovix/routes.ts` — `mergeCandidates` | Applique `groupOffers` **avant** la coupe finale : la limite sert des produits distincts, pas des doublons |
| `src/ayrovix/services/search.ts` — `searchCandidates` | Idem : catalogue + candidats externes regroupés avant `filterWithFallback` |

### KEEP — réutilisable tel quel (déjà source-agnostique ou donnée de contenu)

| Emplacement | Pourquoi |
|---|---|
| `src/ayrovix/services/visualSearch.ts` | **SerpApi Google Lens** — déjà global : les `visual_matches` viennent de n'importe quel domaine marchand, avec repli « prix à confirmer ». Infrastructure de retrieval conservée (décision #3) |
| `src/ayrovix/services/search.ts` (`providerWebSearch`) | Recherche web provider-neutre, une seule requête, sans liste de sites |
| `src/services/vision.ts` | Détection OCR **par inférence** (le texte de l'image mentionne-t-il amazon.co.jp ?) — heuristique de lecture, pas un filtre ; retombe sur `generic` |
| `src/arrival-ingestion/storeProfiles.ts` + `crm_stores` | Profils de parsing par boutique pour l'ingestion CRM (factures/e-mails) — **métadonnées de sources** déjà en base, administrables, extensibles (exactement le modèle « source = donnée ») |
| `client/src/components/PartnerBrandsSlider.tsx` + seeds `brands` | Contenu CMS (marques partenaires affichées), piloté par l'Admin — donnée de contenu, pas une restriction d'architecture |
| `src/magazine/service.ts` | Vocabulaire de classification de contenu (taxonomie éditoriale) — extensible |
| Tests d'ingestion CRM (SHEIN/TEMU/NIKE…) | Fixtures de documents réels pour l'extraction — les sources restent des données valides |

---

## 2. Séparation des rôles (décisions #3, #8)

- **Retrieval** : SerpApi (visuel) + recherche web provider-neutre — inchangés.
- **Compréhension / classement / vérification** : AYROVIX (identification produit,
  scoring déterministe) et SONIM en couche d'assistance (classification, résolution
  d'ambiguïté, vérification) — jamais moteur de retrieval principal.
- **Orchestration** : source-agnostique. Aucun `if amazon / if shein / if temu`
  ne décide du parcours ; les adaptateurs par domaine sont des enrichisseurs
  optionnels du registre.

## 3. Marchés (décision #4)

`discovery_markets` = couche **de configuration** (pays, langue, devise, locale,
paramètres de recherche SerpApi `gl`/`hl`, contexte logistique). Aucune
architecture par région : activer un marché = une ligne de configuration.
Expansion progressive : TN/FR/US/GB/DE actifs, CA/MA/DZ/AE/JP prêts.

## 4. Contenu & social (décisions #9–#13) — état des lieux

Le système social existant (stories/reels/publishers, resource `stories` avec
`cta` administrable, droits via le workflow d'ingestion CRM) suit déjà le modèle
« un objet maître administrable ». Les états de droits (`Original / Licensed /
Permission Granted / UGC / Publicly Reusable / Needs Review / Rejected`) et le
« master content → déclinaisons par plateforme » sont l'étape suivante
recommandée — non inclus dans cette migration pour rester dans « la plus petite
architecture cohérente » (décision #15 : ne pas reconstruire ce qui est stable).

## 5. Vérifications

- `tests/global-discovery.test.ts` : 6/6 ✅ (registres, sources libres en base,
  panier + commande avec une boutique inconnue, déduplication, absence de liste fermée)
- Contrat back office mis à jour : `discovery-sources` / `discovery-markets`
  enregistrés (framework + navigation + icônes + module ERP) — 68/68 ✅
- Typecheck, build, suite complète : voir le run CI du commit.

## 6. Garde-fous pour l'avenir

1. Toute nouvelle « liste de boutiques » dans le code est un bug d'architecture —
   le test `global-discovery` surveille les points d'entrée principaux.
2. Une nouvelle source = une ligne dans `discovery_sources` (Admin) ou rien du
   tout (`generic` couvre le web non identifié).
3. Un nouveau marché = une ligne dans `discovery_markets` (Admin).
4. SerpApi reste l'infrastructure de retrieval ; SONIM reste une couche
   d'assistance, jamais le moteur de recherche.
