/**
 * Support du test de rendu de la page produit : une réponse serveur qu'on peut
 * remplacer entre deux cas (complète, puis pauvre) sans recharger le module.
 */
let current: any = null;

export function setProduct(value: any): void {
  current = value;
}

export function getProduct(): any {
  return current;
}
