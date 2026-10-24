# Grande fiche produit — état livré

Cette note décrit **ce qui tourne dans le code**, pas ce que les maquettes imaginent.
Si une ligne n'est pas dans le code, elle n'est pas ici.

## Fiche (application mobile)

| Élément | État |
| --- | --- |
| Photo principale 4:3 avec dégradé, titre et marque par-dessus | livré (`app/product/[id].tsx`) |
| En-tête transparent → solide au scroll | livré |
| Galerie plein écran, images puis vidéo | livré |
| Barre d'achat fixe, fond **noir** (`tone="solid"`) | livré, verrouillé |
| Feuille de choix de taille | livré |
| Accordéons qui masquent les sections vides | livré |
| Prix affiché = `finalPrice` renvoyé par le serveur uniquement | livré |
| Sections d'attributs pilotées par le CRM | livré |

### Sections d'attributs

Chaque attribut porte une `section` (`identite`, `matiere`, `mesures`, `technique`,
`beaute`, `pratique`) stockée en base et exposée par l'API publique. La fiche
regroupe les valeurs, garde l'ordre `identite, matiere, mesures, technique,
beaute, pratique, specs`, jette les valeurs vides et **n'affiche jamais un
groupe vide**. Une section inconnue ou absente retombe sur « الخصائص » (`specs`),
donc une section ajoutée plus tard ne casse pas l'écran.

## CRM (source unique)

- **Produits → Champs & attributs** : liste des attributs déclarés, bouton
  « Installer la matrice (21 attributs) », et formulaire de déclaration
  (clé, libellé, type, section, options, ordre, familles visées).
- **Famille = racine de l'arbre des catégories**. Une famille ajoutée dans
  « Catégories » est immédiatement proposée dans le formulaire d'attribut et
  filtre les champs du formulaire produit : aucune intervention développeur.
- Aucune famille cochée = l'attribut s'applique à toutes les familles.
- Le seed est **idempotent** par `attribute_key` : une ligne existante n'est
  jamais renommée, retypée ni déplacée.

## Maquettes présentes

`mockup-24-10.*`, `crm-product-form-24-10.*`, `families-attributes-24-10.*`,
`build_*.py`, `index.html`. Elles restent des images de référence ; en cas de
doute, le code ci-dessus fait foi.

## Hors périmètre à ce jour

- Édition / suppression ligne par ligne des attributs déjà déclarés depuis le
  CRM (la déclaration et le seed existent, la modification n'est pas exposée).

## Vérifications

- `tsc --noEmit` racine + client + `apps/mobile` : propre.
- vitest racine : les seuls échecs de l'environnement local sont les suites qui
  chargent `better-sqlite3` (binaire natif non compilable ici, elles tournent en
  CI), plus deux tests de veille de sources (`jina-reader`, `lens-recognition-cache`)
  déjà rouges à la base `a5dfaad` et sans rapport avec la fiche.
- vitest mobile : 80 fichiers / 889 tests verts, dont `productFiche` (16).
- jest mobile (`test:ui`) : 19 suites / 125 tests verts.
