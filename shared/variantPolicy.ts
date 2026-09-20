/** Selection eligibility is not proof of current merchant stock.
 * Keep this boolean wire contract shared by extraction, history and both UIs.
 * Invalid or absent eligibility must never activate a variant-specific quote.
 */
export function isSelectableVariant(value: { available?: unknown } | null | undefined): boolean {
  return value?.available === true;
}

/** Raw merchant flags are stock evidence only when they are actual booleans.
 * A missing flag permits a manual choice upstream, but confirms no inventory.
 * Contradictory flags confirm neither availability nor unavailability.
 */
export function reportedVariantStock(value: unknown): boolean | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const flags = [source.available, source.inStock, source.isInStock];
  const positive = flags.includes(true), negative = flags.includes(false);
  return positive === negative ? null : positive;
}

/** Preserve the existing conservative exclusion of an explicitly negative flag,
 * including a contradictory record. Unknown flags are not an automatic ban on
 * a request that will be reviewed manually.
 */
export function allowsMerchantVariantChoice(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  return source.available !== false && source.inStock !== false && source.isInStock !== false;
}
