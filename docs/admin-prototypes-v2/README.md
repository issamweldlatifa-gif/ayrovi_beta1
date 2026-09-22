# Modèles d'admin, 2ᵉ tour — consoles opérationnelles (niveau entreprise)

Premier tour (dossier `../admin-prototypes/`, conservé pour mémoire) : quatre directions de design,
écartées — trop « maquette », pas assez outil de travail.

Ce deuxième tour part d'une autre question : **comment travaillent les grands ?** Chaque modèle
reprend les conventions opérationnelles d'une plateforme que l'équipe connaît déjà, et les applique
aux vrais écrans AYROVI (commandes en TND, acomptes à vérifier, arrivages, barre sous l'en-tête,
libellés FR + AR).

| # | Modèle | Référence | Fichier HTML | Cadre Figma |
| - | ------ | --------- | ------------ | ----------- |
| A | Console opérationnelle | Amazon Seller Central | `a-amazon-console.html` | `figma/cadres/modele-1-amazon-commandes.svg` |
| B | Console financière | Stripe Dashboard | `b-stripe-console.html` | `figma/cadres/modele-2-stripe-acomptes.svg` |
| C | Console technique | Google Cloud / AWS | `c-cloud-console.html` | `figma/cadres/modele-3-cloud-commandes.svg` |
| D | Console commerçant | Shopify Admin | `d-shopify-console.html` | `figma/cadres/modele-4-shopify-index.svg` |

- **Comparer** : ouvrir `index.html` (autonome, captures et police incluses).
- **Travailler dans Figma** : `FIGMA.md` — import des cadres SVG, jetons `figma/tokens.json`
  (plugin Tokens Studio), polices, noms de calques, régénération.
- **Ce qui ne change pas d'un modèle à l'autre** : le contenu réel, la liste fermée des destinations
  (pas de lien mort possible), les permissions par rôle et la journalisation des actions.
- **Générateurs** : `figma/generate.mjs` (cadres SVG), `build-html.mjs` (maquettes B, C, D),
  `build-index.py` (page de comparaison), `figma/shoot.mjs` (captures dans `evidence/`).

Dès que la lettre est choisie, la conversion de l'admin AYROVI se fait sur ce modèle.
