# Accueil — passe « interface principale » (19/11/2026)

L'accueil est le premier écran jugé par un client, et le seul qui compose
**sept rubriques optionnelles** décidées par le back office. Cette passe ne
touche ni au contenu ni aux styles : elle corrige trois défauts de composition
et un défaut de sémantique.

## 1. Les espaces de section appartiennent aux sections

`SectionBreak` (48 dp) était posé **entre** les blocs dans `app/(tabs)/index.tsx`,
alors que Stories, Black Friday, Clean (Lens) et Reels • Shop peuvent ne rien
afficher (désactivés, vides, ou en erreur). Deux rubriques absentes d'affilée
laissaient donc **deux espaceurs collés** — jusqu'à ~96 dp de blanc sans contenu,
que le client lit comme un bug d'affichage.

Désormais chaque section porte son propre `SectionBreak` à son premier rendu :

| Fichier | Comportement |
|---|---|
| `StoriesSection.tsx` | `SectionBreak` rendu avec les cartes |
| `BlackFridaySection.tsx` | idem (rien si aucune sélection) |
| `LensHomeBlock.tsx` | idem (rien si désactivé/erreur) |
| `ReelsShopSection.tsx` | idem (le placeholder muet n'ajoute rien) |
| `HighlightsSection.tsx` | idem |

`app/(tabs)/index.tsx` n'importe plus `SectionRule` du tout. Test de garde :
`tests/home-fallback.test.ts`.

## 2. Hors ligne, l'accueil le dit

Chaque rubrique disparaissait seule en cas d'échec réseau — correct bloc par
bloc, désastreux quand **tout** échoue : en-tête, deux onglets et pied de page,
sans un mot. Le client conclut que l'application est cassée.

`src/features/home/homeState.ts` (`homeLoadFailed`) n'affiche
`HomeOfflineBlock` que si : aucune requête en attente **et** toutes en erreur.
Une réponse valide (même vide) garde la page silencieuse — on ne crie pas
« hors ligne » pour une rubrique secondaire. Le bouton « Réessayer » relance
le rafraîchissement complet de l'écran.

## 3. Le tirer-pour-rafraîchir va au bout

`reload()` rafraîchissait Hero, Stories, Black Friday, l'offre du jour, le cover
et Watshis. **Clean (Lens)** et **Reels • Shop** ont leur propre requête et
restaient périmés. Les deux clés sont maintenant invalidées avec les autres.

## 4. Les deux entrées du haut ne sont pas des onglets

`HomeTabs` déclarait `tablist` / `tab` sans aucun onglet sélectionné : un lecteur
d'écran annonçait un jeu d'onglets incomplet. Ce sont deux **destinations**
(Zayrovi News, Social Commerce) : rôle `link`.

## Vérifications

- `tests/home-fallback.test.ts` — 5 tests : logique hors ligne, câblage réel
  sur l'écran, absence d'espaceur orphelin, présence de l'espaceur dans chaque
  section optionnelle.
- `tests/storiesShowcase.test.ts`, `tests/device-test-2026-11-15.test.ts` —
  mis à jour sur le nouveau contrat de structure (la règle « aucun filet gris »
  reste vérifiée).
- Suites mobiles complètes : typecheck, `tokens:check`, Vitest, Jest UI,
  export Android.
