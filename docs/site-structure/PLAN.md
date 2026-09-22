# AYROVI — structure du site public : revue et découpe proposée

Écrit le **2026-09-22**, après l'écran de connexion client. Ce document répond à deux choses :
ce qui a été **corrigé tout de suite** sur la connexion, et la **découpe du site** en espaces de
revue — avec les routes réelles, la source d'administration de chaque zone, et l'ordre de passage.

Carte visuelle : `CARTE-SITE.png` (et `CARTE-SITE.svg`, éditable dans Figma).

---

## 1. La revue de l'écran de connexion (faite)

Demande : *« تحسين واجهة دخول وحذف تكرار الكلمات »*. Mesuré sur `/` + `?customerAuth=login`
à 390 px, en français et en arabe, captures dans `../auth-review/`.

### 1.1 Les répétitions retirées

| Où | Avant | Après | Pourquoi |
| --- | --- | --- | --- |
| Sous-titre | « **Connectez-vous** à votre univers AYROVI. » sous le titre « **Connectez-vous.** » | « Vos commandes, vos favoris et votre panier, au même endroit. » | Le verbe était écrit deux fois de suite. Le sous-titre dit maintenant ce qu'il y a **derrière** la porte — la seule information utile à cet endroit. |
| Champ e-mail | étiquette « Adresse e-mail » + *placeholder* « Votre adresse e-mail » | placeholder « vous@exemple.tn » | Un placeholder qui recopie l'étiquette occupe la place sans rien apprendre. Ici il **montre le format**. |
| Champ mot de passe | étiquette « Mot de passe » + *placeholder* « Votre mot de passe » | aucun placeholder | L'étiquette suffit ; la règle des 8 caractères s'affiche sous le champ à l'inscription. |
| Champ nom (inscription) | « Votre nom complet » | « Ex. Sarra Ben Ali » | Montre le format attendu au lieu de répéter « nom ». |

Le libellé arabe suit la même règle : **طلباتك، مفضّلاتك وسلّتك — في مكان واحد.**

### 1.2 Le bouton principal n'est plus mort

Avant, « Se connecter » était **grisé** tant que les deux champs étaient vides — sans rien dire.
Un bouton grisé sans explication ne se distingue pas d'un site en panne. Désormais :

- le bouton est **actif** ; les champs sont `required`, donc le navigateur guide la saisie, et le
  serveur tranche ;
- seule l'attente réseau le désactive — et à ce moment-là le curseur d'attente est légitime
  (`aria-busy` sur le formulaire). Avant, **tout** bouton désactivé affichait un curseur d'attente,
  même quand il ne se passait rien : corrigé (`cursor: not-allowed` par défaut) ;
- `minLength=8` ne s'applique plus qu'à l'inscription : à la connexion, un compte ancien pouvait
  avoir un mot de passe plus court et le formulaire bloquait sans le dire.

### 1.3 « Conditions » et « Confidentialité » : un filet bleu, un lavis à 1 %

Demande : *« condition et les termes… اذا نعتمد خط أزرق بش بينهم، واذا لون أزرق بـ 1% »*.

C'est fait, et c'est **réglable en un seul endroit** (`client/src/styles/customer-auth.css`) :

```css
.ay-auth {
  --ay-auth-legal-rule: var(--ayrovi-border-soft);                                  /* le filet */
  --ay-auth-legal-wash: color-mix(in srgb, var(--ayrovi-text-primary) 1%, transparent); /* le lavis */
}
.ay-auth[data-legal-tone='blue'] {                       /* la variante bleue demandée */
  --ay-auth-legal-rule: color-mix(in srgb, #1c5db5 24%, transparent);
  --ay-auth-legal-wash: color-mix(in srgb, #1c5db5 4%, transparent);
}
```

- **Un filet vertical sépare les deux liens** : `border-inline-start` sur le second — le filet se
  place donc **entre** les deux en français **et** en arabe, sans règle `[dir]` dédiée.
- **Un filet au-dessus** détache le bloc du CTA, et un **lavis à 1 %** le groupe sans le repeindre
  (mesuré : `color(srgb 0 0 0 / 0.01)`).
- Les liens sont soulignés d'un trait discret : un lien doit se voir.
- Le bleu **n'est pas la valeur par défaut** : la charte AYROVI est monochrome + orange. Pour
  basculer, il suffit d'ajouter `data-legal-tone="blue"` sur `.ay-auth` — rien d'autre à toucher.
  Dis-moi « اعتمد الأزرق » et je le passe en défaut.

Avant / après : `../auth-review/fr-login.png` · variante bleue : `../auth-review/fr-login-bleu.png` ·
arabe (RTL) : `../auth-review/ar-login.png`.

### 1.4 Preuves

| Contrôle | Résultat |
| --- | --- |
| `npx vitest run tests/customer-auth-review.test.tsx` | 13 gardes vertes (copie, placeholders, bouton, bloc légal, variante bleue) |
| `npm run verify:customer-auth` (nouveau script — navigateur + API + base) | **23/23** — inscription, connexion, mauvais mot de passe, récupération, révocation de sessions |
| `npm run typecheck` · `npm run build` | propres |
| Budget orange (`tests/design-zalando.test.ts`) | intact — le bleu est un jeton local de cette feuille, pas un usage orange |

---

## 2. La découpe du site : cinq espaces

Le principe de la revue : **une place = une fonction**. Un espace est assez petit pour être revu en
une passe, assez grand pour être jugé sur une intention.

| # | Espace | Intention | Contenu réel | Alimenté par (console) |
| --- | --- | --- | --- | --- |
| **01** | **Acheter** | Le parcours qui mène au panier, et pas un clic de plus | Accueil (hero, LENS, stories), Tous les produits, Fiche produit, Recherche, Panier, Commande | Catalogue · Contenu · Tarification |
| **02** | **Découvrir** | Ce qui donne envie de revenir : le récit et le rythme | Arrivage, Gift & Cards, Magazine, Social, Marques, Bandeau | Contenu (barre publique, arrivages, promos, magazine, ticker, social) |
| **03** | **Suivre** | L'après-achat, là où l'on gagne un client qui revient | Mon compte, Commandes + suivi, Acompte/paiement, Favoris, Adresses, Support | Commerce (commandes, clients) · Support · CRM 360 |
| **04** | **Confiance** | Les pages qui répondent avant que la question ne se pose | À propos, Conditions, Confidentialité, Suppression des données, Contact et canaux, Livraison et retours | Système (réglages, واجهتي, canaux) · Journal d'audit |
| **05** | **Assister** | La couche IA : elle aide à choisir, elle ne remplace pas l'humain | AYROVI AI, AYROVIX Lens, AYVISI Vision (bientôt), réponses vérifiées | Contenu · Assistant (base de connaissance) · LENS |

### Le chrome permanent (visible partout)

Bandeau d'annonce · En-tête (logo, recherche, compte, panier) · **Barre d'onglets** (Arrivage, Gift
& Cards, Magazine — pilotée depuis `public-nav`) · Menu (5 groupes) · Pied de page · Barre mobile.
Ce chrome n'appartient à aucun espace : il est la **charpente** commune, et il est déjà alimenté par
la console (c'est la décision du 2026-09-22).

### L'ordre de passage proposé

**01 Acheter → 03 Suivre → 04 Confiance → 02 Découvrir → 05 Assister.**
Le chiffre d'abord, la fidélité ensuite, la preuve avant l'envie, le rythme, puis la couche IA —
qui dépend des quatre autres.

### Ce que la revue d'un espace vérifie (règle fixe)

1. **Un seul chemin par intention** — chaque but a une entrée évidente, zéro doublon de menu.
2. **Rien qui ne serve** — chaque bloc affiché est branché sur une donnée réelle ; un bloc
   décoratif est supprimé, pas maquillé.
3. **La même règle en FR et en AR** — aucun libellé latin qui traîne en arabe (le défaut trouvé la
   semaine dernière sur les onglets), aucun texte qui répète son titre, RTL vérifié à 390 px.
4. **Mesuré, pas supposé** — captures avant/après, comptage des clics, 0 erreur console,
   0 débordement horizontal à 390 px et 1360 px.

### Défauts déjà repérés (à traiter dans leur espace)

- **03 Suivre** : « Mes commandes » est accessible depuis le menu *et* le pied de page *et* la barre
  mobile — trois chemins pour une intention ; à confirmer et trancher au moment de la passe.
- **04 Confiance** : trois pages statiques (`terms.html`, `privacy.html`, `data-deletion.html`) et
  **pas de page « Contact » ni « Livraison et retours »** ; les réponses vivent aujourd'hui dans les
  conditions et dans le canal WhatsApp. À décider : pages réelles ou ancres dans les conditions ?
- **02 Découvrir** : « Social » est un écran interne, « Arrivage / Gift & Cards / Magazine » sont des
  pages — deux natures dans le même groupe du menu ; à uniformiser.
- **05 Assister** : « AYVISI Vision — قريبًا » est visible partout alors qu'elle n'existe pas encore.
  Un badge qui traîne finit par ne plus rien dire.
