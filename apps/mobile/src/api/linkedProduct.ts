/**
 * Produit lié à un contenu (Reel, Publication, Story « Shoppable »).
 *
 * Le serveur ne renvoie `product` que si le contenu est shoppable ET que le produit
 * est vendable ; sinon la valeur est `null` et l'application n'affiche AUCUNE carte.
 * Le prix et le stock sont ceux du catalogue au moment de la requête.
 */
export interface LinkedProduct {
  id: string;
  name: string;
  image: string;
  price: number;
  currency: string;
  stockStatus: string;
  available: boolean;
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Lit le champ `product` d'une réponse publique. Tout ce qui est incomplet ⇒ `null`. */
export function parseLinkedProduct(value: unknown): LinkedProduct | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  const id = str(entry.id);
  const name = str(entry.name);
  const price = num(entry.price);
  if (!id || !name || price <= 0) return null;
  return {
    id,
    name,
    image: str(entry.image),
    price,
    currency: str(entry.currency) || 'TND',
    stockStatus: str(entry.stockStatus) || 'AVAILABLE',
    available: entry.available !== false,
  };
}
