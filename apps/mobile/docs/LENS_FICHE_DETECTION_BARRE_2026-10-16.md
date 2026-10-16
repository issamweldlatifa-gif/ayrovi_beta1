# Fiche 2 — Détection de produits dans l'image + barre de recherche flottante

**Date :** 16/10/2026 · **Suite de :** `LENS_COMPARAISON_GOOGLE_2026-10-16.md` (la fiche du flux)
**Objet :** les deux points relevés sur les captures Google Lens — (1) le système qui repère
les produits *dans* la photo, (2) la barre de recherche qu'on veut remonter en haut, toujours
visible, sans que le tiroir mange l'écran.

---

## الخلاصة (AR)

- **نظام التحديد موجود** — وما خسرنا والو في الموضوع. عندنا `/detect` (الخادم يحدّد المنتجات
  في الصورة ويرجّع **صناديق**)، وعندنا طبقة Live (الصناديق على الكاميرا مباشرة)، وعندنا
  الصناديق على الصورة بعد التصوير (يكليكي =بحث على الجزء المطلوب). اللي ناقص **موش المحرّك**:
  ناقص **القائمة** (Google يعرض «كائنات وجدناها في الصورة» وكل واحدة قابلة للبحث)، وناقص
  **الضمان** (إذا ما جاوبتش `detection` بعد 15 ثانية، نرجعو للبحث في الصورة كاملة **بلا ما
  نقولّوا للعميل**).
- **ورقة البحث**: دلوقتي هي **نصيحة مؤقّتة** (3.5 ثانية) تختفي فوق الصورة. و**الدرج** (Sheet)
  كيطلع فوق كل شي. الحل: **شريط ثابت فوق الصورة** (صورة مصغّرة + نص البحث + الميكرو + شريط
  التقدّم تحتو) — و**الدرج** يقعد في **69%** ديال الشاشة (هاد الرقم موجود توّا في
  `lensSheet.ts`)، فالصورة تبقى باينة والنتائج تتمرّ تحت الشريط.
- **الترتيب**: الشريط يوصل أوّلاً (**بلا أي تغيير في الخادم**)، بعدو القائمة ديال
  الكائنات المكتشفة (تبني على المحرك اللي عندنا توّا).

---

## 1. Le système de détection : ce qu'on a déjà

| Pièce | Où | Ce qu'elle fait | État |
|---|---|---|---|
| Détection serveur | `POST /api/ayrovix/detect` (`src/ayrovix/routes.ts:505`) | Réduit l'image à 768 px, appelle la vision, renvoie `products[]` = `{ name, category, box }` (boîtes normalisées 0..1) | ✅ en service |
| Budget détection | `src/ayrovix/services/ai.ts:707` | `AYROVIX_DETECT_TIMEOUT_MS` = 9 s (4–20 s) | ✅ |
| Client mobile | `detectProducts` (`apps/mobile/src/api/lens.ts:565`) | 15 s de délai, après quoi **repli silencieux** sur le cadre manquant | ⚠️ |
| Overlay Live | `LensLiveOverlay.tsx` | Dessine les boîtes **sur l'aperçu caméra**, tape pour choisir | ✅ |
| Boîtes après photo | `LensSelectionView.tsx:196` | Dessine les boîtes détectées sur la photo, tape une boîte → cadre | ✅ |
| Cadre manuel | `lensSelection.ts` | Rectangle à coins, déplaçable/étirable, `roi` envoyé au serveur | ✅ |
| Cercle d'attente | `LensSearchRing.tsx` | Couronne de points + balayage **autour du produit cherché** pendant l'analyse | ✅ |

**Le flux actuel :**

```
        photo ──► /detect (9 s serveur, 15 s client)
                     │
          ┌──────────┴───────────┐
          │ boîtes trouvées       │ aucune / trop tard
          ▼                       ▼
   boîtes sur la photo     cadre = toute la photo
   (tape une boîte)        (repli SILENCIEUX)
          └──────────┬───────────┘
                     ▼
              recherche sur le ROI
              (une seule cible à la fois)
                     ▼
          Sheet : « Produits similaires »
          (couvre l'écran, la photo disparaît)
```

---

## 2. Google Lens : ce que fait la détection chez lui

D'après les captures du 16/10 (11:17 – 11:18) et le comportement connu de l'application :

| Capacité Google | Sur la capture | Chez nous |
|---|---|---|
| Cadre de recadrage à **poignées** (les 4 coins) | ✅ basket et robe | ✅ نفس المبدأ — même principe (coins étirables) |
| **Liste des objets détectés** (« visual matches ») avec le nom de chacun | implicite (la zone sélectionnée en bas) | ❌ **absent** — les boîtes existent, mais **aucune liste** |
| Chaque objet détecté est ** Searching-able** séparément | ✅ | ⚠️ une seule cible à la fois, et la liste disparaît dès que le Sheet monte |
| **« Capture more »** (multi-capture) | ✅ barre flottante | ✅ équivalent (vignettes multi-photos) |
| Bouton de **traduction** | ✅ 文A | ❌ hors périmètre |
| La **photo reste visible** pendant que les résultats s'affichent | ✅ | ⚠️ le Sheet peut monter plein écran |
| Barre de recherche **flottante en haut**, toujours visible | ✅ | ❌ (une simple notice temporaire) |

---

## 3. Ce qu'il manque — 3 pièces, pas un moteur

### D1 — La liste des objets détectés (le « visual matches ») · **P1**
Aujourd'hui les boîtes existent **sur la photo**, mais quand le Sheet monte, la photo sort de
l'écran : l'utilisateur ne voit plus **ce qui a été repéré**, seulement des cartes produits.
C'est l'information que Google met au premier plan.

**Cible :** une bande horizontale de puces (« basket Nike », « robe à carreaux », « sac à main »)
sous la barre de recherche. Chaque puce = un objet détecté, avec le **nombre de produits trouvés**
pour cette cible. Taper une puce → la recherche bascule sur ce ROI ; la photo **revient visible**
et la boîte correspondante s'allume.

```
┌──────────────────────────────────────────────┐
│  ⟲   [vignette] Rechercher des produits…  🎤  │  ← barre flottante (nouvelle)
│  ━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░░░░░░░░  │  ← progression
├──────────────────────────────────────────────┤
│  ┌──────────┐                                │
│  │          │        PHOTO                    │  ← toujours visible
│  │  ◻       │     (cadres détectés)           │
│  └──────────┘                                │
├──────────────────────────────────────────────┤
│  🔎 basket Nike (3)  robe à carreaux (1)  …  │  ← puces des objets détectés (nouveau)
├──────────────────────────────────────────────┤
│  ┌────────┐ ┌────────┐                       │
│  │ carte  │ │ carte  │   ← résultats         │
│  └────────┘ └────────┘                       │
└──────────────────────────────────────────────┘
```

**Where :** nouveau composant `apps/mobile/src/features/lens/LensDetectedChips.tsx` ; données =
`sessionPhoto.products` (déjà là, `LensDetectedProduct[]`) ; la sélection d'une puce réécrit
`photo.selection` et relance `searchSelection` (déjà écrit, `lens.tsx`).
**Aucun changement serveur.**

### D2 — La détection ne doit pas échouer en silence · **P1**
`LENS_DETECT_TIMEOUT_MS = 15 s` : passé ce délai, l'app **abandonne la détection** et cherche dans
**toute la photo** — sans jamais le dire. Résultat : des produits « moins proches », et
l'utilisateur croit que l'application a mal vu.

**Cible :** distinguer trois états et les afficher :
| État | Cause | Ce qu'on montre |
|---|---|---|
| `detected` | ≥ 1 objet | les boîtes + les puces |
| `noObject` | la vision a répondu « rien » | « Aucun produit repéré · agrandissez la zone » + cadre manuel |
| `unavailable` | fournisseur lent/HS (9 s serveur, 15 s client) | « Détection indisponible — recherche sur la photo entière » + le cadre **reste déplaçable** |

Le 3ᵉ état est le seul qui justifie de chercher « dans toute la photo » — et il doit être dit.

### D3 — Comparer deux cibles · **P2**
Google garde la liste quand on change de cible. Nous : changer de cible **remplace** la grille.
Cible : la grille garde les résultats de la cible précédente dans un historique court (« 3 autres
résultats pour *robe à carreaux* »), ou au minimum les puces rappellent la cible courante.

---

## 4. La barre de recherche flottante (le point 2)

### 4.1 Où elle est aujourd'hui

| Élément | Aujourd'hui | Où |
|---|---|---|
| « Recherche des produits de la photo… » | **Notice temporaire** de 3,5 s au-dessus de la photo, puis elle disparaît | `styles.tip` (`lens.tsx:1383`), `showTip(..., 3_500)` |
| La requête dite | **Nulle part** — on ne sait pas ce qui est cherché | — |
| La progression | **Nulle part** | — |
| « Annuler » | Dans le Sheet, donc invisible quand la photo est couverte | `LensSearchSkeleton` |
| La photo | **Cachée** dès que le Sheet monte (le geste permet le plein écran) | `lensSheet.ts` (3 crans) |

### 4.2 La cible

Une barre **fixe au-dessus de la photo**, toujours visible, que le Sheet monte ou non.

```
┌──────────────────────────────────────────────┐
│  ⟲  Z Lens                                   │  ← en-tête (retour, titre)
├──────────────────────────────────────────────┤
│  ┌────────────────────────────────────────┐  │
│  │ [vignette] Rechercher des produits…  🎤 │  │  ← BARRE FLOTTANTE (posée sur la photo)
│  └────────────────────────────────────────┘  │
│  ━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░░░░░░░░  │  ← progression (2 px)
│                                              │
│              PHOTO + CADRES                  │  ← visible en permanence
│                                              │
├──────────────────────────────────────────────┤
│  Produits similaires            ✕ Annuler   │  ← le Sheet commence ici (69 %)
│  Lecture des fiches 4/8…                     │
│  ┌────────┐ ┌────────┐                      │
```

### 4.3 Les règles (nombres, pas intentions)

| Règle | Valeur | Source / à changer |
|---|---|---|
| Hauteur de la barre | 52 px (+ 6 px de marge) | nouveau |
| La barre flotte **sur** la photo, sous l'en-tête | `top = insets.top + 58` (= `photoTop`) | `lens.tsx:992` |
| Le Sheet au repos commence **sous** la barre | `restTop = max(69 % de l'écran, bas de la barre + 8)` | `LENS_SHEET_REST_RATIO = 0.69` (existe déjà) |
| Cran « aperçu » | 112 px visibles (poignée + titre) | `LENS_SHEET_PEEK` (existe déjà) |
| La photo reste visible au repos | oui, 31 % de l'écran | idem |
| Le Sheet **peut** toujours être hissé plein écran | oui (3 crans, geste existant) | `lensSheet.ts` |
| La progression | barre de 2 px sous la barre, largeur = `done/total` (ou une pulsation si `total` inconnu) | nouveau |
| « Annuler » | **dans la barre** (croix à droite), pas dans le Sheet | à déplacer |
| L'étape courante (« Produit identifié », « Lecture des fiches 4/8 ») | **dans la barre**, en dessous du texte | à créer (fiche 1, E1) |
| Le Sheet ne couvre jamais la barre | `zIndex` : barre 4, Sheet 5 — **mais** la barre doit passer **au-dessus** du Sheet quand il est hissé | à corriger |

### 4.4 Ce que la barre affiche, selon l'état

| État | Barre | Sheet |
|---|---|---|
| Photo prise, détection en cours | vignette + « Recherche des produits de la photo… » + spinner léger | encore fermé (aperçu) |
| Recherche en cours | vignette + **étape** (« Produit identifié » / « Lecture des fiches 4/8 ») + progression | repos (69 %), squelette **réduit à la place des cartes manquantes** |
| Résultats arrivés | vignette + **la requête** (« Nike Air Max 270 — 12 résultats ») | repos, grille remplie |
| Erreur / délai dépassé | vignette + message court (« Lecture trop longue — 6 produits trouvés ») | repos, **résultats partiels conservés** |

### 4.5 Critères de recette

1. La barre est visible **pendant** toute la recherche, Sheet au repos comme hissé.
2. La photo ne disparaît jamais au cran de repos ; le geste de hissage reste possible.
3. « Annuler » est atteignable **sans** faire défiler le Sheet.
4. L'étape affichée change au moins une fois par recherche (pas de message uniquefigé).
5. La barre ne montre **jamais** de prix ni de nom de marque que le serveur n'a pas envoyés.
6. La barre respecte le RTL (arabe) : vignette à droite, actions à gauche.

---

## 5. Ordre de travail, dépendances, risques

| # | Lot | Dépend de | Serveur ? | Risque |
|---|---|---|---|---|
| 1 | **Barre flottante** (statique d'abord : vignette + étape + Annuler) | — | non | le Sheet passe au-dessus de la barre : vérifier les `zIndex` et le geste de hissage |
| 2 | Barre **vivante** (progression, requête) | fiche 1 (SSE + `progress`) | non | sans SSE, la barre reste « muette » — d'où l'ordre |
| 3 | **Puces des objets détectés** (D1) | détection existante | non | la liste doit survivre à la montée du Sheet ; la recherche par puce relance une requête complète |
| 4 | **États de détection explicites** (D2) | — | non | le fournisseur de vision peut être lent : le délai doit rester court (9 s serveur) |
| 5 | Comparaison multi-cibles (D3) | D1 | non | coût : chaque cible = une recherche Lens de plus (quota SerpApi) |

**Le rappel qui vaut pour toute la ligne :** la détection et la recherche Lens consomment du
quota (SerpApi) et du temps serveur. Chaque cible ajoutée = une requête de plus. On ne les
multiplie pas « pour voir » : une cible = un objet **que l'utilisateur a choisi**.

---

## 6. Références

| Sujet | Fichier |
|---|---|
| Détection (serveur) | `src/ayrovix/routes.ts:505` · `src/ayrovix/services/ai.ts:707` |
| Détection (client) | `apps/mobile/src/api/lens.ts:563` (`LENS_DETECT_TIMEOUT_MS`) |
| Boîtes + cadre | `apps/mobile/src/features/lens/LensSelectionView.tsx` · `lensSelection.ts` |
| Overlay Live | `apps/mobile/src/features/lens/LensLiveOverlay.tsx` |
| Cercle d'attente | `apps/mobile/src/features/lens/LensSearchRing.tsx` |
| Géométrie du Sheet (3 crans, 69 %, aperçu 112 px) | `apps/mobile/src/features/lens/lensSheet.ts` |
| Notice temporaire à remplacer par la barre | `apps/mobile/app/lens.tsx:1383` (`styles.tip`), `showTip` |
| Contrôle de la recherche (ROI) | `apps/mobile/app/lens.tsx` (`searchSelection`) |
| Contrat SSE (pour la barre vivante) | `src/ayrovix/routes.ts:186-505` · fiche 1, §3 |

---

## 7. État d'implémentation (16/10/2026)

| Point | Fait | Où |
|---|---|---|
| **Barre flottante** (le point 2) | Pastille givrée en haut : vignette de la photo + étape en cours + annulation. Elle remplace le titre tant qu'une photo est analysée | `apps/mobile/src/features/lens/LensSearchBar.tsx` · `apps/mobile/app/lens.tsx` |
| **D1 — puces des objets repérés** | Bande horizontale sous la barre : une puce = un objet repéré. Taper une puce = reprendre la recherche sur cette zone (la photo revient visible, la boîte s'allume) | `apps/mobile/src/features/lens/LensDetectedChips.tsx` |
| **D2 — états de détection explicites** | Trois états, tous dits : `detected` (des objets repérés) · `noObject` (« aucun produit repéré — agrandissez la zone ») · `unavailable` (« détection indisponible — recherche sur la photo entière »). Le 3ᵉ est le seul qui justifie la recherche « dans toute la photo », et il est dit | `apps/mobile/app/lens.tsx` (`detectionState`) |
| **Le nombre de produits par cible** | Affiché **uniquement** pour la cible cherchée : les autres cibles n'ont pas encore été cherchées — pas de score inventé | `LensDetectedChips.tsx` |
| **D3 — comparaison multi-cibles** | **Non fait** : chaque cible = une requête Lens de plus (quota SerpApi, temps serveur). Reste une décision de produit | — |

Le flux SSE (E1, E3) est la condition du « P0 live bar » : la barre affiche l'étape réelle
envoyée par le serveur (`progress`), pas une animation de façade.
