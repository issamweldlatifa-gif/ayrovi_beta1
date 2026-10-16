# Fiche comparative — Z Lens (notre app) vs Google Lens

**Date :** 16/10/2026 · **Source :** 6 captures d'écran de l'appareil de test (11:17 → 11:19)
**Portée :** l'écran « photo → résultats » de l'application mobile `apps/mobile` (Z Lens),
comparé à l'application Google Lens, sur les **mêmes deux photos**.

---

## الخلاصة (AR)

- **إحنا ما نجاوبوش على الصورة.** Google Lens يجاوب بجملة وحدة فيها الماركة والموديل والمجموعة
  (« This look features the Stormy Jacket and Mini Bell Skirt from Vivienne Westwood's
  Autumn-Winter 2026/27 collection ») + رابط للمصدر. إحنا عندنا نفس المعلومة في
  `identification` (brand / model / description) و**ما نعرضوهاش أبداً**.
- **الانتظار عندنا بلا مؤشّر.** Google يبيّن شريط تقدّم + « Thinking… ». إحنا نبيّنو جدار
  ديال squelettes بلا سطر يقول واش راهو يتقدّم.
- **النتائج ما توصلوش واحد واحد.** السيرفر **كيبعث** حدث `card` حدث حدث — الـ web كيستعملو
  (SSE)، أما التطبيق ديال الهاتف **لا**: طلب واحد مت.toolsني حتى النهاية. النتيجة: إما كلشي
  دفعة وحدة بعد 30-45 ثانية، إما والو.
- **الفرق ماشي في الخوارزمية — في النقل (transport).** نفس السيرفر، نفس المحرك. الـ web عندو
 _streaming_، الهاتف لا.
- **الوقفة الحقيقية:** في تصور ديال 11:17 تصوّرنا، و إلى 11:19 ما كاين والو —
  دقيقة ونص بلا حتى جواب ولا خطأ ظاهر.

---

## 1. Les captures, ce qu'elles montrent

| # | Heure | Application | Ce qui est visible | Ce que la capture **prouve** |
|---|---|---|---|---|
| 1 | 11:17 | **Google Lens** | Photo (basket Nike bleue), cadre de recadrage à poignées, bouton de traduction (文A), barre de recherche (G + vignette + micro), barre de progression bleue à moitié remplie, onglets « AI Mode » / « All », libellé « Thinking… » | Google **annonce l'activité** et **structure en onglets** avant même le premier résultat |
| 2 | 11:18 | **Google Lens** | Idem sur la photo de la robe à carreaux, plus une barre flottante « Capture more » (partage / crayon / Capture more) | La **multi-capture** est une action de premier plan |
| 3 | 11:18 | **Google Lens** | Résultat : onglet « All », section **« ✦ AI Overview »**, réponse en clair — « This look features the Stormy Jacket and Mini Bell Skirt from **Vivienne Westwood**'s Autumn-Winter 2026/27 collection. » — avec le nom de la marque en **lien bleu** (la source), points de carrousel, puis les cartes marchandes | Google **répond en langage naturel et cite sa source** avant les cartes produits |
| 4 | 11:19 | **Z Lens** | Barre « Z Lens », photo (basket) + cadre de recadrage à poignées + pastille « Recherche des produits de la photo… », le tiroir « Produits similaires » commence à monter | Notre cadre de recadrage **existe déjà** et ressemble à celui de Google |
| 5 | 11:19 | **Z Lens** | Tiroir « Produits similaires » + « Annuler », sous-titre « Nous cherchons des produits similaires… », grille 2 colonnes de cartes **squelettes grises** | Notre état d'attente est **un mur de squelettes** : rien n'indique que le travail avance |
| 6 | 11:19 | **Z Lens** | Idem sur la photo de la robe | **Le blocage n'est pas lié à la photo** (chaussure et robe se comportent pareil) |

**Lecture d'ensemble :** sur les 3 captures Google, on voit une **réponse** et une **progression**.
Sur les 3 captures Z Lens, on voit une **attente** et un **squelette**. La photo est la même des
deux côtés : le problème n'est pas la reconnaissance.

---

## 2. Tableau comparatif — le parcours vu par l'utilisateur

| Étape | Google Lens | Z Lens (aujourd'hui) | Écart |
|---|---|---|---|
| Capture / import | Barre Google + vignette de la photo + micro | Photo plein cadre + cadre à poignées + pastille « Recherche des produits de la photo… » | **Comparable** (le nôtre est même plus lisible) |
| Recadrage | Cadre à poignées + bouton traduire | Cadre à poignées | **Équivalent** (traduction = hors périmètre) |
| Multi-capture | Barre flottante « Capture more » | Vignettes multi-photos dans la séance | **Équivalent** |
| Onglets | « AI Mode » / « All » | Un seul écran | **Écart mineur** (voir §4, E5) |
| Progression | Barre de progression + « Thinking… » | **Rien** — squelettes muets | **Écart majeur — E1** |
| Réponse en texte | « ✦ AI Overview » : identification du produit + source cliquable | **Absente** | **Écart majeur — E2** |
| Résultats | Cartes marchandes, arrivant progressivement | **Rien jusqu'à la fin** (ou tout d'un coup) | **Écart majeur — E3** |
| Annulation | (non visible sur ces captures) | « Annuler » présent — coupe le client, **le serveur continue de travailler** | **Écart — E6** |
| Verdict visible | « AI Overview » + cartes | Rien affiché après 2 minutes | — |

---

## 3. Tableau comparatif — l'état technique (le même serveur, deux clients)

| Couche | Google Lens (web) | Z Lens (mobile) |
|---|---|---|
| Transport | `fetch` + `Accept: text/event-stream` → `response.body.getReader()` | `expo-file-system` `File.upload()` → **réponse JSON complète**, bloquante |
| Timeout client | `LENS_STREAM_IDLE_MS = 40 s` (silence) / `LENS_JSON_TIMEOUT_MS = 60 s` | `LENS_TIMEOUT_MS = 60 s` (`src/api/lens.ts:17`) |
| Événements consommés | `progress` · `card` · `done` · `error` | **aucun** |
| Ce que voit l'utilisateur | barre de progression, cartes qui remplissent la grille | un squelette jusqu'à la fin |
| Code | `client/src/ayrovix/services/lensApi.ts` (stream) · `client/src/ayrovix/services/lensStream.ts` (parseur) | `apps/mobile/src/api/lens.ts:541` · `apps/mobile/src/api/nativeUpload.ts:41` |

**Côté serveur, le contrat existe déjà** (`src/ayrovix/routes.ts:186-505`) :

| Événement SSE | Contenu | Émis à la ligne |
|---|---|---|
| `progress` | `{ step: 'identified' \| 'searching' \| 'reading', done?, total? }` | `routes.ts:358,360,382,391` |
| `card` | un candidat complet, **un par un** | `routes.ts:394,465` |
| `done` | `{ eventId, query, identification, excluded, liveStock }` | `routes.ts:467` |
| `error` | `{ code, error }` — dont `ANALYZE_TIMEOUT` | `routes.ts:228,474` |

Et le délai global existe aussi : `LENS_ANALYZE_DEADLINE_DEFAULT_MS = 45 s`
(`src/ayrovix/services/lensDeadline.ts:7`), borné 15–90 s, piloté par
`AYROVI_LENS_ANALYZE_DEADLINE_MS`.

> **Conclusion de la fiche : le serveur parle déjà SSE. Le téléphone ne l'écoute pas.**
> C'est un travail de **transport côté client**, pas de re-ingénierie du moteur.

---

## 4. Les écarts, par priorité

### E1 — Aucun retour progressif (le tiroir paraît figé) · **P0**
- **Où :** `apps/mobile/app/lens.tsx:1055` → `LensSearchSkeleton` (message statique
  `lens.searchingFriendly`, `src/i18n/fr.ts:603`).
- **Pourquoi c'est grave :** l'utilisateur ne sait pas si l'application travaille ou si elle a
  planté. Google le dit en permanence (« Thinking… » + barre).
- **Correction :** écouter `progress` et afficher l'étape + le compteur `done/total`
  (« Lecture des fiches marchandes 4/8 »), plus un chrono écoulé.

### E2 — Pas d'« AI Overview » (pas de réponse en clair) · **P0**
- **Où :** `identification` est **analysé** côté mobile (`src/api/lens.ts:133,424`) mais
  **n'est affiché nulle part** (`grep -r identification apps/mobile/app/lens.tsx` → 0 résultat).
- **Pourquoi c'est grave :** c'est l'information la plus utile et la **plus rapide** : elle
  arrive à l'étape `identified`, bien avant les premières fiches marchandes. Google en fait sa
  section principale.
- **Correction :** une carte « identification » en tête du tiroir — description, marque, modèle,
  confiance — **dès l'événement `identified`**, avec un lien vers la source.

### E3 — Les résultats n'arrivent pas en continu · **P0**
- **Où :** `apps/mobile/src/api/lens.ts:541` (`analyzeImage`) → `apiUploadFileData` attend le
  corps **entier** avant de parser le JSON.
- **Correction :** passer en flux (voir §5) ; la grille se remplit à chaque `card`.

### E4 — Le délai serveur (45 s) jette tout le travail · **P1**
- À l'expiration du délai, le serveur répond `error / ANALYZE_TIMEOUT` et le client passe en
  écran d'erreur (`lens.tsx` → `stage.kind === 'error'`) : **on perd même les cartes déjà reçues**.
- **Correction :** en flux, le délai devient une **fermeture** : on garde les résultats partiels et
  on affiche « X produits trouvés — la lecture se poursuit ».

### E5 — Un seul écran là où Google en a deux · **P2**
- « AI Mode » (la réponse) / « All » (les cartes). Équivalent Z Lens possible :
  **« Identifié »** (la réponse) / **« Produits »** (la grille) — un contrôle segmenté dans le
  tiroir. Utile quand la photo ne correspond à rien : l'utilisateur voit quand même ce qu'on a compris.

### E6 — « Annuler » n'arrête que le client · **P1**
- `cancelSearch` (`lens.tsx:908`) coupe la connexion ; **le serveur continue** (SerpApi, scrape,
  enrichissement) — du quota SerpApi et du temps Render pour rien.
- **Correction :** côté serveur, `res.on('close')` → drapeau `cancelled` → on cesse d'enrichir.

---

## 5. Fiche d'implémentation

### 5.1 Contrainte à ne pas oublier : React Native ne streame pas `fetch`

`fetch` sous React Native n'expose pas `response.body` : pas de lecture incrémentale. Et
`expo-file-system`'s `File.upload()` renvoie le corps **entier** : impossible d'en tirer un flux.

La voie qui marche : **`XMLHttpRequest`** (le XHR de RN est implémenté au-dessus du module
réseau natif, et `xhr.responseText` grandit au fil de l'eau) + **`FormData` natif**
(`{ uri, name, type }` → le fichier est lu par la couche native, **sans base64 ni mémoire JS**).

| Fichier | Action |
|---|---|
| `apps/mobile/src/api/lensStream.ts` **(nouveau)** | `analyzeImageStream(file, { roi, signal, onProgress, onCard, onDone })` : XHR + `Accept: text/event-stream` + parsing incrémental de `responseText` (`\n\n`) + chien de garde de silence (40 s, comme le web) + délai absolu (60 s) + `xhr.abort()` sur annulation |
| `apps/mobile/src/api/lensStream.ts` | Parseur `parseLensSseBlock` — **portage** de `client/src/ayrovix/services/lensStream.ts` (règle du dépôt : le mobile n'importe **rien** de `client/`) |
| `apps/mobile/src/features/lens/LensSearchSkeleton.tsx` | Ajouter la ligne d'étape, la barre `done/total`, le chrono ; rester un squelette **de la forme réelle** |
| `apps/mobile/src/features/lens/LensOverviewCard.tsx` **(nouveau)** | La réponse « AI Overview » : description + marque + modèle + lien source |
| `apps/mobile/app/lens.tsx` | Nouveau stage `busy` **progressif** (`progress` + `cards[]`) ; `stage.kind === 'results'` à la fin ; le tiroir passe de squelette à cartes au fur et à mesure |
| `apps/mobile/src/i18n/fr.ts` + `ar.ts` | 4 clés : `lens.progress.identified` / `.searching` / `.reading` (avec `{done}` `{total}`) / `lens.overview.title` |
| `src/ayrovix/routes.ts` | `res.on('close')` → drapeau `cancelled` → arrêt des enrichissements (E6) |

**Ordre de grandeur à respecter :** le serveur ne change pas de contrat pour le P0 — il parle
déjà SSE. Le P0 est **uniquement** un nouveau chemin de transport côté téléphone.

### 5.2 Le chemin critique, en temps

| Temps | Ce que le serveur fait | Ce que l'utilisateur doit voir |
|---|---|---|
| 0 s | clic « Rechercher » | le tiroir monte, « Recherche des produits de la photo… » |
| ~0,3 s | upload + normalisation + recadrage ROI | — |
| ≤ 8 s | vision (ou reconnaissance SerpApi) | **étape « Produit identifié » + la réponse en clair** (E2) |
| ≤ 12 s | recherche visuelle (SerpApi) | **étape « Recherche de produits similaires »** ; les premières cartes apparaissent |
| ≤ 20 s | lecture des fiches marchandes (3,5 s par page, en parallèle) | **« Lecture des fiches 4/8 »** + barre qui avance |
| 45 s | deadline serveur | les résultats **partiels restent affichés** (E4) |

### 5.3 Critères de recette (mesurables)

1. Depuis la photo, **≤ 2 s** : le tiroir affiche une étape lisible (« Produit identifié »).
2. **≤ 3 s** après l'identification : la phrase de l'« AI Overview » est visible, avec la marque.
3. **≥ 1 carte réelle** avant la fin de la recherche (le squelette n'occupe jamais toute la grille).
4. Le compteur `done/total` **avance** à chaque lecture de fiche.
5. « Annuler » coupe l'affichage **et** le travail serveur (aucun `card` après l'annulation).
6. À l'expiration du délai : **pas d'écran d'erreur** si des cartes sont déjà là.
7. `npm test` (apps/mobile) vert, avec 3 nouveaux fichiers de test :
   `lensStream.test.ts` (parseur), `lensProgress.test.ts` (machine à états), `lensOverview.test.tsx` (rendu).

---

## 6. Ce qu'il ne faut pas copier de Google — et ce qu'il ne faut pas inventer

- **Ne pas inventer de prix ni de disponibilité.** Règle du dépôt : le prix vient de la page
  marchande, jamais de l'image. Un prix « estimé » reste interdit (`priceOrigin`, `priceToken`).
- **Ne pas nommer la marque avant que le serveur l'ait dit.** `identification.brand` vient de la
  vision/SerpApi : on l'affiche tel quel, ou pas du tout.
- **Ne pas afficher de carte « vide » pour remplir l'écran.** Un squelette est un squelette :
  il annonce une forme, il n'invente pas un produit.
- **L'« AI Overview » de Google est une réponse de modèle.** Le nôtre doit rester une
  **description publiée** (`identification.description`) — pas une phrase rédigée par nous.
- **Les onglets « AI Mode / All »** sont une navigation Google ; un simple segmenté
  « Identifié / Produits » suffit chez nous, et évite de promettre un mode conversationnel
  que nous n'avons pas.

---

## 7. Références

| Sujet | Fichier |
|---|---|
| Contrat SSE du serveur | `src/ayrovix/routes.ts` (`/analyze-image`, `emit(...)`) |
| Délai global + paliers | `src/ayrovix/services/lensDeadline.ts` |
| Budgets par étape | `src/ayrovix/services/ai.ts` (vision 8 s) · `search.ts` (SerpApi 3,5 s / ai-core 4,2 s) · `productEnrichment.ts` (3,5 s) |
| Modèle à porter (web) | `client/src/ayrovix/services/lensApi.ts` · `client/src/ayrovix/services/lensStream.ts` · `client/src/ayrovix/components/LensLauncher.tsx:373-430` |
| Client mobile actuel (bloquant) | `apps/mobile/src/api/lens.ts:541` · `apps/mobile/src/api/nativeUpload.ts:41` |
| Écran d'attente actuel | `apps/mobile/src/features/lens/LensSearchSkeleton.tsx` · `apps/mobile/app/lens.tsx:1055` |
| Copie existante | `apps/mobile/src/i18n/fr.ts:603-604` (`lens.searchingFriendly`, `lens.resultsTitle`) |

---

## 8. État d'implémentation (16/10/2026)

Les corrections décrites ci-dessus sont **en code** (branche `arena/b3539284-ayrovi-beta1`).

| Écart | Corrigé | Où |
|---|---|---|
| E1 — aucun retour progressif | Le serveur émet `progress` **avec l'identification** dès la première étape | `src/ayrovix/routes.ts` (`emit('progress', { step: 'identified', identification })`) |
| E2 — pas d'« AI Overview » | Carte « ce que nous avons reconnu » : description / marque / modèle / catégorie **publiées par le serveur** | `apps/mobile/src/features/lens/LensOverviewCard.tsx` |
| E3 — résultats non streamés | Lecture SSE sur téléphone (XHR + `responseText` incrémental) ; chaque fiche lue s'affiche | `apps/mobile/src/api/lensStream.ts` · `apps/mobile/app/lens.tsx` (`onCard`) |
| E4 — le délai serveur jette le travail | Les fiches déjà lues restent affichées ; le flux est clos proprement si le serveur s'arrête (`STREAM_INCOMPLETE`) | `apps/mobile/src/api/lensStream.ts` |
| E6 — « Annuler » n'arrête que le client | Le serveur voit la fermeture de la connexion et cesse de lire les pages marchandes | `src/ayrovix/routes.ts` (`res.on('close')` → `cancelled`) |

Ajouts :

- **Ligne d'avancement honnête** : « Produit identifié » → « Recherche de produits similaires » →
  « Lecture des fiches 4/8 ». Barre déterministe quand le serveur donne `done/total`,
  indéterminée sinon (jamais de pourcentage inventé) — `LensProgressLine.tsx`.
- **Barre flottante en haut** (fiche 2) : vignette + étape + annulation, posée sur la photo,
  visible pendant que le tiroir garde la photo à l'écran — `LensSearchBar.tsx`.
- **Les tests** : `apps/mobile/tests/lensStream.test.ts` (13 cas : découpage SSE, ordre des
  événements, doublons, flux coupé, annulation, délai, repli JSON).

**Ce qui n'est pas fait (volontairement, cf. § 6)** : ni onglets « AI Mode / All », ni
conversation, ni prix estimé. La détection multi-cibles (D1/D2/D3 de la fiche 2) reste à faire.
