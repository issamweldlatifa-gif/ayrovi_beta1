# Panier — passe « gestes qui engagent » (19/11/2026)

Le panier est l'écran où une erreur coûte le plus cher : on y supprime des
articles difficiles à retrouver (AYWEBs, Lens) et on y prépare un paiement dont
les montants viennent du serveur. Cette passe ne touche pas aux prix.

## 1. Retirer un article demande confirmation

`onRemove` appelait `removeZayroviCartItem` immédiatement. Un appui latéral sur
le `−`/`✕` d'une ligne — ou sur l'action de la feuille `•••` — supprimait
définitivement une ligne que l'utilisateur devait parfois reconstruire depuis un
navigateur marchand.

Une boîte de confirmation nomme l'action (« Retirer ») et rappelle que **les
favoris et les sélections ne bougent pas** : supprimer du panier n'est pas
supprimer de la mémoire. Le retrait ne part au serveur qu'après confirmation.

## 2. Une ligne qui travaille ne gèle plus la liste

`busy` valait `setQuantity.isPending || removeLine.isPending` et était passé à
**toutes** les lignes : pendant l'aller-retour d'une quantité, les boutons des
autres articles étaient désactivés. `busyItemId` (dérivé des `variables` de la
mutation) ne désactive que la ligne concernée. Vérifié par test : deux appuis
rapides sur deux lignes produisent bien deux requêtes, dans l'ordre.

## 3. Un accusé de réception, pas seulement une disparition

Le retrait n'avait aucun retour : la ligne s'évanouissait, l'utilisateur se
demandait si le geste avait été pris en compte. La barre de statut porte
désormais deux tons — **erreur** (rouge, `role="alert"`) et **information**
(« Article retiré du panier. »), annoncée aux lecteurs d'écran via
`accessibilityLiveRegion`.

## Ce qui reste volontairement inchangé

- **Aucune mise à jour optimiste des quantités.** L'écran affiche le prix du
  serveur ; faire bouger une quantité avant la réponse obligerait à inventer un
  sous-total. La règle du dépôt (« un prix n'est jamais deviné ») passe avant la
  latence perçue.
- **Pas de bouton « Annuler » après retrait** : le serveur ne conserve pas le
  payload d'origine d'une ligne AYWEBs, une ré-insertion fabriquerait un prix.

## Vérifications

`tests/ui/cartScreen.ui.test.tsx` (6 tests) — confirmation avant l'appel
serveur, retrait confirmé, accusé de réception, indépendance des lignes,
panier vide, ligne pauvre, erreur réseau. Typecheck, `tokens:check`, Vitest,
Jest UI et export Android au vert.
