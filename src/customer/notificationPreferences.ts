/**
 * Préférences de notification du compte, honorées là où les notifications
 * naissent (back office : statut de commande, livraison, paiement, facture).
 *
 * Le client règle quatre interrupteurs dans l'application (« Préférences ») et
 * le CRM affiche le même enregistrement. Tant que ces colonnes n'étaient lues
 * qu'à l'écriture, un client pouvait couper « Livraisons » et recevoir quand
 * même chaque expédition : la préférence n'était qu'un décor. Ce module est la
 * seule porte d'écriture de ces notifications.
 *
 * Défaut : une préférence absente = tout est accepté (le défaut de l'écran).
 */
 
export type CustomerNotificationChannel = 'order' | 'payment' | 'shipping' | 'invoice';

const COLUMN: Record<CustomerNotificationChannel, string> = {
  order: 'order_updates',
  payment: 'payment_updates',
  shipping: 'shipping_updates',
  invoice: 'invoice_updates',
};

/** `true` si le client accepte ce type de message (défaut : oui). */
export function customerAcceptsNotification(
  db: { get: (sql: string, ...params: any[]) => any },
  accountId: string,
  channel: CustomerNotificationChannel,
): boolean {
  const column = COLUMN[channel];
  const row = db.get(`SELECT ${column} AS accepted FROM customer_preferences WHERE account_id=?`, accountId);
  if (!row) return true;
  return Number(row.accepted) !== 0;
}

/** Canal de notification d'un changement de statut de commande. */
export function orderStatusChannel(status: string): CustomerNotificationChannel {
  return ['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(status) ? 'shipping' : 'order';
}
