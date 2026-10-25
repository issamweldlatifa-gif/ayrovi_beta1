/**
 * Fixture mutable du panier pour `cartScreen.ui.test.tsx`.
 *
 * Pourquoi un module à part : `jest.mock` est hissé au-dessus des `require`,
 * donc l'usine du mock ne peut pas lire une variable déclarée dans le test.
 * Elle appelle `getCart()` / `getError()` à chaque requête — la valeur est donc
 * lue AU MOMENT de l'appel, et un test peut changer d'état sans remonter de
 * module.
 */
type Cart = Record<string, unknown> | null;

let cart: Cart = null;
let error: unknown = null;

export function setCart(next: Cart): void {
  cart = next;
}

export function getCart(): Cart {
  return cart;
}

export function setError(next: unknown): void {
  error = next;
}

export function getError(): unknown {
  return error;
}
