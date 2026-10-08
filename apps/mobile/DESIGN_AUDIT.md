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
