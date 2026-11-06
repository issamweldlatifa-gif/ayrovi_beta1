/** Bundled display assets only; available checkout methods remain server-owned. */
export const PAYMENT_LOGOS = [
  { name: 'Mastercard', source: require('../../assets/payments/mastercard.png') },
  { name: 'Visa', source: require('../../assets/payments/visa.png') },
  { name: 'D17', source: require('../../assets/payments/d17.png') },
  { name: 'Virement bancaire', source: require('../../assets/payments/transfer.png') },
  { name: 'Flouci', source: require('../../assets/payments/flouci.png') },
] as const;
