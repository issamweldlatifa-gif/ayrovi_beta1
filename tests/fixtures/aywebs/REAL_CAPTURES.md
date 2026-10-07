# Captures réelles — preuves de terrain (AYWEBs)

Ces fichiers ne sont **pas** fabriqués : ce sont des pages réellement enregistrées
lors de l'audit du **06/10/2026**, conservées telles quelles (aucune retouche).
Elles servent de *goldens* : un test qui les lit ne peut pas « inventer » son
attendu, il lit ce que le marchand a publié ce jour-là.

| Fichier | Page réelle | Octets | SHA-256 |
|---|---|---|---|
| `amazon-de-rendered-sponsored-price.html` | `https://www.amazon.de/dp/B0D1XD1ZV3` (page rendue, Amazon DE) | 1 414 684 | `2e0def3fa24cca4cf98643d2c5c7f26ea0e5a01de2059e8b5e17bf48a7936646` |
| `amazon-us-mobile-concat-price.html` | `https://www.amazon.com/dp/B0D1XD1ZV3` (mobile, Amazon US) | 693 501 | `ebab23c5be44ebcd33f62f9eb10902ff67ef220fcc2224baab3bf6288fa0b2f0` |
| `real-amazon-de-desktop-2026-10-06.html` | `https://www.amazon.de/dp/B0D1XD1ZV3` (desktop, Amazon DE — même jour, autre rendu) | 842 261 | `b9c225d33f14351b856d8f9192e57e43cdf1ee2600c7a33d1871cd85dff874e5` |
| `amazon-shell.html` | coquille Amazon (page sans contenu produit) | 3 781 | `0d98858809d96d092288b2de44043442faaa2199e3f0e6c0afd5b8a08a6ed0b6` |

## Ce que ces pages publient — et ce qu'elles ne publient pas (mesuré)

| Fait | Amazon DE (rendue) | Amazon DE (desktop) | Amazon US (mobile) |
|---|---|---|---|
| `#acrPopover[title]` | `4.6 out of 5 stars` | `4.6 out of 5 stars` | **absent** |
| `#acrCustomerReviewText[aria-label]` | `46,196 Reviews` | `46,886 Reviews` | **absent** |
| `input[name="ASIN"][value]` | `B0D1XD1ZV3` | `B0D1XD1ZV3` | `B0D1XD1ZV3` |
| `#merchant-info` (vendeur) | **VIDE** | **VIDE** | **VIDE** |
| `[data-asin]` | 36 valeurs **distinctes** (carrousel) | 6 nœuds, 1 valeur | 3 nœuds, 1 valeur |
| `script[type="application/ld+json"]` | 0 | 0 | 0 |
| `[itemprop]` | 0 | 0 | 0 |

Conséquences verrouillées par les tests (`tests/scraper-extended-fields.test.ts`) :

1. la note et le nombre d'avis **sont lus** sur les deux captures desktop — les
   valeurs attendues sont celles des fichiers, vérifiées par empreinte SHA-256 ;
2. la capture mobile, qui ne les publie pas, doit rendre `undefined` : l'absence
   reste une absence (`null`), jamais un `4.0` de consolation ;
3. `#merchant-info` vide ⇒ `seller` **absent** — jamais « Amazon » (règle Phase 0 :
   le nom de la boutique ne remplace pas le vendeur de l'offre) ;
4. `[data-asin]` n'est **pas** lu : 36 valeurs de carrousel dans la même page,
   dont 35 appartiennent à des produits sponsorisés voisins.

Le produit de référence de ces trois pages est `B0D1XD1ZV3`.
