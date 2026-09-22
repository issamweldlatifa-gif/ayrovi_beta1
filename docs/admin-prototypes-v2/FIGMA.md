# Travailler ces modèles dans Figma

Ce dossier contient **4 modèles de console d'administration** pour AYROVI, dessinés selon les
conventions opérationnelles d'Amazon Seller Central, Stripe, Google Cloud / AWS et Shopify Admin.
Chaque modèle existe sous deux formes :

| Forme | Fichier | À quoi ça sert |
| --- | --- | --- |
| Cadre Figma (SVG à calques nommés) | `figma/cadres/modele-*.svg` | Produire, décliner, annoter dans Figma |
| Maquette HTML autonome | `a-amazon-console.html` … `d-shopify-console.html` | Juger l'écran en vrai (police, densité, couleurs) |
| Jeu de jetons | `figma/tokens.json` | Couleurs, espacements, rayons, typographies (plugin Tokens Studio) |
| Page de comparaison | `index.html` | Les 4 modèles côte à côte, avec les captures |

Le format `.fig` étant propriétaire, il n'existe pas d'export direct : un **SVG structuré** est la
forme la plus fidèle et la seule que Figma reconstruit en calques éditables. Tout est régénérable —
voir « Modifier et régénérer » plus bas.

---

## 1. Importer un cadre dans Figma

1. Dans Figma : **Fichier → Importer** (ou glisser-déposer le fichier sur le canevas).
2. Choisir `figma/cadres/modele-1-amazon-commandes.svg` (puis les trois autres).
3. Le cadre arrive nommé **`Admin / Modèle n — …`**, à l'échelle 1440 × 900.
4. Déplier le calque : chaque élément porte un nom lisible (`chrome-haut`, `onglet-actifs`,
   `barre-filtres`, `tableau-commandes`, `panneau`, `barre-sous-entete`, `journal`…).
5. Double-cliquer sur un texte pour le réécrire : libellés, montants en TND, libellés arabes,
   lignes de la barre sous l'en-tête. Le texte reste du texte, il n'est pas aplati en courbes.

Astuce de rangement : créer une page « Admin — modèles », y déposer les 4 cadres côte à côte, puis
dupliquer un cadre pour dessiner une variante (mobile 390 px, état vide, message d'erreur).

### Deuxième méthode (sans téléchargement)

Ouvrir le `.svg` dans un éditeur de texte, copier tout le contenu, puis dans Figma faire
**Édition → Coller** directement sur le canevas : Figma reconstruit les mêmes calques.

### Si l'import SVG te paraît lourd

Figma accepte aussi les images : les captures `evidence/*.jpg` peuvent être déposées comme référence
visuelle (non éditables) — utile seulement pour annoter, pas pour produire.

---

## 2. Importer les jetons (`figma/tokens.json`)

1. Installer le plugin **Tokens Studio for Figma** (gratuit, dans la communauté Figma).
2. Ouvrir le plugin → onglet **Tools → Import → fichier JSON**, choisir `figma/tokens.json`.
3. Le fichier contient 5 jeux :
   - `couleur`, `espace`, `rayon`, `typo` — la base AYROVI (encre #111110, papier #FFFFFF, accent #FF6900) ;
   - `modeles` — un jeu par modèle : `modele-1-amazon`, `modele-2-stripe`, `modele-3-cloud`, `modele-4-shopify`.
4. Activer le jeu du modèle retenu, puis **Export → Create styles / variables** pour retrouver
   les couleurs et les typographies dans les panneaux natifs de Figma.

Si le plugin refuse un jeu, les valeurs se recopient à la main en deux minutes :

| Rôle | Modèle 1 · Amazon | Modèle 2 · Stripe | Modèle 3 · Cloud | Modèle 4 · Shopify |
| --- | --- | --- | --- | --- |
| Chrome (barre haute) | `#232F3E` | `#FFFFFF` | `#FFFFFF` | `#1A1A1A` |
| Accent (action principale) | `#FF9900` | `#635BFF` | `#1A73E8` | `#008060` |
| Lien | `#007185` | `#0A2540` | `#1A73E8` | `#005BD3` |
| Fond de page | `#EAEDED` | `#F6F9FC` | `#F8F9FA` | `#F6F6F7` |
| Carte / surface | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` |
| Bordure / filet | `#D5D9D9` | `#E3E8EE` | `#DADCE0` | `#E1E3E5` |
| Texte | `#0F1111` | `#0A2540` | `#202124` | `#303030` |
| Texte secondaire | `#565959` | `#425466` | `#5F6368` | `#616161` |
| Hauteur de ligne | 32 px | 40 px | 36 px | 44 px |

Couleurs de marque, communes aux quatre : encre `#111110`, papier `#FFFFFF`, accent AYROVI
`#FF6900`, succès `#0E7C4A`, alerte `#946200`, danger `#B3271E`, info `#1C5DB5`.

---

## 3. Polices

- **Zalando Sans** (police de marque) : fichier dans `client/public/fonts/editorial/zalando-sans.woff2`.
  L'installer sur le poste, ou utiliser `Zalando Sans` si le compte Figma y a accès (police Google Fonts).
- **Noto Sans Arabic** : nécessaire pour les libellés arabes (`وصلات جديدة`, `هدايا وبطاقات`, `مجلة AYROVI`).
- Les maquettes HTML embarquent la police en base64 : elles s'affichent correctement sans rien installer.

---

## 4. Structure d'un cadre (noms de calques)

Les quatre cadres partagent la même anatomie, ce qui rend le choix comparable :

1. **Zone publique de la console** — bandeau global (`chrome-haut`, `recherche`) et navigation de
   service (`chrome-onglets` ou `navigation-service`).
2. **Navigation interne** — `nav` (rail latéral, compteurs par écran) ou `onglets-vue`.
3. **En-tête d'écran** — `titre`, `sous-titre`, boutons d'action (`bouton-primaire`, `bouton-secondaire`).
4. **Files d'attente et filtres** — `alerts` (acomptes à vérifier, commandes neuves, arrivages à
   valider), `barre-filtres` ou `barre-filtre` avec conditions retirables.
5. **Liste** — `tableau-commandes` : colonnes Commande, Client, Statut, Paiement, Total TND, Art.,
   Créée le, Suivi. Actions de lot (`barre-actions-lot`), pagination en pied (`pagination`).
6. **Panneau de décision ou inspecteur** — `panneau` / `inspecteur` / `tiroir-detail` : montant,
   acompte, tarif appliqué, chronologie des événements, actions `Valider` / `Préparer` / `Facturer`.
7. **Contenu du site** — `barre-sous-entete` : les 3 liens réels avec libellé FR, libellé AR,
   destination issue de la liste fermée et ordre d'affichage, plus l'état publié/masqué.
8. **Preuves de confiance** — `journal` / `AUDIT LOG` (action, date, auteur, rôle).

---

## 5. Modifier et régénérer

```bash
# Les 4 cadres SVG
node docs/admin-prototypes-v2/figma/generate.mjs

# Les maquettes HTML B, C, D (le modèle A est écrit à la main : a-amazon-console.html)
node docs/admin-prototypes-v2/build-html.mjs

# La page de comparaison (captures + police embarquées)
python3 docs/admin-prototypes-v2/build-index.py
```

Tout est piloté par les mêmes données réelles dans ces scripts : changer un montant, un statut ou un
libellé arabe dans la table `orders` / `barEditor` et relancer suffit à mettre à jour les cadres et
les maquettes.

---

## 6. Et ensuite ?

Le choix se fait sur une seule question : **quel écran ressemble au travail réel de l'équipe ?**

- Travail par lots d'opérations → **A** (Amazon Seller Central).
- Le pilotage financier d'abord → **B** (Stripe).
- Traçabilité et filtres précis, profils techniques → **C** (Cloud / AWS).
- Boutique et contenu du site au même endroit → **D** (Shopify).

Une fois la lettre choisie, la conversion de l'admin AYROVI se fait sur ce modèle : les écrans
(`Commandes`, `Arrivages`, `Barre sous l'en-tête`, `Magazine`, `Social`, `Rôles & permissions`)
reprennent sa densité, ses couleurs et ses composants, et les jetons de `tokens.json` deviennent les
variables du thème côté application.

---

## ملخص بالعربي

- الملف `index.html` يعرض الموديلات الأربعة مقارنة مع الصور.
- كل موديل عندو نسختين: ملف HTML مستقل (باش تجرّب الشاشة بالحق)، وملف SVG (`figma/cadres/`) تدخّلو
  لـ Figma مباشرة وتلقى الطبقات مسمّاة والنص قابل للتعديل.
- الألوان والمسافات والخطوط يولّي فيهم ملف `figma/tokens.json` عبر plugin **Tokens Studio**.
- الخط: Zalando Sans موجود في الريبو، وزيد **Noto Sans Arabic** للنصوص العربية.
- نستنى كلمة منك (A / B / C / D) وبعدها نحول admin AYROVI على الموديل اللي تختارو.
