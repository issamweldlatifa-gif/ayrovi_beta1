/**
 * Image de carte Lens : carte composée par le serveur (produit détouré posé sur
 * le fond #F0F2F2), avec repli sur l'image marchande d'origine.
 * Route serveur : GET /api/public/media/card?u=<url>&w=<largeur autorisée>.
 * Largeurs autorisées côté serveur : 600, 760, 900, 1080.
 */
export const LENS_CARD_WIDTH = 600;

/** Chemin relatif de la carte composée, ou null si la source n'est pas une URL http(s). */
export function lensCardPath(original: string | null | undefined): string | null {
  const value = String(original ?? '').trim();
  if (!/^https?:\/\//i.test(value)) return null;
  return `/api/public/media/card?u=${encodeURIComponent(value)}&w=${LENS_CARD_WIDTH}`;
}
