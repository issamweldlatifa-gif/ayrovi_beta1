/**
 * Principe de capture (19/11/2026) : « le client choisit sur la page du
 * marchand → AYWEBs capte ce choix → ZAYROVI calcule → le client confirme ».
 *
 * Capture faite en mode SÉLECTION (`captureMode: 'selection'`, décidé par le
 * serveur boutique par boutique) ⇒ la feuille ne propose plus de choisir
 * taille/couleur, pour AUCUNE boutique : elle affiche le choix capté et renvoie
 * vers la page pour le changer (« بدّل في الصفحة »).
 *
 * Retour arrière (`matrix` dans le CRM) : le script servi ne marque pas la
 * capture, et Amazon / Zalando retrouvent leur choix dans la feuille.
 */
export function readOnlyStoreSelection(storeId: string | null | undefined, capture?: unknown): boolean {
  if (isSelectionCapture(capture)) return true;
  const id = String(storeId ?? '').trim().toLowerCase();
  return id !== 'amazon' && id !== 'zalando';
}

export function isSelectionCapture(capture: unknown): boolean {
  return Boolean(capture && typeof capture === 'object' && (capture as Record<string, unknown>).captureMode === 'selection');
}

/** Quantité affichée par la page (1…99), lue dans la capture ou la réponse serveur. */
export function pageQuantityOf(source: unknown): number | null {
  if (!source || typeof source !== 'object') return null;
  const record = source as Record<string, unknown>;
  const nested = record.capturedSelection && typeof record.capturedSelection === 'object'
    ? (record.capturedSelection as Record<string, unknown>).pageQuantity
    : undefined;
  const raw = nested ?? record.pageQuantity ?? record.page_quantity;
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 99 ? raw : null;
}

/**
 * Quantité de départ de la feuille : celle de la page tant que le client n'a
 * pas touché au sélecteur de la feuille ; bornée par le maximum autorisé.
 */
export function initialSheetQuantity(pageQuantity: number | null, maxQuantity: number, touched: boolean, current: number): number {
  if (touched || pageQuantity === null) return current;
  const max = Number.isFinite(maxQuantity) && maxQuantity >= 1 ? Math.floor(maxQuantity) : pageQuantity;
  return Math.max(1, Math.min(pageQuantity, max));
}
