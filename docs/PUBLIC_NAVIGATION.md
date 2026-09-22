# Barre publique sous l'en-tête & pied de page — décisions du 2026-09-22

## 1. Ce qui change (décision produit)

| Avant | Après |
| --- | --- |
| Le sommaire de pages (Arrivage / Gift & Cards / Magazine) apparaissait **deux fois** : barre sous l'en-tête **et** pied de page. | Le sommaire vit **uniquement** dans la barre sous l'en-tête, pilotée depuis l'Admin. |
| Les trois onglets étaient écrits dans le code (`PUBLIC_PAGES`). | Les onglets sont des **données** : libellés FR/AR, ordre et visibilité se règlent dans l'Admin. |
| Les pages plein écran recopiaient le pied de page de l'accueil. | Les pages plein écran (Arrivage, Gift & Cards, Magazine) **n'ont plus** de pied de page. |
| Le pied de page commençait par des liens textuels en majuscules. | Le pied de page est une **signature de marque** : marque, canaux officiels, accès utiles, documents légaux. |

## 2. Écran Admin : `Contenu › Barre sous l'en-tête`

* Route d'écran : `/admin?section=public-nav` (deep link stable).
* Ressource du framework : `cms.public-nav` → API `/api/admin/public-nav` (`content:write`).
  Elle est **dérivée** du moteur générique : liste triable, recherche, formulaire, suppression
  logique et journal d'audit sans une ligne de JSX dédiée.
* Champs : `label_fr`, `label_ar`, `destination`, `display_order`, `active`.
* `destination` est une **liste fermée** (`shared/publicNavigation.ts`). L'Admin ne saisit jamais
  d'URL : le chemin réel (`/arrivage`, `/gift-cards`, `/magazine`) vient du contrat partagé, donc
  **aucun lien mort** ne peut être publié. Le sélecteur affiche la cible lisible
  (« Arrivage — /arrivage »), pas la clé technique.
* Plusieurs onglets peuvent viser la même destination (par ex. « Nouveautés » → Arrivage), et
  **tout masquer retire la barre entière** : jamais de barre fantôme.

## 3. Contrat partagé (client ↔ serveur)

`shared/publicNavigation.ts` est la seule source des destinations et de leurs chemins. Elle est
consommée par : la barre publique (client), le routage SPA (`client/src/navigation/publicPages.ts`),
le sélecteur Admin (descripteur) et la traduction des listes (`resource-ui.tsx`).

API publique : `GET /api/public/navigation` → entrées actives, ordonnées, avec `href` résolu
et les deux libellés. Le client affiche immédiatement les trois destinations officielles, puis
adopte la réponse de l'API (un échec API ne casse jamais la navigation).

## 4. Pied de page

* Zone « Nos canaux officiels » **prête** pour Facebook, Instagram, TikTok et WhatsApp : elle lit
  `channels` de `/api/public/commerce-config` (Admin → Paramètres → CHANNELS).
* Un canal non renseigné reste visible mais **inerte** (jamais un faux compte) ; une URL refusée
  par `safeChannelUrl` (schéma non http(s), identifiants dans l'URL) n'est jamais publiée.
  Renseigner les liens suffit : rien à modifier côté code.
* Marque inversée forcée (le fond est noir), documents légaux conservés, aucune pastille de
  paiement inventée.

## 5. Vérifications

```bash
npm run typecheck && npm test && npm run build
AYROVI_BASE_URL=http://127.0.0.1:3000 npm run verify:public-nav
```

`verify/public-navigation.mjs` prouve sur l'application réelle : renommage publié visible côté
site, onglet masqué disparu, barre supprimée si tout est masqué, aucune copie du pied de page sur
les trois pages plein écran, pied de page de l'accueil intact et canaux non inventés.
Preuves : `docs/public-navigation/evidence/`, aperçus : `docs/public-additions/preview/`.

Tests de contrat : `tests/public-navigation.test.ts` (API, permissions, destinations refusées),
`tests/public-additions.test.tsx` (pied de page), `tests/back-office-foundation.test.ts`
(registre, navigation, écran du framework).

## 6. الدليل بالعربية (مختصر)

* **الشريط تحت الهيدر** ولى يُدار كامل من الأدمن: `المحتوى › الشريط تحت الهيدر` — تسمية بالفرنسية
  والعربية، الترتيب، والظهور. الوجهة تُختار من قائمة ثابتة، donc impossible de publier un lien mort.
* **الفوتر** ما عادش يعاود روابط الصفحات (Arrivage / Gift & Cards / Magazine): ولّى توقيع الماركة —
  الشعار، قنوات التواصل الرسمية، الوصولات المفيدة، والوثائق القانونية.
* **الصفحات الكاملة** (Arrivage / Gift & Cards / Magazine) ما عادش فيها نسخة من الفوتر.
* **قنوات التواصل**: الحرّف (Facebook, Instagram, TikTok, WhatsApp) موجودين وجاهزين للربط؛ يكفي
  تكتب الروابط في `الإعدادات › CHANNELS` وتظهر تلقائيًا. اللي ما فيه رابط يبقى ظاهر بلا مفعول —
  ما نصنعو حتى حساب وهمي.
