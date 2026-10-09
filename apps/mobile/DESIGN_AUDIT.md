# Design audit — AYROVI Android / React Native

**Mis à jour :** 08/10/2026
**Périmètre :** `apps/mobile/`
**Méthode :** lecture des composants, textes, contrats API et tests. Une lecture du code ne vaut pas validation du rendu sur appareil.

## Synthèse

Le mobile possède un vrai socle partagé (`theme`, `AppScreen`, `SubScreen`, composants UI et états), mais il n’est pas adopté uniformément. Les captures ont surtout révélé des défauts de cohérence et des copies techniques visibles, pas un besoin de remplacer l’architecture.

Cette passe centralise la géométrie commune, rend l’en-tête scroll-aware, empile les actions étroites de Lens/OCEREX, traduit les catégories de news, rétablit un footer noir lisible et retire les formulations internes qui promettaient trop.

## Constats et corrections

| Sujet | Cause observée | Correction dans cette passe |
|---|---|---|
| Cart / Compte : écarts verticaux | `AppScreen` et `SubScreen` n’utilisaient pas un contrat de gap commun | `screenContentGap(theme.space)` est partagé ; le contrat vaut `space[2]` (12 pt) |
| En-tête transparent en permanence | `AppHeader` ne recevait aucun état de scroll | `AppScreen` transmet `scrolled`; le fond passe de transparent à `surface` au-delà de 8 pt, sans changer les dimensions |
| Actions Lens / OCEREX trop larges | Deux boutons juxtaposés sur toutes les largeurs | `ResponsiveActionGroup` empile en mobile et partage une rangée en espace large |
| Catégories de news en code brut | Les cartes et le détail affichaient directement les valeurs API | Les sept codes connus ont des libellés FR/AR (la marque reste « AYROVI »); un code futur reste visible tel quel |
| Footer blanc / contenu bord à bord | Fond hérité du thème clair et absence de gutter interne après le full-bleed | Footer utilise la palette sombre officielle dans les deux thèmes et le gutter responsive partagé |
| Copie Vision / Compte orientée développement | Des textes parlaient d’une structure « prête », de phases internes ou d’étapes futures | Vision reste vide avec un seul état honnête; la note Compte décrit seulement les préférences réellement proposées |
| Paiement présenté comme garanti | Le résumé du panier nommait carte et virement indépendamment de la configuration serveur | Le texte annonce que les options sont indiquées selon disponibilité; l’action mène à la commande, pas à une promesse de paiement |
| Diagnostics de build dans le menu principal | Version, identité, thème et build répétés dans le tiroir | Bloc retiré du menu; version de l’application et état du serveur restent dans À propos |
| Chips SONIM horizontalement coupées | Le composant utilise un `ScrollView` horizontal | Comportement conservé : le défilement horizontal est intentionnel, pas un retour à la ligne cassé |

## État architectural mesuré

- Identité générée : `identity.json` → `tokens.generated.ts`; les extensions React Native vivent dans `tokens.mobile.ts` et sont assemblées par `theme.tsx`.
- La logique responsive pure est centralisée dans `layoutLogic.ts`; `layout.tsx`, le groupe d’actions et le footer consomment les mêmes métriques.
- `AppScreen` gère safe area, défilement, gouttière, gap et overlay header. `SubScreen` reste le wrapper des routes imbriquées et partage le gap.
- Le dépôt contient 39 fichiers route `.tsx`: 6 importent `AppScreen`, 23 importent `SubScreen` et 10 n’importent aucun des deux. Ce relevé brut ne mesure pas directement l’adoption : il inclut layouts, alias et écrans spéciaux qui peuvent avoir leur propre coque.
- Les règles d’espacement/couleur et une liste de superpositions autorisées sont contrôlées par `tests/design-system.test.ts`. Les doublons de composants ne sont pas détectés automatiquement.

## Régressions couvertes

- `tests/layoutLogic.test.ts` : seuils responsive, direction des actions, gap commun.
- `tests/chrome.test.ts` : comportement de la barre et état transparent/solide du header.
- `tests/copy.test.ts` : catégories connues traduites en FR/AR et catégorie inconnue non masquée.
- Les suites existantes `footer.test.ts`, `sections.test.ts`, `design-system.test.ts` et `i18n.test.ts` continuent de protéger leurs contrats respectifs.

## Vérifications techniques et visuelles

Vérifications exécutées le 08/10/2026 : `npm test` (31 fichiers, 435 tests passés), `npm run typecheck`, `npm run tokens:check` et `npx expo export --platform android` passent. L’export confirme le bundle Android Metro, pas la compilation d’un APK ni son rendu.

Les changements de couleur, de taille de cible et de retours à la ligne doivent encore être contrôlés sur un APK Android :

- téléphone étroit et largeur tablette;
- thème clair et sombre;
- français et arabe/RTL;
- header avant/après scroll;
- actions Lens/OCEREX, footer full-bleed et zone gestuelle du bas.

Aucune conformité visuelle n’est déclarée sur la seule base de ces tests. Le rendu final et les captures doivent être vérifiés après construction de la démo Android.

## Passe du 08/10/2026 (soir) — accessibilité, hors-ligne, images, squelettes, RTL

**Périmètre :** `apps/mobile/` + CI (build APK sur la branche de travail).
Vérifications : `npm run typecheck`, `npm test` (32 fichiers, 440 tests), `npm run tokens:check`, `npx expo export --platform android` — tous verts.

| Sujet | Défaut constaté | Correction |
|---|---|---|
| État hors-ligne | `states.tsx` promettait 4 états, il n'en existait que 3 | `OfflineBlock` (icône, titre, explication, réessai) ; `ErrorBlock` route les `ApiError.isOffline` vers cet état ; bannière réseau globale (`expo-network`) dans le flux, jamais en `absolute` |
| Accessibilité | Boutons icône-seuls sans nom, champs sans `accessibilityLabel`, libellés figés (`"fermer"`, `"previous"`, `"play"`) | `accessibilityLabel` sur tous les boutons visuels et tous les `Field` ; icônes décoratives en `accessibilityElementsHidden` ; libellés figés remplacés par des clés i18n ; **verrou** `tests/accessibility.test.ts` (3 règles) |
| Images | `Image` natif partout : pas de cache disque, pas de secours | `AppImage` unique (`expo-image`) : cache, fondu, cadre de secours, `decorative` ; les 19 usages migrés |
| Squelettes | Le jeton `opacity.skeleton` existait sans composant | `Skeleton` + `HeroSkeleton` + `ListSkeleton` (pulsation figée si mouvement réduit) ; branchés sur accueil, panier, compte, sections |
| Liste commandes | `map` sur un historique sans plafond, non virtualisé | `FlatList` sur `/orders` (listes bornées ou dans un `ScrollView` laissées en `map` — pas de liste virtualisée imbriquée) |
| Onglet Vision | Onglet vide = 20 % de la barre du bas sans action | CTA réel vers Lens (`vision.emptyAction`) ; l'onglet reste (contrat de copie) |
| Miroir RTL | Rangées à ordre fixe restées LTR en arabe (steppers, en-têtes, grilles) | `rowDirectionFor`/`actionDirectionFor(isRTL)` purs + testés ; appliqués aux primitives (`KeyValue`, `LinkRow`, `DrawerItem`, `SubScreen`, `Segmented`, `ToggleRow`) et aux écrans (panier, aywebs, compte, assistant, navigateur, grilles catalogue/promotions/stories/sections, footer, tiroir SONIM) |
| Textes de chargement | Objets `{fr, ar}` en dur dans les écrans | `LoadingBlock` prend une clé `labelKey` ; clés `loading.*` dans les deux langues |
| testID | 1 seul dans l'application | `testID` sur les primitives (`Button`, `LinkRow`, `AppScreen`, `SubScreen`, `AppImage`) et les actions clés (kebab-case — un `testID` en `dot.case` serait pris pour une clé i18n) |
| CI | L'APK ne se construisait que sur `arena/c0321e79-ayrovi-beta1` | `mobile-android.yml` et `mobile.yml` déclenchés aussi sur `arena/bc19f283-ayrovi-beta1` |

**Non fait (volontairement) :** vérification visuelle sur appareil (à faire sur l'APK démo reconstruit), liste virtualisée imbriquée dans un `ScrollView` (anti-patron).

## Passe du 09/10/2026 — miroir RTL complet écran par écran (P6)

| Zone | Avant | Après |
|---|---|---|
| Rangées non miroitées | 35 rangées `flexDirection: 'row'` en littéral dans 25 fichiers (écrans + composants) | Toutes passent par `rowDirectionFor(theme.isRTL)` (base LTR + surcharge inline au point d’usage) |
| Alignements de bord | 8 `alignItems`/`alignSelf: 'flex-start'` épinglaient à gauche même en arabe | `startAlignFor(theme.isRTL)` (nouvelle décision pure, testée) : début de lecture à droite en RTL |
| Écrans couverts | primitives + quelques écrans | tous les écrans avec rangées : onglets Lens, favoris, notifications, profil, panier AYWEBs, ocerex, montres, publications, sign-in, checkout (stepper), accueil (annonces), cartes produit/news/promotion/story, commentaires, reels, visionnage storie, SONIM, marque, bannière réseau, squelettes |

**Verrous** : `startAlignFor` testé (`layoutLogic.test.ts`) ; deux verrous à ZÉRO dans `design-system.test.ts` (aucune rangée littérale en style inline ; tout fichier déclarant une rangée littérale la miroite). Suite mobile : 445 tests verts, typecheck clean, tokens:check OK.
