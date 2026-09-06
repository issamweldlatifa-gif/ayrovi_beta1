# Absorption de la longue traîne — P3/T2e

Généré par `scripts/design-palette-snap.cjs --max-delta 2`.

- Avant : **223** tons verbatims dans `tokens.css` (valeur exacte de chaque littéral déplacé en T1).
- Après : **164** — 59 teintes absorbées par un token voisin, à un écart maximal de **2/255 par canal** (et Σ des trois canaux indiqué par ligne).
- Un token absorbé n'existe plus : sa valeur est remplacée partout par la cible. Cette table reste le seul endroit qui relate la valeur d'avant.

| ton absorbé | valeur d'avant | → cible | valeur de la cible | écart max/canal | Σ canaux | usages réécrits |
|---|---|---|---|---:|---:|---:|
| `--admin-tone-111217` | `#111217` | `--admin-ink-strong` | `#111318` | 1 | 2 | 3 |
| `--admin-tone-271250` | `#271250` | `--admin-tone-25104f` | `#25104f` | 2 | 5 | 1 |
| `--admin-tone-554b62` | `#554b62` | `--admin-tone-534961` | `#534961` | 2 | 5 | 1 |
| `--admin-tone-6f6579` | `#6f6579` | `--admin-tone-6f647b` | `#6f647b` | 2 | 3 | 1 |
| `--admin-tone-766c80` | `#766c80` | `--admin-tone-756b80` | `#756b80` | 1 | 2 | 1 |
| `--admin-tone-777280` | `#777280` | `--admin-text-soft` | `#77727f` | 1 | 1 | 2 |
| `--admin-tone-7d7288` | `#7d7288` | `--admin-tone-7b7288` | `#7b7288` | 2 | 2 | 1 |
| `--admin-tone-82778d` | `#82778d` | `--admin-tone-81778b` | `#81778b` | 2 | 3 | 1 |
| `--admin-tone-82788d` | `#82788d` | `--admin-tone-81778b` | `#81778b` | 2 | 4 | 1 |
| `--admin-tone-8a8691` | `#8a8691` | `--admin-tone-898491` | `#898491` | 2 | 3 | 1 |
| `--admin-tone-8d8494` | `#8d8494` | `--admin-tone-8c8395` | `#8c8395` | 1 | 3 | 1 |
| `--admin-tone-9a96a1` | `#9a96a1` | `--admin-tone-9994a0` | `#9994a0` | 2 | 4 | 1 |
| `--admin-tone-a5a2ad` | `#a5a2ad` | `--admin-tone-a5a1ae` | `#a5a1ae` | 1 | 2 | 1 |
| `--admin-tone-b7b2c1` | `#b7b2c1` | `--admin-tone-b6b2bf` | `#b6b2bf` | 2 | 3 | 1 |
| `--admin-tone-bbb5c5` | `#bbb5c5` | `--admin-tone-bbb7c3` | `#bbb7c3` | 2 | 4 | 1 |
| `--admin-tone-ccc8d2` | `#ccc8d2` | `--admin-tone-ccc8d1` | `#ccc8d1` | 1 | 1 | 1 |
| `--admin-tone-d9cff2` | `#d9cff2` | `--admin-tone-d9cef3` | `#d9cef3` | 1 | 2 | 1 |
| `--admin-tone-d9d5de` | `#d9d5de` | `--admin-tone-d9d3df` | `#d9d3df` | 2 | 3 | 1 |
| `--admin-tone-dcd4ed` | `#dcd4ed` | `--admin-tone-dad2ec` | `#dad2ec` | 2 | 5 | 1 |
| `--admin-tone-ddd7e8` | `#ddd7e8` | `--admin-tone-ddd6e9` | `#ddd6e9` | 1 | 2 | 1 |
| `--admin-tone-ddd7ec` | `#ddd7ec` | `--admin-tone-ddd5ee` | `#ddd5ee` | 2 | 4 | 1 |
| `--admin-tone-ddd8e4` | `#ddd8e4` | `--admin-tone-dcd7e3` | `#dcd7e3` | 1 | 3 | 1 |
| `--admin-tone-ddd9e5` | `#ddd9e5` | `--admin-tone-ddd8e6` | `#ddd8e6` | 1 | 2 | 1 |
| `--admin-tone-dfd9e8` | `#dfd9e8` | `--admin-tone-ddd8e6` | `#ddd8e6` | 2 | 5 | 1 |
| `--admin-tone-dfdbe5` | `#dfdbe5` | `--admin-tone-dfdbe4` | `#dfdbe4` | 1 | 1 | 1 |
| `--admin-tone-e0dce5` | `#e0dce5` | `--admin-tone-dfdbe4` | `#dfdbe4` | 1 | 3 | 1 |
| `--admin-tone-e2deea` | `#e2deea` | `--admin-tone-e1ddea` | `#e1ddea` | 1 | 2 | 1 |
| `--admin-tone-e3e0e5` | `#e3e0e5` | `--admin-tone-e2dfe4` | `#e2dfe4` | 1 | 3 | 2 |
| `--admin-tone-e5e1e9` | `#e5e1e9` | `--admin-tone-e6e2ea` | `#e6e2ea` | 1 | 3 | 1 |
| `--admin-tone-e7f7ef` | `#e7f7ef` | `--admin-tone-e6f7ef` | `#e6f7ef` | 1 | 1 | 1 |
| `--admin-tone-eeeef1` | `#eeeef1` | `--admin-tone-efedf2` | `#efedf2` | 1 | 3 | 1 |
| `--admin-tone-f0edf8` | `#f0edf8` | `--admin-line-firm` | `#f0eef7` | 1 | 2 | 1 |
| `--admin-tone-f1edf8` | `#f1edf8` | `--admin-line-firm` | `#f0eef7` | 1 | 3 | 1 |
| `--admin-tone-f1eef8` | `#f1eef8` | `--admin-line-firm` | `#f0eef7` | 1 | 2 | 1 |
| `--admin-tone-f1eff4` | `#f1eff4` | `--admin-tone-efedf2` | `#efedf2` | 2 | 6 | 1 |
| `--admin-tone-f1fbf6` | `#f1fbf6` | `--admin-tone-f0fdf4` | `#f0fdf4` | 2 | 5 | 1 |
| `--admin-tone-f2edff` | `#f2edff` | `--admin-tone-f0ebff` | `#f0ebff` | 2 | 4 | 1 |
| `--admin-tone-f2f2f4` | `#f2f2f4` | `--admin-tone-f1f1f3` | `#f1f1f3` | 1 | 3 | 1 |
| `--admin-tone-f2f2f6` | `#f2f2f6` | `--admin-tone-f4f4f5` | `#f4f4f5` | 2 | 5 | 1 |
| `--admin-tone-f5f4f7` | `#f5f4f7` | `--admin-tone-f4f4f5` | `#f4f4f5` | 2 | 3 | 3 |
| `--admin-tone-f5f5f7` | `#f5f5f7` | `--admin-surface-page` | `#f6f6f9` | 2 | 4 | 1 |
| `--admin-tone-f6f5f9` | `#f6f5f9` | `--admin-surface-page` | `#f6f6f9` | 1 | 1 | 1 |
| `--admin-tone-f7f3ff` | `#f7f3ff` | `--admin-tone-f5f1ff` | `#f5f1ff` | 2 | 4 | 1 |
| `--admin-tone-f7f5fb` | `#f7f5fb` | `--admin-surface-page` | `#f6f6f9` | 2 | 4 | 1 |
| `--admin-tone-f7f6fa` | `#f7f6fa` | `--admin-surface-page` | `#f6f6f9` | 1 | 2 | 1 |
| `--admin-tone-f8f5ff` | `#f8f5ff` | `--admin-tone-f7f4ff` | `#f7f4ff` | 1 | 2 | 1 |
| `--admin-tone-f8f7fa` | `#f8f7fa` | `--admin-surface-page` | `#f6f6f9` | 2 | 4 | 1 |
| `--admin-tone-f9fafb` | `#f9fafb` | `--admin-surface-sunken` | `#faf9fc` | 1 | 3 | 2 |
| `--admin-tone-faf8fe` | `#faf8fe` | `--admin-surface-tint` | `#faf8ff` | 1 | 1 | 1 |
| `--admin-tone-faf9fb` | `#faf9fb` | `--admin-surface-sunken` | `#faf9fc` | 1 | 1 | 2 |
| `--admin-tone-fafafa` | `#fafafa` | `--admin-surface-sunken` | `#faf9fc` | 2 | 3 | 4 |
| `--admin-tone-fafafd` | `#fafafd` | `--admin-surface-sunken` | `#faf9fc` | 1 | 2 | 2 |
| `--admin-tone-fbfafc` | `#fbfafc` | `--admin-surface-sunken` | `#faf9fc` | 1 | 2 | 2 |
| `--admin-tone-fbfbfc` | `#fbfbfc` | `--admin-surface-soft` | `#fbfbfe` | 2 | 2 | 1 |
| `--admin-tone-fcfbfd` | `#fcfbfd` | `--admin-surface-soft` | `#fbfbfe` | 1 | 2 | 1 |
| `--admin-tone-ffebe9` | `#ffebe9` | `--admin-tone-ffebe8` | `#ffebe8` | 1 | 1 | 1 |
| `--admin-tone-fff1f1` | `#fff1f1` | `--admin-tone-fff1f2` | `#fff1f2` | 1 | 1 | 1 |
| `--admin-tone-fff6ef` | `#fff6ef` | `--admin-tone-fff7ed` | `#fff7ed` | 2 | 3 | 1 |
| `--admin-tone-fff8da` | `#fff8da` | `--admin-tone-fff8d8` | `#fff8d8` | 2 | 2 | 1 |

## Cibles les plus sollicitées

- `--admin-surface-sunken` `#faf9fc` absorbe 5 teinte(s) : #fafafa, #f9fafb, #faf9fb, #fafafd, #fbfafc
- `--admin-surface-page` `#f6f6f9` absorbe 5 teinte(s) : #f6f5f9, #f7f5fb, #f7f6fa, #f8f7fa, #f5f5f7
- `--admin-line-firm` `#f0eef7` absorbe 3 teinte(s) : #f0edf8, #f1edf8, #f1eef8
- `--admin-surface-soft` `#fbfbfe` absorbe 2 teinte(s) : #fcfbfd, #fbfbfc
- `--admin-tone-f4f4f5` `#f4f4f5` absorbe 2 teinte(s) : #f5f4f7, #f2f2f6
- `--admin-tone-efedf2` `#efedf2` absorbe 2 teinte(s) : #f1eff4, #eeeef1
- `--admin-tone-81778b` `#81778b` absorbe 2 teinte(s) : #82778d, #82788d
- `--admin-tone-ddd8e6` `#ddd8e6` absorbe 2 teinte(s) : #ddd9e5, #dfd9e8
- `--admin-tone-dfdbe4` `#dfdbe4` absorbe 2 teinte(s) : #dfdbe5, #e0dce5
- `--admin-ink-strong` `#111318` absorbe 1 teinte(s) : #111217
- `--admin-text-soft` `#77727f` absorbe 1 teinte(s) : #777280
- `--admin-surface-tint` `#faf8ff` absorbe 1 teinte(s) : #faf8fe
