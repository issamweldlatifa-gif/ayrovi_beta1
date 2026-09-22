# Moyens de paiement du pied de page — décision, règle, preuves

**Date :** 2026-09-22 · **Périmètre :** signature publique (pied de page), caisse, registre d'icônes
**Demande d'origine :** « نزيدو moyenne paiement fi footer » — *fais attention : seulement les moyens
qu'on possède et qu'on sert vraiment* — « et un pied de page à la hauteur d'une plateforme avancée ».

---

## 1. Le fait qui commande tout

Interrogation du serveur **en marche** au moment de la décision :

```
GET /api/public/commerce-config
  capabilities.cardGateway            = false          → aucune passerelle carte réelle
  deposit.bankRib                     = ""             → aucun RIB publié
  deposit.posteAccount                = ""             → aucun compte postal publié
  deposit.flouciNumber                = ""             → aucun numéro, et un numéro n'est pas une passerelle
  paymentMethods (réglage Admin)      = CARD, FLOUCI, BANK_TRANSFER, POSTE
```

`paymentMethods` est une **intention de configuration**, pas une capacité d'encaissement : elle est
publiée par l'Admin mais ne prouve aucun contrat. La conséquence est nette : **aujourd'hui, aucun
moyen ne peut encaisser un dinar.** Afficher Visa / Mastercard / logos d'opérateurs sur la signature
publique serait donc une vitrine, pas une promesse tenue — et la caisse, elle, refuserait ces moyens.

## 2. Ce qui a été construit

| Pièce | Rôle |
| --- | --- |
| `client/src/commerce/paymentMethods.ts` | **Source unique** de la disponibilité : `availablePaymentMethods(policy)`, une fonction, deux consommateurs. FLOUCI est verrouillé à `false` (un numéro de téléphone ne crée pas un paiement). |
| `client/src/components/FooterPaymentMethods.tsx` | Bloc de présentation **pur** (reçoit la `policy`, aucun appel réseau) : trois états — en attente, échec, établi. |
| `client/src/components/Footer.tsx` | Bande `canaux | moyens de paiement | accès utiles` ; la signature de marque reste en tête. |
| `client/src/components/CheckoutModal.tsx` | **Ne décide plus** : consomme le module partagé. La copie locale de la règle a été supprimée. |
| `client/src/design/editorial/glyphs.json` | Deux glyphes ajoutés au registre central : `Bank` (virement) et `Mail` (transfert postal). Aucune géométrie écrite dans un composant. |
| `tests/footer-payments.test.tsx` | 8 gardes : règle, motifs d'indisponibilité, bilingue, absence de marque tierce, états. |
| `verify/footer-payments.mjs` | Preuve navigateur **rejouable** : 68 vérifications, FR + AR, 390 + 1360. |

### Les trois états du bloc, et le quatrième qui compte

1. **Configuration inconnue** → « Vérification des moyens de paiement… » : aucune affirmation.
2. **Configuration en échec** → phrase honnête + `role="alert"` ; on invite à écrire, on ne devine pas.
3. **Configuration établie, rien d'encaissable (état du jour)** → « Aucun encaissement en ligne n'est
   ouvert aujourd'hui. », puis la vérité opérationnelle : la commande est enregistrée, le règlement
   reste en attente, rien n'est prélevé ; accompagnée des seuls chiffres publiés par l'Admin
   (acompte 20 %, vérification sous 1 jour ouvré, remboursement de l'acompte) et d'un lien vers les
   conditions. **Zéro pastille.**
4. **Configuration établie, moyens réels** → une pastille par moyen encaissable, avec sa marque
   maison, ce qu'il exige, et rien d'autre. La remise carte n'apparaît que si la carte encaisse.

## 3. Pourquoi les marques sont les nôtres

Les visuels `card.png` (photo de carte VISA Gold), `flouci.png`, `poste.png` vivent dans la caisse, là
où le visiteur choisit explicitement un moyen. Ils ne sont **jamais** imprimés sur la signature
publique : un logo de réseau sur le pied de page est une promesse de contrat. La famille maison
fournit les marques, géométrie centralisée, monochrome, lisible sur noir.

Gardes opposables : le test interdit `VISA`, `Mastercard`, `/media/payments/` et `<img>` dans le bloc ;
le vérificateur navigateur contrôle la même chose sur l'application servie.

## 4. Mise en forme « plateforme avancée »

* Signature de marque en tête (logo, promesse, phrase publiée), puis **une bande de trois colonnes** :
  canaux officiels · moyens de paiement · accès utiles.
* Filets `#262626`, séparateur **logique** (`border-inline-start`) : correct en LTR comme en RTL.
* Intitulés en petites capitales espacées, valeurs en clair, chiffres tabulaires.
* Grand écran (≥ 768 px) : bande en trois colonnes, alignement au départ.
  Mobile : une colonne, accès utiles en liste alignée (plus de grille 2 × 2 qui cassait les libellés).
* Valeurs publiées en latin isolées par `<bdi dir="auto">` : « 20 % » garde son ordre en arabe et
  s'aligne sur le bord de départ de la page.
* **Aucun doublon** : le bouton « Haut de page » envisagé a été retiré — le bouton flottant global
  (« Retourner en haut », visible dès 140 px de défilement) fait déjà ce travail.

## 5. Invariants historiques — tous tenus

Pied de page unique sur l'accueil · fond `rgb(0, 0, 0)` · quatre canaux (inerte ≠ inventé) ·
trois documents légaux · aucun lien `https` fabriqué · premier accès « Parlons de votre commande »
en orange `#FF7900` · aucun pied de page recopié dans les pages plein écran.

## 6. Preuves

```bash
npm test                        # 99 fichiers, 1547+ tests
npm run design:check            # contrat d'icônes 0 violation, inventaire à jour
AYROVI_BASE_URL=http://127.0.0.1:3000 npm run verify:footer-payments   # 68 / 68
```

Captures : `docs/footer-payments/evidence/{fr,ar}-{390,1360}-footer.png` (+ page complète en 390).
Rapport machine : `docs/footer-payments/evidence/report.json`.

## 7. Défauts constatés pendant ce travail (à traiter, non maquillés)

| # | Constat | Effet | Proposition |
| --- | --- | --- | --- |
| 1 | Les textes publiés par l'Admin (`footerAbout`, `deposit.reviewDelay`, `unavailableRefundPolicy`) n'existent qu'en français. | En arabe, la phrase de vérification et le paragraphe de marque s'affichent en latin. | Champs par langue côté Admin (`reviewDelayAr`, `footerAboutAr`…) + repli sur le français si vide. Surtout **ne pas** traduire en dur côté client. |
| 2 | `GET /api/customer/auth/me` répond **401** pour tout visiteur anonyme, à chaque chargement. | Bruit d'erreur réseau dans la console et dans les outils de supervision. | Répondre `200 {authenticated:false}` (ou `204`) au lieu de 401 — la vérificateur tolère uniquement cette sonde, explicitement nommée. |
