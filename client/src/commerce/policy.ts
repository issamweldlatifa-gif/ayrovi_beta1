/** The server owns payment terms. Missing/invalid terms are unavailable, never guessed. */
export function parseCommercePolicy(data: any) {
  const source = data?.deposit;
  const numeric = (value: unknown) => typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN;
  const percent = numeric(source?.percent);
  const cardDiscountPercent = numeric(source?.cardDiscountPercent);
  if (!Number.isFinite(percent) || percent <= 0 || percent > 100
    || !Number.isFinite(cardDiscountPercent) || cardDiscountPercent < 0 || cardDiscountPercent > 100) {
    throw new Error('COMMERCE_TERMS_INVALID');
  }
  const text = (value: unknown) => typeof value === 'string' ? value : '';
  return {
    deposit: {
      percent, cardDiscountPercent,
      companyName: text(source.companyName) || 'AYROVI',
      bankRib: text(source.bankRib), posteAccount: text(source.posteAccount),
      flouciNumber: text(source.flouciNumber), reviewDelay: text(source.reviewDelay),
      unavailableRefundPolicy: text(source.unavailableRefundPolicy),
      cardGatewayAvailable: data?.capabilities?.cardGateway === true,
    },
    governorates: Array.isArray(data?.governorates) ? data.governorates.filter((value: unknown): value is string => typeof value === 'string' && !!value.trim()) : [],
    /*
     * Les moyens que le SERVEUR accepte réellement à la caisse.
     *
     * Sans cette liste, la caisse décidait seule à partir des passerelles
     * configurées : elle pouvait proposer « paiement à la livraison » (qui ne
     * dépend d'aucune passerelle) alors que le checkout le refusait — la
     * commande échouait après la saisie complète de l'adresse.
     *
     * Une liste vide signifie « le serveur n'en publie pas » (version
     * antérieure) : on ne restreint alors rien, comme avant. Dès que le serveur
     * publie, c'est lui qui tranche.
     */
    acceptedPaymentMethods: Array.isArray(data?.paymentMethods)
      ? data.paymentMethods.filter((value: unknown): value is string => typeof value === 'string' && !!value.trim()).map((value: string) => value.trim().toUpperCase())
      : [],
  };
}
export type CommercePolicy = ReturnType<typeof parseCommercePolicy>;
