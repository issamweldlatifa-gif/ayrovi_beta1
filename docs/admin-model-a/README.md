# Admin AYROVI — passage au modèle A « Console opérationnelle »

Réalisé le **2026-09-22**, après ton choix : **A** (référence Amazon Seller Central).
Ce dossier garde les preuves et la trace de ce qui a été fait, décision par décision.

| Dossier | Contenu |
| --- | --- |
| `evidence/avant/` | L'admin avant le passage (4 écrans + mobile) |
| `evidence/apres/` | Les mêmes écrans après (mêmes URL, mêmes données) |
| `evidence/site/` | Le site public revu en même temps (FR + AR, bureau + mobile) |
| `tools/shoot-admin.mjs` | Régénère les captures admin : `node docs/admin-model-a/tools/shoot-admin.mjs apres` |
| `tools/shoot-site.mjs` | Régénère les captures du site : `node docs/admin-model-a/tools/shoot-site.mjs` |

Le prototype de référence est `docs/admin-prototypes-v2/a-amazon-console.html`, et son cadre Figma
`docs/admin-prototypes-v2/figma/cadres/modele-1-amazon-commandes.svg`.

---

## 1. Ce qui a changé dans l'admin

Adoption **par le socle**, pas écran par écran : la coquille et les primitives sont partagées par les
49 écrans, donc les repeindre suffit à les faire adopter tous — aucun écran n'a été réécrit, aucun
contrat n'a bougé.

| Fichier | Rôle dans le passage |
| --- | --- |
| `client/src/styles/admin-console.css` | **Nouveau.** La feuille du modèle A. Additive : chargée après `admin.css`, elle ne supprime aucune règle. Elle définit les rôles de couleur, la densité, les rayons et le chrome, puis les reporte sur les variables historiques (`--admin-*`) — c'est ce report qui fait hériter les écrans existants. |
| `client/src/admin/back-office/BackOfficeShell.tsx` | **Recomposé.** Deux barres (encre + services), rail du service actif, fil d'Ariane mince, filtre de domaine contextuel. Même contrat serveur : mêmes sections, mêmes permissions, mêmes deep links. |
| `client/src/admin/AdminApp.tsx` | Import de la nouvelle couche après `admin.css`. |

### Les décisions, et pourquoi

1. **Deux barres.** Barre 1 (encre) : identité, recherche globale, préférences, cloche, compte.
   Barre 2 : les **services** = les groupes de la navigation serveur (Vue générale, Contenu,
   Catalogue, Commerce, CRM, ERP, Système). Aucun regroupement inventé côté client.
2. **Le rail ne montre que le service actif** (1 à 15 lignes au lieu de 49). Choisir un service
   ouvre son premier écran — comportement de console. Les autres services restent listés en bas du
   rail : on ne perd pas le « où aller ensuite », et aucun écran n'est dupliqué.
3. **Retiré : le bloc « Au quotidien ».** Il recopiait quatre écrans déjà présents en dessous —
   « Tableau de bord » et « Commandes » apparaissaient deux fois dans le menu.
4. **Retiré : les pastilles « legacy » et « doublon ».** Du vocabulaire d'atelier affiché à
   l'opérateur. L'information n'est pas perdue : infobulle de l'entrée, fil d'Ariane (« ancienne
   surface ») et bandeau de l'écran concerné, qui dit quoi faire et propose la surface canonique.
5. **Le filtre de domaine** (Tous / ERP / Commerce…) n'apparaît plus que sur les services qui
   mélangent réellement plusieurs domaines (Commerce, Contenu, Système). Ailleurs c'était un
   contrôle qui ne filtrait rien. Et si le filtre disparaît, il est remis à « Tous » — le rail ne
   peut pas devenir vide sans explication.
6. **Densité compacte par défaut**, rayon 3–4 px, aucune ombre sur les cartes, aucune couleur
   décorative : la palette reste celle d'AYROVI (encre `#111110`, orange d'action `#FF6900`), ce
   sont les conventions de poste de travail qui sont reprises, pas la charte d'Amazon.
7. **Le titre n'est plus écrit deux fois.** L'en-tête affichait `COMMERCE / COMMANDES` puis le titre
   de la page en dessous : le fil d'Ariane garde une ligne, le titre appartient à l'écran.

### Défauts corrigés au passage (relevés pendant la revue)

- **Le menu était inatteignable sur téléphone.** `@media (max-width: 640px) .admin-icon-button { display: none }`
  masquait aussi le bouton d'ouverture du rail. Le bouton a maintenant ses propres règles dans la
  couche du modèle A (`(max-width: 900px)`), et le tiroir suit le point de rupture historique (900 px).
- **Écrans du moteur : « Journal du premier résultat »** ouvrait l'historique d'une ligne choisie au
  hasard. Remplacé par une action **Journal** par ligne (là où la question se pose) et par le compte
  de résultats dans la barre d'outils.
- **La légende du tableau** (`<caption>`) s'affichait comme un bandeau gris épais : c'est une ligne
  d'information discrète.
- **Libellés d'écrans incohérents** : `Hero Management` → **Visuels d'accueil**, `AI Discovery` →
  **Découverte IA**, `Lens Test Lab` → **Lens — banc d'essai**. Les suffixes techniques sortis des
  libellés : `Produits (ancienne surface)` → **Produits**, `Marques (ancienne surface)` → **Marques**,
  `Journal d'audit (legacy)` → **Journal d'audit**.
- **Code mort supprimé** : `client/src/components/NavigationBrandIcons.tsx` (ré-export déprécié, plus
  aucun import) et `client/src/components/StartShoppingGates.tsx` (jamais monté). Inventaire client :
  209 fichiers (au lieu de 211), `design:check` vert.
  **Conservés volontairement** et signalés ici au lieu d'être supprimés sans te demander :
  `DiscoveryHub.tsx` (décision produit documentée : conservé pour réutilisation),
  `HeroSlider.tsx` (cité comme surface d'intégration dans `docs/ADMIN_CMS.md`),
  `assistant/AssistantVoiceOrb.tsx`. Dis « supprime-les » et je le fais dans le même mouvement.

---

## 2. La relation avec le site public (site ↔ admin)

Vérifié écran par écran, pas déclaré :

| Contrat | État vérifié |
| --- | --- |
| Barre sous l'en-tête pilotée par l'Admin | Les 3 onglets viennent de `/api/public/navigation` (base → contrat partagé → client). Renommer, réordonner, masquer se fait dans `Contenu › Barre sous l'en-tête` ; tout masquer fait disparaître la barre. |
| Le pied de page | Un seul, sur l'accueil. Les pages plein écran (Arrivage, Gift & Cards, Magazine) n'en affichent aucun — compte vérifié : `footers 1` sur l'accueil, `0` sur les trois pages. |
| Pas de débordement horizontal | `1440/1440` et `390/390` sur l'accueil et les trois pages : rien de ce que l'Admin publie ne peut casser la mise en page. |
| **Libellés arabes réels** | **Corrigé.** Les libellés AR étaient la copie du français : en mode arabe, les onglets et les titres de pages s'affichaient en latin. Ils sont maintenant `وصلات جديدة` · `هدايا وبطاقات` · `مجلة AYROVI`, dans le contrat partagé **et** en base (réparation ponctuelle `public_nav_arabic_labels_v1`, jouée une seule fois — un libellé retouché ensuite à la main n'est jamais écrasé). Vérifié en direct : `dir=rtl`, onglets arabes, `h1` de `/arrivage` = `وصلات جديدة`. |
| Une seule source de libellés | `PublicCmsSections.tsx` recopiait les trois libellés ; il lit maintenant `shared/publicNavigation.ts` comme l'Admin, l'API et le routage. Seuls « Social » et les textes éditoriaux (accroche, description) restent locaux. |
| Fichiers média | Les 31 fichiers de `client/public/media` sont tous référencés (manifeste PWA, générateur d'icônes, tests, écrans). Aucun fichier mort à supprimer. |

Reste un point **volontairement non touché** : sur l'accueil en arabe, le grand titre du hero s'affiche
encore en français (« Vous le voyez. AYROVI vous le livre. »). Ce texte vient du contenu Hero, pas de
la barre publique : il a son propre écran et sa propre saisie AR. Dis-moi si tu veux que je m'en
occupe dans la foulée.

---

## 3. Vérifications passées après le passage

| Contrôle | Résultat |
| --- | --- |
| `npx vitest run` | **1514 tests / 96 fichiers** — tous verts |
| `npm run typecheck` | propre (serveur + client) |
| `npm run design:check` | vert (identité, inventaire, icônes) |
| `npm run verify:public-nav` | 20/20 |
| `npm run verify:public-additions` | 129/129 |
| `npm run verify:identity` | 102/102 (chromium + firefox) |
| Captures admin | 4 écrans + mobile, **0 erreur console** (hors le 401 attendu de `/api/customer/auth/me`, qui est l'état normal d'un visiteur non connecté) |
| Captures site | FR + AR, bureau + mobile, 0 débordement, pied de page conforme |

Tests mis à jour parce que le contrat a changé (et seulement pour ça) :
- `tests/back-office-shell.test.tsx` — la coquille du modèle A : services, rail du service actif,
  pas de doublon, filtre contextuel, vocabulaire d'atelier en infobulle.
- `tests/public-navigation.test.ts` — le libellé arabe doit être **réellement arabe**.

---

## 4. Revenir en arrière (sans casser)

Le passage est isolé en deux pièces, chacune réversible seule :

1. **Style** : retirer la ligne `import '../styles/admin-console.css';` d'`AdminApp.tsx` rend
   l'admin exactement comme avant (la feuille est additive, rien n'a été supprimé d'`admin.css`).
   Le rail large et le filtre de domaine historiques reviennent avec.
2. **Coquille** : `git revert <commit>` sur le seul `BackOfficeShell.tsx` remet l'ancienne
   composition (rail de 49 entrées, bloc « Au quotidien », pastilles legacy).

Les écrans métier, eux, n'ont jamais été touchés : ils héritent du style par les variables.

---

## ملخص بالعربي

- **الموديل A** (Amazon Seller Central) تطبّق على **الـ49 شاشة** كاملين، لكن بذكاء: بدّلنا الطبقة
  المشتركة (coquille + primitives) ماشي كل شاشة وحدها — لهذا ما كسرناش حتى شي.
- زوز بارات: بارّة سوداء (الهوية + البحث + الحساب) وبارّة **الخدمات** (Vue générale، Contenu،
  Catalogue، Commerce، CRM، ERP، Système). القائمة الجانبية توري كان **شاشات الخدمة المختارة**
  (بدل 49 سطر).
- **تنحّى:** بلوك « Au quotidien » (كان يكرّر 4 شاشات)، وشارات « legacy » و« doublon » (كلام داخلي)،
  والفلتر بلاد داعي، والعنوان المكرّر.
- **تصلّح:** زر القائمة ما كانش يظهر في الهاتف، « Journal du premier résultat » تبدّل بـ« Journal »
  لكل سطر، ليجوند الجدول، وأسماء شاشات بالإنجليزية/غير متناسقة.
- **الموقع:** تثبّتنا بلي الـfooter موجود كان في الـaccueil، ما فماش débordement في 1440 و390،
  و**أهم شي**: الترجمات العربية للتبويبات كانت نسخة من الفرنسية — تصلّحت (وصلات جديدة · هدايا
  وبطاقات · مجلة AYROVI) في العقد المشترك وفي قاعدة البيانات.
- **الفحوصات:** 1489 تست ✅ · typecheck ✅ · design:check ✅ · 20/20 و129/129 و102/102 ✅.

---

## 5. Deuxième tour (toujours 2026-09-22) — « que chaque élément réponde »

Demande : *« ترقية ادمين… كل عنصر يستجيب… فحص كامل… اي عنصر زائد احذف… تطوير في كل شي حتى شاشات
ادمين… تثبت ان كل عنصر يعمل… لا تنسى تحديث واجهة دخول ادمين… تدقيق كامل وكشف ثغرات وإصلاحات »*.
Traduction en travail : plus rien de décoratif, plus rien de gris sans raison, plus rien de cassé,
et la porte d'entrée alignée sur le modèle A.

### 5.1 L'audit, refait pour de vrai

`verify/admin-audit.mjs` visite **les 49 écrans du plan servi par le serveur** et relève, écran par
écran : erreurs JS, réponses HTTP en échec, liens morts, boutons sans nom accessible, champs sans
étiquette, images sans `alt`, boutons désactivés sans motif, débordement horizontal.

Le premier passage donnait **34 écrans à problème** — dont un vrai plantage. Le second (ci-dessous)
donne **0 / 49**. Le détail lisible est dans `audit/RAPPORT.md`, la donnée brute dans `audit/audit.json`.

| Défaut trouvé | Cause réelle | Correctif |
| --- | --- | --- |
| `crm-dashboard` plantait (`Cannot read properties of undefined`) | Le serveur renvoie `{ data: { metrics, recent } }`, le client lisait `d.parties` à la racine | Typage `Dashboard = { metrics?, recent? }` + lecture via `m = dashboard?.metrics ?? {}` |
| 27 champs sans nom accessible sur 20 écrans | Les `Select` de filtre n'ont pas d'étiquette visible ; 2 champs de période non étiquetés | `Select` dérive son nom du premier choix (un `aria-label` explicite reste prioritaire), `DatePicker` accepte `label`, les deux `<input type=date>` de Rapports sont étiquetés |
| 34 écrans avec 2 boutons grisés sans motif | Flèches « page précédente/suivante » et boutons de réordonnancement aux extrémités | `title` sur les deux flèches de pagination, `moveHint()` partagé pour les quatre écrans qui réordonnent, motif sur le bouton « إرسال » de l'agent éditorial |
| Sondes de sécurité fausses (200 partout) | L'audit interrogeait les routes protégées **avec** le contexte déjà authentifié | Contexte anonyme séparé → **401 partout**, + révocation de session et détection de fuite de secrets |

### 5.2 L'écran de connexion passe au modèle A

`admin-console.css` portait les rôles de couleur sur `.bo-shell` seulement : la connexion restait
donc un écran « d'avant » (bouton noir, grand halo décoratif). Désormais les rôles sont portés par
`.bo-shell`, **`.admin-login` et `.admin-boot`** — la connexion hérite des mêmes filets, du même
rayon de 4 px et de la même action orange, sans qu'aucun jeton ne soit recopié.

Trois éléments de l'écran de connexion sont **vivants** (et vérifiables) :

1. un cartouche d'état alimenté par `/api/health` — il affiche la vraie version du serveur et propose
   **Réessayer** s'il ne répond pas ;
2. l'œil du mot de passe porte un **état accessible** (`aria-pressed`) et une infobulle, pas seulement
   un mot ;
3. l'erreur de connexion est annoncée (`role="alert"`), et le bloc « mot de passe perdu » décrit la
   **procédure réelle du serveur** (`ADMIN_EMAIL`/`ADMIN_PASSWORD`, puis `ADMIN_BOOTSTRAP_RESET=yes`)
   au lieu de renvoyer vers une commande qui n'existe pas.

Titre d'onglet : `AYROVI · Console d'exploitation` (la console ne s'annonce plus avec le titre
marketing du site public).
Captures : `audit/login-desktop.png` et `audit/login-mobile.png` — elles sont régénérées par l'audit.

Identité : la connexion utilise le **verrou A.ROVI** (`logo-ayrovi-lockup-white-orange.svg` sur le
panneau en encre, version noire sur la carte mobile). Le nom n'y est donc plus écrit deux fois. Un
détail mesuré au passage : dans un conteneur flex en colonne, l'étirement transversal écrasait la
hauteur imposée et centrait l'art dans une boîte trop large — l'emblème n'était plus aligné sur le
titre. Corrigé par `align-self: flex-start` (mesuré : boîte 170 × 32, calée sur la marge du titre).

### 5.3 Deux ajouts de développeur (pas de la décoration)

| Ajout | Où | Ce qu'il fait |
| --- | --- | --- |
| **Export CSV** | `client/src/admin/csv.ts`, branché sur le moteur de ressources (`public-nav`, `inventory`) et sur le journal d'audit | Exporte **exactement les lignes et les colonnes affichées**. BOM UTF-8 (Excel lit l'arabe et les accents), échappement RFC 4180, et **formules neutralisées** : une valeur de CMS commençant par `=` ne s'exécute jamais dans le tableur de l'administrateur. |
| **Journal d'audit : Rafraîchir + Exporter** | `AuditPage` | On consulte un journal juste après une action : on ne devrait pas recharger toute la console pour voir sa propre trace. Le bouton d'export est grisé avec son motif quand la page est vide. |

Preuves en direct (Playwright, téléchargement réel) : `ayrovi-public-nav-20260922-0452.csv` (4 lignes,
BOM présent), `ayrovi-journal-audit-20260922-0452.csv` (20 lignes, en-tête `Date,Acteur,Action,Module,
Cible,Valeur précédente,Nouvelle valeur`).

### 5.4 Durcissement : mise en cadre

La console décide des prix et des remboursements : en **production** elle n'est encadrable par
personne (`frame-ancestors 'none'` + `X-Frame-Options: DENY`), le site public le reste en
`'self'`/`SAMEORIGIN`. Hors production, aucune contrainte n'est émise : l'aperçu de développement est
lui-même rendu dans un cadre, et y appliquer la règle de production rendrait la console invisible.
Cette différence est **écrite noir sur blanc dans le rapport d'audit** (section « projection
production »), pour ne jamais présenter comme mesuré ce qui n'est que déclaré.

### 5.5 Vérifications du second tour

| Contrôle | Résultat |
| --- | --- |
| `verify/admin-audit.mjs` | **49/49 écrans sans défaut** · 0 erreur JS · 0 HTTP en échec · 0 écran vide ou bloqué |
| Sécurité (contexte anonyme) | 10/10 surfaces en **401** · écriture sans CSRF **403** · cookie volé après déconnexion **401** · 0 fuite de secrets |
| `npx vitest run` | **1514 tests / 96 fichiers** — dont 25 nouveaux gardes (`tests/admin-console-upgrade.test.tsx`) |
| `npm run typecheck` | propre (serveur + client) |
| `npm run design:check` | vert |
| `npm run verify:public-nav` / `public-additions` / `identity` | 20/20 · 129/129 · 102/102 |

Contrats amendés **parce que le comportement a changé**, jamais pour faire passer un test :
`tests/design-primitives.test.tsx` — `Select` (nom accessible dérivé) et `Pagination` (infobulle sur
les flèches).

### ملخص بالعربي — الجولة الثانية

- **عملت فحص كامل** على **49 شاشة** بالبرنامج: كل شاشة تتفتح، ما فماش خطأ JS، ما فماش طلب فاشل،
  ما فماش زر بلا اسم، ما فماش خانة بلا تسمية، ما فماش صورة بلا وصف. **النتيجة: 49/49 نظاف.**
- **تصلّح crash حقيقي** كان في `crm-dashboard` (السيرفر يرجع `data.metrics` والكلاينت كان يقرا من
  الجذر) — تو الشاشة تحلّ عادي.
- **27 خانة كانت بلا تسمية** (فلترات + زوز تواريخ في التقارير) — ولّاو كلهم عندهم اسم مقروء.
- **34 شاشة كان فيها زوز أزرار رمادية بلا سبب** — تو كل زر رمادي يقول **علاش** هو رمادي.
- **واجهة دخول الادمين ولّات بنفس ستايل النموذج A**: نفس الألوان ونفس الفواصل، زر « Se connecter »
  ولّى **برتقالي** (الأكشن الوحيد)، وفمّا **كارتوس حالة** يقرا `/api/health` ويوري version الحقيقي
  مع زر « Réessayer »، وعين كلمة السر فيها `aria-pressed`، والتيتل ولّى `AYROVI · Console`.
- **زوز إضافات جديدة**: **تصدير CSV** (نفس السطور ونفس الأعمدة اللي في الشاشة، بـ BOM باش Excel
  يقرا العربي، وبلا خطر formule) و**الjournal: Rafraîchir + Exporter**.
- **أمان**: التصديق تجرّب من **contexte فارغ** → 401 في كل بلاصة، الكتابة بلا CSRF → 403، الكوكي
  مسروق بعد logout → 401، وما فماش سربان أسرار. وفي **production** الكونسول ما يتفتحش في cadre
  (clickjacking) — وهذي حاجة مكتوبة في التقرير بأمانة: ما تنقاسش في dev.
- **الفحوصات**: 1514 تست / 96 ملف ✅ · typecheck ✅ · design:check ✅ · 20/20 · 129/129 · 102/102 ✅.
