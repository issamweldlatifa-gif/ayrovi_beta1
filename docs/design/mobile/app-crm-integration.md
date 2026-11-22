# Intégration application mobile ↔ back office (CRM) — revue

Revue du 22/11/2026. Objectif : vérifier que **ce que l'application enregistre est
exactement ce que le back office voit**, et que **ce que le back office décide
arrive réellement au client**. Les deux sens sont couverts : écriture (app → CRM)
et action (CRM → app).

## Matrice

| Fonction mobile | Écriture / lecture | Table(s) | Surface back office | Verdict |
| --- | --- | --- | --- | --- |
| Inscription, connexion e-mail / OTP / Google / Apple / Facebook | `/api/customer/auth/*` | `customer_accounts`, `customer_auth_identities`, `customer_sessions` | Comptes clients (liste + fiche), blocage | **Aligné** |
| Nom, e-mail, newsletter, photo | `PUT/PATCH /account/profile`, `/account/avatar` | `customer_accounts` | Fiche compte : identité, `marketing_opt_in`, `has_avatar` | **Aligné** (image non transportée, booléen seulement) |
| Adresses | `/account/addresses` | `customer_addresses` | Fiche compte, tableau des adresses | **Aligné** |
| Commandes, destinataire saisi à la caisse | `/api/checkout`, `/account/orders` | `orders`, `order_items` | Liste et détail commandes, fiche compte, factures | **Aligné** — `recipient_name` prime sur le contact CRM, repli historique conservé |
| Favoris | `/account/favorites` | `customer_favorites` | Fiche compte : liste + compteur | **Corrigé** (absents avant) |
| Notifications | `/account/notifications` | `customer_notifications` | Fiche compte : 10 dernières + non-lues | **Corrigé** |
| Appareils connectés | `/account/sessions` | `customer_sessions` | Fiche compte : plateforme, IP masquée, dates (poignée dérivée, jamais le jeton) | **Corrigé** |
| Appareils de notification (push) | `/account/devices` | `customer_push_devices` | Compteur + plateforme/état | **Corrigé** (jeton FCM jamais exposé) |
| Préférences (4 interrupteurs) | `/account/preferences` | `customer_preferences` | Fiche compte : quatre états | **Corrigé** (affichées mais non respectées avant) |
| Statut de commande | `PUT /admin/orders/:id/status` | `orders`, `order_status_history` | Journal de commande | **Corrigé** : respecte `order_updates` / `shipping_updates` |
| Expédition / livraison | `PUT /admin/orders/:id/delivery` | `deliveries` | Suivi de livraison | **Corrigé** : respecte `shipping_updates` |
| Revue d'acompte | `POST /admin/orders/:id/deposit/review` | `payment_proofs`, `payments` | File des justificatifs | **Corrigé** : notification `PAYMENT` + respecte `payment_updates` |
| Facture | `POST /admin/orders/:id/invoice/issue` | `invoices` | Factures | **Corrigé** : notification `INVOICE` + respecte `invoice_updates` |
| Lien d'une notification | `action_url` écrite côté serveur (`/compte/commandes/<id>`, `/compte/suivi`) | — | — | **Corrigé** : l'application traduit le chemin web en écran réel |
| Panier | `/api/cart*` | `cart_items` | — | **Hors surface par choix** : état transitoire, pas un dossier client |
| Wallet | Aucune écriture (démo, solde 0) | — | — | **Aligné par construction** : rien à rapprocher |
| Cartes cadeaux | Aperçu local + laboratoire Finance | spécimens Finance | Finance → cartes cadeaux | **Aligné** : aucun code émis, aucun débit |
| Support | Canaux configurés (`SupportContacts`) | `assistant_support_tickets` (web) | File support | **Écart connu** : l'application n'ouvre pas de ticket, elle affiche les canaux validés |

## Ce que cette passe verrouille

1. **La fiche compte du CRM montre l'activité réelle de l'application** : favoris,
   notifications (dont non-lues), appareils connectés, appareils push et
   préférences. L'image de profil reste un booléen ; aucun jeton de session ni
   jeton FCM ne quitte le serveur.
2. **Les interrupteurs de notification sont honorés à la source** : couper
   « Livraisons » empêche l'écriture d'un message d'expédition, couper
   « Factures » empêche celui de facture. Le défaut reste « tout activé ».
3. **Les notifications du back office sont cliquables dans l'application** : le
   chemin web (`/compte/commandes/<id>`) ouvre la vraie commande ; un chemin
   inconnu ou externe n'affiche aucun bouton.
4. **Bloquer un compte ferme sa session mobile** — vérifié, pour que le statut
   CRM ne soit pas seulement une étiquette.

## Écarts ouverts (à trancher, pas corrigés ici)

- **Support** : l'application affiche les canaux de contact configurés ; elle ne
  crée pas de ticket `assistant_support_tickets`. Soit on assume le canal
  e-mail/téléphone, soit on ajoute un formulaire lié au compte.
- **Wallet** : aucune activation, aucun solde, donc aucun rapprochement CRM. À
  traiter quand le branchement du Wallet sera décidé.
- **Cartes cadeaux** : laboratoire de spécimens uniquement ; l'émission réelle
  (vérification du destinataire, registre) reste un chantier séparé.
- **Appareils** : le CRM voit les sessions mais ne peut pas en fermer une seule ;
  le blocage ferme tout. Une révocation unitaire côté support serait une
  commodité, à ajouter seulement si le support la demande.

## Vérifications

- `tests/crm-customer-integration.test.ts` (3 tests) : fiche CRM ⇄ données
  mobiles, respect des interrupteurs sur un vrai changement de statut, blocage
  qui ferme la session.
- `apps/mobile/tests/notifications-link.test.ts` : traduction des liens, refus
  des chemins inconnus et des URL externes.
- Types serveur + client, tests API de commande et de compte.
