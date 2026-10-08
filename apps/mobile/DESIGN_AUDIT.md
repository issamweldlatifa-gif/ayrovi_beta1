# Design Audit — AYROVI React Native

**Date** : 08/10/2026
**Règle** : aucune correction avant d'avoir nommé la cause. Ce document liste des
MESURES faites sur le code, pas des impressions.

> Gate : *FREEZE NEW UI FEATURES until the design system and responsive
> foundation are stable.* Aucun écran nouveau n'est livré tant que les points
> §A–§C ne sont pas fermés.

---

## ① Problèmes constatés (mesurés)

| # | Constat | Mesure |
|---|---|---|
| 1 | Safe area **optionnelle par écran** | 23 écrans sur 35 n'ont AUCUNE gestion d'insets |
| 2 | Barre d'onglets sans marge basse | `tabBarStyle` n'a que `paddingTop: 6` — aucun `insets.bottom` |
| 3 | En-tête transparent en PERMANENCE | `AppHeader` : `backgroundColor: 'transparent'`, sans état |
| 4 | Composants partagés manquants | `ProductImage`, `SectionHeader`, `SearchInput`, `EmptyState`, `LoadingState`, `BottomTabs` : inexistants |
| 5 | Hauteurs fixes sur du contenu dynamique | 24 fichiers, valeurs 20 → 200 |
| 6 | `ScrollView` imbriqués | 3 fichiers (`assistant`, `subScreen`, `PublicSections`) |
| 7 | Listes non virtualisées | `ScrollView` : 13 fichiers · `FlatList` : 3 |
| 8 | Clavier non géré partout | `KeyboardAvoidingView` : 3 écrans seulement |
| 9 | `position: absolute` | 7 occurrences / 6 fichiers — à justifier une par une |
| 10 | `overflow: hidden` | 13 occurrences / 12 fichiers — à justifier une par une |

---

## ② Causes racines

### Cause A — « La mise en page est un choix d'écran, pas une propriété du système »

C'est la cause qui explique les points 1, 2, 5 et la plupart des autres.

`Screen` fait le travail correctement (`paddingTop: insets.top`,
`paddingBottom: insets.bottom`). Mais **23 écrans contournent `Screen`** et
reconstruisent leur mise en page à la main, avec des nombres écrits en dur.
Conséquence : chaque nouvel écran doit *se souvenir* des règles. Il les oublie,
une écran sur deux. Ce n'est pas de la négligence — c'est une architecture qui
rend la négligence facile.

> Tant que le socle n'impose pas la règle, la discipline ne tient pas.

### Cause B — « L'en-tête n'a pas d'état de défilement »

L'en-tête a été construit « transparent » (consigne) sans prévoir son état
« après le héro ». Un en-tête qui ne connaît pas sa position de défilement ne
peut pas devenir solide : il reste transparent au-dessus de sections claires,
donc illisible. Ce n'est pas un défaut de couleur, c'est un **état manquant**.

### Cause C — « Les primitives d'image et de section n'existent pas »

`ProductImage` n'existe pas : chaque carte (`ProductCard`, `CandidateCard`,
`NewsCard`, `StoryCard`, `PromotionCard`, `ReelCard`) décide seule de sa hauteur
et de son `resizeMode`. D'où les hauteurs fixes (160, 140, 84…) et les
comportements divergents selon le format d'image — exactement le symptôme
décrit au §6 du gate.

### Cause D — « La barre d'onglets est configurée dans un fichier de routes »

Le style de la barre vit dans `app/(tabs)/_layout.tsx`. Il n'y a pas de
composant `BottomTabs` réutilisable, donc pas d'endroit unique où la règle de
safe area peut être posée une fois.

---

## ③ Architecture — ce qui corrige la cause, pas le symptôme

| Cause | Correction architecturale |
|---|---|
| A | **`src/design/layout.tsx`** : une primitive `AppScreen` possédant safe area + défilement + espacement. Un écran qui ne l'utilise pas est une exception assumée et documentée. |
| B | **`AppHeader` à deux états** : `transparent` au-dessus du héro, `solid` après — piloté par la position de défilement, sans changement de dimensions (pas de saut). |
| C | **`ProductImage`** : rapport d'aspect et `resizeMode` déclarés par la primitive ; les cartes ne fixent plus de hauteur. |
| D | **`BottomTabs`** : composant unique, safe area incluse, utilisé par le layout de routes. |

---

##④ État d'avancement

- [x] Audit mesuré + causes racines (ce document)
- [ ] `AppScreen` — primitive de mise en page (safe area, défilement, espacement)
- [ ] `AppHeader` — transition transparent → solide
- [ ] `BottomTabs` — composant unique avec safe area
- [ ] `ProductImage` — rapport d'aspect + `resizeMode` par politique
- [ ] `SectionHeader` · `EmptyState` · `LoadingState` · `SearchInput`
- [ ] Refactor des 23 écrans sur la primitive
- [ ] Matrice d'appareils + régression

---

## Rappel honnête

L'environnement n'a **pas de vision** et pas d'émulateur : l'audit ci-dessus est
fait sur le CODE (mesures, comptages, lecture des composants). Les points qui
demandent un œil — rendu final, jank, débordement réel sur un appareil donné —
**ne peuvent pas être vérifiés ici** et restent à valider sur appareil.
