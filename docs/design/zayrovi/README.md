# ZAYROVI — changement de nom et nouveau logo (2026-10-16)

Décision produit : la marque AYROVI devient **ZAYROVI** dans le site, le back-office,
l'application, les courriels, les factures, les pages légales et les documents —
**sauf le serveur et le nom de domaine**, tant que le nouveau domaine n'est pas acheté.

Planche : `zayrovi-1-logo-ecrans.jpg` (captures Chromium du build de cette branche ;
l'écran natif Android y est une maquette du fichier, pas une capture d'appareil).

## Logo

- Le Z fourni (capture 1080 × 1920, Z blanc sur noir) est tracé en **un seul chemin
  vectoriel** : `client/src/design/zMark.ts` ≡ `apps/mobile/src/design/zMark.ts`
  (un test vérifie qu'ils restent identiques, et identiques au chargeur de `client/index.html`).
- Monochrome : noir `#0A0A0A` ou blanc. Aucun violet — il reste réservé à l'action principale.
- Logotype « Z + ZAYROVI » en Zalando Sans Bold, aux proportions de l'ancien (5,31 : 1) :
  à hauteur égale, même largeur — en-tête, pied de page, console et pages de connexion
  gardent exactement leur gabarit.
- Les fichiers gardent leur nom (`client/public/media/logo-ayrovi-*`) ; leurs URL passent à
  `?v=5.0`, parce que `/media` est servi en cache « immutable » d'un an.
- Nouveau : `logo-ayrovi-icon.svg` (carré noir, Z blanc), utilisé comme favicon.

## Ouverture et chargement

- **Ouverture de l'application** (écran natif, pendant le démarrage) : fond `#0A0A0A`,
  Z blanc, dans les deux thèmes (`app.json`, `splash-icon*.png`).
- **Écran de chargement** (maquette « Z dans l'anneau ») : Z gris au centre d'un anneau
  clair, un arc plus foncé tourne. Jetons du thème : Z et arc `muted`, anneau `line`,
  fond `canvas` ; immobile si le système demande moins d'animations. Le même dessin sert
  à l'amorçage du site (`client/index.html` + `main.tsx`).

## Ce qui ne change pas (volontairement)

| Élément | Raison |
|---|---|
| Domaine `ayrovi.tn`, URL et adresses e-mail, serveur Render | demandé : attendre l'achat du nouveau domaine |
| Identifiant Android `app.ayrovi.mobile`, schéma `ayrovi://` | le changer installerait une autre application (pas de mise à jour) et casserait les retours de connexion |
| Variables CSS `--ayrovi-*`, noms de fichiers, variables d'environnement, en-têtes `x-ayrovi-*`, préfixes de numéros (`AYR-…`) | identifiants techniques, invisibles ou déjà imprimés |
| Code de catégorie de news `AYROVI` | valeur stockée (contrainte en base) ; son **libellé** affiché devient ZAYROVI |
| « Client AYROVI » | nom provisoire des comptes, comparé tel quel par la logique des comptes clients |
| Marqueur `AYROVI:1` du QR des factures | format des factures déjà imprimées |
| Nom transmis aux marchands pour l'entrepôt | logistique |
| Journal d'audit, lignes de panier déjà enregistrées | historique |
| « AYROVIX Lens », « AYWEBs » | sous-marques : décision à prendre |

## Données déjà enregistrées

Migration one-shot `rebrand_zayrovi_v1` : seules les valeurs **encore égales aux graines
d'origine** passent à ZAYROVI (nom et nom légal de l'entreprise, politique de remboursement,
nom de l'admin, contenus de démonstration, libellés LENS, réponses FAQ, organisation ERP,
libellé arabe « مجلة » de la barre publique…). Un texte modifié depuis le Dashboard n'est
jamais touché : les textes écrits par l'équipe qui citent AYROVI se corrigent dans le Dashboard.

Vérifiée sur une copie d'une base d'avant le changement : après démarrage, il ne reste
« AYROVI » que dans le journal d'audit et une ligne de panier enregistrée (historique).
